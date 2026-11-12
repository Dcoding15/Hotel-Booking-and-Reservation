import mongoose from 'mongoose';
import { mapBooking, newId, pool, withTransaction } from '../db.js';
import { Hotel, Room } from '../models/index.js';
import { HttpError, parseDay, todayUTC } from '../utils.js';
import { invalidate } from '../redis.js';
import {
  PAYMENT_CURRENCY,
  PAYMENT_HOLD_MS,
  captureRazorpayPayment,
  createRazorpayOrder,
  createRazorpayRefund,
  fetchRazorpayPayment,
  getRazorpayConfig,
  paymentMatchesBooking,
  razorpayClient,
  verifyRazorpaySignature,
} from './razorpay.js';

const MAX_NIGHTS = 30;
const DAY = 86_400_000;
const bookedKey = (roomId) => `room:${roomId}:booked`;
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function bookingDates({ roomId, checkIn, checkOut }) {
  if (!roomId || !mongoose.isValidObjectId(roomId)) throw new HttpError(400, 'Invalid room ID');

  const inDay = parseDay(checkIn);
  const outDay = parseDay(checkOut);
  const nights = Math.round((outDay - inDay) / DAY);
  if (nights < 1) throw new HttpError(400, 'Check-out must be after check-in');
  if (nights > MAX_NIGHTS) throw new HttpError(400, `Maximum stay is ${MAX_NIGHTS} nights`);
  if (inDay < todayUTC()) throw new HttpError(400, 'Check-in cannot be in the past');

  return {
    inDate: inDay.toISOString().slice(0, 10),
    outDate: outDay.toISOString().slice(0, 10),
    nights,
  };
}

export async function reserveBooking({ userId, roomId, checkIn, checkOut }) {
  const { inDate, outDate, nights } = bookingDates({ roomId, checkIn, checkOut });
  const room = await Room.findOne({ _id: roomId, isActive: true }).lean();
  if (!room) throw new HttpError(404, 'Room not found');
  const hotel = await Hotel.findById(room.hotel).lean();
  if (!hotel) throw new HttpError(404, 'Hotel not found');

  const totalCents = nights * room.pricePerNightCents;
  if (!Number.isSafeInteger(totalCents) || totalCents < 100) {
    throw new HttpError(400, 'The total payment must be at least ₹1.00');
  }
  const bookingId = newId();
  const expiresAt = new Date(Date.now() + PAYMENT_HOLD_MS);

  const booking = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(roomId)]);
    const overlap = await client.query(
      `SELECT 1 FROM bookings
       WHERE room_id = $1
         AND (status = 'confirmed' OR (status = 'pending' AND payment_expires_at > now()))
         AND check_in < $3 AND check_out > $2
       LIMIT 1`,
      [String(roomId), inDate, outDate],
    );
    if (overlap.rowCount) {
      throw new HttpError(409, 'Those dates are no longer available. Pick different dates.');
    }

    const { rows } = await client.query(
      `INSERT INTO bookings
        (id, user_id, hotel_id, room_id, hotel_name, hotel_city, hotel_image, room_name, room_type,
         check_in, check_out, nights, total_cents, status, payment_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14)
       RETURNING *`,
      [
        bookingId, userId, String(hotel._id), String(room._id), hotel.name, hotel.city || null,
        hotel.image || null, room.name, room.type || null, inDate, outDate, nights, totalCents, expiresAt,
      ],
    );
    return rows[0];
  });

  await invalidate(bookedKey(roomId));
  return booking;
}

export async function createBookingOrder({ userId, roomId, checkIn, checkOut }) {
  const { keyId } = getRazorpayConfig();
  const razorpay = razorpayClient();
  const reservation = await reserveBooking({ userId, roomId, checkIn, checkOut });

  try {
    const order = await createRazorpayOrder(razorpay, {
      amount: reservation.total_cents,
      currency: PAYMENT_CURRENCY,
      receipt: reservation.id,
      notes: { booking_id: reservation.id, user_id: userId },
    });
    if (
      !order?.id
      || Number(order.amount) !== reservation.total_cents
      || order.currency !== PAYMENT_CURRENCY
    ) {
      throw new HttpError(502, 'Razorpay returned an invalid payment order.');
    }
    const { rows } = await pool.query(
      `UPDATE bookings SET payment_order_id = $1, updated_at = now()
       WHERE id = $2 AND status = 'pending' RETURNING *`,
      [order.id, reservation.id],
    );
    if (!rows[0]) throw new HttpError(409, 'The booking reservation has expired. Please try again.');
    return {
      booking: mapBooking(rows[0]),
      order: { id: order.id, amount: order.amount, currency: order.currency },
      keyId,
    };
  } catch (error) {
    await pool.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [reservation.id],
    );
    await invalidate(bookedKey(reservation.room_id));
    throw error;
  }
}

async function submitRefund(booking) {
  if (!booking.payment_id || !booking.refund_idempotency_key) {
    throw new HttpError(409, 'This payment cannot be refunded automatically. Please contact support.');
  }
  const refund = await createRazorpayRefund({
    paymentId: booking.payment_id,
    bookingId: booking.id,
    amount: booking.refund_cents,
    idempotencyKey: booking.refund_idempotency_key,
  });
  if (!refund?.id || !['pending', 'processed', 'failed'].includes(refund.status)) {
    throw new HttpError(502, 'Razorpay returned an invalid refund response. Retry safely or contact support.');
  }
  const { rows } = await pool.query(
    `UPDATE bookings SET status = 'cancelled', refund_id = $1, refund_status = $2,
       cancelled_at = COALESCE(cancelled_at, now()), updated_at = now()
     WHERE id = $3 AND status = 'refund_pending' RETURNING *`,
    [refund.id, refund.status, booking.id],
  );
  const updated = rows[0] || (await pool.query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];
  await invalidate(bookedKey(booking.room_id));
  return mapBooking(updated);
}

export async function verifyBookingPayment({ userId, bookingId, orderId, paymentId, signature }) {
  if (!isUuid(bookingId)) throw new HttpError(400, 'Invalid booking ID');
  if (typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') {
    throw new HttpError(400, 'Payment verification details are incomplete');
  }

  const { keySecret } = getRazorpayConfig();
  const razorpay = razorpayClient();
  const found = await pool.query(
    'SELECT * FROM bookings WHERE id = $1 AND user_id = $2',
    [bookingId, userId],
  );
  const booking = found.rows[0];
  if (!booking || !booking.payment_order_id) throw new HttpError(404, 'Payment order not found');
  if (booking.payment_order_id !== orderId) throw new HttpError(400, 'Payment order does not match this booking');
  if (!verifyRazorpaySignature({ orderId: booking.payment_order_id, paymentId, signature, keySecret })) {
    throw new HttpError(400, 'Payment signature verification failed');
  }
  if (booking.status === 'confirmed' && booking.payment_id === paymentId) return mapBooking(booking);
  if (booking.status === 'refund_pending' && booking.payment_id === paymentId) return submitRefund(booking);
  if (booking.status !== 'pending') throw new HttpError(409, 'This booking is no longer awaiting payment');

  let payment = await fetchRazorpayPayment(razorpay, paymentId);
  if (!paymentMatchesBooking(payment, booking.payment_order_id, booking.total_cents)) {
    if (payment?.order_id === booking.payment_order_id && payment.status === 'captured') {
      const refundRecord = await markCapturedPaymentForRefund(booking, paymentId, Number(payment.amount));
      await submitRefund(refundRecord);
    }
    throw new HttpError(409, 'Razorpay payment details do not match this booking. Contact support if money was deducted.');
  }
  if (payment.status === 'authorized') {
    payment = await captureRazorpayPayment(razorpay, paymentId, booking.total_cents);
  }
  if (payment.status !== 'captured' || !paymentMatchesBooking(payment, booking.payment_order_id, booking.total_cents)) {
    throw new HttpError(409, 'Razorpay has not captured the full booking payment yet.');
  }

  const result = await withTransaction(async (client) => {
    const currentResult = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [bookingId, userId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new HttpError(404, 'Booking not found');
    if (current.status === 'confirmed' && current.payment_id === paymentId) {
      return { booking: current, conflict: false };
    }
    if (current.status !== 'pending' || current.payment_order_id !== orderId) {
      throw new HttpError(409, 'This booking is no longer awaiting payment');
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [current.room_id]);
    const overlap = await client.query(
      `SELECT 1 FROM bookings
       WHERE room_id = $1 AND id <> $2
         AND (status = 'confirmed' OR (status = 'pending' AND payment_expires_at > now()))
         AND check_in < $4 AND check_out > $3
       LIMIT 1`,
      [current.room_id, current.id, current.check_in, current.check_out],
    );
    if (overlap.rowCount) {
      const { rows } = await client.query(
        `UPDATE bookings SET status = 'refund_pending', payment_id = $1, refund_cents = total_cents,
           refund_status = 'initiating', refund_idempotency_key = COALESCE(refund_idempotency_key, $2),
           updated_at = now()
         WHERE id = $3 RETURNING *`,
        [paymentId, newId(), bookingId],
      );
      return { booking: rows[0], conflict: true };
    }

    const { rows } = await client.query(
      `UPDATE bookings SET status = 'confirmed', payment_id = $1, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [paymentId, bookingId],
    );
    return { booking: rows[0], conflict: false };
  });

  await invalidate(bookedKey(booking.room_id));
  if (result.conflict) {
    let refundedBooking;
    try {
      refundedBooking = await submitRefund(result.booking);
    } catch (error) {
      if (error instanceof HttpError) {
        throw new HttpError(error.status, `Payment was captured after these dates became unavailable. ${error.message}`);
      }
      throw error;
    }
    if (refundedBooking.refundStatus === 'failed') {
      throw new HttpError(409, 'Payment was captured after these dates became unavailable, and Razorpay reported that the refund failed. Contact support.');
    }
    throw new HttpError(409, 'Payment was captured after these dates became unavailable. A refund has been requested; check My bookings for its status.');
  }
  return mapBooking(result.booking);
}

async function markCapturedPaymentForRefund(booking, paymentId, amount) {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new HttpError(409, 'Payment was captured with an invalid amount. Contact support for a refund.');
  }
  const { rows } = await pool.query(
    `UPDATE bookings SET status = 'refund_pending', payment_id = $1, refund_cents = $2,
       refund_status = 'initiating', refund_idempotency_key = COALESCE(refund_idempotency_key, $3),
       updated_at = now()
     WHERE id = $4 AND status = 'pending' RETURNING *`,
    [paymentId, amount, newId(), booking.id],
  );
  if (!rows[0]) throw new HttpError(409, 'Payment was captured but could not be matched to an active booking. Contact support.');
  await invalidate(bookedKey(booking.room_id));
  return rows[0];
}

export async function cancelBooking({ userId, bookingId }) {
  if (!isUuid(bookingId)) throw new HttpError(400, 'Invalid booking ID');
  const result = await withTransaction(async (client) => {
    const found = await client.query(
      'SELECT *, check_in::text AS check_in_date FROM bookings WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [bookingId, userId],
    );
    const existing = found.rows[0];
    if (!existing) throw new HttpError(404, 'Booking not found');
    if (existing.status === 'cancelled') return { booking: existing, retryRefund: false };
    if (existing.status === 'pending') {
      throw new HttpError(409, 'This payment session is still pending. Its room hold expires after 15 minutes.');
    }
    if (existing.status === 'confirmed') {
      if (!existing.payment_id) {
        throw new HttpError(409, 'This booking predates Razorpay payments. Contact support to cancel it.');
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [existing.room_id]);
      const checkInDay = parseDay(existing.check_in_date);
      const today = todayUTC();
      if (checkInDay <= today) throw new HttpError(409, 'Bookings cannot be cancelled after check-in');
      if (checkInDay.getTime() - today.getTime() <= 7 * DAY) {
        throw new HttpError(409, 'Bookings cannot be cancelled within 7 days of check-in');
      }
      const { rows } = await client.query(
        `UPDATE bookings SET status = 'refund_pending', refund_cents = total_cents,
           refund_status = 'initiating', refund_idempotency_key = COALESCE(refund_idempotency_key, $1),
           cancelled_at = now(), updated_at = now()
         WHERE id = $2 RETURNING *`,
        [newId(), bookingId],
      );
      return { booking: rows[0], retryRefund: true };
    }
    if (existing.status === 'refund_pending') return { booking: existing, retryRefund: true };
    throw new HttpError(409, 'This booking cannot be cancelled');
  });

  await invalidate(bookedKey(result.booking.room_id));
  const booking = result.retryRefund ? await submitRefund(result.booking) : mapBooking(result.booking);
  return { booking };
}

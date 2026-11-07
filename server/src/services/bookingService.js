import mongoose from 'mongoose';
import { mapBooking, newId, pool, withTransaction } from '../db.js';
import { Hotel, Room } from '../models/index.js';
import { HttpError, parseDay, todayUTC } from '../utils.js';
import { invalidate } from '../redis.js';

const MAX_NIGHTS = 30;
const DAY = 86_400_000;
const bookedKey = (roomId) => `room:${roomId}:booked`;
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function createBooking({ userId, roomId, checkIn, checkOut }) {
  if (!roomId || !mongoose.isValidObjectId(roomId)) throw new HttpError(400, 'Invalid room ID');

  const inDay = parseDay(checkIn);
  const outDay = parseDay(checkOut);
  const nights = Math.round((outDay - inDay) / DAY);
  if (nights < 1) throw new HttpError(400, 'Check-out must be after check-in');
  if (nights > MAX_NIGHTS) throw new HttpError(400, `Maximum stay is ${MAX_NIGHTS} nights`);
  if (inDay < todayUTC()) throw new HttpError(400, 'Check-in cannot be in the past');

  const room = await Room.findOne({ _id: roomId, isActive: true }).lean();
  if (!room) throw new HttpError(404, 'Room not found');
  const hotel = await Hotel.findById(room.hotel).lean();
  if (!hotel) throw new HttpError(404, 'Hotel not found');

  const inDate = inDay.toISOString().slice(0, 10);
  const outDate = outDay.toISOString().slice(0, 10);
  const bookingId = newId();
  const booking = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(roomId)]);
    const overlap = await client.query(
      `SELECT 1 FROM bookings
       WHERE room_id = $1 AND status = 'confirmed'
         AND check_in < $3 AND check_out > $2
       LIMIT 1`,
      [String(roomId), inDate, outDate],
    );
    if (overlap.rowCount) {
      throw new HttpError(409, 'Those dates are no longer available. Pick different dates.');
    }

    const totalCents = nights * room.pricePerNightCents;
    const debited = await client.query(
      `UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = now()
       WHERE id = $2 AND wallet_balance >= $1 RETURNING wallet_balance`,
      [totalCents, userId],
    );
    if (!debited.rowCount) {
      const exists = await client.query('SELECT 1 FROM users WHERE id = $1', [userId]);
      if (!exists.rowCount) throw new HttpError(401, 'Please sign in');
      throw new HttpError(402, 'Not enough wallet balance. Add funds and try again.');
    }

    const { rows } = await client.query(
      `INSERT INTO bookings
        (id, user_id, hotel_id, room_id, hotel_name, hotel_city, hotel_image, room_name, room_type,
         check_in, check_out, nights, total_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        bookingId, userId, String(hotel._id), String(room._id), hotel.name, hotel.city || null,
        hotel.image || null, room.name, room.type || null, inDate, outDate, nights, totalCents,
      ],
    );
    const walletBalance = debited.rows[0].wallet_balance;
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount_cents, balance_after, booking_id)
       VALUES ($1, $2, 'booking', $3, $4, $5)`,
      [newId(), userId, -totalCents, walletBalance, bookingId],
    );
    return { booking: mapBooking(rows[0]), walletBalance };
  });

  await invalidate(bookedKey(roomId));
  return booking;
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
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [existing.room_id]);
    if (existing.status === 'cancelled') throw new HttpError(409, 'Booking is already cancelled');
    const checkInDay = parseDay(existing.check_in_date);
    const today = todayUTC();
    if (checkInDay <= today) {
      throw new HttpError(409, 'Bookings cannot be cancelled after check-in');
    }
    if (checkInDay.getTime() - today.getTime() <= 7 * DAY) {
      throw new HttpError(409, 'Bookings cannot be cancelled within 7 days of check-in');
    }

    const refundCents = existing.total_cents;
    const updated = await client.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = now(), refund_cents = $1, updated_at = now()
       WHERE id = $2 AND status = 'confirmed' RETURNING *`,
      [refundCents, bookingId],
    );
    if (!updated.rowCount) throw new HttpError(409, 'Booking could not be cancelled or has already started');

    const user = await client.query(
      'UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = now() WHERE id = $2 RETURNING wallet_balance',
      [refundCents, userId],
    );
    if (!user.rowCount) throw new HttpError(404, 'User not found');
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount_cents, balance_after, booking_id)
       VALUES ($1, $2, 'refund', $3, $4, $5)`,
      [newId(), userId, refundCents, user.rows[0].wallet_balance, bookingId],
    );
    return { booking: mapBooking(updated.rows[0]), walletBalance: user.rows[0].wallet_balance };
  });

  await invalidate(bookedKey(result.booking.room));
  return result;
}

export async function topUp({ userId, amountCents }) {
  return withTransaction(async (client) => {
    const user = await client.query(
      'UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = now() WHERE id = $2 RETURNING wallet_balance',
      [amountCents, userId],
    );
    if (!user.rowCount) throw new HttpError(404, 'User not found');
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount_cents, balance_after)
       VALUES ($1, $2, 'topup', $3, $4)`,
      [newId(), userId, amountCents, user.rows[0].wallet_balance],
    );
    return user.rows[0].wallet_balance;
  });
}

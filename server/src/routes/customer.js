import { Router } from 'express';
import { mapBooking, pool } from '../db.js';
import { auth } from '../middleware.js';
import {
  cancelBooking,
  createBookingOrder,
  createPendingBooking,
  refreshBookingPayment,
  verifyBookingPayment,
} from '../services/bookingService.js';

const router = Router();
router.use(auth('customer'));

router.post('/bookings', async (req, res) => {
  const { roomId, checkIn, checkOut } = req.body || {};
  const booking = await createPendingBooking({ userId: req.auth.id, roomId, checkIn, checkOut });
  res.status(201).json({ booking: mapBooking(booking) });
});

router.post('/bookings/:id/order', async (req, res) => {
  const result = await createBookingOrder({ userId: req.auth.id, bookingId: req.params.id });
  res.json(result);
});

router.post('/bookings/:id/verify', async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  const booking = await verifyBookingPayment({
    userId: req.auth.id,
    bookingId: req.params.id,
    orderId,
    paymentId,
    signature,
  });
  res.json({ booking });
});

router.post('/bookings/:id/check-payment', async (req, res) => {
  const booking = await refreshBookingPayment({ userId: req.auth.id, bookingId: req.params.id });
  res.json({ booking });
});

router.get('/bookings', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC',
    [req.auth.id],
  );
  res.json(rows.map((row) => {
    const booking = mapBooking(row);
    booking.hotel = booking.hotelSnapshot;
    booking.room = booking.roomSnapshot;
    delete booking.hotelSnapshot;
    delete booking.roomSnapshot;
    return booking;
  }));
});

router.post('/bookings/:id/cancel', async (req, res) => {
  res.json(await cancelBooking({ userId: req.auth.id, bookingId: req.params.id }));
});

export default router;

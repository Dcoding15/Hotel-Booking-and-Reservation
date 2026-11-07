import { Router } from 'express';
import { mapBooking, mapUser, mapWalletTransaction, newId, pool, withTransaction } from '../db.js';
import { auth } from '../middleware.js';
import { cancelBooking, createBooking } from '../services/bookingService.js';
import { HttpError } from '../utils.js';

const router = Router();
router.use(auth('customer'));

router.post('/bookings', async (req, res) => {
  const { roomId, checkIn, checkOut } = req.body || {};
  const result = await createBooking({ userId: req.auth.id, roomId, checkIn, checkOut });
  res.status(201).json(result);
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

router.get('/wallet', async (req, res) => {
  const [user, transactions] = await Promise.all([
    pool.query('SELECT * FROM users WHERE id = $1', [req.auth.id]),
    pool.query('SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.auth.id]),
  ]);
  const mappedUser = mapUser(user.rows[0]);
  if (!mappedUser) throw new HttpError(401, 'Please sign in');
  const requests = await pool.query(
    'SELECT * FROM wallet_topup_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.auth.id],
  );
  res.json({
    walletBalance: mappedUser.walletBalance,
    transactions: transactions.rows.map(mapWalletTransaction),
    requests: requests.rows.map((row) => ({
      _id: row.id,
      amountCents: row.amount_cents,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    })),
  });
});

// Submit a top-up request for admin review; the wallet is not credited until approval.
router.post('/wallet/topup', async (req, res) => {
  const amountCents = Number(req.body?.amountCents);
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 100_000) {
    throw new HttpError(400, 'Top-up must be between $1 and $1,000');
  }
  const { rows } = await withTransaction(async (client) => {
    const user = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.auth.id]);
    if (!user.rowCount) throw new HttpError(401, 'Please sign in');

    const pending = await client.query(
      "SELECT 1 FROM wallet_topup_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1",
      [req.auth.id],
    );
    if (pending.rowCount) {
      throw new HttpError(409, 'You already have a pending top-up request. Wait until it is approved or rejected.');
    }

    return client.query(
      `INSERT INTO wallet_topup_requests (id, user_id, amount_cents)
       VALUES ($1, $2, $3) RETURNING *`,
      [newId(), req.auth.id, amountCents],
    );
  });
  res.status(201).json({
    request: {
      _id: rows[0].id,
      amountCents: rows[0].amount_cents,
      status: rows[0].status,
      createdAt: rows[0].created_at,
    },
  });
});

export default router;

import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { mapBooking, mapUser, newId, pool, withTransaction } from '../db.js';
import { Hotel, Room } from '../models/index.js';
import { auth } from '../middleware.js';
import { invalidate } from '../redis.js';
import { HttpError, pick } from '../utils.js';

const router = Router();
router.use(auth('admin'));

const HOTEL_FIELDS = ['name', 'city', 'description', 'image', 'amenities', 'isActive'];
const ROOM_FIELDS = ['name', 'type', 'description', 'image', 'capacity', 'pricePerNightCents', 'isActive'];
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const publicAdminUser = (user) => ({
  _id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  walletBalance: user.walletBalance,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

router.get('/wallet-requests', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, u.name AS user_name, u.email AS user_email
     FROM wallet_topup_requests r JOIN users u ON u.id = r.user_id
     ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
     LIMIT 200`,
  );
  res.json(rows.map((row) => ({
    _id: row.id,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    customer: { _id: row.user_id, name: row.user_name, email: row.user_email },
  })));
});

router.post('/wallet-requests/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'Invalid wallet request ID');
  if (!['approve', 'reject'].includes(action)) throw new HttpError(400, 'Invalid wallet request action');

  const result = await withTransaction(async (client) => {
    const found = await client.query(
      'SELECT * FROM wallet_topup_requests WHERE id = $1 FOR UPDATE',
      [id],
    );
    const request = found.rows[0];
    if (!request) throw new HttpError(404, 'Wallet request not found');
    if (request.status !== 'pending') throw new HttpError(409, 'Wallet request has already been reviewed');

    let walletBalance = null;
    if (action === 'approve') {
      const user = await client.query(
        'UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = now() WHERE id = $2 RETURNING wallet_balance',
        [request.amount_cents, request.user_id],
      );
      if (!user.rowCount) throw new HttpError(404, 'Customer account not found');
      walletBalance = user.rows[0].wallet_balance;
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount_cents, balance_after)
         VALUES ($1, $2, 'topup', $3, $4)`,
        [newId(), request.user_id, request.amount_cents, walletBalance],
      );
    }

    const { rows } = await client.query(
      `UPDATE wallet_topup_requests
       SET status = $1, reviewed_by = $2, reviewed_at = now()
       WHERE id = $3 RETURNING *`,
      [action === 'approve' ? 'approved' : 'rejected', req.auth.id, id],
    );
    return { request: rows[0], walletBalance };
  });

  res.json({
    request: {
      _id: result.request.id,
      amountCents: result.request.amount_cents,
      status: result.request.status,
      reviewedAt: result.request.reviewed_at,
    },
    walletBalance: result.walletBalance,
  });
});

router.post('/users/:id/wallet-adjustments', async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(400, 'Invalid user ID');
  const amountCents = Number(req.body?.amountCents);
  if (!Number.isInteger(amountCents) || amountCents === 0 || Math.abs(amountCents) > 1_000_000) {
    throw new HttpError(400, 'Adjustment must be between $0.01 and $10,000, positive to add or negative to subtract');
  }

  const result = await withTransaction(async (client) => {
    const user = await client.query(
      `UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = now()
       WHERE id = $2 AND wallet_balance + $1 >= 0 RETURNING wallet_balance`,
      [amountCents, req.params.id],
    );
    if (!user.rowCount) {
      const exists = await client.query('SELECT 1 FROM users WHERE id = $1', [req.params.id]);
      if (!exists.rowCount) throw new HttpError(404, 'User not found');
      throw new HttpError(400, 'Wallet balance cannot be negative');
    }
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount_cents, balance_after)
       VALUES ($1, $2, 'admin_adjustment', $3, $4)`,
      [newId(), req.params.id, amountCents, user.rows[0].wallet_balance],
    );
    return user.rows[0].wallet_balance;
  });
  res.json({ walletBalance: result });
});

router.get('/hotels', async (_req, res) => {
  const [hotels, stats] = await Promise.all([
    Hotel.find().sort({ createdAt: -1 }).lean(),
    Room.aggregate([
      { $group: { _id: '$hotel', roomCount: { $sum: 1 }, minPriceCents: { $min: '$pricePerNightCents' } } },
    ]),
  ]);
  const statsMap = new Map(stats.map((s) => [String(s._id), s]));
  res.json(hotels.map((hotel) => ({
    ...hotel,
    roomCount: statsMap.get(String(hotel._id))?.roomCount || 0,
    minPriceCents: statsMap.get(String(hotel._id))?.minPriceCents || null,
  })));
});

router.post('/hotels', async (req, res) => {
  const data = pick(req.body, HOTEL_FIELDS);
  if (!data.name?.trim()) throw new HttpError(400, 'Hotel name is required');
  if (Array.isArray(data.amenities)) data.amenities = data.amenities.map((a) => String(a).trim()).filter(Boolean);
  const hotel = await Hotel.create(data);
  await invalidate('hotels:list');
  res.status(201).json(hotel);
});

router.put('/hotels/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid hotel ID');
  const data = pick(req.body, HOTEL_FIELDS);
  if (Array.isArray(data.amenities)) data.amenities = data.amenities.map((a) => String(a).trim()).filter(Boolean);
  const hotel = await Hotel.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!hotel) throw new HttpError(404, 'Hotel not found');
  await invalidate('hotels:list', `hotel:${hotel._id}:rooms`);
  res.json(hotel);
});

router.delete('/hotels/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid hotel ID');
  const hotel = await Hotel.findByIdAndDelete(req.params.id);
  if (!hotel) throw new HttpError(404, 'Hotel not found');
  await Room.deleteMany({ hotel: hotel._id });
  await invalidate('hotels:list', `hotel:${hotel._id}:rooms`);
  res.json({ ok: true, message: `Hotel "${hotel.name}" and its rooms were deleted` });
});

router.get('/hotels/:hotelId/rooms', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.hotelId)) throw new HttpError(400, 'Invalid hotel ID');
  res.json(await Room.find({ hotel: req.params.hotelId }).sort({ pricePerNightCents: 1 }).lean());
});

router.post('/hotels/:hotelId/rooms', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.hotelId)) throw new HttpError(400, 'Invalid hotel ID');
  const hotel = await Hotel.findById(req.params.hotelId);
  if (!hotel) throw new HttpError(404, 'Hotel not found');
  const data = pick(req.body, ROOM_FIELDS);
  if (!data.name?.trim()) throw new HttpError(400, 'Room name is required');
  if (data.pricePerNightCents === undefined || data.pricePerNightCents < 0) {
    throw new HttpError(400, 'Valid price per night is required');
  }
  const room = await Room.create({ ...data, hotel: hotel._id });
  await invalidate('hotels:list', `hotel:${room.hotel}:rooms`);
  res.status(201).json(room);
});

router.put('/rooms/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid room ID');
  const data = pick(req.body, ROOM_FIELDS);
  const room = await Room.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!room) throw new HttpError(404, 'Room not found');
  await invalidate('hotels:list', `hotel:${room.hotel}:rooms`, `room:${room._id}:booked`);
  res.json(room);
});

router.delete('/rooms/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid room ID');
  const room = await Room.findByIdAndDelete(req.params.id);
  if (!room) throw new HttpError(404, 'Room not found');
  await invalidate('hotels:list', `hotel:${room.hotel}:rooms`, `room:${room._id}:booked`);
  res.json({ ok: true, message: `Room "${room.name}" was deleted` });
});

router.get('/users', async (req, res) => {
  const role = ['admin', 'customer'].includes(req.query.role) ? req.query.role : null;
  const result = await pool.query(
    `SELECT id, role, email, name, picture, wallet_balance, created_at, updated_at
     FROM users WHERE ($1::text IS NULL OR role = $1) ORDER BY created_at DESC`,
    [role],
  );
  res.json(result.rows.map((row) => publicAdminUser(mapUser(row))));
});

router.post('/users', async (req, res) => {
  const { name, email, password, role, walletBalance } = req.body || {};
  const cleanEmail = String(email || '').toLowerCase().trim();
  const cleanPassword = String(password || '');
  const cleanRole = role === 'admin' ? 'admin' : 'customer';
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new HttpError(400, 'Valid email is required');
  }
  if (!cleanPassword || cleanPassword.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');

  const id = newId();
  const initialBalance = Math.max(0, Math.round(Number(walletBalance) || 0));
  const passwordHash = await bcrypt.hash(cleanPassword, 10);
  try {
    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (id, name, email, role, password_hash, wallet_balance, picture)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          id, String(name || '').trim(), cleanEmail, cleanRole, passwordHash, initialBalance,
          `https://picsum.photos/seed/${encodeURIComponent(cleanEmail)}/100/100`,
        ],
      );
      if (initialBalance > 0) {
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount_cents, balance_after)
           VALUES ($1, $2, 'topup', $3, $3)`,
          [newId(), id, initialBalance],
        );
      }
      return mapUser(rows[0]);
    });
    res.status(201).json(publicAdminUser(user));
  } catch (error) {
    if (error.code === '23505') throw new HttpError(409, 'A user with this email already exists');
    throw error;
  }
});

router.put('/users/:id', async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(400, 'Invalid user ID');
  const { name, email, password, role, walletBalance } = req.body || {};
  const passwordHash = password && String(password).trim().length >= 6
    ? await bcrypt.hash(String(password).trim(), 10)
    : null;
  try {
    const user = await withTransaction(async (client) => {
      const found = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!found.rowCount) throw new HttpError(404, 'User not found');
      const current = mapUser(found.rows[0]);
      const cleanEmail = email ? String(email).toLowerCase().trim() : current.email;
      const cleanName = name !== undefined ? String(name).trim() : current.name;
      const cleanRole = role && ['admin', 'customer'].includes(role) ? role : current.role;
      const cleanBalance = walletBalance !== undefined ? Number(walletBalance) : current.walletBalance;
      if (!Number.isSafeInteger(cleanBalance) || cleanBalance < 0) {
        throw new HttpError(400, 'Wallet balance must be a non-negative whole number of cents');
      }
      const { rows } = await client.query(
        `UPDATE users SET name = $1, email = $2, role = $3, wallet_balance = $4,
          password_hash = COALESCE($5, password_hash), updated_at = now()
         WHERE id = $6 RETURNING *`,
        [cleanName, cleanEmail, cleanRole, cleanBalance, passwordHash, req.params.id],
      );
      const diff = cleanBalance - current.walletBalance;
      if (diff) {
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount_cents, balance_after)
           VALUES ($1, $2, $3, $4, $5)`,
          [newId(), req.params.id, 'admin_adjustment', diff, cleanBalance],
        );
      }
      return mapUser(rows[0]);
    });
    res.json(publicAdminUser(user));
  } catch (error) {
    if (error.code === '23505') throw new HttpError(409, 'Email is already taken by another account');
    throw error;
  }
});

router.delete('/users/:id', async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(400, 'Invalid user ID');
  if (req.params.id === req.auth.id) throw new HttpError(400, 'You cannot delete your own admin account');
  const { rows } = await pool.query('DELETE FROM users WHERE id = $1 RETURNING name, email', [req.params.id]);
  if (!rows.length) throw new HttpError(404, 'User not found');
  res.json({ ok: true, message: `User "${rows[0].name || rows[0].email}" was deleted` });
});

router.get('/bookings', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, u.name AS user_name, u.email AS user_email
     FROM bookings b JOIN users u ON u.id = b.user_id
     ORDER BY b.created_at DESC LIMIT 200`,
  );
  res.json(rows.map((row) => ({
    ...mapBooking(row),
    user: { _id: row.user_id, name: row.user_name, email: row.user_email },
    hotel: { name: row.hotel_name, city: row.hotel_city },
    room: { name: row.room_name, type: row.room_type },
  })));
});

export default router;

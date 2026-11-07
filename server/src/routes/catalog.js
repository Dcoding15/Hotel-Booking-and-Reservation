import { Router } from 'express';
import mongoose from 'mongoose';
import { pool } from '../db.js';
import { Hotel, Room } from '../models/index.js';
import { cached } from '../redis.js';
import { HttpError, todayUTC, ymd } from '../utils.js';

const router = Router();

// Hotel grid (Redis, 60s). Admin edits invalidate it.
router.get('/hotels', async (_req, res) => {
  res.json(await cached('hotels:list', 60, async () => {
    const [hotels, stats] = await Promise.all([
      Hotel.find({ isActive: true }).sort({ name: 1 }).lean(),
      Room.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$hotel', minPriceCents: { $min: '$pricePerNightCents' }, roomCount: { $sum: 1 } } },
      ]),
    ]);
    const byHotel = new Map(stats.map((s) => [String(s._id), s]));
    return hotels
      .map((h) => ({
        ...h,
        minPriceCents: byHotel.get(String(h._id))?.minPriceCents ?? null,
        roomCount: byHotel.get(String(h._id))?.roomCount ?? 0,
      }))
      .filter((h) => h.roomCount > 0);
  }));
});

// One hotel + only its rooms (Redis, 60s)
router.get('/hotels/:hotelId', async (req, res) => {
  const { hotelId } = req.params;
  if (!mongoose.isValidObjectId(hotelId)) {
    throw new HttpError(400, 'Invalid hotel ID');
  }

  res.json(await cached(`hotel:${hotelId}:rooms`, 60, async () => {
    const hotel = await Hotel.findOne({ _id: hotelId, isActive: true }).lean();
    if (!hotel) throw new HttpError(404, 'Hotel not found');
    const rooms = await Room.find({ hotel: hotelId, isActive: true })
      .sort({ pricePerNightCents: 1 })
      .lean();
    return { hotel, rooms };
  }));
});

// Booked nights for the calendar (Redis, 30s; invalidated on every booking/cancel).
router.get('/rooms/:roomId/booked', async (req, res) => {
  const { roomId } = req.params;
  if (!mongoose.isValidObjectId(roomId)) {
    throw new HttpError(400, 'Invalid room ID');
  }

  res.json(await cached(`room:${roomId}:booked`, 30, async () => {
    const { rows } = await pool.query(
      `SELECT check_in, check_out FROM bookings
       WHERE room_id = $1 AND status = 'confirmed' AND check_out > $2 ORDER BY check_in`,
      [roomId, ymd(todayUTC())],
    );
    return rows.map((b) => ({ checkIn: String(b.check_in), checkOut: String(b.check_out) }));
  }));
});

export default router;

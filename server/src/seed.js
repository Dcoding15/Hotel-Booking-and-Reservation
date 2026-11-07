import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { initializeDatabase, pool } from './db.js';
import { Hotel, Room } from './models/index.js';

for (const key of ['MONGO_URI', 'DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
  if (!process.env[key]) throw new Error(`Missing ${key} in server/.env`);
}

await mongoose.connect(process.env.MONGO_URI);
await initializeDatabase();
const adminEmail = process.env.ADMIN_EMAIL.toLowerCase().trim();
const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
await pool.query(
  `INSERT INTO users (id, role, email, name, password_hash)
   VALUES ($1, 'admin', $2, 'Support Admin', $3)
   ON CONFLICT (email) DO UPDATE SET
     role = 'admin', name = 'Support Admin', password_hash = EXCLUDED.password_hash, updated_at = now()`,
  [randomUUID(), adminEmail, adminPasswordHash],
);
await pool.query('DELETE FROM users WHERE email = $1', ['customer@roomkey.test']);

if (!(await Hotel.countDocuments())) {
  const img = (s) => `https://picsum.photos/seed/${s}/900/600`;
  const hotels = [
    {
      name: 'Harbour Light Inn',
      city: 'Lisbon',
      description: 'Restored warehouse on the river, ten minutes from the tram line.',
      amenities: ['Breakfast', 'Wi-Fi', 'Rooftop'],
      rooms: [
        ['Courtyard Single', 'Single', 1, 7500],
        ['River Double', 'Double', 2, 12000],
        ['Attic Suite', 'Suite', 4, 21000],
      ],
    },
    {
      name: 'Juniper & Pine Lodge',
      city: 'Banff',
      description: 'Timber lodge with a wood stove in every room and a ski room by the door.',
      amenities: ['Sauna', 'Shuttle', 'Wi-Fi'],
      rooms: [
        ['Cedar Queen', 'Queen', 2, 14500],
        ['Bunk Loft', 'Family', 5, 18900],
      ],
    },
    {
      name: 'Kasbah Blue',
      city: 'Marrakesh',
      description: 'Quiet riad around a plunge pool, a short walk from the souks.',
      amenities: ['Pool', 'Breakfast', 'Airport pickup'],
      rooms: [
        ['Tile Room', 'Double', 2, 9800],
        ['Garden Room', 'Double', 2, 11000],
        ['Plunge Suite', 'Suite', 3, 19500],
      ],
    },
  ];
  for (const { rooms, ...hotelData } of hotels) {
    const hotel = await Hotel.create({
      ...hotelData,
      image: img(hotelData.name.replace(/\W/g, '')),
    });
    await Room.insertMany(rooms.map(([name, type, capacity, pricePerNightCents]) => ({
      hotel: hotel._id,
      name,
      type,
      capacity,
      pricePerNightCents,
      image: img(`${hotel.name}${name}`.replace(/\W/g, '')),
      description: `${type} room, sleeps ${capacity}.`,
    })));
  }
}

console.log('Seeded successfully:');
console.log('  Admin:', adminEmail);
await mongoose.disconnect();
await pool.end();

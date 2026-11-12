import 'dotenv/config';
import mongoose from 'mongoose';
import { initializeDatabase, newId, pool } from '../src/db.js';
import { Hotel, Room } from '../src/models/index.js';
import { reserveBooking } from '../src/services/bookingService.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roomkey?replicaSet=rs0&directConnection=true';
const CONCURRENT_COUNT = 20;

async function run() {
  console.log('--- Roomkey Concurrency Race Test ---');
  console.log(`Target: ${CONCURRENT_COUNT} simultaneous bookings for the exact same room and dates.\n`);

  await mongoose.connect(MONGO_URI);
  await initializeDatabase();

  // 1. Find or create an active room for the race test
  let hotel = await Hotel.findOne({ isActive: true });
  let createdHotel = false;
  if (!hotel) {
    hotel = await Hotel.create({
      name: 'Race Test Grand Hotel',
      city: 'Concurrency City',
      description: 'Built specifically for high-concurrency race condition testing.',
      amenities: ['Wi-Fi', 'Isolation', 'Atomicity'],
      isActive: true,
    });
    createdHotel = true;
  }

  const room = await Room.create({
    hotel: hotel._id,
    name: `Race Test Suite ${Date.now()}`,
    type: 'Suite',
    description: 'High contention test suite',
    capacity: 2,
    pricePerNightCents: 15_000, // ₹150 / night
    isActive: true,
  });

  const checkIn = '2027-10-15';
  const checkOut = '2027-10-18'; // 3 nights = ₹450 total (45,000 paise)

  // 2. Create 20 unique test customers
  console.log(`Creating ${CONCURRENT_COUNT} test customer accounts...`);
  const userIds = [];
  for (let i = 1; i <= CONCURRENT_COUNT; i++) {
    const email = `race_user_${Date.now()}_${i}@roomkey.test`;
    const id = newId();
    await pool.query(
      `INSERT INTO users (id, role, email, name, password_hash)
       VALUES ($1, 'customer', $2, $3, 'testhash123')`,
      [id, email, `Racer #${i}`],
    );
    userIds.push(id);
  }

  // 3. Fire 20 simultaneous reservation requests
  const startTime = Date.now();
  const results = await Promise.allSettled(
    userIds.map(async (userId) => {
      try {
        const booking = await reserveBooking({
          userId,
          roomId: room._id,
          checkIn,
          checkOut,
        });
        return { status: 201, data: booking };
      } catch (err) {
        return { status: err.status || 500, error: err.message };
      }
    }),
  );

  const durationMs = Date.now() - startTime;
  console.log(`Executed 20 parallel requests in ${durationMs}ms\n`);

  // 4. Analyze results
  let successCount = 0;
  let conflictCount = 0;
  let otherCount = 0;

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === 'fulfilled') {
      const code = res.value.status;
      if (code === 201 || code === 200) {
        successCount++;
        console.log(`  [Request #${String(i + 1).padStart(2, '0')}] -> SUCCESS (Status ${code})`);
      } else if (code === 409) {
        conflictCount++;
        console.log(`  [Request #${String(i + 1).padStart(2, '0')}] -> CONFLICT (Status 409: ${res.value.data?.error || res.value.error})`);
      } else {
        otherCount++;
        console.log(`  [Request #${String(i + 1).padStart(2, '0')}] -> UNEXPECTED (Status ${code})`, res.value);
      }
    } else {
      otherCount++;
      console.log(`  [Request #${String(i + 1).padStart(2, '0')}] -> REJECTED:`, res.reason);
    }
  }

  // 5. Verify database state
  const bookings = await pool.query("SELECT * FROM bookings WHERE room_id = $1 AND status = 'pending'", [String(room._id)]);
  const bookingsInDb = bookings.rows;

  console.log('\n=== RACE TEST SUMMARY ===');
  console.log(`Total Requests:          ${CONCURRENT_COUNT}`);
  console.log(`Successful Bookings:     ${successCount}`);
  console.log(`Conflicts Handled (409): ${conflictCount}`);
  console.log(`Other Statuses / Errors: ${otherCount}`);
  console.log(`Pending DB Reservations: ${bookingsInDb.length}`);

  // Clean up test data
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
  await pool.query('DELETE FROM bookings WHERE room_id = $1', [String(room._id)]);
  await Room.deleteOne({ _id: room._id });
  if (createdHotel) await Hotel.deleteOne({ _id: hotel._id });

  await mongoose.disconnect();
  await pool.end();

  // 6. Assertions
  if (successCount === 1 && conflictCount === CONCURRENT_COUNT - 1 && otherCount === 0 && bookingsInDb.length === 1) {
    console.log('\n>>> ASSERTION PASSED: Exactly 1 reservation succeeded and 19 returned 409 Conflict. No double-booking occurred. <<<\n');
    process.exit(0);
  } else {
    console.error('\n>>> ASSERTION FAILED: Concurrency check did not match expected counts! <<<\n');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal race-test error:', err);
  process.exit(1);
});

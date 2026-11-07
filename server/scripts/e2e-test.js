import { io } from '../../client/node_modules/socket.io-client/build/esm/index.js';

const BASE_URL = 'http://localhost:4000/api';
const SOCKET_URL = 'http://localhost:4000';

async function req(path, opt = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opt.token ? { Authorization: `Bearer ${opt.token}` } : {}) },
    ...opt,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runE2E() {
  console.log('=== ROOMKEY END-TO-END VERIFICATION (SIMPLE AUTH) ===\n');

  // 1. Admin login
  console.log('1. Admin Sign-In:');
  const adminRes = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@roomkey.test', password: 'ChangeMe123!' }),
  });
  if (adminRes.status !== 200 || !adminRes.data.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminRes.data)}`);
  }
  const adminToken = adminRes.data.token;
  console.log('   Admin logged in successfully! Role:', adminRes.data.user.role);

  // 2. Simple Customer Registration
  console.log('\n2. Simple Customer Registration:');
  const testEmail = `user_${Date.now()}@test.com`;
  const regRes = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail, password: 'Password123!', name: 'Bob Traveler' }),
  });
  if (regRes.status !== 201 || !regRes.data.token) {
    throw new Error(`Registration failed: ${JSON.stringify(regRes.data)}`);
  }
  console.log(`   Account created for ${regRes.data.user.name} (${regRes.data.user.email})! Initial Wallet: $${regRes.data.user.walletBalance / 100}`);

  // 3. Simple Customer Login
  console.log('\n3. Simple Customer Sign-In:');
  const loginRes = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail, password: 'Password123!' }),
  });
  if (loginRes.status !== 200 || !loginRes.data.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);
  }
  const customerToken = loginRes.data.token;
  const customerUser = loginRes.data.user;
  console.log(`   Customer ${customerUser.name} signed in successfully! Token received.`);

  // 4. Hotel and Room Discovery
  console.log('\n4. Hotel & Room Catalog:');
  const hotelsRes = await req('/hotels');
  if (hotelsRes.status !== 200 || !hotelsRes.data.length) throw new Error('Failed to load hotels');
  const hotel = hotelsRes.data[0];
  console.log(`   Found Hotel: "${hotel.name}" in ${hotel.city} (${hotel.roomCount} rooms, starting at $${hotel.minPriceCents / 100}/night)`);

  const roomsRes = await req(`/hotels/${hotel._id}`);
  if (roomsRes.status !== 200 || !roomsRes.data.rooms.length) throw new Error('Failed to load rooms');
  const room = roomsRes.data.rooms[0];
  console.log(`   Selected Room: "${room.name}" (${room.type}, sleeps ${room.capacity}, $${room.pricePerNightCents / 100}/night)`);

  // 5. Wallet Top-Up
  console.log('\n5. Wallet Top-Up ($50):');
  const topupRes = await req('/me/wallet/topup', {
    method: 'POST',
    token: customerToken,
    body: JSON.stringify({ amountCents: 5_000 }), // $50
  });
  if (topupRes.status !== 200) throw new Error(`Topup failed: ${JSON.stringify(topupRes.data)}`);
  console.log(`   Top-up successful! New balance: $${topupRes.data.walletBalance / 100}`);

  // 6. Check booked dates before booking
  console.log('\n6. Booked Dates Availability Check:');
  const bookedBefore = await req(`/rooms/${room._id}/booked`);
  console.log(`   Current booked ranges for room: ${bookedBefore.data.length}`);

  // 7. Create booking for 2 nights
  const checkIn = '2027-12-01';
  const checkOut = '2027-12-03'; // 2 nights
  console.log(`\n7. Booking Room for 2 nights (${checkIn} -> ${checkOut}):`);
  const bookRes = await req('/me/bookings', {
    method: 'POST',
    token: customerToken,
    body: JSON.stringify({ roomId: room._id, checkIn, checkOut }),
  });
  if (bookRes.status !== 201) throw new Error(`Booking failed: ${JSON.stringify(bookRes.data)}`);
  const booking = bookRes.data.booking;
  console.log(`   Booking confirmed! ID: ${booking._id}, Total: $${booking.totalCents / 100}`);
  console.log(`   Wallet balance after debit: $${bookRes.data.walletBalance / 100}`);

  // 8. Try double-booking overlapping dates -> Must return 409
  console.log('\n8. Conflict Detection Check (Attempt overlapping booking):');
  const conflictRes = await req('/me/bookings', {
    method: 'POST',
    token: customerToken,
    body: JSON.stringify({ roomId: room._id, checkIn: '2027-12-02', checkOut: '2027-12-04' }),
  });
  console.log(`   Response status: ${conflictRes.status} (Expected 409: "${conflictRes.data.error}")`);
  if (conflictRes.status !== 409) throw new Error(`Expected 409 conflict, got ${conflictRes.status}`);

  // 9. Cancel booking and verify refund
  console.log('\n9. Cancellation and Full Refund:');
  const cancelRes = await req(`/me/bookings/${booking._id}/cancel`, {
    method: 'POST',
    token: customerToken,
  });
  if (cancelRes.status !== 200) throw new Error(`Cancel failed: ${JSON.stringify(cancelRes.data)}`);
  console.log(`   Booking cancelled! Refund: $${cancelRes.data.booking.refundCents / 100}`);
  console.log(`   Restored Wallet Balance: $${cancelRes.data.walletBalance / 100}`);

  // 10. Real-time Socket.io Chat Test (Customer <-> Admin)
  console.log('\n10. Real-time Customer Support Chat (Socket.io):');
  await new Promise((resolve, reject) => {
    const customerSocket = io(SOCKET_URL, { auth: { token: customerToken } });
    const adminSocket = io(SOCKET_URL, { auth: { token: adminToken } });

    const timeout = setTimeout(() => {
      customerSocket.disconnect();
      adminSocket.disconnect();
      reject(new Error('Socket chat timeout after 8s'));
    }, 8000);

    adminSocket.on('chat:message', (msg) => {
      if (msg.senderRole === 'customer') {
        console.log(`   Admin received live message from customer: "${msg.text}"`);
        adminSocket.emit('chat:send', { text: 'Hello Bob! Roomkey support is here to help.', customerId: customerUser.id });
      }
    });

    customerSocket.on('chat:message', (msg) => {
      if (msg.senderRole === 'admin') {
        console.log(`   Customer received live reply from admin: "${msg.text}"`);
        clearTimeout(timeout);
        customerSocket.disconnect();
        adminSocket.disconnect();
        resolve();
      }
    });

    setTimeout(() => {
      console.log('   Customer sending message: "Hello! Testing live chat with simple auth."');
      customerSocket.emit('chat:send', { text: 'Hello! Testing live chat with simple auth.' });
    }, 500);
  });

  console.log('\n>>> ALL SIMPLE AUTH END-TO-END TESTS PASSED SUCCESSFULLY! <<<\n');
}

runE2E()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('E2E Test Failed:', err);
    process.exit(1);
  });

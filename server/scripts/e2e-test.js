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
  console.log('=== ROOMKEY API VERIFICATION (AUTH, PENDING BOOKING, RAZORPAY ORDER, CHAT) ===\n');

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
  console.log(`   Account created for ${regRes.data.user.name} (${regRes.data.user.email}).`);

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
  console.log(`   Found Hotel: "${hotel.name}" in ${hotel.city} (${hotel.roomCount} rooms, starting at ₹${hotel.minPriceCents / 100}/night)`);

  const roomsRes = await req(`/hotels/${hotel._id}`);
  if (roomsRes.status !== 200 || !roomsRes.data.rooms.length) throw new Error('Failed to load rooms');
  const room = roomsRes.data.rooms[0];
  console.log(`   Selected Room: "${room.name}" (${room.type}, sleeps ${room.capacity}, ₹${room.pricePerNightCents / 100}/night)`);

  // 5. Create an unpaid reservation first
  const checkIn = '2027-12-01';
  const checkOut = '2027-12-03';
  console.log('\n5. Create Pending Booking:');
  const bookingRes = await req('/me/bookings', {
    method: 'POST',
    token: customerToken,
    body: JSON.stringify({ roomId: room._id, checkIn, checkOut }),
  });
  if (bookingRes.status !== 201 || bookingRes.data.booking?.status !== 'pending'
    || bookingRes.data.booking.hasPaymentOrder) {
    throw new Error(`Pending booking creation failed: ${JSON.stringify(bookingRes.data)}`);
  }
  const bookingId = bookingRes.data.booking._id;
  console.log(`   Booking ${bookingId} is pending; no payment order exists yet.`);

  // 6. Confirm the reservation appears in My Bookings, then create its Razorpay order
  console.log('\n6. Pay from My Bookings:');
  const myBookings = await req('/me/bookings', { token: customerToken });
  if (myBookings.status !== 200 || !myBookings.data.some((booking) => booking._id === bookingId)) {
    throw new Error('Pending booking was not listed in My Bookings.');
  }
  const orderRes = await req(`/me/bookings/${bookingId}/order`, {
    method: 'POST',
    token: customerToken,
  });
  if (orderRes.status !== 200 || !orderRes.data.order?.id) {
    throw new Error(`Razorpay order creation failed: ${JSON.stringify(orderRes.data)}`);
  }
  console.log(`   Razorpay order ${orderRes.data.order.id} created for ₹${orderRes.data.order.amount / 100}.`);
  console.log('   Complete payment in the browser to test signature verification and booking confirmation.');

  // 7. Check dates held by the pending reservation
  console.log('\n7. Pending Reservation Availability Check:');
  const bookedBefore = await req(`/rooms/${room._id}/booked`);
  console.log(`   Current booked ranges for room: ${bookedBefore.data.length}`);

  // 8. Try reserving overlapping dates -> Must return 409
  console.log('\n8. Conflict Detection Check (Attempt overlapping reservation):');
  const conflictRes = await req('/me/bookings', {
    method: 'POST',
    token: customerToken,
    body: JSON.stringify({ roomId: room._id, checkIn: '2027-12-02', checkOut: '2027-12-04' }),
  });
  console.log(`   Response status: ${conflictRes.status} (Expected 409: "${conflictRes.data.error}")`);
  if (conflictRes.status !== 409) throw new Error(`Expected 409 conflict, got ${conflictRes.status}`);

  // 9. Real-time Socket.io Chat Test (Customer <-> Admin)
  console.log('\n9. Real-time Customer Support Chat (Socket.io):');
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

  console.log('\n>>> AUTH, CATALOG, PENDING BOOKING, ORDER CREATION FROM MY BOOKINGS, CONFLICT, AND CHAT CHECKS PASSED. PAYMENT COMPLETION REQUIRES CHECKOUT. <<<\n');
}

runE2E()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('E2E Test Failed:', err);
    process.exit(1);
  });

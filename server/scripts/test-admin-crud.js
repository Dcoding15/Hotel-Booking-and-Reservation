const BASE_URL = 'http://localhost:4000/api';

async function req(path, opt = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opt.token ? { Authorization: `Bearer ${opt.token}` } : {}) },
    ...opt,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runAdminTests() {
  console.log('=== TESTING ADMIN CRUD CAPABILITIES ===\n');

  // 1. Admin login
  console.log('1. Authenticating as Administrator:');
  const login = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@roomkey.test', password: 'ChangeMe123!' }),
  });
  if (login.status !== 200) throw new Error('Admin login failed: ' + JSON.stringify(login.data));
  const token = login.data.token;
  const adminId = login.data.user.id;
  console.log('   Admin logged in! ID:', adminId);

  // 2. Hotels CRUD
  console.log('\n2. Testing Hotel Management:');
  // View
  const listHotels = await req('/admin/hotels', { token });
  console.log(`   GET /api/admin/hotels -> Found ${listHotels.data.length} hotels`);

  // Add
  const addHotel = await req('/admin/hotels', {
    method: 'POST',
    token,
    body: JSON.stringify({
      name: 'Test Riviera Resort',
      city: 'Nice, France',
      description: 'Luxury beachfront property.',
      amenities: ['Private Beach', 'Spa', 'Valet'],
      isActive: true,
    }),
  });
  if (addHotel.status !== 201) throw new Error('Add hotel failed: ' + JSON.stringify(addHotel.data));
  const newHotelId = addHotel.data._id;
  console.log(`   POST /api/admin/hotels -> Created hotel "${addHotel.data.name}" (ID: ${newHotelId})`);

  // Edit
  const editHotel = await req(`/admin/hotels/${newHotelId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify({
      name: 'Test Riviera Resort & Spa',
      city: 'Cannes, France',
    }),
  });
  if (editHotel.status !== 200 || editHotel.data.city !== 'Cannes, France') {
    throw new Error('Edit hotel failed: ' + JSON.stringify(editHotel.data));
  }
  console.log(`   PUT /api/admin/hotels/${newHotelId} -> Updated city to "${editHotel.data.city}"`);

  // 3. Hotel Rooms CRUD
  console.log('\n3. Testing Room Management:');
  // Add room
  const addRoom = await req(`/admin/hotels/${newHotelId}/rooms`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      name: 'Ocean View Penthouse',
      type: 'Penthouse',
      capacity: 4,
      pricePerNightCents: 35_000, // $350
      description: 'Top floor suite with panoramic sea views.',
      isActive: true,
    }),
  });
  if (addRoom.status !== 201) throw new Error('Add room failed: ' + JSON.stringify(addRoom.data));
  const newRoomId = addRoom.data._id;
  console.log(`   POST /api/admin/hotels/${newHotelId}/rooms -> Created room "${addRoom.data.name}" ($350/night)`);

  // View rooms
  const listRooms = await req(`/admin/hotels/${newHotelId}/rooms`, { token });
  console.log(`   GET /api/admin/hotels/${newHotelId}/rooms -> Found ${listRooms.data.length} rooms`);

  // Edit room
  const editRoom = await req(`/admin/rooms/${newRoomId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify({
      name: 'Presidential Ocean Penthouse',
      pricePerNightCents: 45_000, // $450
    }),
  });
  if (editRoom.status !== 200 || editRoom.data.pricePerNightCents !== 45_000) {
    throw new Error('Edit room failed: ' + JSON.stringify(editRoom.data));
  }
  console.log(`   PUT /api/admin/rooms/${newRoomId} -> Updated price to $${editRoom.data.pricePerNightCents / 100}`);

  // Delete room
  const delRoom = await req(`/admin/rooms/${newRoomId}`, { method: 'DELETE', token });
  if (delRoom.status !== 200) throw new Error('Delete room failed');
  console.log(`   DELETE /api/admin/rooms/${newRoomId} -> Room deleted successfully`);

  // Delete hotel
  const delHotel = await req(`/admin/hotels/${newHotelId}`, { method: 'DELETE', token });
  if (delHotel.status !== 200) throw new Error('Delete hotel failed');
  console.log(`   DELETE /api/admin/hotels/${newHotelId} -> Hotel deleted successfully`);

  // 4. Users CRUD (Customers & Staff Admins)
  console.log('\n4. Testing User & Staff Management:');
  // View users
  const listUsers = await req('/admin/users', { token });
  console.log(`   GET /api/admin/users -> Total registered users: ${listUsers.data.length}`);

  // Add Customer
  const custEmail = `cust_${Date.now()}@test.com`;
  const addCust = await req('/admin/users', {
    method: 'POST',
    token,
    body: JSON.stringify({
      name: 'Test Customer',
      email: custEmail,
      password: 'Password123!',
      role: 'customer',
      walletBalance: 25_000, // $250
    }),
  });
  if (addCust.status !== 201) throw new Error('Add customer failed: ' + JSON.stringify(addCust.data));
  const custId = addCust.data._id;
  console.log(`   POST /api/admin/users (role: customer) -> Created customer "${addCust.data.name}" (${addCust.data.email}, Balance: $${addCust.data.walletBalance / 100})`);

  // Add Admin Staff
  const staffEmail = `staff_${Date.now()}@test.com`;
  const addStaff = await req('/admin/users', {
    method: 'POST',
    token,
    body: JSON.stringify({
      name: 'Frontdesk Manager',
      email: staffEmail,
      password: 'AdminPassword123!',
      role: 'admin',
    }),
  });
  if (addStaff.status !== 201 || addStaff.data.role !== 'admin') throw new Error('Add staff failed: ' + JSON.stringify(addStaff.data));
  const staffId = addStaff.data._id;
  console.log(`   POST /api/admin/users (role: admin) -> Created staff member "${addStaff.data.name}" (${addStaff.data.email})`);

  // Edit User
  const editCust = await req(`/admin/users/${custId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify({
      name: 'Test Customer VIP',
      walletBalance: 75_000, // $750
    }),
  });
  if (editCust.status !== 200 || editCust.data.walletBalance !== 75_000) {
    throw new Error('Edit customer failed: ' + JSON.stringify(editCust.data));
  }
  console.log(`   PUT /api/admin/users/${custId} -> Updated wallet balance to $${editCust.data.walletBalance / 100} and name to "${editCust.data.name}"`);

  // Delete Customer
  const delCust = await req(`/admin/users/${custId}`, { method: 'DELETE', token });
  if (delCust.status !== 200) throw new Error('Delete customer failed');
  console.log(`   DELETE /api/admin/users/${custId} -> Customer deleted`);

  // Delete Staff
  const delStaff = await req(`/admin/users/${staffId}`, { method: 'DELETE', token });
  if (delStaff.status !== 200) throw new Error('Delete staff failed');
  console.log(`   DELETE /api/admin/users/${staffId} -> Staff user deleted`);

  // Self-delete protection check
  const selfDel = await req(`/admin/users/${adminId}`, { method: 'DELETE', token });
  if (selfDel.status !== 400) throw new Error('Expected 400 for self-delete, got ' + selfDel.status);
  console.log(`   DELETE /api/admin/users/${adminId} (Self) -> Blocked as expected: "${selfDel.data.error}"`);

  // 5. Bookings Audit
  console.log('\n5. Testing Bookings Ledger:');
  const allBookings = await req('/admin/bookings', { token });
  console.log(`   GET /api/admin/bookings -> Retrieved ${allBookings.data.length} bookings`);

  console.log('\n>>> ALL ADMIN CRUD OPERATIONS PASSED WITH 100% SUCCESS! <<<\n');
}

runAdminTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Admin Test Failed:', err);
    process.exit(1);
  });

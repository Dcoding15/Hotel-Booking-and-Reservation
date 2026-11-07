import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDate, money, errMsg } from '../utils.js';
import AdminSupport from './AdminSupport.jsx';

export default function AdminDashboard() {
  const { user: currentAdmin } = useAuth();
  const [tab, setTab] = useState('hotels'); // 'hotels' | 'users' | 'bookings' | 'support'
  const [msg, setMsg] = useState({ text: '', type: '' }); // type: 'pos' | 'error'

  // Hotels & Rooms state
  const [hotels, setHotels] = useState([]);
  const [expandedHotel, setExpandedHotel] = useState(null);
  const [hotelRooms, setHotelRooms] = useState({});
  const [hotelModal, setHotelModal] = useState(null); // null | { mode: 'add' | 'edit', data: {} }
  const [roomModal, setRoomModal] = useState(null); // null | { mode: 'add' | 'edit', hotelId: string, data: {} }

  // Users state
  const [users, setUsers] = useState([]);
  const [userRoleFilter, setUserRoleFilter] = useState('all'); // 'all' | 'customer' | 'admin'
  const [userModal, setUserModal] = useState(null); // null | { mode: 'add' | 'edit', data: {} }
  const [walletModal, setWalletModal] = useState(null);

  // Bookings state
  const [bookings, setBookings] = useState([]);
  const [walletRequests, setWalletRequests] = useState([]);

  const notify = (text, type = 'pos') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  // ====================================================
  // DATA LOADERS
  // ====================================================
  const loadHotels = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/hotels');
      setHotels(data);
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  }, []);

  const loadRoomsForHotel = async (hotelId) => {
    try {
      const { data } = await api.get(`/admin/hotels/${hotelId}/rooms`);
      setHotelRooms((prev) => ({ ...prev, [hotelId]: data }));
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  };

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  }, []);

  const loadBookings = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/bookings');
      setBookings(data);
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  }, []);

  const loadWalletRequests = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/wallet-requests');
      setWalletRequests(data);
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  }, []);

  useEffect(() => {
    loadHotels();
    loadUsers();
    loadBookings();
    loadWalletRequests();
  }, [loadHotels, loadUsers, loadBookings, loadWalletRequests]);

  // ====================================================
  // HOTEL CRUD ACTIONS
  // ====================================================
  async function saveHotel(e) {
    e.preventDefault();
    const { _id, name, city, description, image, amenities, isActive } = hotelModal.data;
    try {
      const payload = {
        name,
        city,
        description,
        image: image || `https://picsum.photos/seed/${encodeURIComponent(name)}/900/600`,
        amenities: typeof amenities === 'string' ? amenities.split(',').map((s) => s.trim()).filter(Boolean) : amenities,
        isActive: Boolean(isActive),
      };

      if (hotelModal.mode === 'add') {
        await api.post('/admin/hotels', payload);
        notify('Hotel created successfully!');
      } else {
        await api.put(`/admin/hotels/${_id}`, payload);
        notify('Hotel updated successfully!');
      }
      setHotelModal(null);
      loadHotels();
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  }

  async function deleteHotel(hotel) {
    if (!window.confirm(`Are you sure you want to delete "${hotel.name}" and all its rooms?`)) return;
    try {
      await api.delete(`/admin/hotels/${hotel._id}`);
      notify(`Hotel "${hotel.name}" deleted.`);
      loadHotels();
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  }

  // ====================================================
  // ROOM CRUD ACTIONS
  // ====================================================
  async function saveRoom(e) {
    e.preventDefault();
    const { hotelId, mode, data } = roomModal;
    const { _id, name, type, description, capacity, priceDollars, image, isActive } = data;
    try {
      const payload = {
        name,
        type: type || 'Standard',
        description: description || '',
        capacity: Number(capacity) || 2,
        pricePerNightCents: Math.round(Number(priceDollars) * 100),
        image: image || `https://picsum.photos/seed/${encodeURIComponent(name)}/900/600`,
        isActive: Boolean(isActive),
      };

      if (mode === 'add') {
        await api.post(`/admin/hotels/${hotelId}/rooms`, payload);
        notify('Room created successfully!');
      } else {
        await api.put(`/admin/rooms/${_id}`, payload);
        notify('Room updated successfully!');
      }
      setRoomModal(null);
      loadRoomsForHotel(hotelId);
      loadHotels(); // refresh counts
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  }

  async function deleteRoom(hotelId, room) {
    if (!window.confirm(`Delete room "${room.name}"?`)) return;
    try {
      await api.delete(`/admin/rooms/${room._id}`);
      notify(`Room "${room.name}" deleted.`);
      loadRoomsForHotel(hotelId);
      loadHotels();
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  }

  // ====================================================
  // USER CRUD ACTIONS (CUSTOMERS & ADMINS)
  // ====================================================
  async function saveUser(e) {
    e.preventDefault();
    const { mode, data } = userModal;
    const { _id, name, email, password, role, walletDollars } = data;
    try {
      const payload = {
        name,
        email,
        role,
        walletBalance: Math.round((Number(walletDollars) || 0) * 100),
      };
      if (password) payload.password = password;

      if (mode === 'add') {
        if (!password) {
          notify('Password is required for new users', 'error');
          return;
        }
        await api.post('/admin/users', payload);
        notify(`User ${name || email} created!`);
      } else {
        await api.put(`/admin/users/${_id}`, payload);
        notify(`User ${name || email} updated!`);
      }
      setUserModal(null);
      loadUsers();
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  }

  async function deleteUser(u) {
    if (String(u._id) === String(currentAdmin?.id)) {
      notify('You cannot delete your own admin account.', 'error');
      return;
    }
    if (!window.confirm(`Delete user "${u.name || u.email}" (${u.role})?`)) return;
    try {
      await api.delete(`/admin/users/${u._id}`);
      notify(`User "${u.name || u.email}" was deleted.`);
      loadUsers();
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  }

  async function reviewWalletRequest(request, action) {
    try {
      await api.post(`/admin/wallet-requests/${request._id}/${action}`);
      notify(`Top-up request ${action === 'approve' ? 'approved' : 'rejected'}.`);
      loadWalletRequests();
      loadUsers();
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  }

  async function adjustWallet(e) {
    e.preventDefault();
    const { user, direction, dollars } = walletModal;
    const amountCents = Math.round(Number(dollars) * 100) * (direction === 'subtract' ? -1 : 1);
    try {
      const { data } = await api.post(`/admin/users/${user._id}/wallet-adjustments`, { amountCents });
      notify(`Wallet updated. New balance: ${money(data.walletBalance)}.`);
      setWalletModal(null);
      loadUsers();
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  }

  const filteredUsers = users.filter((u) => {
    if (userRoleFilter === 'customer') return u.role === 'customer';
    if (userRoleFilter === 'admin') return u.role === 'admin';
    return true;
  });

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Administration Portal</h1>
          <p className="muted small">Manage hotels, rooms, customers, and staff administrator accounts.</p>
        </div>
        <span className="badge badge-admin">Logged in as: {currentAdmin?.email}</span>
      </div>

      {msg.text && (
        <div className={msg.type === 'error' ? 'notice' : 'notice'} style={{ borderColor: msg.type === 'error' ? 'var(--brick)' : 'var(--moss)' }}>
          <p className={msg.type === 'error' ? 'error' : 'pos'} style={{ margin: 0, fontWeight: 600 }}>
            {msg.text}
          </p>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="admin-tabs">
        <button className={`tab-btn ${tab === 'hotels' ? 'active' : ''}`} onClick={() => setTab('hotels')}>
          Hotels & Rooms ({hotels.length})
        </button>
        <button className={`tab-btn ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          Users & Staff ({users.length})
        </button>
        <button className={`tab-btn ${tab === 'walletRequests' ? 'active' : ''}`} onClick={() => setTab('walletRequests')}>
          Wallet Requests ({walletRequests.filter((request) => request.status === 'pending').length})
        </button>
        <button className={`tab-btn ${tab === 'bookings' ? 'active' : ''}`} onClick={() => setTab('bookings')}>
          All Bookings ({bookings.length})
        </button>
        <button className={`tab-btn ${tab === 'support' ? 'active' : ''}`} onClick={() => setTab('support')}>
          Support Desk
        </button>
      </nav>

      {/* ==================================================== */}
      {/* TAB 1: HOTELS & ROOMS                                */}
      {/* ==================================================== */}
      {tab === 'hotels' && (
        <section>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2>Hotels Catalog</h2>
            <button
              className="btn"
              onClick={() =>
                setHotelModal({
                  mode: 'add',
                  data: { name: '', city: '', description: '', image: '', amenities: 'Wi-Fi, Breakfast', isActive: true },
                })
              }
            >
              + Add New Hotel
            </button>
          </div>

          {hotels.map((h) => {
            const isExpanded = expandedHotel === h._id;
            const rooms = hotelRooms[h._id] || [];
            return (
              <div key={h._id} className="hotel-admin-card">
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '1rem', alignItems: 'center' }}>
                  <img
                    src={h.image}
                    alt=""
                    style={{ width: '120px', height: '80px', objectFit: 'cover', borderRadius: '8px', background: 'var(--aqua)' }}
                  />
                  <div>
                    <h3 style={{ margin: '0 0 0.2rem' }}>
                      {h.name}{' '}
                      <span className={`badge ${h.isActive ? 'badge-active' : 'badge-inactive'}`}>
                        {h.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </h3>
                    <p className="muted small" style={{ margin: '0 0 0.2rem' }}>
                      <strong>{h.city}</strong> · {h.description}
                    </p>
                    <p className="small" style={{ margin: 0 }}>
                      Amenities: {h.amenities?.join(', ') || 'None'} ·{' '}
                      <span className="price" style={{ fontSize: '0.9rem' }}>
                        {h.roomCount} {h.roomCount === 1 ? 'room' : 'rooms'}
                        {h.minPriceCents ? ` (from ${money(h.minPriceCents)}/night)` : ''}
                      </span>
                    </p>
                  </div>
                  <div className="row" style={{ gap: '0.4rem' }}>
                    <button
                      className="btn ghost btn-sm"
                      onClick={() => {
                        if (!isExpanded) loadRoomsForHotel(h._id);
                        setExpandedHotel(isExpanded ? null : h._id);
                      }}
                    >
                      {isExpanded ? 'Hide Rooms' : `Manage Rooms (${h.roomCount})`}
                    </button>
                    <button
                      className="btn ghost btn-sm"
                      onClick={() =>
                        setHotelModal({
                          mode: 'edit',
                          data: { ...h, amenities: h.amenities?.join(', ') || '' },
                        })
                      }
                    >
                      Edit Hotel
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteHotel(h)}>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Expanded Rooms List */}
                {isExpanded && (
                  <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <h4>Rooms in {h.name}</h4>
                      <button
                        className="btn ghost btn-sm"
                        onClick={() =>
                          setRoomModal({
                            mode: 'add',
                            hotelId: h._id,
                            data: { name: '', type: 'Double', description: '', capacity: 2, priceDollars: 100, image: '', isActive: true },
                          })
                        }
                      >
                        + Add Room to {h.name}
                      </button>
                    </div>

                    {rooms.length === 0 ? (
                      <p className="muted small">No rooms yet in this hotel. Add one above.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Room Name</th>
                              <th>Type</th>
                              <th>Sleeps</th>
                              <th>Price / Night</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rooms.map((r) => (
                              <tr key={r._id}>
                                <td>
                                  <strong>{r.name}</strong>
                                </td>
                                <td>{r.type}</td>
                                <td>{r.capacity}</td>
                                <td>
                                  <strong>{money(r.pricePerNightCents)}</strong>
                                </td>
                                <td>
                                  <span className={`badge ${r.isActive ? 'badge-active' : 'badge-inactive'}`}>
                                    {r.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td>
                                  <div className="row" style={{ gap: '0.4rem' }}>
                                    <button
                                      className="btn ghost btn-sm"
                                      onClick={() =>
                                        setRoomModal({
                                          mode: 'edit',
                                          hotelId: h._id,
                                          data: { ...r, priceDollars: (r.pricePerNightCents / 100).toFixed(0) },
                                        })
                                      }
                                    >
                                      Edit
                                    </button>
                                    <button className="btn btn-sm btn-danger" onClick={() => deleteRoom(h._id, r)}>
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* ==================================================== */}
      {/* TAB 2: USERS & STAFF MANAGEMENT                      */}
      {/* ==================================================== */}
      {tab === 'users' && (
        <section>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2>Users & Staff Accounts</h2>
              <p className="muted small" style={{ margin: 0 }}>
                Manage customer accounts, wallets, and staff administrators with full edit and delete access.
              </p>
            </div>
            <button
              className="btn"
              onClick={() =>
                setUserModal({
                  mode: 'add',
                  data: { name: '', email: '', password: '', role: 'customer', walletDollars: 500 },
                })
              }
            >
              + Add User / Admin
            </button>
          </div>

          {/* Role Filters */}
          <div className="row" style={{ gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              className={`btn btn-sm ${userRoleFilter === 'all' ? '' : 'ghost'}`}
              onClick={() => setUserRoleFilter('all')}
            >
              All ({users.length})
            </button>
            <button
              className={`btn btn-sm ${userRoleFilter === 'customer' ? '' : 'ghost'}`}
              onClick={() => setUserRoleFilter('customer')}
            >
              Customers ({users.filter((u) => u.role === 'customer').length})
            </button>
            <button
              className={`btn btn-sm ${userRoleFilter === 'admin' ? '' : 'ghost'}`}
              onClick={() => setUserRoleFilter('admin')}
            >
              Admins ({users.filter((u) => u.role === 'admin').length})
            </button>
          </div>

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Wallet Balance</th>
                  <th>Joined Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf = String(u._id) === String(currentAdmin?.id);
                  return (
                    <tr key={u._id}>
                      <td>
                        <strong>{u.name || '—'}</strong> {isSelf && <span className="small muted">(You)</span>}
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge-customer'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <strong className="pos">{money(u.walletBalance)}</strong>
                      </td>
                      <td className="small muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div className="row" style={{ gap: '0.4rem' }}>
                          <button
                            className="btn ghost btn-sm"
                            onClick={() =>
                              setUserModal({
                                mode: 'edit',
                                data: {
                                  ...u,
                                  password: '',
                                  walletDollars: (u.walletBalance / 100).toFixed(0),
                                },
                              })
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={isSelf}
                            title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                            onClick={() => deleteUser(u)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'walletRequests' && (
        <section>
          <h2>Customer wallet top-up requests</h2>
          <p className="muted small">Approve a request to credit the customer’s wallet, or reject it without changing their balance.</p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Customer</th><th>Amount</th><th>Requested</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {walletRequests.length === 0 ? (
                  <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No wallet requests yet.</td></tr>
                ) : walletRequests.map((request) => (
                  <tr key={request._id}>
                    <td><strong>{request.customer.name || 'Customer'}</strong><br /><small className="muted">{request.customer.email}</small></td>
                    <td><strong>{money(request.amountCents)}</strong></td>
                    <td className="small muted">{new Date(request.createdAt).toLocaleString()}</td>
                    <td><span className={`badge ${request.status === 'approved' ? 'badge-active' : request.status === 'pending' ? 'badge-admin' : 'badge-inactive'}`}>{request.status}</span></td>
                    <td>
                      {request.status === 'pending' ? (
                        <div className="row" style={{ gap: '0.4rem' }}>
                          <button className="btn btn-sm" onClick={() => reviewWalletRequest(request, 'approve')}>Approve</button>
                          <button className="btn btn-sm btn-danger" onClick={() => reviewWalletRequest(request, 'reject')}>Reject</button>
                        </div>
                      ) : <span className="muted small">Reviewed {request.reviewedAt ? new Date(request.reviewedAt).toLocaleString() : ''}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==================================================== */}
      {/* TAB 3: BOOKINGS AUDIT                                */}
      {/* ==================================================== */}
      {tab === 'bookings' && (
        <section>
          <h2>All System Bookings</h2>
          <p className="muted small">Complete ledger of all customer reservations across all hotels.</p>

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Hotel</th>
                  <th>Room</th>
                  <th>Dates (In → Out)</th>
                  <th>Nights</th>
                  <th>Total Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: '2rem' }}>
                      No bookings recorded yet.
                    </td>
                  </tr>
                ) : (
                  bookings.map((b) => (
                    <tr key={b._id}>
                      <td>
                        <strong>{b.user?.name || 'Customer'}</strong>
                        <br />
                        <small className="muted">{b.user?.email}</small>
                      </td>
                      <td>
                        <strong>{b.hotel?.name}</strong>
                        <br />
                        <small className="muted">{b.hotel?.city}</small>
                      </td>
                      <td>{b.room?.name}</td>
                      <td>
                        {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}
                      </td>
                      <td>{b.nights}</td>
                      <td>
                        <strong>{money(b.totalCents)}</strong>
                        {b.status === 'cancelled' && <br />}
                        {b.status === 'cancelled' && <small className="neg">Refund: {money(b.refundCents)}</small>}
                      </td>
                      <td>
                        <span className={`badge ${b.status === 'confirmed' ? 'badge-active' : 'badge-inactive'}`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==================================================== */}
      {/* TAB 4: SUPPORT CHAT DESK                             */}
      {/* ==================================================== */}
      {tab === 'support' && <AdminSupport />}

      {/* ==================================================== */}
      {/* MODAL: HOTEL (ADD / EDIT)                            */}
      {/* ==================================================== */}
      {hotelModal && (
        <div className="overlay" onClick={() => setHotelModal(null)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <button className="close link" onClick={() => setHotelModal(null)}>
              ✕
            </button>
            <h2>{hotelModal.mode === 'add' ? 'Add New Hotel' : `Edit Hotel: ${hotelModal.data.name}`}</h2>

            <form onSubmit={saveHotel} style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
              <label>
                Hotel Name
                <input
                  type="text"
                  required
                  placeholder="e.g. Grand Horizon Hotel"
                  value={hotelModal.data.name || ''}
                  onChange={(e) =>
                    setHotelModal({ ...hotelModal, data: { ...hotelModal.data, name: e.target.value } })
                  }
                />
              </label>

              <label>
                City / Location
                <input
                  type="text"
                  required
                  placeholder="e.g. Paris, France"
                  value={hotelModal.data.city || ''}
                  onChange={(e) =>
                    setHotelModal({ ...hotelModal, data: { ...hotelModal.data, city: e.target.value } })
                  }
                />
              </label>

              <label>
                Description
                <textarea
                  style={{ font: 'inherit', padding: '0.55rem 0.7rem', border: '1px solid var(--line)', borderRadius: '8px', minHeight: '70px' }}
                  placeholder="Short description of hotel features"
                  value={hotelModal.data.description || ''}
                  onChange={(e) =>
                    setHotelModal({ ...hotelModal, data: { ...hotelModal.data, description: e.target.value } })
                  }
                />
              </label>

              <label>
                Image URL (optional, defaults to Picsum)
                <input
                  type="url"
                  placeholder="https://..."
                  value={hotelModal.data.image || ''}
                  onChange={(e) =>
                    setHotelModal({ ...hotelModal, data: { ...hotelModal.data, image: e.target.value } })
                  }
                />
              </label>

              <label>
                Amenities (comma separated)
                <input
                  type="text"
                  placeholder="Wi-Fi, Breakfast, Pool, Rooftop"
                  value={hotelModal.data.amenities || ''}
                  onChange={(e) =>
                    setHotelModal({ ...hotelModal, data: { ...hotelModal.data, amenities: e.target.value } })
                  }
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={Boolean(hotelModal.data.isActive)}
                  onChange={(e) =>
                    setHotelModal({ ...hotelModal, data: { ...hotelModal.data, isActive: e.target.checked } })
                  }
                />
                Hotel is Active and visible to public
              </label>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn ghost" onClick={() => setHotelModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn">
                  {hotelModal.mode === 'add' ? 'Create Hotel' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ROOM (ADD / EDIT)                             */}
      {/* ==================================================== */}
      {roomModal && (
        <div className="overlay" onClick={() => setRoomModal(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <button className="close link" onClick={() => setRoomModal(null)}>
              ✕
            </button>
            <h2>{roomModal.mode === 'add' ? 'Add New Room' : `Edit Room: ${roomModal.data.name}`}</h2>

            <form onSubmit={saveRoom} style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
              <label>
                Room Name
                <input
                  type="text"
                  required
                  placeholder="e.g. Deluxe Ocean View"
                  value={roomModal.data.name || ''}
                  onChange={(e) =>
                    setRoomModal({ ...roomModal, data: { ...roomModal.data, name: e.target.value } })
                  }
                />
              </label>

              <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <label>
                  Type
                  <input
                    type="text"
                    placeholder="e.g. Suite, Double, Single"
                    value={roomModal.data.type || ''}
                    onChange={(e) =>
                      setRoomModal({ ...roomModal, data: { ...roomModal.data, type: e.target.value } })
                    }
                  />
                </label>

                <label>
                  Capacity (Sleeps)
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={roomModal.data.capacity || 2}
                    onChange={(e) =>
                      setRoomModal({ ...roomModal, data: { ...roomModal.data, capacity: e.target.value } })
                    }
                  />
                </label>
              </div>

              <label>
                Price per Night ($ USD)
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="e.g. 150"
                  value={roomModal.data.priceDollars || ''}
                  onChange={(e) =>
                    setRoomModal({ ...roomModal, data: { ...roomModal.data, priceDollars: e.target.value } })
                  }
                />
              </label>

              <label>
                Description
                <input
                  type="text"
                  placeholder="e.g. King bed, private balcony"
                  value={roomModal.data.description || ''}
                  onChange={(e) =>
                    setRoomModal({ ...roomModal, data: { ...roomModal.data, description: e.target.value } })
                  }
                />
              </label>

              <label>
                Image URL (optional)
                <input
                  type="url"
                  placeholder="https://..."
                  value={roomModal.data.image || ''}
                  onChange={(e) =>
                    setRoomModal({ ...roomModal, data: { ...roomModal.data, image: e.target.value } })
                  }
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={Boolean(roomModal.data.isActive)}
                  onChange={(e) =>
                    setRoomModal({ ...roomModal, data: { ...roomModal.data, isActive: e.target.checked } })
                  }
                />
                Room is Active and bookable
              </label>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn ghost" onClick={() => setRoomModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn">
                  {roomModal.mode === 'add' ? 'Create Room' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: USER (ADD / EDIT CUSTOMER OR ADMIN)           */}
      {/* ==================================================== */}
      {userModal && (
        <div className="overlay" onClick={() => setUserModal(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="close link" onClick={() => setUserModal(null)}>
              ✕
            </button>
            <h2>{userModal.mode === 'add' ? 'Add User or Staff' : `Edit User: ${userModal.data.email}`}</h2>

            <form onSubmit={saveUser} style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
              <label>
                Full Name
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Smith"
                  value={userModal.data.name || ''}
                  onChange={(e) =>
                    setUserModal({ ...userModal, data: { ...userModal.data, name: e.target.value } })
                  }
                />
              </label>

              <label>
                Email Address
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={userModal.data.email || ''}
                  onChange={(e) =>
                    setUserModal({ ...userModal, data: { ...userModal.data, email: e.target.value } })
                  }
                />
              </label>

              <label>
                {userModal.mode === 'add' ? 'Password' : 'New Password (leave empty to keep current)'}
                <input
                  type="password"
                  minLength={6}
                  placeholder={userModal.mode === 'add' ? 'Min 6 characters' : 'Enter new password'}
                  value={userModal.data.password || ''}
                  onChange={(e) =>
                    setUserModal({ ...userModal, data: { ...userModal.data, password: e.target.value } })
                  }
                />
              </label>

              <label>
                Account Role
                <select
                  style={{ font: 'inherit', padding: '0.55rem 0.7rem', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--paper)', color: 'var(--text)' }}
                  value={userModal.data.role || 'customer'}
                  onChange={(e) =>
                    setUserModal({ ...userModal, data: { ...userModal.data, role: e.target.value } })
                  }
                >
                  <option value="customer">Customer (Can book rooms)</option>
                  <option value="admin">Administrator / Staff (Full portal access)</option>
                </select>
              </label>

              <label>
                Wallet Balance ($ USD)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={userModal.data.walletDollars || 0}
                  onChange={(e) =>
                    setUserModal({ ...userModal, data: { ...userModal.data, walletDollars: e.target.value } })
                  }
                />
              </label>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn ghost" onClick={() => setUserModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn">
                  {userModal.mode === 'add' ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {walletModal && (
        <div className="overlay" onClick={() => setWalletModal(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <button className="close link" onClick={() => setWalletModal(null)} aria-label="Close">✕</button>
            <h2>Adjust wallet</h2>
            <p className="muted small">{walletModal.user.name || walletModal.user.email} · Current balance {money(walletModal.user.walletBalance)}</p>
            <form onSubmit={adjustWallet} style={{ display: 'grid', gap: '0.85rem' }}>
              <label>
                Action
                <select
                  value={walletModal.direction}
                  onChange={(e) => setWalletModal({ ...walletModal, direction: e.target.value })}
                >
                  <option value="add">Add funds</option>
                  <option value="subtract">Subtract funds</option>
                </select>
              </label>
              <label>
                Amount ($)
                <input
                  type="number"
                  min="0.01"
                  max="10000"
                  step="0.01"
                  required
                  value={walletModal.dollars}
                  onChange={(e) => setWalletModal({ ...walletModal, dollars: e.target.value })}
                />
              </label>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn ghost" onClick={() => setWalletModal(null)}>Cancel</button>
                <button type="submit" className="btn">Apply adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { money } from '../utils.js';
import BookingModal from '../components/BookingModal.jsx';

export default function HotelPage() {
  const { hotelId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [room, setRoom] = useState(null);
  const [filters, setFilters] = useState({ search: '', type: '', minCapacity: '', maxPrice: '', sort: 'price-asc' });

  useEffect(() => {
    api.get(`/hotels/${hotelId}`).then((r) => setData(r.data)).catch(() => setError('Hotel not found.'));
  }, [hotelId]);

  const rooms = data?.rooms || [];
  const roomTypes = useMemo(
    () => [...new Set(rooms.map((item) => item.type).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rooms],
  );
  const filteredRooms = useMemo(() => {
    const query = filters.search.trim().toLocaleLowerCase();
    const maxPriceCents = filters.maxPrice === '' ? Infinity : Number(filters.maxPrice) * 100;
    return rooms
      .filter((item) => {
        const searchable = [item.name, item.type, item.description].filter(Boolean).join(' ').toLocaleLowerCase();
        return (!query || searchable.includes(query))
          && (!filters.type || item.type === filters.type)
          && (!filters.minCapacity || item.capacity >= Number(filters.minCapacity))
          && item.pricePerNightCents <= maxPriceCents;
      })
      .sort((a, b) => {
        if (filters.sort === 'price-desc') return b.pricePerNightCents - a.pricePerNightCents;
        if (filters.sort === 'capacity-desc') return b.capacity - a.capacity || a.pricePerNightCents - b.pricePerNightCents;
        return a.pricePerNightCents - b.pricePerNightCents;
      });
  }, [rooms, filters]);
  const clearFilters = () => setFilters({ search: '', type: '', minCapacity: '', maxPrice: '', sort: 'price-asc' });
  const hasFilters = Boolean(filters.search || filters.type || filters.minCapacity || filters.maxPrice || filters.sort !== 'price-asc');

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading rooms…</p>;
  const { hotel } = data;

  return (
    <>
      <h1>{hotel.name}</h1>
      <p className="muted lead">{hotel.city} · {hotel.description}</p>
      <section className="filter-panel" aria-label="Filter rooms">
        <div className="filter-heading">
          <div>
            <h2>Find a room</h2>
            <p className="muted small">{filteredRooms.length} of {rooms.length} rooms</p>
          </div>
          {hasFilters && <button type="button" className="btn ghost btn-sm" onClick={clearFilters}>Clear filters</button>}
        </div>
        <div className="filter-grid room-filters">
          <label>
            Search rooms
            <input
              type="search"
              placeholder="Room name or details"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </label>
          <label>
            Room type
            <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
              <option value="">All room types</option>
              {roomTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            Minimum guests
            <select value={filters.minCapacity} onChange={(event) => setFilters({ ...filters, minCapacity: event.target.value })}>
              <option value="">Any capacity</option>
              {[2, 3, 4, 5, 6, 8, 10].map((capacity) => <option key={capacity} value={capacity}>{capacity}+ guests</option>)}
            </select>
          </label>
          <label>
            Max price per night
            <input
              type="number"
              min="0"
              step="10"
              placeholder="No limit"
              value={filters.maxPrice}
              onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value })}
            />
          </label>
          <label>
            Sort rooms
            <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="capacity-desc">Most guests</option>
            </select>
          </label>
        </div>
      </section>
      <div className="grid">
        {filteredRooms.map((r) => (
          <article key={r._id} className="room-card">
            <img src={r.image} alt="" loading="lazy" />
            <div className="card-body">
              <h3>{r.name}</h3>
              <p className="muted">{r.type} · sleeps {r.capacity}</p>
              <p className="price">{money(r.pricePerNightCents)} <span className="muted small">per night</span></p>
              <button className="btn" onClick={() => setRoom(r)}>Choose dates</button>
            </div>
          </article>
        ))}
      </div>
      {filteredRooms.length === 0 && (
        <div className="filter-empty">
          <h3>No matching rooms</h3>
          <p className="muted">Try changing or clearing your room filters.</p>
          <button type="button" className="btn ghost" onClick={clearFilters}>Clear filters</button>
        </div>
      )}
      {room && <BookingModal room={room} hotel={hotel} onClose={() => setRoom(null)} />}
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { money } from '../utils.js';

export default function Home() {
  const [hotels, setHotels] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ search: '', city: '', maxPrice: '', sort: 'name' });

  useEffect(() => {
    api.get('/hotels').then((r) => setHotels(r.data)).catch(() => setError('Could not load hotels. Is the API running?'));
  }, []);

  const cities = useMemo(
    () => [...new Set((hotels || []).map((hotel) => hotel.city).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [hotels],
  );
  const filteredHotels = useMemo(() => {
    if (!hotels) return [];
    const query = filters.search.trim().toLocaleLowerCase();
    const maxPriceCents = filters.maxPrice === '' ? Infinity : Number(filters.maxPrice) * 100;
    return hotels
      .filter((hotel) => {
        const searchable = [hotel.name, hotel.city, hotel.description, ...(hotel.amenities || [])]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase();
        return (!query || searchable.includes(query))
          && (!filters.city || hotel.city === filters.city)
          && (filters.maxPrice === '' || (hotel.minPriceCents != null && hotel.minPriceCents <= maxPriceCents));
      })
      .sort((a, b) => {
        if (filters.sort === 'price-asc') return (a.minPriceCents ?? Infinity) - (b.minPriceCents ?? Infinity);
        if (filters.sort === 'price-desc') return (b.minPriceCents ?? 0) - (a.minPriceCents ?? 0);
        if (filters.sort === 'rooms-desc') return b.roomCount - a.roomCount;
        return a.name.localeCompare(b.name);
      });
  }, [hotels, filters]);

  const clearFilters = () => setFilters({ search: '', city: '', maxPrice: '', sort: 'name' });
  const hasFilters = Boolean(filters.search || filters.city || filters.maxPrice || filters.sort !== 'name');

  return (
    <>
      <h1>Find your next stay</h1>
      <p className="muted lead">Explore hotels by destination, amenities, and nightly price. Bookings are paid from your Roomkey wallet.</p>
      {error && <p className="error">{error}</p>}
      {!hotels && !error && <p className="muted">Loading hotels…</p>}
      {hotels && (
        <section className="filter-panel" aria-label="Filter hotels">
          <div className="filter-heading">
            <div>
              <h2>Find a hotel</h2>
              <p className="muted small">{filteredHotels.length} of {hotels.length} hotels</p>
            </div>
            {hasFilters && <button type="button" className="btn ghost btn-sm" onClick={clearFilters}>Clear filters</button>}
          </div>
          <div className="filter-grid hotel-filters">
            <label>
              Search hotels
              <input
                type="search"
                placeholder="Name, city, or amenity"
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              />
            </label>
            <label>
              Destination
              <select value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })}>
                <option value="">All destinations</option>
                {cities.map((city) => <option key={city} value={city}>{city}</option>)}
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
              Sort hotels
              <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
                <option value="name">Name: A to Z</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="rooms-desc">Most rooms</option>
              </select>
            </label>
          </div>
        </section>
      )}
      <div className="grid">
        {filteredHotels.map((h) => (
          // Opens the hotel's rooms in a new browser tab
          <a key={h._id} className="hotel-card" href={`/hotels/${h._id}`} rel="noopener noreferrer">
            <img src={h.image} alt="" loading="lazy" />
            <div className="card-body">
              <h3>{h.name}</h3>
              <p className="muted">{h.city}</p>
              <p className="small">{h.amenities?.join(', ')}</p>
              <p className="price">From {money(h.minPriceCents)} <span className="muted small">per night · {h.roomCount} rooms</span></p>
            </div>
          </a>
        ))}
      </div>
      {hotels && filteredHotels.length === 0 && (
        <div className="filter-empty">
          <h3>No matching hotels</h3>
          <p className="muted">Try changing or clearing your hotel filters.</p>
          <button type="button" className="btn ghost" onClick={clearFilters}>Clear filters</button>
        </div>
      )}
    </>
  );
}

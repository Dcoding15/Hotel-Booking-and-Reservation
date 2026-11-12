import { useEffect, useMemo, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { addDays, errMsg, fmtDate, money, nightsBetween, parseYmd, ymd } from '../utils.js';
import AuthModal from './AuthModal.jsx';

export default function BookingModal({ room, hotel, onClose }) {
  const { user } = useAuth();
  const [booked, setBooked] = useState([]);
  const [range, setRange] = useState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [calendarMonths, setCalendarMonths] = useState(() => window.innerWidth >= 760 ? 2 : 1);

  const loadBooked = () =>
    api
      .get(`/rooms/${room._id}/booked`)
      .then((r) => setBooked(r.data))
      .catch((e) => setError(errMsg(e)));

  useEffect(() => {
    loadBooked();
  }, [room._id]);

  useEffect(() => {
    const resize = () => setCalendarMonths(window.innerWidth >= 760 ? 2 : 1);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Booked nights are check-in through (check-out - 1 day); check-out day is free for check-in
  const disabled = useMemo(
    () => [
      { before: today },
      ...booked.map((b) => ({
        from: parseYmd(b.checkIn),
        to: addDays(parseYmd(b.checkOut), -1),
      })),
    ],
    [booked, today],
  );

  const nights = range?.from && range?.to ? nightsBetween(range.from, range.to) : 0;
  const total = nights * room.pricePerNightCents;
  const tooLong = nights > 30;

  const hasOverlap = useMemo(() => {
    if (!range?.from || !range?.to || nights < 1) return false;
    const start = range.from;
    const end = range.to;
    return booked.some((b) => {
      const bIn = parseYmd(b.checkIn);
      const bOut = parseYmd(b.checkOut);
      return bIn < end && bOut > start;
    });
  }, [range, booked, nights]);

  async function book() {
    if (nights < 1 || tooLong || hasOverlap) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/me/bookings', {
        roomId: room._id,
        checkIn: ymd(range.from),
        checkOut: ymd(range.to),
      });
      setDone(data.booking);
      loadBooked();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overlay" onClick={onClose}>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Book ${room.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="close link" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <h2>{room.name}</h2>
          <p className="muted">
            {hotel.name} · {money(room.pricePerNightCents)} per night · sleeps {room.capacity}
          </p>

          {done ? (
            <div className="notice">
              <h3>Booking saved — payment pending</h3>
              <p>
                {fmtDate(done.checkIn)} to {fmtDate(done.checkOut)} ({done.nights} {done.nights === 1 ? 'night' : 'nights'}).
              </p>
              <p>{money(done.totalCents)} is due. Complete payment from My bookings within 15 minutes to keep these dates reserved.</p>
              <div className="row" style={{ marginTop: '1rem' }}>
                <a href="/bookings" className="btn ghost" style={{ textDecoration: 'none' }}>
                  Go to My bookings to pay
                </a>
                <button className="btn" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <DayPicker
                className="booking-calendar"
                mode="range"
                selected={range}
                onSelect={(selected) => {
                  setRange(selected);
                }}
                disabled={disabled}
                excludeDisabled
                startMonth={today}
                numberOfMonths={calendarMonths}
              />
              <div className="summary">
                {nights > 0 ? (
                  <>
                    <p>
                      {fmtDate(range.from)} → {fmtDate(range.to)}
                    </p>
                    <p>
                      {nights} {nights === 1 ? 'night' : 'nights'} × {money(room.pricePerNightCents)}
                    </p>
                    <p className="total">Total {money(total)}</p>
                  </>
                ) : (
                  <p className="muted">Select a check-in day, then a check-out day. Greyed days are taken.</p>
                )}
              </div>

              {hasOverlap && <p className="error">Selected range overlaps with unavailable dates.</p>}
              {tooLong && <p className="error">Maximum booking length is 30 nights.</p>}
              {error && <p className="error">{error}</p>}

              {!user && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' }}>
                  <p className="muted" style={{ margin: 0 }}>
                    Sign in or create an account to book this room.
                  </p>
                  <button type="button" className="btn" onClick={() => setAuthOpen(true)}>
                    Sign in / Register
                  </button>
                </div>
              )}
              {user?.role === 'admin' && <p className="muted">Staff accounts cannot book rooms.</p>}
              {user?.role === 'customer' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    className="btn"
                    disabled={busy || nights < 1 || hasOverlap || tooLong}
                    onClick={book}
                  >
                    {busy ? 'Saving booking…' : nights > 0 ? `Book these dates · ${money(total)}` : 'Pick your dates'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </>
  );
}

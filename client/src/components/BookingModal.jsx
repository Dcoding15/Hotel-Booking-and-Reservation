import { useEffect, useMemo, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { addDays, errMsg, fmtDate, money, nightsBetween, parseYmd, ymd } from '../utils.js';
import AuthModal from './AuthModal.jsx';

let checkoutScriptPromise;

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => window.Razorpay ? resolve() : reject(new Error('Razorpay Checkout could not be loaded.'));
      script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
      document.body.appendChild(script);
    }).catch((error) => {
      checkoutScriptPromise = null;
      throw error;
    });
  }
  return checkoutScriptPromise;
}

export default function BookingModal({ room, hotel, onClose }) {
  const { user } = useAuth();
  const [booked, setBooked] = useState([]);
  const [range, setRange] = useState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
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
    let checkoutLaunched = false;
    try {
      let checkout = paymentOrder;
      if (!checkout) {
        const { data } = await api.post('/me/bookings/orders', {
          roomId: room._id,
          checkIn: ymd(range.from),
          checkOut: ymd(range.to),
        });
        checkout = data;
        setPaymentOrder(data);
      }

      await loadRazorpayCheckout();
      let verificationInProgress = false;
      const razorpay = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.order.amount,
        currency: checkout.order.currency,
        name: 'Roomkey',
        description: `${hotel.name} · ${room.name}`,
        order_id: checkout.order.id,
        timeout: 900,
        prefill: { name: user.name, email: user.email },
        theme: { color: '#1f6b65' },
        modal: { ondismiss: () => { if (!verificationInProgress) setBusy(false); } },
        handler: async (response) => {
          verificationInProgress = true;
          setBusy(true);
          setError('');
          try {
            const { data } = await api.post(`/me/bookings/${checkout.booking._id}/verify`, response);
            setDone(data.booking);
            setPaymentOrder(null);
            loadBooked();
          } catch (verificationError) {
            setError(errMsg(verificationError));
            loadBooked();
          } finally {
            verificationInProgress = false;
            setBusy(false);
          }
        },
      });
      razorpay.on('payment.failed', (response) => {
        setError(response.error?.description || 'Payment failed. You can try again.');
      });
      razorpay.open();
      checkoutLaunched = true;
    } catch (e) {
      setError(e.response ? errMsg(e) : e.message);
      loadBooked();
    } finally {
      if (!checkoutLaunched) setBusy(false);
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
              <h3>Booking confirmed!</h3>
              <p>
                {fmtDate(done.checkIn)} to {fmtDate(done.checkOut)} ({done.nights} {done.nights === 1 ? 'night' : 'nights'}).
              </p>
              <p>{money(done.totalCents)} was paid with Razorpay.</p>
              <div className="row" style={{ marginTop: '1rem' }}>
                <a href="/bookings" className="btn ghost" style={{ textDecoration: 'none' }}>
                  View in My bookings
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
                  setPaymentOrder(null);
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
                    {busy ? 'Opening Razorpay…' : paymentOrder ? 'Retry Razorpay payment' : nights > 0 ? `Pay ${money(total)} with Razorpay` : 'Pick your dates'}
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

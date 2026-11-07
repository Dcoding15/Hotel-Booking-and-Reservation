import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { daysUntil, errMsg, fmtDate, money } from '../utils.js';

export default function Bookings() {
  const { setBalance } = useAuth();
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => api.get('/me/bookings').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  async function cancel(b) {
    if (!window.confirm(`Cancel ${b.room?.name}? ${money(b.totalCents)} will go back to your wallet.`)) return;
    setMsg('');
    try {
      const { data } = await api.post(`/me/bookings/${b._id}/cancel`);
      setBalance(data.walletBalance);
      setMsg(`Cancelled. ${money(data.booking.refundCents)} was returned to your wallet.`);
      load();
    } catch (e) { setMsg(errMsg(e)); }
  }

  if (!rows) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1>My bookings</h1>
      {msg && <p className="notice">{msg}</p>}
      {rows.length === 0 && <p className="muted">You haven’t booked anything yet. Pick a hotel on the homepage.</p>}
      <ul className="ledger">
        {rows.map((b) => {
          const daysUntilCheckIn = daysUntil(b.checkIn);
          return (
            <li key={b._id} className="booking">
              <span>
                <strong>{b.hotel?.name}</strong> · {b.room?.name}<br />
                <small className="muted">{fmtDate(b.checkIn)} to {fmtDate(b.checkOut)} · {b.nights} nights</small>
              </span>
              <span>{money(b.totalCents)}<br /><small className={b.status === 'cancelled' ? 'neg' : 'pos'}>{b.status === 'cancelled' ? `Cancelled, ${money(b.refundCents)} refunded` : 'Confirmed'}</small></span>
              {b.status === 'confirmed' && daysUntilCheckIn > 7
                ? <button className="btn ghost" onClick={() => cancel(b)}>Cancel</button>
                : b.status === 'confirmed' && daysUntilCheckIn >= 0
                  ? <small className="muted">Cancellation unavailable within 7 days of check-in.</small>
                  : <span />}
            </li>
          );
        })}
      </ul>
    </>
  );
}

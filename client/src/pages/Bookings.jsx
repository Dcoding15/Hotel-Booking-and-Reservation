import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { daysUntil, errMsg, fmtDate, money } from '../utils.js';

export default function Bookings() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => api.get('/me/bookings').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  async function cancel(b) {
    if (b.status === 'confirmed' && !window.confirm(`Cancel ${b.room?.name}? A full refund of ${money(b.totalCents)} will be requested from Razorpay.`)) return;
    setMsg('');
    try {
      const { data } = await api.post(`/me/bookings/${b._id}/cancel`);
      setMsg(data.booking.refundStatus === 'failed'
        ? 'The booking was cancelled, but Razorpay could not complete the refund. Please contact support.'
        : data.booking.status === 'refund_pending'
          ? 'Your refund request is still being processed. Try again shortly or contact support.'
          : `Cancelled. A ${money(data.booking.refundCents)} refund was requested from Razorpay.`);
      load();
    } catch (e) {
      setMsg(errMsg(e));
      load();
    }
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
          const paymentExpired = b.status === 'pending'
            && b.paymentExpiresAt
            && Date.parse(b.paymentExpiresAt) <= Date.now();
          let statusLabel = 'Confirmed · paid with Razorpay';
          if (b.status === 'pending') {
            statusLabel = paymentExpired ? 'Payment session expired; contact support if charged' : 'Payment pending';
          } else if (b.status === 'refund_pending') {
            statusLabel = 'Refund request pending';
          } else if (b.status === 'cancelled') {
            statusLabel = b.refundStatus === 'none'
              ? 'Cancelled'
              : b.refundStatus === 'failed' ? 'Cancelled; refund failed' : `Cancelled; refund ${b.refundStatus}`;
          }
          return (
            <li key={b._id} className="booking">
              <span>
                <strong>{b.hotel?.name}</strong> · {b.room?.name}<br />
                <small className="muted">{fmtDate(b.checkIn)} to {fmtDate(b.checkOut)} · {b.nights} nights</small>
              </span>
              <span>{money(b.totalCents)}<br /><small className={b.status === 'cancelled' && b.refundStatus === 'failed' ? 'neg' : 'pos'}>
                {statusLabel}
              </small></span>
              {b.status === 'confirmed' && daysUntilCheckIn > 7
                ? <button className="btn ghost" onClick={() => cancel(b)}>Cancel</button>
                : b.status === 'confirmed' && daysUntilCheckIn >= 0
                  ? <small className="muted">Cancellation unavailable within 7 days of check-in.</small>
                  : b.status === 'refund_pending'
                    ? <button className="btn ghost" onClick={() => cancel(b)}>Check refund</button>
                  : <span />}
            </li>
          );
        })}
      </ul>
    </>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { errMsg, fmtDate, money } from '../utils.js';

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

export default function Bookings() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState('');
  const [checkingId, setCheckingId] = useState(null);
  const [payingId, setPayingId] = useState(null);

  const load = () => api.get('/me/bookings').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  async function payBooking(b) {
    if (payingId) return;
    setPayingId(b._id);
    setMsg('');
    let checkoutLaunched = false;
    try {
      const { data: checkout } = await api.post(`/me/bookings/${b._id}/order`);
      await loadRazorpayCheckout();
      let verificationInProgress = false;
      const razorpay = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.order.amount,
        currency: checkout.order.currency,
        name: 'Roomkey',
        description: `${b.hotel?.name} · ${b.room?.name}`,
        order_id: checkout.order.id,
        timeout: 900,
        prefill: { name: user.name, email: user.email },
        theme: { color: '#1f6b65' },
        modal: { ondismiss: () => { if (!verificationInProgress) setPayingId(null); } },
        handler: async (response) => {
          verificationInProgress = true;
          setMsg('');
          try {
            await api.post(`/me/bookings/${b._id}/verify`, response);
            setMsg('Payment confirmed. Your booking is confirmed.');
          } catch (verificationError) {
            try {
              const { data } = await api.post(`/me/bookings/${b._id}/check-payment`);
              setMsg(data.booking.status === 'confirmed'
                ? 'Payment confirmed. Your booking is confirmed.'
                : `${errMsg(verificationError)} If you were charged, use Check payment in My bookings.`);
            } catch (reconcileError) {
              setMsg(`${errMsg(reconcileError)} If you were charged, retry Check payment in My bookings.`);
            }
          } finally {
            verificationInProgress = false;
            setPayingId(null);
            load();
          }
        },
      });
      razorpay.on('payment.failed', (response) => {
        setMsg(response.error?.description || 'Payment failed. You can try again from My bookings.');
      });
      razorpay.open();
      checkoutLaunched = true;
    } catch (e) {
      setMsg(e.response ? errMsg(e) : e.message);
      load();
    } finally {
      if (!checkoutLaunched) setPayingId(null);
    }
  }

  async function checkPayment(b) {
    setCheckingId(b._id);
    setMsg('');
    try {
      const { data } = await api.post(`/me/bookings/${b._id}/check-payment`);
      setMsg(data.booking.status === 'confirmed'
        ? 'Payment confirmed. Your booking is confirmed.'
        : data.booking.status === 'cancelled' && data.booking.refundStatus !== 'none'
          ? `Payment was received after cancellation. Refund status: ${data.booking.refundStatus}.`
          : data.booking.status === 'cancelled'
            ? 'No captured payment was found. The reservation remains cancelled.'
            : 'Razorpay has not confirmed this payment yet. If you were charged, try again shortly.');
      await load();
    } catch (e) {
      setMsg(errMsg(e));
      load();
    } finally {
      setCheckingId(null);
    }
  }

  async function cancel(b) {
    if (b.status === 'pending'
      && !window.confirm(`Cancel this unpaid reservation for ${b.room?.name}? If payment was already captured, the system will request a refund.`)) return;
    setMsg('');
    try {
      const { data } = await api.post(`/me/bookings/${b._id}/cancel`);
      setMsg(data.booking.status === 'cancelled' && data.booking.refundStatus === 'none'
        ? 'Reservation cancelled before payment.'
        : data.booking.refundStatus === 'failed'
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
          const paymentExpired = b.status === 'pending'
            && b.paymentExpiresAt
            && Date.parse(b.paymentExpiresAt) <= Date.now();
          let statusLabel = 'Confirmed · paid with Razorpay';
          if (b.status === 'pending') {
            statusLabel = paymentExpired ? 'Payment session expired; check status if charged' : 'Payment pending';
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
              {b.status === 'confirmed'
                ? <small className="muted">Paid bookings can only be cancelled by an admin.</small>
                  : b.status === 'refund_pending'
                    ? <button className="btn ghost" onClick={() => cancel(b)}>Check refund</button>
                    : b.status === 'pending'
                      ? <div className="row">
                        <button className="btn" disabled={Boolean(payingId) || paymentExpired} onClick={() => payBooking(b)}>
                          {payingId === b._id ? 'Opening Razorpay…' : paymentExpired ? 'Hold expired' : 'Pay with Razorpay'}
                        </button>
                        {b.hasPaymentOrder && <button className="btn ghost" disabled={checkingId === b._id || Boolean(payingId)} onClick={() => checkPayment(b)}>
                          {checkingId === b._id ? 'Checking…' : 'Check payment'}
                        </button>}
                        <button className="btn ghost" onClick={() => cancel(b)}>Cancel reservation</button>
                      </div>
                      : b.status === 'cancelled' && b.hasPaymentOrder && b.refundStatus === 'none'
                        ? <button className="btn ghost" disabled={checkingId === b._id} onClick={() => checkPayment(b)}>
                          {checkingId === b._id ? 'Checking…' : 'Check payment'}
                        </button>
                  : <span />}
            </li>
          );
        })}
      </ul>
    </>
  );
}

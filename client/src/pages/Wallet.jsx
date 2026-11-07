import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { errMsg, money } from '../utils.js';

const LABEL = {
  topup: 'Approved top-up',
  booking: 'Booking payment',
  refund: 'Refund',
  admin_adjustment: 'Admin wallet adjustment',
};

export default function Wallet() {
  const { user, setBalance } = useAuth();
  const [txs, setTxs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [custom, setCustom] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () =>
    api
      .get('/me/wallet')
      .then((r) => {
        setBalance(r.data.walletBalance);
        setTxs(r.data.transactions || []);
        setRequests(r.data.requests || []);
        setWalletLoaded(true);
      })
      .catch((e) => {
        setMsg(errMsg(e));
        setWalletLoaded(true);
      });

  useEffect(() => {
    load();
    const refresh = window.setInterval(load, 10000);
    return () => window.clearInterval(refresh);
  }, []);

  const hasPendingRequest = requests.some((request) => request.status === 'pending');

  async function add(dollars) {
    if (!dollars || dollars < 1 || dollars > 1000) {
      setMsg('Top-up must be between $1 and $1,000.');
      return;
    }
    if (hasPendingRequest) return;
    setMsg('');
    setLoading(true);
    try {
      const { data } = await api.post('/me/wallet/topup', {
        amountCents: Math.round(dollars * 100),
      });
      setRequests((current) => [data.request, ...current]);
      setCustom('');
      setMsg('Top-up request sent. Your wallet will be credited after an admin approves it.');
    } catch (e) {
      setMsg(errMsg(e));
      if (e.response?.status === 409) await load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Wallet</h1>
      <p className="big">{money(user?.walletBalance || 0)}</p>

      <section className="panel">
        <h3>Request wallet top-up</h3>
        <p className="muted small">
          Submit a request for $1–$1,000. An admin must approve it before funds are added to your wallet.
        </p>
        {hasPendingRequest && (
          <p className="notice" role="status">
            You already have a pending request. You can submit another after it is approved or rejected.
          </p>
        )}
        <div className="row">
          {[10, 50, 100, 500].map((v) => (
            <button key={v} className="btn ghost" disabled={loading || !walletLoaded || hasPendingRequest} onClick={() => add(v)}>
              + ${v}
            </button>
          ))}
          <input
            type="number"
            min="1"
            max="1000"
            step="1"
            placeholder="Custom ($1–$1,000)"
            value={custom}
            disabled={!walletLoaded || hasPendingRequest}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button
            className="btn"
            disabled={loading || !walletLoaded || hasPendingRequest || !custom || Number(custom) < 1 || Number(custom) > 1000}
            onClick={() => add(Number(custom))}
          >
            {loading ? 'Submitting…' : hasPendingRequest ? 'Request pending' : `Request $${custom || 0}`}
          </button>
        </div>
        {msg && <p className={msg.startsWith('Top-up request sent') ? 'pos' : 'error'} style={{ marginTop: '0.6rem' }}>{msg}</p>}
      </section>

      <h3>Top-up requests</h3>
      {requests.length === 0 && <p className="muted">No top-up requests yet.</p>}
      <ul className="ledger">
        {requests.map((request) => (
          <li key={request._id}>
            <span>
              <strong>{money(request.amountCents)}</strong>
              <small className="muted"> · {new Date(request.createdAt).toLocaleString()}</small>
            </span>
            <span className={request.status === 'approved' ? 'pos' : request.status === 'rejected' ? 'neg' : 'muted'}>
              {request.status}
            </span>
          </li>
        ))}
      </ul>

      <h3>Transaction history</h3>
      {txs.length === 0 && <p className="muted">No activity yet. Add funds or make a booking to see ledger activity.</p>}
      <ul className="ledger">
        {txs.map((t) => (
          <li key={t._id}>
            <span>
              <strong>{LABEL[t.type] || t.type}</strong>
              <small className="muted"> · {new Date(t.createdAt).toLocaleString()}</small>
            </span>
            <span className={t.amountCents < 0 ? 'neg' : 'pos'}>
              {t.amountCents < 0 ? '−' : '+'}
              {money(Math.abs(t.amountCents))}
            </span>
            <span className="muted small">Balance: {money(t.balanceAfter)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

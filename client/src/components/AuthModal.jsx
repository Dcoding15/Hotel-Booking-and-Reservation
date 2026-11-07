import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { errMsg } from '../utils.js';

export default function AuthModal({ onClose, onDone }) {
  const { signIn } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister
        ? { name: form.name, email: form.email, password: form.password }
        : { email: form.email, password: form.password };

      const { data } = await api.post(endpoint, payload);
      signIn(data.token, data.user);
      onDone?.(data.user);
      onClose?.();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '420px', padding: '1.75rem' }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close link" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h2>{isRegister ? 'Create an account' : 'Sign in to Roomkey'}</h2>
        <p className="muted small" style={{ marginBottom: '1.25rem' }}>
          {isRegister
            ? 'Sign up to book rooms and manage your bookings.'
            : 'Enter your email and password to access your bookings and wallet.'}
        </p>

        <form onSubmit={submit} style={{ display: 'grid', gap: '0.9rem' }}>
          {isRegister && (
            <label>
              Full name
              <input
                type="text"
                required
                placeholder="Jane Doe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              required
              placeholder="jane@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              placeholder="At least 6 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>

          {error && <p className="error" style={{ margin: '0.2rem 0' }}>{error}</p>}

          <button className="btn" disabled={busy} style={{ width: '100%', marginTop: '0.5rem' }}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--line)', paddingTop: '1rem', textAlign: 'center' }}>
          <p className="small muted" style={{ margin: 0 }}>
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              className="link"
              style={{ fontWeight: 600, color: 'var(--sea)' }}
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
            >
              {isRegister ? 'Sign in instead' : 'Create an account'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

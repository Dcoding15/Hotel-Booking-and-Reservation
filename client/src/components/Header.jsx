import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import AuthModal from './AuthModal.jsx';

export default function Header() {
  const { user, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <header className="bar">
        <Link to="/" className="brand">Roomkey</Link>
        <nav>
          {user?.role === 'customer' && (
            <NavLink to="/bookings" style={{textDecoration: "none"}}>My bookings</NavLink>
          )}
          {user?.role === 'admin' && <NavLink to="/admin">Support desk</NavLink>}
          {user ? (
            <button className="link" onClick={signOut} style={{textDecoration: "none"}}>Sign out ({user.name || user.email})</button>
          ) : (
            <button
              type="button"
              className="btn ghost"
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', padding: '0.4rem 0.85rem' }}
              onClick={() => setAuthOpen(true)}
            >
              Sign in / Register
            </button>
          )}
        </nav>
      </header>

      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onDone={(signedInUser) => {
            if (signedInUser.role === 'admin') navigate('/admin');
          }}
        />
      )}
    </>
  );
}

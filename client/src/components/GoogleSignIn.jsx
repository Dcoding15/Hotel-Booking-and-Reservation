import { useState } from 'react';
import AuthModal from './AuthModal.jsx';

export default function SimpleSignInButton({ onDone }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}
        onClick={() => setOpen(true)}
      >
        Sign in
      </button>

      {open && (
        <AuthModal
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onDone?.();
          }}
        />
      )}
    </>
  );
}

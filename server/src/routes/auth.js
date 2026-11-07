import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { mapUser, newId, pool, withTransaction } from '../db.js';
import { auth, signToken } from '../middleware.js';
import { HttpError } from '../utils.js';

const router = Router();
export const publicUser = (u) => ({
  id: u.id,
  role: u.role,
  email: u.email,
  name: u.name,
  picture: u.picture,
  walletBalance: u.walletBalance,
});

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  const cleanEmail = String(email || '').toLowerCase().trim();
  const cleanPassword = String(password || '');
  const cleanName = String(name || '').trim();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new HttpError(400, 'Please enter a valid email address');
  }
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new HttpError(400, 'Password must be at least 6 characters');
  }
  if (!cleanName) throw new HttpError(400, 'Please provide your name');

  const id = newId();
  const initialBalanceCents = 100_000;
  const passwordHash = await bcrypt.hash(cleanPassword, 10);
  let user;
  try {
    user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (id, role, email, name, picture, password_hash, wallet_balance)
         VALUES ($1, 'customer', $2, $3, $4, $5, $6) RETURNING *`,
        [id, cleanEmail, cleanName, `https://picsum.photos/seed/${encodeURIComponent(cleanEmail)}/100/100`, passwordHash, initialBalanceCents],
      );
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount_cents, balance_after)
         VALUES ($1, $2, 'topup', $3, $3)`,
        [newId(), id, initialBalanceCents],
      );
      return mapUser(rows[0]);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'An account with this email already exists. Please sign in.');
    }
    throw error;
  }

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

async function login(email, password) {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [String(email || '').toLowerCase().trim()],
  );
  const user = mapUser(result.rows[0]);
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    throw new HttpError(401, 'Wrong email or password');
  }
  return user;
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!String(email || '').trim() || !String(password || '')) {
    throw new HttpError(400, 'Please provide email and password');
  }
  const user = await login(email, password);
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', auth(), async (req, res) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.auth.id]);
  const user = mapUser(result.rows[0]);
  if (!user) throw new HttpError(401, 'Please sign in');
  res.json({ user: publicUser(user) });
});

export default router;

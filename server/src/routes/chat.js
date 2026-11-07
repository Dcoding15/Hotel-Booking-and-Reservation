import { Router } from 'express';
import { mapChatMessage, pool } from '../db.js';
import { auth } from '../middleware.js';
import { HttpError } from '../utils.js';

const router = Router();
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

router.get('/me', auth('customer'), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM chat_messages WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.auth.id],
  );
  res.json(rows.reverse().map(mapChatMessage));
});

router.get('/threads', auth('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, u.name, u.email, u.picture FROM chat_threads t
     JOIN users u ON u.id = t.customer_id ORDER BY t.last_at DESC LIMIT 100`,
  );
  res.json(rows.map((row) => ({
    _id: row.customer_id,
    customer: { _id: row.customer_id, name: row.name, email: row.email, picture: row.picture },
    lastMessage: row.last_message,
    lastAt: row.last_at,
    unreadForAdmin: row.unread_for_admin,
  })));
});

router.get('/threads/:customerId', auth('admin'), async (req, res) => {
  if (!isUuid(req.params.customerId)) throw new HttpError(400, 'Invalid customer ID');
  const { rows } = await pool.query(
    'SELECT * FROM chat_messages WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 200',
    [req.params.customerId],
  );
  res.json(rows.reverse().map(mapChatMessage));
});

export default router;

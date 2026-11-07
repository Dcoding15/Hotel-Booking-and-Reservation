import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { pool, withTransaction } from './db.js';

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function initSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_URL } });

  io.use((socket, next) => {
    try {
      const payload = jwt.verify(String(socket.handshake.auth?.token || ''), process.env.JWT_SECRET);
      socket.user = { id: payload.sub, role: payload.role };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.user;
    socket.join(role === 'admin' ? 'admins' : `user:${id}`);

    socket.on('chat:send', async (payload = {}, ack) => {
      try {
        const { text, customerId } = payload || {};
        const body = String(text || '').trim().slice(0, 2000);
        const customer = role === 'admin' ? customerId : id;
        if (!body || !isUuid(customer)) {
          ack?.({ ok: false });
          return;
        }

        const message = await withTransaction(async (client) => {
          const { rows } = await client.query(
            `INSERT INTO chat_messages (id, customer_id, sender_id, sender_role, text)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [randomUUID(), customer, id, role, body],
          );
          await client.query(
            `INSERT INTO chat_threads (customer_id, last_message, last_at, unread_for_admin)
             VALUES ($1, $2, now(), $3)
             ON CONFLICT (customer_id) DO UPDATE SET
               last_message = EXCLUDED.last_message,
               last_at = EXCLUDED.last_at,
               unread_for_admin = CASE WHEN $4 = 'admin' THEN 0
                 ELSE chat_threads.unread_for_admin + 1 END`,
            [customer, body, role === 'admin' ? 0 : 1, role],
          );
          return {
            _id: rows[0].id,
            customer: rows[0].customer_id,
            sender: rows[0].sender_id,
            senderRole: rows[0].sender_role,
            text: rows[0].text,
            createdAt: rows[0].created_at,
          };
        });
        io.to(`user:${customer}`).to('admins').emit('chat:message', message);
        ack?.({ ok: true });
      } catch (error) {
        console.error('Could not save chat message:', error);
        ack?.({ ok: false });
      }
    });

    socket.on('chat:read', async (payload = {}) => {
      try {
        const { customerId } = payload || {};
        if (role === 'admin' && isUuid(customerId)) {
          await pool.query('UPDATE chat_threads SET unread_for_admin = 0 WHERE customer_id = $1', [customerId]);
        }
      } catch (error) {
        console.error('Could not mark chat thread as read:', error);
      }
    });
  });
  return io;
}

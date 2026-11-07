import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import customerRoutes from './routes/customer.js';
import adminRoutes from './routes/admin.js';
import chatRoutes from './routes/chat.js';
import { initSocket } from './socket.js';
import { initializeDatabase, pool } from './db.js';

for (const k of ['MONGO_URI', 'DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[k]) { console.error(`Missing ${k} in server/.env`); process.exit(1); }
}

await mongoose.connect(process.env.MONGO_URI);
await initializeDatabase();

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes);
app.use('/api/me', customerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);

app.use((err, _req, res, _next) => {
  const status = err.name === 'CastError' ? 400 : err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong' : err.message });
});

const server = http.createServer(app);
initSocket(server);
server.listen(process.env.PORT || 4000, () => console.log(`API on :${process.env.PORT || 4000}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await Promise.all([mongoose.disconnect(), pool.end()]);
    process.exit(0);
  });
}

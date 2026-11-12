import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      role text NOT NULL CHECK (role IN ('admin', 'customer')),
      email text NOT NULL UNIQUE,
      name text NOT NULL DEFAULT '',
      picture text,
      password_hash text NOT NULL,
      wallet_balance integer NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hotel_id text NOT NULL,
      room_id text NOT NULL,
      hotel_name text NOT NULL,
      hotel_city text,
      hotel_image text,
      room_name text NOT NULL,
      room_type text,
      check_in date NOT NULL,
      check_out date NOT NULL,
      nights integer NOT NULL CHECK (nights > 0),
      total_cents integer NOT NULL CHECK (total_cents >= 0),
      status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
      cancelled_at timestamptz,
      refund_cents integer NOT NULL DEFAULT 0,
      payment_order_id text,
      payment_id text,
      payment_expires_at timestamptz,
      refund_id text,
      refund_status text NOT NULL DEFAULT 'none',
      refund_idempotency_key text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('pending', 'confirmed', 'cancelled', 'refund_pending'));
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_order_id text;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_id text;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_id text;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none';
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_idempotency_key text;
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_refund_status_check;
    ALTER TABLE bookings ADD CONSTRAINT bookings_refund_status_check
      CHECK (refund_status IN ('none', 'initiating', 'pending', 'processed', 'failed'));
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_order_id_uq
      ON bookings (payment_order_id) WHERE payment_order_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_id_uq
      ON bookings (payment_id) WHERE payment_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_refund_idempotency_key_uq
      ON bookings (refund_idempotency_key) WHERE refund_idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS bookings_room_dates_idx ON bookings (room_id, status, check_in, check_out);
    CREATE INDEX IF NOT EXISTS bookings_user_created_idx ON bookings (user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type IN ('topup', 'booking', 'refund', 'admin_adjustment')),
      amount_cents integer NOT NULL,
      balance_after integer NOT NULL CHECK (balance_after >= 0),
      booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
      CHECK (type IN ('topup', 'booking', 'refund', 'admin_adjustment'));
    CREATE INDEX IF NOT EXISTS wallet_transactions_user_created_idx
      ON wallet_transactions (user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS wallet_topup_requests (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 100 AND 100000),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS wallet_topup_requests_status_created_idx
      ON wallet_topup_requests (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS wallet_topup_requests_user_created_idx
      ON wallet_topup_requests (user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS chat_threads (
      customer_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_message text,
      last_at timestamptz NOT NULL DEFAULT now(),
      unread_for_admin integer NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id uuid PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_role text NOT NULL CHECK (sender_role IN ('admin', 'customer')),
      text text NOT NULL CHECK (char_length(text) <= 2000),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS chat_messages_customer_created_idx
      ON chat_messages (customer_id, created_at DESC);
  `);
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const dateValue = (value) => value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);

export function mapUser(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    role: row.role,
    email: row.email,
    name: row.name,
    picture: row.picture,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBooking(row) {
  if (!row) return null;
  return {
    _id: row.id,
    user: row.user_id,
    hotel: row.hotel_id,
    room: row.room_id,
    hotelSnapshot: { name: row.hotel_name, city: row.hotel_city, image: row.hotel_image },
    roomSnapshot: { name: row.room_name, type: row.room_type },
    checkIn: dateValue(row.check_in),
    checkOut: dateValue(row.check_out),
    nights: row.nights,
    totalCents: row.total_cents,
    status: row.status,
    cancelledAt: row.cancelled_at,
    refundCents: row.refund_cents,
    paymentStatus: row.payment_id ? 'paid' : row.status === 'pending' ? 'pending' : 'unpaid',
    paymentExpiresAt: row.payment_expires_at,
    refundStatus: row.refund_status || 'none',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapChatMessage(row) {
  return {
    _id: row.id,
    customer: row.customer_id,
    sender: row.sender_id,
    senderRole: row.sender_role,
    text: row.text,
    createdAt: row.created_at,
  };
}

export const newId = () => randomUUID();

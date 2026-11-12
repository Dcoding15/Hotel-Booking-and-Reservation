# Roomkey — Hotel Booking and Reservation

Roomkey is a hotel discovery and booking web application. Customers can browse hotels, pay for room reservations with Razorpay, manage bookings, and contact support; administrators manage the catalog, user accounts, bookings, and support conversations.

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Roles and Access](#roles-and-access)
- [Database Overview](#database-overview)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Setup](#setup)
- [Running the Application](#running-the-application)
- [Demo Data](#demo-data)
- [Tests](#tests)
- [Payments and Important Notes](#payments-and-important-notes)

## Project Overview

The project has a React single-page client and a Node.js/Express API. Hotel and room catalog data is stored in MongoDB; users, bookings, and support conversations are stored in PostgreSQL. Redis can optionally cache catalog and availability responses.

## Features

- Search, filter, and sort hotels and rooms.
- View room details, capacity, nightly price, and booked dates.
- Register and sign in with email and password.
- Create pending reservations for available dates, then pay with Razorpay from My bookings; overlapping reservations are rejected.
- View reservations and cancel unpaid reservations.
- Admin tools for managing hotels, rooms, users, bookings, and support conversations; admins can cancel unpaid reservations and eligible paid bookings.
- Live customer support chat using Socket.IO.

## Technology Stack

| Area | Technology |
|---|---|
| Client | React 18, React Router, Vite |
| API | Node.js, Express 5 |
| Catalog | MongoDB with Mongoose |
| Accounts, bookings, and chat | PostgreSQL with `pg` |
| Payments and refunds | Razorpay Checkout and Node SDK |
| Optional cache | Redis with `ioredis` |
| Live support | Socket.IO |
| Authentication | JWT bearer tokens; passwords hashed with bcrypt |

## Architecture

1. The Vite-served React client displays the hotel catalog and customer/admin screens.
2. The client calls the Express API under `/api`; in development, Vite proxies these requests to `http://localhost:4000`. Socket.IO connections are proxied as well.
3. The API reads hotel and room records from MongoDB and stores users, booking/payment records, and chat data in PostgreSQL.
4. The API creates a pending reservation in PostgreSQL when the customer books dates. A Razorpay order is created server-side only when the customer chooses to pay from My bookings; the API confirms the booking only after signature and captured-payment checks. Redis, if configured, is only a cache; the application can run without it.

## Roles and Access

| Role | Access |
|---|---|
| Visitor | Browse hotels and rooms; register or sign in. |
| Customer | Create pending bookings, pay from My bookings using Razorpay, cancel unpaid reservations, and contact support. |
| Admin | Manage the catalog and user accounts, cancel unpaid reservations or eligible paid bookings, review reservations, and respond to support chats. |

Admin accounts are configured through the server seed settings, not public customer registration. API endpoints enforce role-based access.

## Database Overview

| Store | Data |
|---|---|
| MongoDB | Hotels and rooms, including descriptions, amenities, prices, and active status. |
| PostgreSQL | Users and roles; bookings, payment order IDs and refund state; chat threads and messages. Legacy wallet columns/tables are retained for existing database compatibility but are not used by the active payment flow. |
| Redis (optional) | Short-lived hotel, room, and booked-date response caches. |

Room prices and payment amounts are stored as integer paise (for example, `₹12.34` is `1234` paise). Existing catalog values are not automatically currency-converted; review and update them for INR before taking real payments.

## Project Structure

```text
client/
  src/
    components/       Shared UI such as the header, sign-in, booking, and chat
    pages/            Hotel search, hotel details, bookings, and admin
    App.jsx           Routes and role-protected pages
    api.js            HTTP and Socket.IO client setup
    auth.jsx          Client authentication state
    styles.css        Application styles
  package.json        Client commands and dependencies
server/
  src/
    models/           MongoDB hotel and room models
    routes/            Authentication, catalog, customer, admin, and chat APIs
    services/          Booking and Razorpay payment/refund logic
    db.js              PostgreSQL schema initialization and helpers
    index.js           API startup and route registration
    socket.js          Authenticated real-time support chat
    seed.js            Admin and starter catalog seed
  scripts/             Catalog seed and auxiliary test/development scripts
  package.json         Server commands and dependencies
```

## Requirements

- Node.js 20 or newer and npm.
- A MongoDB instance.
- A PostgreSQL database and a database user allowed to create tables and indexes.
- Razorpay account and API keys to accept bookings; test-mode keys are recommended for development.
- Redis is optional.

## Setup

### 1. Configure the server

Create `server/.env` with the required database URLs and a strong, private JWT secret. Use your own connection details:

```env
PORT=4000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://127.0.0.1:27017/roomkey
DATABASE_URL=postgresql://<username>:<password>@localhost:5432/roomkey
JWT_SECRET=<long-random-secret>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<strong-admin-password>
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=<your-test-key-secret>
REDIS_URL=redis://127.0.0.1:6379
```

`MONGO_URI`, `DATABASE_URL`, and `JWT_SECRET` are required to run the API. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are required by the seed command. `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are required to create payment orders and issue refunds, but not to start the API or browse the catalog. `PORT` defaults to `4000`; set `CLIENT_URL` to the client origin allowed by CORS. `REDIS_URL` is optional and may be omitted if Redis is not available.

Generate API keys from Razorpay Dashboard → **Account & Settings → API Keys** while in **Test Mode**. Replace placeholders with your own values in `server/.env`; never put the key secret in the client or commit/share it. The key ID is sent to Checkout by the server, while the key secret remains server-side. The server applies payment-schema changes to PostgreSQL when it starts.

### 2. Install dependencies

There is no `package.json` in the repository root, so `npm install` must be run from each app directory. From the repository root, run:

```bash
cd server
npm install
cd ../client
npm install
```

### 3. Seed the admin and starter catalog

From the `server` directory:

```bash
npm run seed
```

This creates or updates the admin account using `ADMIN_EMAIL` and `ADMIN_PASSWORD`. It inserts starter hotels and rooms only when the MongoDB catalog is empty.

## Running the Application

Start the API in one terminal:

```bash
cd server
npm run dev
```

Start the client in a second terminal:

```bash
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API health endpoint is [http://localhost:4000/api/health](http://localhost:4000/api/health).

Available package commands:

| Command | Directory | Description |
|---|---|---|
| `npm run dev` | `server` | Start the API with Node watch mode. |
| `npm start` | `server` | Start the API without watch mode. |
| `npm run seed` | `server` | Configure the admin and seed starter catalog data if empty. |
| `npm run seed:catalog` | `server` | Add the larger sample hotel catalog. |
| `npm run race-test` | `server` | Run the concurrent booking check. |
| `npm test` | `server` | Run focused Razorpay payment helper tests. |
| `npm run dev` | `client` | Start the Vite development server. |
| `npm run build` | `client` | Build the client into `client/dist`. |
| `npm run preview` | `client` | Preview the production client build. |

## Demo Data

The `server` seed command provisions an admin account from the environment settings and creates three sample hotels with rooms when the catalog is empty. To add the larger sample catalog, run this from `server`:

```bash
npm run seed:catalog
```

This command requires `MONGO_URI`. Do not use real customer information or production credentials for demo data.

## Tests

Run the focused payment tests with:

```bash
cd server
npm test
```

The database-backed concurrency check can also be run with:

```bash
npm run race-test
```

`npm test` checks Razorpay signature and amount/currency validation. The concurrency check creates temporary test users and a room in the configured databases, then checks that only one of 20 simultaneous date reservations succeeds. It does not contact Razorpay. Run it only against a disposable or development database. No lint command is defined.

## Payments and Important Notes

### Booking and payment flow

1. Select dates and choose **Book these dates**. The server creates a pending reservation; this step does not take payment.
2. Open **My bookings** and choose **Pay with Razorpay**. The server creates the Razorpay order and calculates the amount in INR paise.
3. Pay within the 15-minute reservation hold. The booking becomes confirmed only after the server verifies the signature and confirms the captured payment amount and currency with Razorpay.
4. If checkout verification is interrupted, choose **Check payment** in My bookings to reconcile the order directly with Razorpay.

- Booking totals are always calculated by the server from the selected room and dates.
- Customers can cancel unpaid reservations. The server checks Razorpay before accepting cancellation; if payment was already captured, it will not be treated as unpaid. A payment captured after cancellation triggers a refund request.
- Only admins can cancel paid bookings. Admin cancellation is available more than 7 days before check-in and requests a full Razorpay refund. Refunds can remain pending while the payment provider processes them; the booking pages display the refund status.
- Existing bookings without a Razorpay payment ID cannot be automatically refunded through the new flow; contact support before attempting to cancel them.
- Existing wallet data is retained in the database for compatibility, but wallet balances, top-ups, and wallet-based booking payments are no longer available in the application.
- The frontend includes no active Google sign-in flow; accounts use email and password.
- Keep database credentials, admin passwords, and `JWT_SECRET` private. For public deployment, use strong unique secrets, restrict database access, configure the correct `CLIENT_URL`, and serve the client over HTTPS.

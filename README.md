# Roomkey — Hotel Booking and Reservation

Roomkey is a hotel discovery and booking web application. Customers can browse hotels, book rooms using an in-app wallet, manage reservations, and contact support; administrators manage the catalog, users, wallet requests, and support conversations.

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

The project has a React single-page client and a Node.js/Express API. Hotel and room catalog data is stored in MongoDB; users, bookings, wallet activity, and support conversations are stored in PostgreSQL. Redis can optionally cache catalog and availability responses.

## Features

- Search, filter, and sort hotels and rooms.
- View room details, capacity, nightly price, and booked dates.
- Register and sign in with email and password.
- Book available dates using wallet balance; overlapping bookings are rejected.
- View reservations and cancel eligible future bookings for a full wallet refund.
- Request wallet top-ups and track requests and transactions.
- Admin tools for managing hotels, rooms, users, bookings, wallet balances, and top-up requests.
- Live customer support chat using Socket.IO.

## Technology Stack

| Area | Technology |
|---|---|
| Client | React 18, React Router, Vite |
| API | Node.js, Express 5 |
| Catalog | MongoDB with Mongoose |
| Accounts, bookings, wallet, and chat | PostgreSQL with `pg` |
| Optional cache | Redis with `ioredis` |
| Live support | Socket.IO |
| Authentication | JWT bearer tokens; passwords hashed with bcrypt |

## Architecture

1. The Vite-served React client displays the hotel catalog and customer/admin screens.
2. The client calls the Express API under `/api`; in development, Vite proxies these requests to `http://localhost:4000`. Socket.IO connections are proxied as well.
3. The API reads hotel and room records from MongoDB and stores users, bookings, wallet records, and chat data in PostgreSQL.
4. Booking validation and wallet debit are performed together in a PostgreSQL transaction. Redis, if configured, is only a cache; the application can run without it.

## Roles and Access

| Role | Access |
|---|---|
| Visitor | Browse hotels and rooms; register or sign in. |
| Customer | Book rooms, view and cancel eligible bookings, use the wallet, and contact support. |
| Admin | Manage the catalog and user accounts, review bookings, adjust wallets, approve/reject top-up requests, and respond to support chats. |

Admin accounts are configured through the server seed settings, not public customer registration. API endpoints enforce role-based access.

## Database Overview

| Store | Data |
|---|---|
| MongoDB | Hotels and rooms, including descriptions, amenities, prices, and active status. |
| PostgreSQL | Users and roles; bookings and cancellation/refund details; wallet balances, transactions, and top-up requests; chat threads and messages. |
| Redis (optional) | Short-lived hotel, room, and booked-date response caches. |

Wallet values and room prices are stored as integer cents (for example, `$12.34` is `1234` cents).

## Project Structure

```text
client/
  src/
    components/       Shared UI such as the header, sign-in, booking, and chat
    pages/            Hotel search, hotel details, bookings, wallet, and admin
    App.jsx           Routes and role-protected pages
    api.js            HTTP and Socket.IO client setup
    auth.jsx          Client authentication state
    styles.css        Application styles
  package.json        Client commands and dependencies
server/
  src/
    models/           MongoDB hotel and room models
    routes/            Authentication, catalog, customer, admin, and chat APIs
    services/          Booking and wallet business logic
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
REDIS_URL=redis://127.0.0.1:6379
```

`MONGO_URI`, `DATABASE_URL`, and `JWT_SECRET` are required to run the API. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are required by the seed command. `PORT` defaults to `4000`; set `CLIENT_URL` to the client origin allowed by CORS. `REDIS_URL` is optional and may be omitted if Redis is not available.

Replace placeholders with your own values; do not commit `.env` files or share secrets. The server initializes PostgreSQL tables when it starts.

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

The server package exposes one test command:

```bash
cd server
npm run race-test
```

The concurrency check creates temporary test users and a room in the configured databases, then checks that only one simultaneous booking for the same dates succeeds. It may target a running API at `API_URL` (default `http://localhost:4000/api`) or exercise the booking service directly. Run it only against a disposable or development database. The package manifests do not define `npm test` or lint commands.

## Payments and Important Notes

- The application does **not** integrate with a payment processor. There are no payment-gateway API keys or payment environment variables to configure.
- Wallet top-ups are requests for internal/demo credits: an admin must approve a request before the wallet is credited. This does not charge a card or transfer real money.
- New customer accounts receive a starting wallet balance of `$1,000` in app credit. Bookings debit the wallet; eligible cancellations refund it.
- The frontend includes no active Google sign-in flow; accounts use email and password.
- Keep database credentials, admin passwords, and `JWT_SECRET` private. For public deployment, use strong unique secrets, restrict database access, configure the correct `CLIENT_URL`, and serve the client over HTTPS.

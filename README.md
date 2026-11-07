# Roomkey: a beginner's guide

Roomkey is a website for finding hotels, choosing rooms, and booking a stay. It also has customer accounts and wallets, an admin area for managing the site, and a live support chat.

You do not need to know how to program to use this guide. It explains what a visitor can do, what happens behind the scenes, and where the related code lives.

> **About the line numbers:** Each code link opens the file at the line where that feature begins. Line numbers can move when the code is edited, so use the named file and feature as a second way to find it.

## What can people do on this website?

### Visitors and customers

- **Look for hotels:** Search by words such as a hotel name, city, description, or amenity. Filter by destination and nightly price, and sort the results. Start at the [hotel search page](./client/src/pages/Home.jsx#L5).
- **Look at a hotel's rooms:** Open a hotel to see its rooms. Search and filter by room type, guest capacity, and price. See the [hotel and room page](./client/src/pages/HotelPage.jsx#L7).
- **Choose dates and book:** The date calendar shows nights that are already booked. A signed-in customer can pay with their Roomkey wallet. The calendar and booking window are in [BookingModal.jsx](./client/src/components/BookingModal.jsx#L9).
- **Create an account or sign in:** Customers register with their name, email, and password. New customer accounts start with **$1,000** in wallet credit. The form is in [AuthModal.jsx](./client/src/components/AuthModal.jsx#L6); account creation and sign-in are handled by [the authentication API](./server/src/routes/auth.js#L17).
- **See and cancel bookings:** Customers can see their reservations. A confirmed booking can be cancelled only when check-in is more than seven days away; cancellation returns the full amount to the wallet. See the [bookings page](./client/src/pages/Bookings.jsx#L6) and the server's [cancellation rules](./server/src/services/bookingService.js#L79).
- **Use the wallet:** Customers can view their balance and past transactions, and request a top-up of $1–$1,000. A top-up request does not add money until an admin approves it. See the [wallet page](./client/src/pages/Wallet.jsx#L13).
- **Contact support:** Signed-in customers can send messages in the support chat. Messages appear live for staff. See the [customer chat widget](./client/src/components/ChatWidget.jsx#L5).

### Admins

An admin signs in using the admin account configured for the server. Admin features are protected: a regular customer cannot open the admin page.

The admin area can manage hotels and rooms, manage user accounts, review bookings, adjust wallets, approve or reject top-up requests, and answer support conversations. Its main interface is [AdminDashboard.jsx](./client/src/pages/AdminDashboard.jsx#L7). The live conversation area is [AdminSupport.jsx](./client/src/pages/AdminSupport.jsx#L4). The server checks admin access and performs the requested changes in [admin.js](./server/src/routes/admin.js#L11).

## How a website action works

Think of Roomkey as three parts passing a request along:

1. **The page in your browser** displays buttons, forms, hotels, and results. For example, the hotel search page is React code.
2. **The API (the server)** receives requests from the page. It checks information such as the user's permissions, dates, and wallet balance.
3. **The databases** store the information so it is still there after you close the browser.

For example, when a customer books a room:

1. The customer chooses a room and dates in the browser.
2. The browser sends the room and dates to the booking API.
3. The server checks availability and the customer's wallet.
4. If the booking is valid, the server saves the booking and subtracts the cost from the wallet together.
5. The browser shows the confirmation and updated balance.

The browser's booking window is in [BookingModal.jsx](./client/src/components/BookingModal.jsx#L69). The API endpoint is in [customer.js](./server/src/routes/customer.js#L10), and the rules that create a booking are in [bookingService.js](./server/src/services/bookingService.js#L12).

## Where to find things in the code

The numbers below refer to the current version of the project. A line number is a starting point, not a promise that all of a feature fits on one line.

| If you want to understand… | Start here | What you will find |
|---|---|---|
| How the website starts | [client/src/main.jsx, line 8](./client/src/main.jsx#L8) | Connects the page to React Router, login state, and the website's main screen. |
| Which page appears at each web address | [client/src/App.jsx, line 23](./client/src/App.jsx#L23) | Maps `/` to hotels, `/hotels/...` to a hotel's rooms, `/wallet` and `/bookings` to customer pages, and `/admin` to the admin page. |
| How pages are protected by account type | [client/src/App.jsx, line 11](./client/src/App.jsx#L11) | Sends people who are not signed in, or have the wrong account type, away from protected pages. |
| The top navigation and sign-in button | [client/src/components/Header.jsx, line 7](./client/src/components/Header.jsx#L7) | Shows navigation, the wallet balance, sign-in, and sign-out controls. |
| The hotel's search and filter controls | [client/src/pages/Home.jsx, line 18](./client/src/pages/Home.jsx#L18) | Filters and sorts the hotel list shown on the homepage. |
| The room search and filter controls | [client/src/pages/HotelPage.jsx, line 23](./client/src/pages/HotelPage.jsx#L23) | Filters and sorts rooms for the selected hotel. |
| The date calendar and booking button | [client/src/components/BookingModal.jsx, line 42](./client/src/components/BookingModal.jsx#L42) | Marks booked dates unavailable, calculates the price, and sends a booking request. |
| The rules for taking payment and booking | [server/src/services/bookingService.js, line 12](./server/src/services/bookingService.js#L12) | Checks dates, room availability, and wallet balance before saving a booking. |
| The customer's booking list and cancel button | [client/src/pages/Bookings.jsx, line 14](./client/src/pages/Bookings.jsx#L14) | Loads reservations and asks the server to cancel an eligible booking. |
| The wallet and top-up request form | [client/src/pages/Wallet.jsx, line 44](./client/src/pages/Wallet.jsx#L44) | Checks the requested amount and sends a top-up request. |
| What the server does with a top-up request | [server/src/routes/customer.js, line 60](./server/src/routes/customer.js#L60) | Checks the amount and prevents a customer from having multiple pending requests. |
| Admin approval of a top-up | [server/src/routes/admin.js, line 43](./server/src/routes/admin.js#L43) | Approves or rejects a request; approval adds money to the customer's wallet. |
| The admin screens and tools | [client/src/pages/AdminDashboard.jsx, line 7](./client/src/pages/AdminDashboard.jsx#L7) | The tabs and actions for hotels, rooms, users, bookings, top-up requests, and support. |
| The live customer support conversation | [client/src/pages/AdminSupport.jsx, line 4](./client/src/pages/AdminSupport.jsx#L4) | Shows incoming conversations and lets an admin reply. |
| The customer support chat button | [client/src/components/ChatWidget.jsx, line 5](./client/src/components/ChatWidget.jsx#L5) | Shows the support chat to signed-in customers. |
| Shared colours, layout, and link appearance | [client/src/styles.css, line 1](./client/src/styles.css#L1) | CSS controls how the site looks, including its colours, buttons, links, and mobile layout. |
| The server's API routes | [server/src/index.js, line 27](./server/src/index.js#L27) | Connects web addresses such as `/api/auth` to the code that handles them. |
| The database tables and transactions | [server/src/db.js, line 7](./server/src/db.js#L7) | Creates the PostgreSQL tables used for accounts, bookings, wallets, and chat. |

## A few words you may see in the code

- **Frontend / client:** The part that runs in the browser and displays the website. It is in the `client` folder.
- **Backend / server / API:** The part that receives requests, checks rules, and reads or changes saved information. It is in the `server` folder.
- **Database:** A place where information is stored.
- **Route / endpoint:** A server address the browser can ask for, such as `/api/hotels`.
- **Component:** A reusable piece of a page, such as a navigation bar or booking window.
- **State:** Information the page remembers while it is open, such as the words typed into a search box.
- **Authentication:** Checking who a person is after they sign in.
- **Admin:** A staff account with permission to manage the site. Admin accounts are created from server configuration, not from the public customer registration form.

## Where Roomkey saves information

Roomkey uses different storage for different kinds of information:

- **MongoDB** stores the hotel and room catalog.
- **PostgreSQL** stores accounts, bookings, wallet balances and transactions, top-up requests, and support messages.
- **Redis is optional.** When configured, it temporarily caches some hotel and availability results to make repeated lookups faster. The app can work without it.

Prices and wallet amounts are stored as whole cents to avoid rounding problems. For example, `$12.34` is saved as `1234` cents.

## Run the website on your computer

This section is for someone setting up a local copy. You need Node.js 20 or newer, npm, a MongoDB database, and a PostgreSQL database. Redis is optional.

### 1. Prepare the databases

Create a MongoDB database and a PostgreSQL database. The PostgreSQL account must be allowed to create tables. The server creates the required PostgreSQL tables when it starts.

### 2. Add the server settings

Create a file named `server/.env` and add your own database addresses and secrets:

```env
PORT=4000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-host>/roomkey?retryWrites=true&w=majority
DATABASE_URL=postgresql://<username>:<password>@<host>:5432/roomkey
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=<a-long-random-secret>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<a-strong-admin-password>
```

Replace the text in angle brackets with your own values; do not copy it literally. `MONGO_URI`, `DATABASE_URL`, and `JWT_SECRET` are required. If you do not have Redis, remove the `REDIS_URL` line. Keep `server/.env` private: it contains passwords and secrets.

### 3. Set up and start the server

Open a terminal (a text-based window for entering commands), then run:

```bash
cd server
npm install
npm run seed
npm run dev
```

The seed command creates or updates the admin account and adds starter hotels if the catalog is empty. Keep this terminal open while using the website.

### 4. Set up and start the website

Open a **second** terminal window and run:

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. The server normally runs at port 4000, and the website forwards API requests to it. To check whether the server is responding, visit [http://localhost:4000/api/health](http://localhost:4000/api/health).

## Useful commands

Run each command from the folder shown:

| Command | Folder | What it does |
|---|---|---|
| `npm run dev` | `server` | Starts the API and automatically restarts it when server code changes. |
| `npm start` | `server` | Starts the API without watch mode. |
| `npm run seed` | `server` | Creates the admin account and starter hotels/rooms. |
| `npm run seed:catalog` | `server` | Adds a larger sample hotel catalog. |
| `npm run race-test` | `server` | Checks that two simultaneous booking attempts cannot reserve the same room and dates. |
| `npm run dev` | `client` | Starts the website for local development. |
| `npm run build` | `client` | Builds the website files for deployment into `client/dist`. |
| `npm run preview` | `client` | Opens a local preview of the production build. |

## Folder map

```text
client/                       The website shown in the browser
  src/
    App.jsx                   Website pages and page addresses
    auth.jsx                  Sign-in state shared by pages
    api.js                    How pages send requests to the server
    styles.css                Colours, layout, and appearance
    pages/                    Full pages: hotel search, rooms, wallet, admin
    components/               Reusable parts: header, forms, booking, chat
server/                       The API and database connection
  src/
    index.js                  Starts the API and connects its routes
    db.js                     PostgreSQL tables and database helpers
    routes/                   API actions for accounts, hotels, customers, admins, chat
    services/                 Rules shared by related API actions
  scripts/                    Setup, sample-data, and test scripts
```

## Safety for a real launch

Before putting this website on the public internet, use strong unique passwords and secrets, restrict database access, configure the correct website address in `CLIENT_URL`, and serve the site over HTTPS. Never publish `.env` files or real database credentials.

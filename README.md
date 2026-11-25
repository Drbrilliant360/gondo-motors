# Gondo Motors

Car marketplace for Tanzania with customer accounts, an admin panel, WhatsApp ordering and offline payment records.

- **Public site**: listings, car pages, search and filters, compare, FAQ, how to buy, contact, "Ask us to find your car".
- **Customer panel** (`/account/`): order list, "Order via WhatsApp", order tracking, receipts and invoices, saved cars and comparisons, enquiries, profile.
- **Admin panel** (`/admin/`): dashboard, vehicles, orders, clients, payments ledger, reports, enquiries, users, content, settings, activity log.

There is no payment gateway. Customers never pay on the site and no card or mobile-money details are collected. Payments happen offline and an admin records them afterwards.

## Stack

| Part | Choice |
| --- | --- |
| Database | Neon (serverless Postgres), `pg` driver, parameterised queries only |
| Server | Node.js 18+ and Express 5 (`server/`) |
| Pages | Template functions in `src/templates/`, rendered by Express from the database |
| Front end | Existing HTML/CSS and vanilla JS in `src/assets/` (no framework) |
| Files | Cloudinary: vehicle photos are public; payment proofs and order documents are private |
| Sessions | Stored in Postgres (`connect-pg-simple`), HttpOnly + SameSite cookies |
| Hosting | Vercel (`vercel.json`, `api/index.mjs`); also runs anywhere Node runs via `npm start` |

## Setup

### 1. Install

```
npm install
cp .env.example .env
```

### 2. Fill in `.env`

`.env` is git-ignored. Never commit it and never put these values in front-end code.

| Variable | What to put |
| --- | --- |
| `DATABASE_URL` | Neon dashboard → your project → **Connect** → enable **Connection pooling** → copy the string. The host contains `-pooler` and it ends with `sslmode=require`. |
| `SESSION_SECRET` | A long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first admin account, created by the seed script. Use a real email: password-reset links go there. |
| `SITE_URL` | `http://localhost:3000` locally; your real address in production (used in WhatsApp order links and reset emails). |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary console → **Settings → API Keys**. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional. Without them, password-reset links are printed in the server console instead of emailed. |

### 3. Create the database

```
npm run migrate        # creates the tables (safe to re-run; applies only new migrations)
npm run import:cars    # one-off: loads the existing listings from src/data/cars.json
npm run seed           # creates the default admin and default settings/content
```

All three are safe to run again: existing vehicles, the admin and settings are left untouched.

### 4. Run

```
npm run dev            # http://localhost:3000, restarts when server files change
```

### 5. First admin login

1. Open `/login.html` and log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.
2. You are sent to **Change your password** and cannot open the admin panel until you choose a new one.
3. After that the same login page sends admins to `/admin/` and customers to `/account/`.

More admin accounts can only be created from **Admin → Users → Create admin account**. Sign-up on the site always creates customer accounts.

## Deploying to Vercel

1. Import the repository in Vercel. `vercel.json` already sets the build command and routing.
2. In **Project → Settings → Environment Variables** add `DATABASE_URL`, `SESSION_SECRET`, `SITE_URL` (the production address), the three `CLOUDINARY_*` values, and the `SMTP_*` values if you use email.
3. Run `npm run migrate`, `npm run import:cars` and `npm run seed` once from your own machine against the production `DATABASE_URL`. Vercel does not run them for you.
4. Deploy.

How it runs there: static files in `src/assets/` are copied to `public/` and served by Vercel's CDN; every other request goes to the Express app as a serverless function (`api/index.mjs`). Photo and document uploads go straight from the browser to Cloudinary, so they are not limited by Vercel's request size.

To run on Render or any Node host instead: build command `npm install`, start command `npm start`, same environment variables.

## Local test database (optional)

To try things without touching Neon:

```
npm run db:local       # local Postgres (PGlite) on port 5433, data kept in .pgdata/
```

Then run the app with `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` and run the migrate, import and seed scripts against it the same way.

## How the main flows work

**Ordering.** A logged-in customer adds cars to their order list and taps *Order via WhatsApp*. The order is saved first with a reference such as `GM-2026-00042` and status *Pending*; then WhatsApp opens with a pre-filled message to the number in **Admin → Settings**. The customer can edit the WhatsApp text, so the saved order is the source of truth. Guests are sent to log in and brought back to their order list.

**Order lifecycle.** Pending → Confirmed → Bid won → Shipped → At port → Clearance → Ready for collection → Delivered, or Cancelled with a reason. Local stock skips the import steps. Confirming creates the client record and reserves the vehicles. Vehicle status follows the order automatically: Reserved on confirmation, Sold when fully paid or delivered, Available again if cancelled.

**Money.** All amounts are whole Tanzanian shillings stored as integers. Paid so far, balance due and payment status (Unpaid, Deposit paid, Partially paid, Fully paid) are calculated by the database view `order_totals`, never typed in. A payment above the balance needs an explicit overpayment confirmation. Payments cannot be edited or deleted (a database trigger enforces this); a wrong entry is voided with a reason and stays in the history. Each payment gets a receipt number such as `RC-2026-00017`.

**Access control.** Every admin and account page and every API route checks the role on the server. Customer queries are always filtered by the signed-in user's id, so another customer's order reference simply returns "not found".

**Private files.** Payment proofs and order documents are uploaded to Cloudinary as *authenticated* assets with no public address. The server checks who is asking and then redirects to a download link that expires after one minute.

## Project layout

```
api/index.mjs              Vercel entry point
migrations/                SQL migrations, applied in order by scripts/migrate.mjs
scripts/                   migrate, import-cars, seed, db-local, copy-assets (Vercel build)
server/
  app.mjs                  Express app: security headers, sessions, CSRF, routing
  db.mjs                   Postgres pool and transaction helper
  security.mjs             CSRF, role guards, validation
  catalog.mjs              Public catalogue read from the database (cached for 15 seconds)
  orders.mjs               Reference numbers, WhatsApp message, vehicle status rules
  cloudinary.mjs           Signed uploads and private downloads
  pdf.mjs                  Receipt and invoice PDFs
  routes/                  auth, site (public pages), account, admin-vehicles, admin-orders,
                           admin-sales (clients, manual sales, ledger, reports), admin-manage, documents, public
src/
  templates/               Page templates; templates/panel/ holds the shared panel shell and screens
  assets/css/main.css      Public site design system; panel.css adds the panel components
  assets/js/               main.js (site + shared UI), panel.js (dialogs, forms, tabs), page scripts
  data/                    Original listing data and default content, used by import and seed
build/build.mjs            Optional static snapshot of the public pages (npm run build); not used by the server
```

## Notes

- Existing listing photos are served from `src/assets/img/cars/`. Photos uploaded in the admin panel go to Cloudinary.
- Imported vehicles are all marked *Japan auction*; change the source per vehicle in the admin panel where needed.
- Vehicles without a price show as "Price on request" and can still be ordered; the admin sets the agreed price before confirming.
- Changes made in the admin panel appear on the public site within about 15 seconds on other server instances (immediately on the one that handled the change).

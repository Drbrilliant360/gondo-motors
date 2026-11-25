// Express app: serves the public site and the JSON API. Exported without listening so it also runs on Vercel.
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import helmet from 'helmet';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.mjs';
import { csrfProtect, loadUser, requireRole } from './security.mjs';
import { auth, logoutForm } from './routes/auth.mjs';
import { site, notFoundPage } from './routes/site.mjs';
import { adminVehicles } from './routes/admin-vehicles.mjs';
import { account } from './routes/account.mjs';
import { adminOrders } from './routes/admin-orders.mjs';
import { documents } from './routes/documents.mjs';
import { adminSales } from './routes/admin-sales.mjs';
import { adminManage } from './routes/admin-manage.mjs';
import { publicApi } from './routes/public.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'src/assets');
const prod = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be set to a long random string (see .env.example).');

export const app = express();
app.disable('x-powered-by');
if (prod) app.set('trust proxy', 1); // behind Vercel's proxy: needed for secure cookies and per-visitor rate limits

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
      connectSrc: ["'self'", 'https://api.cloudinary.com'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: prod ? [] : null,
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Static assets first: no session lookup or database work for images, CSS and JS.
app.get('/assets/js/cars-data.js', (req, res, next) => site(req, res, next)); // generated from the database
app.use('/assets', express.static(assets, { maxAge: prod ? '1h' : 0, fallthrough: false }));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
const PgStore = connectPg(session);
app.use(session({
  name: 'gm.sid',
  secret: process.env.SESSION_SECRET,
  store: new PgStore({ pool, tableName: 'session', pruneSessionInterval: prod ? false : 900 }),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(loadUser);
app.use(csrfProtect);

app.use('/api/auth', auth);
app.post('/logout', logoutForm);

// The password-change page needs a signed-in user; everyone else goes to login.
app.get('/change-password.html', (req, res, next) => (req.user ? next() : res.redirect('/login.html')));
// Signed-in visitors skip the sign-up page. The login page stays reachable so someone can switch account
// (for example from a customer account to the admin account) without hunting for "Log out" first.
app.get('/signup.html', (req, res, next) => (req.user && !req.user.must_change_password ? res.redirect(req.user.role === 'admin' ? '/admin/' : '/account/') : next()));

/* ---------- Panels (role checked on the server for every request) ---------- */
app.use('/admin', requireRole('admin'));
app.use('/account', requireRole('user'));
app.use('/api/admin', requireRole('admin'));
app.use('/api/account', requireRole('user'));
app.use(documents);      // PDFs and downloads (before the order pages, which share the /orders/:ref prefix)
app.use(adminVehicles);
app.use(adminSales);
app.use(adminManage);
app.use(adminOrders);
app.use(account);
app.get('/admin/search', (req, res) => res.redirect(`/admin/vehicles?q=${encodeURIComponent(String(req.query.q || '').slice(0, 80))}`));

/* ---------- Public site (rendered from the database) ---------- */
app.use(publicApi);
app.use(site);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(notFoundPage);
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'That request could not be read.' });
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  res.status(500).send('Something went wrong. Please try again.');
});

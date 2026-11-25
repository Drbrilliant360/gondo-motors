// Accounts: signup (customers only), shared login with role redirect, logout, forgot/reset and forced password change.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { one, query, tx } from '../db.mjs';
import { sendMail } from '../mail.mjs';
import { PgRateStore } from '../rate-store.mjs';
import { csrfToken, validate, regenerate, destroy, safeNext, panelFor, newToken, sha256, requireRole } from '../security.mjs';

export const auth = Router();
const ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', ROUNDS); // compared when the email is unknown, so timing doesn't reveal accounts
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

let limiterNo = 0;
const limiter = (max, minutes, message, opts = {}) => rateLimit({
  windowMs: minutes * 60_000, limit: max, store: new PgRateStore(`auth${++limiterNo}:`), standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: message }), ...opts,
});
const loginLimiter = limiter(10, 15, 'Too many login attempts. Please wait 15 minutes and try again.', { skipSuccessfulRequests: true });
const signupLimiter = limiter(10, 60, 'Too many sign-up attempts from this connection. Please try again later.');
const resetLimiter = limiter(5, 60, 'Too many password reset requests. Please try again in an hour.');

async function signIn(req, user) {
  const cart = req.session.guestCart; // kept across the session change so a guest returns to their order list
  await regenerate(req);              // new session id on every login (prevents session fixation)
  req.session.userId = user.id;
  if (cart) req.session.guestCart = cart;
  csrfToken(req);
}
const dropOtherSessions = (db, userId, keepSid) =>
  db.query(`DELETE FROM "session" WHERE (sess ->> 'userId')::bigint = $1 AND sid <> $2`, [userId, keepSid || '']);
const log = (db, user, action, summary, req) =>
  db.query('INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, summary, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [user.id, user.name, action, 'user', user.id, summary, req.ip || null]);

// Front-end bootstrap: CSRF token + who is signed in (never includes anything sensitive).
auth.get('/session', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const u = req.user;
  const cart = u && u.role === 'user' ? (await query('SELECT vehicle_id FROM cart_items WHERE user_id = $1', [u.id])).rows.map((r) => r.vehicle_id) : [];
  res.json({ csrf: csrfToken(req), user: u ? { name: u.name, role: u.role, panel: u.must_change_password ? '/change-password.html' : panelFor(u) } : null, cart, saved: u && u.role === 'user' ? (await query('SELECT vehicle_id FROM saved_cars WHERE user_id = $1', [u.id])).rows.map((r) => r.vehicle_id) : [] });
});

auth.post('/signup', signupLimiter, async (req, res) => {
  const { values: v, fields, ok } = validate(req.body, {
    name: { required: true, min: 2, max: 80, label: 'Full name' },
    email: { required: true, type: 'email', label: 'Email address' },
    phone: { type: 'phone', max: 20, label: 'Phone number' },
    password: { required: true, type: 'password', strong: true, label: 'Password' },
  });
  if (!ok) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  if (await one('SELECT 1 FROM users WHERE email = $1', [v.email])) {
    return res.status(409).json({ error: 'An account with this email already exists.', fields: { email: 'This email is already registered. Log in instead.' } });
  }
  // role is never read from the request: sign-up can only create customer accounts
  const user = await one("INSERT INTO users (role, name, email, phone, password_hash) VALUES ('user', $1, $2, $3, $4) RETURNING id, role, name",
    [v.name, v.email, v.phone, await bcrypt.hash(v.password, ROUNDS)]);
  await signIn(req, user);
  res.status(201).json({ redirect: safeNext(req.body.next) || '/account/' });
});

auth.post('/login', loginLimiter, async (req, res) => {
  const { values: v, ok } = validate(req.body, { email: { required: true, type: 'email' }, password: { required: true, type: 'password' } });
  const user = ok ? await one('SELECT id, role, name, password_hash, must_change_password, is_active FROM users WHERE email = $1', [v.email]) : null;
  const match = await bcrypt.compare(v.password || '', user ? user.password_hash : DUMMY_HASH);
  if (!user || !match) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (!user.is_active) return res.status(403).json({ error: 'This account has been deactivated. Please contact Gondo Motors.' });
  await signIn(req, user);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  // one login page for both roles: the server decides where each account lands
  const redirect = user.must_change_password ? '/change-password.html'
    : user.role === 'admin' ? '/admin/' : safeNext(req.body.next) || '/account/';
  res.json({ redirect });
});

async function logout(req, res) {
  await destroy(req);
  res.clearCookie('gm.sid');
}
auth.post('/logout', async (req, res) => { await logout(req, res); res.json({ redirect: '/' }); });
export async function logoutForm(req, res) { await logout(req, res); res.redirect('/'); }

auth.post('/forgot', resetLimiter, async (req, res) => {
  const { values: v, fields, ok } = validate(req.body, { email: { required: true, type: 'email', label: 'Email address' } });
  if (!ok) return res.status(422).json({ error: 'Please fix the highlighted field.', fields });
  const user = await one('SELECT id, name, email FROM users WHERE email = $1 AND is_active', [v.email]);
  if (user) {
    const token = newToken();
    await tx(async (db) => {
      await db.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);
      await db.query("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [user.id, sha256(token)]);
    });
    await sendMail({
      to: user.email, subject: 'Reset your Gondo Motors password',
      text: `Hello ${user.name},\n\nUse this link to choose a new password. It works once and expires in 1 hour:\n\n${SITE_URL}/reset-password.html?token=${token}\n\nIf you didn't ask for this, you can ignore this email.\n\nGondo Motors`,
    }).catch((err) => console.error('Reset email failed:', err.message));
  }
  // same answer whether or not the account exists
  res.json({ message: 'If an account exists for that email, we have sent a link to reset the password. It expires in 1 hour.' });
});

auth.post('/reset', resetLimiter, async (req, res) => {
  const { values: v, fields, ok } = validate(req.body, { password: { required: true, type: 'password', strong: true, label: 'New password' } });
  if (!ok) return res.status(422).json({ error: 'Please fix the highlighted field.', fields });
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const hash = await bcrypt.hash(v.password, ROUNDS);
  const done = await tx(async (db) => {
    const row = (await db.query('SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE', [sha256(token)])).rows[0];
    if (!row) return false;
    await db.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [row.id]);
    await db.query('UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2', [hash, row.user_id]);
    await dropOtherSessions(db, row.user_id, null); // sign out everywhere
    return true;
  });
  if (!done) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  res.json({ redirect: '/login.html?reset=1' });
});

// Used for the forced first-login change (seeded and admin-created accounts) and from the profile pages.
auth.post('/change-password', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.', redirect: '/login.html' });
  const { values: v, fields, ok } = validate(req.body, {
    current: { required: true, type: 'password', label: 'Current password' },
    password: { required: true, type: 'password', strong: true, label: 'New password' },
  });
  if (!ok) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(v.current, row.password_hash))) return res.status(422).json({ error: 'Current password is incorrect.', fields: { current: 'Current password is incorrect.' } });
  if (v.current === v.password) return res.status(422).json({ error: 'Choose a new password.', fields: { password: 'The new password must be different from the current one.' } });
  const hash = await bcrypt.hash(v.password, ROUNDS);
  await tx(async (db) => {
    await db.query('UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2', [hash, req.user.id]);
    await dropOtherSessions(db, req.user.id, req.sessionID);
    if (req.user.role === 'admin') await log(db, req.user, 'user.password_changed', `${req.user.name} changed their password`, req);
  });
  res.json({ redirect: panelFor(req.user), message: 'Password updated.' });
});

export { requireRole };

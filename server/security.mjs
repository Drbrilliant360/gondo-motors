// Sessions, CSRF, role guards and input validation shared by every route.
import crypto from 'node:crypto';
import { one } from './db.mjs';

export const newToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const wantsJson = (req) => req.path.startsWith('/api/') || req.xhr || (req.get('accept') || '').includes('application/json');

/* ---------- CSRF: one token per session, required on every state-changing request ---------- */
export function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = newToken();
  return req.session.csrf;
}
export function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token') || (req.body && req.body._csrf);
  if (req.session.csrf && sent && safeEqual(sent, req.session.csrf)) return next();
  if (wantsJson(req)) return res.status(403).json({ error: 'Your session expired. Refresh the page and try again.' });
  res.status(403).send('Session expired. Go back, refresh the page and try again.');
}

/* ---------- Current user: reloaded from the database on every request, so a role change or
   deactivation takes effect immediately rather than when the session expires ---------- */
export async function loadUser(req, res, next) {
  req.user = null;
  const id = req.session && req.session.userId;
  if (!id) return next();
  const user = await one('SELECT id, role, name, email, phone, must_change_password, is_active FROM users WHERE id = $1', [id]);
  if (!user || !user.is_active) { delete req.session.userId; return next(); }
  req.user = user;
  next();
}

// Only same-site paths are accepted as a post-login destination (no open redirects).
export const safeNext = (v) => (typeof v === 'string' && /^\/(?![/\\])[\w\-./?=&%,#]*$/.test(v) && v.length < 300 ? v : null);
export const panelFor = (user) => (user.role === 'admin' ? '/admin/' : '/account/');

// requireRole() = any signed-in user; requireRole('admin') / requireRole('user') = that role only.
// Enforced on the server for every panel page and API endpoint; hiding links is not protection.
export function requireRole(role) {
  return (req, res, next) => {
    const json = wantsJson(req);
    if (!req.user) {
      if (json) return res.status(401).json({ error: 'Please log in to continue.', redirect: '/login.html' });
      return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
    }
    if (req.user.must_change_password) {
      if (json) return res.status(403).json({ error: 'Change your password before continuing.', redirect: '/change-password.html' });
      return res.redirect('/change-password.html');
    }
    if (role && req.user.role !== role) {
      if (json) return res.status(403).json({ error: 'You do not have access to this.' });
      return res.redirect(panelFor(req.user));
    }
    next();
  };
}

export const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
export const destroy = (req) => new Promise((resolve) => req.session.destroy(() => resolve()));

/* ---------- Validation ---------- */
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+0-9 ()\-]{7,20}$/;
export const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export function validate(body, rules) {
  const values = {}, fields = {};
  for (const [key, rule] of Object.entries(rules)) {
    const raw = body ? body[key] : undefined;
    const v = rule.type === 'password' ? (typeof raw === 'string' ? raw : '') : str(raw, rule.max || 500);
    const label = rule.label || key;
    if (!v) { if (rule.required) fields[key] = `${label} is required.`; values[key] = rule.type === 'password' ? '' : null; continue; }
    if (rule.type === 'email' && (!EMAIL.test(v) || v.length > 254)) fields[key] = 'Enter a valid email address, like name@example.com.';
    else if (rule.type === 'phone' && !PHONE.test(v)) fields[key] = 'Enter a valid phone number, like +255 679 400 800.';
    else if (rule.type === 'password' && rule.strong && (v.length < 8 || v.length > 200 || !/[a-zA-Z]/.test(v) || !/\d/.test(v))) fields[key] = 'Use at least 8 characters with both letters and numbers.';
    else if (rule.min && v.length < rule.min) fields[key] = `${label} needs at least ${rule.min} characters.`;
    values[key] = rule.type === 'email' ? v.toLowerCase() : v;
  }
  return { values, fields, ok: Object.keys(fields).length === 0 };
}

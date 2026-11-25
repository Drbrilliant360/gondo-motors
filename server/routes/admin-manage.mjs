// Admin > Dashboard, Enquiries, Users, Content, Settings and the activity log. Mounted behind requireRole('admin').
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, many, tx } from '../db.mjs';
import { str } from '../security.mjs';
import { renderPanel, logActivity } from '../panel.mjs';
import { catalog, invalidateCatalog } from '../catalog.mjs';
import { waUrl, waNumber } from '../orders.mjs';
import { dashboardPage, enquiriesPage, usersPage, userPage, contentPage, settingsPage, activityPage } from '../../src/templates/panel/manage.mjs';

export const adminManage = Router();
const PAGE_SIZE = 25;
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/, PHONE = /^[+0-9 ()\-]{7,20}$/;
const ENQUIRY_STATUS = ['new', 'contacted', 'quoted', 'closed'];
const idParam = (req) => (/^\d{1,12}$/.test(req.params.id) ? Number(req.params.id) : null);
const like = (s) => `%${s.replace(/[%_\\]/g, '\\$&')}%`;
const pageOf = (req) => Math.max(1, parseInt(req.query.page, 10) || 1);
const paging = (page, total) => ({ page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, size: PAGE_SIZE });
const setSetting = (db, key, value, userId) => db.query('INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()', [key, JSON.stringify(value), userId]);

/* ------------------------------------------------------------------ dashboard */
adminManage.get('/admin/', async (req, res) => {
  const [stats, months, makes, bodies, orders, payments, enquiries, overdue] = await Promise.all([
    one(`SELECT
      (SELECT count(*) FROM vehicles WHERE deleted_at IS NULL) AS vehicles,
      (SELECT count(*) FROM vehicles WHERE deleted_at IS NULL AND status = 'available') AS available,
      (SELECT count(*) FROM vehicles WHERE deleted_at IS NULL AND status = 'reserved') AS reserved,
      (SELECT count(*) FROM vehicles WHERE deleted_at IS NULL AND status = 'in_transit') AS in_transit,
      (SELECT count(*) FROM vehicles WHERE deleted_at IS NULL AND status = 'sold' AND sold_at >= date_trunc('month', now())) AS sold_month,
      (SELECT count(*) FROM orders WHERE status = 'pending') AS pending_orders,
      COALESCE((SELECT sum(amount_tzs) FROM payments WHERE voided_at IS NULL AND received_on >= date_trunc('month', now())::date), 0)::bigint AS received_month,
      COALESCE((SELECT sum(t.balance_tzs) FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.status NOT IN ('pending','cancelled') AND t.balance_tzs > 0), 0)::bigint AS outstanding,
      (SELECT count(*) FROM enquiries WHERE status = 'new') AS new_enquiries,
      (SELECT count(*) FROM users WHERE role = 'user' AND created_at >= now() - interval '30 days') AS new_users,
      (SELECT count(*) FROM vehicles v WHERE deleted_at IS NULL AND price_tzs IS NULL AND status <> 'sold') AS no_price,
      (SELECT count(*) FROM vehicles v WHERE deleted_at IS NULL AND status <> 'sold' AND NOT EXISTS (SELECT 1 FROM vehicle_photos p WHERE p.vehicle_id = v.id)) AS no_photos`),
    many(`WITH m AS (SELECT generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month')::date AS month)
          SELECT to_char(m.month, 'Mon') AS label,
            (SELECT count(*) FROM orders o WHERE date_trunc('month', o.created_at)::date = m.month AND o.status <> 'cancelled') AS orders,
            COALESCE((SELECT sum(p.amount_tzs) FROM payments p WHERE p.voided_at IS NULL AND date_trunc('month', p.received_on)::date = m.month), 0)::bigint AS received
          FROM m ORDER BY m.month`),
    many("SELECT make AS label, count(*) AS n FROM vehicles WHERE deleted_at IS NULL AND status <> 'sold' GROUP BY make ORDER BY n DESC, make LIMIT 6"),
    many("SELECT body_style AS label, count(*) AS n FROM vehicles WHERE deleted_at IS NULL AND status <> 'sold' GROUP BY body_style ORDER BY n DESC, body_style LIMIT 6"),
    many(`SELECT o.ref, o.status, o.customer_name, o.created_at, t.grand_total_tzs, t.paid_tzs, t.payment_status,
                 (SELECT string_agg(i.title, ' · ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id) AS vehicles
          FROM orders o JOIN order_totals t ON t.order_id = o.id ORDER BY o.created_at DESC LIMIT 6`),
    many(`SELECT p.receipt_no, p.amount_tzs, p.received_on, p.method, p.voided_at, o.ref, c.name AS client_name FROM payments p JOIN orders o ON o.id = p.order_id JOIN clients c ON c.id = p.client_id ORDER BY p.created_at DESC, p.id DESC LIMIT 5`),
    many("SELECT id, type, name, message, status, created_at FROM enquiries ORDER BY created_at DESC LIMIT 5"),
    many(`SELECT o.ref, o.customer_name, o.balance_due_date, t.balance_tzs FROM orders o JOIN order_totals t ON t.order_id = o.id
          WHERE o.status NOT IN ('pending','cancelled') AND t.balance_tzs > 0 AND o.balance_due_date < CURRENT_DATE ORDER BY o.balance_due_date LIMIT 6`),
  ]);
  renderPanel(req, res, { active: 'dashboard', title: 'Dashboard', body: dashboardPage({ user: req.user, stats, months, makes, bodies, orders, payments, enquiries, overdue }) });
});

/* ------------------------------------------------------------------ enquiries */
adminManage.get('/admin/enquiries', async (req, res) => {
  const q = { q: str(req.query.q, 80), status: ENQUIRY_STATUS.includes(req.query.status) ? req.query.status : '', type: ['contact', 'car_request'].includes(req.query.type) ? req.query.type : '' };
  const where = ['TRUE'], params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.q) add("(e.name || ' ' || COALESCE(e.phone, '') || ' ' || COALESCE(e.email::text, '') || ' ' || e.message || ' ' || COALESCE(e.wanted_make, '') || ' ' || COALESCE(e.wanted_model, '')) ILIKE ?", like(q.q));
  if (q.status) add('e.status = ?', q.status);
  if (q.type) add('e.type = ?', q.type);
  const page = pageOf(req);
  const rows = await many(`SELECT e.*, count(*) OVER() AS total, h.name AS handled_by_name FROM enquiries e LEFT JOIN users h ON h.id = e.handled_by WHERE ${where.join(' AND ')} ORDER BY (e.status = 'new') DESC, e.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, params);
  const counts = Object.fromEntries((await many('SELECT status, count(*) AS n FROM enquiries GROUP BY status')).map((r) => [r.status, r.n]));
  for (const e of rows) e.wa = waNumber(e.phone) ? waUrl(waNumber(e.phone), `Hello ${e.name}, this is Gondo Motors replying to your ${e.type === 'car_request' ? 'car request' : 'message'}.`) : null;
  renderPanel(req, res, { active: 'enquiries', title: 'Enquiries', body: enquiriesPage({ rows, counts, query: Object.fromEntries(Object.entries(q).filter(([, v]) => v)), paging: paging(page, rows[0]?.total || 0) }) });
});

adminManage.put('/api/admin/enquiries/:id', async (req, res) => {
  const id = idParam(req), status = str(req.body.status, 20), notes = str(req.body.admin_notes, 2000) || null;
  if (!ENQUIRY_STATUS.includes(status)) return res.status(422).json({ error: 'Choose a status.', fields: { status: 'Choose a status.' } });
  const done = id && await tx(async (db) => {
    const e = (await db.query('SELECT name, status FROM enquiries WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!e) return false;
    await db.query('UPDATE enquiries SET status = $2, admin_notes = $3, handled_by = $4, updated_at = now() WHERE id = $1', [id, status, notes, req.user.id]);
    if (e.status !== status) await logActivity(db, req, 'enquiry.status_changed', 'enquiry', id, `Enquiry from ${e.name} marked ${status}`, { from: e.status, to: status });
    return true;
  });
  if (!done) return res.status(404).json({ error: 'Enquiry not found.' });
  res.json({ message: 'Enquiry updated.' });
});

/* ------------------------------------------------------------------ users */
adminManage.get('/admin/users', async (req, res) => {
  const q = { q: str(req.query.q, 80), role: ['admin', 'user'].includes(req.query.role) ? req.query.role : '', state: ['active', 'inactive'].includes(req.query.state) ? req.query.state : '' };
  const where = ['TRUE'], params = [];
  if (q.q) { params.push(like(q.q)); where.push(`(u.name || ' ' || u.email::text || ' ' || COALESCE(u.phone, '')) ILIKE $${params.length}`); }
  if (q.role) { params.push(q.role); where.push(`u.role = $${params.length}`); }
  if (q.state) where.push(q.state === 'active' ? 'u.is_active' : 'NOT u.is_active');
  const page = pageOf(req);
  const rows = await many(
    `SELECT u.id, u.role, u.name, u.email, u.phone, u.is_active, u.must_change_password, u.last_login_at, u.created_at, count(*) OVER() AS total,
            (SELECT count(*) FROM orders o WHERE o.user_id = u.id) AS orders, (SELECT count(*) FROM enquiries e WHERE e.user_id = u.id) AS enquiries
     FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, params);
  renderPanel(req, res, { active: 'users', title: 'Users', body: usersPage({ rows, me: req.user.id, query: Object.fromEntries(Object.entries(q).filter(([, v]) => v)), paging: paging(page, rows[0]?.total || 0) }) });
});

adminManage.get('/admin/users/:id', async (req, res, next) => {
  const id = idParam(req);
  const user = id && await one('SELECT u.id, u.role, u.name, u.email, u.phone, u.is_active, u.must_change_password, u.last_login_at, u.created_at, c.id AS client_id FROM users u LEFT JOIN clients c ON c.user_id = u.id WHERE u.id = $1', [id]);
  if (!user) return next();
  const [orders, enquiries] = await Promise.all([
    many(`SELECT o.ref, o.status, o.created_at, t.grand_total_tzs, t.payment_status, (SELECT string_agg(i.title, ' · ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id) AS vehicles
          FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.user_id = $1 ORDER BY o.created_at DESC`, [id]),
    many('SELECT id, type, message, status, created_at FROM enquiries WHERE user_id = $1 ORDER BY created_at DESC', [id]),
  ]);
  renderPanel(req, res, { active: 'users', title: user.name, body: userPage({ user, orders, enquiries, me: req.user.id }) });
});

// Admin accounts can only be created here, by an existing admin. The new admin must change the temporary password on first login.
adminManage.post('/api/admin/users', async (req, res) => {
  const b = req.body || {}, fields = {};
  const name = str(b.name, 80); if (name.length < 2) fields.name = 'Full name is required.';
  const email = str(b.email, 254).toLowerCase(); if (!EMAIL.test(email)) fields.email = 'Enter a valid email address.';
  const phone = str(b.phone, 20) || null; if (phone && !PHONE.test(phone)) fields.phone = 'Enter a valid phone number.';
  const password = typeof b.password === 'string' ? b.password : ''; if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) fields.password = 'Use at least 8 characters with both letters and numbers.';
  if (Object.keys(fields).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  if (await one('SELECT 1 FROM users WHERE email = $1', [email])) return res.status(409).json({ error: 'An account with this email already exists.', fields: { email: 'This email is already registered.' } });
  const hash = await bcrypt.hash(password, 12);
  await tx(async (db) => {
    const u = (await db.query("INSERT INTO users (role, name, email, phone, password_hash, must_change_password, created_by) VALUES ('admin', $1, $2, $3, $4, TRUE, $5) RETURNING id", [name, email, phone, hash, req.user.id])).rows[0];
    await logActivity(db, req, 'user.admin_created', 'user', u.id, `Created admin account for ${name} (${email})`);
  });
  res.status(201).json({ message: `Admin account created for ${name}. They must change the password when they first log in.` });
});

adminManage.post('/api/admin/users/:id/active', async (req, res) => {
  const id = idParam(req);
  if (id === req.user.id) return res.status(409).json({ error: 'You cannot deactivate your own account.' });
  const out = id && await tx(async (db) => {
    const u = (await db.query('SELECT id, name, role, is_active FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!u) return null;
    const next = !u.is_active;
    await db.query('UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1', [id, next]);
    if (!next) await db.query(`DELETE FROM "session" WHERE (sess ->> 'userId')::bigint = $1`, [id]); // signed out everywhere immediately
    await logActivity(db, req, next ? 'user.activated' : 'user.deactivated', 'user', id, `${next ? 'Activated' : 'Deactivated'} ${u.role} account ${u.name}`);
    return { name: u.name, next };
  });
  if (!out) return res.status(404).json({ error: 'User not found.' });
  res.json({ message: `${out.name} ${out.next ? 'can log in again' : 'has been deactivated and signed out'}.` });
});

/* ------------------------------------------------------------------ content */
adminManage.get('/admin/content', async (req, res) => {
  invalidateCatalog();
  const cat = await catalog();
  renderPanel(req, res, { active: 'content', title: 'Content', body: contentPage({ site: cat.site, faq: cat.faq, steps: cat.steps, banners: cat.banners }) });
});

const rowsFrom = (b, max, read) => { const out = []; for (let n = 1; n <= max; n++) { const r = read(n); if (r) out.push(r); } return out; };
const saveContent = (key, label, build) => async (req, res) => {
  const { value, fields } = build(req.body || {});
  if (fields && Object.keys(fields).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  await tx(async (db) => { await setSetting(db, key, value, req.user.id); await logActivity(db, req, 'content.updated', 'setting', null, `Updated ${label}`); });
  invalidateCatalog();
  res.json({ message: `${label[0].toUpperCase()}${label.slice(1)} saved. The website is updated.` });
};
adminManage.put('/api/admin/content/faq', saveContent('content.faq', 'FAQ', (b) => ({ value: rowsFrom(b, 40, (n) => { const q = str(b[`q_${n}`], 200), a = str(b[`a_${n}`], 2000); return q && a ? { q, a } : null; }) })));
adminManage.put('/api/admin/content/steps', saveContent('content.how_to_buy', 'how to buy steps', (b) => ({ value: rowsFrom(b, 20, (n) => { const title = str(b[`title_${n}`], 100), text = str(b[`text_${n}`], 600); return title && text ? { title, text, icon: /^fa-[a-z0-9-]{2,40}$/.test(b[`icon_${n}`] || '') ? b[`icon_${n}`] : 'fa-circle-check' } : null; }) })));
adminManage.put('/api/admin/content/banners', saveContent('content.banners', 'homepage banners', (b) => ({ value: rowsFrom(b, 3, (n) => { const title = str(b[`title_${n}`], 80), text = str(b[`text_${n}`], 200); return title ? { title, text } : null; }) })));
adminManage.put('/api/admin/content/contact', saveContent('content.contact', 'contact details', (b) => {
  const fields = {}, phone = str(b.phone, 30), email = str(b.email, 254).toLowerCase();
  if (!PHONE.test(phone)) fields.phone = 'Enter a valid phone number.';
  if (!EMAIL.test(email)) fields.email = 'Enter a valid email address.';
  return { fields, value: {
    phone, email,
    offices: rowsFrom(b, 4, (n) => { const address = str(b[`office_address_${n}`], 200); return address ? { label: str(b[`office_label_${n}`], 40) || `Office ${n}`, address } : null; }),
    salesTeam: rowsFrom(b, 8, (n) => { const name = str(b[`team_name_${n}`], 60); return name ? { name, phone: str(b[`team_phone_${n}`], 30), email: str(b[`team_email_${n}`], 254) } : null; }),
  } };
}));

/* ------------------------------------------------------------------ settings */
adminManage.get('/admin/settings', async (req, res) => {
  invalidateCatalog();
  const cat = await catalog();
  const recent = await many('SELECT summary, actor_name, created_at FROM activity_log ORDER BY created_at DESC, id DESC LIMIT 8');
  renderPanel(req, res, { active: 'settings', title: 'Settings', body: settingsPage({ user: req.user, whatsapp: cat.site.whatsapp, usdRate: cat.usdRate, business: cat.settings.business || {}, recent }) });
});

adminManage.put('/api/admin/settings', async (req, res) => {
  const b = req.body || {}, fields = {};
  const whatsapp = str(b.whatsapp_number, 30).replace(/\D/g, ''); if (whatsapp.length < 9 || whatsapp.length > 15) fields.whatsapp_number = 'Enter the number in international format, e.g. 255679400800.';
  const rate = Number(str(String(b.usd_rate ?? ''), 20).replace(/,/g, '')); if (!(rate >= 100 && rate <= 100000)) fields.usd_rate = 'Enter how many TZS equal 1 USD, e.g. 2,645.5.';
  const business = { name: str(b.business_name, 100), phone: str(b.business_phone, 30), email: str(b.business_email, 254), address: str(b.business_address, 250), tin: str(b.business_tin, 30) };
  if (business.name.length < 2) fields.business_name = 'Business name is required.';
  if (business.email && !EMAIL.test(business.email)) fields.business_email = 'Enter a valid email address.';
  if (Object.keys(fields).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  await tx(async (db) => {
    const old = Object.fromEntries((await db.query("SELECT key, value FROM settings WHERE key IN ('whatsapp_number', 'usd_rate')")).rows.map((r) => [r.key, r.value]));
    await setSetting(db, 'whatsapp_number', whatsapp, req.user.id); await setSetting(db, 'usd_rate', rate, req.user.id); await setSetting(db, 'business', business, req.user.id);
    const changes = [];
    if (String(old.whatsapp_number) !== whatsapp) changes.push(`WhatsApp number ${old.whatsapp_number} → ${whatsapp}`);
    if (Number(old.usd_rate) !== rate) changes.push(`exchange rate ${old.usd_rate} → ${rate}`);
    await logActivity(db, req, 'settings.updated', 'setting', null, `Updated settings${changes.length ? `: ${changes.join(', ')}` : ''}`);
  });
  invalidateCatalog();
  res.json({ message: 'Settings saved.' });
});

adminManage.put('/api/admin/profile', async (req, res) => {
  const b = req.body || {}, fields = {};
  const name = str(b.name, 80); if (name.length < 2) fields.name = 'Full name is required.';
  const email = str(b.email, 254).toLowerCase(); if (!EMAIL.test(email)) fields.email = 'Enter a valid email address.';
  const phone = str(b.phone, 20) || null; if (phone && !PHONE.test(phone)) fields.phone = 'Enter a valid phone number.';
  if (Object.keys(fields).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  if (await one('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, req.user.id])) return res.status(409).json({ error: 'That email is used by another account.', fields: { email: 'That email is used by another account.' } });
  await tx(async (db) => { await db.query('UPDATE users SET name = $2, email = $3, phone = $4, updated_at = now() WHERE id = $1', [req.user.id, name, email, phone]); await logActivity(db, req, 'user.profile_updated', 'user', req.user.id, `${name} updated their profile`); });
  res.json({ message: 'Profile saved.' });
});

adminManage.get('/admin/activity', async (req, res) => {
  const q = str(req.query.q, 80), page = pageOf(req), params = q ? [like(q)] : [];
  const where = q ? "(summary || ' ' || actor_name || ' ' || action) ILIKE $1" : 'TRUE';
  const rows = await many(`SELECT action, summary, actor_name, created_at, count(*) OVER() AS total FROM activity_log WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`, params);
  renderPanel(req, res, { active: 'settings', title: 'Activity log', body: activityPage({ rows, query: q ? { q } : {}, paging: { page, pages: Math.max(1, Math.ceil((rows[0]?.total || 0) / 50)), total: rows[0]?.total || 0, size: 50 } }) });
});

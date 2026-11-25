// Customer panel: order list (cart), WhatsApp ordering, order history.
// Mounted after requireRole('user') for /account and /api/account. Every query is scoped to req.user.id,
// so a customer can only ever see or change their own records.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { PgRateStore } from '../rate-store.mjs';
import { pool, one, many, tx } from '../db.mjs';
import { str } from '../security.mjs';
import { renderPanel } from '../panel.mjs';
import { catalog } from '../catalog.mjs';
import { nextRef, itemTitle, whatsappMessage, waUrl } from '../orders.mjs';
import { orderListPage, ordersPage, orderPage, overviewPage, savedPage, comparisonsPage, myEnquiriesPage, profilePage } from '../../src/templates/panel/account.mjs';

export const account = Router();
const MAX_CART = 10;
const scripts = ['/assets/js/account.js'];
const orderLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, store: new PgRateStore('order:'), keyGenerator: (req) => `u${req.user.id}`, standardHeaders: 'draft-7', legacyHeaders: false, handler: (req, res) => res.status(429).json({ error: 'You have placed several orders in a short time. Please wait a while or contact us on WhatsApp.' }) });

const cartRows = (db, userId) => db.query(
  `SELECT v.id, v.slug, v.stock_no, v.make, v.model, v.year, v.body_style, v.mileage_km, v.colour, v.price_tzs, v.status, v.source,
          (SELECT thumb_url FROM vehicle_photos p WHERE p.vehicle_id = v.id ORDER BY is_cover DESC, position, id LIMIT 1) AS thumb
   FROM cart_items c JOIN vehicles v ON v.id = c.vehicle_id
   WHERE c.user_id = $1 AND v.deleted_at IS NULL ORDER BY c.created_at`, [userId]).then((r) => r.rows);
export const cartIds = (userId) => many('SELECT vehicle_id FROM cart_items WHERE user_id = $1', [userId]).then((rows) => rows.map((r) => r.vehicle_id));

/* ---------- order list ---------- */
account.get('/account/order-list', async (req, res) => {
  const items = await cartRows(pool, req.user.id);
  renderPanel(req, res, { active: 'cart', title: 'Order list', scripts, body: orderListPage({ items, user: req.user }) });
});

account.post('/api/account/cart', async (req, res) => {
  const id = Number(req.body.vehicleId);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(422).json({ error: 'Vehicle not found.' });
  const v = await one('SELECT id, make, model, status FROM vehicles WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!v) return res.status(404).json({ error: 'This vehicle is no longer listed.' });
  if (v.status !== 'available') return res.status(409).json({ error: `${v.make} ${v.model} is ${v.status === 'sold' ? 'sold' : 'not available right now'}. Ask us to find a similar car.` });
  const ids = await cartIds(req.user.id);
  if (!ids.includes(id) && ids.length >= MAX_CART) return res.status(409).json({ error: `Your order list can hold up to ${MAX_CART} vehicles. Remove one to add another.` });
  await one('INSERT INTO cart_items (user_id, vehicle_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING vehicle_id', [req.user.id, id]);
  res.status(201).json({ cart: await cartIds(req.user.id), message: `${v.make} ${v.model} added to your order list.` });
});

account.delete('/api/account/cart/:vehicleId', async (req, res) => {
  const id = Number(req.params.vehicleId);
  if (Number.isSafeInteger(id)) await one('DELETE FROM cart_items WHERE user_id = $1 AND vehicle_id = $2 RETURNING vehicle_id', [req.user.id, id]);
  res.json({ cart: await cartIds(req.user.id) });
});

/* ---------- place an order: save it first, then hand the customer the WhatsApp link ---------- */
account.post('/api/account/orders', orderLimiter, async (req, res) => {
  const note = str(req.body.note, 500) || null, phone = str(req.body.phone, 20);
  if (!/^[+0-9 ()\-]{7,20}$/.test(phone)) return res.status(422).json({ error: 'Add a phone number so our team can reach you.', fields: { phone: 'Enter a valid phone number, like +255 679 400 800.' } });
  const cat = await catalog();
  const result = await tx(async (db) => {
    const items = await cartRows(db, req.user.id);
    if (!items.length) return { error: 'Your order list is empty.', status: 422 };
    const gone = items.filter((i) => i.status !== 'available');
    if (gone.length) return { error: `${gone.map((g) => `${g.make} ${g.model}`).join(', ')} ${gone.length === 1 ? 'is' : 'are'} no longer available. Remove ${gone.length === 1 ? 'it' : 'them'} to continue.`, status: 409 };
    if (phone !== req.user.phone) await db.query('UPDATE users SET phone = $1, updated_at = now() WHERE id = $2', [phone, req.user.id]);
    const ref = await nextRef(db, 'order', 'GM');
    const snap = items.map((v) => ({ vehicle_id: v.id, slug: v.slug, title: itemTitle(v), stock_no: v.stock_no, mileage_km: v.mileage_km, colour: v.colour, listed_price_tzs: v.price_tzs }));
    const message = whatsappMessage({ ref, customer: { name: req.user.name, phone, email: req.user.email }, items: snap, note, siteUrl: cat.site.url });
    const order = (await db.query(
      `INSERT INTO orders (ref, user_id, channel, status, customer_name, customer_phone, customer_email, customer_note, whatsapp_message, created_by)
       VALUES ($1, $2, 'website', 'pending', $3, $4, $5, $6, $7, $2) RETURNING id`,
      [ref, req.user.id, req.user.name, phone, req.user.email, note, message])).rows[0];
    for (const s of snap) {
      await db.query('INSERT INTO order_items (order_id, vehicle_id, title, stock_no, mileage_km, colour, listed_price_tzs) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [order.id, s.vehicle_id, s.title, s.stock_no, s.mileage_km, s.colour, s.listed_price_tzs]);
    }
    await db.query("INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by) VALUES ($1, NULL, 'pending', 'Order placed on the website', $2)", [order.id, req.user.id]);
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    return { ref, message };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ ref: result.ref, whatsapp: waUrl(cat.site.whatsapp, result.message), redirect: `/account/orders/${result.ref}?placed=1` });
});

/* ---------- my orders ---------- */
account.get('/account/orders', async (req, res) => {
  const orders = await many(
    `SELECT o.id, o.ref, o.status, o.created_at, t.grand_total_tzs, t.paid_tzs, t.balance_tzs, t.payment_status, t.unpriced_items,
            (SELECT string_agg(i.title, ' · ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id) AS vehicles,
            (SELECT count(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
     FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.user_id = $1 ORDER BY o.created_at DESC`, [req.user.id]);
  renderPanel(req, res, { active: 'orders', title: 'My orders', scripts, body: ordersPage({ orders }) });
});

account.get('/account/orders/:ref', async (req, res, next) => {
  if (!/^GM-\d{4}-\d{5,}$/.test(req.params.ref)) return next();
  // user_id in the WHERE clause is the access check: another customer's reference simply does not exist here
  const order = await one(
    `SELECT o.*, t.listed_total_tzs, t.vehicles_total_tzs, t.extras_total_tzs, t.grand_total_tzs, t.paid_tzs, t.balance_tzs, t.payment_status, t.unpriced_items
     FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.ref = $1 AND o.user_id = $2`, [req.params.ref, req.user.id]);
  if (!order) return next();
  delete order.internal_notes; // staff-only, never rendered for customers
  const [docs, items, costs, payments, history] = await Promise.all([
    many('SELECT id, kind, filename, created_at FROM order_documents WHERE order_id = $1 AND visible_to_customer ORDER BY id', [order.id]),
    many(`SELECT i.*, v.slug, v.source, v.deleted_at,
                 (SELECT thumb_url FROM vehicle_photos p WHERE p.vehicle_id = v.id ORDER BY is_cover DESC, position, id LIMIT 1) AS thumb
          FROM order_items i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.order_id = $1 ORDER BY i.id`, [order.id]),
    many('SELECT kind, label, amount_tzs FROM order_costs WHERE order_id = $1 ORDER BY id', [order.id]),
    many('SELECT receipt_no, amount_tzs, received_on, method FROM payments WHERE order_id = $1 AND voided_at IS NULL ORDER BY received_on, id', [order.id]),
    many('SELECT to_status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id', [order.id]),
  ]);
  const cat = await catalog();
  const follow = waUrl(cat.site.whatsapp, `Hello Gondo Motors, I'm following up on my order ${order.ref}.`);
  renderPanel(req, res, {
    active: 'orders', title: `Order ${order.ref}`, scripts,
    body: orderPage({ order, items, costs, payments, history, docs, placed: req.query.placed === '1', sendUrl: waUrl(cat.site.whatsapp, order.whatsapp_message || ''), followUrl: follow }),
  });
});

/* ---------- overview ---------- */
account.get('/account/', async (req, res) => {
  const id = req.user.id;
  const [orders, enquiries, saved, cart] = await Promise.all([
    many(`SELECT o.id, o.ref, o.status, o.created_at, o.vessel, o.shipping_eta, o.expected_delivery, t.grand_total_tzs, t.paid_tzs, t.balance_tzs, t.payment_status,
                 (SELECT string_agg(i.title, ' · ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id) AS vehicles,
                 EXISTS (SELECT 1 FROM order_items i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.order_id = o.id AND v.source = 'japan_auction') AS is_import
          FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.user_id = $1 AND o.status NOT IN ('cancelled', 'delivered') ORDER BY o.created_at DESC LIMIT 5`, [id]),
    many('SELECT id, type, message, wanted_make, wanted_model, year_from, year_to, status, created_at FROM enquiries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 4', [id]),
    savedRows(id, 4),
    one('SELECT count(*) AS n FROM cart_items WHERE user_id = $1', [id]),
  ]);
  const sums = await one(`SELECT COALESCE(sum(t.paid_tzs), 0)::bigint AS paid, COALESCE(sum(GREATEST(t.balance_tzs, 0)), 0)::bigint AS balance FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.user_id = $1 AND o.status NOT IN ('pending', 'cancelled')`, [id]);
  renderPanel(req, res, { active: 'overview', title: 'Overview', scripts, body: overviewPage({ user: req.user, orders, enquiries, saved, cart: cart.n, sums }) });
});

/* ---------- saved cars ---------- */
const savedRows = (userId, limit = 100) => many(
  `SELECT v.id, v.slug, v.make, v.model, v.year, v.body_style, v.mileage_km, v.price_tzs, v.status,
          (SELECT thumb_url FROM vehicle_photos p WHERE p.vehicle_id = v.id ORDER BY is_cover DESC, position, id LIMIT 1) AS thumb
   FROM saved_cars s JOIN vehicles v ON v.id = s.vehicle_id WHERE s.user_id = $1 AND v.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT ${Number(limit)}`, [userId]);
export const savedIds = (userId) => many('SELECT vehicle_id FROM saved_cars WHERE user_id = $1', [userId]).then((r) => r.map((x) => x.vehicle_id));

account.get('/account/saved', async (req, res) => renderPanel(req, res, { active: 'saved', title: 'Saved cars', scripts, body: savedPage({ cars: await savedRows(req.user.id) }) }));
account.post('/api/account/saved', async (req, res) => {
  const id = Number(req.body.vehicleId);
  if (!Number.isSafeInteger(id) || !(await one('SELECT 1 FROM vehicles WHERE id = $1 AND deleted_at IS NULL', [id]))) return res.status(404).json({ error: 'This vehicle is no longer listed.' });
  if ((await savedIds(req.user.id)).length >= 100) return res.status(409).json({ error: 'You can save up to 100 cars. Remove one to add another.' });
  await one('INSERT INTO saved_cars (user_id, vehicle_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING vehicle_id', [req.user.id, id]);
  res.status(201).json({ saved: await savedIds(req.user.id), message: 'Saved to your account.' });
});
account.delete('/api/account/saved/:vehicleId', async (req, res) => {
  const id = Number(req.params.vehicleId);
  if (Number.isSafeInteger(id)) await one('DELETE FROM saved_cars WHERE user_id = $1 AND vehicle_id = $2 RETURNING vehicle_id', [req.user.id, id]);
  res.json({ saved: await savedIds(req.user.id), message: 'Removed from your saved cars.' });
});

/* ---------- saved comparisons ---------- */
account.get('/account/comparisons', async (req, res) => {
  const rows = await many('SELECT id, name, vehicle_ids, created_at FROM saved_comparisons WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  const cat = await catalog();
  for (const r of rows) { r.vehicle_ids = r.vehicle_ids.map(Number); r.cars = r.vehicle_ids.map((id) => cat.byId.get(id)).filter(Boolean); } // BIGINT[] arrives as strings
  renderPanel(req, res, { active: 'comparisons', title: 'Comparisons', scripts, body: comparisonsPage({ rows }) });
});
account.post('/api/account/comparisons', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))] : [];
  if (ids.length < 2 || ids.length > 3) return res.status(422).json({ error: 'Pick two or three vehicles to save a comparison.' });
  const cat = await catalog(), cars = ids.map((id) => cat.byId.get(id)).filter(Boolean);
  if (cars.length !== ids.length) return res.status(404).json({ error: 'One of these vehicles is no longer listed.' });
  if ((await one('SELECT count(*) AS n FROM saved_comparisons WHERE user_id = $1', [req.user.id])).n >= 30) return res.status(409).json({ error: 'You can keep up to 30 comparisons. Delete one to save another.' });
  const name = str(req.body.name, 120) || cars.map((c) => c.name).join(' vs ');
  await one('INSERT INTO saved_comparisons (user_id, name, vehicle_ids) VALUES ($1, $2, $3) RETURNING id', [req.user.id, name.slice(0, 120), ids]);
  res.status(201).json({ message: 'Comparison saved to your account.' });
});
account.delete('/api/account/comparisons/:id', async (req, res) => {
  const id = Number(req.params.id);
  const gone = Number.isSafeInteger(id) && await one('DELETE FROM saved_comparisons WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.user.id]);
  if (!gone) return res.status(404).json({ error: 'Comparison not found.' });
  res.json({ message: 'Comparison deleted.' });
});

/* ---------- enquiries and profile ---------- */
account.get('/account/enquiries', async (req, res) => {
  const rows = await many('SELECT id, type, message, wanted_make, wanted_model, year_from, year_to, budget_tzs, status, created_at FROM enquiries WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  renderPanel(req, res, { active: 'enquiries', title: 'My enquiries', scripts, body: myEnquiriesPage({ rows }) });
});
account.get('/account/profile', (req, res) => renderPanel(req, res, { active: 'profile', title: 'Profile', scripts, body: profilePage({ user: req.user }) }));
account.put('/api/account/profile', async (req, res) => {
  const b = req.body || {}, fields = {};
  const name = str(b.name, 80); if (name.length < 2) fields.name = 'Full name is required.';
  const email = str(b.email, 254).toLowerCase(); if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = 'Enter a valid email address, like name@example.com.';
  const phone = str(b.phone, 20) || null; if (phone && !/^[+0-9 ()\-]{7,20}$/.test(phone)) fields.phone = 'Enter a valid phone number, like +255 679 400 800.';
  if (Object.keys(fields).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  if (await one('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, req.user.id])) return res.status(409).json({ error: 'That email is used by another account.', fields: { email: 'That email is used by another account.' } });
  await one('UPDATE users SET name = $2, email = $3, phone = $4, updated_at = now() WHERE id = $1 RETURNING id', [req.user.id, name, email, phone]); // WHERE id = the signed-in user: nobody else's profile can be changed
  res.json({ message: 'Profile saved.' });
});

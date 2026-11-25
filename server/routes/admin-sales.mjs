// Admin > Clients, manual sales, payments ledger and reports. Mounted behind requireRole('admin').
import { Router } from 'express';
import { one, many, tx } from '../db.mjs';
import { str } from '../security.mjs';
import { renderPanel, logActivity } from '../panel.mjs';
import { invalidateCatalog } from '../catalog.mjs';
import { nextRef, itemTitle, syncVehicleStatus } from '../orders.mjs';
import { clientsList, clientProfile, manualSale, paymentsLedger, reportsPage } from '../../src/templates/panel/sales.mjs';
import { METHODS } from '../../src/templates/panel/account.mjs';

export const adminSales = Router();
const PAGE_SIZE = 25;
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/, PHONE = /^[+0-9 ()\-]{7,20}$/;
const idParam = (req) => (/^\d{1,12}$/.test(req.params.id) ? Number(req.params.id) : null);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d));
const like = (s) => `%${s.replace(/[%_\\]/g, '\\$&')}%`;
const today = () => new Date().toISOString().slice(0, 10);

// CSV with quoting, and a guard so a cell starting with = + - @ is never run as a spreadsheet formula.
export function sendCsv(res, filename, header, rows) {
  const cell = (v) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(`﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`);
}

/* ------------------------------------------------------------------ clients */
function parseClient(b) {
  const f = {}, v = { name: str(b.name, 80), phone: str(b.phone, 20) || null, email: str(b.email, 254).toLowerCase() || null, region: str(b.region, 60) || null, address: str(b.address, 200) || null, notes: str(b.notes, 2000) || null };
  if (v.name.length < 2) f.name = 'Client name is required.';
  if (v.phone && !PHONE.test(v.phone)) f.phone = 'Enter a valid phone number, like +255 679 400 800.';
  if (v.email && !EMAIL.test(v.email)) f.email = 'Enter a valid email address.';
  return { v, fields: f, ok: Object.keys(f).length === 0 };
}
const CLIENT_STATS = `
  (SELECT count(*) FROM orders o WHERE o.client_id = c.id AND o.status <> 'cancelled') AS purchases,
  COALESCE((SELECT sum(p.amount_tzs) FROM payments p WHERE p.client_id = c.id AND p.voided_at IS NULL), 0)::bigint AS paid_tzs,
  COALESCE((SELECT sum(GREATEST(t.balance_tzs, 0)) FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.client_id = c.id AND o.status NOT IN ('pending', 'cancelled')), 0)::bigint AS outstanding_tzs`;

adminSales.get('/admin/clients', async (req, res) => {
  const q = str(req.query.q, 80), owing = req.query.owing === '1', page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = ['TRUE'], params = [];
  if (q) { params.push(like(q)); where.push(`(c.name || ' ' || COALESCE(c.phone, '') || ' ' || COALESCE(c.email::text, '') || ' ' || COALESCE(c.region, '')) ILIKE $${params.length}`); }
  params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const rows = await many(
    `SELECT * FROM (SELECT c.*, ${CLIENT_STATS} FROM clients c WHERE ${where.join(' AND ')}) c ${owing ? 'WHERE outstanding_tzs > 0' : ''}
     ORDER BY ${owing ? 'outstanding_tzs DESC' : 'lower(name)'} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = (await one(`SELECT count(*) AS n FROM (SELECT c.id, ${CLIENT_STATS} FROM clients c WHERE ${where.join(' AND ')}) c ${owing ? 'WHERE outstanding_tzs > 0' : ''}`, params.slice(0, -2))).n;
  const query = { ...(q ? { q } : {}), ...(owing ? { owing: '1' } : {}) };
  renderPanel(req, res, { active: 'clients', title: 'Clients', body: clientsList({ rows, query, paging: { page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, size: PAGE_SIZE } }) });
});

adminSales.get('/admin/clients/:id', async (req, res, next) => {
  const id = idParam(req);
  const client = id && await one(`SELECT c.*, u.email AS account_email, ${CLIENT_STATS} FROM clients c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [id]);
  if (!client) return next();
  const [orders, payments, documents] = await Promise.all([
    many(`SELECT o.ref, o.status, o.created_at, t.grand_total_tzs, t.paid_tzs, t.balance_tzs, t.payment_status,
                 (SELECT string_agg(i.title, ' · ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id) AS vehicles
          FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.client_id = $1 ORDER BY o.created_at DESC`, [id]),
    many(`SELECT p.receipt_no, p.amount_tzs, p.received_on, p.method, p.reference, p.voided_at, o.ref FROM payments p JOIN orders o ON o.id = p.order_id
          WHERE p.client_id = $1 ORDER BY p.received_on DESC, p.id DESC`, [id]),
    many(`SELECT d.id, d.kind, d.filename, d.created_at, o.id AS order_id, o.ref FROM order_documents d JOIN orders o ON o.id = d.order_id WHERE o.client_id = $1 ORDER BY d.id DESC`, [id]),
  ]);
  renderPanel(req, res, { active: 'clients', title: client.name, body: clientProfile({ client, orders, payments, documents }) });
});

adminSales.post('/api/admin/clients', async (req, res) => {
  const { v, fields, ok } = parseClient(req.body || {});
  if (!ok) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  const id = await tx(async (db) => {
    const c = (await db.query('INSERT INTO clients (name, phone, email, region, address, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [v.name, v.phone, v.email, v.region, v.address, v.notes, req.user.id])).rows[0];
    await logActivity(db, req, 'client.created', 'client', c.id, `Added client ${v.name}`);
    return c.id;
  });
  res.status(201).json({ redirect: `/admin/clients/${id}` });
});

adminSales.put('/api/admin/clients/:id', async (req, res) => {
  const id = idParam(req), { v, fields, ok } = parseClient(req.body || {});
  if (!ok) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  const done = id && await tx(async (db) => {
    const r = await db.query('UPDATE clients SET name=$2, phone=$3, email=$4, region=$5, address=$6, notes=$7, updated_at=now() WHERE id=$1', [id, v.name, v.phone, v.email, v.region, v.address, v.notes]);
    if (r.rowCount) await logActivity(db, req, 'client.updated', 'client', id, `Updated client ${v.name}`);
    return r.rowCount;
  });
  if (!done) return res.status(404).json({ error: 'Client not found.' });
  res.json({ message: 'Client saved.' });
});

/* ------------------------------------------------------------------ manual sale (phone, walk-in, WhatsApp) */
const MAX_ITEMS = 5;
adminSales.get('/admin/orders/new', async (req, res) => {
  const [vehicles, clients] = await Promise.all([
    many("SELECT id, stock_no, make, model, year, price_tzs FROM vehicles WHERE status = 'available' AND deleted_at IS NULL ORDER BY make, model, year"),
    many('SELECT id, name, phone FROM clients ORDER BY lower(name) LIMIT 500'),
  ]);
  renderPanel(req, res, { active: 'orders', title: 'New manual sale', body: manualSale({ vehicles, clients, preset: /^\d+$/.test(req.query.client || '') ? Number(req.query.client) : null, max: MAX_ITEMS }) });
});

adminSales.post('/api/admin/orders', async (req, res) => {
  const b = req.body || {}, fields = {};
  const channel = ['phone', 'walk_in', 'whatsapp'].includes(b.channel) ? b.channel : null; if (!channel) fields.channel = 'Choose how the customer reached you.';
  const clientId = /^\d+$/.test(b.client_id || '') ? Number(b.client_id) : null;
  const nc = clientId ? null : parseClient({ name: b.client_name, phone: b.client_phone, email: b.client_email, region: b.client_region });
  if (nc && !nc.ok) Object.entries(nc.fields).forEach(([k, m]) => { fields[`client_${k}`] = m; });
  const picks = [];
  for (let n = 1; n <= MAX_ITEMS; n++) {
    const vid = /^\d+$/.test(b[`vehicle_${n}`] || '') ? Number(b[`vehicle_${n}`]) : null; if (!vid) continue;
    const raw = str(String(b[`price_${n}`] ?? ''), 30).replace(/[,\s]/g, ''), price = raw ? (/^\d{6,13}$/.test(raw) ? Number(raw) : NaN) : null;
    if (Number.isNaN(price)) fields[`price_${n}`] = 'Enter a whole amount in TZS, at least 100,000.';
    if (picks.some((p) => p.vid === vid)) fields[`vehicle_${n}`] = 'This vehicle is already on the order.';
    picks.push({ n, vid, price });
  }
  if (!picks.length) fields.vehicle_1 = 'Choose at least one vehicle.';
  if (Object.keys(fields).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  const result = await tx(async (db) => {
    const vehicles = (await db.query('SELECT * FROM vehicles WHERE id = ANY($1) AND deleted_at IS NULL FOR UPDATE', [picks.map((p) => p.vid)])).rows;
    const f = {};
    for (const p of picks) {
      const v = vehicles.find((x) => x.id === p.vid);
      if (!v || v.status !== 'available') f[`vehicle_${p.n}`] = 'This vehicle is no longer available.';
      else if (!p.price && !v.price_tzs) f[`price_${p.n}`] = 'This vehicle has no listed price, so an agreed price is required.';
      p.v = v;
    }
    if (Object.keys(f).length) return { fields: f };
    let client = clientId && (await db.query('SELECT id, user_id, name, phone, email FROM clients WHERE id = $1', [clientId])).rows[0];
    if (clientId && !client) return { fields: { client_id: 'Client not found.' } };
    if (!client) {
      client = (await db.query('INSERT INTO clients (name, phone, email, region, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, user_id, name, phone, email', [nc.v.name, nc.v.phone, nc.v.email, nc.v.region, req.user.id])).rows[0];
      await logActivity(db, req, 'client.created', 'client', client.id, `Added client ${client.name}`);
    }
    const ref = await nextRef(db, 'order', 'GM');
    // a manual sale is entered after the deal is agreed, so it starts as Confirmed
    const order = (await db.query(
      `INSERT INTO orders (ref, user_id, client_id, channel, status, customer_name, customer_phone, customer_email, internal_notes, confirmed_at, confirmed_by, created_by)
       VALUES ($1,$2,$3,$4,'confirmed',$5,$6,$7,$8, now(), $9, $9) RETURNING id, ref`,
      [ref, client.user_id, client.id, channel, client.name, client.phone, client.email, str(b.note, 2000) || null, req.user.id])).rows[0];
    for (const p of picks) {
      await db.query('INSERT INTO order_items (order_id, vehicle_id, title, stock_no, mileage_km, colour, listed_price_tzs, agreed_price_tzs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [order.id, p.v.id, itemTitle(p.v), p.v.stock_no, p.v.mileage_km, p.v.colour, p.v.price_tzs, p.price]);
    }
    await db.query("INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by) VALUES ($1, NULL, 'confirmed', 'Manual sale recorded by staff', $2)", [order.id, req.user.id]);
    await syncVehicleStatus(db, order.id);
    await logActivity(db, req, 'order.created_manual', 'order', order.id, `${ref}: manual sale recorded for ${client.name} (${picks.length} vehicle${picks.length === 1 ? '' : 's'})`);
    return { ref };
  });
  if (result.fields) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: result.fields });
  invalidateCatalog();
  res.status(201).json({ redirect: `/admin/orders/${result.ref}` });
});

/* ------------------------------------------------------------------ payments ledger */
function ledgerFilter(query) {
  const q = { from: isDate(query.from) ? query.from : '', to: isDate(query.to) ? query.to : '', method: METHODS[query.method] ? query.method : '', client: str(query.client, 80), admin: /^\d+$/.test(query.admin || '') ? query.admin : '', voided: ['only', 'hide'].includes(query.voided) ? query.voided : '' };
  const where = ['TRUE'], params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.from) add('p.received_on >= ?', q.from);
  if (q.to) add('p.received_on <= ?', q.to);
  if (q.method) add('p.method = ?', q.method);
  if (q.client) add("(c.name || ' ' || COALESCE(c.phone, '') || ' ' || o.ref || ' ' || p.receipt_no) ILIKE ?", like(q.client));
  if (q.admin) add('p.received_by = ?', Number(q.admin));
  if (q.voided === 'only') where.push('p.voided_at IS NOT NULL'); else if (q.voided === 'hide') where.push('p.voided_at IS NULL');
  return { q: Object.fromEntries(Object.entries(q).filter(([, v]) => v)), where: where.join(' AND '), params };
}
const LEDGER_FROM = 'FROM payments p JOIN orders o ON o.id = p.order_id JOIN clients c ON c.id = p.client_id JOIN users r ON r.id = p.received_by';

adminSales.get('/admin/payments', async (req, res) => {
  const { q, where, params } = ledgerFilter(req.query), page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const [rows, sums, admins] = await Promise.all([
    many(`SELECT p.*, o.ref, c.id AS client_id, c.name AS client_name, r.name AS received_by_name ${LEDGER_FROM} WHERE ${where} ORDER BY p.received_on DESC, p.id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, params),
    one(`SELECT count(*) AS n, count(*) FILTER (WHERE p.voided_at IS NULL) AS valid_n, COALESCE(sum(p.amount_tzs) FILTER (WHERE p.voided_at IS NULL), 0)::bigint AS received, count(*) FILTER (WHERE p.voided_at IS NOT NULL) AS voided_n, COALESCE(sum(p.amount_tzs) FILTER (WHERE p.voided_at IS NOT NULL), 0)::bigint AS voided ${LEDGER_FROM} WHERE ${where}`, params),
    many("SELECT id, name FROM users WHERE role = 'admin' ORDER BY name"),
  ]);
  renderPanel(req, res, { active: 'payments', title: 'Payments', body: paymentsLedger({ rows, sums, admins, query: q, paging: { page, pages: Math.max(1, Math.ceil(sums.n / PAGE_SIZE)), total: sums.n, size: PAGE_SIZE } }) });
});

adminSales.get('/admin/payments.csv', async (req, res) => {
  const { where, params } = ledgerFilter(req.query);
  const rows = await many(`SELECT p.*, o.ref, c.name AS client_name, r.name AS received_by_name ${LEDGER_FROM} WHERE ${where} ORDER BY p.received_on DESC, p.id DESC LIMIT 20000`, params);
  sendCsv(res, `gondo-payments-${today()}.csv`, ['Receipt', 'Date received', 'Order', 'Client', 'Paid by', 'Method', 'Reference', 'Amount (TZS)', 'Received by', 'Status', 'Void reason', 'Notes'],
    rows.map((p) => [p.receipt_no, p.received_on, p.ref, p.client_name, p.paid_by, METHODS[p.method], p.reference, p.amount_tzs, p.received_by_name, p.voided_at ? 'Voided' : 'Valid', p.void_reason, p.notes]));
});

/* ------------------------------------------------------------------ reports */
async function reportData(from, to) {
  const range = [from, to];
  const [months, outstanding, models, methods, summary] = await Promise.all([
    many(`WITH m AS (SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS month)
          SELECT to_char(m.month, 'YYYY-MM') AS month,
            (SELECT count(*) FROM orders o WHERE o.status NOT IN ('pending','cancelled') AND o.confirmed_at::date BETWEEN $1 AND $2 AND date_trunc('month', o.confirmed_at)::date = m.month) AS orders,
            COALESCE((SELECT sum(t.grand_total_tzs) FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.status NOT IN ('pending','cancelled') AND o.confirmed_at::date BETWEEN $1 AND $2 AND date_trunc('month', o.confirmed_at)::date = m.month), 0)::bigint AS sales,
            COALESCE((SELECT sum(p.amount_tzs) FROM payments p WHERE p.voided_at IS NULL AND p.received_on BETWEEN $1 AND $2 AND date_trunc('month', p.received_on)::date = m.month), 0)::bigint AS received
          FROM m ORDER BY m.month`, range),
    many(`SELECT c.id, c.name, c.phone, count(*) AS orders, sum(t.grand_total_tzs)::bigint AS total, sum(t.paid_tzs)::bigint AS paid, sum(t.balance_tzs)::bigint AS balance, min(o.balance_due_date) AS due
          FROM orders o JOIN order_totals t ON t.order_id = o.id JOIN clients c ON c.id = o.client_id
          WHERE o.status NOT IN ('pending','cancelled') AND t.balance_tzs > 0 GROUP BY c.id ORDER BY balance DESC LIMIT 200`),
    many(`SELECT v.make, v.model, count(*) AS sold, sum(COALESCE(i.agreed_price_tzs, i.listed_price_tzs, 0))::bigint AS value
          FROM order_items i JOIN orders o ON o.id = i.order_id JOIN vehicles v ON v.id = i.vehicle_id
          WHERE o.status NOT IN ('pending','cancelled') AND o.confirmed_at::date BETWEEN $1 AND $2 GROUP BY v.make, v.model ORDER BY sold DESC, value DESC LIMIT 20`, range),
    many(`SELECT p.method, count(*) AS payments, sum(p.amount_tzs)::bigint AS amount FROM payments p WHERE p.voided_at IS NULL AND p.received_on BETWEEN $1 AND $2 GROUP BY p.method ORDER BY amount DESC`, range),
    one(`SELECT (SELECT count(*) FROM orders o WHERE o.status NOT IN ('pending','cancelled') AND o.confirmed_at::date BETWEEN $1 AND $2) AS orders,
                COALESCE((SELECT sum(t.grand_total_tzs) FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.status NOT IN ('pending','cancelled') AND o.confirmed_at::date BETWEEN $1 AND $2), 0)::bigint AS sales,
                COALESCE((SELECT sum(p.amount_tzs) FROM payments p WHERE p.voided_at IS NULL AND p.received_on BETWEEN $1 AND $2), 0)::bigint AS received,
                COALESCE((SELECT sum(t.balance_tzs) FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.status NOT IN ('pending','cancelled') AND t.balance_tzs > 0), 0)::bigint AS outstanding`, range),
  ]);
  return { months, outstanding, models, methods, summary };
}
function reportRange(query) {
  const to = isDate(query.to) ? query.to : today();
  let from = isDate(query.from) ? query.from : `${to.slice(0, 4)}-01-01`;
  if (from > to) from = to;
  if (Date.parse(to) - Date.parse(from) > 5 * 366 * 864e5) from = `${Number(to.slice(0, 4)) - 5}${to.slice(4)}`; // at most five years per report
  return { from, to };
}

adminSales.get('/admin/reports', async (req, res) => {
  const { from, to } = reportRange(req.query);
  renderPanel(req, res, { active: 'reports', title: 'Reports', body: reportsPage({ from, to, ...(await reportData(from, to)) }) });
});

adminSales.get('/admin/reports/:name.csv', async (req, res, next) => {
  const { from, to } = reportRange(req.query), d = await reportData(from, to), file = (n) => `gondo-${n}-${from}-to-${to}.csv`;
  switch (req.params.name) {
    case 'sales': return sendCsv(res, file('sales'), ['Month', 'Orders confirmed', 'Sales value (TZS)', 'Payments received (TZS)'], d.months.map((m) => [m.month, m.orders, m.sales, m.received]));
    case 'outstanding': return sendCsv(res, file('outstanding'), ['Client', 'Phone', 'Open orders', 'Order total (TZS)', 'Paid (TZS)', 'Balance (TZS)', 'Earliest due date'], d.outstanding.map((c) => [c.name, c.phone, c.orders, c.total, c.paid, c.balance, c.due]));
    case 'models': return sendCsv(res, file('best-sellers'), ['Make', 'Model', 'Vehicles sold', 'Value (TZS)'], d.models.map((m) => [m.make, m.model, m.sold, m.value]));
    case 'methods': return sendCsv(res, file('payment-methods'), ['Method', 'Payments', 'Amount (TZS)'], d.methods.map((m) => [METHODS[m.method], m.payments, m.amount]));
    default: return next();
  }
});

// Admin > Orders: list, order detail, confirm / cancel, agreed pricing and extra costs, payments (record + void),
// purchase details, documents, fulfilment status. Mounted behind requireRole('admin').
// Anything that changes order state or money runs in one transaction and is written to the activity log.
import { Router } from 'express';
import { one, many, tx } from '../db.mjs';
import { str } from '../security.mjs';
import { renderPanel, logActivity } from '../panel.mjs';
import { catalog, invalidateCatalog } from '../catalog.mjs';
import { nextRef, syncVehicleStatus, waUrl, waNumber, eatDate } from '../orders.mjs';
import { cloudinaryReady, signPrivateUpload, verifyUpload, privateDownloadUrl, destroyPrivate } from '../cloudinary.mjs';
import { ordersList, orderDetail } from '../../src/templates/panel/orders.mjs';
import { ORDER_STATUS, PAYMENT_STATUS, flowFor } from '../../src/templates/panel/ui.mjs';
import { METHODS, COSTS } from '../../src/templates/panel/account.mjs';
import { fmt } from '../../src/templates/lib.mjs';

export const adminOrders = Router();
const PAGE_SIZE = 20;
const scripts = ['/assets/js/uploads.js'];
export const DOC_KINDS = { invoice: 'Invoice', export_certificate: 'Export certificate', bill_of_lading: 'Bill of lading', tra_document: 'TRA document', registration_card: 'Registration card', other: 'Other' };
const idParam = (req, name = 'id') => (/^\d{1,12}$/.test(req.params[name]) ? Number(req.params[name]) : null);
const amount = (raw) => { const s = str(String(raw ?? ''), 30).replace(/[,\s]/g, ''); return /^\d{1,13}$/.test(s) ? Number(s) : null; };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d));
const dateOrNull = (raw, fields, key, label) => { const d = str(raw, 10); if (!d) return null; if (!isDate(d)) { fields[key] = `${label} is not a valid date.`; return null; } return d; };
const tzs = (n) => `TZS ${fmt(n)}`;
const logOrder = (db, req, action, order, summary, meta) => logActivity(db, req, action, 'order', order.id, `${order.ref}: ${summary}`, meta);
const lockOrder = async (db, id) => (await db.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id])).rows[0];
const totals = async (db, id) => (await db.query('SELECT * FROM order_totals WHERE order_id = $1', [id])).rows[0];
const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
// Runs a transactional action and turns its result into the JSON response.
const action = (fn) => async (req, res) => {
  const id = idParam(req);
  if (!id) return res.status(404).json({ error: 'Order not found.' });
  const out = await tx((db) => fn(db, req, id));
  if (out && out.status) return res.status(out.status).json(out.body);
  invalidateCatalog(); // vehicle availability may have changed
  res.json({ message: (out && out.message) || 'Saved.', ...(out && out.extra) });
};

/* ---------- list ---------- */
adminOrders.get('/admin/orders', async (req, res) => {
  const q = { q: str(req.query.q, 80), status: str(req.query.status, 20), payment: str(req.query.payment, 20), overdue: req.query.overdue === '1' ? '1' : '' };
  const where = ['TRUE'], params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace(/\?/g, `$${params.length}`)); };
  if (q.q) add("(o.ref || ' ' || o.customer_name || ' ' || COALESCE(o.customer_phone, '') || ' ' || COALESCE(o.customer_email::text, '')) ILIKE ?", `%${q.q.replace(/[%_\\]/g, '\\$&')}%`);
  if (ORDER_STATUS[q.status]) add('o.status = ?', q.status); else if (q.status === 'active') where.push("o.status NOT IN ('pending', 'cancelled', 'delivered')"); else q.status = '';
  if (PAYMENT_STATUS[q.payment]) { add('t.payment_status = ?', q.payment); where.push("o.status NOT IN ('pending', 'cancelled')"); } else q.payment = '';
  if (q.overdue) where.push("o.status NOT IN ('pending', 'cancelled') AND t.balance_tzs > 0 AND o.balance_due_date < CURRENT_DATE");
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const rows = await many(
    `SELECT o.id, o.ref, o.status, o.channel, o.customer_name, o.customer_phone, o.created_at, o.balance_due_date, count(*) OVER() AS total,
            t.grand_total_tzs, t.paid_tzs, t.balance_tzs, t.payment_status, t.unpriced_items,
            (SELECT string_agg(i.title, ' · ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id) AS vehicles,
            (SELECT count(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
     FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE ${where.join(' AND ')}
     ORDER BY o.created_at DESC, o.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = rows.length ? rows[0].total : 0;
  const counts = await one(`SELECT count(*) FILTER (WHERE status = 'pending') AS pending, count(*) FILTER (WHERE status NOT IN ('pending','cancelled','delivered')) AS active, count(*) AS all FROM orders`);
  const query = Object.fromEntries(Object.entries(q).filter(([, v]) => v));
  renderPanel(req, res, { active: 'orders', title: 'Orders', body: ordersList({ rows, query, counts, paging: { page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, size: PAGE_SIZE } }) });
});

/* ---------- detail ---------- */
export async function loadOrder(where, params) {
  const order = await one(
    `SELECT o.*, t.listed_total_tzs, t.vehicles_total_tzs, t.extras_total_tzs, t.grand_total_tzs, t.paid_tzs, t.balance_tzs, t.payment_status, t.unpriced_items, t.payment_count,
            c.name AS client_name, c.phone AS client_phone, cu.name AS confirmed_by_name
     FROM orders o JOIN order_totals t ON t.order_id = o.id LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN users cu ON cu.id = o.confirmed_by
     WHERE ${where}`, params);
  if (!order) return null;
  const [items, costs, payments, documents, history, activity] = await Promise.all([
    many(`SELECT i.*, v.slug, v.source, v.status AS vehicle_status, v.deleted_at,
                 (SELECT thumb_url FROM vehicle_photos p WHERE p.vehicle_id = v.id ORDER BY is_cover DESC, position, id LIMIT 1) AS thumb
          FROM order_items i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.order_id = $1 ORDER BY i.id`, [order.id]),
    many('SELECT * FROM order_costs WHERE order_id = $1 ORDER BY id', [order.id]),
    many(`SELECT p.*, r.name AS received_by_name, vb.name AS voided_by_name FROM payments p JOIN users r ON r.id = p.received_by LEFT JOIN users vb ON vb.id = p.voided_by
          WHERE p.order_id = $1 ORDER BY p.received_on DESC, p.id DESC`, [order.id]),
    many('SELECT d.*, u.name AS uploaded_by_name FROM order_documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.order_id = $1 ORDER BY d.id DESC', [order.id]),
    many('SELECT h.*, u.name AS changed_by_name FROM order_status_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.order_id = $1 ORDER BY h.created_at, h.id', [order.id]),
    many("SELECT action, summary, actor_name, created_at FROM activity_log WHERE entity_type = 'order' AND entity_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100", [order.id]),
  ]);
  return { order, items, costs, payments, documents, history, activity, isImport: items.some((i) => i.source === 'japan_auction') };
}

adminOrders.get('/admin/orders/:ref', async (req, res, next) => {
  if (!/^GM-\d{4}-\d{5,}$/.test(req.params.ref)) return next();
  const data = await loadOrder('o.ref = $1', [req.params.ref]);
  if (!data) return next();
  const o = data.order, phone = waNumber(o.customer_phone || o.client_phone);
  const waReply = phone ? waUrl(phone, `Hello ${o.customer_name}, this is Gondo Motors about your order ${o.ref}.`) : null;
  const waStatement = phone && !['pending', 'cancelled'].includes(o.status)
    ? waUrl(phone, `Hello ${o.customer_name},\n\n*Gondo Motors — order ${o.ref}*\nTotal: ${tzs(o.grand_total_tzs)}\nPaid so far: ${tzs(o.paid_tzs)}\n*Balance due: ${tzs(Math.max(0, o.balance_tzs))}*\n\nThank you.`) : null;
  const receiptLinks = Object.fromEntries(data.payments.filter((p) => !p.voided_at).map((p) => [p.id, phone ? waUrl(phone,
    `Hello ${o.customer_name},\n\n*Gondo Motors — payment receipt ${p.receipt_no}*\nOrder: ${o.ref}\nReceived: ${tzs(p.amount_tzs)} by ${METHODS[p.method]} on ${eatDate(new Date(`${p.received_on}T12:00:00Z`))}${p.reference ? `\nReference: ${p.reference}` : ''}\nBalance due: ${tzs(Math.max(0, o.balance_tzs))}\n\nThank you.`) : null]));
  renderPanel(req, res, { active: 'orders', title: `Order ${o.ref}`, scripts, body: orderDetail({ ...data, waReply, waStatement, receiptLinks, uploadsReady: cloudinaryReady, today: new Date().toISOString().slice(0, 10) }) });
});

/* ---------- confirm / cancel ---------- */
adminOrders.post('/api/admin/orders/:id/confirm', action(async (db, req, id) => {
  const o = await lockOrder(db, id);
  if (!o) return fail(404, 'Order not found.');
  if (o.status !== 'pending') return fail(409, 'This order has already been confirmed or cancelled.');
  const items = (await db.query('SELECT i.id, i.title, i.listed_price_tzs, i.agreed_price_tzs, v.id AS vehicle_id, v.status, v.deleted_at FROM order_items i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.order_id = $1 ORDER BY i.id FOR UPDATE OF v', [id])).rows;
  const taken = items.filter((i) => i.status !== 'available' || i.deleted_at);
  if (taken.length) return fail(409, `${taken.map((t) => t.title).join(', ')} ${taken.length === 1 ? 'is' : 'are'} no longer available (reserved, sold or removed). Cancel this order or ask the customer to choose another vehicle.`);
  const unpriced = items.filter((i) => !i.agreed_price_tzs && !i.listed_price_tzs);
  if (unpriced.length) return fail(422, `Set the agreed price for ${unpriced.map((u) => u.title).join(', ')} before confirming.`, { tab: 'pricing' });
  // the customer becomes a client: reuse their client record if they have one
  let clientId = o.client_id || (o.user_id && (await db.query('SELECT id FROM clients WHERE user_id = $1', [o.user_id])).rows[0]?.id);
  if (!clientId) clientId = (await db.query('INSERT INTO clients (user_id, name, phone, email, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [o.user_id, o.customer_name, o.customer_phone, o.customer_email, req.user.id])).rows[0].id;
  await db.query("UPDATE orders SET status = 'confirmed', client_id = $2, confirmed_at = now(), confirmed_by = $3, updated_at = now() WHERE id = $1", [id, clientId, req.user.id]);
  await db.query("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by) VALUES ($1, 'pending', 'confirmed', $2)", [id, req.user.id]);
  await syncVehicleStatus(db, id);
  await logOrder(db, req, 'order.confirmed', o, `confirmed for ${o.customer_name}; ${items.length} vehicle${items.length === 1 ? '' : 's'} reserved`);
  return { message: 'Order confirmed. The vehicles are now reserved.' };
}));

adminOrders.post('/api/admin/orders/:id/cancel', action(async (db, req, id) => {
  const reason = str(req.body.reason, 300);
  if (reason.length < 3) return fail(422, 'Give a reason for cancelling.', { fields: { reason: 'A reason is required.' } });
  const o = await lockOrder(db, id);
  if (!o) return fail(404, 'Order not found.');
  if (o.status === 'cancelled') return fail(409, 'This order is already cancelled.');
  if (o.status === 'delivered') return fail(409, 'A delivered order cannot be cancelled.');
  const t = await totals(db, id);
  if (t.paid_tzs > 0 && req.body.confirmed !== '1') return fail(409, 'This order has recorded payments.', { confirm: { title: `Cancel an order with ${tzs(t.paid_tzs)} paid?`, message: 'The payments stay in the ledger. If money is returned to the customer, void those payments with a reason afterwards.', label: 'Cancel order' } });
  await db.query("UPDATE orders SET status = 'cancelled', cancel_reason = $2, cancelled_at = now(), updated_at = now() WHERE id = $1", [id, reason]);
  await db.query("INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by) VALUES ($1, $2, 'cancelled', $3, $4)", [id, o.status, reason, req.user.id]);
  if (o.status !== 'pending') await syncVehicleStatus(db, id); // a pending order never reserved anything
  await logOrder(db, req, 'order.cancelled', o, `cancelled — ${reason}`, { from: o.status });
  return { message: o.status === 'pending' ? 'Order cancelled.' : 'Order cancelled. The vehicles are available again.' };
}));

/* ---------- agreed prices and extra costs ---------- */
adminOrders.put('/api/admin/orders/:id/pricing', action(async (db, req, id) => {
  const o = await lockOrder(db, id);
  if (!o) return fail(404, 'Order not found.');
  if (o.status === 'cancelled') return fail(409, 'A cancelled order cannot be changed.');
  const items = (await db.query('SELECT id, title, listed_price_tzs, agreed_price_tzs FROM order_items WHERE order_id = $1', [id])).rows;
  const changes = [], fields = {};
  for (const i of items) {
    const raw = req.body[`price_${i.id}`];
    if (raw === undefined) continue;
    const v = str(String(raw), 30) ? amount(raw) : null;
    if (str(String(raw), 30) && (!v || v < 100_000)) { fields[`price_${i.id}`] = 'Enter a whole amount in TZS, at least 100,000.'; continue; }
    if ((v || null) !== (i.agreed_price_tzs || null)) changes.push({ i, v });
  }
  if (Object.keys(fields).length) return fail(422, 'Please fix the highlighted prices.', { fields });
  for (const { i, v } of changes) {
    await db.query('UPDATE order_items SET agreed_price_tzs = $2 WHERE id = $1', [i.id, v]);
    await logOrder(db, req, 'order.price_changed', o, `agreed price for ${i.title} ${v ? `set to ${tzs(v)}` : 'removed'}${i.agreed_price_tzs ? ` (was ${tzs(i.agreed_price_tzs)})` : i.listed_price_tzs ? ` (listed ${tzs(i.listed_price_tzs)})` : ''}`, { item: i.id, from: i.agreed_price_tzs, to: v });
  }
  await syncVehicleStatus(db, id);
  return { message: changes.length ? 'Agreed prices saved.' : 'No price changes.' };
}));

adminOrders.post('/api/admin/orders/:id/costs', action(async (db, req, id) => {
  const kind = str(req.body.kind, 30), label = str(req.body.label, 80) || null, amt = amount(req.body.amount), fields = {};
  if (!COSTS[kind]) fields.kind = 'Choose a cost type.';
  if (!amt) fields.amount = 'Enter a whole amount in TZS.';
  if (kind === 'other' && !label) fields.label = 'Describe this cost.';
  if (Object.keys(fields).length) return fail(422, 'Please fix the highlighted fields.', { fields });
  const o = await lockOrder(db, id);
  if (!o) return fail(404, 'Order not found.');
  if (o.status === 'cancelled') return fail(409, 'A cancelled order cannot be changed.');
  await db.query('INSERT INTO order_costs (order_id, kind, label, amount_tzs, created_by) VALUES ($1,$2,$3,$4,$5)', [id, kind, label, amt, req.user.id]);
  await syncVehicleStatus(db, id);
  await logOrder(db, req, 'order.cost_added', o, `added ${label || COSTS[kind]} ${tzs(amt)}`);
  return { message: 'Cost added.' };
}));

adminOrders.delete('/api/admin/orders/:id/costs/:costId', action(async (db, req, id) => {
  const o = await lockOrder(db, id), costId = idParam(req, 'costId');
  if (!o || !costId) return fail(404, 'Not found.');
  if (o.status === 'cancelled') return fail(409, 'A cancelled order cannot be changed.');
  const c = (await db.query('DELETE FROM order_costs WHERE id = $1 AND order_id = $2 RETURNING kind, label, amount_tzs', [costId, id])).rows[0];
  if (!c) return fail(404, 'Cost not found.');
  await syncVehicleStatus(db, id);
  await logOrder(db, req, 'order.cost_removed', o, `removed ${c.label || COSTS[c.kind]} ${tzs(c.amount_tzs)}`);
  return { message: 'Cost removed.' };
}));

/* ---------- payments ---------- */
adminOrders.post('/api/admin/orders/:id/payments', action(async (db, req, id) => {
  const b = req.body, fields = {};
  const amt = amount(b.amount); if (!amt) fields.amount = 'Enter the amount received in TZS.';
  const receivedOn = str(b.received_on, 10); if (!isDate(receivedOn)) fields.received_on = 'Enter the date the money was received.'; else if (receivedOn > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) fields.received_on = 'The date cannot be in the future.';
  const method = str(b.method, 20); if (!METHODS[method]) fields.method = 'Choose a payment method.';
  const reference = str(b.reference, 80) || null; if (!reference && ['bank_transfer', 'mpesa', 'tigo_pesa', 'airtel_money', 'cheque'].includes(method)) fields.reference = `A transaction or reference number is required for ${METHODS[method]}.`;
  const paidBy = str(b.paid_by, 80); if (paidBy.length < 2) fields.paid_by = 'Enter who made the payment.';
  if (Object.keys(fields).length) return fail(422, 'Please fix the highlighted fields.', { fields });
  let proof = null;
  if (b.proof_public_id) {
    if (!verifyUpload({ public_id: b.proof_public_id, version: b.proof_version, signature: b.proof_signature }) || !b.proof_public_id.startsWith(`gondo/orders/${id}/proofs/`)) return fail(422, 'The proof upload could not be verified. Please attach it again.');
    proof = { id: b.proof_public_id, format: str(b.proof_format, 10) || null, name: str(b.proof_filename, 120) || 'proof' };
  }
  const o = await lockOrder(db, id); // serialises payments on this order so two admins cannot both overpay
  if (!o) return fail(404, 'Order not found.');
  if (o.status === 'pending') return fail(409, 'Confirm the order before recording a payment.');
  if (o.status === 'cancelled') return fail(409, 'Payments cannot be added to a cancelled order.');
  const t = await totals(db, id), balance = Math.max(0, t.balance_tzs);
  const over = amt > balance;
  if (over && b.confirmed !== '1') return fail(409, 'This payment is more than the balance due.', { confirm: { title: 'Record an overpayment?', message: `The balance due is ${tzs(balance)} but this payment is ${tzs(amt)} — ${tzs(amt - balance)} more. Record it only if the customer really paid this amount.`, label: 'Record overpayment' } });
  const receiptNo = await nextRef(db, 'receipt', 'RC');
  await db.query(
    `INSERT INTO payments (receipt_no, order_id, client_id, amount_tzs, received_on, method, reference, paid_by, received_by, proof_public_id, proof_resource_type, proof_format, proof_filename, notes, overpayment_confirmed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [receiptNo, id, o.client_id, amt, receivedOn, method, reference, paidBy, req.user.id, proof && proof.id, proof && 'image', proof && proof.format, proof && proof.name, str(b.notes, 500) || null, over]);
  await syncVehicleStatus(db, id);
  const after = await totals(db, id);
  await logOrder(db, req, 'payment.recorded', o, `payment ${receiptNo} of ${tzs(amt)} by ${METHODS[method]}${over ? ' (overpayment confirmed)' : ''}; balance now ${tzs(Math.max(0, after.balance_tzs))}`, { receipt: receiptNo, amount: amt });
  return { message: `Payment recorded. Receipt ${receiptNo}.${after.payment_status === 'fully_paid' ? ' The order is now fully paid.' : ''}` };
}));

adminOrders.post('/api/admin/orders/:id/payments/:paymentId/void', action(async (db, req, id) => {
  const reason = str(req.body.reason, 300), paymentId = idParam(req, 'paymentId');
  if (reason.length < 3) return fail(422, 'Give a reason for voiding this payment.', { fields: { reason: 'A reason is required.' } });
  const o = await lockOrder(db, id);
  const p = o && paymentId && (await db.query('SELECT * FROM payments WHERE id = $1 AND order_id = $2 FOR UPDATE', [paymentId, id])).rows[0];
  if (!p) return fail(404, 'Payment not found.');
  if (p.voided_at) return fail(409, 'This payment is already voided.');
  await db.query('UPDATE payments SET voided_at = now(), voided_by = $2, void_reason = $3 WHERE id = $1', [paymentId, req.user.id, reason]);
  await syncVehicleStatus(db, id);
  await logOrder(db, req, 'payment.voided', o, `payment ${p.receipt_no} of ${tzs(p.amount_tzs)} voided — ${reason}`, { receipt: p.receipt_no, amount: p.amount_tzs });
  return { message: `Payment ${p.receipt_no} voided. It stays in the history.` };
}));

/* ---------- purchase details ---------- */
adminOrders.put('/api/admin/orders/:id/details', action(async (db, req, id) => {
  const b = req.body, fields = {};
  const v = {
    delivery_region: str(b.delivery_region, 60) || null, delivery_address: str(b.delivery_address, 200) || null,
    expected_delivery: dateOrNull(b.expected_delivery, fields, 'expected_delivery', 'Expected delivery'), actual_delivery: dateOrNull(b.actual_delivery, fields, 'actual_delivery', 'Actual delivery'),
    vessel: str(b.vessel, 80) || null, bill_of_lading_no: str(b.bill_of_lading_no, 60) || null, shipping_eta: dateOrNull(b.shipping_eta, fields, 'shipping_eta', 'ETA'),
    balance_due_date: dateOrNull(b.balance_due_date, fields, 'balance_due_date', 'Balance due date'), internal_notes: str(b.internal_notes, 2000) || null,
  };
  if (Object.keys(fields).length) return fail(422, 'Please fix the highlighted dates.', { fields });
  const o = await lockOrder(db, id);
  if (!o) return fail(404, 'Order not found.');
  const cols = Object.keys(v);
  await db.query(`UPDATE orders SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [id, ...cols.map((c) => v[c])]);
  const items = (await db.query('SELECT id FROM order_items WHERE order_id = $1', [id])).rows;
  for (const i of items) {
    if (b[`vin_${i.id}`] === undefined) continue;
    await db.query('UPDATE order_items SET vin = $2, engine_no = $3, registration_no = $4 WHERE id = $1', [i.id, str(b[`vin_${i.id}`], 40).toUpperCase() || null, str(b[`engine_${i.id}`], 40).toUpperCase() || null, str(b[`reg_${i.id}`], 20).toUpperCase() || null]);
  }
  await logOrder(db, req, 'order.details_updated', o, 'purchase details updated');
  return { message: 'Purchase details saved.' };
}));

/* ---------- fulfilment status ---------- */
adminOrders.post('/api/admin/orders/:id/status', action(async (db, req, id) => {
  const to = str(req.body.to, 20), note = str(req.body.note, 300) || null;
  const o = await lockOrder(db, id);
  if (!o) return fail(404, 'Order not found.');
  if (['pending', 'cancelled'].includes(o.status)) return fail(409, o.status === 'pending' ? 'Confirm the order first.' : 'A cancelled order cannot be changed.');
  const isImport = (await db.query("SELECT 1 FROM order_items i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.order_id = $1 AND v.source = 'japan_auction' LIMIT 1", [id])).rowCount > 0;
  if (!flowFor(isImport).includes(to) || to === o.status) return fail(422, 'Choose a different status.', { fields: { to: 'Choose the next status.' } });
  await db.query(`UPDATE orders SET status = $2, actual_delivery = CASE WHEN $2 = 'delivered' THEN COALESCE(actual_delivery, CURRENT_DATE) ELSE actual_delivery END, updated_at = now() WHERE id = $1`, [id, to]);
  await db.query('INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by) VALUES ($1,$2,$3,$4,$5)', [id, o.status, to, note, req.user.id]);
  await syncVehicleStatus(db, id);
  await logOrder(db, req, 'order.status_changed', o, `status changed from ${ORDER_STATUS[o.status][1]} to ${ORDER_STATUS[to][1]}${note ? ` — ${note}` : ''}`, { from: o.status, to });
  return { message: `Status updated to ${ORDER_STATUS[to][1]}.` };
}));

/* ---------- private uploads: payment proofs and order documents ---------- */
adminOrders.post('/api/admin/orders/:id/uploads/sign', async (req, res) => {
  if (!cloudinaryReady) return res.status(503).json({ error: 'File uploads are not set up yet.' });
  const id = idParam(req), kind = req.body.kind === 'proof' ? 'proofs' : 'documents';
  if (!id || !(await one('SELECT 1 FROM orders WHERE id = $1', [id]))) return res.status(404).json({ error: 'Order not found.' });
  res.json(signPrivateUpload(`gondo/orders/${id}/${kind}`, 'image'));
});

adminOrders.post('/api/admin/orders/:id/documents', action(async (db, req, id) => {
  const b = req.body, kind = str(b.kind, 30);
  if (!DOC_KINDS[kind]) return fail(422, 'Choose the document type.', { fields: { kind: 'Choose the document type.' } });
  if (!b.public_id) return fail(422, 'Choose a file to upload.', { fields: { file: 'Choose a file to upload.' } });
  if (!verifyUpload({ public_id: b.public_id, version: b.version, signature: b.signature }) || !b.public_id.startsWith(`gondo/orders/${id}/documents/`)) return fail(422, 'That upload could not be verified. Please try again.');
  const o = await lockOrder(db, id);
  if (!o) return fail(404, 'Order not found.');
  const name = str(b.filename, 120) || DOC_KINDS[kind];
  await db.query('INSERT INTO order_documents (order_id, kind, filename, cloud_public_id, cloud_resource_type, cloud_format, visible_to_customer, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, kind, name, b.public_id, 'image', str(b.format, 10) || null, b.visible === '1', req.user.id]);
  await logOrder(db, req, 'order.document_added', o, `uploaded ${DOC_KINDS[kind]} (${name})`);
  return { message: 'Document uploaded.' };
}));

adminOrders.post('/api/admin/orders/:id/documents/:docId/visibility', action(async (db, req, id) => {
  const docId = idParam(req, 'docId');
  const d = docId && (await db.query('UPDATE order_documents SET visible_to_customer = NOT visible_to_customer WHERE id = $1 AND order_id = $2 RETURNING filename, visible_to_customer', [docId, id])).rows[0];
  if (!d) return fail(404, 'Document not found.');
  const o = await lockOrder(db, id);
  await logOrder(db, req, 'order.document_visibility', o, `${d.filename} ${d.visible_to_customer ? 'shared with' : 'hidden from'} the customer`);
  return { message: d.visible_to_customer ? 'The customer can now see this document.' : 'Hidden from the customer.' };
}));

adminOrders.delete('/api/admin/orders/:id/documents/:docId', action(async (db, req, id) => {
  const docId = idParam(req, 'docId');
  const d = docId && (await db.query('DELETE FROM order_documents WHERE id = $1 AND order_id = $2 RETURNING filename, cloud_public_id', [docId, id])).rows[0];
  if (!d) return fail(404, 'Document not found.');
  const o = await lockOrder(db, id);
  await logOrder(db, req, 'order.document_deleted', o, `deleted document ${d.filename}`);
  destroyPrivate(d.cloud_public_id).catch((err) => console.error('Cloudinary delete failed:', err.message));
  return { message: 'Document deleted.' };
}));

// Downloads: checked here, then redirected to a link that expires in a minute.
adminOrders.get('/admin/orders/:id/documents/:docId/download', async (req, res, next) => {
  const d = idParam(req) && idParam(req, 'docId') && await one('SELECT cloud_public_id, cloud_format FROM order_documents WHERE id = $1 AND order_id = $2', [idParam(req, 'docId'), idParam(req)]);
  if (!d) return next();
  res.redirect(privateDownloadUrl({ publicId: d.cloud_public_id, format: d.cloud_format }));
});
adminOrders.get('/admin/payments/:id/proof', async (req, res, next) => {
  const p = idParam(req) && await one('SELECT proof_public_id, proof_format FROM payments WHERE id = $1 AND proof_public_id IS NOT NULL', [idParam(req)]);
  if (!p) return next();
  res.redirect(privateDownloadUrl({ publicId: p.proof_public_id, format: p.proof_format }));
});

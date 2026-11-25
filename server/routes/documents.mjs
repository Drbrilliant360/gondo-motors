// Receipt and invoice PDFs, plus customer downloads of documents shared with them.
// Admin routes sit behind requireRole('admin'); customer routes are scoped to req.user.id in every query.
import { Router } from 'express';
import { one, many } from '../db.mjs';
import { catalog } from '../catalog.mjs';
import { receiptPdf, invoicePdf } from '../pdf.mjs';
import { privateDownloadUrl } from '../cloudinary.mjs';

export const documents = Router();
const REF = /^GM-\d{4}-\d{5,}$/, RC = /^RC-\d{4}-\d{5,}$/;
const business = async () => { const c = await catalog(); return { name: 'Gondo Motors Co. Ltd.', ...(c.settings.business || {}) }; };
const orderTotals = (id) => one('SELECT * FROM order_totals WHERE order_id = $1', [id]);

async function sendInvoice(req, res, next, where, params) {
  const order = await one(`SELECT o.* FROM orders o WHERE ${where} AND o.status NOT IN ('pending', 'cancelled')`, params);
  if (!order) return next();
  const [items, costs, payments, totals] = await Promise.all([
    many('SELECT title, stock_no, vin, registration_no, listed_price_tzs, agreed_price_tzs FROM order_items WHERE order_id = $1 ORDER BY id', [order.id]),
    many('SELECT kind, label, amount_tzs FROM order_costs WHERE order_id = $1 ORDER BY id', [order.id]),
    many('SELECT receipt_no, received_on, method, reference, amount_tzs FROM payments WHERE order_id = $1 AND voided_at IS NULL ORDER BY received_on, id', [order.id]),
    orderTotals(order.id),
  ]);
  invoicePdf(res, { business: await business(), order, items, costs, payments, totals, download: req.query.download === '1' });
}
async function sendReceipt(req, res, next, where, params) {
  const payment = await one(`SELECT p.*, r.name AS received_by_name FROM payments p JOIN orders o ON o.id = p.order_id JOIN users r ON r.id = p.received_by WHERE ${where}`, params);
  if (!payment) return next();
  const order = await one('SELECT ref, customer_name, customer_phone, customer_email FROM orders WHERE id = $1', [payment.order_id]);
  order.items = await many('SELECT title, stock_no FROM order_items WHERE order_id = $1 ORDER BY id', [payment.order_id]);
  receiptPdf(res, { business: await business(), payment, order, totals: await orderTotals(payment.order_id), download: req.query.download === '1' });
}

documents.get('/admin/orders/:ref/invoice.pdf', (req, res, next) => (REF.test(req.params.ref) ? sendInvoice(req, res, next, 'o.ref = $1', [req.params.ref]) : next()));
documents.get('/admin/payments/:receipt/receipt.pdf', (req, res, next) => (RC.test(req.params.receipt) ? sendReceipt(req, res, next, 'p.receipt_no = $1', [req.params.receipt]) : next()));

// Customers: read-only, their own orders only, never voided payments or staff-only documents.
documents.get('/account/orders/:ref/invoice.pdf', (req, res, next) => (REF.test(req.params.ref) ? sendInvoice(req, res, next, 'o.ref = $1 AND o.user_id = $2', [req.params.ref, req.user.id]) : next()));
documents.get('/account/receipts/:receipt.pdf', (req, res, next) => (RC.test(req.params.receipt) ? sendReceipt(req, res, next, 'p.receipt_no = $1 AND o.user_id = $2 AND p.voided_at IS NULL', [req.params.receipt, req.user.id]) : next()));
documents.get('/account/orders/:ref/documents/:docId', async (req, res, next) => {
  if (!REF.test(req.params.ref) || !/^\d{1,12}$/.test(req.params.docId)) return next();
  const d = await one(
    `SELECT d.cloud_public_id, d.cloud_format FROM order_documents d JOIN orders o ON o.id = d.order_id
     WHERE d.id = $1 AND o.ref = $2 AND o.user_id = $3 AND d.visible_to_customer`, [Number(req.params.docId), req.params.ref, req.user.id]);
  if (!d) return next();
  res.redirect(privateDownloadUrl({ publicId: d.cloud_public_id, format: d.cloud_format }));
});

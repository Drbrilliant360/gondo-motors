// Branded PDFs: payment receipt (RC-…) and order invoice / statement. Generated on request from the saved records,
// so a reprinted document always matches the ledger.
import PDFDocument from 'pdfkit';
import { fmt } from '../src/templates/lib.mjs';
import { METHODS, COSTS } from '../src/templates/panel/account.mjs';
import { ORDER_STATUS, PAYMENT_STATUS } from '../src/templates/panel/ui.mjs';

const NAVY = '#1a1a2e', ACCENT = '#e94560', MUTED = '#666b7d', LINE = '#e5e7ee', GOOD = '#14825a', BG = '#f6f7fa';
const L = 48, R = 547, W = R - L;
const tzs = (n) => `TZS ${fmt(n || 0)}`;
const day = (d) => (d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' }).format(typeof d === 'string' && d.length === 10 ? new Date(`${d}T12:00:00Z`) : new Date(d)) : '—');

function start(res, filename, download) {
  const doc = new PDFDocument({ size: 'A4', margin: L, info: { Title: filename.replace('.pdf', ''), Author: 'Gondo Motors' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);
  return doc;
}

function header(doc, business, title, number, rows) {
  doc.rect(0, 0, 595, 8).fill(ACCENT);
  doc.roundedRect(L, 36, 30, 30, 8).fill(NAVY);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(13).text('G', L, 45, { width: 30, align: 'center' });
  doc.fillColor(NAVY).fontSize(17).text('GONDO', L + 40, 42, { continued: true }).fillColor(ACCENT).text('MOTORS');
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  doc.text([business.name, business.address, [business.phone, business.email].filter(Boolean).join('  ·  '), business.tin ? `TIN ${business.tin}` : ''].filter(Boolean).join('\n'), L, 76, { width: 280, lineGap: 2 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY).text(title, 300, 38, { width: R - 300, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(number, 300, 64, { width: R - 300, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  let y = 84;
  for (const [k, v] of rows) { doc.fillColor(MUTED).text(k, 300, y, { width: R - 300 - 118, align: 'right' }); doc.fillColor(NAVY).text(v, R - 112, y, { width: 112, align: 'right' }); y += 13; }
  doc.moveTo(L, 136).lineTo(R, 136).lineWidth(1).strokeColor(LINE).stroke();
  return 152;
}

function block(doc, x, y, title, lines, width = 230) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(title.toUpperCase(), x, y, { characterSpacing: 0.6 });
  doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(lines.filter(Boolean).join('\n'), x, y + 13, { width, lineGap: 2.5 });
  return doc.y;
}

// Simple table: cols = [{ label, width, align }], rows = array of string arrays. Returns the y after the table.
function table(doc, y, cols, rows) {
  const draw = (cells, yy, bold, colour) => {
    let x = L, h = 0;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 8 : 9.5);
    cells.forEach((c, i) => { h = Math.max(h, doc.heightOfString(String(c), { width: cols[i].width - 12 })); });
    cells.forEach((c, i) => { doc.fillColor(colour || NAVY).text(String(c), x + 6, yy, { width: cols[i].width - 12, align: cols[i].align || 'left' }); x += cols[i].width; });
    return yy + h;
  };
  doc.rect(L, y, W, 20).fill(BG);
  draw(cols.map((c) => c.label.toUpperCase()), y + 6.5, true, MUTED);
  y += 26;
  for (const row of rows) {
    if (y > 720) { doc.addPage(); y = 56; }
    y = draw(row, y, false) + 6;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(LINE).stroke();
    y += 6;
  }
  return y;
}

function totalsBox(doc, y, rows) {
  if (y > 640) { doc.addPage(); y = 56; }
  const x = 330, w = R - x;
  for (const [label, value, style] of rows) {
    if (style === 'strong') { doc.roundedRect(x, y - 4, w, 26, 6).fill(NAVY); doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#fff').text(label, x + 10, y + 3).text(value, x, y + 3, { width: w - 10, align: 'right' }); y += 30; continue; }
    doc.font(style === 'bold' ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(style === 'good' ? GOOD : style === 'bold' ? NAVY : MUTED).text(label, x + 10, y);
    doc.fillColor(style === 'good' ? GOOD : NAVY).text(value, x, y, { width: w - 10, align: 'right' });
    y += 17;
  }
  return y;
}

function footer(doc, text) {
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(text, L, 780, { width: W, align: 'center', lineBreak: false });
}

/* ---------- receipt ---------- */
export function receiptPdf(res, { business, payment: p, order: o, totals: t, download }) {
  const doc = start(res, `${p.receipt_no}.pdf`, download);
  let y = header(doc, business, 'RECEIPT', p.receipt_no, [['Date received', day(p.received_on)], ['Order', o.ref]]);
  block(doc, L, y, 'Received from', [p.paid_by, o.customer_name !== p.paid_by ? `Client: ${o.customer_name}` : '', o.customer_phone, o.customer_email]);
  block(doc, 320, y, 'Payment details', [`Method: ${METHODS[p.method]}`, p.reference ? `Reference: ${p.reference}` : '', `Received by: ${p.received_by_name}`], R - 320);
  y += 86;
  doc.roundedRect(L, y, W, 64, 10).fill(BG);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('AMOUNT RECEIVED', L + 18, y + 14, { characterSpacing: 0.6 });
  doc.font('Helvetica-Bold').fontSize(24).fillColor(NAVY).text(tzs(p.amount_tzs), L + 18, y + 28);
  if (p.voided_at) doc.font('Helvetica-Bold').fontSize(22).fillColor(ACCENT).text('VOIDED', 360, y + 22, { width: R - 378, align: 'right' });
  y += 86;
  y = table(doc, y, [{ label: 'Vehicle', width: W - 120 }, { label: 'Stock no.', width: 120, align: 'right' }], o.items.map((i) => [i.title, i.stock_no]));
  y = totalsBox(doc, y + 10, [['Order total', tzs(t.grand_total_tzs)], ['Total paid to date', tzs(t.paid_tzs), 'good'], ['Balance due', tzs(Math.max(0, t.balance_tzs)), 'strong']]);
  if (p.notes) { doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Note: ${p.notes}`, L, y + 8, { width: W }); }
  footer(doc, `This receipt confirms payment received by ${business.name.replace(/\.$/, '')}. Thank you for your business.`);
  doc.end();
}

/* ---------- invoice / statement ---------- */
export function invoicePdf(res, { business, order: o, items, costs, payments, totals: t, download }) {
  const doc = start(res, `Invoice-${o.ref}.pdf`, download);
  let y = header(doc, business, 'INVOICE', o.ref, [['Issued', day(new Date())], ['Order date', day(o.created_at)], ['Status', ORDER_STATUS[o.status][1]]]);
  block(doc, L, y, 'Bill to', [o.customer_name, o.customer_phone, o.customer_email, [o.delivery_region, o.delivery_address].filter(Boolean).join(', ')]);
  block(doc, 320, y, 'Payment', [`Status: ${PAYMENT_STATUS[t.payment_status][1]}`, o.balance_due_date ? `Balance due by: ${day(o.balance_due_date)}` : '', 'Pay by bank transfer, mobile money or cash to Gondo Motors.'], R - 320);
  y += 92;
  y = table(doc, y, [{ label: 'Description', width: W - 250 }, { label: 'Details', width: 130 }, { label: 'Amount', width: 120, align: 'right' }], [
    ...items.map((i) => [i.title, [`Stock ${i.stock_no}`, i.vin ? `VIN ${i.vin}` : '', i.registration_no ? `Plate ${i.registration_no}` : ''].filter(Boolean).join('\n'), i.agreed_price_tzs || i.listed_price_tzs ? tzs(i.agreed_price_tzs || i.listed_price_tzs) : 'To be confirmed']),
    ...costs.map((c) => [COSTS[c.kind], c.label || '', tzs(c.amount_tzs)]),
  ]);
  y = totalsBox(doc, y + 10, [['Vehicles', tzs(t.vehicles_total_tzs)], ['Extra costs', tzs(t.extras_total_tzs)], ['Grand total', tzs(t.grand_total_tzs), 'bold'], ['Paid to date', tzs(t.paid_tzs), 'good'], ['Balance due', tzs(Math.max(0, t.balance_tzs)), 'strong']]);
  if (payments.length) {
    y += 14; if (y > 660) { doc.addPage(); y = 56; }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Payments received', L, y); y += 20;
    table(doc, y, [{ label: 'Receipt', width: 110 }, { label: 'Date', width: 110 }, { label: 'Method', width: W - 340 }, { label: 'Amount', width: 120, align: 'right' }], payments.map((p) => [p.receipt_no, day(p.received_on), `${METHODS[p.method]}${p.reference ? ` · ${p.reference}` : ''}`, tzs(p.amount_tzs)]));
  }
  footer(doc, `${business.name} · ${[business.phone, business.email].filter(Boolean).join(' · ')}`);
  doc.end();
}

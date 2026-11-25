// Order rules shared by the customer flow and the admin screens.
import { fmt } from '../src/templates/lib.mjs';

const TZ = 'Africa/Dar_es_Salaam';
export const eatYear = () => Number(new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: TZ }).format(new Date()));
export const eatDate = (d = new Date()) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(d);

// Next number in a yearly sequence (GM-2026-00042, RC-2026-00017). Call inside the transaction that inserts the row,
// so a rolled-back order or payment never leaves a gap.
export async function nextRef(db, key, prefix) {
  const year = eatYear();
  const { value } = (await db.query(
    'INSERT INTO counters (key, year, value) VALUES ($1, $2, 1) ON CONFLICT (key, year) DO UPDATE SET value = counters.value + 1 RETURNING value', [key, year])).rows[0];
  return `${prefix}-${year}-${String(value).padStart(5, '0')}`;
}

export const itemTitle = (v) => `${v.make} ${v.model}${v.year ? ` ${v.year}` : ''} — ${v.body_style}`;

// The WhatsApp text the customer sends. They can edit it before sending, so the saved order stays the source of truth.
export function whatsappMessage({ ref, customer, items, note, siteUrl }) {
  const priced = items.filter((i) => i.listed_price_tzs), unpriced = items.length - priced.length;
  const total = priced.reduce((s, i) => s + i.listed_price_tzs, 0);
  const lines = [
    '*NEW ORDER — Gondo Motors*', `Ref: ${ref}`, `Date: ${eatDate()}`, '',
    '*Customer*', `Name: ${customer.name}`, `Phone: ${customer.phone || '—'}`, `Email: ${customer.email || '—'}`, '',
    `*Vehicles (${items.length})*`,
    ...items.flatMap((i, n) => [
      `${n + 1}. ${i.title}`,
      `   Stock: ${i.stock_no}${i.mileage_km ? ` | ${fmt(i.mileage_km)} km` : ''}${i.colour ? ` | ${i.colour}` : ''}`,
      `   Price: ${i.listed_price_tzs ? `TZS ${fmt(i.listed_price_tzs)}` : 'Price on request'}`,
      `   Link: ${siteUrl}/car/${i.slug}.html`,
    ]),
    '',
    `*Total: ${total ? `TZS ${fmt(total)}` : 'To be confirmed'}${total && unpriced ? ` + ${unpriced} vehicle${unpriced === 1 ? '' : 's'} priced on request` : ''}*`,
    ...(note ? [`Note from customer: ${note}`] : []),
  ];
  return lines.join('\n');
}
export const waUrl = (number, text) => `https://wa.me/${String(number).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

// Tanzanian numbers written locally (0754…) become international (255754…) for wa.me links.
export const waNumber = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.startsWith('0') ? `255${d.slice(1)}` : d; };

// Vehicle status follows the order: Reserved once confirmed, Sold when fully paid or delivered, Available again if cancelled.
export async function syncVehicleStatus(db, orderId) {
  const o = (await db.query('SELECT o.status, t.payment_status FROM orders o JOIN order_totals t ON t.order_id = o.id WHERE o.id = $1', [orderId])).rows[0];
  if (!o || o.status === 'pending') return;
  const target = o.status === 'cancelled' ? 'available' : o.status === 'delivered' || o.payment_status === 'fully_paid' ? 'sold' : 'reserved';
  await db.query(
    `UPDATE vehicles v SET status = $2, sold_at = CASE WHEN $2 = 'sold' THEN COALESCE(v.sold_at, now()) END, updated_at = now()
     FROM order_items i WHERE i.order_id = $1 AND i.vehicle_id = v.id AND v.status <> $2`, [orderId, target]);
}

import { esc, fmt } from '../lib.mjs';

// Small building blocks shared by the admin and account panels.
export const money = (n, cls = '') => `<span class="money ${cls}">${n ? `TZS ${fmt(n)}` : '—'}</span>`;
export const pill = (colour, label) => `<span class="st st-${colour}">${esc(label)}</span>`;

export const VEHICLE_STATUS = { available: ['green', 'Available'], reserved: ['amber', 'Reserved'], in_transit: ['blue', 'In transit'], sold: ['grey', 'Sold'] };
export const SOURCES = { japan_auction: 'Japan auction', local: 'Local' };
export const BODY_STYLES = ['Sedan', 'Hatchback', 'SUV', 'Wagon', 'Coupe', 'Van / MPV', 'Pickup / Truck', 'Other'];
export const vehiclePill = (status) => pill(...(VEHICLE_STATUS[status] || ['grey', status]));

// Builds a link to the same list with some query values changed (empty values are dropped).
export function qs(query, changes = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, ...changes })) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '?';
}

export function sortTh(label, key, query, cls = '') {
  const on = query.sort === key, dir = on && query.dir === 'asc' ? 'desc' : 'asc';
  return `<th${cls ? ` class="${cls}"` : ''}${on ? ` aria-sort="${query.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><a class="th-sort${on ? ' on' : ''}" href="${esc(qs(query, { sort: key, dir, page: '' }))}">${label}<i class="fa-solid ${on ? (query.dir === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down') : 'fa-sort'}"></i></a></th>`;
}

export function pagination({ page, pages, total, size }, query, noun = 'items') {
  if (!total) return '';
  const from = (page - 1) * size + 1, to = Math.min(total, page * size);
  const link = (n, label, disabled, current) => (disabled ? `<span class="pg-btn" aria-disabled="true">${label}</span>` : `<a class="pg-btn${current ? ' on' : ''}" href="${esc(qs(query, { page: n > 1 ? n : '' }))}"${current ? ' aria-current="page"' : ''}>${label}</a>`);
  const nums = [];
  for (let n = 1; n <= pages; n++) if (n === 1 || n === pages || Math.abs(n - page) <= 1) nums.push(n); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return `<nav class="pager" aria-label="Pagination"><span>Showing ${from}–${to} of ${fmt(total)} ${noun}</span><div class="pg">${link(page - 1, '<i class="fa-solid fa-chevron-left"></i><span class="sr-only">Previous</span>', page <= 1)}${nums.map((n) => (n === '…' ? '<span class="pg-gap">…</span>' : link(n, n, false, n === page))).join('')}${link(page + 1, '<i class="fa-solid fa-chevron-right"></i><span class="sr-only">Next</span>', page >= pages)}</div></nav>`;
}

export const option = (value, label, selected) => `<option value="${esc(value)}"${String(selected ?? '') === String(value) ? ' selected' : ''}>${esc(label)}</option>`;

/* ---------- orders ---------- */
export const ORDER_STATUS = {
  pending: ['amber', 'Pending'], confirmed: ['blue', 'Confirmed'], bid_won: ['blue', 'Bid won'], shipped: ['blue', 'Shipped'],
  at_port: ['blue', 'At port'], clearance: ['blue', 'Clearance'], ready: ['green', 'Ready for collection'], delivered: ['green', 'Delivered'], cancelled: ['red', 'Cancelled'],
};
export const PAYMENT_STATUS = { unpaid: ['red', 'Unpaid'], deposit_paid: ['amber', 'Deposit paid'], partially_paid: ['amber', 'Partially paid'], fully_paid: ['green', 'Fully paid'] };
export const orderPill = (s) => pill(...(ORDER_STATUS[s] || ['grey', s]));
export const paymentPill = (s) => pill(...(PAYMENT_STATUS[s] || ['grey', s]));
// Fulfilment steps after confirmation. Local stock skips the import steps.
export const flowFor = (isImport) => (isImport ? ['confirmed', 'bid_won', 'shipped', 'at_port', 'clearance', 'ready', 'delivered'] : ['confirmed', 'ready', 'delivered']);
export function tracker(status, isImport) {
  const flow = flowFor(isImport), at = flow.indexOf(status);
  return `<ol class="track" aria-label="Order progress">${flow.map((s, i) => `<li class="${i < at || status === 'delivered' ? 'done' : i === at ? 'now' : ''}"${i === at ? ' aria-current="step"' : ''}>${ORDER_STATUS[s][1].replace(' for collection', '')}</li>`).join('')}</ol>`;
}
export const paidMeter = (paid, total) => { const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0; return `<div class="meter-row"><div class="meter" role="img" aria-label="${pct}% paid"><span style="width:${pct}%"></span></div><small>TZS ${fmt(paid)} of TZS ${fmt(total)}</small></div>`; };
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' });
const DATETIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dar_es_Salaam' });
export const date = (d) => (d ? DATE.format(typeof d === 'string' && d.length === 10 ? new Date(`${d}T12:00:00Z`) : new Date(d)) : '—');
export const dateTime = (d) => (d ? DATETIME.format(new Date(d)) : '—');

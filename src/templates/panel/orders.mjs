import { esc, fmt } from '../lib.mjs';
import { money, pill, orderPill, paymentPill, vehiclePill, tracker, paidMeter, date, dateTime, qs, pagination, option, ORDER_STATUS, PAYMENT_STATUS, flowFor } from './ui.mjs';
import { METHODS, COSTS } from './account.mjs';

const NO_PHOTO = '/assets/img/brand/no-photo.svg';
const CHANNELS = { website: 'Website', whatsapp: 'WhatsApp', phone: 'Phone', walk_in: 'Walk-in' };
const DOC_KINDS = { invoice: 'Invoice', export_certificate: 'Export certificate', bill_of_lading: 'Bill of lading', tra_document: 'TRA document', registration_card: 'Registration card', other: 'Other' };
const field = (id, label, control, { required, hint, cls = '' } = {}) => `<div class="field ${cls}"><label for="${id}">${label}${required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>${control}${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
const input = (id, name, value, attrs = '') => `<input class="input" id="${id}" name="${name}" value="${esc(value ?? '')}" ${attrs}>`;
// A <dialog> holding a form that posts to the API (wired up in panel.js).
const dialog = (id, title, api, body, submit, { danger, confirm } = {}) => `<dialog class="dlg dlg-form" id="${id}" aria-labelledby="${id}-t"><form data-api="${api}" data-dialog${confirm ? ` data-confirm="${esc(confirm)}"` : ''} novalidate>
  <h2 id="${id}-t">${title}</h2><div class="stack stack-sm">${body}</div>
  <div class="dlg-actions"><button class="btn btn-outline" type="button" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="submit" data-busy="Saving…">${submit}</button></div></form></dialog>`;

/* ------------------------------------------------------------------ list */
export function ordersList({ rows, query, counts, paging }) {
  const filtered = Object.keys(query).length > 0;
  const chip = (label, changes, on) => `<a class="chip${on ? ' active' : ''}" href="/admin/orders${esc(qs({}, changes))}">${label}</a>`;
  return `
<div class="page-bar">
  <div><h2>Orders</h2><p>${fmt(counts.all)} in total · ${fmt(counts.pending)} waiting for confirmation · ${fmt(counts.active)} in progress</p></div>
  <div class="page-actions"><a class="btn btn-primary" href="/admin/orders/new"><i class="fa-solid fa-file-circle-plus"></i> New manual sale</a></div>
</div>
<section class="card">
  <div class="quick-filters">${chip('All', {}, !filtered)}${chip(`Pending (${counts.pending})`, { status: 'pending' }, query.status === 'pending')}${chip(`In progress (${counts.active})`, { status: 'active' }, query.status === 'active')}${chip('Overdue balance', { overdue: '1' }, query.overdue === '1')}${chip('Delivered', { status: 'delivered' }, query.status === 'delivered')}${chip('Cancelled', { status: 'cancelled' }, query.status === 'cancelled')}</div>
  <form class="filter-bar" method="get" action="/admin/orders" role="search">
    <div class="field grow"><label for="f-q">Search</label><input class="input" id="f-q" name="q" type="search" value="${esc(query.q || '')}" placeholder="Reference, customer name, phone or email"></div>
    <div class="field"><label for="f-status">Fulfilment status</label><select class="select" id="f-status" name="status"><option value="">All</option>${option('active', 'In progress', query.status)}${Object.entries(ORDER_STATUS).map(([k, [, l]]) => option(k, l, query.status)).join('')}</select></div>
    <div class="field"><label for="f-pay">Payment status</label><select class="select" id="f-pay" name="payment"><option value="">All</option>${Object.entries(PAYMENT_STATUS).map(([k, [, l]]) => option(k, l, query.payment)).join('')}</select></div>
    <div class="filter-actions"><button class="btn btn-dark" type="submit"><i class="fa-solid fa-filter"></i> Filter</button>${filtered ? '<a class="btn btn-outline" href="/admin/orders">Reset</a>' : ''}</div>
  </form>
  ${rows.length ? `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Reference</th><th>Customer</th><th>Vehicles</th><th class="num">Grand total</th><th>Paid</th><th>Payment</th><th>Status</th></tr></thead>
    <tbody>${rows.map((o) => {
    const open = !['pending', 'cancelled'].includes(o.status), overdue = open && o.balance_tzs > 0 && o.balance_due_date && o.balance_due_date < new Date().toISOString().slice(0, 10);
    return `<tr${o.status === 'cancelled' ? ' class="struck"' : ''}>
      <td data-label="Reference"><a class="ref" href="/admin/orders/${o.ref}">${o.ref}</a><span class="sub">${date(o.created_at)} · ${CHANNELS[o.channel]}</span></td>
      <td data-label="Customer"><span class="nw">${esc(o.customer_name)}<span class="sub">${esc(o.customer_phone || '')}</span></span></td>
      <td data-label="Vehicles"><span>${esc((o.vehicles || '').split(' · ')[0])}${o.item_count > 1 ? `<span class="sub">+ ${o.item_count - 1} more</span>` : ''}</span></td>
      <td data-label="Grand total" class="num">${o.grand_total_tzs ? money(o.grand_total_tzs) : '<span class="warn-text">Not priced</span>'}</td>
      <td data-label="Paid">${open && o.grand_total_tzs ? paidMeter(o.paid_tzs, o.grand_total_tzs) : '—'}${overdue ? `<span class="sub warn-text">Balance due ${date(o.balance_due_date)}</span>` : ''}</td>
      <td data-label="Payment">${open ? paymentPill(o.payment_status) : '—'}</td>
      <td data-label="Status">${orderPill(o.status)}</td></tr>`;
  }).join('')}</tbody></table></div><div class="card-foot">${pagination(paging, query, 'orders')}</div>`
    : `<div class="state"><i class="fa-solid fa-clipboard-list"></i><b>${filtered ? 'No orders match these filters' : 'No orders yet'}</b><p>${filtered ? 'Try a different status or search.' : 'Orders sent from the website appear here. You can also record a sale made by phone or in person.'}</p>${filtered ? '<p style="margin-top:16px"><a class="btn btn-outline" href="/admin/orders">Clear filters</a></p>' : ''}</div>`}
</section>`;
}

/* ------------------------------------------------------------------ detail */
export function orderDetail({ order: o, items, costs, payments, documents, history, activity, isImport, waReply, waStatement, receiptLinks, uploadsReady, today }) {
  const api = `/api/admin/orders/${o.id}`;
  const pending = o.status === 'pending', cancelled = o.status === 'cancelled', open = !pending && !cancelled;
  const balance = Math.max(0, o.balance_tzs), flow = flowFor(isImport), at = flow.indexOf(o.status), next = flow[at + 1];
  const tab = (id, label, n) => `<button role="tab" id="t-${id}" aria-controls="p-${id}" aria-selected="false" tabindex="-1">${label}${n ? ` <span class="tab-n">${n}</span>` : ''}</button>`;
  const live = payments.filter((p) => !p.voided_at);

  const summary = `
  <div class="cols">
    <div class="col-8 stack">
      ${open ? `<section class="card"><div class="card-head"><h3>Progress</h3>${o.status !== 'delivered' ? `<button class="btn btn-dark btn-sm" type="button" data-open="#dlg-status"><i class="fa-solid fa-forward-step"></i> Update status</button>` : ''}</div><div class="card-body">${tracker(o.status, isImport)}</div></section>` : ''}
      <section class="card"><div class="card-head"><h3>Vehicles (${items.length})</h3></div><div class="rows">${items.map((i) => `<div class="row-item">
        <img class="row-thumb lg" src="${esc(i.thumb || NO_PHOTO)}" alt="">
        <div class="grow"><b><a href="/admin/vehicles/${i.vehicle_id}/edit">${esc(i.title)}</a></b><small>Stock ${esc(i.stock_no)}${i.mileage_km ? ` · ${fmt(i.mileage_km)} km` : ''}${i.colour ? ` · ${esc(i.colour)}` : ''}</small><div style="margin-top:6px">${i.deleted_at ? pill('grey', 'Removed from stock') : vehiclePill(i.vehicle_status)}</div></div>
        <div class="cart-price">${i.agreed_price_tzs || i.listed_price_tzs ? money(i.agreed_price_tzs || i.listed_price_tzs) : '<span class="warn-text">Not priced</span>'}${i.agreed_price_tzs && i.listed_price_tzs && i.agreed_price_tzs !== i.listed_price_tzs ? `<span class="sub">Listed TZS ${fmt(i.listed_price_tzs)}</span>` : ''}</div></div>`).join('')}</div></section>
      ${o.customer_note ? `<section class="card"><div class="card-head"><h3>Note from customer</h3></div><div class="card-body"><p style="white-space:pre-wrap">${esc(o.customer_note)}</p></div></section>` : ''}
    </div>
    <div class="col-4 stack">
      <section class="card"><div class="card-head"><h3>Customer</h3><small>${CHANNELS[o.channel]}</small></div><div class="card-body stack stack-sm">
        <div class="kv"><div><span>Name</span><b>${o.client_id ? `<a href="/admin/clients/${o.client_id}" style="color:var(--accent-dark)">${esc(o.customer_name)}</a>` : esc(o.customer_name)}</b></div><div><span>Phone</span><b>${esc(o.customer_phone || '—')}</b></div><div><span>Email</span><b style="word-break:break-all">${esc(o.customer_email || '—')}</b></div></div>
        ${waReply ? `<a class="btn btn-whatsapp btn-block" href="${esc(waReply)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Reply on WhatsApp</a>` : '<p class="hint" style="padding:0">No phone number on this order.</p>'}
      </div></section>
      <section class="card"><div class="card-head"><h3>Money</h3>${open ? paymentPill(o.payment_status) : ''}</div><div class="card-body stack stack-sm">
        ${open && o.grand_total_tzs ? paidMeter(o.paid_tzs, o.grand_total_tzs) : ''}
        <div class="kv">
          <div><span>Listed total</span>${money(o.listed_total_tzs)}</div>
          <div><span>Agreed total</span>${money(o.vehicles_total_tzs)}</div>
          <div><span>Extra costs</span>${money(o.extras_total_tzs)}</div>
          <div class="total"><span>Grand total</span><b class="money">TZS ${fmt(o.grand_total_tzs)}</b></div>
          ${open ? `<div><span>Paid so far</span><b class="money zero">TZS ${fmt(o.paid_tzs)}</b></div><div><span>Balance due${o.balance_due_date ? ` · by ${date(o.balance_due_date)}` : ''}</span><b class="money ${balance ? 'due' : 'zero'}">TZS ${fmt(balance)}</b></div>` : ''}
          ${o.unpriced_items ? `<div><span class="warn-text">${o.unpriced_items} vehicle${o.unpriced_items === 1 ? '' : 's'} not priced yet</span></div>` : ''}
        </div>
        ${open ? `<a class="btn btn-outline btn-block" href="/admin/orders/${o.ref}/invoice.pdf" target="_blank" rel="noopener"><i class="fa-solid fa-file-invoice"></i> Invoice / statement (PDF)</a>${waStatement ? `<a class="btn btn-outline btn-block" href="${esc(waStatement)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Send balance on WhatsApp</a>` : ''}` : ''}
      </div></section>
    </div>
  </div>`;

  const pricing = `
  <div class="cols">
    <form class="card col-8" data-api="PUT ${api}/pricing" novalidate>
      <div class="card-head"><h3>Agreed prices</h3><small>Leave blank to use the listed price</small></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vehicle</th><th class="num">Listed price</th><th class="num">Agreed price (TZS)</th></tr></thead><tbody>
        ${items.map((i) => `<tr><td data-label="Vehicle">${esc(i.title)}<span class="sub">Stock ${esc(i.stock_no)}</span></td><td data-label="Listed price" class="num">${i.listed_price_tzs ? money(i.listed_price_tzs) : '<span class="warn-text">On request</span>'}</td>
          <td data-label="Agreed price" class="num"><div class="field" style="max-width:208px;margin-left:auto"><label class="sr-only" for="pr-${i.id}">Agreed price for ${esc(i.title)}</label><input class="input num-input" id="pr-${i.id}" name="price_${i.id}" inputmode="numeric" data-money value="${i.agreed_price_tzs ? fmt(i.agreed_price_tzs) : ''}" placeholder="${i.listed_price_tzs ? fmt(i.listed_price_tzs) : 'Required'}"${cancelled ? ' disabled' : ''}></div></td></tr>`).join('')}
      </tbody></table></div>
      ${cancelled ? '' : '<div class="card-foot form-foot"><button class="btn btn-primary" type="submit" data-busy="Saving…">Save agreed prices</button></div>'}
    </form>
    <section class="card col-4"><div class="card-head"><h3>Totals</h3></div><div class="card-body"><div class="kv">
      <div><span>Listed total</span>${money(o.listed_total_tzs)}</div><div><span>Agreed total</span>${money(o.vehicles_total_tzs)}</div><div><span>Extras</span>${money(o.extras_total_tzs)}</div>
      <div class="total"><span>Grand total</span><b class="money">TZS ${fmt(o.grand_total_tzs)}</b></div></div></div></section>
  </div>
  <section class="card"><div class="card-head"><h3>Extra costs</h3>${cancelled ? '' : '<button class="btn btn-dark btn-sm" type="button" data-open="#dlg-cost"><i class="fa-solid fa-plus"></i> Add cost</button>'}</div>
    ${costs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cost</th><th>Description</th><th class="num">Amount</th><th class="num">Remove</th></tr></thead><tbody>${costs.map((c) => `<tr><td data-label="Cost">${COSTS[c.kind]}</td><td data-label="Description">${esc(c.label || '—')}</td><td data-label="Amount" class="num">${money(c.amount_tzs)}</td><td data-label="Remove" class="num">${cancelled ? '' : `<button class="icon-btn sm danger" type="button" data-action="DELETE ${api}/costs/${c.id}" data-confirm-title="Remove this cost?" data-confirm-message="${esc(`${c.label || COSTS[c.kind]} of TZS ${fmt(c.amount_tzs)} will be taken off the order total.`)}" data-confirm-label="Remove" aria-label="Remove ${esc(c.label || COSTS[c.kind])}"><i class="fa-solid fa-trash-can"></i></button>`}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="state"><i class="fa-solid fa-ship"></i><b>No extra costs yet</b><p>Add shipping, port and clearance, TRA duty, registration or delivery when they are agreed.</p></div>'}
  </section>`;

  const paymentsTab = `
  <section class="stats">
    <div class="stat"><span class="stat-ic"><i class="fa-solid fa-sack-dollar"></i></span><span><small>Grand total</small><b class="sm">TZS ${fmt(o.grand_total_tzs)}</b></span></div>
    <div class="stat"><span class="stat-ic good"><i class="fa-solid fa-money-bill-wave"></i></span><span><small>Paid so far</small><b class="sm">TZS ${fmt(o.paid_tzs)}</b></span></div>
    <div class="stat"><span class="stat-ic accent"><i class="fa-solid fa-hourglass-half"></i></span><span><small>Balance due</small><b class="sm">TZS ${fmt(balance)}</b></span></div>
  </section>
  <section class="card"><div class="card-head"><h3>Payments</h3>${open ? `<button class="btn btn-primary btn-sm" type="button" data-open="#dlg-payment"><i class="fa-solid fa-plus"></i> Record payment</button>` : ''}</div>
    ${payments.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receipt</th><th>Received</th><th>Method</th><th>Paid by</th><th>Received by</th><th class="num">Amount</th><th class="num">Actions</th></tr></thead><tbody>${payments.map((p) => `<tr${p.voided_at ? ' class="struck"' : ''}>
      <td data-label="Receipt"><span class="ref">${esc(p.receipt_no)}</span>${p.voided_at ? `<span class="sub">${pill('red', 'Voided')}</span>` : ''}</td>
      <td data-label="Received"><span class="nw">${date(p.received_on)}</span></td>
      <td data-label="Method"><span>${METHODS[p.method]}${p.reference ? `<span class="sub">Ref ${esc(p.reference)}</span>` : ''}</span></td>
      <td data-label="Paid by"><span>${esc(p.paid_by)}${p.notes ? `<span class="sub">${esc(p.notes)}</span>` : ''}${p.voided_at ? `<span class="sub">Voided by ${esc(p.voided_by_name || '')} on ${date(p.voided_at)}: ${esc(p.void_reason)}</span>` : ''}</span></td>
      <td data-label="Received by">${esc(p.received_by_name)}</td>
      <td data-label="Amount" class="num">${money(p.amount_tzs)}${p.overpayment_confirmed ? '<span class="sub">Overpayment</span>' : ''}</td>
      <td data-label="Actions" class="num"><span class="row-actions">
        ${p.proof_public_id ? `<a class="icon-btn sm" href="/admin/payments/${p.id}/proof" target="_blank" rel="noopener" aria-label="View proof for ${esc(p.receipt_no)}"><i class="fa-solid fa-paperclip"></i></a>` : ''}
        ${p.voided_at ? '' : `<a class="icon-btn sm" href="/admin/payments/${esc(p.receipt_no)}/receipt.pdf" target="_blank" rel="noopener" aria-label="Receipt PDF ${esc(p.receipt_no)}"><i class="fa-solid fa-receipt"></i></a>
        ${receiptLinks[p.id] ? `<a class="icon-btn sm" href="${esc(receiptLinks[p.id])}" target="_blank" rel="noopener" aria-label="Send receipt ${esc(p.receipt_no)} on WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
        <button class="icon-btn sm danger" type="button" data-open="#dlg-void" data-set-action="POST ${api}/payments/${p.id}/void" data-set-text="${esc(`${p.receipt_no} · TZS ${fmt(p.amount_tzs)}`)}" aria-label="Void ${esc(p.receipt_no)}"><i class="fa-solid fa-ban"></i></button>`}
      </span></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="state"><i class="fa-solid fa-money-bill-wave"></i><b>No payments recorded</b><p>${pending ? 'Confirm the order first, then record the deposit when it arrives.' : cancelled ? 'This order was cancelled.' : 'Record the deposit, instalments and balance here as the money arrives.'}</p></div>`}
  </section>`;

  const details = `
  <form class="card" data-api="PUT ${api}/details" novalidate>
    <div class="card-head"><h3>Purchase details</h3></div>
    <div class="card-body stack">
      <div class="form-grid three">
        ${field('d-region', 'Delivery region', input('d-region', 'delivery_region', o.delivery_region, 'maxlength="60" placeholder="e.g. Arusha"'))}
        ${field('d-exp', 'Expected delivery', input('d-exp', 'expected_delivery', o.expected_delivery, 'type="date"'))}
        ${field('d-act', 'Actual delivery', input('d-act', 'actual_delivery', o.actual_delivery, 'type="date"'))}
        ${field('d-addr', 'Delivery address', input('d-addr', 'delivery_address', o.delivery_address, 'maxlength="200"'), { cls: 'span-2' })}
        ${field('d-due', 'Balance due by', input('d-due', 'balance_due_date', o.balance_due_date, 'type="date"'), { hint: 'Used for the overdue list on the dashboard.' })}
        ${isImport ? `${field('d-vessel', 'Vessel', input('d-vessel', 'vessel', o.vessel, 'maxlength="80"'))}${field('d-bl', 'Bill of lading no.', input('d-bl', 'bill_of_lading_no', o.bill_of_lading_no, 'maxlength="60"'))}${field('d-eta', 'ETA at port', input('d-eta', 'shipping_eta', o.shipping_eta, 'type="date"'))}` : ''}
      </div>
      ${items.map((i) => `<fieldset class="group"><legend>${esc(i.title)} · Stock ${esc(i.stock_no)}</legend><div class="form-grid three">
        ${field(`vin-${i.id}`, 'Chassis / VIN', input(`vin-${i.id}`, `vin_${i.id}`, i.vin, 'maxlength="40" autocapitalize="characters"'))}
        ${field(`eng-${i.id}`, 'Engine number', input(`eng-${i.id}`, `engine_${i.id}`, i.engine_no, 'maxlength="40" autocapitalize="characters"'))}
        ${field(`reg-${i.id}`, 'Registration plate', input(`reg-${i.id}`, `reg_${i.id}`, i.registration_no, 'maxlength="20" placeholder="When issued" autocapitalize="characters"'))}</div></fieldset>`).join('')}
      ${field('d-notes', 'Internal notes <span class="opt">(staff only)</span>', `<textarea class="textarea" id="d-notes" name="internal_notes" maxlength="2000" style="min-height:96px">${esc(o.internal_notes || '')}</textarea>`)}
    </div>
    <div class="card-foot form-foot"><button class="btn btn-primary" type="submit" data-busy="Saving…">Save purchase details</button></div>
  </form>
  <section class="card"><div class="card-head"><h3>Documents</h3>${uploadsReady ? '<button class="btn btn-dark btn-sm" type="button" data-open="#dlg-doc"><i class="fa-solid fa-upload"></i> Upload document</button>' : ''}</div>
    ${documents.length ? `<div class="rows">${documents.map((d) => `<div class="row-item"><span class="row-ic"><i class="fa-solid fa-file-lines"></i></span><div class="grow"><b>${esc(d.filename)}</b><small>${DOC_KINDS[d.kind]} · ${date(d.created_at)} · ${esc(d.uploaded_by_name || '')}</small></div>
      ${d.visible_to_customer ? pill('green', 'Customer can see') : pill('grey', 'Staff only')}
      <span class="row-actions"><a class="icon-btn sm" href="/admin/orders/${o.id}/documents/${d.id}/download" target="_blank" rel="noopener" aria-label="Download ${esc(d.filename)}"><i class="fa-solid fa-download"></i></a>
      <button class="icon-btn sm" type="button" data-action="POST ${api}/documents/${d.id}/visibility" aria-label="${d.visible_to_customer ? 'Hide from' : 'Share with'} customer: ${esc(d.filename)}"><i class="fa-solid ${d.visible_to_customer ? 'fa-eye-slash' : 'fa-eye'}"></i></button>
      <button class="icon-btn sm danger" type="button" data-action="DELETE ${api}/documents/${d.id}" data-confirm-title="Delete this document?" data-confirm-message="${esc(d.filename)} will be permanently deleted." data-confirm-label="Delete" aria-label="Delete ${esc(d.filename)}"><i class="fa-solid fa-trash-can"></i></button></span></div>`).join('')}</div>`
    : `<div class="state"><i class="fa-solid fa-folder-open"></i><b>No documents yet</b><p>${uploadsReady ? 'Upload the invoice, export certificate, bill of lading, TRA documents and registration card as they arrive.' : 'Add the Cloudinary keys to the server settings to upload documents.'}</p></div>`}
  </section>`;

  const timeline = `
  <div class="cols">
    <section class="card col-6"><div class="card-head"><h3>Status timeline</h3></div><div class="card-body"><ol class="timeline-list">${[...history].reverse().map((h) => `<li><b>${esc((ORDER_STATUS[h.to_status] || ['', h.to_status])[1])}</b><span>${dateTime(h.created_at)}${h.changed_by_name ? ` · ${esc(h.changed_by_name)}` : ''}</span>${h.note ? `<small>${esc(h.note)}</small>` : ''}</li>`).join('')}</ol></div></section>
    <section class="card col-6"><div class="card-head"><h3>Activity log</h3><small>Who changed what</small></div>${activity.length ? `<div class="rows">${activity.map((a) => `<div class="row-item"><div class="grow"><b style="white-space:normal">${esc(a.summary.replace(`${o.ref}: `, ''))}</b><small>${esc(a.actor_name)} · ${dateTime(a.created_at)}</small></div></div>`).join('')}</div>` : '<div class="state"><i class="fa-solid fa-clock-rotate-left"></i><b>No activity yet</b><p>Confirmations, price changes, payments and status changes are recorded here.</p></div>'}</section>
  </div>`;

  return `
<a class="back-link" href="/admin/orders" style="margin:0"><i class="fa-solid fa-arrow-left"></i> Back to orders</a>
<div class="page-bar">
  <div><h2>Order ${o.ref} <span class="head-pills">${orderPill(o.status)}${open ? paymentPill(o.payment_status) : ''}</span></h2><p>${esc(o.customer_name)} · placed ${dateTime(o.created_at)}${o.confirmed_at ? ` · confirmed ${date(o.confirmed_at)}${o.confirmed_by_name ? ` by ${esc(o.confirmed_by_name)}` : ''}` : ''}</p></div>
  <div class="page-actions">
    ${pending ? `<button class="btn btn-primary" type="button" data-action="POST ${api}/confirm" data-confirm-title="Confirm this order?" data-confirm-message="Use this once the deal is agreed on WhatsApp. ${esc(o.customer_name)} becomes a client and the vehicles are marked Reserved." data-confirm-label="Confirm order" data-confirm-icon="fa-circle-check"><i class="fa-solid fa-circle-check"></i> Confirm order</button>` : ''}
    ${open && next ? `<button class="btn btn-dark" type="button" data-open="#dlg-status"><i class="fa-solid fa-forward-step"></i> Update status</button>` : ''}
    ${open ? `<button class="btn btn-primary" type="button" data-open="#dlg-payment" data-tab="payments"><i class="fa-solid fa-plus"></i> Record payment</button>` : ''}
    ${!cancelled && o.status !== 'delivered' ? `<button class="btn btn-outline" type="button" data-open="#dlg-cancel"><i class="fa-solid fa-ban"></i> Cancel order</button>` : ''}
  </div>
</div>
${cancelled ? `<div class="form-banner error"><i class="fa-solid fa-circle-xmark"></i><span><b>Cancelled ${date(o.cancelled_at)}.</b> ${esc(o.cancel_reason || '')}</span></div>` : ''}
${pending ? `<div class="form-banner" style="background:var(--warn-soft);color:var(--warn)"><i class="fa-solid fa-hourglass-half"></i><span><b>Waiting for confirmation.</b> Agree the deal with the customer on WhatsApp, set the agreed price if it changed, then confirm.</span></div>` : ''}
<div class="card tabs-card"><div class="tabs" role="tablist" aria-label="Order sections" data-tabs-hash>${tab('summary', 'Summary')}${tab('pricing', 'Vehicles and pricing')}${tab('payments', 'Payments', live.length)}${tab('details', 'Purchase details and documents', documents.length)}${tab('timeline', 'Timeline')}</div></div>
<div id="p-summary" role="tabpanel" aria-labelledby="t-summary" class="stack" hidden>${summary}</div>
<div id="p-pricing" role="tabpanel" aria-labelledby="t-pricing" class="stack" hidden>${pricing}</div>
<div id="p-payments" role="tabpanel" aria-labelledby="t-payments" class="stack" hidden>${paymentsTab}</div>
<div id="p-details" role="tabpanel" aria-labelledby="t-details" class="stack" hidden>${details}</div>
<div id="p-timeline" role="tabpanel" aria-labelledby="t-timeline" class="stack" hidden>${timeline}</div>

${open ? dialog('dlg-payment', 'Record a payment', `POST ${api}/payments`, `
  <p class="hint" style="padding:0">Balance due on this order: <b>TZS ${fmt(balance)}</b>. “Received by” is filled in with your name automatically.</p>
  <div class="form-summary" role="alert" hidden></div>
  <div class="form-grid">
    ${field('pay-amount', 'Amount (TZS)', input('pay-amount', 'amount', '', 'inputmode="numeric" data-money required placeholder="e.g. 15,000,000"'), { required: true })}
    ${field('pay-date', 'Date received', input('pay-date', 'received_on', today, `type="date" required max="${today}"`), { required: true })}
    ${field('pay-method', 'Method', `<select class="select" id="pay-method" name="method" required>${Object.entries(METHODS).map(([k, l]) => option(k, l, 'bank_transfer')).join('')}</select>`, { required: true })}
    ${field('pay-ref', 'Transaction / reference no.', input('pay-ref', 'reference', '', 'maxlength="80"'))}
    ${field('pay-by', 'Paid by', input('pay-by', 'paid_by', o.customer_name, 'required maxlength="80"'), { required: true, cls: 'span-2' })}
  </div>
  ${uploadsReady ? `<div class="field"><label for="pay-proof">Proof of payment <span class="opt">(photo or PDF of the slip)</span></label><input class="input" id="pay-proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-upload="proof" data-upload-sign="${api}/uploads/sign"><p class="hint">Stored privately. Only staff can open it.</p></div>` : ''}
  ${field('pay-notes', 'Notes <span class="opt">(optional)</span>', input('pay-notes', 'notes', '', 'maxlength="500"'))}`, 'Record payment', { confirm: 'Record this payment?|A numbered receipt is created and the balance is updated. Payments cannot be edited afterwards, only voided.|Record payment' }) : ''}
${dialog('dlg-void', 'Void this payment?', 'POST #', `<p>The payment <b data-text></b> stays in the history marked as voided, and the balance goes back up. This cannot be undone.</p><div class="form-summary" role="alert" hidden></div>${field('void-reason', 'Reason', input('void-reason', 'reason', '', 'required minlength="3" maxlength="300" placeholder="e.g. Entered twice by mistake"'), { required: true })}`, 'Void payment', { danger: true })}
${dialog('dlg-cancel', 'Cancel this order?', `POST ${api}/cancel`, `<p>${pending ? 'The order is marked cancelled and the customer sees the reason.' : 'The vehicles go back to Available and the customer sees the reason.'}</p><div class="form-summary" role="alert" hidden></div>${field('cancel-reason', 'Reason', input('cancel-reason', 'reason', '', 'required minlength="3" maxlength="300" placeholder="e.g. Customer changed their mind"'), { required: true })}`, 'Cancel order', { danger: true })}
${dialog('dlg-cost', 'Add an extra cost', `POST ${api}/costs`, `<div class="form-summary" role="alert" hidden></div>${field('cost-kind', 'Cost type', `<select class="select" id="cost-kind" name="kind" required>${Object.entries(COSTS).map(([k, l]) => option(k, l)).join('')}</select>`, { required: true })}${field('cost-label', 'Description <span class="opt">(optional)</span>', input('cost-label', 'label', '', 'maxlength="80" placeholder="e.g. Freight Yokohama to Dar es Salaam"'))}${field('cost-amount', 'Amount (TZS)', input('cost-amount', 'amount', '', 'inputmode="numeric" data-money required'), { required: true })}`, 'Add cost')}
${open && o.status !== 'delivered' ? dialog('dlg-status', 'Update fulfilment status', `POST ${api}/status`, `<div class="form-summary" role="alert" hidden></div>${field('st-to', 'New status', `<select class="select" id="st-to" name="to" required>${flow.filter((s) => s !== o.status).map((s) => option(s, ORDER_STATUS[s][1], next)).join('')}</select>`, { required: true, hint: `Currently ${ORDER_STATUS[o.status][1]}. ${isImport ? '' : 'Local stock skips the import steps.'}` })}${field('st-note', 'Note <span class="opt">(optional)</span>', input('st-note', 'note', '', 'maxlength="300"'))}`, 'Update status', { confirm: 'Update the status?|The change is timestamped on the timeline and the customer sees it in their account.|Update status' }) : ''}
${uploadsReady ? dialog('dlg-doc', 'Upload a document', `POST ${api}/documents`, `<div class="form-summary" role="alert" hidden></div>${field('doc-kind', 'Document type', `<select class="select" id="doc-kind" name="kind" required>${Object.entries(DOC_KINDS).map(([k, l]) => option(k, l)).join('')}</select>`, { required: true })}<div class="field"><label for="doc-file">File <span class="req" aria-hidden="true">*</span></label><input class="input" id="doc-file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" data-upload="document" data-upload-sign="${api}/uploads/sign"><p class="hint">Photo or PDF, up to 10 MB. Stored privately.</p></div><label class="check"><input type="checkbox" name="visible" value="1"> Let the customer download this from their account</label>`, 'Upload') : ''}`;
}

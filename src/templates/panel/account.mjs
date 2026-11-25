import { esc, fmt } from '../lib.mjs';
import { money, orderPill, paymentPill, tracker, paidMeter, date, dateTime, ORDER_STATUS } from './ui.mjs';

const NO_PHOTO = '/assets/img/brand/no-photo.svg';
const METHODS = { bank_transfer: 'Bank transfer', mpesa: 'M-Pesa', tigo_pesa: 'Tigo Pesa / Mixx', airtel_money: 'Airtel Money', cash: 'Cash', cheque: 'Cheque', other: 'Other' };
const COSTS = { shipping: 'Shipping / freight', port_clearance: 'Port and clearance', tra_duty: 'TRA duty and taxes', registration: 'Registration', delivery: 'Delivery', other: 'Other' };
export { METHODS, COSTS };

/* ------------------------------------------------------------------ order list (cart) */
export function orderListPage({ items, user }) {
  if (!items.length) return `
<div class="page-bar"><div><h2>Order list</h2><p>Vehicles you want to order appear here.</p></div></div>
<section class="card"><div class="state"><i class="fa-solid fa-cart-shopping"></i><b>Your order list is empty</b><p>Browse our vehicles and tap “Add to order list” on the ones you want.</p><p style="margin-top:16px"><a class="btn btn-primary" href="/cars.html"><i class="fa-solid fa-magnifying-glass"></i> Browse vehicles</a></p></div></section>`;
  const priced = items.filter((i) => i.price_tzs), unpriced = items.length - priced.length;
  const total = priced.reduce((s, i) => s + i.price_tzs, 0), blocked = items.filter((i) => i.status !== 'available');
  return `
<div class="page-bar"><div><h2>Order list</h2><p>${items.length} vehicle${items.length === 1 ? '' : 's'} · review, then send your order to our team on WhatsApp.</p></div>
  <div class="page-actions"><a class="btn btn-outline" href="/cars.html"><i class="fa-solid fa-plus"></i> Add more vehicles</a></div></div>
<div class="cols">
  <section class="card col-8">
    <div class="card-head"><h3>Vehicles</h3></div>
    <div class="rows" id="cart-rows">${items.map((v) => `
      <div class="row-item cart-row" data-id="${v.id}" data-name="${esc(`${v.make} ${v.model}`)}">
        <a href="/car/${esc(v.slug)}.html"><img class="row-thumb lg" src="${esc(v.thumb || NO_PHOTO)}" alt=""></a>
        <div class="grow"><b><a href="/car/${esc(v.slug)}.html">${esc(`${v.make} ${v.model}`)}${v.year ? ` ${v.year}` : ''}</a></b>
          <small>Stock ${esc(v.stock_no)} · ${esc(v.body_style)}${v.mileage_km ? ` · ${fmt(v.mileage_km)} km` : ''}${v.colour ? ` · ${esc(v.colour)}` : ''}</small>
          ${v.status !== 'available' ? '<small class="warn-text" style="display:block">No longer available: remove to continue</small>' : ''}</div>
        <div class="cart-price">${v.price_tzs ? money(v.price_tzs) : '<span class="money">Price on request</span>'}</div>
        <button class="icon-btn sm danger" type="button" data-cart-remove aria-label="Remove ${esc(`${v.make} ${v.model}`)}"><i class="fa-solid fa-trash-can"></i></button>
      </div>`).join('')}</div>
  </section>
  <form class="card col-4" id="order-form" novalidate>
    <div class="card-head"><h3>Send your order</h3></div>
    <div class="card-body stack stack-sm">
      <div class="kv">
        <div><span>Vehicles</span><b>${items.length}</b></div>
        ${unpriced ? `<div><span>Priced on request</span><b>${unpriced}</b></div>` : ''}
        <div class="total"><span>Listed total</span><b class="money">${total ? `TZS ${fmt(total)}` : 'To be confirmed'}</b></div>
      </div>
      <p class="hint" style="padding:0">Listed prices exclude shipping, import duty and clearance. Our team confirms the final price with you on WhatsApp. Nothing is paid on this website.</p>
      <div class="form-summary" role="alert" hidden></div>
      <div class="field"><label for="o-phone">Your phone / WhatsApp <span class="req" aria-hidden="true">*</span></label><input class="input" id="o-phone" name="phone" type="tel" inputmode="tel" required pattern="[+0-9 ()\\-]{7,}" value="${esc(user.phone || '')}" placeholder="+255 679 400 800" autocomplete="tel"></div>
      <div class="field"><label for="o-note">Note for our team <span class="opt">(optional)</span></label><textarea class="textarea" id="o-note" name="note" maxlength="500" style="min-height:96px" placeholder="Delivery region, questions, preferred colour…"></textarea></div>
      <button class="btn btn-whatsapp btn-lg btn-block" type="submit" data-busy="Saving your order…"${blocked.length ? ' disabled' : ''}><i class="fa-brands fa-whatsapp"></i> Order via WhatsApp</button>
      <p class="hint" style="padding:0;text-align:center">We save your order first, then open WhatsApp with the details filled in.</p>
    </div>
  </form>
</div>`;
}

/* ------------------------------------------------------------------ my orders */
export function ordersPage({ orders }) {
  if (!orders.length) return `
<div class="page-bar"><div><h2>My orders</h2><p>Your order history and progress.</p></div></div>
<section class="card"><div class="state"><i class="fa-solid fa-clipboard-list"></i><b>No orders yet</b><p>When you send an order on WhatsApp it is saved here with its reference number.</p><p style="margin-top:16px"><a class="btn btn-primary" href="/cars.html">Browse vehicles</a></p></div></section>`;
  return `
<div class="page-bar"><div><h2>My orders</h2><p>${orders.length} order${orders.length === 1 ? '' : 's'}</p></div></div>
<section class="card"><div class="tbl-wrap"><table class="tbl">
  <thead><tr><th>Reference</th><th>Vehicles</th><th>Placed</th><th class="num">Total</th><th>Paid</th><th>Payment</th><th>Status</th></tr></thead>
  <tbody>${orders.map((o) => `<tr${o.status === 'cancelled' ? ' class="struck"' : ''}>
    <td data-label="Reference"><a class="ref" href="/account/orders/${o.ref}">${o.ref}</a></td>
    <td data-label="Vehicles"><span>${esc(o.vehicles.split(' · ')[0])}${o.item_count > 1 ? `<span class="sub">+ ${o.item_count - 1} more</span>` : ''}</span></td>
    <td data-label="Placed"><span class="nw">${date(o.created_at)}</span></td>
    <td data-label="Total" class="num">${o.grand_total_tzs ? money(o.grand_total_tzs) : '<span class="money">To be confirmed</span>'}</td>
    <td data-label="Paid">${o.status === 'pending' || o.status === 'cancelled' || !o.grand_total_tzs ? '—' : paidMeter(o.paid_tzs, o.grand_total_tzs)}</td>
    <td data-label="Payment">${o.status === 'pending' || o.status === 'cancelled' ? '—' : paymentPill(o.payment_status)}</td>
    <td data-label="Status">${orderPill(o.status)}</td></tr>`).join('')}</tbody>
</table></div></section>`;
}

/* ------------------------------------------------------------------ one order */
export function orderPage({ order: o, items, costs, payments, history, docs = [], placed, sendUrl, followUrl }) {
  const active = !['pending', 'cancelled'].includes(o.status), isImport = items.some((i) => i.source === 'japan_auction');
  const agreed = items.some((i) => i.agreed_price_tzs);
  return `
<a class="back-link" href="/account/orders" style="margin:0"><i class="fa-solid fa-arrow-left"></i> Back to my orders</a>
${placed && o.status === 'pending' ? `<section class="card placed"><div class="card-body stack stack-sm">
  <div class="placed-head"><span class="stat-ic good"><i class="fa-solid fa-check"></i></span><div><h2>Order ${o.ref} is saved</h2><p>One more step: send it to our team on WhatsApp so we can confirm price and delivery with you.</p></div></div>
  <div><a class="btn btn-whatsapp btn-lg" href="${esc(sendUrl)}" target="_blank" rel="noopener" id="send-wa"><i class="fa-brands fa-whatsapp"></i> Send on WhatsApp</a></div>
</div></section>` : ''}
<div class="page-bar">
  <div><h2>Order ${o.ref}</h2><p>Placed ${dateTime(o.created_at)}</p></div>
  <div class="page-actions">${orderPill(o.status)}${active ? paymentPill(o.payment_status) : ''}</div>
</div>
${o.status === 'cancelled' ? `<div class="form-banner error"><i class="fa-solid fa-circle-xmark"></i><span><b>This order was cancelled.</b> ${esc(o.cancel_reason || '')}</span></div>` : ''}
${o.status === 'pending' && !placed ? `<div class="form-banner" style="background:var(--warn-soft);color:var(--warn)"><i class="fa-solid fa-hourglass-half"></i><span><b>Waiting for confirmation.</b> Our team confirms the price and availability with you on WhatsApp.</span></div>` : ''}
<div class="cols">
  <div class="col-8 stack">
    ${active ? `<section class="card"><div class="card-head"><h3>Progress</h3></div><div class="card-body stack stack-sm">${tracker(o.status, isImport)}
      ${o.vessel || o.shipping_eta ? `<p class="muted-line"><i class="fa-solid fa-ship"></i> ${o.vessel ? `Vessel <b>${esc(o.vessel)}</b>` : 'Shipping'}${o.shipping_eta ? ` · expected at port on <b>${date(o.shipping_eta)}</b>` : ''}</p>` : ''}
      ${o.expected_delivery && o.status !== 'delivered' ? `<p class="muted-line"><i class="fa-solid fa-truck"></i> Expected delivery <b>${date(o.expected_delivery)}</b>${o.delivery_region ? ` · ${esc(o.delivery_region)}` : ''}</p>` : ''}
      ${o.actual_delivery ? `<p class="muted-line"><i class="fa-solid fa-circle-check"></i> Delivered on <b>${date(o.actual_delivery)}</b></p>` : ''}</div></section>` : ''}
    <section class="card"><div class="card-head"><h3>Vehicles (${items.length})</h3></div>
      <div class="rows">${items.map((i) => `<div class="row-item">
        <img class="row-thumb lg" src="${esc(i.thumb || NO_PHOTO)}" alt="">
        <div class="grow"><b>${i.deleted_at ? esc(i.title) : `<a href="/car/${esc(i.slug)}.html">${esc(i.title)}</a>`}</b><small>Stock ${esc(i.stock_no)}${i.mileage_km ? ` · ${fmt(i.mileage_km)} km` : ''}${i.colour ? ` · ${esc(i.colour)}` : ''}${i.registration_no ? ` · Plate ${esc(i.registration_no)}` : ''}</small></div>
        <div class="cart-price">${i.agreed_price_tzs ? `${money(i.agreed_price_tzs)}${i.listed_price_tzs && i.listed_price_tzs !== i.agreed_price_tzs ? `<span class="sub">Listed TZS ${fmt(i.listed_price_tzs)}</span>` : ''}` : i.listed_price_tzs ? money(i.listed_price_tzs) : '<span class="money">Price on request</span>'}</div>
      </div>`).join('')}</div></section>
    <section class="card"><div class="card-head"><h3>Timeline</h3></div><div class="card-body"><ol class="timeline-list">${history.map((h) => `<li><b>${esc((ORDER_STATUS[h.to_status] || ['', h.to_status])[1])}</b><span>${dateTime(h.created_at)}</span></li>`).reverse().join('')}</ol></div></section>
  </div>
  <div class="col-4 stack">
    <section class="card"><div class="card-head"><h3>${active ? 'Payment summary' : 'Order total'}</h3></div>
      <div class="card-body stack stack-sm">
        ${active && o.grand_total_tzs ? paidMeter(o.paid_tzs, o.grand_total_tzs) : ''}
        <div class="kv">
          <div><span>${agreed ? 'Agreed vehicle price' : 'Listed vehicle price'}</span><b class="money">${o.vehicles_total_tzs ? `TZS ${fmt(o.vehicles_total_tzs)}` : 'To be confirmed'}</b></div>
          ${costs.map((c) => `<div><span>${esc(c.label || COSTS[c.kind])}</span><b class="money">TZS ${fmt(c.amount_tzs)}</b></div>`).join('')}
          ${o.unpriced_items ? `<div><span>Priced on request</span><b>${o.unpriced_items} vehicle${o.unpriced_items === 1 ? '' : 's'}</b></div>` : ''}
          ${active ? `<div class="total"><span>Grand total</span><b class="money">TZS ${fmt(o.grand_total_tzs)}</b></div>
          <div><span>Paid so far</span><b class="money zero">TZS ${fmt(o.paid_tzs)}</b></div>
          <div><span>Balance due</span><b class="money ${o.balance_tzs > 0 ? 'due' : 'zero'}">TZS ${fmt(Math.max(0, o.balance_tzs))}</b></div>` : ''}
        </div>
        <p class="hint" style="padding:0">Payments are made by bank, mobile money or cash and recorded by our team. You never pay on this website.</p>
      </div>
      ${payments.length ? `<div class="rows" style="border-top:1px solid var(--line)">${payments.map((p) => `<div class="row-item"><span class="row-ic"><i class="fa-solid fa-receipt"></i></span><div class="grow"><b>${esc(p.receipt_no)}</b><small>${METHODS[p.method]} · ${date(p.received_on)} · TZS ${fmt(p.amount_tzs)}</small></div><a class="icon-btn sm" href="/account/receipts/${esc(p.receipt_no)}.pdf?download=1" aria-label="Download receipt ${esc(p.receipt_no)}"><i class="fa-solid fa-download"></i></a></div>`).join('')}</div>` : ''}
      ${active ? `<div class="card-foot"><a class="btn btn-outline btn-block" href="/account/orders/${o.ref}/invoice.pdf" target="_blank" rel="noopener"><i class="fa-solid fa-file-invoice"></i> Invoice / statement (PDF)</a></div>` : ''}
    </section>
    ${docs.length ? `<section class="card"><div class="card-head"><h3>Documents</h3></div><div class="rows">${docs.map((d) => `<div class="row-item"><span class="row-ic"><i class="fa-solid fa-file-lines"></i></span><div class="grow"><b>${esc(d.filename)}</b><small>${date(d.created_at)}</small></div><a class="icon-btn sm" href="/account/orders/${o.ref}/documents/${d.id}" target="_blank" rel="noopener" aria-label="Download ${esc(d.filename)}"><i class="fa-solid fa-download"></i></a></div>`).join('')}</div></section>` : ''}
    ${o.status !== 'cancelled' ? `<section class="card"><div class="card-body stack stack-sm"><b>Questions about this order?</b><a class="btn btn-whatsapp btn-block" href="${esc(o.status === 'pending' ? sendUrl : followUrl)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> ${o.status === 'pending' ? 'Send on WhatsApp' : 'Continue on WhatsApp'}</a><p class="hint" style="padding:0">Quote your reference <b>${o.ref}</b> so we can find your order quickly.</p></div></section>` : ''}
    ${o.customer_note ? `<section class="card"><div class="card-head"><h3>Your note</h3></div><div class="card-body"><p style="white-space:pre-wrap">${esc(o.customer_note)}</p></div></section>` : ''}
  </div>
</div>`;
}

/* ------------------------------------------------------------------ overview */
const ENQ = { new: ['amber', 'Received'], contacted: ['blue', 'In progress'], quoted: ['blue', 'Quoted'], closed: ['grey', 'Closed'] };
const enqTitle = (e) => (e.type === 'car_request' ? `Find me a ${[e.wanted_make, e.wanted_model].filter(Boolean).join(' ') || 'car'}${e.year_from || e.year_to ? ` ${[e.year_from, e.year_to].filter(Boolean).join('–')}` : ''}` : e.message.length > 70 ? `${e.message.slice(0, 70)}…` : e.message);
const enqPill = (s) => { const [c, l] = ENQ[s] || ['grey', s]; return `<span class="st st-${c}">${l}</span>`; };
const carRow = (v, action = '') => `<div class="row-item" data-id="${v.id}"><a href="/car/${esc(v.slug)}.html"><img class="row-thumb" src="${esc(v.thumb || NO_PHOTO)}" alt=""></a><div class="grow"><b><a href="/car/${esc(v.slug)}.html">${esc(`${v.make} ${v.model}`)}${v.year ? ` ${v.year}` : ''}</a></b><small>${esc(v.body_style)}${v.mileage_km ? ` · ${fmt(v.mileage_km)} km` : ''}${v.status !== 'available' ? ` · ${v.status === 'sold' ? 'Sold' : 'Not available'}` : ''}</small></div>${v.price_tzs ? money(v.price_tzs) : '<span class="money">On request</span>'}${action}</div>`;

export function overviewPage({ user, orders, enquiries, saved, cart, sums }) {
  const stat = (icon, tone, label, value, href, sm) => `<a class="stat" href="${href}"><span class="stat-ic ${tone}"><i class="fa-solid ${icon}"></i></span><span><small>${label}</small><b${sm ? ' class="sm"' : ''}>${value}</b></span></a>`;
  return `
<div class="page-bar"><div><h2>Welcome back, ${esc(user.name.split(' ')[0])}</h2><p>Track your orders, payments and saved cars in one place.</p></div>
  <div class="page-actions"><a class="btn btn-outline" href="/cars.html"><i class="fa-solid fa-magnifying-glass"></i> Browse vehicles</a><a class="btn btn-primary" href="/account/order-list"><i class="fa-solid fa-cart-shopping"></i> Order list (${cart})</a></div></div>
<section class="stats" aria-label="Summary">
  ${stat('fa-clipboard-list', 'info', 'Active orders', orders.length, '/account/orders')}${stat('fa-money-bill-wave', 'good', 'Paid so far', `TZS ${fmt(sums.paid)}`, '/account/orders', true)}
  ${stat('fa-hourglass-half', 'accent', 'Balance due', `TZS ${fmt(sums.balance)}`, '/account/orders', true)}${stat('fa-heart', '', 'Saved cars', saved.length, '/account/saved')}
</section>
${orders.length ? orders.map((o) => { const open = o.status !== 'pending'; return `<section class="card"><div class="card-head"><div><h3>Order ${o.ref}</h3><small>Placed ${date(o.created_at)} · ${esc((o.vehicles || '').split(' · ')[0])}</small></div><span class="head-pills">${orderPill(o.status)}${open ? paymentPill(o.payment_status) : ''}</span></div>
  <div class="card-body stack stack-sm">${open ? tracker(o.status, o.is_import) : '<p class="muted-line"><i class="fa-solid fa-hourglass-half"></i> Waiting for our team to confirm the price and availability with you on WhatsApp.</p>'}
    ${open && o.grand_total_tzs ? `<div class="cols"><div class="col-6">${paidMeter(o.paid_tzs, o.grand_total_tzs)}</div><div class="col-6 kv"><div><span>Balance due</span><b class="money ${o.balance_tzs > 0 ? 'due' : 'zero'}">TZS ${fmt(Math.max(0, o.balance_tzs))}</b></div></div></div>` : ''}
    ${o.vessel || o.shipping_eta ? `<p class="muted-line"><i class="fa-solid fa-ship"></i> ${o.vessel ? `Vessel <b>${esc(o.vessel)}</b>` : 'Shipping'}${o.shipping_eta ? ` · expected at port on <b>${date(o.shipping_eta)}</b>` : ''}</p>` : ''}</div>
  <div class="card-foot"><a class="btn btn-outline btn-sm" href="/account/orders/${o.ref}">Order details</a></div></section>`; }).join('')
    : `<section class="card"><div class="state"><i class="fa-solid fa-clipboard-list"></i><b>No active orders</b><p>Add vehicles to your order list, then send the order to our team on WhatsApp.</p><p style="margin-top:16px"><a class="btn btn-primary" href="/cars.html">Browse vehicles</a></p></div></section>`}
<div class="cols">
  <section class="card col-6"><div class="card-head"><h3>Saved cars</h3><a class="link-arrow" href="/account/saved">View all <i class="fa-solid fa-arrow-right"></i></a></div>${saved.length ? `<div class="rows">${saved.map((v) => carRow(v)).join('')}</div>` : '<div class="state" style="padding:32px 24px"><p>Tap the heart on any vehicle page to save it here.</p></div>'}</section>
  <section class="card col-6"><div class="card-head"><h3>My enquiries</h3><a class="link-arrow" href="/account/enquiries">View all <i class="fa-solid fa-arrow-right"></i></a></div>${enquiries.length ? `<div class="rows">${enquiries.map((e) => `<div class="row-item"><span class="row-ic"><i class="fa-solid ${e.type === 'car_request' ? 'fa-magnifying-glass' : 'fa-comment'}"></i></span><div class="grow"><b>${esc(enqTitle(e))}</b><small>${e.type === 'car_request' ? 'Car request' : 'Message'} · ${date(e.created_at)}</small></div>${enqPill(e.status)}</div>`).join('')}</div>` : '<div class="state" style="padding:32px 24px"><p>Questions and car requests you send us appear here. <a href="/contact.html" style="color:var(--accent-dark);font-weight:600">Ask us to find your car</a></p></div>'}</section>
</div>`;
}

export function savedPage({ cars }) {
  return `
<div class="page-bar"><div><h2>Saved cars</h2><p>${cars.length ? `${cars.length} saved vehicle${cars.length === 1 ? '' : 's'}` : 'Vehicles you want to come back to.'}</p></div><div class="page-actions"><a class="btn btn-outline" href="/cars.html"><i class="fa-solid fa-magnifying-glass"></i> Browse vehicles</a></div></div>
<section class="card">${cars.length ? `<div class="rows" id="saved-rows">${cars.map((v) => carRow(v, `<span class="row-actions">${v.status === 'available' ? `<button class="btn btn-dark btn-sm" type="button" data-row-cart="${v.id}"><i class="fa-solid fa-cart-plus"></i><span class="hide-sm"> Add to order list</span></button>` : ''}<button class="icon-btn sm danger" type="button" data-action="DELETE /api/account/saved/${v.id}" aria-label="Remove ${esc(`${v.make} ${v.model}`)} from saved cars"><i class="fa-solid fa-heart-crack"></i></button></span>`)).join('')}</div>`
    : '<div class="state"><i class="fa-regular fa-heart"></i><b>No saved cars yet</b><p>Open any vehicle and tap “Save” to keep it here for later.</p><p style="margin-top:16px"><a class="btn btn-primary" href="/cars.html">Browse vehicles</a></p></div>'}</section>`;
}

export function comparisonsPage({ rows }) {
  return `
<div class="page-bar"><div><h2>Saved comparisons</h2><p>Side-by-side comparisons you saved from the compare page.</p></div><div class="page-actions"><a class="btn btn-outline" href="/compare.html"><i class="fa-solid fa-scale-balanced"></i> Open compare</a></div></div>
<section class="card">${rows.length ? `<div class="rows">${rows.map((r) => `<div class="row-item"><span class="row-ic"><i class="fa-solid fa-scale-balanced"></i></span><div class="grow"><b style="white-space:normal">${esc(r.name)}</b><small>${r.cars.length} of ${r.vehicle_ids.length} vehicles still listed · saved ${date(r.created_at)}</small></div>
    <span class="row-actions">${r.cars.length >= 2 ? `<a class="btn btn-dark btn-sm" href="/compare.html?ids=${r.cars.map((c) => c.id).join(',')}">Open</a>` : ''}<button class="icon-btn sm danger" type="button" data-action="DELETE /api/account/comparisons/${r.id}" data-confirm-title="Delete this comparison?" data-confirm-message="${esc(r.name)}" data-confirm-label="Delete" aria-label="Delete comparison"><i class="fa-solid fa-trash-can"></i></button></span></div>`).join('')}</div>`
    : '<div class="state"><i class="fa-solid fa-scale-balanced"></i><b>No saved comparisons</b><p>Compare two or three vehicles, then tap “Save comparison”.</p><p style="margin-top:16px"><a class="btn btn-primary" href="/compare.html">Compare vehicles</a></p></div>'}</section>`;
}

export function myEnquiriesPage({ rows }) {
  return `
<div class="page-bar"><div><h2>My enquiries</h2><p>Messages and car requests you have sent us.</p></div><div class="page-actions"><a class="btn btn-primary" href="/contact.html#find-car"><i class="fa-solid fa-magnifying-glass"></i> Ask us to find your car</a></div></div>
<section class="card">${rows.length ? `<div class="rows">${rows.map((e) => `<div class="row-item"><span class="row-ic"><i class="fa-solid ${e.type === 'car_request' ? 'fa-magnifying-glass' : 'fa-comment'}"></i></span><div class="grow"><b style="white-space:normal">${esc(enqTitle(e))}</b><small>${e.type === 'car_request' ? `Car request${e.budget_tzs ? ` · budget TZS ${fmt(e.budget_tzs)}` : ''}` : 'Message'} · ${date(e.created_at)}</small></div>${enqPill(e.status)}</div>`).join('')}</div>`
    : '<div class="state"><i class="fa-solid fa-comments"></i><b>No enquiries yet</b><p>Can’t see the car you want? Tell us and we’ll search the Japanese auctions for you.</p></div>'}</section>`;
}

export function profilePage({ user }) {
  const f = (id, label, name, value, attrs, hint) => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" name="${name}" value="${esc(value || '')}" ${attrs}>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
  return `
<div class="page-bar"><div><h2>Profile</h2><p>Your contact details and password.</p></div></div>
<div class="cols">
  <form class="card col-6" data-api="PUT /api/account/profile" novalidate><div class="card-head"><h3>Your details</h3></div><div class="card-body stack stack-sm"><div class="form-summary" role="alert" hidden></div>
    ${f('pf-name', 'Full name <span class="req" aria-hidden="true">*</span>', 'name', user.name, 'required minlength="2" maxlength="80" autocomplete="name"')}
    ${f('pf-phone', 'Phone / WhatsApp', 'phone', user.phone, 'type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="+255 679 400 800"', 'Our team uses this number to reach you about your orders.')}
    ${f('pf-email', 'Email (used to log in) <span class="req" aria-hidden="true">*</span>', 'email', user.email, 'type="email" required maxlength="254" autocomplete="email"')}
  </div><div class="card-foot form-foot"><button class="btn btn-primary" type="submit" data-busy="Saving…">Save details</button></div></form>
  <form class="card col-6" data-api="POST /api/auth/change-password" novalidate><div class="card-head"><h3>Change password</h3></div><div class="card-body stack stack-sm"><div class="form-summary" role="alert" hidden></div>
    ${f('pw-cur', 'Current password <span class="req" aria-hidden="true">*</span>', 'current', '', 'type="password" required autocomplete="current-password"')}
    ${f('pw-new', 'New password <span class="req" aria-hidden="true">*</span>', 'password', '', 'type="password" required minlength="8" autocomplete="new-password"', 'At least 8 characters with letters and numbers. Other devices are signed out.')}
  </div><div class="card-foot form-foot"><button class="btn btn-primary" type="submit" data-busy="Updating…">Update password</button></div></form>
</div>`;
}

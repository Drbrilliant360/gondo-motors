import { esc, fmt } from '../lib.mjs';
import { money, pill, orderPill, paymentPill, paidMeter, date, qs, pagination, option } from './ui.mjs';
import { METHODS } from './account.mjs';

const field = (id, label, control, { required, hint, cls = '' } = {}) => `<div class="field ${cls}"><label for="${id}">${label}${required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>${control}${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
const input = (id, name, value, attrs = '') => `<input class="input" id="${id}" name="${name}" value="${esc(value ?? '')}" ${attrs}>`;
const DOC_KINDS = { invoice: 'Invoice', export_certificate: 'Export certificate', bill_of_lading: 'Bill of lading', tra_document: 'TRA document', registration_card: 'Registration card', other: 'Other' };
const clientFields = (c = {}, p = 'c') => `
  ${field(`${p}-name`, 'Full name', input(`${p}-name`, 'name', c.name, 'required minlength="2" maxlength="80"'), { required: true })}
  ${field(`${p}-phone`, 'Phone / WhatsApp', input(`${p}-phone`, 'phone', c.phone, 'type="tel" inputmode="tel" maxlength="20" placeholder="+255 679 400 800"'))}
  ${field(`${p}-email`, 'Email', input(`${p}-email`, 'email', c.email, 'type="email" maxlength="254"'))}
  ${field(`${p}-region`, 'Region', input(`${p}-region`, 'region', c.region, 'maxlength="60" placeholder="e.g. Dar es Salaam"'))}
  ${field(`${p}-address`, 'Address', input(`${p}-address`, 'address', c.address, 'maxlength="200"'), { cls: 'span-2' })}
  ${field(`${p}-notes`, 'Notes <span class="opt">(staff only)</span>', `<textarea class="textarea" id="${p}-notes" name="notes" maxlength="2000" style="min-height:88px">${esc(c.notes || '')}</textarea>`, { cls: 'span-2' })}`;
const clientDialog = (id, title, api, c, submit) => `<dialog class="dlg dlg-form" id="${id}" aria-labelledby="${id}-t"><form data-api="${api}" novalidate><h2 id="${id}-t">${title}</h2>
  <div class="stack stack-sm"><div class="form-summary" role="alert" hidden></div><div class="form-grid">${clientFields(c, id)}</div></div>
  <div class="dlg-actions"><button class="btn btn-outline" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit" data-busy="Saving…">${submit}</button></div></form></dialog>`;

/* ------------------------------------------------------------------ clients */
export function clientsList({ rows, query, paging }) {
  const filtered = Object.keys(query).length > 0;
  return `
<div class="page-bar"><div><h2>Clients</h2><p>Everyone with a confirmed order, plus clients you add by hand.</p></div>
  <div class="page-actions"><button class="btn btn-outline" type="button" data-open="#dlg-client"><i class="fa-solid fa-user-plus"></i> Add client</button><a class="btn btn-primary" href="/admin/orders/new"><i class="fa-solid fa-file-circle-plus"></i> New manual sale</a></div></div>
<section class="card">
  <form class="filter-bar" method="get" action="/admin/clients" role="search">
    <div class="field grow"><label for="f-q">Search</label><input class="input" id="f-q" name="q" type="search" value="${esc(query.q || '')}" placeholder="Name, phone, email or region"></div>
    <label class="check" style="padding-bottom:8px"><input type="checkbox" name="owing" value="1"${query.owing ? ' checked' : ''}> With a balance only</label>
    <div class="filter-actions"><button class="btn btn-dark" type="submit"><i class="fa-solid fa-filter"></i> Filter</button>${filtered ? '<a class="btn btn-outline" href="/admin/clients">Reset</a>' : ''}</div>
  </form>
  ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Client</th><th>Phone</th><th>Region</th><th class="num">Purchases</th><th class="num">Total paid</th><th class="num">Outstanding</th></tr></thead>
  <tbody>${rows.map((c) => `<tr><td data-label="Client"><a class="ref" href="/admin/clients/${c.id}">${esc(c.name)}</a>${c.email ? `<span class="sub">${esc(c.email)}</span>` : ''}</td>
    <td data-label="Phone"><span class="nw">${esc(c.phone || '—')}</span></td><td data-label="Region">${esc(c.region || '—')}</td>
    <td data-label="Purchases" class="num">${c.purchases}</td><td data-label="Total paid" class="num">${money(c.paid_tzs)}</td>
    <td data-label="Outstanding" class="num">${c.outstanding_tzs ? money(c.outstanding_tzs, 'due') : '<span class="money zero">TZS 0</span>'}</td></tr>`).join('')}</tbody></table></div>
  <div class="card-foot">${pagination(paging, query, 'clients')}</div>`
    : `<div class="state"><i class="fa-solid fa-user-tie"></i><b>${filtered ? 'No clients match' : 'No clients yet'}</b><p>${filtered ? 'Try a different search.' : 'A customer becomes a client when you confirm their order. You can also add walk-in and phone customers yourself.'}</p></div>`}
</section>
${clientDialog('dlg-client', 'Add a client', 'POST /api/admin/clients', {}, 'Add client')}`;
}

export function clientProfile({ client: c, orders, payments, documents }) {
  return `
<a class="back-link" href="/admin/clients" style="margin:0"><i class="fa-solid fa-arrow-left"></i> Back to clients</a>
<div class="page-bar"><div><h2>${esc(c.name)}</h2><p>Client since ${date(c.created_at)}${c.account_email ? ` · has a website account (${esc(c.account_email)})` : ' · no website account'}</p></div>
  <div class="page-actions"><button class="btn btn-outline" type="button" data-open="#dlg-client"><i class="fa-solid fa-pen"></i> Edit details</button><a class="btn btn-primary" href="/admin/orders/new?client=${c.id}"><i class="fa-solid fa-file-circle-plus"></i> New sale for this client</a></div></div>
<section class="stats">
  <div class="stat"><span class="stat-ic"><i class="fa-solid fa-clipboard-list"></i></span><span><small>Purchases</small><b>${c.purchases}</b></span></div>
  <div class="stat"><span class="stat-ic good"><i class="fa-solid fa-money-bill-wave"></i></span><span><small>Total paid</small><b class="sm">TZS ${fmt(c.paid_tzs)}</b></span></div>
  <div class="stat"><span class="stat-ic accent"><i class="fa-solid fa-hourglass-half"></i></span><span><small>Outstanding balance</small><b class="sm">TZS ${fmt(c.outstanding_tzs)}</b></span></div>
</section>
<div class="cols">
  <div class="col-8 stack">
    <section class="card"><div class="card-head"><h3>Orders</h3></div>${orders.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Reference</th><th>Vehicles</th><th class="num">Total</th><th>Paid</th><th>Payment</th><th>Status</th></tr></thead><tbody>${orders.map((o) => `<tr${o.status === 'cancelled' ? ' class="struck"' : ''}>
      <td data-label="Reference"><a class="ref" href="/admin/orders/${o.ref}">${o.ref}</a><span class="sub">${date(o.created_at)}</span></td><td data-label="Vehicles">${esc(o.vehicles || '')}</td>
      <td data-label="Total" class="num">${money(o.grand_total_tzs)}</td><td data-label="Paid">${o.status === 'cancelled' || !o.grand_total_tzs ? '—' : paidMeter(o.paid_tzs, o.grand_total_tzs)}</td>
      <td data-label="Payment">${o.status === 'cancelled' ? '—' : paymentPill(o.payment_status)}</td><td data-label="Status">${orderPill(o.status)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="state"><i class="fa-solid fa-clipboard-list"></i><b>No orders yet</b><p>Record a sale for this client to start their history.</p></div>'}</section>
    <section class="card"><div class="card-head"><h3>Payments</h3></div>${payments.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receipt</th><th>Date</th><th>Order</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>${payments.map((p) => `<tr${p.voided_at ? ' class="struck"' : ''}>
      <td data-label="Receipt">${p.voided_at ? `<span class="ref">${esc(p.receipt_no)}</span> ${pill('red', 'Voided')}` : `<a class="ref" href="/admin/payments/${esc(p.receipt_no)}/receipt.pdf" target="_blank" rel="noopener">${esc(p.receipt_no)}</a>`}</td>
      <td data-label="Date"><span class="nw">${date(p.received_on)}</span></td><td data-label="Order"><a class="ref" href="/admin/orders/${p.ref}#payments">${p.ref}</a></td>
      <td data-label="Method">${METHODS[p.method]}${p.reference ? `<span class="sub">Ref ${esc(p.reference)}</span>` : ''}</td><td data-label="Amount" class="num">${money(p.amount_tzs)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="state"><i class="fa-solid fa-money-bill-wave"></i><b>No payments recorded</b><p>Payments are recorded on each order.</p></div>'}</section>
  </div>
  <div class="col-4 stack">
    <section class="card"><div class="card-head"><h3>Contact details</h3></div><div class="card-body"><div class="kv">
      <div><span>Phone</span><b>${esc(c.phone || '—')}</b></div><div><span>Email</span><b style="word-break:break-all">${esc(c.email || '—')}</b></div><div><span>Region</span><b>${esc(c.region || '—')}</b></div><div><span>Address</span><b style="text-align:right">${esc(c.address || '—')}</b></div></div></div></section>
    <section class="card"><div class="card-head"><h3>Notes</h3></div><div class="card-body">${c.notes ? `<p style="white-space:pre-wrap">${esc(c.notes)}</p>` : '<p class="hint" style="padding:0">No notes. Use “Edit details” to add one.</p>'}</div></section>
    <section class="card"><div class="card-head"><h3>Documents</h3></div>${documents.length ? `<div class="rows">${documents.map((d) => `<div class="row-item"><span class="row-ic"><i class="fa-solid fa-file-lines"></i></span><div class="grow"><b>${esc(d.filename)}</b><small>${DOC_KINDS[d.kind]} · ${d.ref}</small></div><a class="icon-btn sm" href="/admin/orders/${d.order_id}/documents/${d.id}/download" target="_blank" rel="noopener" aria-label="Download ${esc(d.filename)}"><i class="fa-solid fa-download"></i></a></div>`).join('')}</div>` : '<div class="state" style="padding:24px"><p>Documents uploaded to this client’s orders appear here.</p></div>'}</section>
  </div>
</div>
${clientDialog('dlg-client', 'Edit client details', `PUT /api/admin/clients/${c.id}`, c, 'Save changes')}`;
}

/* ------------------------------------------------------------------ manual sale */
export function manualSale({ vehicles, clients, preset, max }) {
  const vehicleOptions = vehicles.map((v) => `<option value="${v.id}">${esc(`${v.make} ${v.model}${v.year ? ` ${v.year}` : ''}`)} · Stock ${esc(v.stock_no)} · ${v.price_tzs ? `TZS ${fmt(v.price_tzs)}` : 'price on request'}</option>`).join('');
  const row = (n) => `<div class="form-grid sale-row">
    ${field(`s-v${n}`, `Vehicle ${n}`, `<select class="select" id="s-v${n}" name="vehicle_${n}"${n === 1 ? ' required' : ''}><option value="">${n === 1 ? 'Choose a vehicle…' : 'None'}</option>${vehicleOptions}</select>`, { required: n === 1 })}
    ${field(`s-p${n}`, 'Agreed price (TZS)', input(`s-p${n}`, `price_${n}`, '', 'inputmode="numeric" data-money placeholder="Leave blank to use the listed price"'))}</div>`;
  return `
<a class="back-link" href="/admin/orders" style="margin:0"><i class="fa-solid fa-arrow-left"></i> Back to orders</a>
<div class="page-bar"><div><h2>New manual sale</h2><p>For customers who came by phone, walk-in or WhatsApp. The order is saved as Confirmed and the vehicles are reserved.</p></div></div>
<form class="stack" data-api="POST /api/admin/orders" data-confirm="Record this sale?|The order is created as Confirmed with its own reference number and the chosen vehicles are marked Reserved.|Record sale" novalidate>
  <div class="form-summary" role="alert" hidden></div>
  <div class="cols">
    <section class="card col-6"><div class="card-head"><h3>Customer</h3></div><div class="card-body stack stack-sm">
      ${field('s-client', 'Existing client', `<select class="select" id="s-client" name="client_id"><option value="">New client (enter details below)</option>${clients.map((c) => option(c.id, `${c.name}${c.phone ? ` · ${c.phone}` : ''}`, preset)).join('')}</select>`, { hint: 'Choose a client, or leave this on “New client” and fill in their details.' })}
      <div class="form-grid" id="new-client">
        ${field('s-name', 'Full name', input('s-name', 'client_name', '', 'maxlength="80"'))}
        ${field('s-phone', 'Phone / WhatsApp', input('s-phone', 'client_phone', '', 'type="tel" inputmode="tel" maxlength="20" placeholder="+255 679 400 800"'))}
        ${field('s-email', 'Email', input('s-email', 'client_email', '', 'type="email" maxlength="254"'))}
        ${field('s-region', 'Region', input('s-region', 'client_region', '', 'maxlength="60"'))}
      </div>
      ${field('s-channel', 'How did they reach you?', `<select class="select" id="s-channel" name="channel" required><option value="walk_in">Walk-in</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option></select>`, { required: true })}
    </div></section>
    <section class="card col-6"><div class="card-head"><h3>Vehicles</h3><small>${vehicles.length} available</small></div><div class="card-body stack stack-sm">
      ${vehicles.length ? `${row(1)}<details class="more"><summary>Add more vehicles to this sale</summary><div class="stack stack-sm" style="margin-top:16px">${Array.from({ length: max - 1 }, (_, i) => row(i + 2)).join('')}</div></details>` : '<div class="state"><i class="fa-solid fa-car-side"></i><b>No vehicles are available</b><p>Add a vehicle or set one to Available first.</p></div>'}
      ${field('s-note', 'Internal note <span class="opt">(optional)</span>', `<textarea class="textarea" id="s-note" name="note" maxlength="2000" style="min-height:88px" placeholder="What was agreed, who referred them…"></textarea>`)}
    </div></section>
  </div>
  <div class="form-foot"><a class="btn btn-outline" href="/admin/orders">Cancel</a><button class="btn btn-primary" type="submit" data-busy="Saving…"${vehicles.length ? '' : ' disabled'}>Record sale</button></div>
</form>`;
}

/* ------------------------------------------------------------------ payments ledger */
export function paymentsLedger({ rows, sums, admins, query, paging }) {
  const filtered = Object.keys(query).length > 0;
  return `
<div class="page-bar"><div><h2>Payments</h2><p>Every payment recorded across all orders. Voided entries stay in the ledger.</p></div>
  <div class="page-actions"><a class="btn btn-outline" href="/admin/payments.csv${esc(qs(query))}"><i class="fa-solid fa-file-csv"></i> Export CSV</a></div></div>
<section class="stats">
  <div class="stat"><span class="stat-ic good"><i class="fa-solid fa-money-bill-wave"></i></span><span><small>Received${filtered ? ' (filtered)' : ''}</small><b class="sm">TZS ${fmt(sums.received)}</b></span></div>
  <div class="stat"><span class="stat-ic"><i class="fa-solid fa-receipt"></i></span><span><small>Valid payments</small><b>${fmt(sums.valid_n)}</b></span></div>
  <div class="stat"><span class="stat-ic accent"><i class="fa-solid fa-ban"></i></span><span><small>Voided (${fmt(sums.voided_n)})</small><b class="sm">TZS ${fmt(sums.voided)}</b></span></div>
</section>
<section class="card">
  <form class="filter-bar" method="get" action="/admin/payments" role="search">
    <div class="field"><label for="f-from">From</label><input class="input" id="f-from" name="from" type="date" value="${esc(query.from || '')}"></div>
    <div class="field"><label for="f-to">To</label><input class="input" id="f-to" name="to" type="date" value="${esc(query.to || '')}"></div>
    <div class="field"><label for="f-method">Method</label><select class="select" id="f-method" name="method"><option value="">All</option>${Object.entries(METHODS).map(([k, l]) => option(k, l, query.method)).join('')}</select></div>
    <div class="field grow"><label for="f-client">Client, order or receipt</label><input class="input" id="f-client" name="client" type="search" value="${esc(query.client || '')}" placeholder="e.g. Amina, GM-2026-00042, RC-2026-00017"></div>
    <div class="field"><label for="f-admin">Received by</label><select class="select" id="f-admin" name="admin"><option value="">Anyone</option>${admins.map((a) => option(a.id, a.name, query.admin)).join('')}</select></div>
    <div class="field"><label for="f-voided">Voided</label><select class="select" id="f-voided" name="voided"><option value="">Show all</option>${option('hide', 'Hide voided', query.voided)}${option('only', 'Voided only', query.voided)}</select></div>
    <div class="filter-actions"><button class="btn btn-dark" type="submit"><i class="fa-solid fa-filter"></i> Filter</button>${filtered ? '<a class="btn btn-outline" href="/admin/payments">Reset</a>' : ''}</div>
  </form>
  ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receipt</th><th>Received</th><th>Client</th><th>Order</th><th>Method</th><th>Received by</th><th class="num">Amount</th></tr></thead>
  <tbody>${rows.map((p) => `<tr${p.voided_at ? ' class="struck"' : ''}>
    <td data-label="Receipt">${p.voided_at ? `<span class="ref">${esc(p.receipt_no)}</span><span class="sub">${pill('red', 'Voided')}</span>` : `<a class="ref" href="/admin/payments/${esc(p.receipt_no)}/receipt.pdf" target="_blank" rel="noopener">${esc(p.receipt_no)}</a>`}</td>
    <td data-label="Received"><span class="nw">${date(p.received_on)}</span></td>
    <td data-label="Client"><a href="/admin/clients/${p.client_id}">${esc(p.client_name)}</a>${p.paid_by !== p.client_name ? `<span class="sub">Paid by ${esc(p.paid_by)}</span>` : ''}</td>
    <td data-label="Order"><a class="ref" href="/admin/orders/${p.ref}#payments">${p.ref}</a></td>
    <td data-label="Method"><span>${METHODS[p.method]}${p.reference ? `<span class="sub">Ref ${esc(p.reference)}</span>` : ''}${p.voided_at ? `<span class="sub">${esc(p.void_reason)}</span>` : ''}</span></td>
    <td data-label="Received by">${esc(p.received_by_name)}</td><td data-label="Amount" class="num">${money(p.amount_tzs)}</td></tr>`).join('')}</tbody></table></div>
  <div class="card-foot">${pagination(paging, query, 'payments')}</div>`
    : `<div class="state"><i class="fa-solid fa-money-bill-wave"></i><b>${filtered ? 'No payments match these filters' : 'No payments recorded yet'}</b><p>${filtered ? 'Try a wider date range or remove a filter.' : 'Payments are recorded on each confirmed order and appear here.'}</p></div>`}
</section>`;
}

/* ------------------------------------------------------------------ reports */
export function reportsPage({ from, to, months, outstanding, models, methods, summary }) {
  const range = qs({ from, to }), top = Math.max(1, ...months.map((m) => Math.max(m.sales, m.received)));
  const csv = (name) => `<a class="btn btn-outline btn-sm no-print" href="/admin/reports/${name}.csv${esc(range)}"><i class="fa-solid fa-file-csv"></i> CSV</a>`;
  const monthLabel = (m) => new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' }).format(new Date(`${m}-15T00:00:00Z`));
  const methodTotal = methods.reduce((s, m) => s + m.amount, 0) || 1;
  const empty = (text) => `<div class="state" style="padding:32px 24px"><p>${text}</p></div>`;
  return `
<div class="page-bar"><div><h2>Reports</h2><p>${date(from)} to ${date(to)}</p></div>
  <div class="page-actions no-print"><button class="btn btn-outline" type="button" data-print><i class="fa-solid fa-print"></i> Print</button></div></div>
<section class="card no-print"><form class="filter-bar" method="get" action="/admin/reports" style="border-bottom:0">
  <div class="field"><label for="r-from">From</label><input class="input" id="r-from" name="from" type="date" value="${from}" required></div>
  <div class="field"><label for="r-to">To</label><input class="input" id="r-to" name="to" type="date" value="${to}" required></div>
  <div class="filter-actions"><button class="btn btn-dark" type="submit">Show report</button></div></form></section>
<section class="stats">
  <div class="stat"><span class="stat-ic"><i class="fa-solid fa-clipboard-check"></i></span><span><small>Orders confirmed</small><b>${fmt(summary.orders)}</b></span></div>
  <div class="stat"><span class="stat-ic info"><i class="fa-solid fa-chart-line"></i></span><span><small>Sales value</small><b class="sm">TZS ${fmt(summary.sales)}</b></span></div>
  <div class="stat"><span class="stat-ic good"><i class="fa-solid fa-money-bill-wave"></i></span><span><small>Payments received</small><b class="sm">TZS ${fmt(summary.received)}</b></span></div>
  <div class="stat"><span class="stat-ic accent"><i class="fa-solid fa-hourglass-half"></i></span><span><small>Outstanding now</small><b class="sm">TZS ${fmt(summary.outstanding)}</b></span></div>
</section>
<section class="card"><div class="card-head"><h3>Sales and revenue by month</h3><div style="display:flex;gap:16px;align-items:center"><div class="legend"><span><i></i>Sales value</span><span><i></i>Received</span></div>${csv('sales')}</div></div>
  <div class="card-body"><div class="bars" role="img" aria-label="Sales value and payments received per month">${months.map((m) => `<div><div class="pair"><i style="--h:${(m.sales / top) * 100}%"></i><i style="--h:${(m.received / top) * 100}%"></i></div>${monthLabel(m.month)}</div>`).join('')}</div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="num">Orders confirmed</th><th class="num">Sales value</th><th class="num">Payments received</th></tr></thead><tbody>${months.map((m) => `<tr><td data-label="Month">${monthLabel(m.month)}</td><td data-label="Orders" class="num">${m.orders}</td><td data-label="Sales value" class="num">${money(m.sales)}</td><td data-label="Received" class="num">${money(m.received)}</td></tr>`).join('')}</tbody></table></div>
</section>
<div class="cols">
  <section class="card col-6"><div class="card-head"><h3>Best-selling makes and models</h3>${csv('models')}</div>${models.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vehicle</th><th class="num">Sold</th><th class="num">Value</th></tr></thead><tbody>${models.map((m) => `<tr><td data-label="Vehicle">${esc(m.make)} ${esc(m.model)}</td><td data-label="Sold" class="num">${m.sold}</td><td data-label="Value" class="num">${money(m.value)}</td></tr>`).join('')}</tbody></table></div>` : empty('No vehicles sold in this period.')}</section>
  <section class="card col-6"><div class="card-head"><h3>Payment methods</h3>${csv('methods')}</div>${methods.length ? `<div class="card-body"><div class="hbars">${methods.map((m) => `<div class="hbar wide"><span>${METHODS[m.method]}</span><div><span style="width:${(m.amount / methodTotal) * 100}%"></span></div><b>${Math.round((m.amount / methodTotal) * 100)}%</b></div>`).join('')}</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Method</th><th class="num">Payments</th><th class="num">Amount</th></tr></thead><tbody>${methods.map((m) => `<tr><td data-label="Method">${METHODS[m.method]}</td><td data-label="Payments" class="num">${m.payments}</td><td data-label="Amount" class="num">${money(m.amount)}</td></tr>`).join('')}</tbody></table></div>` : empty('No payments received in this period.')}</section>
</div>
<section class="card"><div class="card-head"><h3>Outstanding balances by client</h3><div style="display:flex;gap:16px;align-items:center"><small>As of today</small>${csv('outstanding')}</div></div>
  ${outstanding.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Client</th><th class="num">Open orders</th><th class="num">Order total</th><th class="num">Paid</th><th class="num">Balance</th><th>Due</th></tr></thead><tbody>${outstanding.map((c) => `<tr><td data-label="Client"><a class="ref" href="/admin/clients/${c.id}">${esc(c.name)}</a><span class="sub">${esc(c.phone || '')}</span></td><td data-label="Open orders" class="num">${c.orders}</td><td data-label="Order total" class="num">${money(c.total)}</td><td data-label="Paid" class="num">${money(c.paid)}</td><td data-label="Balance" class="num">${money(c.balance, 'due')}</td><td data-label="Due">${c.due ? `<span class="nw${c.due < new Date().toISOString().slice(0, 10) ? ' warn-text' : ''}">${date(c.due)}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('No outstanding balances. Every confirmed order is fully paid.')}
</section>`;
}

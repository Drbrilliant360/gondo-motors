import { esc, fmt } from '../lib.mjs';
import { money, pill, orderPill, paymentPill, paidMeter, date, dateTime, qs, pagination, option } from './ui.mjs';
import { METHODS } from './account.mjs';

const field = (id, label, control, { required, hint, cls = '' } = {}) => `<div class="field ${cls}"><label for="${id}">${label}${required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>${control}${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
const input = (id, name, value, attrs = '') => `<input class="input" id="${id}" name="${name}" value="${esc(value ?? '')}" ${attrs}>`;
const area = (id, name, value, attrs = '') => `<textarea class="textarea" id="${id}" name="${name}" ${attrs}>${esc(value ?? '')}</textarea>`;
const stat = (icon, tone, label, value, href, sm) => `<a class="stat" href="${href}"><span class="stat-ic ${tone}"><i class="fa-solid ${icon}"></i></span><span><small>${label}</small><b${sm ? ' class="sm"' : ''}>${value}</b></span></a>`;
export const ENQUIRY_PILL = { new: ['amber', 'New'], contacted: ['blue', 'Contacted'], quoted: ['blue', 'Quoted'], closed: ['grey', 'Closed'] };
export const enquiryPill = (s) => pill(...(ENQUIRY_PILL[s] || ['grey', s]));
export const enquiryTitle = (e) => (e.type === 'car_request' ? `Find me a ${[e.wanted_make, e.wanted_model].filter(Boolean).join(' ') || 'car'}${e.year_from || e.year_to ? ` ${[e.year_from, e.year_to].filter(Boolean).join('–')}` : ''}` : e.message.length > 70 ? `${e.message.slice(0, 70)}…` : e.message);
const hbars = (rows) => { const top = Math.max(1, ...rows.map((r) => r.n)); return `<div class="hbars">${rows.map((r) => `<div class="hbar"><span>${esc(r.label)}</span><div><span style="width:${(r.n / top) * 100}%"></span></div><b>${r.n}</b></div>`).join('')}</div>`; };
const chevron = '<i class="fa-solid fa-chevron-right" style="color:var(--muted);font-size:.75rem"></i>';

/* ------------------------------------------------------------------ dashboard */
export function dashboardPage({ user, stats: s, months, makes, bodies, orders, payments, enquiries, overdue }) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Dar_es_Salaam' }).format(new Date()));
  const topO = Math.max(1, ...months.map((m) => m.orders)), topP = Math.max(1, ...months.map((m) => m.received));
  const attention = [
    overdue.length ? `<a class="row-item" href="/admin/orders?overdue=1"><span class="row-ic" style="background:var(--accent-soft);color:var(--accent-dark)"><i class="fa-solid fa-triangle-exclamation"></i></span><div class="grow"><b>${overdue.length} order${overdue.length === 1 ? '' : 's'} with an overdue balance</b><small>TZS ${fmt(overdue.reduce((t, o) => t + o.balance_tzs, 0))} past the due date</small></div>${chevron}</a>` : '',
    s.pending_orders ? `<a class="row-item" href="/admin/orders?status=pending"><span class="row-ic" style="background:var(--warn-soft);color:var(--warn)"><i class="fa-solid fa-clipboard-list"></i></span><div class="grow"><b>${s.pending_orders} order${s.pending_orders === 1 ? '' : 's'} waiting for confirmation</b><small>Agree the deal on WhatsApp, then confirm</small></div>${chevron}</a>` : '',
    s.no_price ? `<a class="row-item" href="/admin/vehicles?missing=price"><span class="row-ic" style="background:var(--warn-soft);color:var(--warn)"><i class="fa-solid fa-tag"></i></span><div class="grow"><b>${s.no_price} listing${s.no_price === 1 ? '' : 's'} without a price</b><small>Shown to customers as “Price on request”</small></div>${chevron}</a>` : '',
    s.no_photos ? `<a class="row-item" href="/admin/vehicles?missing=photos"><span class="row-ic" style="background:var(--warn-soft);color:var(--warn)"><i class="fa-regular fa-images"></i></span><div class="grow"><b>${s.no_photos} listing${s.no_photos === 1 ? '' : 's'} without photos</b><small>Add photos so customers can see them</small></div>${chevron}</a>` : '',
    s.new_enquiries ? `<a class="row-item" href="/admin/enquiries?status=new"><span class="row-ic"><i class="fa-solid fa-inbox"></i></span><div class="grow"><b>${s.new_enquiries} new enquir${s.new_enquiries === 1 ? 'y' : 'ies'}</b><small>Waiting for a reply</small></div>${chevron}</a>` : '',
  ].filter(Boolean);
  return `
<div class="page-bar">
  <div><h2>Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${esc(user.name.split(' ')[0])}</h2><p>${new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' }).format(new Date())} · here is where sales stand today.</p></div>
  <div class="page-actions"><a class="btn btn-outline" href="/admin/vehicles/new"><i class="fa-solid fa-plus"></i> Add vehicle</a><a class="btn btn-primary" href="/admin/orders/new"><i class="fa-solid fa-file-circle-plus"></i> New manual sale</a></div>
</div>
<section class="stats" aria-label="Key figures">
  ${stat('fa-car-side', '', 'Total vehicles', fmt(s.vehicles), '/admin/vehicles')}${stat('fa-circle-check', 'good', 'Available', fmt(s.available), '/admin/vehicles?status=available')}
  ${stat('fa-lock', 'warn', 'Reserved', fmt(s.reserved), '/admin/vehicles?status=reserved')}${stat('fa-ship', 'info', 'In transit', fmt(s.in_transit), '/admin/vehicles?status=in_transit')}
  ${stat('fa-tag', '', 'Sold this month', fmt(s.sold_month), '/admin/vehicles?status=sold')}${stat('fa-clipboard-list', 'warn', 'Pending orders', fmt(s.pending_orders), '/admin/orders?status=pending')}
  ${stat('fa-money-bill-wave', 'good', 'Received this month', `TZS ${fmt(s.received_month)}`, '/admin/payments', true)}${stat('fa-hourglass-half', 'accent', 'Outstanding balances', `TZS ${fmt(s.outstanding)}`, '/admin/clients?owing=1', true)}
  ${stat('fa-inbox', 'info', 'New enquiries', fmt(s.new_enquiries), '/admin/enquiries?status=new')}${stat('fa-user-plus', '', 'New users (30 days)', fmt(s.new_users), '/admin/users?role=user')}
</section>
<div class="cols">
  <section class="card col-7"><div class="card-head"><h3>Orders and payments received</h3><div class="legend"><span><i></i>Orders</span><span><i></i>Payments</span></div></div>
    <div class="card-body"><div class="bars" role="img" aria-label="Orders placed and payments received over the last six months">${months.map((m) => `<div title="${m.orders} orders · TZS ${fmt(m.received)} received"><div class="pair"><i style="--h:${(m.orders / topO) * 100}%"></i><i style="--h:${(m.received / topP) * 100}%"></i></div>${esc(m.label)}</div>`).join('')}</div>
    <p class="hint" style="padding:16px 0 0">Last six months. Each series is scaled to its own highest month; see <a href="/admin/reports" style="color:var(--accent-dark);font-weight:600">Reports</a> for the figures.</p></div></section>
  <section class="card col-5"><div class="card-head"><h3>Stock in hand</h3></div><div class="tabs" role="tablist" aria-label="Stock breakdown"><button role="tab" aria-selected="true" aria-controls="stock-make">By make</button><button role="tab" aria-selected="false" tabindex="-1" aria-controls="stock-body">By body style</button></div>
    <div class="card-body" id="stock-make" role="tabpanel">${makes.length ? hbars(makes) : '<p class="hint" style="padding:0">No stock yet.</p>'}</div><div class="card-body" id="stock-body" role="tabpanel" hidden>${bodies.length ? hbars(bodies) : ''}</div></section>
</div>
<section class="card"><div class="card-head"><h3>Latest orders</h3><a class="link-arrow" href="/admin/orders">All orders <i class="fa-solid fa-arrow-right"></i></a></div>
  ${orders.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Reference</th><th>Customer</th><th>Vehicles</th><th class="num">Grand total</th><th>Paid</th><th>Payment</th><th>Status</th></tr></thead><tbody>${orders.map((o) => { const open = !['pending', 'cancelled'].includes(o.status); return `<tr${o.status === 'cancelled' ? ' class="struck"' : ''}>
    <td data-label="Reference"><a class="ref" href="/admin/orders/${o.ref}">${o.ref}</a></td><td data-label="Customer"><span class="nw">${esc(o.customer_name)}</span></td><td data-label="Vehicles">${esc(o.vehicles || '')}</td>
    <td data-label="Grand total" class="num">${money(o.grand_total_tzs)}</td><td data-label="Paid">${open && o.grand_total_tzs ? paidMeter(o.paid_tzs, o.grand_total_tzs) : '—'}</td><td data-label="Payment">${open ? paymentPill(o.payment_status) : '—'}</td><td data-label="Status">${orderPill(o.status)}</td></tr>`; }).join('')}</tbody></table></div>`
    : '<div class="state"><i class="fa-solid fa-clipboard-list"></i><b>No orders yet</b><p>Orders sent from the website and manual sales appear here.</p></div>'}
</section>
<div class="cols">
  <section class="card col-4"><div class="card-head"><h3>Latest payments</h3><a class="link-arrow" href="/admin/payments">Ledger <i class="fa-solid fa-arrow-right"></i></a></div>
    ${payments.length ? `<div class="rows">${payments.map((p) => `<a class="row-item" href="/admin/orders/${p.ref}#payments"><span class="row-ic"><i class="fa-solid ${p.method === 'bank_transfer' ? 'fa-building-columns' : p.method === 'cash' ? 'fa-money-bill' : 'fa-mobile-screen'}"></i></span><div class="grow"><b>${esc(p.client_name)}</b><small>${esc(p.receipt_no)} · ${METHODS[p.method]} · ${date(p.received_on)}</small></div>${p.voided_at ? pill('red', 'Voided') : money(p.amount_tzs)}</a>`).join('')}</div>` : '<div class="state" style="padding:32px 24px"><p>No payments recorded yet.</p></div>'}</section>
  <section class="card col-4"><div class="card-head"><h3>Latest enquiries</h3><a class="link-arrow" href="/admin/enquiries">All <i class="fa-solid fa-arrow-right"></i></a></div>
    ${enquiries.length ? `<div class="rows">${enquiries.map((e) => `<a class="row-item" href="/admin/enquiries#e-${e.id}"><span class="row-ic"><i class="fa-solid ${e.type === 'car_request' ? 'fa-magnifying-glass' : 'fa-comment'}"></i></span><div class="grow"><b>${esc(e.name)}</b><small>${esc(enquiryTitle(e))}</small></div>${enquiryPill(e.status)}</a>`).join('')}</div>` : '<div class="state" style="padding:32px 24px"><p>No enquiries yet.</p></div>'}</section>
  <section class="card col-4"><div class="card-head"><h3>Needs attention</h3></div>${attention.length ? `<div class="rows">${attention.join('')}</div>` : '<div class="state" style="padding:32px 24px"><i class="fa-solid fa-circle-check"></i><b>All clear</b><p>Nothing needs your attention right now.</p></div>'}</section>
</div>
${overdue.length ? `<section class="card"><div class="card-head"><h3>Orders with overdue balances</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Reference</th><th>Customer</th><th>Due</th><th class="num">Balance</th></tr></thead><tbody>${overdue.map((o) => `<tr><td data-label="Reference"><a class="ref" href="/admin/orders/${o.ref}#payments">${o.ref}</a></td><td data-label="Customer">${esc(o.customer_name)}</td><td data-label="Due"><span class="warn-text nw">${date(o.balance_due_date)}</span></td><td data-label="Balance" class="num">${money(o.balance_tzs, 'due')}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
}

/* ------------------------------------------------------------------ enquiries */
export function enquiriesPage({ rows, counts, query, paging }) {
  const filtered = Object.keys(query).length > 0;
  const chip = (label, changes, on) => `<a class="chip${on ? ' active' : ''}" href="/admin/enquiries${esc(qs({}, changes))}">${label}</a>`;
  return `
<div class="page-bar"><div><h2>Enquiries</h2><p>Messages from the contact form and “Ask us to find your car” requests.</p></div></div>
<section class="card">
  <div class="quick-filters">${chip('All', {}, !filtered)}${Object.entries(ENQUIRY_PILL).map(([k, [, l]]) => chip(`${l} (${counts[k] || 0})`, { status: k }, query.status === k)).join('')}${chip('Car requests', { type: 'car_request' }, query.type === 'car_request')}</div>
  <form class="filter-bar" method="get" action="/admin/enquiries" role="search"><div class="field grow"><label for="f-q">Search</label><input class="input" id="f-q" name="q" type="search" value="${esc(query.q || '')}" placeholder="Name, phone, message, make or model"></div>
    ${query.status ? `<input type="hidden" name="status" value="${esc(query.status)}">` : ''}<div class="filter-actions"><button class="btn btn-dark" type="submit"><i class="fa-solid fa-filter"></i> Search</button>${filtered ? '<a class="btn btn-outline" href="/admin/enquiries">Reset</a>' : ''}</div></form>
  ${rows.length ? `<div class="rows">${rows.map((e) => `<details class="enquiry" id="e-${e.id}"><summary class="row-item"><span class="row-ic"><i class="fa-solid ${e.type === 'car_request' ? 'fa-magnifying-glass' : 'fa-comment'}"></i></span>
      <div class="grow"><b>${esc(e.name)} · <span style="font-weight:500">${esc(enquiryTitle(e))}</span></b><small>${e.type === 'car_request' ? 'Car request' : 'Message'} · ${dateTime(e.created_at)}${e.phone ? ` · ${esc(e.phone)}` : ''}</small></div>${enquiryPill(e.status)}<i class="fa-solid fa-chevron-down caret"></i></summary>
    <div class="enquiry-body"><div class="cols">
      <div class="col-7 stack stack-sm">
        ${e.type === 'car_request' ? `<div class="kv"><div><span>Wanted</span><b>${esc([e.wanted_make, e.wanted_model].filter(Boolean).join(' ') || '—')}</b></div><div><span>Years</span><b>${esc([e.year_from, e.year_to].filter(Boolean).join(' – ') || 'Any')}</b></div><div><span>Budget</span><b>${e.budget_tzs ? `TZS ${fmt(e.budget_tzs)}` : 'Not stated'}</b></div></div>` : ''}
        <p style="white-space:pre-wrap">${esc(e.message)}</p>
        <div class="kv"><div><span>Phone</span><b>${esc(e.phone || '—')}</b></div><div><span>Email</span><b style="word-break:break-all">${esc(e.email || '—')}</b></div>${e.user_id ? `<div><span>Account</span><b><a href="/admin/users/${e.user_id}" style="color:var(--accent-dark)">View user</a></b></div>` : ''}${e.handled_by_name ? `<div><span>Last handled by</span><b>${esc(e.handled_by_name)}</b></div>` : ''}</div>
        ${e.wa ? `<div><a class="btn btn-whatsapp btn-sm" href="${esc(e.wa)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Reply on WhatsApp</a></div>` : ''}
      </div>
      <form class="col-5 stack stack-sm" data-api="PUT /api/admin/enquiries/${e.id}" novalidate>
        ${field(`es-${e.id}`, 'Status', `<select class="select" id="es-${e.id}" name="status">${Object.entries(ENQUIRY_PILL).map(([k, [, l]]) => option(k, l, e.status)).join('')}</select>`)}
        ${field(`en-${e.id}`, 'Staff notes', area(`en-${e.id}`, 'admin_notes', e.admin_notes, 'maxlength="2000" style="min-height:88px" placeholder="What was discussed or quoted"'))}
        <div><button class="btn btn-primary btn-sm" type="submit" data-busy="Saving…">Save</button></div>
      </form></div></div></details>`).join('')}</div><div class="card-foot">${pagination(paging, query, 'enquiries')}</div>`
    : `<div class="state"><i class="fa-solid fa-inbox"></i><b>${filtered ? 'No enquiries match' : 'No enquiries yet'}</b><p>${filtered ? 'Try a different status or search.' : 'Messages sent from the website will appear here.'}</p></div>`}
</section>`;
}

/* ------------------------------------------------------------------ users */
export function usersPage({ rows, me, query, paging }) {
  const filtered = Object.keys(query).length > 0;
  return `
<div class="page-bar"><div><h2>Users</h2><p>Customer accounts and admin accounts.</p></div><div class="page-actions"><button class="btn btn-primary" type="button" data-open="#dlg-admin"><i class="fa-solid fa-user-shield"></i> Create admin account</button></div></div>
<section class="card">
  <form class="filter-bar" method="get" action="/admin/users" role="search">
    <div class="field grow"><label for="f-q">Search</label><input class="input" id="f-q" name="q" type="search" value="${esc(query.q || '')}" placeholder="Name, email or phone"></div>
    <div class="field"><label for="f-role">Role</label><select class="select" id="f-role" name="role"><option value="">All</option>${option('user', 'Customers', query.role)}${option('admin', 'Admins', query.role)}</select></div>
    <div class="field"><label for="f-state">Access</label><select class="select" id="f-state" name="state"><option value="">All</option>${option('active', 'Active', query.state)}${option('inactive', 'Deactivated', query.state)}</select></div>
    <div class="filter-actions"><button class="btn btn-dark" type="submit"><i class="fa-solid fa-filter"></i> Filter</button>${filtered ? '<a class="btn btn-outline" href="/admin/users">Reset</a>' : ''}</div>
  </form>
  ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Phone</th><th class="num">Orders</th><th class="num">Enquiries</th><th>Last login</th><th>Access</th><th class="num">Action</th></tr></thead><tbody>${rows.map((u) => `<tr>
    <td data-label="User"><a class="ref" href="/admin/users/${u.id}">${esc(u.name)}</a><span class="sub">${esc(u.email)}</span></td>
    <td data-label="Role">${u.role === 'admin' ? pill('blue', 'Admin') : pill('grey', 'Customer')}</td><td data-label="Phone"><span class="nw">${esc(u.phone || '—')}</span></td>
    <td data-label="Orders" class="num">${u.orders}</td><td data-label="Enquiries" class="num">${u.enquiries}</td><td data-label="Last login"><span class="nw">${u.last_login_at ? date(u.last_login_at) : 'Never'}</span></td>
    <td data-label="Access">${u.is_active ? pill('green', 'Active') : pill('red', 'Deactivated')}</td>
    <td data-label="Action" class="num">${u.id === me ? '<span class="sub">You</span>' : `<button class="btn btn-outline btn-sm" type="button" data-action="POST /api/admin/users/${u.id}/active" data-confirm-title="${u.is_active ? 'Deactivate' : 'Reactivate'} ${esc(u.name)}?" data-confirm-message="${u.is_active ? 'They are signed out straight away and cannot log in until reactivated. Their orders and records are kept.' : 'They will be able to log in again.'}" data-confirm-label="${u.is_active ? 'Deactivate' : 'Reactivate'}" data-confirm-icon="fa-user-lock">${u.is_active ? 'Deactivate' : 'Reactivate'}</button>`}</td></tr>`).join('')}</tbody></table></div><div class="card-foot">${pagination(paging, query, 'users')}</div>`
    : '<div class="state"><i class="fa-solid fa-users"></i><b>No users match</b><p>Try a different search or filter.</p></div>'}
</section>
<dialog class="dlg dlg-form" id="dlg-admin" aria-labelledby="dlg-admin-t"><form data-api="POST /api/admin/users" data-confirm="Create this admin account?|Admins can see every client, order and payment, and can record and void payments.|Create admin" novalidate><h2 id="dlg-admin-t">Create an admin account</h2>
  <div class="stack stack-sm"><p>Give the new admin the temporary password privately. They must choose their own when they first log in.</p><div class="form-summary" role="alert" hidden></div><div class="form-grid">
    ${field('ad-name', 'Full name', input('ad-name', 'name', '', 'required minlength="2" maxlength="80"'), { required: true })}${field('ad-email', 'Email', input('ad-email', 'email', '', 'type="email" required maxlength="254" autocomplete="off"'), { required: true })}
    ${field('ad-phone', 'Phone', input('ad-phone', 'phone', '', 'type="tel" maxlength="20"'))}${field('ad-pass', 'Temporary password', input('ad-pass', 'password', '', 'type="text" required minlength="8" maxlength="200" autocomplete="off"'), { required: true, hint: 'At least 8 characters with letters and numbers.' })}</div></div>
  <div class="dlg-actions"><button class="btn btn-outline" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit" data-busy="Creating…">Create admin</button></div></form></dialog>`;
}

export function userPage({ user: u, orders, enquiries, me }) {
  return `
<a class="back-link" href="/admin/users" style="margin:0"><i class="fa-solid fa-arrow-left"></i> Back to users</a>
<div class="page-bar"><div><h2>${esc(u.name)} <span class="head-pills">${u.role === 'admin' ? pill('blue', 'Admin') : pill('grey', 'Customer')}${u.is_active ? pill('green', 'Active') : pill('red', 'Deactivated')}</span></h2><p>${esc(u.email)}${u.phone ? ` · ${esc(u.phone)}` : ''} · joined ${date(u.created_at)} · last login ${u.last_login_at ? dateTime(u.last_login_at) : 'never'}${u.must_change_password ? ' · must change password at next login' : ''}</p></div>
  <div class="page-actions">${u.client_id ? `<a class="btn btn-outline" href="/admin/clients/${u.client_id}"><i class="fa-solid fa-user-tie"></i> Client record</a>` : ''}${u.id === me ? '' : `<button class="btn btn-outline" type="button" data-action="POST /api/admin/users/${u.id}/active" data-confirm-title="${u.is_active ? 'Deactivate' : 'Reactivate'} ${esc(u.name)}?" data-confirm-message="${u.is_active ? 'They are signed out straight away and cannot log in until reactivated.' : 'They will be able to log in again.'}" data-confirm-label="${u.is_active ? 'Deactivate' : 'Reactivate'}" data-confirm-icon="fa-user-lock">${u.is_active ? 'Deactivate' : 'Reactivate'}</button>`}</div></div>
<div class="cols">
  <section class="card col-7"><div class="card-head"><h3>Orders (${orders.length})</h3></div>${orders.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Reference</th><th>Vehicles</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>${orders.map((o) => `<tr><td data-label="Reference"><a class="ref" href="/admin/orders/${o.ref}">${o.ref}</a><span class="sub">${date(o.created_at)}</span></td><td data-label="Vehicles">${esc(o.vehicles || '')}</td><td data-label="Total" class="num">${money(o.grand_total_tzs)}</td><td data-label="Status">${orderPill(o.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="state" style="padding:32px 24px"><p>No orders from this user.</p></div>'}</section>
  <section class="card col-5"><div class="card-head"><h3>Enquiries (${enquiries.length})</h3></div>${enquiries.length ? `<div class="rows">${enquiries.map((e) => `<a class="row-item" href="/admin/enquiries#e-${e.id}"><div class="grow"><b>${esc(enquiryTitle(e))}</b><small>${date(e.created_at)}</small></div>${enquiryPill(e.status)}</a>`).join('')}</div>` : '<div class="state" style="padding:32px 24px"><p>No enquiries from this user.</p></div>'}</section>
</div>`;
}

/* ------------------------------------------------------------------ content */
export function contentPage({ site, faq, steps, banners }) {
  const slides = [0, 1, 2].map((i) => banners[i] || {});
  const faqRows = [...faq, {}, {}, {}], stepRows = [...steps, {}, {}], offices = [...site.offices, {}].slice(0, 4), team = [...site.salesTeam, {}, {}].slice(0, 8);
  const tab = (id, label, on) => `<button role="tab" id="t-${id}" aria-controls="p-${id}" aria-selected="${on ? 'true' : 'false'}"${on ? '' : ' tabindex="-1"'}>${label}</button>`;
  const save = '<div class="card-foot form-foot"><button class="btn btn-primary" type="submit" data-busy="Saving…">Save</button></div>';
  return `
<div class="page-bar"><div><h2>Website content</h2><p>Changes appear on the public site as soon as you save. Rows left empty are removed.</p></div><div class="page-actions"><a class="btn btn-outline" href="/" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> View website</a></div></div>
<div class="card tabs-card"><div class="tabs" role="tablist" aria-label="Content sections" data-tabs-hash>${tab('banners', 'Homepage banners', true)}${tab('faq', 'FAQ')}${tab('steps', 'How to buy')}${tab('contact', 'Contact details')}</div></div>
<form id="p-banners" role="tabpanel" class="card" data-api="PUT /api/admin/content/banners" novalidate hidden><div class="card-head"><h3>Homepage banners</h3><small>Captions for the three slides at the top of the homepage</small></div><div class="card-body stack">
  ${slides.map((b, i) => `<fieldset class="group"><legend>Slide ${i + 1}</legend><div class="form-grid">${field(`b-t${i}`, 'Title', input(`b-t${i}`, `title_${i + 1}`, b.title, 'maxlength="80" placeholder="Leave blank to use the default"'))}${field(`b-x${i}`, 'Caption', input(`b-x${i}`, `text_${i + 1}`, b.text, 'maxlength="200"'))}</div></fieldset>`).join('')}</div>${save}</form>
<form id="p-faq" role="tabpanel" class="card" data-api="PUT /api/admin/content/faq" novalidate hidden><div class="card-head"><h3>Frequently asked questions</h3><small>${faq.length} published</small></div><div class="card-body stack">
  ${faqRows.map((f, i) => `<fieldset class="group"><legend>${f.q ? `Question ${i + 1}` : 'New question'}</legend><div class="stack stack-sm">${field(`q-${i}`, 'Question', input(`q-${i}`, `q_${i + 1}`, f.q, 'maxlength="200"'))}${field(`a-${i}`, 'Answer', area(`a-${i}`, `a_${i + 1}`, f.a, 'maxlength="2000" style="min-height:80px"'))}</div></fieldset>`).join('')}</div>${save}</form>
<form id="p-steps" role="tabpanel" class="card" data-api="PUT /api/admin/content/steps" novalidate hidden><div class="card-head"><h3>How to buy</h3><small>Steps shown in order</small></div><div class="card-body stack">
  ${stepRows.map((s, i) => `<fieldset class="group"><legend>${s.title ? `Step ${i + 1}` : 'New step'}</legend><input type="hidden" name="icon_${i + 1}" value="${esc(s.icon || '')}"><div class="stack stack-sm">${field(`st-${i}`, 'Title', input(`st-${i}`, `title_${i + 1}`, s.title, 'maxlength="100"'))}${field(`sx-${i}`, 'Description', area(`sx-${i}`, `text_${i + 1}`, s.text, 'maxlength="600" style="min-height:72px"'))}</div></fieldset>`).join('')}</div>${save}</form>
<form id="p-contact" role="tabpanel" class="card" data-api="PUT /api/admin/content/contact" novalidate hidden><div class="card-head"><h3>Contact details</h3><small>Shown in the header, footer and contact page</small></div><div class="card-body stack">
  <div class="form-summary" role="alert" hidden></div>
  <div class="form-grid">${field('ct-phone', 'Phone', input('ct-phone', 'phone', site.phone, 'required maxlength="30"'), { required: true })}${field('ct-email', 'Email', input('ct-email', 'email', site.email, 'type="email" required maxlength="254"'), { required: true })}</div>
  ${offices.map((o, i) => `<fieldset class="group"><legend>${o.address ? esc(o.label || `Office ${i + 1}`) : 'New office'}</legend><div class="form-grid">${field(`ol-${i}`, 'Label', input(`ol-${i}`, `office_label_${i + 1}`, o.label, 'maxlength="40" placeholder="e.g. Head office"'))}${field(`oa-${i}`, 'Address', input(`oa-${i}`, `office_address_${i + 1}`, o.address, 'maxlength="200"'))}</div></fieldset>`).join('')}
  <fieldset class="group"><legend>Sales team</legend><div class="stack stack-sm">${team.map((p, i) => `<div class="form-grid three">${field(`tn-${i}`, 'Name', input(`tn-${i}`, `team_name_${i + 1}`, p.name, 'maxlength="60"'))}${field(`tp-${i}`, 'Phone', input(`tp-${i}`, `team_phone_${i + 1}`, p.phone, 'maxlength="30"'))}${field(`te-${i}`, 'Email', input(`te-${i}`, `team_email_${i + 1}`, p.email, 'maxlength="254"'))}</div>`).join('')}</div></fieldset></div>${save}</form>`;
}

/* ------------------------------------------------------------------ settings */
export function settingsPage({ user, whatsapp, usdRate, business: b, recent }) {
  return `
<div class="page-bar"><div><h2>Settings</h2><p>Ordering, receipts and your own account.</p></div></div>
<div class="cols">
  <form class="card col-7" data-api="PUT /api/admin/settings" novalidate><div class="card-head"><h3>Business settings</h3></div><div class="card-body stack">
    <div class="form-summary" role="alert" hidden></div>
    <div class="form-grid">
      ${field('s-wa', 'WhatsApp number for orders', input('s-wa', 'whatsapp_number', whatsapp, 'required inputmode="tel" maxlength="20"'), { required: true, hint: 'International format without +, e.g. 255679400800. “Order via WhatsApp” opens a chat with this number.' })}
      ${field('s-rate', 'Exchange rate (TZS per 1 USD)', input('s-rate', 'usd_rate', usdRate, 'required inputmode="decimal" maxlength="12"'), { required: true, hint: 'Used for the “≈ USD” figure beside TZS prices.' })}
    </div>
    <fieldset class="group"><legend>Shown on receipts and invoices</legend><div class="form-grid">
      ${field('s-bn', 'Business name', input('s-bn', 'business_name', b.name, 'required maxlength="100"'), { required: true })}${field('s-tin', 'TIN', input('s-tin', 'business_tin', b.tin, 'maxlength="30"'))}
      ${field('s-bp', 'Phone', input('s-bp', 'business_phone', b.phone, 'maxlength="30"'))}${field('s-be', 'Email', input('s-be', 'business_email', b.email, 'type="email" maxlength="254"'))}
      ${field('s-ba', 'Address', input('s-ba', 'business_address', b.address, 'maxlength="250"'), { cls: 'span-2' })}</div></fieldset>
  </div><div class="card-foot form-foot"><button class="btn btn-primary" type="submit" data-busy="Saving…">Save settings</button></div></form>
  <div class="col-5 stack" id="profile">
    <form class="card" data-api="PUT /api/admin/profile" novalidate><div class="card-head"><h3>Your profile</h3></div><div class="card-body stack stack-sm"><div class="form-summary" role="alert" hidden></div>
      ${field('p-name', 'Full name', input('p-name', 'name', user.name, 'required minlength="2" maxlength="80"'), { required: true })}${field('p-email', 'Email (used to log in)', input('p-email', 'email', user.email, 'type="email" required maxlength="254"'), { required: true })}${field('p-phone', 'Phone', input('p-phone', 'phone', user.phone, 'type="tel" maxlength="20"'))}
    </div><div class="card-foot form-foot"><button class="btn btn-primary" type="submit" data-busy="Saving…">Save profile</button></div></form>
    ${passwordCard()}
  </div>
</div>
<section class="card"><div class="card-head"><h3>Recent activity</h3><a class="link-arrow" href="/admin/activity">Full activity log <i class="fa-solid fa-arrow-right"></i></a></div>${recent.length ? `<div class="rows">${recent.map((a) => `<div class="row-item"><div class="grow"><b style="white-space:normal">${esc(a.summary)}</b><small>${esc(a.actor_name)} · ${dateTime(a.created_at)}</small></div></div>`).join('')}</div>` : '<div class="state" style="padding:32px 24px"><p>No activity recorded yet.</p></div>'}</section>`;
}

export const passwordCard = () => `<form class="card" data-api="POST /api/auth/change-password" novalidate><div class="card-head"><h3>Change password</h3></div><div class="card-body stack stack-sm"><div class="form-summary" role="alert" hidden></div>
  ${field('pw-cur', 'Current password', input('pw-cur', 'current', '', 'type="password" required autocomplete="current-password"'), { required: true })}${field('pw-new', 'New password', input('pw-new', 'password', '', 'type="password" required minlength="8" autocomplete="new-password"'), { required: true, hint: 'At least 8 characters with letters and numbers. Other devices are signed out.' })}
</div><div class="card-foot form-foot"><button class="btn btn-primary" type="submit" data-busy="Updating…">Update password</button></div></form>`;

export function activityPage({ rows, query, paging }) {
  return `
<a class="back-link" href="/admin/settings" style="margin:0"><i class="fa-solid fa-arrow-left"></i> Back to settings</a>
<div class="page-bar"><div><h2>Activity log</h2><p>Every confirmation, price change, payment, void and status change, with who did it and when.</p></div></div>
<section class="card"><form class="filter-bar" method="get" action="/admin/activity" role="search"><div class="field grow"><label for="f-q">Search</label><input class="input" id="f-q" name="q" type="search" value="${esc(query.q || '')}" placeholder="Order reference, receipt, admin name or action"></div><div class="filter-actions"><button class="btn btn-dark" type="submit">Search</button>${query.q ? '<a class="btn btn-outline" href="/admin/activity">Reset</a>' : ''}</div></form>
  ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What happened</th></tr></thead><tbody>${rows.map((a) => `<tr><td data-label="When"><span class="nw">${dateTime(a.created_at)}</span></td><td data-label="Who"><span class="nw">${esc(a.actor_name)}</span></td><td data-label="What happened">${esc(a.summary)}</td></tr>`).join('')}</tbody></table></div><div class="card-foot">${pagination(paging, query, 'entries')}</div>` : '<div class="state"><i class="fa-solid fa-clock-rotate-left"></i><b>Nothing found</b><p>No activity matches this search.</p></div>'}
</section>`;
}

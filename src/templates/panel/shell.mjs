import { esc, html } from '../lib.mjs';

// Shared document shell for /admin/ and /account/: navy sidebar, top bar, content area.
// Both panels render through this one function so they stay one product.
const NAV = {
  admin: [
    ['Overview'],
    ['dashboard', '/admin/', 'fa-gauge-high', 'Dashboard'],
    ['Sales'],
    ['orders', '/admin/orders', 'fa-clipboard-list', 'Orders', 'pendingOrders'],
    ['clients', '/admin/clients', 'fa-user-tie', 'Clients'],
    ['payments', '/admin/payments', 'fa-money-bill-wave', 'Payments'],
    ['reports', '/admin/reports', 'fa-chart-column', 'Reports'],
    ['Stock'],
    ['vehicles', '/admin/vehicles', 'fa-car-side', 'Vehicles'],
    ['enquiries', '/admin/enquiries', 'fa-inbox', 'Enquiries', 'newEnquiries'],
    ['Manage'],
    ['users', '/admin/users', 'fa-users', 'Users'],
    ['content', '/admin/content', 'fa-pen-to-square', 'Content'],
    ['settings', '/admin/settings', 'fa-gear', 'Settings'],
  ],
  user: [
    ['My account'],
    ['overview', '/account/', 'fa-house', 'Overview'],
    ['cart', '/account/order-list', 'fa-cart-shopping', 'Order list', 'cart'],
    ['orders', '/account/orders', 'fa-clipboard-list', 'My orders'],
    ['Saved'],
    ['saved', '/account/saved', 'fa-heart', 'Saved cars'],
    ['comparisons', '/account/comparisons', 'fa-scale-balanced', 'Comparisons'],
    ['Help'],
    ['enquiries', '/account/enquiries', 'fa-comments', 'My enquiries'],
    ['profile', '/account/profile', 'fa-user', 'Profile'],
  ],
};

export function panelShell({ role, active, title, user, counts = {}, csrf = '', scripts = [], body }) {
  const admin = role === 'admin';
  const nav = NAV[admin ? 'admin' : 'user'].map((item) => {
    if (item.length === 1) return `<div class="side-label">${item[0]}</div>`;
    const [key, href, icon, label, countKey] = item;
    const n = countKey && counts[countKey];
    return `<a href="${href}"${key === active ? ' class="active" aria-current="page"' : ''}><i class="fa-solid ${icon}"></i>${label}${n ? `<span class="count">${n}</span>` : ''}</a>`;
  });
  const alerts = admin ? (counts.pendingOrders || 0) + (counts.newEnquiries || 0) : counts.updates || 0;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="csrf-token" content="${esc(csrf)}">
<title>${esc(title)} | ${admin ? 'Admin' : 'My account'} — Gondo Motors</title>
<meta name="theme-color" content="#1a1a2e">
<script src="/assets/js/theme.js"></script>
<link rel="icon" href="/assets/img/brand/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="/assets/css/main.css">
<link rel="stylesheet" href="/assets/css/panel.css">
</head>
<body class="gm-panel" data-root="/" data-role="${admin ? 'admin' : 'user'}">
<a class="sr-only" href="#main">Skip to content</a>
<aside class="side" id="side" aria-label="${admin ? 'Admin' : 'Account'} navigation">
  <div class="side-brand"><a class="logo" href="/" aria-label="Gondo Motors home"><span class="logo-mark"><i class="fa-solid fa-car-side"></i></span>GONDO<span>MOTORS</span></a></div>
  <nav class="side-nav">${nav}</nav>
  <div class="side-foot">
    <a href="/"><i class="fa-solid fa-arrow-up-right-from-square"></i>View website</a>
    <form method="post" action="/logout"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button type="submit"><i class="fa-solid fa-right-from-bracket"></i>Log out</button></form>
  </div>
</aside>
<button class="side-backdrop" type="button" aria-label="Close menu" tabindex="-1"></button>
<div class="main">
  <header class="top">
    <button class="icon-btn top-menu" type="button" aria-label="Menu" aria-expanded="false" aria-controls="side"><i class="fa-solid fa-bars"></i></button>
    <h1>${esc(title)}</h1>
    <form class="top-search" role="search" action="${admin ? '/admin/search' : '/cars.html'}" method="get">
      <i class="fa-solid fa-magnifying-glass"></i>
      <label class="sr-only" for="top-q">Search</label>
      <input class="input" id="top-q" name="q" type="search" placeholder="${admin ? 'Search orders, clients, stock no.…' : 'Search vehicles…'}">
    </form>
    <button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="Switch to dark mode"><i class="fa-solid fa-moon" aria-hidden="true"></i><i class="fa-solid fa-sun" aria-hidden="true"></i></button>
    <a class="icon-btn" href="${admin ? '/admin/orders?status=pending' : '/account/orders'}" aria-label="Notifications${alerts ? ` (${alerts} new)` : ''}"><i class="fa-regular fa-bell"></i>${alerts ? '<span class="dot"></span>' : ''}</a>
    <details class="menu">
      <summary aria-label="Account menu"><span class="avatar">${esc(user.name[0])}</span><span class="menu-who">${esc(user.name)}<small>${admin ? 'Administrator' : 'Customer'}</small></span></summary>
      <div class="menu-list">
        <a href="${admin ? '/admin/settings#profile' : '/account/profile'}"><i class="fa-solid fa-user"></i>Profile &amp; password</a>
        <a href="/"><i class="fa-solid fa-arrow-up-right-from-square"></i>View website</a>
        <hr>
        <form method="post" action="/logout"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button type="submit"><i class="fa-solid fa-right-from-bracket"></i>Log out</button></form>
      </div>
    </details>
  </header>
  <main class="content" id="main">
${body}
  </main>
</div>
<script src="/assets/js/main.js" defer></script>
<script src="/assets/js/panel.js" defer></script>
${scripts.map((src) => `<script src="${esc(src)}" defer></script>`)}
</body>
</html>`;
}

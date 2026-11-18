import { html } from '../lib.mjs';

const NAV = [
  ['cars', 'cars.html', 'Buy a car'],
  ['local', 'local-vehicles.html', 'Local vehicles'],
  ['how', 'how-to-buy.html', 'How to buy'],
  ['faq', 'faq.html', 'FAQ'],
  ['contact', 'contact.html', 'Contact'],
];

export function header({ site, root, page }) {
  return html`
<div class="topbar">
  <div class="container">
    <div class="topbar-left">
      <a href="tel:${site.phoneHref}"><i class="fa-solid fa-phone"></i>${site.phone}</a>
      <a class="hide-s" href="mailto:${site.email}"><i class="fa-solid fa-envelope"></i>${site.email}</a>
    </div>
    <span class="topbar-msg">Order any car you want — new, used or special edition</span>
    <div class="topbar-right hide-s"><a href="${site.taxCalculator}" target="_blank" rel="noopener"><i class="fa-solid fa-calculator"></i>TRA tax calculator</a></div>
  </div>
</div>
<header class="header">
  <div class="container">
    <a class="logo" href="${root}index.html" aria-label="${site.name} home"><span class="logo-mark"><i class="fa-solid fa-car-side"></i></span>GONDO<span>MOTORS</span></a>
    <nav class="nav" id="nav" aria-label="Main">
      ${NAV.map(([key, href, label]) => `<a href="${root}${href}"${page === key ? ' class="active" aria-current="page"' : ''}>${label}</a>`)}
      <div class="nav-extra">
        <a href="${site.taxCalculator}" target="_blank" rel="noopener"><i class="fa-solid fa-calculator"></i> TRA tax calculator</a>
        <a href="${root}login.html">Log in</a>
        <a class="btn btn-dark" href="${root}signup.html">Sign up</a>
      </div>
    </nav>
    <div class="header-actions">
      <a class="compare-link" href="${root}compare.html" aria-label="Compare vehicles"><i class="fa-solid fa-scale-balanced"></i><span class="hide-m">Compare</span><span class="compare-count" data-compare-count data-n="0">0</span></a>
      <a class="btn btn-outline btn-sm" href="${root}login.html">Log in</a>
      <a class="btn btn-dark btn-sm" href="${root}signup.html">Sign up</a>
    </div>
    <button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav"><i class="fa-solid fa-bars"></i></button>
  </div>
</header>`;
}

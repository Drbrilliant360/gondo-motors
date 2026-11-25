import { html } from '../lib.mjs';

const NAV = [
  ['cars', 'cars.html', 'Buy a car'],
  ['local', 'local-vehicles.html', 'Local vehicles'],
  ['how', 'how-to-buy.html', 'How to buy'],
  ['faq', 'faq.html', 'FAQ'],
  ['contact', 'contact.html', 'Contact'],
];
export const arrow = '<span class="arw" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>';

// Slim contact line, then the header: logo, pill navigation, account actions.
// On scroll the header condenses into one floating bar (class toggled in main.js); on small screens the nav is a full-screen menu.
export function header({ site, root, page }) {
  return html`
<div class="topline">
  <div class="wrap">
    <div class="topline-group">
      <a href="tel:${site.phoneHref}"><i class="fa-solid fa-phone"></i>${site.phone}</a>
      <a class="hide-s" href="mailto:${site.email}"><i class="fa-solid fa-envelope"></i>${site.email}</a>
    </div>
    <a href="${site.taxCalculator}" target="_blank" rel="noopener"><i class="fa-solid fa-calculator"></i>TRA tax calculator</a>
  </div>
</div>
<header class="header" data-header>
  <div class="header-bar">
    <a class="logo" href="${root}index.html" aria-label="${site.name} home"><span class="logo-mark"><i class="fa-solid fa-car-side"></i></span>GONDO<span>MOTORS</span></a>
    <nav class="nav" id="nav" aria-label="Main">
      ${NAV.map(([key, href, label]) => `<a href="${root}${href}"${page === key ? ' class="active" aria-current="page"' : ''}>${label}</a>`)}
      <div class="nav-extra">
        <a href="${site.taxCalculator}" target="_blank" rel="noopener"><i class="fa-solid fa-calculator"></i> TRA tax calculator</a>
        <div class="theme-row"><span data-theme-toggle-text>Appearance</span><button class="btn btn-outline btn-sm" type="button" data-theme-toggle aria-pressed="false"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i> <span data-theme-label>Dark mode</span></button></div>
        <a href="${root}login.html">Log in</a>
        <a class="btn btn-dark btn-arrow" href="${root}signup.html">Sign up${arrow}</a>
      </div>
    </nav>
    <div class="header-actions">
      <button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="Switch to dark mode"><i class="fa-solid fa-moon" aria-hidden="true"></i><i class="fa-solid fa-sun" aria-hidden="true"></i></button>
      <a class="compare-link" href="${root}compare.html" aria-label="Compare vehicles"><i class="fa-solid fa-scale-balanced"></i><span class="hide-m">Compare</span><span class="compare-count" data-compare-count data-n="0">0</span></a>
      <a class="compare-link" href="${root}account/order-list" data-cart-link hidden aria-label="Order list"><i class="fa-solid fa-cart-shopping"></i><span class="hide-m">Order list</span><span class="compare-count" data-cart-count data-n="0">0</span></a>
      <a class="link-quiet hide-nav" href="${root}login.html">Log in</a>
      <a class="btn btn-dark btn-arrow btn-sm hide-nav" href="${root}signup.html">Sign up${arrow}</a>
    </div>
    <button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav"><i class="fa-solid fa-bars"></i></button>
  </div>
</header>`;
}

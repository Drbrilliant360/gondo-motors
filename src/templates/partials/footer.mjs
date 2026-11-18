import { html } from '../lib.mjs';

export function footer({ site, root }) {
  return html`
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <a class="logo" href="${root}index.html"><span class="logo-mark"><i class="fa-solid fa-car-side"></i></span>GONDO<span style="color:var(--accent)">MOTORS</span></a>
        <p>Your trusted partner for export and local car business — consultation, sourcing, selection and shipping, handled safely and professionally.</p>
        <div class="social">${site.social.map((s) => `<a href="${s.href}" aria-label="${s.label}"><i class="fa-brands ${s.icon}"></i></a>`)}</div>
      </div>
      <div>
        <h4>Buy</h4>
        <ul>
          <li><a href="${root}cars.html">All vehicles</a></li>
          <li><a href="${root}compare.html">Compare cars</a></li>
          <li><a href="${root}local-vehicles.html">Local vehicles</a></li>
          <li><a href="${site.taxCalculator}" target="_blank" rel="noopener">TRA tax calculator</a></li>
        </ul>
      </div>
      <div>
        <h4>Help</h4>
        <ul>
          <li><a href="${root}how-to-buy.html">How to buy</a></li>
          <li><a href="${root}faq.html">FAQ</a></li>
          <li><a href="${root}contact.html">Contact us</a></li>
          <li><a href="${root}login.html">Log in</a></li>
        </ul>
      </div>
      <div>
        <h4>Visit us</h4>
        <ul>
          ${site.offices.map((o) => `<li>${o.address}</li>`)}
          <li><a href="tel:${site.phoneHref}">${site.phone}</a></li>
          <li><a href="mailto:${site.email}">${site.email}</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom"><span>© 2026 ${site.name} Co. Ltd. All rights reserved.</span><span>Privacy Policy · Terms of Service</span></div>
  </div>
</footer>`;
}

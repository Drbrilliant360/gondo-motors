import { esc, fmt, tzs, km, img, statusPill, html } from '../lib.mjs';

// Carwow-style vehicle card: big photo, status + photo count, spec row, price, compare toggle.
export function vehicleCard(c, root) {
  const search = [c.name, c.year, c.chassis, c.colour, c.body].filter(Boolean).join(' ').toLowerCase();
  return html`
<article class="vcard${c.status === 'sold' ? ' is-sold' : ''}" data-id="${c.id}" data-make="${esc(c.make)}" data-body="${esc(c.body)}" data-year="${c.year || ''}" data-mileage="${c.mileage || ''}" data-price="${c.priceTzs || ''}" data-colour="${esc(c.colour || '')}" data-status="${c.status}" data-search="${esc(search)}">
  <a class="vcard-media" href="${root}car/${c.slug}.html" tabindex="-1" aria-hidden="true">
    <img src="${img(root, c.thumb)}" alt="" loading="lazy" width="640" height="480">
    <span class="vcard-badges">${statusPill(c)}</span>
    <span class="vcard-photos"><span class="pill pill-dark"><i class="fa-solid fa-camera"></i> ${c.photos}</span></span>
  </a>
  <button class="compare-toggle on-card" type="button" data-compare-toggle="${c.id}" aria-pressed="false" aria-label="Compare ${esc(c.name)}"><span class="box"><i class="fa-solid fa-check"></i></span><span class="lbl">Compare</span></button>
  <div class="vcard-body">
    <div>
      <h3 class="vcard-title"><a href="${root}car/${c.slug}.html">${esc(c.name)}</a></h3>
      <p class="vcard-sub">${[c.year, c.body, c.chassis].filter(Boolean).map(esc).join(' · ')}</p>
    </div>
    <div class="vcard-specs">
      <span><i class="fa-solid fa-gauge-high"></i>${km(c.mileage)}</span>
      ${c.colour ? `<span><span class="swatch" style="background:${c.colourHex}"></span>${esc(c.colour)}</span>` : ''}
      ${c.auction ? `<span><i class="fa-solid fa-location-dot"></i>${esc(c.auction)}</span>` : ''}
    </div>
    <div class="vcard-foot">
      ${c.priceTzs ? `<div class="price">${tzs(c.priceTzs)}<small>≈ $${fmt(c.priceUsd)} USD</small></div>` : '<div class="price price-req">Price on request<small>Ask for a landed quote</small></div>'}
      ${c.status === 'available' ? `<button class="cart-add" type="button" data-cart-add="${c.id}" aria-label="Add ${esc(c.name)} to your order list"><i class="fa-solid fa-cart-plus"></i><span class="lbl">Order</span></button>` : '<span class="vcard-go" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>'}
    </div>
  </div>
</article>`;
}

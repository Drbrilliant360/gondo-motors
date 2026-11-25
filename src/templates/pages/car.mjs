import { esc, fmt, tzs, km, img, absUrl, statusPill, statusLabel, waLink, jsonScript, html } from '../lib.mjs';
import { vehicleCard } from '../partials/vehicle-card.mjs';

// One static page per vehicle: gallery + lightbox, sticky price panel, spec table, similar vehicles.
export function carPage({ site, car: c, cars }) {
  const root = '../';
  const imgs = c.images.map((im, i) => ({ full: img(root, im.url), thumb: img(root, im.thumb), abs: absUrl(site, im.url), alt: `${c.name} photo ${i + 1}` }));
  const label = `${c.year || ''} ${c.name}`.trim();
  const url = `${site.url}/car/${c.slug}.html`;
  const wa = waLink(site, `Hello Gondo Motors, I'm interested in the ${label} (ID ${c.id}). ${url}`);
  const similar = cars.filter((x) => x.id !== c.id && x.status === 'available')
    .map((x) => ({ x, s: (x.model === c.model ? 4 : 0) + (x.make === c.make ? 2 : 0) + (x.body === c.body ? 1 : 0) + (x.priceTzs ? .5 : 0) }))
    .sort((a, b) => b.s - a.s || b.x.id - a.x.id).slice(0, 4).map((o) => o.x);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Car', name: label, brand: c.make, model: c.model, vehicleModelDate: c.year, color: c.colour, bodyType: c.body,
    image: imgs[0].abs, url,
    ...(c.mileage ? { mileageFromOdometer: { '@type': 'QuantitativeValue', value: c.mileage, unitCode: 'KMT' } } : {}),
    ...(c.priceTzs ? { offers: { '@type': 'Offer', price: c.priceTzs, priceCurrency: 'TZS', availability: c.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' } } : {}),
  };
  const tile = (icon, k, v) => `<div class="spec-tile"><i class="fa-solid ${icon}"></i><div><small>${k}</small><b>${v}</b></div></div>`;
  const row = (k, v) => (v ? `<tr><th>${k}</th><td>${v}</td></tr>` : '');
  const auctionDate = c.auctionDate ? new Date(c.auctionDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const ctaLabel = c.status === 'sold' || c.status === 'reserved' ? 'Ask for a similar car' : c.priceTzs ? 'Enquire on WhatsApp' : 'Request a quote';
  const body = html`
<div class="container">
  <a class="back-link" href="${root}cars.html" data-back><i class="fa-solid fa-arrow-left"></i> Back to all vehicles</a>
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${root}index.html">Home</a><i class="fa-solid fa-chevron-right"></i><a href="${root}cars.html">Buy a car</a><i class="fa-solid fa-chevron-right"></i><a href="${root}cars.html?make=${encodeURIComponent(c.make)}">${esc(c.make)}</a><i class="fa-solid fa-chevron-right"></i><span>${esc(label)}</span></nav>
  <div class="detail">
    <div>
      <div id="gallery">
        <div class="gallery-main" id="gallery-main">
          <img id="gallery-img" src="${imgs[0].full}" alt="${esc(imgs[0].alt)}" fetchpriority="high">
          ${imgs.length > 1 ? '<button class="gallery-nav prev" type="button" data-g-prev aria-label="Previous photo"><i class="fa-solid fa-chevron-left"></i></button><button class="gallery-nav next" type="button" data-g-next aria-label="Next photo"><i class="fa-solid fa-chevron-right"></i></button>' : ''}
          <span class="pill pill-dark gallery-count" id="gallery-count">1 / ${imgs.length}</span>
        </div>
        <div class="thumbs" id="thumbs">${imgs.length > 1 ? imgs.map((im, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" aria-label="Show photo ${i + 1}"><img src="${im.thumb}" alt="" loading="lazy"></button>`) : ''}</div>
        <script type="application/json" id="gallery-data">${jsonScript(imgs.map(({ full, alt }) => ({ full, alt })))}</script>
      </div>

      <div class="detail-section">
        <h2>Key facts</h2>
        <div class="spec-grid">
          ${tile('fa-calendar', 'Year', c.year || '—')}${tile('fa-gauge-high', 'Mileage', km(c.mileage))}
          ${tile('fa-palette', 'Colour', esc(c.colour || 'Not stated'))}${tile('fa-car-side', 'Body style', esc(c.body))}
        </div>
      </div>
      <div class="detail-section">
        <h2>Full specification</h2>
        <table class="table-clean"><tbody>
          ${row('Make', esc(c.make))}${row('Model', esc(c.model))}${row('Year', c.year)}${row('Chassis code', esc(c.chassis))}
          ${row('Mileage', c.mileage ? km(c.mileage) : '')}${row('Colour', esc(c.colour))}${row('Body style', esc(c.body))}
          ${row('Auction house', esc(c.auction))}${row('Auction date', auctionDate)}
          ${row('Availability', statusLabel(c))}${row('Stock number', esc(c.stockNo || c.id))}
        </tbody></table>
      </div>
    </div>

    <aside class="buy-panel">
      <div class="panel">
        <div class="meta">${statusPill(c)}<span class="pill" style="box-shadow:none;background:var(--bg)">${c.photos} photos</span></div>
        <h1>${esc(c.name)}</h1>
        <p class="sub">${[c.year, c.body, c.chassis].filter(Boolean).map(esc).join(' · ')}</p>
        ${c.priceTzs ? `<div class="price-big">${tzs(c.priceTzs)}</div><div class="price-alt">≈ $${fmt(c.priceUsd)} USD · excludes import duty &amp; shipping</div>` : '<div class="price-big" style="font-size:1.5rem">Price on request</div><div class="price-alt">Contact us for the latest landed price to Tanzania.</div>'}
        <div class="actions">
          ${c.status === 'available' ? `<button class="btn btn-primary btn-lg btn-block" type="button" data-cart-add="${c.id}" data-cart-big><i class="fa-solid fa-cart-plus"></i> <span class="lbl">Add to order list</span></button>` : ''}
          <a class="btn ${c.status === 'available' ? 'btn-whatsapp' : 'btn-primary'} btn-lg btn-block" href="${wa}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> ${ctaLabel}</a>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <button class="compare-toggle" style="justify-content:center;font-size:.95rem;padding:.85rem" type="button" data-compare-toggle="${c.id}" aria-pressed="false"><span class="box"><i class="fa-solid fa-check"></i></span><span class="lbl">Compare</span></button>
            <button class="compare-toggle" style="justify-content:center;font-size:.95rem;padding:.85rem" type="button" data-save="${c.id}" aria-pressed="false"><i class="fa-regular fa-heart"></i><span class="lbl">Save</span></button>
          </div>
          <a class="btn btn-outline btn-block" href="${site.taxCalculator}" target="_blank" rel="noopener"><i class="fa-solid fa-calculator"></i> TRA tax calculator</a>
          <a class="btn btn-outline btn-block" href="tel:${site.phoneHref}"><i class="fa-solid fa-phone"></i> ${site.phone}</a>
        </div>
      </div>
      <div class="panel"><div class="assure">
        <div><i class="fa-solid fa-circle-check"></i><span>Inspected and accurately described before listing</span></div>
        <div><i class="fa-solid fa-circle-check"></i><span>We handle shipping and original documents (DHL)</span></div>
        <div><i class="fa-solid fa-circle-check"></i><span>Support with import clearance at the port</span></div>
      </div></div>
    </aside>
  </div>

  ${similar.length ? `<section class="section" style="padding-top:8px"><div class="section-head"><div><h2>Similar vehicles</h2></div><a class="link-arrow" href="${root}cars.html?make=${encodeURIComponent(c.make)}">More ${esc(c.make)} <i class="fa-solid fa-arrow-right"></i></a></div><div class="grid-cars">${similar.map((x) => vehicleCard(x, root)).join('')}</div></section>` : ''}
</div>
<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer"><button class="lb-close" id="lb-close" type="button" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>${imgs.length > 1 ? '<button class="lb-prev" type="button" data-g-prev aria-label="Previous"><i class="fa-solid fa-chevron-left"></i></button><button class="lb-next" type="button" data-g-next aria-label="Next"><i class="fa-solid fa-chevron-right"></i></button>' : ''}<img id="lb-img" alt=""><span class="lb-count" id="lb-count"></span></div>`;
  return {
    path: `car/${c.slug}.html`, root,
    title: `${label}${c.priceTzs ? ' — ' + tzs(c.priceTzs) : ''}`,
    description: `${label} for sale in Tanzania${c.mileage ? ', ' + km(c.mileage) : ''}${c.colour ? ', ' + c.colour.toLowerCase() : ''}. ${c.priceTzs ? tzs(c.priceTzs) + '.' : 'Request a quote.'} Shipping and import support from Gondo Motors.`,
    page: 'cars', body, head: `<script type="application/ld+json">${jsonScript(jsonld)}</script>`, ogImage: imgs[0].abs,
  };
}

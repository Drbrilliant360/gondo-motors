import { esc, fmt, tzs, km, carImg, html } from '../lib.mjs';
import { vehicleCard } from '../partials/vehicle-card.mjs';

const SLIDES = [
  ['hero-1.jpg', 'Premium Toyota models', 'Find your dream Toyota with unbeatable prices and quality assurance.'],
  ['hero-2.jpg', 'Luxury cars for every taste', 'Premium auctions and purchases across Tanzania.'],
  ['hero-3.jpg', 'Special deals & auctions', 'A trusted partner for premium vehicle auctions.'],
];

export function home({ site, cars, steps, makes, bodies }) {
  const available = cars.filter((c) => c.status === 'available');
  const featured = available.filter((c) => c.priceTzs).slice(0, 9);
  const compareDemo = ['50106', '50098', '50096'].map((id) => cars.find((c) => String(c.id) === id)).filter(Boolean);
  const bestP = Math.min(...compareDemo.map((c) => c.priceTzs)), bestK = Math.min(...compareDemo.map((c) => c.mileage));
  const body = html`
<section class="hero">
  <div class="container hero-grid">
    <div>
      <span class="eyebrow"><i class="fa-solid fa-circle-check"></i> Direct from Japanese auctions</span>
      <h1>Find your next car, <em>delivered</em> to Tanzania.</h1>
      <p class="hero-lead">Browse ${cars.length} inspected vehicles, compare them side by side, and let our team handle bidding, shipping and clearance.</p>
      <form class="search-card" action="cars.html" method="get" role="search">
        <div class="field"><label for="h-make">Make</label>
          <select class="select" id="h-make" name="make"><option value="">All makes</option>${makes.map(([m, n]) => `<option value="${esc(m)}">${esc(m)} (${n})</option>`)}</select></div>
        <div class="field"><label for="h-body">Body style</label>
          <select class="select" id="h-body" name="body"><option value="">Any body</option>${bodies.map(([b, n]) => `<option value="${esc(b)}">${esc(b)} (${n})</option>`)}</select></div>
        <div class="field"><label for="h-price">Max price</label>
          <select class="select" id="h-price" name="maxPrice"><option value="">No limit</option><option value="20000000">TZS 20M</option><option value="40000000">TZS 40M</option><option value="70000000">TZS 70M</option></select></div>
        <div class="field"><label for="h-year">Year from</label>
          <select class="select" id="h-year" name="yearFrom"><option value="">Any year</option><option value="2010">2010</option><option value="2015">2015</option><option value="2020">2020</option></select></div>
        <button class="btn btn-primary btn-lg" type="submit"><i class="fa-solid fa-magnifying-glass"></i> Search ${cars.length} vehicles</button>
      </form>
      <div class="chips"><small>Popular:</small>${['Toyota', 'Subaru', 'Mazda', 'Nissan'].map((m) => `<a class="chip" href="cars.html?make=${m}">${m}</a>`)}</div>
    </div>
    <div class="hero-media">
      <div class="hero-slides">
        ${SLIDES.map(([img, t, d], i) => `<div class="hero-slide${i === 0 ? ' on' : ''}"><img src="assets/img/hero/${img}" alt="${esc(t)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}><div class="hero-caption"><strong>${esc(t)}</strong><span>${esc(d)}</span></div></div>`)}
        <div class="hero-dots">${SLIDES.map((_, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" aria-label="Slide ${i + 1}"></button>`)}</div>
      </div>
      <div class="hero-badge"><span class="ic"><i class="fa-solid fa-circle-check"></i></span><div><b>${available.length} available now</b><small>Ready to ship</small></div></div>
    </div>
  </div>
</section>

<section class="trust"><div class="container trust-grid">
  <div class="trust-item"><i class="fa-solid fa-gavel"></i><div><b>100+ auctions</b><span>Live Japanese auction access</span></div></div>
  <div class="trust-item"><i class="fa-solid fa-car"></i><div><b>40,000 cars daily</b><span>Sourced to your brief</span></div></div>
  <div class="trust-item"><i class="fa-solid fa-ship"></i><div><b>Port-to-port shipping</b><span>Logistics &amp; documents handled</span></div></div>
  <div class="trust-item"><i class="fa-solid fa-shield-halved"></i><div><b>Inspected &amp; described</b><span>Accurate condition reports</span></div></div>
</div></section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div><h2>Featured vehicles</h2><p>Priced and ready to order. Tick “Compare” on up to three to see them side by side.</p></div>
      <a class="link-arrow" href="cars.html">View all ${cars.length} vehicles <i class="fa-solid fa-arrow-right"></i></a>
    </div>
    <div class="grid-cars">${featured.map((c) => vehicleCard(c, ''))}</div>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-head"><div><h2>Browse by make</h2><p>Every vehicle is checked and described accurately before it is listed.</p></div></div>
    <div class="make-grid">${makes.map(([m, n]) => `<a class="make-tile" href="cars.html?make=${encodeURIComponent(m)}"><b>${esc(m)}</b><span>${n} vehicle${n > 1 ? 's' : ''}</span></a>`)}</div>
  </div>
</section>

<section class="section section-dark">
  <div class="container promo">
    <div>
      <span class="eyebrow">New</span>
      <h2 style="margin-top:14px">Compare cars side by side</h2>
      <p>Can’t decide between two or three? Put them next to each other and see price, year, mileage and more in one clear view.</p>
      <ul>
        <li><i class="fa-solid fa-circle-check"></i> Pick up to three vehicles from any listing</li>
        <li><i class="fa-solid fa-circle-check"></i> Best value highlighted automatically</li>
        <li><i class="fa-solid fa-circle-check"></i> Share your comparison with a single link</li>
      </ul>
      <a class="btn btn-primary btn-lg" href="compare.html?ids=${compareDemo.map((c) => c.id).join(',')}">Try an example <i class="fa-solid fa-arrow-right"></i></a>
    </div>
    <div class="mini-compare" aria-hidden="true">
      ${compareDemo.map((c) => `<div class="col"><img src="${carImg('', c.id, c.cover, true)}" alt=""><b>${esc(c.name)}</b>
        <div class="row"><span>Price</span><em class="${c.priceTzs === bestP ? 'best' : ''}">${(c.priceTzs / 1e6).toFixed(0)}M</em></div>
        <div class="row"><span>Year</span><em>${c.year}</em></div>
        <div class="row"><span>Mileage</span><em class="${c.mileage === bestK ? 'best' : ''}">${fmt(Math.round(c.mileage / 1000))}k</em></div></div>`)}
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head"><div><h2>Buy a car from Gondo Motors</h2><p>Six simple steps from sign-up to enjoying your car.</p></div><a class="link-arrow" href="how-to-buy.html">See the full process <i class="fa-solid fa-arrow-right"></i></a></div>
    <div class="steps">${[0, 1, 2, 5, 6, 9].map((i) => steps[i]).map((s) => `<div class="step"><i class="fa-solid ${s.icon}"></i><b>${esc(s.title)}</b><small>${esc(s.text)}</small></div>`)}</div>
  </div>
</section>

<section class="section section-alt">
  <div class="container explain">
    <div>
      <h2>Japanese auctions of used cars</h2>
      <p>Auctions are the most convenient way to buy a car from Japan. Tens of thousands of vehicles are sold through more than 100 auctions across the country every day.</p>
      <p>Gondo Motors monitors bids in real time and secures vehicles at the best possible price, with up to three months of price history, detailed auction sheets and condition grading from 0 to S.</p>
      <a class="btn btn-dark" href="contact.html">Ask us to find your car</a>
    </div>
    <div class="facts">
      <div class="fact"><b>100+</b><span>Auctions across Japan</span></div>
      <div class="fact"><b>40,000</b><span>Cars available every day</span></div>
      <div class="fact"><b>20–30s</b><span>Each bid ends in seconds</span></div>
      <div class="fact"><b>0–S</b><span>Quality grading scale</span></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container"><div class="cta-band">
    <div><h2>Not seeing the car you want?</h2><p>Tell us what you’re after — new, used or special edition — and we’ll source it for you.</p></div>
    <div class="cta-actions"><a class="btn btn-primary btn-lg" href="https://wa.me/${site.whatsapp}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Chat on WhatsApp</a><a class="btn btn-outline btn-lg" style="color:#fff;border-color:rgba(255,255,255,.35)" href="contact.html">Contact us</a></div>
  </div></div>
</section>`;
  return { path: 'index.html', title: site.name, description: site.description, page: 'home', body };
}

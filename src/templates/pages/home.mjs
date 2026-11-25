import { esc, fmt, tzs, km, img, picture, html } from '../lib.mjs';
import { arrow } from '../partials/header.mjs';
import { vehicleCard } from '../partials/vehicle-card.mjs';

const SLIDES = [
  ['hero-1.jpg', 'Premium Toyota models', 'Find your dream Toyota with unbeatable prices and quality assurance.'],
  ['hero-2.jpg', 'Luxury cars for every taste', 'Premium auctions and purchases across Tanzania.'],
  ['hero-3.jpg', 'Special deals & auctions', 'A trusted partner for premium vehicle auctions.'],
];

export function home({ site, cars, steps, makes, bodies, banners = [] }) {
  // six highlights of the full process; if the admin has shortened the list, show the first six instead
  const homeSteps = steps.length >= 10 ? [0, 1, 2, 5, 6, 9].map((i) => steps[i]) : steps.slice(0, 6);
  const slides = SLIDES.map(([file, title, text], i) => [file, (banners[i] && banners[i].title) || title, banners[i] && banners[i].title ? banners[i].text || '' : text]);
  const available = cars.filter((c) => c.status === 'available');
  // vehicles the admin marked as featured come first, then the rest of the priced stock
  const featured = [...available.filter((c) => c.featured), ...available.filter((c) => !c.featured && c.priceTzs)].slice(0, 9);
  let compareDemo = ['50106', '50098', '50096'].map((id) => cars.find((c) => String(c.id) === id)).filter(Boolean);
  if (compareDemo.length < 3) compareDemo = cars.filter((c) => c.priceTzs && c.mileage).slice(0, 3);
  const bestP = Math.min(...compareDemo.map((c) => c.priceTzs)), bestK = Math.min(...compareDemo.map((c) => c.mileage));
  // hero figures come straight from the stock data
  const H = 'assets/img/home/', heroSet = (ext) => [1280, 1920, 2560, 3840].map((w) => `${H}hero-${w}.${ext} ${w}w`).join(', ');
  const local = available.filter((c) => c.source === 'local').length;
  const stats = [['fa-car-side', available.length, 'Vehicles available'], ['fa-layer-group', makes.length, 'Makes in stock'], local ? ['fa-location-dot', local, 'Ready in Tanzania'] : ['fa-shapes', bodies.length, 'Body styles']];
  const head = `<link rel="preload" as="image" type="image/avif" media="(max-width: 700px)" imagesrcset="${H}hero-portrait-720.avif 720w, ${H}hero-portrait-1080.avif 1080w" imagesizes="100vw"><link rel="preload" as="image" type="image/avif" media="(min-width: 701px)" imagesrcset="${heroSet('avif')}" imagesizes="100vw">`;
  const body = html`
<section class="hero-scene">
  <div class="hero-panel">
    <div class="hero-bg">
      <picture>
        <source media="(max-width: 700px)" type="image/avif" srcset="${H}hero-portrait-720.avif 720w, ${H}hero-portrait-1080.avif 1080w" sizes="100vw">
        <source media="(max-width: 700px)" type="image/webp" srcset="${H}hero-portrait-720.webp 720w, ${H}hero-portrait-1080.webp 1080w" sizes="100vw">
        <source media="(max-width: 700px)" srcset="${H}hero-portrait-720.jpg 720w, ${H}hero-portrait-1080.jpg 1080w" sizes="100vw">
        <source type="image/avif" srcset="${heroSet('avif')}" sizes="100vw">
        <source type="image/webp" srcset="${heroSet('webp')}" sizes="100vw">
        <img src="${H}hero-1920.jpg" srcset="${heroSet('jpg')}" sizes="100vw" width="3840" height="2160" alt="A dark SUV driving past a red column in a city at dusk" fetchpriority="high" decoding="async">
      </picture>
    </div>
    <div class="hero-copy">
      <span class="label label-light">Direct from Japanese auctions</span>
      <h1 class="hero-title">Your next car, <em>delivered</em> to Tanzania.</h1>
      <p class="hero-lead">Choose from ${available.length} vehicles in stock. We handle the bidding, shipping and clearance, so your car arrives ready to drive.</p>
      <div class="hero-actions"><a class="btn btn-light btn-lg btn-arrow" href="cars.html">Browse vehicles${arrow}</a><a class="link-quiet" href="how-to-buy.html">How it works <i class="fa-solid fa-chevron-right"></i></a></div>
    </div>
    <div class="hero-foot">
      <div class="hsearch" data-hsearch>
        <span class="label label-light" id="hs-label">Find your vehicle</span>
        <button class="hsearch-pill" type="button" aria-expanded="false" aria-controls="hsearch-form"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>Make, body style, price or year</span><span class="arw" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span></button>
        <form class="hsearch-form" id="hsearch-form" action="cars.html" method="get" role="search" aria-labelledby="hs-label">
          <div class="hsearch-head"><span>Find your vehicle</span><button type="button" data-hs-close aria-label="Close search"><i class="fa-solid fa-xmark"></i></button></div>
          <label class="hs-field"><span>Make</span><select name="make"><option value="">All makes</option>${makes.map(([m, n]) => `<option value="${esc(m)}">${esc(m)} (${n})</option>`)}</select></label>
          <label class="hs-field"><span>Body style</span><select name="body"><option value="">Any body</option>${bodies.map(([b, n]) => `<option value="${esc(b)}">${esc(b)} (${n})</option>`)}</select></label>
          <label class="hs-field"><span>Max price</span><select name="maxPrice"><option value="">No limit</option><option value="20000000">TZS 20M</option><option value="40000000">TZS 40M</option><option value="70000000">TZS 70M</option></select></label>
          <label class="hs-field"><span>Year from</span><select name="yearFrom"><option value="">Any year</option><option value="2010">2010</option><option value="2015">2015</option><option value="2020">2020</option></select></label>
          <button class="btn btn-light btn-arrow" type="submit"><span data-hs-count>Search ${cars.length} vehicles</span>${arrow}</button>
        </form>
        <button class="hsearch-backdrop" type="button" data-hs-close aria-label="Close search" tabindex="-1"></button>
      </div>
      <ul class="hero-stats" aria-label="Stock at a glance">
        ${stats.map(([icon, n, label]) => `<li class="stat-card"><span class="stat-tile"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><b data-count="${n}">${fmt(n)}</b><small>${label}</small></li>`)}
      </ul>
    </div>
  </div>
</section>

<section class="makes-strip" aria-label="Browse by make">
  <div class="wrap"><div class="marquee"><div class="makes-track">
    ${[false, true].map((copy) => `<ul class="makes-row"${copy ? ' aria-hidden="true"' : ''}>${makes.map(([m, n]) => `<li><a href="cars.html?make=${encodeURIComponent(m)}"${copy ? ' tabindex="-1"' : ''}>${esc(m)}<sup>${n}</sup></a></li>`).join('')}</ul>`)}
  </div></div></div>
</section>

<section class="scene scene-light" id="ways">
  <div class="wrap">
    <header class="scene-head center reveal"><span class="label">Two ways to buy</span><h2 class="display grad">Imported for you. Or ready today.</h2></header>
    <div class="ways-grid">
      <article class="way">
        <figure data-reveal>${picture('', 'way-import', [640, 1000, 1600, 2400], { alt: 'A white coupe in fog, facing right', sizes: '(max-width: 760px) 100vw, 58vw', width: 2400, height: 1600 })}</figure>
        <div class="way-info reveal"><span class="label">From auction to your door</span><h3>Import from Japan</h3><p>Access to Japanese auctions, every car inspected, then shipped and cleared for you.</p><a class="btn btn-dark btn-arrow" href="cars.html">Browse imports${arrow}</a></div>
      </article>
      <article class="way">
        <figure data-reveal>${picture('', 'way-local', [640, 1000, 1600, 2400], { alt: 'A black coupe in fog, facing left', sizes: '(max-width: 760px) 100vw, 58vw', width: 2400, height: 1600 })}</figure>
        <div class="way-info reveal"><span class="label">Already here</span><h3>Ready in Tanzania</h3><p>Local stock you can see, test and drive away without waiting for a ship.</p><a class="btn btn-outline btn-arrow" href="local-vehicles.html">See local stock${arrow}</a></div>
      </article>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div><h2>Featured vehicles</h2><p>Priced and ready to order. Tick “Compare” on up to three to see them side by side.</p></div>
      <a class="link-arrow" href="cars.html">View all ${cars.length} vehicles <i class="fa-solid fa-arrow-right"></i></a>
    </div>
    <div class="grid-cars">${featured.map((c) => vehicleCard(c, ''))}</div>
  </div>
</section>

<section class="section section-dark">
  <div class="container promo">
    <div>
      <span class="label">New</span>
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
      ${compareDemo.map((c) => `<div class="col"><img src="${img('', c.thumb)}" alt=""><b>${esc(c.name)}</b>
        <div class="row"><span>Price</span><em class="${c.priceTzs === bestP ? 'best' : ''}">${(c.priceTzs / 1e6).toFixed(0)}M</em></div>
        <div class="row"><span>Year</span><em>${c.year}</em></div>
        <div class="row"><span>Mileage</span><em class="${c.mileage === bestK ? 'best' : ''}">${fmt(Math.round(c.mileage / 1000))}k</em></div></div>`)}
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head"><div><h2>Buy a car from Gondo Motors</h2><p>${homeSteps.length === 6 ? 'Six simple steps' : 'A few simple steps'} from sign-up to enjoying your car.</p></div><a class="link-arrow" href="how-to-buy.html">See the full process <i class="fa-solid fa-arrow-right"></i></a></div>
    <div class="steps">${homeSteps.map((s) => `<div class="step"><i class="fa-solid ${s.icon}"></i><b>${esc(s.title)}</b><small>${esc(s.text)}</small></div>`)}</div>
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
  return { path: 'index.html', title: site.name, description: site.description, page: 'home', body, head };
}

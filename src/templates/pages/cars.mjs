import { esc, html } from '../lib.mjs';
import { vehicleCard } from '../partials/vehicle-card.mjs';

export function carsPage({ site, cars, makes, bodies }) {
  const colours = [...new Set(cars.map((c) => c.colour).filter(Boolean))].sort();
  const opt = (arr) => arr.map(([v, n]) => `<option value="${esc(v)}">${esc(v)}${n ? ` (${n})` : ''}</option>`);
  const body = html`
<section class="page-head"><div class="container">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><i class="fa-solid fa-chevron-right"></i><span>Buy a car</span></nav>
  <h1>Vehicles for sale</h1>
  <p>Search, filter and compare. Prices are shown in Tanzanian shillings with an indicative USD equivalent.</p>
</div></section>

<div class="container catalog" id="results">
  <aside class="filters" aria-label="Filters" id="filters">
    <form id="filter-form" autocomplete="off">
      <input type="hidden" name="sort" value="newest">
      <div style="display:grid;gap:16px">
        <h3>Filters <span><button type="button" data-reset>Reset</button> <button type="button" data-filters-close class="filters-toggle" aria-label="Close filters" style="margin-left:8px"><i class="fa-solid fa-xmark"></i></button></span></h3>
        <div class="field"><label for="f-q">Search</label><input class="input" id="f-q" name="q" type="search" placeholder="e.g. Forester, SUV, white"></div>
        <div class="field"><label for="f-make">Make</label><select class="select" id="f-make" name="make"><option value="">All makes</option>${opt(makes)}</select></div>
        <div class="field"><label for="f-body">Body style</label><select class="select" id="f-body" name="body"><option value="">Any</option>${opt(bodies)}</select></div>
        <div class="field"><label for="f-year">Year from</label><select class="select" id="f-year" name="yearFrom"><option value="">Any</option>${[2000, 2005, 2010, 2015, 2018, 2020, 2022].map((y) => `<option value="${y}">${y}</option>`)}</select></div>
        <div class="field"><label for="f-km">Max mileage</label><select class="select" id="f-km" name="maxMileage"><option value="">Any</option>${[20000, 50000, 100000, 150000, 200000].map((k) => `<option value="${k}">${k.toLocaleString('en-US')} km</option>`)}</select></div>
        <div class="field"><label for="f-price">Max price</label><select class="select" id="f-price" name="maxPrice"><option value="">Any</option>${[20, 30, 40, 50, 70].map((p) => `<option value="${p * 1e6}">TZS ${p}M</option>`)}</select></div>
        <div class="field"><label for="f-colour">Colour</label><select class="select" id="f-colour" name="colour"><option value="">Any</option>${colours.map((c) => `<option>${esc(c)}</option>`)}</select></div>
        <label class="check"><input type="checkbox" name="available"> Available only</label>
        <label class="check"><input type="checkbox" name="priced"> Show listed prices only</label>
      </div>
    </form>
  </aside>
  <section aria-live="polite">
    <div class="chips" style="margin:0 0 18px"><button class="chip" type="button" data-make="">All</button>${makes.map(([m]) => `<button class="chip" type="button" data-make="${esc(m)}">${esc(m)}</button>`)}</div>
    <div class="results-bar">
      <div><b id="count">${cars.length}</b> vehicles</div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-outline btn-sm filters-toggle" type="button" data-filters-open><i class="fa-solid fa-sliders"></i> Filters <span id="filter-n"></span></button>
        <label class="sr-only" for="sort">Sort by</label>
        <select class="select" id="sort"><option value="newest">Newest listed</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="year-desc">Year: newest first</option><option value="mileage-asc">Mileage: lowest first</option></select>
      </div>
    </div>
    <div class="grid-cars">${cars.map((c) => vehicleCard(c, ''))}</div>
    <div class="empty" id="empty" hidden><i class="fa-solid fa-car-burst"></i><h3>No vehicles match your filters</h3><p>Try removing a filter — or tell us what you need and we’ll source it.</p><p style="margin-top:18px"><button class="btn btn-dark" type="button" data-reset>Reset filters</button></p></div>
    <div class="load-more"><div class="progress-wrap"><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress"><span id="progress-bar"></span></div><p id="progress-text">Showing vehicles…</p></div><button class="btn btn-outline btn-lg" id="more" type="button" data-busy="Loading more…">Show more vehicles</button></div>
  </section>
</div>`;
  return { path: 'cars.html', title: 'Cars for sale in Tanzania', description: 'Browse Toyota, Subaru, Mazda, Nissan, BMW and Audi vehicles for sale in Tanzania. Filter by make, price, year and mileage, and compare side by side.', page: 'cars', body };
}

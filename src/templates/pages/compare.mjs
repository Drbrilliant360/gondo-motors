import { html } from '../lib.mjs';

export function comparePage() {
  const body = html`
<section class="page-head"><div class="container">
  <a class="back-link" href="cars.html" data-back><i class="fa-solid fa-arrow-left"></i> Back to vehicles</a>
  <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><i class="fa-solid fa-chevron-right"></i><span>Compare</span></nav>
  <h1>Compare vehicles</h1>
  <p>Put up to three vehicles side by side. The best value in each row is highlighted for you.</p>
</div></section>
<section class="section" style="padding-top:36px"><div class="container" id="compare-root"><div class="skel-cmp" aria-busy="true" aria-label="Loading comparison"><div class="skel-row"><div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div></div><div class="skel skel-line"></div><div class="skel skel-line"></div><div class="skel skel-line"></div></div><noscript>Please enable JavaScript to use the comparison tool.</noscript></div></section>`;
  return { path: 'compare.html', title: 'Compare cars', description: 'Compare up to three vehicles side by side — price, year, mileage, colour and more.', page: 'compare', body };
}

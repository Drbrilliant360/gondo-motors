// Static site generator: src/ -> dist/   (zero dependencies, Node 18+)
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../src/templates/layout.mjs';
import { home } from '../src/templates/pages/home.mjs';
import { carsPage } from '../src/templates/pages/cars.mjs';
import { carPage } from '../src/templates/pages/car.mjs';
import { comparePage } from '../src/templates/pages/compare.mjs';
import { howToBuy, faqPage, contactPage, localPage, authPage, notFound } from '../src/templates/pages/content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, 'src/data', p), 'utf8'));
const site = read('site.json'), cars = read('cars.json'), faq = read('faq.json'), steps = read('steps.json');
const dist = join(root, 'dist');

const count = (key) => Object.entries(cars.reduce((m, c) => ((m[c[key]] = (m[c[key]] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
const makes = count('make'), bodies = count('body');
const ctx = { site, cars, faq, steps, makes, bodies };

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'src/assets'), join(dist, 'assets'), { recursive: true });

// Compact dataset for the client (compare + filters). Works on file:// too, unlike fetch().
const clientCars = cars.map((c) => ({ id: c.id, slug: c.slug, name: c.name, make: c.make, year: c.year, mileage: c.mileage, price: c.priceTzs, usd: c.priceUsd, body: c.body, colour: c.colour, hex: c.colourHex, chassis: c.chassis, auction: c.auction, status: c.status, cover: c.cover }));
writeFileSync(join(dist, 'assets/js/cars-data.js'), `window.GONDO=${JSON.stringify({ cars: clientCars })};`);

const pages = [home(ctx), carsPage(ctx), comparePage(), howToBuy(ctx), faqPage(ctx), contactPage(ctx), localPage(ctx), authPage('login'), authPage('signup'), notFound(), ...cars.map((car) => carPage({ site, car, cars }))];
for (const p of pages) {
  const out = join(dist, p.path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, layout({ site, ...p, body: p.body }));
}

const urls = pages.filter((p) => p.path !== '404.html' && !/^(login|signup)/.test(p.path)).map((p) => `  <url><loc>${site.url}/${p.path === 'index.html' ? '' : p.path}</loc></url>`).join('\n');
writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
console.log(`Built ${pages.length} pages -> dist/`);

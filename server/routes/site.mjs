// Public pages rendered from the database with the same templates the static build uses,
// so a vehicle added or edited in the admin panel appears on the site without a rebuild.
import { Router } from 'express';
import { catalog } from '../catalog.mjs';
import { layout } from '../../src/templates/layout.mjs';
import { home } from '../../src/templates/pages/home.mjs';
import { carsPage } from '../../src/templates/pages/cars.mjs';
import { carPage } from '../../src/templates/pages/car.mjs';
import { howToBuy, faqPage, contactPage, localPage, authPage, notFound } from '../../src/templates/pages/content.mjs';
import { comparePage } from '../../src/templates/pages/compare.mjs';
import { passwordPage } from '../../src/templates/pages/auth.mjs';
import { clientCar } from '../../src/templates/client-data.mjs';

export const site = Router();
const send = (res, cat, page, status = 200) => res.status(status).set('Cache-Control', 'no-cache').send(layout({ site: cat.site, ...page }));
const page = (render) => async (req, res) => { const cat = await catalog(); send(res, cat, render(cat)); };

site.get(['/', '/index.html'], page(home));
site.get('/cars.html', page(carsPage));
site.get('/local-vehicles.html', page(localPage));
site.get('/how-to-buy.html', page(howToBuy));
site.get('/faq.html', page(faqPage));
site.get('/contact.html', page(contactPage));
site.get('/compare.html', page(() => comparePage()));
site.get('/login.html', page(() => authPage('login')));
site.get('/signup.html', page(() => authPage('signup')));
site.get('/forgot-password.html', page(() => passwordPage('forgot')));
site.get('/reset-password.html', page(() => passwordPage('reset')));
site.get('/change-password.html', page(() => passwordPage('change-password')));

site.get('/car/:file', async (req, res, next) => {
  if (!req.params.file.endsWith('.html')) return next();
  const cat = await catalog();
  const car = cat.bySlug.get(req.params.file.slice(0, -5));
  if (!car) return send(res, cat, { ...notFound(), root: '/' }, 404);
  send(res, cat, carPage({ site: cat.site, car, cars: cat.cars }));
});

// Vehicle data for the compare tool and filters (replaces the generated static file).
site.get('/assets/js/cars-data.js', async (req, res) => {
  const cat = await catalog();
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(`window.GONDO=${JSON.stringify({ cars: cat.cars.map(clientCar) }).replace(/</g, '\\u003c')};`);
});

site.get('/sitemap.xml', async (req, res) => {
  const { site: s, cars } = await catalog();
  const paths = ['', 'cars.html', 'compare.html', 'how-to-buy.html', 'faq.html', 'contact.html', 'local-vehicles.html', ...cars.map((c) => `car/${c.slug}.html`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${s.url}/${p}</loc></url>`).join('\n')}\n</urlset>\n`);
});
site.get('/robots.txt', async (req, res) => {
  const { site: s } = await catalog();
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /account/\nDisallow: /api/\nSitemap: ${s.url}/sitemap.xml\n`);
});

// Anything else is a 404 rendered in the site layout.
export async function notFoundPage(req, res) {
  const cat = await catalog();
  send(res, cat, { ...notFound(), root: '/' }, 404);
}

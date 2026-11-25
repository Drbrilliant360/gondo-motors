// Public catalogue read from the database: vehicles (with photos), settings and editable content.
// Cached briefly in memory so browsing does not hit Neon on every page view; admin changes call invalidateCatalog().
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { many } from './db.mjs';
import { withImages } from '../src/templates/lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseSite = JSON.parse(readFileSync(join(root, 'src/data/site.json'), 'utf8'));
const TTL = 15_000;
let cache = null, loadedAt = 0, loading = null;

export const invalidateCatalog = () => { cache = null; };

export function toView(v, images, usdRate) {
  return withImages({
    id: v.id, stockNo: v.stock_no, slug: v.slug, make: v.make, model: v.model, name: `${v.make} ${v.model}`, year: v.year,
    mileage: v.mileage_km, colour: v.colour, colourHex: v.colour_hex || '#c9cddb', body: v.body_style, chassis: v.model_code,
    auction: v.auction_house, auctionDate: v.auction_date, priceTzs: v.price_tzs, priceUsd: v.price_tzs ? Math.round(v.price_tzs / usdRate) : null,
    status: v.status, source: v.source, featured: v.featured, description: v.description,
  }, images);
}

async function load() {
  const [vehicles, photos, settingRows] = await Promise.all([
    many('SELECT * FROM vehicles WHERE deleted_at IS NULL ORDER BY id DESC'),
    many(`SELECT p.vehicle_id, p.url, p.thumb_url FROM vehicle_photos p JOIN vehicles v ON v.id = p.vehicle_id
          WHERE v.deleted_at IS NULL ORDER BY p.vehicle_id, p.is_cover DESC, p.position, p.id`),
    many('SELECT key, value FROM settings'),
  ]);
  const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const usdRate = Number(settings.usd_rate) > 0 ? Number(settings.usd_rate) : 2645.5;
  const byVehicle = new Map();
  for (const p of photos) { if (!byVehicle.has(p.vehicle_id)) byVehicle.set(p.vehicle_id, []); byVehicle.get(p.vehicle_id).push({ url: p.url, thumb: p.thumb_url }); }
  const cars = vehicles.map((v) => toView(v, byVehicle.get(v.id) || [], usdRate));
  const count = (key) => Object.entries(cars.reduce((m, c) => ((m[c[key]] = (m[c[key]] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const contact = settings['content.contact'] || {};
  const phone = contact.phone || baseSite.phone;
  const site = {
    ...baseSite,
    url: (process.env.SITE_URL || baseSite.url).replace(/\/$/, ''),
    whatsapp: String(settings.whatsapp_number || baseSite.whatsapp).replace(/\D/g, ''),
    phone, phoneHref: phone.replace(/[^\d+]/g, ''),
    email: contact.email || baseSite.email,
    offices: contact.offices || baseSite.offices,
    salesTeam: contact.salesTeam || baseSite.salesTeam,
  };
  return {
    site, cars, settings, usdRate,
    bySlug: new Map(cars.map((c) => [c.slug, c])), byId: new Map(cars.map((c) => [c.id, c])),
    makes: count('make'), bodies: count('body'),
    faq: settings['content.faq'] || [], steps: settings['content.how_to_buy'] || [], banners: settings['content.banners'] || [],
  };
}

export async function catalog() {
  if (cache && Date.now() - loadedAt < TTL) return cache;
  if (!loading) loading = load().then((c) => { cache = c; loadedAt = Date.now(); return c; }).finally(() => { loading = null; });
  return loading;
}

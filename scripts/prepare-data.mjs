// Cleans the raw scraped listings into src/data/cars.json
// Usage: node scripts/prepare-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(root, 'data/source/cars.raw.json'), 'utf8'));

// TZS -> USD rate used by the original site (38,000,000 TZS = $14,363.97)
export const USD_RATE = 2645.5;
const MIN_REAL_PRICE_TZS = 1_000_000; // anything lower in the source is a placeholder, not a price

const MAKES = {
  'ALFAROMEO': 'Alfa Romeo', 'ASTON MARTIN': 'Aston Martin', 'AUDI': 'Audi', 'BMW': 'BMW',
  'MAZDA': 'Mazda', 'MITSUBISHI': 'Mitsubishi', 'NISSAN': 'Nissan', 'SUBARU': 'Subaru', 'TOYOTA': 'Toyota',
};
// listings whose title omits the maker
const IMPLIED_MAKE = { VITZ: 'Toyota', ALTEZZA: 'Toyota' };

const BODY = [
  [/FORESTER|HARRIER|CX-5|\bQ5\b|\bX6\b|ARIYA|BZ4X|COROLLA CROSS|DBX/, 'SUV'],
  [/PAJERO MINI/, 'SUV'],
  [/VANGUARD/, 'SUV'],
  [/ALPHARD|BONGO/, 'Van / MPV'],
  [/PICKUP|CANTER/, 'Pickup / Truck'],
  [/VITZ|VERISA|ALLEX|AQUA|AURIS|\bA1\b|GIULIETTA|\b147\b|BMW 1 |BMW 2 /, 'Hatchback'],
  [/AVENSIS WAGON/, 'Wagon'],
  [/\b86\b|DBX/, 'Coupe'],
  [/VISTA ARDEO/, 'Wagon'],
  [/PREMIO|ALLION|ARISTO|ALTEZZA|AVENSIS|CEFIRO|\b159\b|^6\b|MAZDA 6|BMW [345] |CORONA/, 'Sedan'],
];

const MODEL_BASES = ['FORESTER', '6', 'A1', 'DBX', 'GIULIETTA', '159', '147', 'BONGO BRAWNY', 'CEFIRO', 'ARIYA', 'VISTA ARDEO', '86', 'VITZ', 'ALTEZZA', 'ALLEX', 'ALLION', 'ARISTO', 'AURIS', 'AQUA', 'ALPHARD', 'VANGUARD', 'CAR'].filter((b) => b !== 'CAR');
const NOT_CHASSIS = new Set(['AFT']);
const ACRONYMS = new Set(['DBX']);
const titleCase = (w) => (/\d/.test(w) || ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
const isCode = (t) => /^(?=.*\d)(?=.*[A-Z])[A-Z0-9-]{4,}$/.test(t) && !/^(CX-5|BZ4X)$/.test(t);

function parseName(c) {
  let name = c.name.replace(/\s+/g, ' ').trim().toUpperCase();
  name = name.replace(/^\d{4}\s+/, ''); // leading year duplicate
  let make = null;
  for (const key of Object.keys(MAKES).sort((a, b) => b.length - a.length)) {
    if (name.startsWith(key + ' ') || name === key) { make = MAKES[key]; name = name.slice(key.length).trim(); break; }
  }
  if (!make) { const first = name.split(' ')[0]; make = IMPLIED_MAKE[first] || 'Other'; }
  let chassis = (c.chassis || '').trim().toUpperCase();
  // known model bases: anything after the base is the chassis / trim code
  for (const base of MODEL_BASES) {
    if (name.startsWith(base + ' ')) {
      const rest = name.slice(base.length).trim().replace(/^AFT\s*/, '');
      if (rest && !NOT_CHASSIS.has(rest) && !/^(WAGON|SEDAN)$/.test(rest) && !chassis) chassis = rest;
      if (/^(WAGON|SEDAN)$/.test(rest)) { name = `${base} ${rest}`; break; }
      name = base; break;
    }
  }
  let tokens = name.split(' ').filter(Boolean);
  if (tokens.length > 1 && isCode(tokens[tokens.length - 1])) {
    chassis = chassis || tokens[tokens.length - 1];
    tokens.pop();
  }
  const model = tokens.map(titleCase).join(' ');
  return { make, model, chassis: chassis || null, full: name };
}

const COLOR_MAP = [
  [/pearl|white/i, 'White', '#f3f3f1'], [/gun ?m|gray|grey/i, 'Grey', '#8b8f98'], [/silver/i, 'Silver', '#c3c6cc'],
  [/black/i, 'Black', '#1b1b1f'], [/navy|blue/i, 'Blue', '#2f5fb3'], [/purple|wine/i, 'Purple', '#6b3b7a'],
  [/red/i, 'Red', '#c8323b'], [/green/i, 'Green', '#2f7d57'], [/gold|beige|brown/i, 'Beige', '#b8a07a'],
];
function parseColor(s) {
  const v = (s || '').trim();
  if (!v || /actual|^other$/i.test(v)) return { name: null, hex: null };
  for (const [re, name, hex] of COLOR_MAP) if (re.test(v)) return { name: /pearl/i.test(v) && /white/i.test(v) ? 'Pearl White' : /pearl/i.test(v) ? 'Pearl' : /navy/i.test(v) ? 'Navy Blue' : name, hex };
  return { name: titleCase(v), hex: '#b8bcc6' };
}

function bodyOf(c, p) {
  const key = `${p.make === 'BMW' ? 'BMW ' : ''}${p.full}`.toUpperCase().replace(/^6 /, 'MAZDA 6 ');
  for (const [re, label] of BODY) if (re.test(key)) return label;
  return 'Car';
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const covers = JSON.parse(readFileSync(join(root, 'src/data/covers.json'), 'utf8')); // hand-picked best exterior shot per car
const cars = raw.map((c) => {
  const p = parseName(c);
  const tzsRaw = parseFloat(c.price_raw);
  const hasPrice = tzsRaw >= MIN_REAL_PRICE_TZS;
  const usd = hasPrice ? Math.round(parseFloat((c.usd || '0').replace(/,/g, '')) || tzsRaw / USD_RATE) : null;
  const colour = parseColor(c.color);
  const year = parseInt(c.year, 10) || null;
  const auction = (c.auction || '').replace(/^[:\s]+|[,\s]+$/g, '').trim() || null;
  const adate = /^\d{4}-\d{2}-\d{2}$/.test(c.auction_date) && !c.auction_date.startsWith('0000') ? c.auction_date : null;
  return {
    id: c.id,
    slug: slugify(`${p.make} ${p.model} ${year || ''} ${c.id}`),
    make: p.make,
    model: p.model,
    name: `${p.make === 'Other' ? '' : p.make + ' '}${p.model}`.trim(),
    year,
    mileage: c.mileage > 0 ? c.mileage : null,
    colour: colour.name,
    colourHex: colour.hex,
    body: bodyOf(c, p),
    chassis: p.chassis,
    auction,
    auctionDate: adate,
    priceTzs: hasPrice ? Math.round(tzsRaw) : null,
    priceUsd: usd,
    status: c.status === 'sold' ? 'sold' : 'available',
    photos: c.images.length,
    cover: covers[c.id] || 1, // 1-based index of the cover photo in the original order
  };
});

cars.sort((a, b) => b.id - a.id);
writeFileSync(join(root, 'src/data/cars.json'), JSON.stringify(cars, null, 1));

const makes = {};
cars.forEach((c) => (makes[c.make] = (makes[c.make] || 0) + 1));
console.log(`${cars.length} cars | ${cars.filter((c) => c.priceTzs).length} with a real price | makes:`, makes);

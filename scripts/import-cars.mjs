// One-off import of the existing listings (src/data/cars.json) into the vehicles + vehicle_photos tables.
// Safe to re-run: vehicles that already exist are left untouched.   Usage: npm run import:cars
// Existing photos stay where they are (/assets/img/cars/<id>/NN.jpg); only new uploads go to Cloudinary.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from '../server/db.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cars = JSON.parse(readFileSync(join(root, 'src/data/cars.json'), 'utf8'));
const pad = (n) => String(n).padStart(2, '0');

const result = await tx(async (db) => {
  let added = 0, photos = 0;
  for (const c of cars) {
    const ins = await db.query(
      `INSERT INTO vehicles (id, stock_no, slug, make, model, year, body_style, model_code, mileage_km, colour, colour_hex,
                             price_tzs, source, auction_house, auction_date, status, sold_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'japan_auction',$13,$14,$15, CASE WHEN $15 = 'sold' THEN now() END)
       ON CONFLICT DO NOTHING RETURNING id`,
      [c.id, String(c.id), c.slug, c.make, c.model, c.year || null, c.body, c.chassis || null, c.mileage || null, c.colour || null,
        c.colourHex || null, c.priceTzs || null, c.auction ? c.auction.replace(/^Auction:\s*/i, '') : null, c.auctionDate || null, c.status],
    );
    if (!ins.rowCount) continue;
    added++;
    const order = [c.cover, ...Array.from({ length: c.photos }, (_, i) => i + 1).filter((n) => n !== c.cover)];
    for (const [position, n] of order.entries()) {
      await db.query(
        'INSERT INTO vehicle_photos (vehicle_id, url, thumb_url, position, is_cover) VALUES ($1,$2,$3,$4,$5)',
        [c.id, `/assets/img/cars/${c.id}/${pad(n)}.jpg`, `/assets/img/cars/${c.id}/${pad(n)}-thumb.jpg`, position, position === 0],
      );
      photos++;
    }
  }
  // new vehicles added by the admin continue after the highest imported id
  await db.query("SELECT setval(pg_get_serial_sequence('vehicles', 'id'), (SELECT COALESCE(MAX(id), 1) FROM vehicles))");
  return { added, photos };
});
console.log(`Imported ${result.added} vehicle(s) and ${result.photos} photo(s); ${cars.length - result.added} already present.`);
await pool.end();

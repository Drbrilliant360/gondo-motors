// Seeds the default admin account and default settings/content. Safe to re-run.   Usage: npm run seed
// Admin credentials come from .env (ADMIN_EMAIL / ADMIN_PASSWORD) and must be changed on first login.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, one, query } from '../server/db.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(root, 'src/data', f), 'utf8'));
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'Gondo Admin' } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before seeding.');
if (ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters.');

if (await one("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1")) {
  console.log('An admin account already exists — not creating another.');
} else {
  await query(
    "INSERT INTO users (role, name, email, password_hash, must_change_password) VALUES ('admin', $1, $2, $3, TRUE)",
    [ADMIN_NAME, ADMIN_EMAIL.trim().toLowerCase(), await bcrypt.hash(ADMIN_PASSWORD, 12)],
  );
  console.log(`Admin created: ${ADMIN_EMAIL} (password from .env; must be changed on first login).`);
}

const site = read('site.json');
const defaults = {
  whatsapp_number: site.whatsapp,
  usd_rate: 2645.5, // TZS per 1 USD, the rate the site already used
  business: { name: `${site.name} Co. Ltd.`, phone: site.phone, email: site.email, address: site.offices[0].address, tin: '' },
  'content.contact': { phone: site.phone, email: site.email, offices: site.offices, salesTeam: site.salesTeam },
  'content.faq': read('faq.json'),
  'content.how_to_buy': read('steps.json'),
  'content.banners': [],
};
let added = 0;
for (const [key, value] of Object.entries(defaults)) {
  added += (await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)])).rowCount;
}
console.log(`${added} default setting(s) added.`);
await pool.end();

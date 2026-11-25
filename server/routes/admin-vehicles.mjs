// Admin > Vehicles: list (search, filters, sorting, pagination, bulk actions), add / edit / delete, photos.
// Mounted after requireRole('admin') for both /admin and /api/admin, so every handler here is admin-only.
import { Router } from 'express';
import { one, many, tx } from '../db.mjs';
import { str } from '../security.mjs';
import { renderPanel, logActivity } from '../panel.mjs';
import { catalog, invalidateCatalog } from '../catalog.mjs';
import { cloudinaryReady, signUpload, verifyUpload, photoUrls, destroyAsset } from '../cloudinary.mjs';
import { vehiclesList, vehicleForm, photoTile } from '../../src/templates/panel/vehicles.mjs';
import { VEHICLE_STATUS, SOURCES } from '../../src/templates/panel/ui.mjs';

export const adminVehicles = Router();
const PAGE_SIZE = 20, MAX_PHOTOS = 30;
const SORTS = { make: 'v.make, v.model', year: 'v.year', price: 'v.price_tzs', mileage: 'v.mileage_km', status: 'v.status', newest: 'v.id' };
const idParam = (req) => (/^\d{1,12}$/.test(req.params.id) ? Number(req.params.id) : null);
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const scripts = ['/assets/js/admin-vehicles.js'];

/* ---------- pages ---------- */
adminVehicles.get('/admin/vehicles', async (req, res) => {
  const q = { q: str(req.query.q, 80), status: str(req.query.status, 20), source: str(req.query.source, 20), make: str(req.query.make, 40), body: str(req.query.body, 40), missing: str(req.query.missing, 20), sort: str(req.query.sort, 20), dir: req.query.dir === 'asc' ? 'asc' : 'desc' };
  const where = ['v.deleted_at IS NULL'], params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.q) add("(v.make || ' ' || v.model || ' ' || v.stock_no || ' ' || COALESCE(v.model_code, '') || ' ' || COALESCE(v.colour, '')) ILIKE ?", `%${q.q.replace(/[%_\\]/g, '\\$&')}%`);
  if (VEHICLE_STATUS[q.status]) add('v.status = ?', q.status); else q.status = '';
  if (SOURCES[q.source]) add('v.source = ?', q.source); else q.source = '';
  if (q.make) add('v.make = ?', q.make);
  if (q.body) add('v.body_style = ?', q.body);
  if (q.missing === 'price') where.push('v.price_tzs IS NULL');
  else if (q.missing === 'photos') where.push('NOT EXISTS (SELECT 1 FROM vehicle_photos p WHERE p.vehicle_id = v.id)');
  else if (q.missing === 'featured') where.push('v.featured');
  else q.missing = '';
  if (!SORTS[q.sort]) { q.sort = ''; q.dir = ''; }
  const order = q.sort ? SORTS[q.sort].split(', ').map((c) => `${c} ${q.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`).join(', ') : 'v.id DESC'; // column names come from the fixed SORTS map, never from the request
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const rows = await many(
    `SELECT v.*, count(*) OVER() AS total,
            (SELECT count(*) FROM vehicle_photos p WHERE p.vehicle_id = v.id) AS photo_count,
            (SELECT thumb_url FROM vehicle_photos p WHERE p.vehicle_id = v.id ORDER BY is_cover DESC, position, id LIMIT 1) AS thumb
     FROM vehicles v WHERE ${where.join(' AND ')} ORDER BY ${order}, v.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = rows.length ? rows[0].total : page > 1 ? (await one(`SELECT count(*) AS n FROM vehicles v WHERE ${where.join(' AND ')}`, params.slice(0, -2))).n : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) return res.redirect('/admin/vehicles');
  const opts = await many('SELECT DISTINCT make, body_style FROM vehicles WHERE deleted_at IS NULL');
  const { usdRate } = await catalog();
  const query = Object.fromEntries(Object.entries(q).filter(([, v]) => v));
  renderPanel(req, res, {
    active: 'vehicles', title: 'Vehicles', scripts,
    body: vehiclesList({ rows, query, paging: { page, pages, total, size: PAGE_SIZE }, makes: [...new Set(opts.map((o) => o.make))].sort(), bodies: [...new Set(opts.map((o) => o.body_style))].sort(), usdRate }),
  });
});

adminVehicles.get('/admin/vehicles/new', async (req, res) => {
  const { usdRate } = await catalog();
  renderPanel(req, res, { active: 'vehicles', title: 'Add vehicle', scripts, body: vehicleForm({ vehicle: {}, usdRate, uploadsReady: cloudinaryReady }) });
});

adminVehicles.get('/admin/vehicles/:id/edit', async (req, res, next) => {
  const id = idParam(req);
  const vehicle = id && await one('SELECT * FROM vehicles WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!vehicle) return next();
  const photos = await many('SELECT id, thumb_url, is_cover FROM vehicle_photos WHERE vehicle_id = $1 ORDER BY is_cover DESC, position, id', [id]);
  const { usdRate } = await catalog();
  renderPanel(req, res, { active: 'vehicles', title: 'Edit vehicle', scripts, body: vehicleForm({ vehicle, photos, usdRate, uploadsReady: cloudinaryReady }) });
});

/* ---------- validation ---------- */
function parseVehicle(body) {
  const f = {}, v = {};
  const int = (key, label, min, max) => {
    const raw = str(String(body[key] ?? ''), 30).replace(/[,\s]/g, '');
    if (!raw) return null;
    if (!/^\d+$/.test(raw) || +raw < min || +raw > max) { f[key] = `${label} must be a whole number between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`; return null; }
    return +raw;
  };
  v.make = str(body.make, 40); if (v.make.length < 2) f.make = 'Make is required.';
  v.model = str(body.model, 60); if (!v.model) f.model = 'Model is required.';
  v.body_style = str(body.body_style, 40); if (!v.body_style) f.body_style = 'Choose a body style.';
  v.year = int('year', 'Year', 1950, 2100);
  v.mileage_km = int('mileage_km', 'Mileage', 0, 2_000_000);
  v.price_tzs = int('price_tzs', 'Price', 100_000, 100_000_000_000);
  v.model_code = str(body.model_code, 40) || null;
  v.colour = str(body.colour, 30) || null;
  v.colour_hex = /^#[0-9a-fA-F]{6}$/.test(body.colour_hex || '') ? body.colour_hex.toLowerCase() : null;
  v.stock_no = str(body.stock_no, 30) || null;
  if (v.stock_no && !/^[\w\-./ ]+$/.test(v.stock_no)) f.stock_no = 'Use letters, numbers, dashes or dots only.';
  v.status = VEHICLE_STATUS[body.status] ? body.status : 'available';
  v.source = SOURCES[body.source] ? body.source : 'japan_auction';
  v.auction_house = v.source === 'japan_auction' ? str(body.auction_house, 60) || null : null;
  const d = str(body.auction_date, 10);
  v.auction_date = v.source === 'japan_auction' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null;
  if (d && v.source === 'japan_auction' && !v.auction_date) f.auction_date = 'Enter a valid date.';
  v.description = str(body.description, 2000) || null;
  v.featured = body.featured === '1' || body.featured === true || body.featured === 'on';
  return { v, fields: f, ok: Object.keys(f).length === 0 };
}
const COLS = ['make', 'model', 'year', 'body_style', 'model_code', 'mileage_km', 'colour', 'colour_hex', 'price_tzs', 'source', 'auction_house', 'auction_date', 'status', 'featured', 'description'];
const stockTaken = (db, stockNo, exceptId) => db.query('SELECT 1 FROM vehicles WHERE stock_no = $1 AND id <> $2', [stockNo, exceptId || 0]).then((r) => r.rowCount > 0);

/* ---------- create / update ---------- */
adminVehicles.post('/api/admin/vehicles', async (req, res) => {
  const { v, fields, ok } = parseVehicle(req.body || {});
  if (!ok) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  const result = await tx(async (db) => {
    if (v.stock_no && await stockTaken(db, v.stock_no)) return { fields: { stock_no: 'Another vehicle already uses this stock number.' } };
    const id = (await db.query("SELECT nextval(pg_get_serial_sequence('vehicles', 'id')) AS id")).rows[0].id;
    const stockNo = v.stock_no || String(id);
    if (!v.stock_no && await stockTaken(db, stockNo)) return { fields: { stock_no: 'Enter a stock number for this vehicle.' } };
    const slug = `${slugify([v.make, v.model, v.year].filter(Boolean).join(' '))}-${id}`;
    await db.query(
      `INSERT INTO vehicles (id, stock_no, slug, ${COLS.join(', ')}, sold_at, created_by)
       VALUES ($1, $2, $3, ${COLS.map((_, i) => `$${i + 4}`).join(', ')}, CASE WHEN $${COLS.length + 4} = 'sold' THEN now() END, $${COLS.length + 5})`,
      [id, stockNo, slug, ...COLS.map((c) => v[c]), v.status, req.user.id]);
    await logActivity(db, req, 'vehicle.created', 'vehicle', id, `Added ${v.make} ${v.model} (stock ${stockNo})`);
    return { id };
  });
  if (result.fields) return res.status(422).json({ error: 'Please fix the highlighted field.', fields: result.fields });
  invalidateCatalog();
  res.status(201).json({ redirect: `/admin/vehicles/${result.id}/edit?created=1` });
});

adminVehicles.put('/api/admin/vehicles/:id', async (req, res) => {
  const id = idParam(req);
  const { v, fields, ok } = parseVehicle(req.body || {});
  if (!id) return res.status(404).json({ error: 'Vehicle not found.' });
  if (!ok) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  const result = await tx(async (db) => {
    const old = (await db.query('SELECT * FROM vehicles WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
    if (!old) return { missing: true };
    const stockNo = v.stock_no || old.stock_no;
    if (stockNo !== old.stock_no && await stockTaken(db, stockNo, id)) return { fields: { stock_no: 'Another vehicle already uses this stock number.' } };
    await db.query(
      `UPDATE vehicles SET stock_no = $2, ${COLS.map((c, i) => `${c} = $${i + 3}`).join(', ')},
              sold_at = CASE WHEN $${COLS.length + 3} = 'sold' THEN COALESCE(sold_at, now()) END, updated_at = now() WHERE id = $1`,
      [id, stockNo, ...COLS.map((c) => v[c]), v.status]);
    const changed = {};
    for (const c of ['price_tzs', 'status']) if (old[c] !== v[c]) changed[c] = { from: old[c], to: v[c] };
    await logActivity(db, req, 'vehicle.updated', 'vehicle', id, `Updated ${v.make} ${v.model} (stock ${stockNo})`, changed);
    return {};
  });
  if (result.missing) return res.status(404).json({ error: 'Vehicle not found.' });
  if (result.fields) return res.status(422).json({ error: 'Please fix the highlighted field.', fields: result.fields });
  invalidateCatalog();
  res.json({ message: 'Vehicle saved.' });
});

/* ---------- bulk actions (also used for single-row delete and the featured star) ---------- */
adminVehicles.post('/api/admin/vehicles/bulk', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 200) : [];
  const action = str(req.body.action, 30);
  if (!ids.length) return res.status(422).json({ error: 'Select at least one vehicle.' });
  const status = action.startsWith('status:') ? action.slice(7) : null;
  if (!(action === 'feature' || action === 'unfeature' || action === 'delete' || VEHICLE_STATUS[status])) return res.status(422).json({ error: 'Choose an action.' });
  const result = await tx(async (db) => {
    if (action === 'delete') {
      // vehicles on an open order stay: cancel or complete the order first
      const busy = (await db.query(
        `SELECT DISTINCT i.vehicle_id FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE i.vehicle_id = ANY($1) AND o.status NOT IN ('cancelled', 'delivered')`, [ids])).rows.map((r) => r.vehicle_id);
      const free = ids.filter((id) => !busy.includes(id));
      const done = (await db.query('UPDATE vehicles SET deleted_at = now(), featured = FALSE WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id, make, model, stock_no', [free])).rows;
      await db.query('DELETE FROM cart_items WHERE vehicle_id = ANY($1)', [done.map((d) => d.id)]);
      for (const d of done) await logActivity(db, req, 'vehicle.deleted', 'vehicle', d.id, `Deleted ${d.make} ${d.model} (stock ${d.stock_no})`);
      return { n: done.length, skipped: busy.length };
    }
    const set = status ? "status = $2, sold_at = CASE WHEN $2 = 'sold' THEN COALESCE(sold_at, now()) END" : 'featured = $2';
    const done = (await db.query(`UPDATE vehicles SET ${set}, updated_at = now() WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id`, [ids, status || action === 'feature'])).rows;
    const what = status ? `Set status to ${VEHICLE_STATUS[status][1]}` : action === 'feature' ? 'Marked as featured' : 'Removed from featured';
    if (done.length) await logActivity(db, req, status ? 'vehicle.status_changed' : 'vehicle.featured_changed', 'vehicle', done.length === 1 ? done[0].id : null, `${what}: ${done.length} vehicle${done.length === 1 ? '' : 's'}`, { ids: done.map((d) => d.id) });
    return { n: done.length, skipped: 0 };
  });
  invalidateCatalog();
  const noun = (n) => `${n} vehicle${n === 1 ? '' : 's'}`;
  const verb = action === 'delete' ? 'deleted' : 'updated';
  res.json({ ...result, message: `${noun(result.n)} ${verb}.${result.skipped ? ` ${noun(result.skipped)} skipped because ${result.skipped === 1 ? 'it is' : 'they are'} on an open order.` : ''}` });
});

/* ---------- photos ---------- */
const owned = async (req) => { const id = idParam(req); return id && one('SELECT id FROM vehicles WHERE id = $1 AND deleted_at IS NULL', [id]); };

// Step 1: the browser asks for a signature, then uploads the file directly to Cloudinary.
adminVehicles.post('/api/admin/vehicles/:id/photos/sign', async (req, res) => {
  if (!cloudinaryReady) return res.status(503).json({ error: 'Photo uploads are not set up yet.' });
  const v = await owned(req);
  if (!v) return res.status(404).json({ error: 'Vehicle not found.' });
  const n = (await one('SELECT count(*) AS n FROM vehicle_photos WHERE vehicle_id = $1', [v.id])).n;
  if (n >= MAX_PHOTOS) return res.status(422).json({ error: `A vehicle can have up to ${MAX_PHOTOS} photos. Delete one to add another.` });
  res.json({ ...signUpload({ folder: `gondo/vehicles/${v.id}` }), remaining: MAX_PHOTOS - n });
});

// Step 2: the browser reports what Cloudinary returned; we verify Cloudinary's signature before saving the URL.
adminVehicles.post('/api/admin/vehicles/:id/photos', async (req, res) => {
  const v = await owned(req);
  if (!v) return res.status(404).json({ error: 'Vehicle not found.' });
  const { public_id: publicId, version, signature } = req.body || {};
  if (!verifyUpload({ public_id: publicId, version, signature }) || !publicId.startsWith(`gondo/vehicles/${v.id}/`)) return res.status(422).json({ error: 'That upload could not be verified. Please try again.' });
  const { url, thumb } = photoUrls(publicId, version);
  const photo = await tx(async (db) => {
    await db.query('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', [v.id]); // serialise concurrent uploads for cover/position
    const s = (await db.query('SELECT count(*) AS n, COALESCE(max(position), -1) + 1 AS next FROM vehicle_photos WHERE vehicle_id = $1', [v.id])).rows[0];
    if (s.n >= MAX_PHOTOS) return null;
    return (await db.query('INSERT INTO vehicle_photos (vehicle_id, url, thumb_url, public_id, position, is_cover) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, thumb_url, is_cover',
      [v.id, url, thumb, publicId, s.next, s.n === 0])).rows[0];
  });
  if (!photo) { destroyAsset(publicId).catch(() => {}); return res.status(422).json({ error: `A vehicle can have up to ${MAX_PHOTOS} photos.` }); }
  invalidateCatalog();
  res.status(201).json({ html: photoTile(photo) });
});

adminVehicles.post('/api/admin/vehicles/:id/photos/:photoId/cover', async (req, res) => {
  const v = await owned(req), photoId = Number(req.params.photoId);
  if (!v || !Number.isSafeInteger(photoId)) return res.status(404).json({ error: 'Photo not found.' });
  const ok = await tx(async (db) => {
    if (!(await db.query('SELECT 1 FROM vehicle_photos WHERE id = $1 AND vehicle_id = $2', [photoId, v.id])).rowCount) return false;
    await db.query('UPDATE vehicle_photos SET is_cover = FALSE WHERE vehicle_id = $1 AND is_cover', [v.id]);
    await db.query('UPDATE vehicle_photos SET is_cover = TRUE WHERE id = $1', [photoId]);
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'Photo not found.' });
  invalidateCatalog();
  res.json({ message: 'Cover photo updated.' });
});

adminVehicles.delete('/api/admin/vehicles/:id/photos/:photoId', async (req, res) => {
  const v = await owned(req), photoId = Number(req.params.photoId);
  if (!v || !Number.isSafeInteger(photoId)) return res.status(404).json({ error: 'Photo not found.' });
  const gone = await tx(async (db) => {
    const p = (await db.query('DELETE FROM vehicle_photos WHERE id = $1 AND vehicle_id = $2 RETURNING public_id, is_cover', [photoId, v.id])).rows[0];
    if (!p) return null;
    let newCover = null;
    if (p.is_cover) newCover = (await db.query('UPDATE vehicle_photos SET is_cover = TRUE WHERE id = (SELECT id FROM vehicle_photos WHERE vehicle_id = $1 ORDER BY position, id LIMIT 1) RETURNING id', [v.id])).rows[0]?.id || null;
    return { ...p, newCover };
  });
  if (!gone) return res.status(404).json({ error: 'Photo not found.' });
  if (gone.public_id) destroyAsset(gone.public_id).catch((err) => console.error('Cloudinary delete failed:', err.message)); // imported photos live in the repo and are left alone
  invalidateCatalog();
  res.json({ message: 'Photo deleted.', newCover: gone.newCover });
});

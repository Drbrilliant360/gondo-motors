import { esc, fmt } from '../lib.mjs';
import { money, vehiclePill, VEHICLE_STATUS, SOURCES, BODY_STYLES, qs, sortTh, pagination, option } from './ui.mjs';

const NO_PHOTO = '/assets/img/brand/no-photo.svg';

/* ------------------------------------------------------------------ list */
export function vehiclesList({ rows, query, paging, makes, bodies, usdRate }) {
  const filtered = ['q', 'status', 'source', 'make', 'body', 'featured', 'missing'].some((k) => query[k]);
  const table = rows.length ? `
  <form id="bulk-form" class="bulk" hidden aria-live="polite">
    <b><span id="bulk-n">0</span> selected</b>
    <label class="sr-only" for="bulk-action">Bulk action</label>
    <select class="select" id="bulk-action">
      <option value="">Choose an action…</option>
      <optgroup label="Set status">${Object.entries(VEHICLE_STATUS).map(([k, [, l]]) => option(`status:${k}`, l)).join('')}</optgroup>
      <optgroup label="Homepage"><option value="feature">Mark as featured</option><option value="unfeature">Remove from featured</option></optgroup>
      <optgroup label="Danger"><option value="delete">Delete vehicles</option></optgroup>
    </select>
    <button class="btn btn-dark btn-sm" type="submit" data-busy="Applying…">Apply</button>
    <button class="btn btn-outline btn-sm" type="button" id="bulk-clear">Clear</button>
  </form>
  <div class="tbl-wrap"><table class="tbl" id="vehicles-table">
    <thead><tr>
      <th class="chk"><input type="checkbox" id="check-all" aria-label="Select all vehicles on this page"></th>
      ${sortTh('Vehicle', 'make', query)}${sortTh('Year', 'year', query)}${sortTh('Price', 'price', query, 'num')}${sortTh('Mileage', 'mileage', query, 'num')}
      <th>Source</th>${sortTh('Status', 'status', query)}<th>Featured</th><th class="num">Actions</th>
    </tr></thead>
    <tbody>${rows.map((v) => {
    const name = `${v.make} ${v.model}`;
    return `<tr data-id="${v.id}" data-name="${esc(name)}">
      <td class="chk" data-label="Select"><input type="checkbox" class="row-check" value="${v.id}" aria-label="Select ${esc(name)}"></td>
      <td data-label="Vehicle"><a class="veh" href="/admin/vehicles/${v.id}/edit"><img class="row-thumb" src="${esc(v.thumb || NO_PHOTO)}" alt="" loading="lazy"><span><b>${esc(name)}</b><span class="sub">Stock ${esc(v.stock_no)} · ${esc(v.body_style)}${v.photo_count ? '' : ' · <span class="warn-text">no photos</span>'}</span></span></a></td>
      <td data-label="Year">${v.year || '—'}</td>
      <td data-label="Price" class="num">${v.price_tzs ? `${money(v.price_tzs)}<span class="sub">≈ $${fmt(Math.round(v.price_tzs / usdRate))}</span>` : '<span class="warn-text">No price</span>'}</td>
      <td data-label="Mileage" class="num">${v.mileage_km ? `${fmt(v.mileage_km)} km` : '—'}</td>
      <td data-label="Source"><span class="nw">${SOURCES[v.source]}</span></td>
      <td data-label="Status">${vehiclePill(v.status)}</td>
      <td data-label="Featured"><button class="star${v.featured ? ' on' : ''}" type="button" data-feature="${v.featured ? 0 : 1}" aria-pressed="${v.featured}" aria-label="${v.featured ? 'Remove from featured' : 'Mark as featured'}: ${esc(name)}"><i class="fa-${v.featured ? 'solid' : 'regular'} fa-star"></i></button></td>
      <td data-label="Actions" class="num"><span class="row-actions">
        <a class="icon-btn sm" href="/car/${esc(v.slug)}.html" target="_blank" rel="noopener" aria-label="View ${esc(name)} on the website"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        <a class="icon-btn sm" href="/admin/vehicles/${v.id}/edit" aria-label="Edit ${esc(name)}"><i class="fa-solid fa-pen"></i></a>
        <button class="icon-btn sm danger" type="button" data-delete aria-label="Delete ${esc(name)}"><i class="fa-solid fa-trash-can"></i></button>
      </span></td></tr>`;
  }).join('')}</tbody>
  </table></div>
  <div class="card-foot">${pagination(paging, query, 'vehicles')}</div>`
    : `<div class="state"><i class="fa-solid fa-car-side"></i><b>${filtered ? 'No vehicles match these filters' : 'No vehicles yet'}</b><p>${filtered ? 'Try removing a filter or searching for something else.' : 'Add your first vehicle and it will appear on the website straight away.'}</p><p style="margin-top:16px">${filtered ? '<a class="btn btn-outline" href="/admin/vehicles">Clear filters</a>' : '<a class="btn btn-primary" href="/admin/vehicles/new"><i class="fa-solid fa-plus"></i> Add vehicle</a>'}</p></div>`;

  return `
<div class="page-bar">
  <div><h2>Vehicles</h2><p>${fmt(paging.total)} ${filtered ? 'matching' : 'in stock'} · changes appear on the website within a few seconds.</p></div>
  <div class="page-actions"><a class="btn btn-primary" href="/admin/vehicles/new"><i class="fa-solid fa-plus"></i> Add vehicle</a></div>
</div>
<section class="card">
  <form class="filter-bar" method="get" action="/admin/vehicles" role="search">
    <div class="field grow"><label for="f-q">Search</label><input class="input" id="f-q" name="q" type="search" value="${esc(query.q || '')}" placeholder="Make, model, stock no., model code, colour"></div>
    <div class="field"><label for="f-status">Status</label><select class="select" id="f-status" name="status"><option value="">All</option>${Object.entries(VEHICLE_STATUS).map(([k, [, l]]) => option(k, l, query.status)).join('')}</select></div>
    <div class="field"><label for="f-make">Make</label><select class="select" id="f-make" name="make"><option value="">All</option>${makes.map((m) => option(m, m, query.make)).join('')}</select></div>
    <div class="field"><label for="f-body">Body style</label><select class="select" id="f-body" name="body"><option value="">All</option>${bodies.map((b) => option(b, b, query.body)).join('')}</select></div>
    <div class="field"><label for="f-source">Source</label><select class="select" id="f-source" name="source"><option value="">All</option>${Object.entries(SOURCES).map(([k, l]) => option(k, l, query.source)).join('')}</select></div>
    <div class="field"><label for="f-missing">Show</label><select class="select" id="f-missing" name="missing"><option value="">Everything</option>${option('price', 'Missing a price', query.missing)}${option('photos', 'Missing photos', query.missing)}${option('featured', 'Featured only', query.missing)}</select></div>
    ${query.sort ? `<input type="hidden" name="sort" value="${esc(query.sort)}"><input type="hidden" name="dir" value="${esc(query.dir || '')}">` : ''}
    <div class="filter-actions"><button class="btn btn-dark" type="submit"><i class="fa-solid fa-filter"></i> Filter</button>${filtered ? '<a class="btn btn-outline" href="/admin/vehicles">Reset</a>' : ''}</div>
  </form>
  ${table}
</section>`;
}

/* ------------------------------------------------------------------ add / edit form */
const field = (id, label, control, { required, hint, cls = '' } = {}) => `<div class="field ${cls}"><label for="${id}">${label}${required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>${control}${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
const input = (id, name, value, attrs = '') => `<input class="input" id="${id}" name="${name}" value="${esc(value ?? '')}" ${attrs}>`;

export function vehicleForm({ vehicle: v, photos = [], usdRate, uploadsReady }) {
  const isNew = !v.id;
  const body = BODY_STYLES.includes(v.body_style) || !v.body_style ? BODY_STYLES : [v.body_style, ...BODY_STYLES];
  return `
<a class="back-link" href="/admin/vehicles" style="margin:0"><i class="fa-solid fa-arrow-left"></i> Back to vehicles</a>
<div class="page-bar">
  <div><h2>${isNew ? 'Add a vehicle' : `${esc(v.make)} ${esc(v.model)}`}</h2><p>${isNew ? 'Save the details first, then add photos.' : `Stock ${esc(v.stock_no)} · <a href="/car/${esc(v.slug)}.html" target="_blank" rel="noopener" style="color:var(--accent-dark);font-weight:600">View on website <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:.75em"></i></a>`}</p></div>
  ${isNew ? '' : `<div class="page-actions"><button class="btn btn-outline" type="button" id="delete-vehicle" data-name="${esc(`${v.make} ${v.model}`)}"><i class="fa-solid fa-trash-can"></i> Delete</button></div>`}
</div>
<div class="cols">
  <form class="card col-8" id="vehicle-form" data-id="${v.id || ''}" data-usd-rate="${usdRate}" novalidate>
    <div class="card-head"><h3>Vehicle details</h3><small>Fields marked <span class="req">*</span> are required</small></div>
    <div class="card-body stack">
      <div class="form-summary" role="alert" hidden></div>
      <div class="form-grid">
        ${field('v-make', 'Make', input('v-make', 'make', v.make, 'required maxlength="40" placeholder="e.g. Toyota" list="makes-list" autocomplete="off"'), { required: true })}
        ${field('v-model', 'Model', input('v-model', 'model', v.model, 'required maxlength="60" placeholder="e.g. Harrier"'), { required: true })}
        ${field('v-year', 'Year', input('v-year', 'year', v.year, 'type="number" inputmode="numeric" min="1950" max="2100" placeholder="e.g. 2019"'))}
        ${field('v-body', 'Body style', `<select class="select" id="v-body" name="body_style" required><option value="">Choose…</option>${body.map((b) => option(b, b, v.body_style)).join('')}</select>`, { required: true })}
        ${field('v-code', 'Model code', input('v-code', 'model_code', v.model_code, 'maxlength="40" placeholder="e.g. ZSU60W"'), { hint: 'The chassis / model code from the auction sheet.' })}
        ${field('v-mileage', 'Mileage (km)', input('v-mileage', 'mileage_km', v.mileage_km, 'type="number" inputmode="numeric" min="0" max="2000000" placeholder="e.g. 54000"'))}
        ${field('v-colour', 'Colour', `<div class="colour-row">${input('v-colour', 'colour', v.colour, 'maxlength="30" placeholder="e.g. Pearl White"')}<input type="color" name="colour_hex" value="${esc(v.colour_hex || '#c9cddb')}" aria-label="Colour swatch"></div>`)}
        ${field('v-stock', 'Stock number', input('v-stock', 'stock_no', v.stock_no, 'maxlength="30" placeholder="Leave blank to assign automatically"'))}
        ${field('v-price', 'Price (TZS)', input('v-price', 'price_tzs', v.price_tzs ? fmt(v.price_tzs) : '', 'inputmode="numeric" maxlength="20" placeholder="e.g. 45,000,000"'), { hint: `<span id="usd-hint">Leave blank to show “Price on request”.</span>` })}
        ${field('v-status', 'Status', `<select class="select" id="v-status" name="status">${Object.entries(VEHICLE_STATUS).map(([k, [, l]]) => option(k, l, v.status || 'available')).join('')}</select>`, { hint: 'Reserved and Sold are also set automatically from orders.' })}
        ${field('v-source', 'Source', `<select class="select" id="v-source" name="source">${Object.entries(SOURCES).map(([k, l]) => option(k, l, v.source || 'japan_auction')).join('')}</select>`)}
        ${field('v-auction', 'Auction house', input('v-auction', 'auction_house', v.auction_house, 'maxlength="60" placeholder="e.g. TAA Yokohama"'), { cls: 'auction-only' })}
        ${field('v-adate', 'Auction date', input('v-adate', 'auction_date', v.auction_date, 'type="date"'), { cls: 'auction-only' })}
      </div>
      ${field('v-desc', 'Description <span class="opt">(optional)</span>', `<textarea class="textarea" id="v-desc" name="description" maxlength="2000" placeholder="Condition, features, service history…">${esc(v.description || '')}</textarea>`)}
      <label class="check"><input type="checkbox" name="featured" value="1"${v.featured ? ' checked' : ''}> Feature this vehicle on the homepage</label>
    </div>
    <div class="card-foot form-foot"><a class="btn btn-outline" href="/admin/vehicles">Cancel</a><button class="btn btn-primary" type="submit" data-busy="Saving…">${isNew ? 'Save and add photos' : 'Save changes'}</button></div>
    <datalist id="makes-list">${['Toyota', 'Subaru', 'Mazda', 'Nissan', 'Honda', 'Mitsubishi', 'Suzuki', 'BMW', 'Audi', 'Mercedes-Benz', 'Volkswagen', 'Land Rover', 'Lexus', 'Isuzu'].map((m) => `<option value="${m}">`).join('')}</datalist>
  </form>

  <section class="card col-4" id="photos-card" data-id="${v.id || ''}">
    <div class="card-head"><h3>Photos</h3><small id="photo-count">${photos.length} photo${photos.length === 1 ? '' : 's'}</small></div>
    ${isNew ? '<div class="state"><i class="fa-regular fa-images"></i><b>Photos come next</b><p>Save the vehicle details and you can upload photos here.</p></div>'
    : !uploadsReady ? '<div class="state"><i class="fa-solid fa-triangle-exclamation"></i><b>Photo uploads are not set up</b><p>Add the Cloudinary keys to the server settings to upload photos.</p></div>'
      : `<div class="card-body stack stack-sm">
      <label class="drop" id="drop"><input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp" multiple class="sr-only"><i class="fa-solid fa-cloud-arrow-up"></i><b>Add photos</b><span>Tap to choose, or drag photos here. JPG, PNG or WebP.</span></label>
      <div class="photo-grid" id="photo-grid">${photos.map(photoTile).join('')}</div>
      <p class="hint" style="padding:0">The cover photo is the one shown on listings. Large photos are resized before upload.</p>
    </div>`}
  </section>
</div>`;
}

export const photoTile = (p) => `<figure class="photo${p.is_cover ? ' is-cover' : ''}" data-photo="${p.id}"><img src="${esc(p.thumb_url)}" alt="" loading="lazy">${p.is_cover ? '<figcaption>Cover</figcaption>' : ''}<div class="photo-actions">${p.is_cover ? '' : '<button type="button" data-cover aria-label="Use as cover photo"><i class="fa-solid fa-star"></i></button>'}<button type="button" data-remove aria-label="Delete photo"><i class="fa-solid fa-trash-can"></i></button></div></figure>`;

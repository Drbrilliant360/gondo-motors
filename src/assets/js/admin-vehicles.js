/* Gondo Motors — Admin > Vehicles: bulk actions, featured toggle, delete, vehicle form, photo uploads */
(function () {
  'use strict';
  const { toast, confirmDialog, setBusy, validate, fieldError, summary, esc } = window.GondoUI;
  const api = window.GondoApi.send;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const fail = (r, title = 'That didn’t work') => toast((r && r.body && r.body.error) || 'Please check your connection and try again.', { type: 'error', title });
  const call = async (path, data, method) => { try { return await api(path, data, method); } catch { return { ok: false, body: {} }; } };
  // a message to show after the page reloads
  const later = (msg) => { try { sessionStorage.setItem('gm.flash', msg); } catch { /* shown only if storage works */ } };
  try { const m = sessionStorage.getItem('gm.flash'); if (m) { sessionStorage.removeItem('gm.flash'); toast(m, { type: 'success' }); } } catch { /* ignore */ }

  const bulk = (ids, action) => call('/api/admin/vehicles/bulk', { ids, action });
  async function deleteVehicles(ids, label) {
    const ok = await confirmDialog({ title: ids.length === 1 ? `Delete ${label}?` : `Delete ${ids.length} vehicles?`, message: 'They will be removed from the website straight away. Vehicles on an open order are kept. This cannot be undone from the panel.', confirmLabel: 'Delete', icon: 'fa-trash-can' });
    if (!ok) return null;
    const r = await bulk(ids, 'delete');
    if (!r.ok) { fail(r, 'Couldn’t delete'); return null; }
    return r;
  }

  /* ---------- list ---------- */
  const table = $('#vehicles-table');
  if (table) {
    const form = $('#bulk-form'), all = $('#check-all'), checks = $$('.row-check', table);
    const selected = () => checks.filter((c) => c.checked).map((c) => +c.value);
    const sync = () => { const n = selected().length; form.hidden = n === 0; $('#bulk-n').textContent = n; all.checked = n === checks.length; all.indeterminate = n > 0 && n < checks.length; };
    all.addEventListener('change', () => { checks.forEach((c) => (c.checked = all.checked)); sync(); });
    table.addEventListener('change', (e) => { if (e.target.classList.contains('row-check')) sync(); });
    $('#bulk-clear').addEventListener('click', () => { checks.forEach((c) => (c.checked = false)); sync(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const action = $('#bulk-action').value, ids = selected();
      if (!action) { toast('Choose what to do with the selected vehicles.', { type: 'warn', title: 'No action chosen' }); $('#bulk-action').focus(); return; }
      const btn = $('button[type=submit]', form);
      let r;
      if (action === 'delete') { r = await deleteVehicles(ids); if (!r) return; }
      else {
        if (action.startsWith('status:') && !(await confirmDialog({ title: `Change status of ${ids.length} vehicle${ids.length === 1 ? '' : 's'}?`, message: 'The new status shows on the website straight away.', confirmLabel: 'Change status', icon: 'fa-tag' }))) return;
        setBusy(btn, true); r = await bulk(ids, action); setBusy(btn, false);
        if (!r.ok) return fail(r);
      }
      later(r.body.message); location.reload();
    });
    table.addEventListener('click', async (e) => {
      const row = e.target.closest('tr[data-id]'); if (!row) return;
      const id = +row.dataset.id, star = e.target.closest('[data-feature]');
      if (star) {
        const on = star.dataset.feature === '1';
        star.disabled = true;
        const r = await bulk([id], on ? 'feature' : 'unfeature');
        star.disabled = false;
        if (!r.ok) return fail(r);
        star.dataset.feature = on ? '0' : '1'; star.classList.toggle('on', on); star.setAttribute('aria-pressed', on);
        star.firstElementChild.className = `fa-${on ? 'solid' : 'regular'} fa-star`;
        toast(on ? 'Shown in the featured section of the homepage.' : 'Removed from the homepage featured section.', { type: 'success', title: on ? 'Marked as featured' : 'No longer featured', duration: 2600 });
      }
      if (e.target.closest('[data-delete]')) {
        const r = await deleteVehicles([id], row.dataset.name);
        if (!r) return;
        if (!r.body.n) return toast(r.body.message, { type: 'warn', title: 'Not deleted' });
        later(r.body.message); location.reload();
      }
    });
  }

  /* ---------- add / edit form ---------- */
  const vf = $('#vehicle-form');
  if (vf) {
    const id = vf.dataset.id, rate = +vf.dataset.usdRate || 0, price = vf.elements.price_tzs, usd = $('#usd-hint');
    const nf = new Intl.NumberFormat('en-US');
    const showUsd = () => { const n = +price.value.replace(/[^\d]/g, ''); usd.textContent = n && rate ? `≈ $${nf.format(Math.round(n / rate))} USD at ${nf.format(rate)} TZS per dollar.` : 'Leave blank to show “Price on request”.'; };
    price.addEventListener('input', () => { const digits = price.value.replace(/[^\d]/g, ''); price.value = digits ? nf.format(+digits) : ''; showUsd(); });
    showUsd();
    const src = vf.elements.source, auctionOnly = () => $$('.auction-only', vf).forEach((el) => (el.hidden = src.value !== 'japan_auction'));
    src.addEventListener('change', auctionOnly); auctionOnly();
    let dirty = false;
    vf.addEventListener('input', () => (dirty = true));
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    if (new URLSearchParams(location.search).get('created')) { toast('Now add some photos so customers can see it.', { type: 'success', title: 'Vehicle saved' }); history.replaceState(null, '', location.pathname); }

    vf.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (vf.dataset.submitting || !validate(vf)) return;
      vf.dataset.submitting = '1';
      const btn = $('button[type=submit]', vf); setBusy(btn, true);
      const data = Object.fromEntries(new FormData(vf));
      const r = await call(id ? `/api/admin/vehicles/${id}` : '/api/admin/vehicles', data, id ? 'PUT' : 'POST');
      if (r.ok && r.body.redirect) { dirty = false; location.assign(r.body.redirect); return; }
      setBusy(btn, false); delete vf.dataset.submitting;
      if (r.ok) { dirty = false; summary(vf, []); toast('Changes are live on the website.', { type: 'success', title: 'Vehicle saved' }); return; }
      const bad = [];
      Object.entries(r.body.fields || {}).forEach(([name, msg]) => { const el = vf.elements[name]; if (el) { fieldError(el, msg); bad.push(el); } });
      summary(vf, bad); if (bad.length) bad[0].focus();
      fail(r, 'Vehicle not saved');
    });

    const del = $('#delete-vehicle');
    if (del) del.addEventListener('click', async () => {
      const r = await deleteVehicles([+id], del.dataset.name);
      if (!r) return;
      if (!r.body.n) return toast(r.body.message, { type: 'warn', title: 'Not deleted' });
      dirty = false; later(r.body.message); location.assign('/admin/vehicles');
    });
  }

  /* ---------- photos: resize in the browser, upload straight to Cloudinary, then register with the server ---------- */
  const card = $('#photos-card'), input = $('#photo-input');
  if (card && input) {
    const vid = card.dataset.id, grid = $('#photo-grid'), drop = $('#drop');
    const count = () => { const n = $$('.photo:not(.is-uploading)', grid).length; $('#photo-count').textContent = `${n} photo${n === 1 ? '' : 's'}`; };
    // Phone photos are often 5–10 MB; 1920px JPEG keeps uploads fast on mobile data.
    async function shrink(file) {
      try {
        const bmp = await createImageBitmap(file), scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
        if (scale === 1 && file.size < 1_500_000) return file;
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.86));
      } catch { return file; }
    }
    function send(url, fd, onProgress) {
      return new Promise((resolve, reject) => {
        const x = new XMLHttpRequest(); x.open('POST', url);
        x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
        x.onload = () => { try { const j = JSON.parse(x.responseText); x.status < 300 ? resolve(j) : reject(new Error((j.error && j.error.message) || 'Upload failed')); } catch { reject(new Error('Upload failed')); } };
        x.onerror = () => reject(new Error('Network error'));
        x.send(fd);
      });
    }
    async function upload(file) {
      const tile = document.createElement('figure');
      tile.className = 'photo is-uploading';
      tile.innerHTML = `<img alt="" src="${URL.createObjectURL(file)}"><div class="photo-progress"><span></span></div>`;
      grid.appendChild(tile);
      try {
        const sig = await call(`/api/admin/vehicles/${vid}/photos/sign`, {});
        if (!sig.ok) throw new Error(sig.body.error || 'Could not start the upload');
        const fd = new FormData();
        Object.entries(sig.body.fields).forEach(([k, v]) => fd.append(k, v));
        fd.append('file', await shrink(file), 'photo.jpg');
        const up = await send(sig.body.url, fd, (p) => ($('.photo-progress span', tile).style.width = `${Math.round(p * 100)}%`));
        const saved = await call(`/api/admin/vehicles/${vid}/photos`, { public_id: up.public_id, version: up.version, signature: up.signature });
        if (!saved.ok) throw new Error(saved.body.error || 'Could not save the photo');
        tile.outerHTML = saved.body.html; count(); return true;
      } catch (err) {
        tile.remove(); toast(`${file.name}: ${err.message}`, { type: 'error', title: 'Photo not uploaded' }); return false;
      }
    }
    async function addFiles(files) {
      const list = Array.from(files).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
      if (list.length < files.length) toast('Only JPG, PNG and WebP photos can be uploaded.', { type: 'warn', title: 'Some files were skipped' });
      if (!list.length) return;
      drop.classList.add('busy');
      let done = 0;
      for (const f of list) if (await upload(f)) done++;   // one at a time: keeps order and is kinder to slow connections
      drop.classList.remove('busy'); input.value = '';
      if (done) toast(`${done} photo${done === 1 ? '' : 's'} added and live on the website.`, { type: 'success', title: 'Photos uploaded' });
    }
    input.addEventListener('change', () => addFiles(input.files));
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

    grid.addEventListener('click', async (e) => {
      const tile = e.target.closest('.photo[data-photo]'); if (!tile) return;
      const pid = tile.dataset.photo;
      if (e.target.closest('[data-cover]')) {
        const r = await call(`/api/admin/vehicles/${vid}/photos/${pid}/cover`, {});
        if (!r.ok) return fail(r);
        later('Cover photo updated.'); location.reload();
      }
      if (e.target.closest('[data-remove]')) {
        if (!(await confirmDialog({ title: 'Delete this photo?', message: 'It will be removed from the website straight away.', confirmLabel: 'Delete photo', icon: 'fa-image' }))) return;
        const r = await call(`/api/admin/vehicles/${vid}/photos/${pid}`, null, 'DELETE');
        if (!r.ok) return fail(r);
        if (r.body.newCover) { later('Photo deleted.'); location.reload(); return; }
        tile.remove(); count(); toast('Photo deleted.', { type: 'success', duration: 2200 });
      }
    });
  }
})();

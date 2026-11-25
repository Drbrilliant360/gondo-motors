/* Gondo Motors — site behaviour (no dependencies)
   Core:      toasts, busy buttons, ripple, page progress bar, image loading/error states
   Features:  nav, hero slider, compare store + tray, catalog filters, gallery/lightbox, compare page, forms */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const ROOT = document.body.dataset.root || '';
  const CARS = (window.GONDO && window.GONDO.cars) || [];
  const byId = new Map(CARS.map((c) => [c.id, c]));
  const nf = new Intl.NumberFormat('en-US');
  const fmtTzs = (n) => (n ? 'TZS ' + nf.format(n) : 'Price on request');
  const fmtKm = (n) => (n ? nf.format(n) + ' km' : 'Not stated');
  const thumb = (c) => (/^(https?:)?\/\//.test(c.thumb) ? c.thumb : ROOT + String(c.thumb || '').replace(/^\//, ''));
  const STATUS = { available: 'Available', reserved: 'Reserved', in_transit: 'In transit', sold: 'Sold' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /* =====================================================================
     Toasts — success / error / warn / info, auto-dismiss with countdown bar
     ===================================================================== */
  const ICONS = { success: 'fa-check', error: 'fa-xmark', warn: 'fa-exclamation', info: 'fa-info' };
  let toastBox;
  function toast(message, o = {}) {
    const { type = 'info', title, action, duration = type === 'error' ? 7000 : 4000 } = o;
    if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'toasts'; document.body.appendChild(toastBox); }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast-ic"><i class="fa-solid ${ICONS[type]}"></i></span>
      <div>${title ? `<b>${esc(title)}</b><p>${esc(message)}</p>` : `<b>${esc(message)}</b>`}${action ? `<a class="toast-act" href="${esc(action.href || '#')}" ${action.href && /^https?:/.test(action.href) ? 'target="_blank" rel="noopener"' : ''}>${esc(action.label)}</a>` : ''}</div>
      <button class="toast-x" type="button" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>
      <span class="toast-bar" style="animation-duration:${duration}ms"></span>`;
    const close = () => { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 220); };
    $('.toast-x', el).addEventListener('click', close);
    if (action && action.onClick) $('.toast-act', el).addEventListener('click', (e) => { e.preventDefault(); action.onClick(); close(); });
    toastBox.appendChild(el);
    while (toastBox.children.length > 4) toastBox.firstElementChild.remove();
    setTimeout(close, duration);
    return close;
  }
  window.GondoToast = toast;

  /* =====================================================================
     Busy buttons: spinner + label while an action runs
     ===================================================================== */
  function setBusy(btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.dataset.html = btn.innerHTML; btn.setAttribute('aria-busy', 'true'); btn.classList.add('is-loading'); btn.disabled = true;
      btn.innerHTML = `<span class="spin" aria-hidden="true"></span> ${esc(label || btn.dataset.busy || 'Working…')}`;
    } else {
      btn.removeAttribute('aria-busy'); btn.classList.remove('is-loading'); btn.disabled = false;
      if (btn.dataset.html) { btn.innerHTML = btn.dataset.html; delete btn.dataset.html; }
    }
  }
  async function flashDone(btn, text) {
    if (!btn) return;
    const html = btn.innerHTML; btn.classList.add('is-done'); btn.innerHTML = `<i class="fa-solid fa-check"></i> ${esc(text)}`;
    await delay(1600); btn.classList.remove('is-done'); btn.innerHTML = html;
  }

  /* =====================================================================
     Confirmation dialog for critical / destructive actions
     ===================================================================== */
  function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', icon = 'fa-trash-can' }) {
    if (typeof HTMLDialogElement === 'undefined') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'dlg'; dlg.setAttribute('aria-labelledby', 'dlg-t'); dlg.setAttribute('aria-describedby', 'dlg-d');
      dlg.innerHTML = `<div class="dlg-ic"><i class="fa-solid ${icon}"></i></div><h2 id="dlg-t">${esc(title)}</h2><p id="dlg-d">${esc(message)}</p>
        <div class="dlg-actions"><button class="btn btn-outline" type="button" data-no autofocus>${esc(cancelLabel)}</button><button class="btn btn-danger" type="button" data-yes>${esc(confirmLabel)}</button></div>`;
      let result = false;
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      $('[data-no]', dlg).addEventListener('click', () => dlg.close());
      $('[data-yes]', dlg).addEventListener('click', () => { result = true; dlg.close(); });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      document.body.appendChild(dlg); dlg.showModal();
    });
  }

  /* Press ripple on every button-like control */
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.btn, .chip, .compare-toggle');
    if (!t || t.disabled) return;
    const r = t.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
    const rp = document.createElement('span');
    rp.className = 'ripple'; rp.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    t.appendChild(rp); setTimeout(() => rp.remove(), 600);
  });

  /* =====================================================================
     Page progress bar (navigation + initial load)
     ===================================================================== */
  const bar = document.createElement('div'); bar.className = 'pbar'; document.body.appendChild(bar);
  let barT;
  function barStart() {
    clearTimeout(barT); bar.style.transition = 'none'; bar.style.opacity = 1; bar.style.width = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = 'width 7s cubic-bezier(.1,.7,.2,1)'; bar.style.width = '85%'; }));
  }
  function barDone() {
    bar.style.transition = 'width .25s ease'; bar.style.width = '100%';
    barT = setTimeout(() => { bar.style.transition = 'opacity .3s'; bar.style.opacity = 0; setTimeout(() => (bar.style.width = '0'), 320); }, 280);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.protocol !== location.protocol || a.origin !== location.origin) return;
    if (a.pathname === location.pathname && a.search === location.search) return;
    barStart();
  });
  window.addEventListener('pageshow', barDone);
  barStart(); window.addEventListener('load', barDone);

  /* =====================================================================
     Images: skeleton shimmer while loading, friendly fallback on error
     ===================================================================== */
  const FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#f1f2f7"/><g fill="none" stroke="#b6bacb" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M50 92l9-22c2-5 6-8 12-8h58c6 0 10 3 12 8l9 22"/><rect x="42" y="92" width="116" height="26" rx="8"/></g><circle cx="68" cy="106" r="6" fill="#b6bacb"/><circle cx="132" cy="106" r="6" fill="#b6bacb"/></svg>');
  function trackImg(img) {
    if (img.complete) { if (img.naturalWidth === 0 && img.getAttribute('src')) failImg(img); return; }
    img.classList.add('is-loading');
  }
  function failImg(img) {
    if (img.dataset.failed) return; img.dataset.failed = '1';
    img.classList.remove('is-loading'); img.classList.add('img-error'); img.src = FALLBACK; img.alt = img.alt || 'Photo unavailable';
  }
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.remove('is-loading'); }, true);
  document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') failImg(e.target); }, true);
  $$('img').forEach(trackImg);

  /* =====================================================================
     Global safety nets: offline / online + unexpected errors
     ===================================================================== */
  window.addEventListener('offline', () => toast('Some features and photos may not load until you reconnect.', { type: 'error', title: 'You are offline', duration: 6000 }));
  window.addEventListener('online', () => toast('Your connection is back.', { type: 'success', title: 'Back online' }));
  let lastErr = 0;
  window.addEventListener('error', () => { if (Date.now() - lastErr > 15000) { lastErr = Date.now(); toast('Please refresh the page. If it keeps happening, contact us on WhatsApp.', { type: 'error', title: 'Something went wrong' }); } });
  window.addEventListener('unhandledrejection', () => { if (Date.now() - lastErr > 15000) { lastErr = Date.now(); toast('Please try again in a moment.', { type: 'error', title: 'Something went wrong' }); } });

  /* ---------- Mobile nav ---------- */
  const menuBtn = $('.menu-toggle'), nav = $('.nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      document.body.classList.toggle('menu-open', open);
      menuBtn.setAttribute('aria-expanded', open);
      menuBtn.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    });
  }

  if (menuBtn && nav) {
    const closeMenu = () => { if (nav.classList.contains('open')) { nav.classList.remove('open'); document.body.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.querySelector('i').className = 'fa-solid fa-bars'; } };
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); menuBtn.focus(); } });
    document.addEventListener('click', (e) => { if (!e.target.closest('.nav, .menu-toggle')) closeMenu(); });
  }
  // "Back" returns to the exact previous list (filters + scroll kept) when it came from the site, else goes to the fallback link
  $$('[data-back]').forEach((a) => a.addEventListener('click', (e) => {
    try { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { e.preventDefault(); history.back(); } } catch { /* follow the link */ }
  }));

  /* =====================================================================
     Flagship shell: condensing header, scroll reveals, count-up numerals, hero search
     ===================================================================== */
  document.documentElement.classList.add('js');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hdr = $('[data-header]');
  const onScroll = () => { if (hdr) hdr.classList.toggle('is-stuck', window.scrollY > 56); document.body.classList.toggle('scrolled', window.scrollY > 320); };
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  function countUp(el) {
    const to = +el.dataset.count;
    if (reduceMotion || !to) { el.textContent = nf.format(to); return; }
    const t0 = performance.now(), dur = 1500;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = nf.format(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const watched = $$('.reveal, [data-reveal], [data-count]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in'); if (e.target.dataset.count) countUp(e.target); io.unobserve(e.target);
    }), { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    watched.forEach((el) => io.observe(el));
  } else watched.forEach((el) => el.classList.add('in'));

  // Hero search: one pill that opens into the filter row (a bottom sheet on phones), with a live result count.
  const hs = $('[data-hsearch]');
  if (hs) {
    const pill = $('.hsearch-pill', hs), hform = $('.hsearch-form', hs), out = $('[data-hs-count]', hs);
    hs.dataset.ready = '1';
    const count = () => {
      const f = Object.fromEntries(new FormData(hform));
      const n = CARS.filter((c) => (!f.make || c.make === f.make) && (!f.body || c.body === f.body) && (!f.maxPrice || (c.price && c.price <= +f.maxPrice)) && (!f.yearFrom || c.year >= +f.yearFrom)).length;
      out.textContent = n === 1 ? 'Search 1 vehicle' : `Search ${nf.format(n)} vehicles`;
    };
    const setOpen = (on) => {
      hs.classList.toggle('open', on); pill.setAttribute('aria-expanded', on);
      document.body.classList.toggle('sheet-open', on && matchMedia('(max-width: 760px)').matches);
      if (on) { count(); hform.elements.make.focus({ preventScroll: true }); } else pill.focus({ preventScroll: true });
    };
    pill.addEventListener('click', () => setOpen(!hs.classList.contains('open')));
    $$('[data-hs-close]', hs).forEach((b) => b.addEventListener('click', () => setOpen(false)));
    hform.addEventListener('change', count);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hs.classList.contains('open')) setOpen(false); });
    if (CARS.length) count();
  }

  /* ---------- Hero slider ---------- */
  const slides = $$('.hero-slide');
  if (slides.length > 1) {
    const dots = $$('.hero-dots button');
    let i = 0, timer;
    const go = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('on', k === i));
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
    };
    const start = () => { clearInterval(timer); timer = setInterval(() => go(i + 1), 5500); };
    dots.forEach((d, k) => d.addEventListener('click', () => { go(k); start(); }));
    start();
  }

  /* =====================================================================
     Compare store + tray
     ===================================================================== */
  const KEY = 'gondo.compare', MAX = 3;
  let storageWarned = false;
  const store = {
    get() { try { return (JSON.parse(localStorage.getItem(KEY)) || []).filter((id) => byId.has(id)).slice(0, MAX); } catch { return this._mem || []; } },
    set(ids) {
      this._mem = ids;
      try { localStorage.setItem(KEY, JSON.stringify(ids)); }
      catch { if (!storageWarned) { storageWarned = true; toast('Your compare list works on this page but won’t be remembered (private mode or blocked storage).', { type: 'warn', title: 'Can’t save your list' }); } }
      sync();
    },
    toggle(id) {
      const ids = this.get(), car = byId.get(id);
      if (ids.includes(id)) { this.remove(id); return; }
      if (ids.length >= MAX) { toast(`You can compare up to ${MAX} vehicles. Remove one to add another.`, { type: 'error', title: 'Compare list is full', action: { label: 'Open compare', href: `${ROOT}compare.html?ids=${ids.join(',')}` } }); return; }
      this.set([...ids, id]);
      toast(`${car.name} · ${ids.length + 1} of ${MAX} selected`, { type: 'success', title: 'Added to compare', duration: 2600, ...(ids.length + 1 >= 2 ? { action: { label: 'Compare now →', href: `${ROOT}compare.html?ids=${[...ids, id].join(',')}` } } : {}) });
    },
    remove(id) {
      const prev = this.get(), car = byId.get(id);
      this.set(prev.filter((x) => x !== id));
      toast(`${car.name} removed`, { type: 'info', duration: 5000, action: { label: 'Undo', onClick: () => this.set(prev) } });
    },
    clear() { this.set([]); },
  };
  window.addEventListener('storage', (e) => { if (e.key === KEY) sync(); });
  async function clearCompare() {
    const prev = store.get(); if (!prev.length) return;
    const ok = await confirmDialog({ title: 'Clear your compare list?', message: `This removes ${prev.length} vehicle${prev.length > 1 ? 's' : ''} from the comparison. You can undo straight afterwards.`, confirmLabel: 'Clear list', icon: 'fa-scale-balanced' });
    if (!ok) return;
    store.clear(); toast('Compare list cleared', { type: 'info', duration: 5000, action: { label: 'Undo', onClick: () => store.set(prev) } });
  }

  let tray;
  const isComparePage = document.body.dataset.page === 'compare';
  function buildTray() {
    tray = document.createElement('div');
    tray.className = 'tray'; tray.setAttribute('aria-live', 'polite');
    document.body.appendChild(tray);
    tray.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-tray-remove]');
      if (rm) store.remove(+rm.dataset.trayRemove);
      if (e.target.closest('[data-tray-clear]')) clearCompare();
    });
  }
  function sync() {
    const ids = store.get();
    $$('[data-compare-count]').forEach((el) => { el.textContent = ids.length; el.dataset.n = ids.length; });
    $$('[data-compare-toggle]').forEach((b) => {
      const on = ids.includes(+b.dataset.compareToggle);
      b.setAttribute('aria-pressed', on);
      const label = b.querySelector('.lbl'); if (label) label.textContent = on ? 'Added' : 'Compare';
    });
    if (!tray || isComparePage) return;
    const slots = ids.map((id) => { const c = byId.get(id); return `<div class="tray-item" title="${esc(c.name)}"><img src="${thumb(c)}" alt="${esc(c.name)}"><button type="button" data-tray-remove="${id}" aria-label="Remove ${esc(c.name)}"><i class="fa-solid fa-xmark"></i></button></div>`; });
    while (slots.length < MAX) slots.push('<div class="tray-empty"></div>');
    tray.innerHTML = `<div class="tray-label"><b>Compare</b>${ids.length} of ${MAX} selected<div class="tray-meter" aria-hidden="true">${[0, 1, 2].map((k) => `<i class="${k < ids.length ? 'on' : ''}"></i>`).join('')}</div></div><div class="tray-items">${slots.join('')}</div>
      <button class="tray-clear" type="button" data-tray-clear>Clear</button>
      <a class="btn btn-primary btn-sm" href="${ROOT}compare.html?ids=${ids.join(',')}" ${ids.length < 2 ? 'aria-disabled="true" title="Pick at least 2 vehicles" style="opacity:.45;pointer-events:none"' : ''}>Compare <i class="fa-solid fa-arrow-right"></i></a>`;
    tray.classList.toggle('show', ids.length > 0);
    document.body.classList.toggle('has-tray', ids.length > 0);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-compare-toggle]');
    if (!t) return;
    e.preventDefault();
    t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse');
    store.toggle(+t.dataset.compareToggle);
  });
  if (!isComparePage) buildTray();
  sync();

  /* =====================================================================
     Catalog filters
     ===================================================================== */
  const catalog = $('#results');
  if (catalog) {
    const form = $('#filter-form'), cards = $$('.vcard', catalog), PAGE = 12;
    let shown = PAGE;
    const q = new URLSearchParams(location.search);
    for (const [k, v] of q) { const f = form.elements[k]; if (f && v) f[f.type === 'checkbox' ? 'checked' : 'value'] = f.type === 'checkbox' ? true : v; }
    const sorters = {
      newest: (a, b) => b.id - a.id,
      'price-asc': (a, b) => (a.price || 1e15) - (b.price || 1e15),
      'price-desc': (a, b) => (b.price || -1) - (a.price || -1),
      'year-desc': (a, b) => b.year - a.year,
      'mileage-asc': (a, b) => (a.mileage || 1e12) - (b.mileage || 1e12),
    };
    const info = cards.map((el) => ({ el, id: +el.dataset.id, make: el.dataset.make, body: el.dataset.body, year: +el.dataset.year || 0, mileage: +el.dataset.mileage || 0, price: +el.dataset.price || 0, colour: el.dataset.colour, status: el.dataset.status, text: el.dataset.search }));
    const grid = $('.grid-cars', catalog);
    function apply(resetPage) {
      if (resetPage) shown = PAGE;
      const f = Object.fromEntries(new FormData(form));
      const term = (f.q || '').toLowerCase().trim();
      const list = info.filter((c) =>
        (!term || c.text.includes(term)) && (!f.make || c.make === f.make) && (!f.body || c.body === f.body) &&
        (!f.colour || c.colour === f.colour) && (!f.yearFrom || c.year >= +f.yearFrom) &&
        (!f.maxMileage || (c.mileage && c.mileage <= +f.maxMileage)) &&
        (!f.maxPrice || (c.price && c.price <= +f.maxPrice)) &&
        (!form.elements.priced.checked || c.price) && (!form.elements.available.checked || c.status === 'available'));
      list.sort(sorters[f.sort || 'newest']);
      info.forEach((c) => (c.el.hidden = true));
      list.forEach((c, i) => { grid.appendChild(c.el); c.el.hidden = i >= shown; });
      const visible = Math.min(shown, list.length);
      $('#count').textContent = list.length;
      $('#empty').hidden = list.length > 0;
      $('#more').hidden = list.length <= shown;
      const pw = $('.progress-wrap'); pw.hidden = list.length === 0;
      const pct = list.length ? Math.round((visible / list.length) * 100) : 0;
      $('#progress-bar').style.width = pct + '%'; $('#progress').setAttribute('aria-valuenow', pct);
      $('#progress-text').textContent = `Showing ${visible} of ${list.length} vehicles`;
      const n = ['q', 'make', 'body', 'colour', 'yearFrom', 'maxMileage', 'maxPrice'].filter((k) => f[k]).length + (form.elements.priced.checked ? 1 : 0) + (form.elements.available.checked ? 1 : 0);
      const badge = $('#filter-n'); if (badge) badge.textContent = n ? `(${n})` : '';
      $$('.chip[data-make]').forEach((ch) => ch.classList.toggle('active', ch.dataset.make === (f.make || '')));
      return list.length;
    }
    let dimT;
    const applyWithFeedback = () => { grid.classList.add('results-dim'); clearTimeout(dimT); dimT = setTimeout(() => { apply(true); grid.classList.remove('results-dim'); }, 140); };
    form.addEventListener('input', applyWithFeedback);
    form.addEventListener('submit', (e) => e.preventDefault());
    $('#sort').addEventListener('change', () => { form.elements.sort.value = $('#sort').value; applyWithFeedback(); });
    $('#more').addEventListener('click', async (e) => {
      const btn = e.currentTarget; setBusy(btn, true); await delay(380); shown += PAGE; apply(false); setBusy(btn, false);
      const first = info.filter((c) => !c.el.hidden)[shown - PAGE]; if (first) first.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    $$('[data-reset]').forEach((b) => b.addEventListener('click', () => { form.reset(); $('#sort').value = 'newest'; apply(true); toast('Filters cleared', { type: 'success', duration: 1800 }); }));
    $$('.chip[data-make]').forEach((ch) => ch.addEventListener('click', () => { form.elements.make.value = ch.dataset.make; applyWithFeedback(); }));
    const panel = $('.filters');
    $$('[data-filters-open]').forEach((b) => b.addEventListener('click', () => panel.classList.add('open')));
    $$('[data-filters-close]').forEach((b) => b.addEventListener('click', () => panel.classList.remove('open')));
    apply(true);
  }

  /* =====================================================================
     Gallery + lightbox (car detail)
     ===================================================================== */
  const gal = $('#gallery');
  if (gal) {
    const imgs = JSON.parse($('#gallery-data').textContent);
    const mainBox = $('#gallery-main'), main = $('#gallery-img'), thumbs = $$('#thumbs button'), count = $('#gallery-count');
    const lb = $('#lightbox'), lbImg = $('#lb-img'), lbCount = $('#lb-count');
    let i = 0;
    const show = (n) => {
      i = (n + imgs.length) % imgs.length;
      mainBox.classList.add('loading');
      const next = new Image();
      next.onload = () => { main.src = next.src; main.alt = imgs[i].alt; mainBox.classList.remove('loading'); if (lb.classList.contains('open')) lbImg.src = main.src; };
      next.onerror = () => { mainBox.classList.remove('loading'); toast('Please check your connection and try again.', { type: 'error', title: 'Couldn’t load that photo' }); };
      next.src = imgs[i].full;
      thumbs.forEach((t, k) => t.classList.toggle('on', k === i));
      if (thumbs[i]) thumbs[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      count.textContent = `${i + 1} / ${imgs.length}`; lbCount.textContent = `${i + 1} / ${imgs.length}`;
    };
    const open = () => { lb.classList.add('open'); lbImg.src = main.src; document.body.style.overflow = 'hidden'; lbCount.textContent = `${i + 1} / ${imgs.length}`; };
    const close = () => { lb.classList.remove('open'); document.body.style.overflow = ''; };
    thumbs.forEach((t, k) => t.addEventListener('click', () => show(k)));
    $$('[data-g-prev]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); show(i - 1); }));
    $$('[data-g-next]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); show(i + 1); }));
    mainBox.addEventListener('click', open);
    $('#lb-close').addEventListener('click', close);
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    });
    let sx = 0;
    mainBox.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
    mainBox.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); });
  }

  /* =====================================================================
     Compare page
     ===================================================================== */
  const root = $('#compare-root');
  if (root) {
    const wanted = (new URLSearchParams(location.search).get('ids') || '').split(',').filter(Boolean).map(Number);
    const urlIds = wanted.filter((id) => byId.has(id)).slice(0, MAX);
    if (wanted.length && urlIds.length < wanted.length) toast('Some vehicles in this link are no longer listed, so they were skipped.', { type: 'warn', title: 'Link partly out of date' });
    if (urlIds.length) store.set(urlIds);
    const best = (vals, pick) => { const v = vals.filter((x) => x != null); if (v.length < 2) return null; const t = pick(...v); return vals.map((x) => x === t && v.filter((y) => y === t).length === 1); };
    function render() {
      const ids = store.get(), cars = ids.map((id) => byId.get(id));
      const free = CARS.filter((c) => !ids.includes(c.id));
      const addSlot = ids.length < MAX ? `<div class="cmp-add"><div><i class="fa-solid fa-plus"></i>Add a vehicle<select class="select" id="cmp-pick" aria-label="Add a vehicle to compare"><option value="">Choose…</option>${free.map((c) => `<option value="${c.id}">${esc(c.name)} · ${c.year || ''}${c.price ? ' · ' + fmtTzs(c.price) : ''}</option>`).join('')}</select></div></div>` : '';
      if (!ids.length) {
        root.innerHTML = `<div class="empty"><i class="fa-solid fa-scale-balanced"></i><h3>Nothing to compare yet</h3><p>Pick up to ${MAX} vehicles to see price, year, mileage and more side by side.</p><div style="margin-top:20px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="cars.html">Browse vehicles</a></div><div class="cmp-add" style="max-width:340px;margin:28px auto 0;aspect-ratio:auto;padding:22px"><div>Or pick one here<select class="select" id="cmp-pick" aria-label="Add a vehicle to compare"><option value="">Choose…</option>${free.map((c) => `<option value="${c.id}">${esc(c.name)} · ${c.year || ''}</option>`).join('')}</select></div></div></div>`;
        bind(); return;
      }
      const price = cars.map((c) => c.price || null), year = cars.map((c) => c.year || null), km = cars.map((c) => c.mileage || null);
      const bP = best(price, Math.min), bY = best(year, Math.max), bM = best(km, Math.min);
      const row = (label, fn, flags) => `<tr><th scope="row">${label}</th>${cars.map((c, k) => `<td class="${flags && flags[k] ? 'best' : ''}">${fn(c) || '<span style="color:var(--muted);font-weight:500">—</span>'}</td>`).join('')}${ids.length < MAX ? '<td></td>' : ''}</tr>`;
      root.innerHTML = `
        <div class="cmp-legend"><i class="fa-solid fa-circle-check" style="color:var(--good)"></i> The best value in each row is highlighted.
          <span style="margin-left:auto;display:flex;gap:8px"><button class="btn btn-outline btn-sm" id="cmp-share"><i class="fa-solid fa-link"></i> Copy link</button>${ids.length >= 2 ? '<button class="btn btn-outline btn-sm" id="cmp-save"><i class="fa-regular fa-bookmark"></i> Save comparison</button>' : ''}<button class="btn btn-outline btn-sm" id="cmp-clear">Clear all</button></span></div>
        <div class="cmp-wrap"><table class="cmp">
          <thead><tr><th></th>${cars.map((c) => `<th scope="col"><div class="cmp-head"><button class="cmp-remove" data-rm="${c.id}" aria-label="Remove ${esc(c.name)}"><i class="fa-solid fa-xmark"></i></button><a href="${ROOT}car/${c.slug}.html"><img src="${thumb(c)}" alt="${esc(c.name)}"><div><b>${esc(c.name)}</b><small>${c.year || ''}${c.chassis ? ' · ' + esc(c.chassis) : ''}</small></div></a></div></th>`).join('')}${addSlot ? `<th>${addSlot}</th>` : ''}</tr></thead>
          <tbody>
            ${row('Price', (c) => (c.price ? fmtTzs(c.price) + `<br><small style="color:var(--muted);font-weight:500">≈ $${nf.format(c.usd)}</small>` : 'Price on request'), bP)}
            ${row('Year', (c) => c.year, bY)}
            ${row('Mileage', (c) => (c.mileage ? fmtKm(c.mileage) : ''), bM)}
            ${row('Body style', (c) => esc(c.body))}
            ${row('Make', (c) => esc(c.make))}
            ${row('Colour', (c) => (c.colour ? `<span class="swatch" style="background:${c.hex}"></span> ${esc(c.colour)}` : ''))}
            ${row('Chassis code', (c) => esc(c.chassis))}
            ${row('Auction house', (c) => esc(c.auction))}
            ${row('Availability', (c) => (c.status === 'available' ? '<span style="color:var(--good)">Available</span>' : STATUS[c.status] || ''))}
            <tr><th scope="row"></th>${cars.map((c) => `<td><a class="btn btn-outline btn-sm btn-block" href="${ROOT}car/${c.slug}.html">View details</a>${c.status === 'available' ? `<button class="cart-add" style="width:100%;justify-content:center;margin-top:8px" type="button" data-cart-add="${c.id}"><i class="fa-solid fa-cart-plus"></i><span class="lbl">Order</span></button>` : ''}</td>`).join('')}${ids.length < MAX ? '<td></td>' : ''}</tr>
          </tbody></table></div>`;
      $$('img', root).forEach(trackImg);
      bind(); document.dispatchEvent(new Event('gm:rendered'));
    }
    function bind() {
      const pick = $('#cmp-pick'); if (pick) pick.addEventListener('change', () => { if (pick.value) store.toggle(+pick.value); });
      $$('[data-rm]', root).forEach((b) => b.addEventListener('click', () => store.toggle(+b.dataset.rm)));
      const clr = $('#cmp-clear'); if (clr) clr.addEventListener('click', clearCompare);
      const sv = $('#cmp-save');
      if (sv) sv.addEventListener('click', async () => {
        const who = (await window.GondoApi.session()).user;
        if (!who) { location.assign(`${ROOT}login.html?next=${encodeURIComponent(`/compare.html?ids=${store.get().join(',')}`)}`); return; }
        if (who.role !== 'user') return toast('Saved comparisons are for customer accounts.', { type: 'info' });
        setBusy(sv, true, 'Saving…');
        let r; try { r = await window.GondoApi.send('/api/account/comparisons', { ids: store.get() }); } catch { r = { ok: false, body: {} }; }
        setBusy(sv, false);
        if (r.ok) toast(r.body.message, { type: 'success', title: 'Comparison saved', action: { label: 'View saved comparisons', href: `${ROOT}account/comparisons` } });
        else toast(r.body.error || 'Please try again.', { type: 'error', title: 'Couldn’t save the comparison' });
      });
      const sh = $('#cmp-share');
      if (sh) sh.addEventListener('click', async () => {
        const url = `${location.origin === 'null' ? '' : location.origin}${location.pathname}?ids=${store.get().join(',')}`;
        setBusy(sh, true, 'Copying…');
        try { await navigator.clipboard.writeText(url); toast('Anyone with the link can see this comparison.', { type: 'success', title: 'Link copied' }); }
        catch { toast(url, { type: 'error', title: 'Couldn’t copy automatically — copy it from here', duration: 10000 }); }
        setBusy(sh, false);
      });
    }
    const _set = store.set.bind(store); store.set = (ids) => { _set(ids); render(); };
    $$('.skel-cmp', root).forEach((s) => s.remove());
    render();
  }

  /* =====================================================================
     Forms: inline validation, busy state, success + error feedback
     ===================================================================== */
  const MESSAGES = {
    valueMissing: (l) => `${l} is required.`,
    typeMismatch: () => 'Enter a valid email address, like name@example.com.',
    patternMismatch: () => 'Enter a valid phone number, like +255 679 400 800.',
    tooShort: (l, el) => `${l} needs at least ${el.minLength} characters.`,
  };
  const labelOf = (el) => {
    const l = $(`label[for="${el.id}"]`); if (!l) return 'This field';
    const c = l.cloneNode(true); $$('.req, .opt', c).forEach((n) => n.remove()); return c.textContent.trim() || 'This field';
  };
  function fieldError(el, msg) {
    const wrap = el.closest('.field'); if (!wrap) return;
    let p = $('.field-error', wrap);
    wrap.classList.toggle('invalid', !!msg); wrap.classList.toggle('valid', !msg && !!el.value);
    el.setAttribute('aria-invalid', !!msg);
    if (!msg) { if (p) p.remove(); el.removeAttribute('aria-describedby'); return; }
    if (!p) { p = document.createElement('p'); p.className = 'field-error'; p.id = `${el.id}-err`; wrap.appendChild(p); }
    p.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${esc(msg)}`; el.setAttribute('aria-describedby', p.id);
  }
  function check(el) {
    if (el.value && !['password', 'file', 'checkbox', 'radio', 'color', 'date', 'number', 'hidden'].includes(el.type)) el.value = el.value.trim();
    const v = el.validity; let msg = '';
    if (el.value && el.minLength > 0 && el.value.length < el.minLength) msg = MESSAGES.tooShort(labelOf(el), el);
    else if (!v.valid) { const k = ['valueMissing', 'typeMismatch', 'patternMismatch', 'tooShort'].find((x) => v[x]); msg = k ? MESSAGES[k](labelOf(el), el) : 'Please check this field.'; }
    fieldError(el, msg); return !msg;
  }
  function summary(form, bad) {
    const box = $('.form-summary', form); if (!box) return;
    if (!bad.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `<b><i class="fa-solid fa-circle-exclamation"></i> ${bad.length === 1 ? '1 field needs' : bad.length + ' fields need'} your attention</b><ul>${bad.map((el) => `<li><button type="button" data-goto="${el.id}">${esc(($('.field-error', el.closest('.field')) || { textContent: labelOf(el) }).textContent.trim())}</button></li>`).join('')}</ul>`;
    $$('[data-goto]', box).forEach((b) => b.addEventListener('click', () => { const t = document.getElementById(b.dataset.goto); t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.focus({ preventScroll: true }); }));
  }
  function validate(form) {
    const bad = $$('input, textarea, select', form).filter((el) => !el.disabled && !check(el));
    summary(form, bad);
    if (bad.length) { bad[0].focus(); toast(bad.length === 1 ? 'Please fix the highlighted field and try again.' : `Please fix the ${bad.length} highlighted fields and try again.`, { type: 'error', title: 'Some details need attention' }); }
    return !bad.length;
  }
  $$('form[novalidate]').forEach((form) => {
    form.addEventListener('focusout', (e) => { if (e.target.matches('input, textarea') && (e.target.value || e.target.closest('.field').classList.contains('invalid'))) check(e.target); });
    form.addEventListener('input', (e) => { if (e.target.closest('.field.invalid')) check(e.target); });
  });

  const cf = $('#contact-form');
  if (cf) cf.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (cf.dataset.submitting) return;               // ignore repeat clicks / Enter while sending
    if (!validate(cf)) return;
    cf.dataset.submitting = '1';
    const btn = $('button[type=submit]', cf), d = Object.fromEntries(new FormData(cf));
    setBusy(btn, true);
    if (online) { try { await api('/api/enquiries', { ...d, type: 'contact' }); } catch { /* WhatsApp still carries the message */ } } else await delay(600);
    const text = `Hello Gondo Motors, I'm ${d.name}.${d.phone ? ' Phone: ' + d.phone + '.' : ''}${d.email ? ' Email: ' + d.email + '.' : ''}\n\n${d.message}`;
    const link = `https://wa.me/${cf.dataset.wa}?text=${encodeURIComponent(text)}`;
    let win = null; try { win = window.open(link, '_blank', 'noopener'); } catch { /* blocked */ }
    setBusy(btn, false); delete cf.dataset.submitting;
    if (win === null && !navigator.userAgent.includes('Firefox')) {
      toast('Your browser blocked the WhatsApp window. Tap below to open it.', { type: 'error', title: 'Pop-up blocked', action: { label: 'Open WhatsApp', href: link }, duration: 12000 });
      return;
    }
    toast('Press “Send” in WhatsApp to reach our team. We usually reply within a few hours.', { type: 'success', title: 'Message ready in WhatsApp' });
    cf.reset(); $$('.field', cf).forEach((f) => f.classList.remove('valid', 'invalid')); summary(cf, []); cf.dataset.clean = '1'; updateCounter(cf);
    flashDone(btn, 'Opened in WhatsApp');
  });

  /* =====================================================================
     Accounts: session bootstrap (CSRF token + signed-in header) and auth forms
     ===================================================================== */
  const online = location.protocol.startsWith('http');
  let sessionP;
  const getSession = (fresh) => {
    if (fresh || !sessionP) sessionP = fetch('/api/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('session')))).catch(() => ({ csrf: '', user: null }));
    return sessionP;
  };
  async function api(path, data, method = 'POST') {
    const { csrf } = await getSession();
    const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(data || {}) });
    let body = {}; try { body = await res.json(); } catch { /* non-JSON error page */ }
    return { ok: res.ok, status: res.status, body };
  }
  window.GondoApi = { post: api, send: api, session: getSession };
  window.GondoUI = { toast, confirmDialog, setBusy, flashDone, validate, fieldError, summary, esc, fmtTzs };
  if (online) getSession().then(({ user }) => {
    if (!user) return;
    const label = user.role === 'admin' ? 'Admin panel' : 'My account';
    const act = $('.header-actions');
    if (act) { $$('a[href$="login.html"], a[href$="signup.html"]', act).forEach((a) => a.remove()); act.insertAdjacentHTML('beforeend', `<a class="btn btn-dark btn-arrow btn-sm hide-nav" href="${esc(user.panel)}">${label}<span class="arw" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span></a>`); }
    const extra = $('.nav-extra');
    if (extra) { $$('a[href$="login.html"], a[href$="signup.html"]', extra).forEach((a) => a.remove()); extra.insertAdjacentHTML('beforeend', `<a class="btn btn-dark" href="${esc(user.panel)}">${label}</a><a href="#" data-logout>Log out</a>`); }
    $$('.footer a[href$="login.html"]').forEach((a) => { a.textContent = label; a.href = user.panel; });
  });
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-logout]')) return;
    e.preventDefault(); await api('/api/auth/logout'); location.assign(ROOT + 'index.html');
  });

  /* =====================================================================
     Order list: add from listing, car and compare pages (guests are sent to log in and brought back)
     ===================================================================== */
  let cart = [], who = null;
  function syncCart() {
    $$('[data-cart-add]').forEach((b) => {
      const inCart = cart.includes(+b.dataset.cartAdd), lbl = $('.lbl', b), big = b.hasAttribute('data-cart-big');
      b.classList.toggle(big ? 'in-cart' : 'in', inCart);
      if (lbl) lbl.textContent = inCart ? (big ? 'In your order list — view' : 'Added') : (big ? 'Add to order list' : 'Order');
      const ic = $('i', b); if (ic) ic.className = `fa-solid ${inCart ? 'fa-check' : 'fa-cart-plus'}`;
    });
    $$('[data-cart-link]').forEach((a) => { a.hidden = !(who && who.role === 'user'); });
    $$('[data-cart-count]').forEach((el) => { el.textContent = cart.length; el.dataset.n = cart.length; });
  }
  if (online) getSession().then((s) => { who = s.user; cart = s.cart || []; syncCart(); });
  document.addEventListener('gm:rendered', syncCart);
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cart-add]'); if (!b) return;
    e.preventDefault();
    const id = +b.dataset.cartAdd;
    if (!online) return toast('Ordering works on the live website.', { type: 'info' });
    const s = await getSession(); who = s.user;
    if (!who) {                                   // guest: remember the car, log in, come back to the order list
      try { sessionStorage.setItem('gm.pendingCart', String(id)); } catch { /* they can add it again after logging in */ }
      location.assign(`${ROOT}login.html?next=${encodeURIComponent('/account/order-list')}`); return;
    }
    if (who.role !== 'user') return toast('Order lists are for customer accounts. Use “New manual sale” in the admin panel to record a sale.', { type: 'info', title: 'You are signed in as admin' });
    if (cart.includes(id)) { location.assign(`${ROOT}account/order-list`); return; }
    b.disabled = true;
    let r; try { r = await api('/api/account/cart', { vehicleId: id }); } catch { r = { ok: false, body: {} }; }
    b.disabled = false;
    if (!r.ok) return toast(r.body.error || 'Please check your connection and try again.', { type: 'error', title: 'Couldn’t add that vehicle' });
    cart = r.body.cart; syncCart();
    toast(r.body.message, { type: 'success', title: 'Added to your order list', action: { label: 'Review and order →', href: `${ROOT}account/order-list` } });
  });

  /* ---------- Saved cars (heart on the vehicle page) ---------- */
  let saved = [];
  const syncSaved = () => $$('[data-save]').forEach((b) => {
    const on = saved.includes(+b.dataset.save); b.setAttribute('aria-pressed', on);
    $('i', b).className = `fa-${on ? 'solid' : 'regular'} fa-heart`; $('.lbl', b).textContent = on ? 'Saved' : 'Save';
  });
  if (online) getSession().then((s) => { saved = s.saved || []; syncSaved(); });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save]'); if (!b) return;
    const id = +b.dataset.save, s = await getSession();
    if (!s.user) { location.assign(`${ROOT}login.html?next=${encodeURIComponent(location.pathname)}`); return; }
    if (s.user.role !== 'user') return toast('Saved cars are for customer accounts.', { type: 'info' });
    const on = saved.includes(id);
    let r; try { r = on ? await api(`/api/account/saved/${id}`, null, 'DELETE') : await api('/api/account/saved', { vehicleId: id }); } catch { r = { ok: false, body: {} }; }
    if (!r.ok) return toast(r.body.error || 'Please try again.', { type: 'error', title: 'Couldn’t update your saved cars' });
    saved = r.body.saved; syncSaved();
    toast(r.body.message, { type: 'success', duration: 2600, ...(on ? {} : { action: { label: 'View saved cars', href: `${ROOT}account/saved` } }) });
  });

  /* ---------- "Ask us to find your car" ---------- */
  const ff = $('#find-form');
  if (ff) {
    const budget = ff.elements.budget_tzs;
    budget.addEventListener('input', () => { const d = budget.value.replace(/[^\d]/g, ''); budget.value = d ? nf.format(+d) : ''; });
    ff.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (ff.dataset.submitting || !validate(ff)) return;
      ff.dataset.submitting = '1';
      const btn = $('button[type=submit]', ff); setBusy(btn, true);
      let r; try { r = await api('/api/enquiries', { ...Object.fromEntries(new FormData(ff)), type: 'car_request' }); } catch { r = { ok: false, body: {} }; }
      setBusy(btn, false); delete ff.dataset.submitting;
      if (r.ok) {
        const done = $('[data-find-done]', ff); done.hidden = false; done.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${esc(r.body.message)}</span>`;
        ff.reset(); $$('.field', ff).forEach((x) => x.classList.remove('valid', 'invalid')); summary(ff, []); done.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const bad = [];
      Object.entries(r.body.fields || {}).forEach(([name, msg]) => { const el = ff.elements[name]; if (el) { fieldError(el, msg); bad.push(el); } });
      summary(ff, bad); if (bad.length) bad[0].focus();
      toast(r.body.error || 'Please check your connection and try again.', { type: 'error', title: 'Request not sent' });
    });
  }

  const AUTH_PATH = { login: 'login', signup: 'signup', forgot: 'forgot', reset: 'reset', 'change-password': 'change-password' };
  $$('[data-auth-form]').forEach((f) => {
    const kind = f.dataset.authForm, params = new URLSearchParams(location.search);
    if (kind === 'login' && params.get('reset')) toast('Log in with your new password.', { type: 'success', title: 'Password updated' });
    // Already signed in: say so, and make clear that logging in here switches account.
    if (kind === 'login') getSession().then(({ user }) => {
      if (!user) return;
      const note = document.createElement('div'); note.className = 'form-banner'; note.style.cssText = 'background:var(--navy-soft);color:var(--navy)';
      note.innerHTML = `<i class="fa-solid fa-circle-info"></i><span>You are signed in as <b>${esc(user.name)}</b> (${user.role === 'admin' ? 'admin' : 'customer'}). <a href="${esc(user.panel)}" style="text-decoration:underline;font-weight:600">Go to your panel</a>, or log in below to switch to another account.</span>`;
      $('h1', f).insertAdjacentElement('afterend', note);
    });
    // keep the return address (e.g. the order list) when switching between log in and sign up
    if (params.get('next')) $$('.foot a', f).forEach((a) => { a.href += `?next=${encodeURIComponent(params.get('next'))}`; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.dataset.submitting) return;
      if (!validate(f)) return;
      f.dataset.submitting = '1';
      const btn = $('button[type=submit]', f); setBusy(btn, true);
      const data = Object.fromEntries(new FormData(f));
      if (params.get('next')) data.next = params.get('next');
      if (kind === 'reset') data.token = params.get('token') || '';
      let r;
      try { r = await api(`/api/auth/${AUTH_PATH[kind]}`, data); }
      catch { r = { ok: false, body: { error: 'We couldn’t reach the server. Check your connection and try again.' } }; }
      if (r.ok && r.body.redirect) { location.assign(r.body.redirect); return; }   // stay busy while the next page loads
      setBusy(btn, false); delete f.dataset.submitting;
      if (r.ok) {
        const done = $('[data-auth-done]', f);
        done.hidden = false; done.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${esc(r.body.message || 'Done.')}</span>`;
        f.reset(); $$('.field', f).forEach((x) => x.classList.remove('valid', 'invalid')); summary(f, []);
        return;
      }
      if (r.status === 403 && !r.body.fields) getSession(true);                    // stale CSRF token: fetch a new one for the retry
      const bad = [];
      Object.entries(r.body.fields || {}).forEach(([name, msg]) => { const el = f.elements[name]; if (el) { fieldError(el, msg); bad.push(el); } });
      summary(f, bad);
      if (bad.length) bad[0].focus();
      toast(r.body.error || 'Please try again in a moment.', { type: 'error', title: kind === 'login' ? 'Couldn’t log you in' : 'Something needs attention' });
    });
  });

  /* ---------- Form helpers: live counter, password toggle + strength, unsaved-changes guard ---------- */
  function updateCounter(form) {
    const hint = $('[data-counter]', form); if (!hint) return;
    const area = hint.previousElementSibling, min = +hint.dataset.counter, n = area.value.trim().length;
    hint.textContent = n >= min ? `${n} / ${area.maxLength} characters` : `${n} / at least ${min} characters`;
    hint.classList.toggle('ok', n >= min); hint.classList.toggle('warn', n > 0 && n < min);
  }
  $$('form[data-guard]').forEach((form) => {
    form.addEventListener('input', () => { delete form.dataset.clean; updateCounter(form); });
  });
  $$('.pw-toggle').forEach((b) => b.addEventListener('click', () => {
    const inp = b.previousElementSibling, show = inp.type === 'password';
    inp.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', show); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    b.querySelector('i').className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  }));
  const meter = $('[data-strength]');
  if (meter) {
    const pw = $('#a-pass'), txt = $('[data-strength-text]');
    const LABELS = ['Use 8+ characters with letters and numbers. Add symbols for a stronger password.', 'Weak — add more characters, numbers or symbols.', 'Fair — a few more characters or a symbol will make it stronger.', 'Strong password.'];
    pw.addEventListener('input', () => {
      const v = pw.value; let lvl = 0;
      if (v.length) { lvl = 1; if (v.length >= 8 && /\d/.test(v) && /[a-zA-Z]/.test(v)) lvl = 2; if (v.length >= 10 && /[^a-zA-Z0-9]/.test(v) && /\d/.test(v)) lvl = 3; }
      meter.dataset.level = lvl; txt.textContent = LABELS[lvl]; txt.classList.toggle('ok', lvl === 3); txt.classList.toggle('warn', lvl === 1);
    });
  }
  // Warn before leaving a form with typed-in but unsent content (accidental data loss)
  window.addEventListener('beforeunload', (e) => {
    const dirty = $$('form[data-guard]').some((f) => !f.dataset.clean && !f.dataset.submitting && $$('input:not([type=password]), textarea', f).some((el) => el.value.trim()));
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();

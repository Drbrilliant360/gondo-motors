/* Gondo Motors — panel shell behaviour: mobile drawer, profile menu, tabs */
(function () {
  'use strict';
  const body = document.body;
  const menuBtn = document.querySelector('.top-menu');
  const setDrawer = (open) => { body.classList.toggle('side-open', open); if (menuBtn) menuBtn.setAttribute('aria-expanded', open); };
  if (menuBtn) menuBtn.addEventListener('click', () => setDrawer(!body.classList.contains('side-open')));
  document.addEventListener('click', (e) => {
    if (e.target.closest('.side-backdrop') || e.target.closest('.side-nav a')) setDrawer(false);
    document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (body.classList.contains('side-open')) { setDrawer(false); if (menuBtn) menuBtn.focus(); }
    document.querySelectorAll('details.menu[open]').forEach((d) => { d.open = false; });
  });

  // Tabs: <div class="tabs" role="tablist"><button role="tab" aria-controls="id">…  +  <div role="tabpanel" id="id">
  document.querySelectorAll('[role="tablist"]').forEach((list) => {
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    const select = (tab) => tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls')); if (p) p.hidden = !on;
    });
    list.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) select(t); });
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement); if (i < 0) return;
      const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1; if (n < 0) return;
      const t = tabs[(n + tabs.length) % tabs.length]; t.focus(); select(t);
    });
  });
})();

/* =====================================================================
   Data screens (both panels): dialogs, API forms, action buttons, money inputs, deep-linked tabs.
   Markup contract:
     <button data-open="#dialog-id" [data-set-action="POST /api/…"] [data-set-text="…"] [data-tab="payments"]>
     <form data-api="POST /api/…" [data-dialog] [data-confirm="Title|Message|Button label"]>
     <button data-action="DELETE /api/…" [data-confirm-title data-confirm-message data-confirm-label data-confirm-icon]>
     <input data-money>          thousands separators while typing
     <div role="tablist" data-tabs-hash>   tab kept in the URL (#payments) so reloads return to it
   ===================================================================== */
(function () {
  'use strict';
  if (!window.GondoUI) return;
  const { toast, confirmDialog, setBusy, validate, fieldError, summary } = window.GondoUI;
  const send = window.GondoApi.send;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const nf = new Intl.NumberFormat('en-US');
  const call = async (spec, data) => { const [method, ...path] = spec.split(' '); try { return await send(path.join(' '), data, method); } catch { return { ok: false, body: {} }; } };
  const oops = (r, title = 'That didn’t work') => toast((r.body && r.body.error) || 'Please check your connection and try again.', { type: 'error', title });
  const reloadWith = (message) => { try { if (message) sessionStorage.setItem('gm.flash', message); } catch { /* toast is skipped if storage is blocked */ } location.reload(); };
  try { const m = sessionStorage.getItem('gm.flash'); if (m) { sessionStorage.removeItem('gm.flash'); toast(m, { type: 'success' }); } } catch { /* ignore */ }

  /* tabs kept in the URL */
  const selectTab = (name) => { const t = document.getElementById(`t-${name}`); if (t) t.click(); return !!t; };
  $$('[data-tabs-hash]').forEach((list) => {
    const tabs = $$('[role="tab"]', list);
    list.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) history.replaceState(null, '', `#${t.id.slice(2)}`); });
    if (!selectTab(location.hash.slice(1)) && tabs[0]) { tabs[0].click(); history.replaceState(null, '', location.pathname + location.search); }
  });

  /* money inputs */
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-money]')) return;
    const digits = e.target.value.replace(/[^\d]/g, ''); e.target.value = digits ? nf.format(+digits) : '';
  });

  /* dialogs */
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) {
      const dlg = $(opener.dataset.open); if (!dlg) return;
      if (opener.dataset.tab) selectTab(opener.dataset.tab);
      const form = $('form', dlg);
      if (opener.dataset.setAction) form.dataset.api = opener.dataset.setAction;
      if (opener.dataset.setText) $$('[data-text]', dlg).forEach((el) => (el.textContent = opener.dataset.setText));
      dlg.showModal();
      const first = $('input:not([type=hidden]):not([type=file]), select, textarea', dlg); if (first) first.focus();
      return;
    }
    const closer = e.target.closest('[data-close]'); if (closer) closer.closest('dialog').close();
    if (e.target.matches('dialog.dlg-form')) e.target.close();   // click on the backdrop
  });

  async function ask(spec) {
    const [title, message, label, icon] = spec;
    return confirmDialog({ title, message, confirmLabel: label || 'Confirm', icon: icon || 'fa-circle-question' });
  }
  // Server may answer 409 with a `confirm` block (overpayment, cancelling a paid order): ask, then resend with confirmed=1.
  async function submit(spec, data, { form, btn } = {}) {
    let r = await call(spec, data);
    if (!r.ok && r.status === 409 && r.body.confirm) {
      const c = r.body.confirm;
      const dlg = form && form.closest('dialog'); if (dlg) dlg.close();   // only one modal at a time
      if (!(await ask([c.title, c.message, c.label, 'fa-triangle-exclamation']))) { if (dlg) dlg.showModal(); return null; }
      r = await call(spec, { ...data, confirmed: '1' });
      if (!r.ok && dlg) dlg.showModal();
    }
    if (btn) setBusy(btn, false);
    return r;
  }

  /* API forms */
  $$('form[data-api]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.dataset.submitting || !validate(form)) return;
    const dlg = form.closest('dialog');
    if (form.dataset.confirm) {
      if (dlg) dlg.close();
      const yes = await ask(form.dataset.confirm.split('|'));
      if (dlg) dlg.showModal();
      if (!yes) return;
    }
    form.dataset.submitting = '1';
    const btn = $('button[type=submit]', form); setBusy(btn, true);
    const done = () => { setBusy(btn, false); delete form.dataset.submitting; };
    let data = Object.fromEntries(new FormData(form));
    $$('input[type=file]', form).forEach((f) => delete data[f.name]);
    try { if (form.gmBeforeSubmit) data = { ...data, ...(await form.gmBeforeSubmit()) }; }
    catch (err) { done(); toast(err.message || 'The file could not be uploaded.', { type: 'error', title: 'Upload failed' }); return; }
    const r = await submit(form.dataset.api, data, { form });
    if (!r) { done(); return; }
    if (r.ok) { if (r.body.redirect) { location.assign(r.body.redirect); return; } reloadWith(r.body.message); return; }
    done();
    const bad = [];
    Object.entries(r.body.fields || {}).forEach(([name, msg]) => { const el = form.elements[name] || $(`[data-field="${name}"]`, form); if (el && el.closest) { fieldError(el, msg); bad.push(el); } });
    summary(form, bad); if (bad.length) bad[0].focus();
    oops(r, 'Not saved');
  }));

  document.addEventListener('click', (e) => { if (e.target.closest('[data-print]')) window.print(); });

  /* one-click actions */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]'); if (!btn || btn.disabled) return;
    const d = btn.dataset;
    if (d.confirmTitle && !(await ask([d.confirmTitle, d.confirmMessage || '', d.confirmLabel, d.confirmIcon || 'fa-trash-can']))) return;
    btn.disabled = true;
    const r = await submit(d.action, {});
    btn.disabled = false;
    if (!r) return;
    if (r.ok) { if (r.body.redirect) { location.assign(r.body.redirect); return; } return reloadWith(r.body.message); }
    if (r.body.tab) selectTab(r.body.tab);
    oops(r);
  });
})();

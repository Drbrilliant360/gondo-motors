/* Gondo Motors — customer panel: order list and WhatsApp ordering */
(function () {
  'use strict';
  const { toast, confirmDialog, setBusy, validate, fieldError, summary } = window.GondoUI;
  const api = window.GondoApi.send;
  const $ = (s, el = document) => el.querySelector(s);
  const call = async (path, data, method) => { try { return await api(path, data, method); } catch { return { ok: false, body: {} }; } };
  const fail = (r, title = 'That didn’t work') => toast((r.body && r.body.error) || 'Please check your connection and try again.', { type: 'error', title });

  // A vehicle a guest tried to add before logging in is added now, then the list reloads once.
  let pending = null;
  try { pending = sessionStorage.getItem('gm.pendingCart'); sessionStorage.removeItem('gm.pendingCart'); } catch { /* ignore */ }
  if (pending && /^\d+$/.test(pending)) {
    call('/api/account/cart', { vehicleId: +pending }).then((r) => { if (r.ok) location.replace('/account/order-list'); else fail(r, 'Couldn’t add that vehicle'); });
  }

  const rows = $('#cart-rows');
  if (rows) rows.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cart-remove]'); if (!btn) return;
    const row = btn.closest('.cart-row');
    if (!(await confirmDialog({ title: `Remove ${row.dataset.name}?`, message: 'It will be taken off your order list. You can add it again from the vehicle page.', confirmLabel: 'Remove', icon: 'fa-cart-shopping' }))) return;
    const r = await call(`/api/account/cart/${row.dataset.id}`, null, 'DELETE');
    if (!r.ok) return fail(r);
    location.reload();
  });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-row-cart]'); if (!b) return;
    b.disabled = true;
    const r = await call('/api/account/cart', { vehicleId: +b.dataset.rowCart });
    b.disabled = false;
    if (!r.ok) return fail(r, 'Couldn’t add that vehicle');
    toast(r.body.message, { type: 'success', title: 'Added to your order list', action: { label: 'Review and order →', href: '/account/order-list' } });
  });

  const form = $('#order-form');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.dataset.submitting || !validate(form)) return;
    if (!(await confirmDialog({ title: 'Send this order?', message: 'We’ll save your order with a reference number, then open WhatsApp so you can send it to our team. Nothing is charged.', confirmLabel: 'Save and open WhatsApp', icon: 'fa-paper-plane' }))) return;
    form.dataset.submitting = '1';
    const btn = $('button[type=submit]', form); setBusy(btn, true);
    // Opened now, while we still have the tap, so browsers don't block it; filled in once the order is saved.
    let win = null; try { win = window.open('', '_blank'); } catch { /* blocked: the next page has a Send button */ }
    const r = await call('/api/account/orders', Object.fromEntries(new FormData(form)));
    if (r.ok) {
      if (win) { try { win.opener = null; win.location.href = r.body.whatsapp; } catch { /* ignore */ } }
      location.assign(r.body.redirect);
      return;
    }
    if (win) win.close();
    setBusy(btn, false); delete form.dataset.submitting;
    const bad = [];
    Object.entries(r.body.fields || {}).forEach(([name, msg]) => { const el = form.elements[name]; if (el) { fieldError(el, msg); bad.push(el); } });
    summary(form, bad); if (bad.length) bad[0].focus();
    fail(r, 'Order not sent');
  });
})();

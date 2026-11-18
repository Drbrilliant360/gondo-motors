import { esc, html } from '../lib.mjs';

const head = (title, lead, crumb) => html`<section class="page-head"><div class="container">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><i class="fa-solid fa-chevron-right"></i><span>${crumb}</span></nav>
  <h1>${title}</h1><p>${lead}</p></div></section>`;

export function howToBuy({ site, steps }) {
  const body = html`${head('How to buy your car', 'Simple steps to purchase your dream vehicle with Gondo Motors.', 'How to buy')}
<section class="section"><div class="container"><div class="timeline">
  ${steps.map((s, i) => `<div class="tl-item"><div class="tl-num"><i class="fa-solid ${s.icon}"></i></div><div class="tl-body"><small>Step ${i + 1}</small><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></div>`)}
</div>
<div class="cta-band" style="margin-top:32px"><div><h2>Ready to start?</h2><p>Browse our vehicles or talk to our team.</p></div><div class="cta-actions"><a class="btn btn-primary btn-lg" href="cars.html">Browse vehicles</a><a class="btn btn-outline btn-lg" style="color:#fff;border-color:rgba(255,255,255,.35)" href="contact.html">Contact sales</a></div></div></div></section>`;
  return { path: 'how-to-buy.html', title: 'How to buy a car', description: 'Ten simple steps from sign-up to enjoying your car — Gondo Motors handles bidding, shipping, documents and import clearance.', page: 'how', body };
}

export function faqPage({ faq }) {
  const body = html`${head('Frequently asked questions', 'Your guide to understanding Gondo Motors services and procedures.', 'FAQ')}
<section class="section"><div class="container"><div class="faq">
  ${faq.map((f) => `<details><summary>${esc(f.q)}<i class="fa-solid fa-chevron-down"></i></summary><div class="ans">${esc(f.a)}</div></details>`)}
</div></div></section>`;
  return { path: 'faq.html', title: 'FAQ', description: 'Answers about registration, deposits, invoices, Japanese auctions, shipping, guarantees and delivery with Gondo Motors.', page: 'faq', body };
}

export function contactPage({ site }) {
  const body = html`${head('Contact Gondo Motors', 'Your trusted partner for export and local car business. We provide consultation, vehicle sourcing, selection, and worldwide shipping of cars, motorcycles and machinery.', 'Contact')}
<section class="section"><div class="container two-col">
  <div>
    <div class="info-list">
      ${site.offices.map((o) => `<div class="info-card"><i class="fa-solid fa-location-dot"></i><div><b>${esc(o.label)}</b><span>${esc(o.address)}</span></div></div>`)}
      <div class="info-card"><i class="fa-solid fa-phone"></i><div><b>Phone</b><span><a href="tel:${site.phoneHref}">${site.phone}</a></span></div></div>
      <div class="info-card"><i class="fa-solid fa-envelope"></i><div><b>Email</b><span><a href="mailto:${site.email}">${site.email}</a></span></div></div>
    </div>
    <h3 style="margin:32px 0 4px">Sales team</h3>
    <div class="team">${site.salesTeam.map((p) => `<div class="person"><span class="avatar">${p.name[0]}</span><div><b>${esc(p.name)}</b><a href="tel:${p.phone.replace(/\s/g, '')}">${p.phone}</a><a href="mailto:${p.email}">${p.email}</a></div></div>`)}</div>
  </div>
  <form class="form-card" id="contact-form" data-wa="${site.whatsapp}" data-guard novalidate>
    <h2>Send us a message</h2>
    <p class="form-note">Fields marked <span class="req">*</span> are required. Your message opens in WhatsApp so you can review it before sending.</p>
    <div class="form-summary" role="alert" hidden></div>
    <div class="field"><label for="c-name">Full name <span class="req" aria-hidden="true">*</span></label><input class="input" id="c-name" name="name" required minlength="2" maxlength="80" autocomplete="name" placeholder="e.g. Amina Juma"></div>
    <div class="field"><label for="c-email">Email address <span class="opt">(optional)</span></label><input class="input" id="c-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com"><p class="hint">We’ll use it if we can’t reach you on WhatsApp.</p></div>
    <div class="field"><label for="c-phone">Phone number <span class="opt">(optional)</span></label><input class="input" id="c-phone" name="phone" type="tel" inputmode="tel" pattern="[+0-9 ()\-]{7,}" autocomplete="tel" placeholder="+255 679 400 800"><p class="hint">Include the country code, e.g. +255.</p></div>
    <div class="field"><label for="c-msg">Message <span class="req" aria-hidden="true">*</span></label><textarea class="textarea" id="c-msg" name="message" required minlength="10" maxlength="1000" placeholder="Which car are you looking for? Mention make, model, year and budget."></textarea><p class="hint" data-counter="10">At least 10 characters.</p></div>
    <button class="btn btn-whatsapp btn-lg" type="submit" data-busy="Preparing your message…"><i class="fa-brands fa-whatsapp"></i> Send via WhatsApp</button>
  </form>
</div></section>`;
  return { path: 'contact.html', title: 'Contact us', description: 'Contact Gondo Motors in Dar es Salaam — offices, phone, email and sales team.', page: 'contact', body };
}

export function localPage({ site }) {
  const body = html`${head('Local vehicles marketplace', 'Buy and sell vehicles already in Tanzania. Filter by city and contact sellers directly on WhatsApp.', 'Local vehicles')}
<section class="section"><div class="container">
  <div class="city-chips"><span class="chip active">All cities</span>${['Dar es Salaam', 'Dodoma', 'Kigoma', 'Mwanza'].map((c) => `<span class="chip">${c}</span>`)}</div>
  <div class="empty"><i class="fa-solid fa-tags"></i><h3>No local listings right now</h3><p>Log in or register to post your vehicle — it will appear here for buyers across Tanzania.</p>
  <p style="margin-top:20px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="login.html">Log in</a><a class="btn btn-outline" href="signup.html">Register</a></p></div>
</div></section>`;
  return { path: 'local-vehicles.html', title: 'Local vehicles', description: 'Local vehicles marketplace in Tanzania — Dar es Salaam, Dodoma, Kigoma and Mwanza.', page: 'local', body };
}

export function authPage(kind) {
  const login = kind === 'login';
  const body = html`<div class="auth-wrap"><form class="form-card auth-card" data-auth-form="${kind}" data-guard novalidate>
  <a class="back-link" href="index.html" style="margin-bottom:-4px"><i class="fa-solid fa-arrow-left"></i> Back to home</a>
  <h1>${login ? 'Log in to Gondo Motors' : 'Create your account'}</h1>
  ${login ? '' : '<p class="form-note">Fields marked <span class="req">*</span> are required.</p>'}
  <div class="form-summary" role="alert" hidden></div>
  ${login ? '' : '<div class="field"><label for="a-name">Full name <span class="req" aria-hidden="true">*</span></label><input class="input" id="a-name" name="name" required minlength="2" maxlength="80" autocomplete="name" placeholder="e.g. Amina Juma"></div>'}
  <div class="field"><label for="a-email">Email address <span class="req" aria-hidden="true">*</span></label><input class="input" id="a-email" name="email" type="email" inputmode="email" required autocomplete="email" placeholder="name@example.com"></div>
  ${login ? '' : '<div class="field"><label for="a-phone">Phone number <span class="opt">(optional)</span></label><input class="input" id="a-phone" name="phone" type="tel" inputmode="tel" pattern="[+0-9 ()\\-]{7,}" autocomplete="tel" placeholder="+255 679 400 800"><p class="hint">Include the country code, e.g. +255.</p></div>'}
  <div class="field"><label for="a-pass">Password <span class="req" aria-hidden="true">*</span></label>
    <div class="pw"><input class="input" id="a-pass" name="password" type="password" required ${login ? '' : 'minlength="8"'} autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="${login ? 'Your password' : 'At least 8 characters'}"><button class="pw-toggle" type="button" aria-label="Show password" aria-pressed="false"><i class="fa-solid fa-eye"></i></button></div>
    ${login ? '' : '<div class="strength" data-strength aria-hidden="true"><i></i><i></i><i></i></div><p class="hint" data-strength-text>Use 8+ characters. Add numbers or symbols for a stronger password.</p>'}
  </div>
  <button class="btn btn-primary btn-lg" type="submit" data-busy="${login ? 'Signing in…' : 'Creating account…'}">${login ? 'Log in' : 'Sign up'}</button>
  <p class="foot">${login ? 'New here? <a href="signup.html">Create an account</a>' : 'Already registered? <a href="login.html">Log in</a>'}</p>
</form></div>`;
  return { path: `${kind}.html`, title: login ? 'Log in' : 'Sign up', description: login ? 'Log in to your Gondo Motors account.' : 'Register with Gondo Motors to buy cars and post local vehicles.', page: kind, body };
}

export function notFound() {
  const body = html`<section class="section"><div class="container"><div class="empty"><i class="fa-solid fa-road-circle-xmark"></i><h1>Page not found</h1><p>The page you’re looking for has moved or doesn’t exist.</p><p style="margin-top:18px"><a class="btn btn-primary" href="/index.html">Back to home</a> <a class="btn btn-outline" href="/cars.html">Browse vehicles</a></p></div></div></section>`;
  return { path: '404.html', title: 'Page not found', description: 'Page not found.', page: '', body };
}

// Public forms: contact messages and "Ask us to find your car" requests. Saved as enquiries for the admin panel.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { PgRateStore } from '../rate-store.mjs';
import { one } from '../db.mjs';
import { str } from '../security.mjs';

export const publicApi = Router();
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/, PHONE = /^[+0-9 ()\-]{7,20}$/;
const limiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, store: new PgRateStore('enquiry:'), standardHeaders: 'draft-7', legacyHeaders: false, handler: (req, res) => res.status(429).json({ error: 'You have sent several messages in a short time. Please try again later or call us.' }) });

publicApi.post('/api/enquiries', limiter, async (req, res) => {
  const b = req.body || {}, fields = {};
  if (b.website) return res.status(201).json({ message: 'Thank you.' }); // hidden field only bots fill in
  const type = b.type === 'car_request' ? 'car_request' : 'contact';
  const name = str(b.name, 80); if (name.length < 2) fields.name = 'Full name is required.';
  const phone = str(b.phone, 20) || null; if (phone && !PHONE.test(phone)) fields.phone = 'Enter a valid phone number, like +255 679 400 800.';
  const email = str(b.email, 254).toLowerCase() || null; if (email && !EMAIL.test(email)) fields.email = 'Enter a valid email address, like name@example.com.';
  if (!phone && !email) fields.phone = 'Add a phone number or an email so we can reply.';
  const message = str(b.message, 1000);
  const year = (v) => (/^\d{4}$/.test(str(String(v ?? ''), 4)) && +v >= 1950 && +v <= 2100 ? +v : null);
  const req1 = type === 'car_request' ? { make: str(b.wanted_make, 40) || null, model: str(b.wanted_model, 60) || null, from: year(b.year_from), to: year(b.year_to), budget: /^\d{6,13}$/.test(str(String(b.budget_tzs ?? ''), 20).replace(/[,\s]/g, '')) ? Number(String(b.budget_tzs).replace(/[,\s]/g, '')) : null } : {};
  if (type === 'contact' && message.length < 10) fields.message = 'Message needs at least 10 characters.';
  if (type === 'car_request' && !req1.make && !req1.model && message.length < 10) fields.wanted_make = 'Tell us the make or model you are looking for.';
  if (Object.keys(fields).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
  await one(
    `INSERT INTO enquiries (type, user_id, name, phone, email, message, wanted_make, wanted_model, year_from, year_to, budget_tzs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [type, req.user ? req.user.id : null, name, phone, email, message || `Looking for ${[req1.make, req1.model].filter(Boolean).join(' ')}`, req1.make || null, req1.model || null, req1.from || null, req1.to || null, req1.budget || null]);
  res.status(201).json({ message: type === 'car_request' ? 'Request received. Our team will search the auctions and get back to you.' : 'Message received. We usually reply within a few hours.' });
});

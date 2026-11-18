// Shared helpers for templates
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const nf = new Intl.NumberFormat('en-US');
export const fmt = (n) => nf.format(n);
export const tzs = (n) => (n ? `TZS ${fmt(n)}` : 'Price on request');
export const km = (n) => (n ? `${fmt(n)} km` : 'Not stated');
export const waLink = (site, text) => `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;
export const carImg = (root, id, n = 1, thumb = false) => `${root}assets/img/cars/${id}/${String(n).padStart(2, '0')}${thumb ? '-thumb' : ''}.jpg`;
export const photoOrder = (c) => [c.cover, ...Array.from({ length: c.photos }, (_, i) => i + 1).filter((n) => n !== c.cover)];
export const html = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (vals[i] === undefined || vals[i] === false || vals[i] === null ? '' : Array.isArray(vals[i]) ? vals[i].join('') : vals[i]), '');

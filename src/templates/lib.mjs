// Shared helpers for templates
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const nf = new Intl.NumberFormat('en-US');
export const fmt = (n) => nf.format(n);
export const tzs = (n) => (n ? `TZS ${fmt(n)}` : 'Price on request');
export const km = (n) => (n ? `${fmt(n)} km` : 'Not stated');
export const waLink = (site, text) => `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;
export const carImg = (root, id, n = 1, thumb = false) => `${root}assets/img/cars/${id}/${String(n).padStart(2, '0')}${thumb ? '-thumb' : ''}.jpg`;
export const photoOrder = (c) => [c.cover, ...Array.from({ length: c.photos }, (_, i) => i + 1).filter((n) => n !== c.cover)];
// Image URLs are either absolute (Cloudinary) or site paths like /assets/img/cars/1/01.jpg, resolved against the page root.
export const NO_PHOTO = '/assets/img/brand/no-photo.svg';
export const img = (root, url) => (/^(https?:)?\/\//.test(url) ? url : root + String(url).replace(/^\//, ''));
export const absUrl = (site, url) => (/^https?:\/\//.test(url) ? url : `${site.url}/${String(url).replace(/^\//, '')}`);
const STATUS = { available: ['pill-good', 'Available'], reserved: ['pill-warn', 'Reserved'], in_transit: ['pill-info', 'In transit'], sold: ['pill-sold', 'Sold'] };
export const statusLabel = (c) => (STATUS[c.status] || STATUS.available)[1];
export const statusPill = (c) => { const [cls, label] = STATUS[c.status] || STATUS.available; return `<span class="pill ${cls}">${c.status === 'available' ? '<i class="fa-solid fa-circle" style="font-size:.45rem"></i> ' : ''}${label}</span>`; };
// Adds the fields every template relies on: images (cover first), thumb and photo count.
export function withImages(car, images) {
  const list = images.length ? images : [{ url: NO_PHOTO, thumb: NO_PHOTO }];
  return { ...car, images: list, thumb: list[0].thumb, photos: images.length };
}
// JSON placed inside a <script> tag: escape < so text like </script> in a vehicle name can never end the tag.
export const jsonScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
// Responsive <picture>: AVIF, then WebP, then a JPEG <img> fallback. `name` is the file stem in assets/img/home/.
export function picture(root, name, widths, { alt, sizes, width, height, lazy = true, cls = '' }) {
  const set = (ext) => widths.map((w) => `${root}assets/img/home/${name}-${w}.${ext} ${w}w`).join(', ');
  return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}"><img${cls ? ` class="${cls}"` : ''} src="${root}assets/img/home/${name}-${widths[Math.min(1, widths.length - 1)]}.jpg" srcset="${set('jpg')}" sizes="${sizes}" width="${width}" height="${height}" alt="${esc(alt)}" ${lazy ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></picture>`;
}
export const html = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (vals[i] === undefined || vals[i] === false || vals[i] === null ? '' : Array.isArray(vals[i]) ? vals[i].join('') : vals[i]), '');

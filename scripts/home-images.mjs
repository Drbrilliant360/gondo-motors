// Prepares the decorative homepage photos: crop, remove identifying details (plates, badges), tone-match,
// then export AVIF + WebP + JPEG at responsive widths into src/assets/img/home/.
// Usage: node scripts/home-images.mjs <folder with the downloaded originals>   (sources are listed in src/assets/img/CREDITS.md)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) throw new Error('Pass the folder that holds the original downloads.');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src/assets/img/home');
mkdirSync(out, { recursive: true });

// Hides identifying details. `blur` softens a region; `paint` lays a soft-edged dark shape over it
// (number plates, a driver's face behind glass) so it reads as shadow or tinted glass rather than a censor box.
async function scrub(file, patches) {
  const layers = await Promise.all(patches.map(async (p) => {
    if (p.paint) {
      const f = p.feather ?? 10, w = p.width + f * 4, h = p.height + f * 4;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f}"/></filter></defs><${p.ellipse ? `ellipse cx="${w / 2}" cy="${h / 2}" rx="${p.width / 2}" ry="${p.height / 2}"` : `rect x="${f * 2}" y="${f * 2}" width="${p.width}" height="${p.height}" rx="6"`} fill="${p.paint}" fill-opacity="${p.opacity ?? 0.95}" filter="url(#f)"/></svg>`;
      return { input: Buffer.from(svg), left: p.left - f * 2, top: p.top - f * 2 };
    }
    return { input: await sharp(join(src, file)).extract({ left: p.left, top: p.top, width: p.width, height: p.height }).blur(Math.max(6, p.width / 5)).toBuffer(), left: p.left, top: p.top };
  }));
  return sharp(await sharp(join(src, file)).composite(layers).toBuffer());
}
async function exportSet(image, name, widths, ratio) {
  const master = await image.toBuffer();
  for (const w of widths) {
    const h = Math.round(w / ratio), r = () => sharp(master).resize(w, h, { fit: 'cover' });
    await r().avif({ quality: 52, effort: 5 }).toFile(join(out, `${name}-${w}.avif`));
    await r().webp({ quality: 76 }).toFile(join(out, `${name}-${w}.webp`));
    await r().jpeg({ quality: 78, mozjpeg: true }).toFile(join(out, `${name}-${w}.jpg`));
  }
  console.log(`${name}: ${widths.join(', ')}`);
}

/* Hero: dark SUV. The number plate, grille badge and the driver behind the glass are painted out.
   Landscape: cropped so the car sits in the right two-thirds. Portrait: the whole car at the bottom of a tall dark frame,
   leaving the top free for the headline on phones. */
const tone = (img) => img.modulate({ brightness: 0.94, saturation: 0.82 });
const hero = await scrub('hero.jpg', [
  { left: 2500, top: 1540, width: 112, height: 84, paint: '#101116', feather: 5, opacity: 0.97 },   // number plate
  { left: 2522, top: 1446, width: 60, height: 44, paint: '#0b0c10', feather: 8, opacity: 0.9, ellipse: true }, // grille badge
  { left: 1500, top: 1085, width: 330, height: 210, paint: '#07080b', feather: 26, opacity: 0.97, ellipse: true }, // driver
]);
const heroBuf = await hero.toBuffer();
await exportSet(tone(sharp(heroBuf).extract({ left: 0, top: 640, width: 3400, height: 1912 }).resize(3840, 2160)), 'hero', [3840, 2560, 1920, 1280], 16 / 9);
{
  const strip = await tone(sharp(heroBuf).extract({ left: 760, top: 300, width: 1920, height: 2500 }).resize(1080)).toBuffer(); // 1080 x 1406
  const h = (await sharp(strip).metadata()).height, top = 1920 - h;
  const seam = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07080b"/><stop offset="1" stop-color="#07080b" stop-opacity="0"/></linearGradient></defs><rect y="${top - 2}" width="1080" height="260" fill="url(#g)"/></svg>`);
  const portrait = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#07080b' } }).composite([{ input: strip, left: 0, top }, { input: seam, left: 0, top: 0 }]).jpeg({ quality: 95 }).toBuffer();
  await exportSet(sharp(portrait), 'hero-portrait', [1080, 720], 9 / 16);
}

/* Two ways to buy — a light car and a dark car in fog, tone-matched to the pale page background so they read as one shoot.
   The light car is mirrored so the pair face each other. */
const pale = (img) => img.modulate({ saturation: 0.18 }).linear(1.12, 14).gamma(1.05);
await exportSet(pale(sharp(join(src, 'way-white.jpg')).extract({ left: 640, top: 560, width: 2760, height: 1840 }).flop()), 'way-import', [2400, 1600, 1000, 640], 3 / 2);
const black = await scrub('way-black.jpg', [{ left: 1342, top: 1782, width: 64, height: 36 }]);
await exportSet(pale(sharp(await black.toBuffer()).extract({ left: 620, top: 820, width: 2760, height: 1840 })), 'way-local', [2400, 1600, 1000, 640], 3 / 2);

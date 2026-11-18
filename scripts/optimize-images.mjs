// Resizes the original scraped photos into a clean, web-sized structure:
//   src/assets/img/cars/<id>/01.jpg (1400px)  and  01-thumb.jpg (640px)
// Usage: node scripts/optimize-images.mjs <path-to-original-clone-folder>
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = process.argv[2];
if (!srcDir) { console.error('Pass the original clone folder as the first argument'); process.exit(1); }
const cars = JSON.parse(readFileSync(join(root, 'data/source/cars.raw.json'), 'utf8'));
const sips = (src, dest, size) => execFileSync('sips', ['-s','format','jpeg','-s','formatOptions','72','-Z',String(size),src,'--out',dest], { stdio: 'ignore' });
let n = 0, fail = 0;
for (const c of cars) {
  const dir = join(root, 'src/assets/img/cars', String(c.id));
  mkdirSync(dir, { recursive: true });
  c.images.forEach((img, i) => {
    const src = existsSync(join(srcDir, img)) ? join(srcDir, img) : join(srcDir, 'uploads', img.replace(/^uploads\//, '')); const nn = String(i + 1).padStart(2, '0');
    if (!existsSync(src)) { fail++; return; }
    try {
      if (!existsSync(join(dir, `${nn}.jpg`))) sips(src, join(dir, `${nn}.jpg`), 1400);
      if (!existsSync(join(dir, `${nn}-thumb.jpg`))) sips(src, join(dir, `${nn}-thumb.jpg`), 640);
      n++;
    } catch { fail++; }
  });
}
const hero = join(root, 'src/assets/img/hero');
mkdirSync(hero, { recursive: true });
[['1.PNG','hero-1.jpg'],['2.PNG','hero-2.jpg'],['4.PNG','hero-3.jpg']].forEach(([a,b]) => { try { sips(join(srcDir,a), join(hero,b), 2000); } catch { fail++; } });
console.log(`optimized ${n} photos, ${fail} failures`);

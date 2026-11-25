// Vercel build step: static assets are served straight from Vercel's CDN (public/), not through the app.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(root, 'public'), { recursive: true, force: true });
mkdirSync(join(root, 'public'), { recursive: true });
cpSync(join(root, 'src/assets'), join(root, 'public/assets'), { recursive: true });
console.log('Copied src/assets -> public/assets');

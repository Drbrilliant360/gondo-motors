import { esc, html } from './lib.mjs';
import { header } from './partials/header.mjs';
import { footer } from './partials/footer.mjs';

// Wraps page content in the shared document shell.
export function layout({ site, title, description, path, root = '', page = '', body, head = '', ogImage }) {
  const fullTitle = title === site.name ? `${site.name} — ${site.tagline}` : `${title} | ${site.name}`;
  const canonical = `${site.url}/${path === 'index.html' ? '' : path}`;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || site.description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || site.description)}">
<meta property="og:image" content="${site.url}/${ogImage || 'assets/img/hero/hero-1.jpg'}">
<meta name="theme-color" content="#1a1a2e">
<link rel="icon" href="${root}assets/img/brand/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="${root}assets/css/main.css">
${head}
</head>
<body data-root="${root}" data-page="${page}">
<a class="sr-only" href="#main">Skip to content</a>
${header({ site, root, page })}
<main id="main">
${body}
</main>
${footer({ site, root })}
<a class="fab-whatsapp" href="https://wa.me/${site.whatsapp}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>
<script src="${root}assets/js/cars-data.js"></script>
<script src="${root}assets/js/main.js" defer></script>
</body>
</html>`;
}

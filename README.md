# Gondo Motors — redesigned site

Static, zero-dependency site generator (Node 18+). Source in `src/`, generated site in `dist/`.

```
npm run build     # src/ -> dist/ (109 pages)
npm run dev       # build + preview at http://localhost:8080
open dist/index.html   # also works straight from disk
```

## Structure
```
build/build.mjs            orchestrator: data + templates -> dist/
scripts/
  prepare-data.mjs         cleans data/source/cars.raw.json -> src/data/cars.json
  optimize-images.mjs      resizes original photos (sips) -> src/assets/img/cars/<id>/NN.jpg + NN-thumb.jpg
  serve.mjs                tiny preview server
data/source/cars.raw.json  raw scrape of the original listings (kept for reference)
src/
  data/                    cars.json (clean), covers.json (best cover photo per car), site.json, faq.json, steps.json
  templates/
    layout.mjs             document shell (head, SEO, header, footer)
    lib.mjs                helpers (escape, price/km format, WhatsApp link)
    partials/              header, footer, vehicle-card (the Carwow-style card)
    pages/                 home, cars (catalog), car (detail), compare, content (how-to-buy, faq, contact, local, auth, 404)
  assets/
    css/main.css           design system (tokens at the top)
    js/main.js             compare, filters, gallery/lightbox, hero slider
    img/{cars,hero,brand}
dist/                      generated — deploy this folder
```

## Editing
- Add/change a car: edit `data/source/cars.raw.json` (+ drop photos), run `npm run data && npm run images && npm run build`.
- Pick the cover photo: `src/data/covers.json` (id -> 1-based photo number).
- Colours / spacing / radius: CSS variables at the top of `main.css`.
- Contact details, offices, team: `src/data/site.json`.

## Notes
- Prices below TZS 1,000,000 in the source were placeholders (0, 10, 100…) and show as "Price on request".
- Contact form opens WhatsApp with the message pre-filled. Log in / sign up are UI only (no backend yet).

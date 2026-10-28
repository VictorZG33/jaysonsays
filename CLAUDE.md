# Jieshen Simulator

A static page (no build step) served by GitHub Pages at https://wentaoz.com/jaysonsays/, plus the
Cloudflare Worker in `worker/` that calls Claude on the site's key. See README.md for what each
piece does and where the data comes from.

## Conventions

- `sim.js` is imported by both the page and the Worker, so the prompt and the request shape live in
  one place. Keep it free of DOM APIs and Node APIs. The rows and the winemakers in `reviews.js` reach
  Claude only through the `lookup_scores` tool (`lookupScores`), never in the prompt, which stays small
  and cached.
- All URLs are relative: the page lives under `/jaysonsays/`, not at the root. `../` is the homepage,
  wentaoz.com, served from the VictorZG33.github.io repository, which links here from its Wine tab.
- Interface text goes through the `I18N` table in `index.html`; add every key in both `zh` and `en`.
  The theme choice is shared with the rest of wentaoz.com under `localStorage['wentaoz.theme']`.
- `reviews.js` rows are data: scores exactly as 杰神 gave them, notes paraphrased in Chinese, never
  his text copied. Keep each list in table order and check its counts against its article.
  `WINEMAKERS` entries name the producer as `REVIEWS` spells it (or as the winery does, if he has
  no rows for it) and carry a source; mark a gap 「未查实」 rather than guess.
- A change to `worker/`, `sim.js` or `reviews.js` on `main` redeploys the Worker.

## Testing

Run `node tools/test-engine.mjs` (after `npm ci` in `worker/`) and `node tools/test-page.cjs`
with the repository served on 127.0.0.1:8765; see README.md. There is no API key in the tests:
the engine test mocks the API under the real SDK, the page test mocks the Worker.

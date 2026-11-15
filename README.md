# CODEX STUDYS + Macro

CODEX STUDYS interface (home, search, filters, favorites, themes, effects, profile, popups…) with **Macro's batches and flow**:

- Course library = Macro's live catalog (old CODEX STUDYS `batches.json` removed). Loaded from
  `studystark.github.io/batches/batches.json`, with `/api/content/__catalog` as fallback.
- Opening a course → `batch.html?id=<batchId>`: **Today's classes** + **Subjects** → Topics →
  Lectures / Notes / DPP PDF / DPP Videos / DPP Tests → in-app player (`?v=watch`).
- `batch.html`, `macro.js`, `macro.css` = the Macro flow in CODEX STUDYS styling (themes shared).
- `styles.css` = the home page CSS (moved out of `index.html`, unchanged).

## Deploy
Content calls go to `/api/content/*`:
- **Vercel**: `api/content/[...path].js` is picked up automatically.
- **Cloudflare Pages**: `functions/api/content/[[path]].js` is picked up automatically.
- Plain static hosting (no functions): the page falls back to calling the open mirror directly from the browser.

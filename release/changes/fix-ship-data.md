# fix — ship pipeline data with the build

Train: Alpha phase 4 build. Branch `alpha/fix-ship-data` (base `main`).

## Bug

`GET /data/catalog/manifest.json` on dev and production (0.2.1) returned `200 text/html`
(index.html). Repo `data/` (catalog, rights, packs; ~34 MB) was never copied into `dist/`, and
wrangler `not_found_handling: single-page-application` masked the 404. Every content journey
died at S02 "Could not load the library."

## What changes

- `src/offline/ship-data-plugin.ts` — build step copies `data/**/*.json` to `dist/data/…`
  (catalog C-03 + per-language counts, rights C-13, flow guide files) and mirrors
  `data/packs/<id>/` to `dist/packs/<id>/` (C-02 paths used by the offline engine and the pack
  manifests' file lists). The build fails if `catalog/manifest.json` or `rights/records.json`
  is missing.
- `src/offline/shell-manifest-plugin.ts` — `data/` and `packs/` are never in the shell precache
  (C-07 tiers; packs are saved per pack on request). Shell stays 5 files.
- `src/media/usePack.ts` — `CONTENT_BASE` defaults to the app origin (`''`), so media screens read
  `/packs/<id>/…` (was `/content/…`, which nothing served).
- `vite.config.ts` — emits `<meta name="fia-release" content="<version>+<sha7>">` (C-14), so
  About and C-16 `appVersion` stop reporting `+0000000`.
- Tests: `tests/ship-data.test.ts` (paths exist, every C-02 listed file exists, JSON only, no
  precache, loud failure); `e2e/deployed.spec.ts` asserts catalog manifest, rights, a pack
  manifest and guide units return 200 + JSON content-type + parse (fails today on production).

## Not in this change

- No version bump; no staging/production promotion.
- No cache headers for `data/` (Workers default applies).

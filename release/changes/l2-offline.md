# 0.2.x — L2 offline / PWA

Train: Alpha phase 4, lane L2. Branch `alpha/l2-offline` (base `alpha/l0-scaffold`).

## What this lane carries

- `src/offline/engine.ts` — C-07 engine ported from the PoC `public/sw.js` (POC-REFERENCE § 7 PORT), generalised from the ACTIVE/SPA slots to one META record per pack id; browser globals injected so vitest runs the same code. SAVE stages into `fia-stage-<revision>-<uuid>`, verifies MIME + bytes + sha256 on write and again after all writes, commits by one META swap, deletes the previous cache only after commit. Integrity failure → stage deleted, previous pack untouched. Interruption (network / cancel / quota) → verified files kept as a partial stage; Resume fetches only the missing files (R-309). STATUS re-verifies every entry and compares the live revision (update-available + size delta, R-310). DELETE explicit, refused during a save; no sweeper (R-311). Fetch serves only verified bytes, honours `?fia-sha256=`; video never packaged (R-506).
- `src/offline/manifest.ts` — C-07 manifest derived from the C-02 pack (`/packs/<packId>/manifest.json`, the L1 layout); tiers cumulative text ⊂ phone ⊂ medium ⊂ original; `revision` = sha256 over canonical JSON of entries.
- `src/offline/sw.ts` → `dist/sw.js` via vite-plugin-pwa `injectManifest` (no Workbox runtime). Shell (R-702): `src/offline/shell-manifest-plugin.ts` writes `dist/offline-shell.json` (path, bytes, sha256, mime); the worker stages it at install and commits at activate, so a waiting worker never swaps assets under a running session.
- Update flow (R-704): the new worker waits; `OfflineClient` raises `updateReady`; `VersionBanner` (`s.common.version-banner`) and SH-3 app variant apply it only on tap (`SKIP_WAITING` → `controllerchange` → reload).
- `src/offline/register.ts` — registers `/sw.js` in production builds only; the Workers static deploy is unchanged (`vite build` output + `sw.js` + `offline-shell.json`).
- `src/offline/install.ts` — PoC `install.js` ported with its three tests + platform detection.
- `src/offline/storage.ts` — quota estimate, `navigator.storage.persist()` request (logged), SH-4 variant choice, largest-packs list (never deletes).
- Screens: S13 Downloads (storage + persist line, Downloading with progress/Pause, Saved with update delta and confirmed Remove, Partial n of m + Resume, verify-error band, eviction band + Re-save, offline chip, iOS install note), S17 Install guide (iOS 3 steps, Android prompt or ⋮ steps, standalone, desktop, skip-confirm from the 04 gate, error band), SH-3 Update notice (content + app variants; Keep remembered per revision), SH-4 Storage warning (space / persist / quota; list with confirmed Remove).

## Browser APIs and fallbacks (R-709, for ALPHA-CONSTRAINTS § 9)

| API                                                 | Used for                    | Fallback                                                                                    |
| --------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| Service Worker                                      | offline shell + packs       | none registered → app runs online; S13 shows empty/unavailable honestly                     |
| Cache Storage                                       | pack + shell bytes          | same as above (engine is storage-injected; a wrapper can supply a file-backed `CachesLike`) |
| Web Crypto `subtle.digest`                          | sha256 verify               | required; available in every target browser and in WebViews                                 |
| `navigator.storage.estimate/persist`                | quota line, persist request | line hidden; persist logged as unavailable                                                  |
| `beforeinstallprompt`                               | Android Install button      | ⋮ menu steps                                                                                |
| `display-mode: standalone` / `navigator.standalone` | installed state             | steps shown                                                                                 |
| `localStorage`                                      | declined-update revisions   | in-memory only                                                                              |

## Tests

`tests/offline.engine.test.ts` (14: save + C-07 done/progress/broadcast validation, manifest validates + revision iff entries change, kill → partial → resume, corrupt → CACHE_ERROR, bump → update-available + delta + decline keeps serving + accept swaps, integrity rollback, PoC quota seed, DELETE explicit/refused mid-save, CANCEL → partial, video refused, list, `?fia-sha256=`, shell install/activate/offline navigate, dev no-op). `tests/offline.install.test.ts` (10: PoC install cases, platform, storage, client update flow). `e2e/offline.spec.ts`: offline cold start reaches S13 from the verified shell cache in Chromium.

## Not in this lane (stubbed / Bide)

- Catalog + text "always cached" row (M1) — no catalog loader yet; row omitted rather than claimed.
- Multi-pericope queue (R-308) and the iOS first-save gate live on S03/S04 (L3); `storageWarningFor` is exported for them.
- `SKIP_WAITING` is an app-lifecycle message outside the C-07 enum; candidate C-07 minor (Otto).
- Real-device iOS install verification (R-906) and Lighthouse (R-707) not run here.

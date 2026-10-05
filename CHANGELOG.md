# Changelog

## 3.0.0-alpha.13 — Original six-step guide audio and excerpt playback (2026-10-05)

English Mark 1:1–13 now uses six original FIA publisher recordings for 111 narrated guide activities across all six steps, with reviewed excerpt ranges and existing Scripture handoffs or manual holds. Its official Berean Standard Bible recording remains a separate Scripture source. The progress circle runs from each guide or BSB excerpt’s own start to its own end while word highlighting retains the recording’s absolute clock. Recording coverage for other passages and languages remains narrower; original human recordings take priority when available, with generated narration allowed as fallback. See [recorded guide scope](release/changes/3.0.0-alpha.13-original-guide.md).

Explicit Next, easy-button Continue and forward swipes start eligible destination narration; Back and restored sessions remain silent. See [navigation playback note](release/changes/3.0.0-alpha.13-explicit-next.md).

The three first-English companion videos can play after explicit Play without an offline download. Verified proxy outputs retain separate bundled-source and published-source provenance, bounded loading and native video ownership. See [release note](release/changes/3.0.0-alpha.13-video-on-demand.md).

## 3.0.0-alpha.12 — Media tap and swipe intent (2026-10-05)

Resting media surfaces support existing previous/next passage swipes without opening a visual. A completed tap opens images/maps; pinch, drag, stale activity changes and native video controls retain their separate behavior. No spacing changes. See [release note](release/changes/3.0.0-alpha.12-media-gestures.md).

## 3.0.0-alpha.11 — Native video owner retention (2026-10-05)

Retains the current video until native fullscreen exit is acknowledged before applying navigation or passage selection. Reports deferred failures and preserves the latest selection intent. The reported installed-iPhone freeze remains unverified. See [release note](release/changes/3.0.0-alpha.11-native-video-owner.md).

## 3.0.0-alpha.10 — Guarded passage swipes (2026-10-05)

Left/right swipes use existing Next/Back actions while preserving vertical scrolling, controls, media gestures and on-demand visual cancellation. No spacing or CSS changes. See [release note](release/changes/3.0.0-alpha.10-passage-swipes.md).

## 3.0.0-alpha.9 — FIA Guide identity and sharing (2026-10-05)

Names the installed app and browser title FIA Guide, with official FIA navy/blue and white-mark icons and a whole-mission sharing card. Passage layout and on-demand media behavior are unchanged. See [release note](release/changes/3.0.0-alpha.9-fia-guide-branding.md).

## 3.0.0-alpha.8 — Images and maps on demand (2026-10-05)

Prepared images and maps now appear when explicitly selected or reached during an active guide session, without requiring an offline download. Silent restore, verified proxy delivery, optional downloads and original layout are preserved. See [release note](release/changes/3.0.0-alpha.8-visual-on-demand.md).

## 3.0.0-alpha.7 — Verified on-demand audio (2026-10-04)

Explicit Play can fetch the selected prepared recording without a full passage download. First-English audio and image downloads use source-bound optimized proxy outputs; offline copies remain verified and optional. Silent restore, cancellation and Scripture word alignment are preserved. No new speech or video transformation. See [release note](release/changes/3.0.0-alpha.7-proxy-playback.md).

## 3.0.0-alpha.6 — Restore verified downloads (2026-10-04)

Excludes hosting control files from offline download manifests. Production consumed `_headers` as configuration and returned HTML at its URL, causing every download to fail verification before audio. Exact asset integrity checks remain enforced. No UI, recording or legacy-cache migration changes. See [release note](release/changes/3.0.0-alpha.6-download-integrity.md).

## 3.0.0-alpha.5 — All Mark presentations through HTTP and MCP (2026-10-04)

Adds immutable catalog discovery and read access to all136 accepted English/Spanish Mark presentations through the existing shared HTTP/MCP operations. Original three records and browser/media behavior remain unchanged. Requested static payloads are verified before delivery; no generation or write operation is added. See [release note](release/changes/3.0.0-alpha.5-mark-read-api.md).

## 3.0.0-alpha.4 — Mark text in English and Spanish (2026-10-04)

Adds all68 Mark pericopes in each language through one source-bound compiler, verified catalog loading, separate progress and per-pack text downloads. Resources require explicit download; no new audio is generated. Reviewed list/example mappings repeat across the corpus; other instructions remain readable with conservative continuation. See [release note](release/changes/3.0.0-alpha.4-mark-text.md).

## 3.0.0-alpha.3 — Online destinations with saved passages (2026-10-04)

Keeps status, help, provenance and API destinations accessible after a passage download. Their network failures remain failures; installed app/session navigation still uses its pinned revision. No UI, content or media changes. See [release note](release/changes/3.0.0-alpha.3-installed-routes.md).

## 3.0.0-alpha.2 — Shared read API on the existing Worker (2026-10-04)

Adds read-only HTTP and MCP access to three explicitly accepted immutable artifacts, including the complete approved presentation pack. The web application continues using its unchanged bundled pack, media and offline worker. No new content, generation, client switching or user-state service. See [release note](release/changes/3.0.0-alpha.2-worker-read.md).

## 3.0.0-alpha.1 — Approved v3 guided experience (2026-10-04)

Restores the approved Svelte interface and guided flow with English Mark 1:1–13, 143 existing recordings, eight images/maps, three videos, local progress, consolidated settings and verified browser downloads. The compatible worker replaces the earlier retirement-only draft. Public build status, build provenance and the sequential release train are preserved. See [release note](release/changes/3.0.0-alpha.1-fresh-v3.md).

All notable changes to the FIA App. One entry per train; the train note lives in `release/changes/<version>-<slug>.md`.

## 0.3.5 — Train 5: the app in Spanish (2026-10-03)

Train 5 runs `v2/integration` → `main` as one PR (cookbook `work/active/2026-10-01-fia-alpha-v2/RULING.md` § ~19:55 ET (c)). It brings the Spanish UI catalog (#98), S01's picker chrome in Spanish and a content-only use mode (#99), and a one-row hub header offline (#100); cookbook unit `work/active/2026-10-03-fia-spanish-ui-strings`, DoD 1–3 and FU-a..d. Each PR merged into `v2/integration` on a recorded fresh YES at its merged head. Train 4 (0.3.4) is on `main` `f8776d9`; 0.3.3's production PR #93 still waits on the captain.

The PRs come from `git log --merges --first-parent origin/main..origin/v2/integration`: #96 #97 #98 #99 #100. The release prep (#101) rides on top of `v2/integration` in the train PR itself and cannot list itself as merged. #98, #99 and #100 carry notes in `release/changes/`. #96 and #97 have none, so their lines come from the PR description and the merge diff. Every line below was checked against the code at `c095447`. Train note: [`release/changes/0.3.5-train-5-spanish-ui.md`](release/changes/0.3.5-train-5-spanish-ui.md).

- **The app in Spanish** (#98). `src/i18n/spa.json` holds all 891 `s.*` keys `en.json` had, an AI translation (Latin-American Spanish, `tú`) until a human translation lands; every placeholder, ICU plural block and `#` is kept. `src/i18n/index.ts` loads it lazily (`loadCatalog('spa')`, its own chunk of about 14 kB gzip, precached through `offline-shell.json`, R-702) and switches with `setUiLanguage`; `t` uses Spanish plural rules. A language with no catalog falls back to English rather than claim an AI translation. On first run one S01 pick sets the guide and the menus (eng and spa; English for any other). `main.tsx` loads a saved Spanish catalog before the first paint and `App.tsx` remounts the routes on a switch. S14's Language row shows `s.common.ui-lang-ai` when the menus are not English. The header pill shows the picker autonym (`Español`, `src/screens/ScreenFrame.tsx`). Note: [`release/changes/spanish-ui-strings.md`](release/changes/spanish-ui-strings.md).
- **S01 picker chrome from the catalog; use mode is content-only** (#99, FU-a and FU-b). The app wrapper `src/components/LanguagePicker.tsx` relabels the vendored kit picker's English text nodes (group heads, "n of m", Clear, empty search, row notes, legend, chip tooltips) from 15 new `s.lang.kit.*` keys; the vendored kit is not touched and the English values equal the kit's words, so English does not change. In use mode (`/?mode=use`) the first-run lede is gone, and a pick other than the menus' language reads `s.lang.primary-use-content` with `s.lang.content-only-note` (design/alpha-screens/01-first-run-language.md:64). Note: [`release/changes/s01-spanish-picker-and-use-mode.md`](release/changes/s01-spanish-picker-and-use-mode.md).
- **Hub header keeps one row offline, and re-fits late** (#100, FU-c and FU-d). Offline at 390 px the header used to wrap to two rows (122 px English, 110 px Spanish). `useOneRowHub` (`src/frame/Header.tsx`) now steps down a ladder only while the row would wrap: tighter pills, the logo symbol alone (`FiaLogo` `mark`), pills without leading icons, Explore as its compass alone (its word stays its accessible name). Online the ladder stops at step 1, so the online header is unchanged. It re-fits on grid resize (ResizeObserver), label or offline change, and web-font load. Note: [`release/changes/header-one-row-offline.md`](release/changes/header-one-row-offline.md).
- **Tests** (#98–#100). New: `tests/i18n-spa.test.ts` (key, placeholder and plural parity; lazy switch; no-catalog fallback), `tests/s01-ui-language-mode.test.ts`, `e2e/spa-ui.spec.ts` (S01 → S03 in Spanish with no raw keys, reload keeps Spanish), `e2e/header-one-row.spec.ts`. `e2e/save-row.spec.ts`, `f6-s13-downloads` and `f6-sh23-storage` now pick Español and assert Spanish labels.
- **Visuals versus `main`.** No file under `e2e/visual-baseline.spec.ts-snapshots/` changes (`git diff --name-status origin/main c095447 -- '*.png'` lists only additions under `screenshots/`): the baseline spec seeds `uiLanguage: 'eng'`. Twelve review shots are added: `screenshots/f6-s01/*.spa.*.png` (4) and `screenshots/fu-cd-header/*.png` (8). Visible but not covered by a baseline: the whole app in Spanish once Español is picked on S01, and the offline header at 390 px.
- **Sync `main` → `v2/integration`** (#96): no file change against `main`. It brought the train-4 merge commit `f8776d9` (the 0.3.4 version and entry) into integration; `git diff origin/main d275028` is empty.
- **ci.yml comment** (#97): `.github/workflows/ci.yml` now points the `check:urls` comment at `content-urls.yml`. One comment line, no step change. This closes the first bullet of 0.3.4 gap 2.
- **Release prep** (#101): no app change. The version goes to 0.3.5 in `package.json` and the `package-lock.json` root, with this entry and the train note.

### Known gaps

1. **String-table rows (FU-e, open).** `scripts/extract-strings.mjs` rebuilds `src/i18n/en.json` from the cookbook design string tables only. About 202 keys have no table row (at `c9940e8`; for example `s.overview.v2.*`, `s.jump.v2.*`, `s.passage.kind.*`, `s.guide.*`, `s.coverage.chip.*`), and the 15 new `s.lang.kit.*` keys (#99) are not in `design/alpha-screens/01-first-run-language.md` either. So `npm run strings` drops them from `en.json` today. Fix: add the rows to the owning tables, proven by `npm run strings` leaving `en.json` unchanged. Meanwhile `tests/i18n-spa.test.ts` catches `spa.json` drift.
2. **Spanish is an AI translation.** `spa.json` and the `s.lang.kit.*` values stay AI-translated until a human translation lands; S14 says so whenever the menus are not English. The kit's "AI" badge stays "AI" (a mark). The use-mode split's Settings control for the menus language is not built (#98 "Open"); only the first-run pick sets the menus.
3. **Header follow-ups** (#100 "Not in scope"). At 360 px the online header still wraps, as before. The wider header redesign and the big-text grid are a follow-up.
4. **Carried forward from 0.3.4, not re-checked here.** 0.3.4 gap 1 (Mark narration held) stands. Of gap 2, the ci.yml comment is closed by #97 and "Spanish S03 shows English UI words" is closed by #98 once Español is picked; `KNOWN_OMISSIONS` keyed by book, mark-walk opening resources by route, packs in git versus `BUILD-ORDER.md`, and S03's estimated parts count stand. Gap 3 (0.3.3 and 0.3.0 gaps) stands as written there.

## 0.3.4 — Train 4: all of Mark in English and Spanish (2026-10-03)

Train 4 runs `v2/integration` → `main` as one PR (cookbook `work/active/2026-10-01-fia-alpha-v2/RULING.md` § ~19:55 ET (c)). It brings the whole Book of Mark in English and Spanish (#94; cookbook unit `work/active/2026-10-03-fia-mark-full-eng-spa`, items 1–3): 136 text packs, content checks in CI and a per-pack app walk. No app code changes (`git diff origin/main e9bcac4 -- src contracts server` is empty); what the app shows changes through its data. S03 is the one deliberate pixel change. Each PR merged into `v2/integration` on a recorded fresh YES at its merged head. Train 3 (0.3.3) is on `main` `62d1130` and on `staging` (#92); its production PR #93 waits on the captain.

The PRs come from `git log --merges --first-parent origin/main..origin/v2/integration`: #91 #94. The release prep (#95) rides on top of `v2/integration` in the train PR itself and cannot list itself as merged. #94 carries a note in `release/changes/`. #91 has none, so its line comes from the PR description and the merge diff. Every line below was checked against the code at `e9bcac4`. Train note: [`release/changes/0.3.4-train-4-mark.md`](release/changes/0.3.4-train-4-mark.md).

- **All of Mark in English and Spanish** (#94). `data/packs/{eng,spa}.MRK-*` holds every Mark pericope Aquifer has in each language: 68 + 68 packs, text tier only, built at the pins in `pipeline/sources.json`. 134 are new (1,072 files, about 30 MB); the two 1:1–13 packs are byte-identical. `data/packs/` now holds 139 packs (with `arb.GEN-1-1-2-3`, `hau.LUK-6-17-19` and `tpi.MRK-1-1-13`). No narration ships: every `narration.json` keeps `entries: []`, and item 4 (voice) is held on the unit's ASK.md. New CLI: `npm run book -- MRK eng spa` (`pipeline/bin/build-book.mjs`), which skips a pack already on disk unless `--force`. Note: [`release/changes/mark-full-eng-spa.md`](release/changes/mark-full-eng-spa.md).
- **Catalog re-run** (#94). All 136 Mark entries carry `tierBytesSource: "pack-manifest"` (measured). With 139 built packs measured, the text-estimate calibration for every unbuilt entry in all 17 languages moves to ×5.058 (R-307), so every estimate in `data/catalog/manifest.json` shifts. Only `builtAt`, `entries[].tierBytes.text` and `entries[].manifestSha256` change there (#94 review 5970180529); `contracts/c03-catalog-manifest.schema.json` is unchanged. The build ships all 136 Mark packs in `ready.json`, so S02–S04 open every Mark passage in both languages.
- **S03 shows every Mark row with its size** (#94, the train's only pixel change). Rows read "≈N parts · N KB" (measured) instead of "not yet in English". The two baselines `e2e/visual-baseline.spec.ts-snapshots/S03-pericopes-{light,dark}-chromium-linux.png` were re-rendered in the CI image (artifact `visual-baselines` of run 37128861882, commit `3417165`); the other 50 are unchanged.
- **Content checks in CI** (#94). `pipeline/src/content-check.mjs` and `npm run check:content` (in the `pipeline` job with `--chars`, `.github/workflows/ci.yml:121`) check every pack: each guide step has units; every verse of the range has text in each edition, with bridged verses counted and the five verses BSB/ASBRT omit by design (7:16, 9:44, 9:46, 11:26, 15:28) listed in `KNOWN_OMISSIONS`; the language's own editions are present; fallbacks are badged and never AI; every rights line resolves to `data/rights/records.json`; AI slots carry `ai: true`. At `e9bcac4`: 139 packs, 0 problems, 6 omitted verses. `--chars` sums narration characters per language for the voice ASK.
- **URL check, weekly** (#94). `npm run check:urls` (`pipeline/bin/check-urls.mjs`) checks that every image, map, video and term-audio URL a pack points at answers 200, and that each Aquifer source file answers 200 at its pinned sha. It is network-bound, so it is not a PR gate: `.github/workflows/content-urls.yml` runs it on `workflow_dispatch` and on Mondays at 09:17 UTC.
- **Per-pack app walk** (#94). `e2e/mark-walk.spec.ts`, in the new CI job `mark-walk` (`.github/workflows/ci.yml:84-100`), opens each of the 136 packs on S04, walks every visible part to S18 with the big button, opens every key term, image, map and video once, and fails on any console error or missing string. It shoots the first and last step at 390×844 and 1280×800 (artifact `mark-walk-shots`). The `check` job skips it (`--grep-invert "visual-baseline|mark-walk"`, `:38`). `e2e/f6-s03-pericope-list.spec.ts` and `e2e/nopack.spec.ts` now prove "not yet" on a build that withholds `eng.MRK-1-14-20`.
- **Sync `main` → `v2/integration`** (#91): no file change. It brought the train-3 merge commit `62d1130` into integration. `git diff 8ead939^1 8ead939` and `git diff origin/main 8ead939` are both empty.
- **Release prep** (#95): no app change. The version goes to 0.3.4 in `package.json` and the `package-lock.json` root, with this entry and the train note.

### Known gaps

1. **Narration for Mark is held** (#94 item 4, on the unit's ASK.md). Every Mark pack ships text only; S08's playing-state lines still need a reading clip (0.3.3 gap 5).
2. **Follow-ups from #94's reviews** (YES comments 5970180529 and 5970374106, all non-blocking).
   - `.github/workflows/ci.yml:120` still says `check:urls` "runs outside CI"; it now runs in `content-urls.yml`. Release prep carries only the version and the entry (RELEASING.md step 3), so the fix is left for a PR into `v2/integration`.
   - `KNOWN_OMISSIONS` (`pipeline/src/content-check.mjs:14-16`) is keyed by book, not by edition, so a future pipeline loss of one of those five verses would read as "omitted". Today's data is correct: the reviewer checked both upstream files at their pins.
   - `e2e/mark-walk.spec.ts:207-219` opens each resource by direct route, not by tapping its sheet, so it proves every resource renders but not the tap path.
   - Packs are in git (`data/packs` is 33 MB), which `BUILD-ORDER.md:19` and `:27` ("nothing goes into git") contradict. The tension needs a ruling.
   - Design lens: on a built, unsaved S03 row the parts count is still the catalog estimate (eng 1:1–13 "≈108 parts"; the pack has 117 visible parts); measured sizes read 10–20× the mock's illustrative ones; Spanish S03 shows English UI words, because `src/i18n` has only `en.json` (not new in this train).
3. **Carried forward from 0.3.3, not re-checked here.** Train 4 changes no file in `src/`, so 0.3.3 gaps 1–5 (shared-layer follow-ups, the gate's `VISUAL` pattern, the `S04-passage` flake, S06 clip-error, Mark 1:1–13's part count, mock deltas) and 0.3.0 gaps 5, 6, 7 and 9 stand as written there. 0.3.1 gap 3 ("content is still five packs") is closed for Mark in English and Spanish: 139 packs ship.

## 0.3.3 — Train 3: the shared layer (2026-10-03)

Train 3 runs `v2/integration` → `main` as one PR (cookbook `work/active/2026-10-01-fia-alpha-v2/RULING.md` § ~19:55 ET (c)). It brings the consolidation pass from RULING 2026-10-02 ~20:05 ET (b): one shared app layer styled by one stylesheet, with per-screen CSS kept to layout. The pass landed as lift 1 (#84) and lift 2 (#88), guarded by the visual baselines from #79. This closes 0.3.2 known gap 2 (0.3.1 gap 2). Behaviour, routes and strings are unchanged. #84 made two deliberate pixel changes to match the mock; #88 moved no pixel. Each PR merged into `v2/integration` on a recorded fresh YES at its merged head. Train 2 (0.3.2) is on `main` `8db70ba` and `staging` `35a596c`. Production stays 0.3.1 (`548ceb6`) until the captain merges the promotion PR #87.

The PRs come from `git log --merges --first-parent origin/main..origin/v2/integration`: #85 #79 #84 #88. This release prep (#89) merges after the entry is written and cannot list itself. #84 and #88 carry notes in `release/changes/`. #79 and #85 have none, so their lines come from the PR descriptions and the merge diffs. Every line below was checked against the code at `7703a7a`. Train note: [`release/changes/0.3.3-train-3-shared-layer.md`](release/changes/0.3.3-train-3-shared-layer.md).

- **Visual baselines for every glass screen and sheet** (#79). `e2e/visual-baseline.spec.ts` captures 26 shots (S01–S19, S09b, SH-1 to SH-5 and the Explore sheet) at 390×844 in light and dark. That makes 52 PNGs in `e2e/visual-baseline.spec.ts-snapshots/`, compared with `maxDiffPixelRatio: 0.002` (`e2e/visual-baseline.spec.ts:273`). State is seeded, remote requests are stubbed or aborted, and storage estimates are fixed. `npm run test:visual` runs only this spec. In CI, a new `visual` job runs it inside `mcr.microsoft.com/playwright:v1.56.1-noble` (`.github/workflows/ci.yml:50-54`), and the image tag matches `@playwright/test` 1.56.1. `e2e/visual-fonts.conf` puts Liberation first for the generic font families, so bold and italic stay visible in the image. The `check` job skips the spec (`.github/workflows/ci.yml:37`). If the job fails, it uploads `visual-results` and `visual-baselines`. Test and CI only; no app change.
- **Shared layer, lift 1** (#84): `src/frame/` is the shared app layer, ported from the nodded mocks (`_frame.js`, `_frame.css` @19763f3). Its one stylesheet, `src/frame/frame.css`, is imported once and last. Screens compose `Header`, `GuideCard`, `Group`, `BeadLegend`, `KINDS` and the text and scale helpers instead of drawing their own copies. `ScreenFrame` takes `frame="guide"` (S05, S06, S08, S09), and `src/settings/apply.ts` sets `html.fia-scaled` and `html.fia-big` for the large-text rules. The copies are deleted: six CatalogRow title rules, five sr-only blocks, six KIND tables, four kind alias blocks, the dark badge and well copies, and S06's frame. A new gate, `npm run check:css` (`scripts/check-css-budget.mjs`, run in `.github/workflows/ci.yml:30`), fails on a new stylesheet or on a file past its ceiling in `scripts/css-budget.json`. Pixels change twice, both to the mock. S09 and S09b rows take the shared CatalogRow title rule, so at 200% and 310% text their titles grow and the pages get longer. Explore's two wells are smoked in dark. Note: [`release/changes/shared-layer-lift.md`](release/changes/shared-layer-lift.md).
- **Shared layer, lift 2: per-screen CSS is layout only** (#88). Every visual declaration in `src/screens/*.css` moves into `src/frame/frame.css`, or is dropped where a shared rule already set it. The same goes for the S14–S17 blocks of `src/tokens/alpha.css`. Screens compose the shared parts, faces and tones by name. `check:css` now fails on any visual declaration in a per-screen sheet (`screenVisual: 0`). It also fails if the `alpha.css` hand-written block grows past `alphaVisual: 5`, which counts the root, body and aurora ground. Each failure names `file:line` and the property. Measured: per-screen visual declarations 143 → 0, and the `alpha.css` S14–S17 blocks 148 → 0. No pixel moved, and no baseline was refreshed. Note: [`release/changes/shared-layer-lift-2.md`](release/changes/shared-layer-lift-2.md).
- **CSS across the train** (`npm run check:css`, using the head's script on each tree):

  | | `main` `8db70ba` | lift 1 `3be02f0` | head `7703a7a` |
  | --- | ---: | ---: | ---: |
  | CSS lines (`src/`, vendor excluded) | 4,810 | 4,521 | 4,627 |
  | `!important` | 228 | 203 | 198 |
  | per-screen files (`src/screens/*.css`), lines | 1,679 | 1,338 | 1,138 |
  | per-screen visual declarations | 247 | 143 | 0 |
  | `alpha.css` hand-written visual declarations | 160 | 153 | 5 |

  The nine per-screen sheets remain, with layout only. The total rose in lift 2 because the shared faces and the S17 block cost lines once (#88).
- **Sync `main` → `v2/integration`** (#85): no file change. It brought the train-2 merge commit `8db70ba` into integration. `git diff af9dee7^1 af9dee7` and `git diff origin/main af9dee7` are both empty.
- **Release prep** (#89): no app change. The version goes to 0.3.3 in `package.json` and the `package-lock.json` root, with this entry and the train note.

### Known gaps

1. **Per-screen CSS consolidation (0.3.2 gap 2, 0.3.1 gap 2): done by #84 and #88, in this train.** `src/screens/*.css` holds 0 visual declarations, and the gate holds it there (`scripts/css-budget.json` `screenVisual: 0`). Follow-ups from the PRs are still open (#84 follow-ups 1–8; #88 follow-ups 1, 3, 4 and 5, with 2 and 6 in gap 2 below). They include the visible text-primitive and primary swaps, and the component sheets the gate does not cover (`src/flow/ui/guide.css`, `src/offline/offline.css`, `src/offline/SaveRow.css`, `src/components/DownloadTierPicker.css`, `src/components/LanguagePicker.css`, `src/components/PericopeCard.css`).
2. **Lift follow-ups named in #88's review** (YES comments 5966728607 and 5966794146, both non-blocking).
   - The gate's `VISUAL` pattern (`scripts/check-css-budget.mjs:62`) misses `-webkit-text-fill-color`, `mask`, `clip-path`, `text-underline-offset` and `color-scheme`. `alphaVisual` is a count, so a new visual declaration could replace one of the five root, body or ground declarations and still pass. If the `==== app overrides` marker (`:98`) goes missing, the script scans the whole file without saying so. `.fia-ff-numeric` (`src/frame/frame.css:579`) has no `var()` fallback.
   - S17's visuals moved as they were, under `.fia-install__*` (`src/frame/frame.css:614-743`). They were not folded into shared parts, because the drawings scale on their own capped `--k` (#88 follow-up 2).
   - The `S04-passage` visual baseline (`e2e/visual-baseline.spec.ts:63`) is flaky in CI. It differs by 1,628 px in light and 1,537 px in dark. It failed the `v2/integration` push run at `3be02f0` (run 37102624301), before #88. It also failed the first attempt in #88's PR run (37105073867) and passed on retry. The likely cause is the save-row state racing the shot; the spec should wait for that state (#88 follow-up 6). The push run at `7703a7a` (37106149761) passed 52 of 52.
3. **S06 has no clip-error handling of its own.** Re-checked at `7703a7a`: S06 still has no media element (`src/screens/S06SingleScript.tsx:64`). It passes `questionClip={null}` to sheet 21 (`:332`), so no clip can fail there today. The Guide's `clip-error` is in `src/flow/machine.ts:131-139`. This follow-up matters once S06 plays a clip.
4. **Mark 1:1–13's part count differs between S03 and S04.** Re-checked at `7703a7a`; train 3 changes none of the following:
   - S03 shows "≈108 parts". That is the catalog's `guide.unitsEstimate` (108 in `data/catalog/eng.json`), which the pipeline computes as the guide's bytes ÷ 260 (`pipeline/src/inventory.mjs:146`).
   - Once the guide is loaded, S03 shows 117: the parts walked, leaving out 13 hidden example parts (`src/screens/pericopeList.ts:50-52`, `:60-65`).
   - S04 says "130 parts", which counts every unit, hidden ones included (`src/screens/passageCard.ts:145-150`). The pack has 130 units, and 13 of them are hidden.
5. **Mock deltas the PRs leave as follow-ups.** Re-checked at `7703a7a`: train 3 does not touch S10, S11, S12 or sheets 22 and 23. S08 and S09 change only to compose `GuideCard` (#84).
   - S09: the "Later, before the talk" group and S09b's `ResourceCard` tiles (#70).
   - S08: the playing-state lines need a reading clip, and the pack has no Scripture narration yet (#66).
   - S10–S12: the layer primaries still render `ScreenFrame`'s v1 `PrimaryButton` (`src/screens/ScreenFrame.tsx:114`), not the mock's dark pill (#65, #68, #69; #84 follow-up 2). S11 and S12 still lack save-state lines (#68, #69).
   - Sheet 22 has no "What changed" list. The string `s.update.what-changed` exists (`src/i18n/en.json:876`), but no screen renders it. Sheet 23 has no Needs / Free bars (#76, #77).
6. **Carried forward.** Content is still five packs (0.3.1 gap 3). 0.3.0 gaps 5, 6, 7 and 9 also carry forward. Gap 7 was re-checked: `VersionBanner` is still mounted only in `src/screens/S13DownloadsOffline.tsx:214`. Gaps 5, 6 and 9 were not re-checked.

## 0.3.2 — Train 2: the remaining screens in glass (2026-10-03)

Train 2 runs `v2/integration` → `main` as one PR (cookbook `work/active/2026-10-01-fia-alpha-v2/RULING.md` § ~19:55 ET (c)). It brings the screens and sheets that train 1 left out (0.3.1 known gap 1), the Guide clip-error fix (0.3.1 known gap 4) and the fix-forward for #73's quiet buttons (#81). Each feature PR merged into `v2/integration` on a recorded fresh YES at its head. Production stays 0.3.1 (`548ceb6`) until this version is promoted.

The PRs come from `git log --merges --first-parent origin/main..origin/v2/integration`: #64 #65 #66 #68 #69 #71 #74 #73 #76 #77 #70 #80 #81. The release-prep PR that adds #81 to this entry merges after it is written and cannot list itself. Every feature PR and fix carries its note in `release/changes/`. The lines below come from those notes, checked against the PR descriptions and the code at `803a96b`; #81's line is checked at `d0fea2b`. Between the two, only #80 (version, entry, train note) and #81 changed files. Train note: [`release/changes/0.3.2-train-2-remaining-screens.md`](release/changes/0.3.2-train-2-remaining-screens.md).

- **S08 Scripture reader** (#66): the guide card's Text view, built from S05's parts. It has the progress band at the guide's position, the card with Text active, the voice chip (→ sheet 20), the edition on kit `GlassSelect`, "Play this verse again", the passage in the card body and the thumb zone. v1 behaviour is kept: tap a word or verse to seek, switching edition keeps the verse, the untimed notice shows once per session, and there is no disabled primary when there is no clip. Note: [`release/changes/f6-s08-scripture-reader.md`](release/changes/f6-s08-scripture-reader.md).
- **S09 Resources** (#70): the card's Resources view lists the part's own resources under "In this part" (`CatalogRow` rows with a quiet (i) → sheet 20). One row, "All resources for this passage", opens S09b: the whole-passage catalog with `GlassSearch`, `FilterChips` (one type at a time, counts inside) and one exit, "‹ Back to part n". The card view has no primary. Explore's row opens S09b too. The PR description still describes its first head (`6c5b121`, the whole catalog inside the card); the reviewed head `5faf502` moved the catalog to S09b, as the note says. Note: [`release/changes/f6-s09-resources.md`](release/changes/f6-s09-resources.md).
- **S10 Key term** (#65): a Layer frame with one labelled way back in the glass header. The term is set large with its ◆ kind bead and the line "Key term · FIA" (shared `LayerHead`). The mark is a `ProvenanceChip`, the definition sits on a kit `GlassSurface`, and there is one primary: Play, Pause, Resume or Play again. It never autoplays (R-407). Note: [`release/changes/f6-s10-key-term.md`](release/changes/f6-s10-key-term.md).
- **S11 Image / map viewer** (#68): a Layer frame. The image comes first, in the shared dark media well, with pinch-zoom and double-tap (R-507). Then the ▲ kind line, the title and the chips: "About this image", or "Map in English · not yet in {language}". Describe stays disabled while the description is not made (R-509). The primary is the way back. Note: [`release/changes/f6-s11-image-viewer.md`](release/changes/f6-s11-image-viewer.md).
- **S12 Video** (#69): a Layer frame. The video plays in the dark well and never autoplays, under the kind line "Video Bible Dictionary · streams" and a source chip (→ sheet 20). Offline, the well reads "Needs connection" and the primary is the way back (R-506). Note: [`release/changes/f6-s12-video.md`](release/changes/f6-s12-video.md).
- **S13 Downloads** (#73): a Layer frame with "‹ Back to {ref}" in the header, group overlines, and pack cards on kit `GlassSurface` with the kit `SyncBadge`. Card actions use the shared `QuietAction`. The v1 catalog row "Catalog + text (all languages) ✓", which was missing, is back. v1 strings and behaviour are unchanged. Note: [`release/changes/f6-s13-downloads.md`](release/changes/f6-s13-downloads.md).
- **S13's quiet actions reuse the shared quiet button** (#81, fix-forward for #73). `QuietAction` renders the shared `.fia-btn .fia-quiet` from `src/flow/ui/guide.css` (`src/components/QuietAction.tsx:20`), the mock `Quiet`'s classes, and `src/components/actions.css` keeps only `.fia-kit-primary:disabled`. The second `.fia-quiet` that #73 added had repainted every shipped quiet button (S05, S06, S08, sheets 21 and 24, `DiscussionStopBand`, `AudioControls`); they go back to the kit's muted rgb(71, 80, 96) in light (rgb(201, 206, 214) in dark), from rgb(36, 44, 58). `src/offline/offline.css` drops `.fia-dl__confirm`, a copy of `.fia-dl__band`; the Remove confirms on S13 and sheet 23 use `.fia-dl__band`. On S13 and sheets 22 and 23, every quiet action keeps its size, position and padding. Note: [`release/changes/fix-s13-quiet-reuse.md`](release/changes/fix-s13-quiet-reuse.md).
- **Sheet 22 Update notice** (#76): the pack line under the title and the revision and download size on a glass well. Keep and Later are quiet, and there is one dark `KitPrimary` with a glyph. Offline, the primary reads "— needs connection" and is disabled; before, it looked tappable but had no handler. Note: [`release/changes/f6-sh22-update-notice.md`](release/changes/f6-sh22-update-notice.md).
- **Sheet 23 Storage warning** (#77): the largest saved packs on a glass well. Each Remove asks first and names what is lost (R-311), and the sheet says "Nothing is deleted automatically." One dark `KitPrimary` with a glyph. Note: [`release/changes/f6-sh23-storage-warning.md`](release/changes/f6-sh23-storage-warning.md).
- **Sheet 24 Forward-jump guard** (#64): rises over S07. It draws the jump as coded beads (kit `BeadStrip`) and names the talk in words. Two quiet buttons, "Stay here" and "Go ahead anyway", and one primary, "Go to the talk first". It asks once per talk per session (R-412), and going ahead never marks a talk done (R-410). Note: [`release/changes/f6-s24-jump-guard.md`](release/changes/f6-s24-jump-guard.md).
- **Guide: a clip that fails to load never traps the guide** (#71). A new machine event, `clip-error` (`src/flow/machine.ts:131-139`), lets the part go on: the primary reads "Next part", or "Finish" on the last part, which reaches S18. It never counts down, and a quiet "Try again" reloads the clip. One voice rule, `voiceOf`, now serves S02, S04 and S05, so Mark 1:1–13 reads "AI voice" on all three; S02 and S04 used to say "Text · voice not yet". This closes 0.3.1 known gap 4. Note: [`release/changes/fix-guide-clip-error.md`](release/changes/fix-guide-clip-error.md).
- **Shared layer, styled once** (carried by the PRs above):
  - `ScreenFrame` `close` (the layer's way back), `LayerHead`, `AudioControls` `hideMark`, and the `src/app.css` layer block with the dark media well (#65, #68, #69).
  - `QuietAction`, `KitPrimary` `disabled`, `src/components/actions.css`, and `src/offline/offline.css` restyled on kit tokens (#73, #76, #77). #81 moved `QuietAction` onto the shared `.fia-btn .fia-quiet`.
  - The `GlassSelect` wrapper and optional `GuideTransport` sides (#66). S05's frame rules in `src/flow/ui/guide.css` now also select S08 and S09 through `:is()` (#66, #70).
  - No new per-screen stylesheet in this train. 14 new string keys: 13 `s.jump.v2.*` and `s.guide.voice-not-yet`.
- **Sync `main` → `v2/integration`** (#74): no app change. It brought `server/SPEC.md` and `contracts/README.md` (#49, already on `main`) and an allow-rule sync in `.claude/settings.json` (`b5d867d`) into integration. It adds nothing new to `main`: `git diff origin/main origin/v2/integration` touches none of those files.
- **Release prep** (#80): no app change. The version goes to 0.3.2 in `package.json` and the `package-lock.json` root, with this entry and the train note.

### Known gaps

1. **Quiet buttons on screens shipped in 0.3.1 rendered darker after #73. Fixed by #81, in this train.** #73 merged on a YES. A HOLD came after the merge (rev-L3-r1-2021, issue comment 5964611068): #73 defined `.fia-quiet` a second time, and its `color: var(--text-body) !important` repainted every quiet button with no more specific rule. The reviewer measured light going from rgb(71,80,96) to rgb(36,44,58). #81 (branch `claude/blissful-bohr-t7m7it-l3-s13-fix`, head `3cf1253`) removed that rule and merged into `v2/integration` as `d0fea2b` on a YES at that head (issue comments 5964918879 and 5964976009). `QuietAction` now uses the shared `.fia-btn .fia-quiet` (`src/flow/ui/guide.css:389-401`), and `src/components/actions.css` holds only `.fia-kit-primary:disabled`. #81 measured the fix on S13 and sheets 22 and 23. The train review on PR #82 measured S05's Back and Skip at rgb(71,80,96) in light and rgb(201,206,214) in dark. S07 and S09 also use `.fia-quiet` and were not measured.
2. **Per-screen CSS consolidation is in flight, not in this train** (0.3.1 gap 2). This train adds no per-screen stylesheet, but the earlier ones remain: `src/screens/S01FirstRunLanguage.css`, `S02Library.css`, `S03PericopeList.css`, `S04PassageCard.css`, `s06.css` (a copy of S05's frame rules, per #66), `S07Overview.css`, `S18Completion.css`, `S19Coverage.css` and `l5-shell.css`. The shared-layer lift runs as its own PR (cookbook `CLAIM.md`, 2026-10-02 22:33 ET). No fia-app PR is open for it at this prep.
3. **S06 has no clip-error handling of its own.** #71's note leaves this as a follow-up. Checked at `803a96b`: S06 has no media element and plays nothing (`src/screens/S06SingleScript.tsx:63`), and it passes `questionClip={null}` to sheet 21 (`:327`). So no clip can fail there today. The follow-up matters once S06 plays a clip.
4. **Mark 1:1–13's part count differs between S03 and S04.**
   - S03 shows "≈108 parts". That is the catalog's `guide.unitsEstimate` in `data/catalog/eng.json`, which the pipeline makes from the guide's bytes ÷ 260 (`pipeline/src/inventory.mjs:146`).
   - Once the guide is loaded, S03 shows 117: the parts walked, without the 13 hidden example parts (`src/screens/pericopeList.ts:50-51`, `:59-64`).
   - S04 says "130 parts": every unit, hidden ones included (`src/screens/passageCard.ts:145-148`).
5. **Mock deltas the PRs leave as follow-ups.**
   - S09: the "Later, before the talk" group and S09b's `ResourceCard` tiles (#70).
   - S08: the playing-state lines need a reading clip, and the pack has no Scripture narration yet (#66).
   - S10–S12: the layer primaries still use the v1 blue `PrimaryButton`, not the mock's dark pill (#65, #68, #69). S11 and S12 lack save-state lines (#68, #69).
   - Sheet 22 has no "What changed" list, and sheet 23 has no Needs / Free bars. Both need data or new strings (#76, #77).
6. **Carried forward.** Content is still five packs (0.3.1 gap 3). 0.3.0 gaps 5, 6, 7 and 9 also carry forward. Gap 7 was re-checked: `VersionBanner` is still mounted only in `src/screens/S13DownloadsOffline.tsx`. Gaps 5, 6 and 9 were not re-checked.

## 0.3.1 — Train 1: v2 glass journey (2026-10-03)

Train 1 runs `v2/integration` → `main` as one PR (cookbook `work/active/2026-10-01-fia-alpha-v2/RULING.md` § ~19:55 ET (c)). It brings the lane-F screens that put the journey in BT Glass. Each one merged into `v2/integration` on a recorded fresh YES at its head. 0.3.0 (`main` `8346fe4`) was never promoted, so production stays 0.2.1 until this version is promoted.

The PRs come from `git log --merges --first-parent origin/main..origin/v2/integration`. None of them added a note in `release/changes/`, so the lines below come from the merge log and the PR descriptions. Train note: [`release/changes/0.3.1-train-1-glass-journey.md`](release/changes/0.3.1-train-1-glass-journey.md).

- **Not-yet passages** (#55, GAP-NOPACK): the build writes `dist/data/catalog/ready.json` (beside the catalog), which lists the packs it ships. A passage with no pack now shows the absent badge and reads "not yet in English", where 0.3.0 showed "Could not read this passage's details". Ready passages sort first. If the index can't be read, nothing is marked. This takes the error out of 0.3.0 known gap 2; content is still five packs.
- **S01 First run · language** (#54): kit `LanguagePicker` over the catalog, autonym first. Linear frame with the 44 px lockup hero and one primary, "Continue in {autonym}".
- **S02 Library** (#52): one kit `CatalogRow` per book, with a saved count and a voice line. Passages are listed by reference. The "Where you left off" recap uses kit `StageRail` and `BeadStrip`, and one primary is either "Continue {ref}" or "Open Mark". Ready passages come first.
- **S03 Passage list** (#58): one kit `CatalogRow` per passage on a `GlassSurface` well, each opening S04. A Select mode (J-A2, R-308) shows its state on the kit `GlassChip` (Saved, Selected or Add, FE-2) and saves the chosen passages one at a time at the Text tier.
- **S04 Passage card** (#57): the reference as hero, the voice chip, an Includes legend drawn with kit progress `Bead`s (a kind the pack lacks gets no row), Save for offline on kit `GlassSegmented` with the tiers the data allows, and one primary, "▶ Start {ref}".
- **S06 Read without voice** (#60): the S05 Guide view with voice off, built from F4's frame and F5's shared parts, not a fourth view.
- **S07 Whole guide map** (#62): kit `GlassSheet` opened from Explore. It shows a legend of the guide's coded beads, the step rows, and one primary, "Back to part n".
- **S18 Completion** (#61): a recap plate on kit `StageRail` and beads, with the next passage as the one primary.
- **S19 Coverage** (#59): six kit type cards read from the catalog (Guide, Scripture, Key terms, Images, Maps, Videos), each with a Text cell and an Audio cell. There is no primary, as in the mock.

### Known gaps

1. Not every screen is in glass yet. S08–S13 and sheets SH-3 to SH-5 are not cooked yet (cookbook `work/active/2026-10-01-fia-alpha-v2/SPRINTS.md`, handoff fia-app-sched-1657).
2. Each screen brings its own stylesheet instead of composing shared app components styled once (captain, RULING § ~20:05 ET). A consolidation pass follows this train as its own PR.
3. Content is still five packs (0.3.0 gap 2); other passages now read "not yet" instead of an error.
4. The Guide can't finish if the last part's clip fails to load. On part 10 of step 6, Skip is disabled. After "This narration could not load", the primary reads Continue, but it retries the clip, so S18 never opens (`src/screens/S05Guide.tsx:356-360`, `src/flow/machine.ts:202-203`, `:235-236`). Seen on a local preview at 390×844, where the PoC clip host failed TLS in the sandbox (0.3.0 gap 10). S18 itself renders in glass when opened from a finished record.
5. 0.3.0 gaps 5, 6, 7 and 9 (feedback endpoint, analytics disclosure, update banner only on S13, cosmetic leftovers) are carried forward. This train did not re-check them.

## 0.3.0 — First v2 cut (2026-10-02)

First v2 cut, shipped in phases (captain order 2026-10-01). Gathered from `release/changes/` since 0.2.1 and from every PR merged on `main` since production `dc8ff06` (`git log origin/production..origin/main --merges`): 36 PRs between #11 and #50. Train note: [`release/changes/0.3.0-first-v2-cut.md`](release/changes/0.3.0-first-v2-cut.md).

- **Library loads: pipeline data ships with the build** (#11): `data/` (catalog, rights, packs) is copied into `dist/`, so the content journey gets past S02 (on 0.2.1 it stops at "Could not load the library."). Media screens read `/packs/<id>/…`; `fia-release` meta reads `<version>+<sha7>`. Note: [`release/changes/fix-ship-data.md`](release/changes/fix-ship-data.md).
- **Save for offline** (#14, #17, #18): ⊘ Offline chip and needs-connection rows (R-702); S04 save row with tier picker, sizes and Save (R-306/307/309); catalog tier sizes match the pack manifests (R-307).
- **Feedback client** (#15, #34): outbox sends and flushes, with context chips (R-705 client); S16 attach line reads "part n of m". The server route is not live (known gap 5).
- **BT Glass shell and skins** (#13, #22, #24–#26, #28–#30, #32, #36, #38, #40, #41, #44): F4 glass shell (kit vendored, glass header and Explore, no bottom bar); F6 skins for S14 Settings, S15 About and rights (pack holder and licence lines), S16 Feedback and S17 Install guide, with their review follow-ups; sheet scrim, focus trap and brand row; SH-2 sheet action above the dock.
- **Kit re-vendor** (#50): BT Glass at `ad528f4` (17 v2 icons, self-hosted Noto scripture faces, `GlassCheckbox`, `CountdownRing` / `StageRail` / `BeadStrip`, not yet wired into screens); Noto Serif TC stays out of the offline shell. Note: [`release/changes/kit-revendor-fonts.md`](release/changes/kit-revendor-fonts.md).
- **Content pipeline** (#20, #21, #23, #27, #31, #33, #35, #37, #39): Mark 1:1–13 narration plan carries every PoC-floor slot (B2-prep); 21 key terms from `term-supplements.json` (BL5); each pack carries holder and licence per source from the C-13 rights record (BL8, hardened in #31, pipeline tests gate CI); autonyms, `next-` clip ids and the hidden-example anchor in any language (BL2/6/7); next-action scripts and description texts (BL9); Spanish text step strips AI sentence-start filler (V1-6); short visual descriptions on the M9 shared-base model (V1-4, follow-ups #39).
- **Passage titles** (#42, #43, #45–#48): contracts C-03/C-06/C-10/C-13 1.1.0 for pericope subtitles (BL4b); Bible section headings gathered per Mark pericope (BL4a); text route with a pinned `claude-opus-5-5` client, mock test and CI secret slot (BL4c); subtitle generator (rung, key, cache, ledger, caps), no live calls (BL4d); hardening (#46); `subtitleMode` setting, S14 "Passage titles" switch and S01 summaries line (FS-2).

Also on `main`: five direct commits that sync agent allow rules in `.claude/settings.json` (no app change). Notes in `release/changes/` since 0.2.1: `fix-ship-data.md` and `kit-revendor-fonts.md` only; the other PRs carry no note, so their lines above come from the merge log.

### Known gaps (shipping in phases)

1. Offline save does not cover the Guide (P1; elevate to a blocker if the first cut must meet the 20:41 'verified offline save' floor). S04 says 'Saved (Text, 0.5 MB)' and S13 lists 'MRK 1:1–13 · Text ✓'. With the network gone, S04, S05, S06 and S07 show 'Could not read this passage's details. Try again'; only S08 Scripture opens. Cause: src/flow/catalog.ts reads /data/packs/<id>/guide.json and guide-units.json (and S04 also reads /data/catalog/manifest.json). The Text tier saves /packs/<id>/… paths instead. Not a regression: production has no packs at all. _(Closed before this cut: GAP-OFFLINE #56 merged on `main` ahead of the prep PR #53. Note: [`release/changes/fix-offline-pack-paths.md`](release/changes/fix-offline-pack-paths.md).)_
2. Content is one English pack. Only eng.MRK-1-1-13 exists in English (5 packs in all: eng/spa/tpi Mark 1:1–13, arb GEN-1-1-2-3, hau LUK-6-17-19). The library lists about 1,900 English guides; every other passage (checked Mark 1:14–20, Mark 8:1–10, Genesis 1:1–2:3, John 1:43–51) dead-ends at S04 with 'Could not read this passage's details. Try again'. No crash. Suggest a quick 'not yet' label or hiding passages that have no pack.
3. No audio on S05 ('AI voice not yet available'); F5's stand-in is not on main yet. _(Closed before this cut: F5 #51 merged on `main` ahead of the prep PR #53; see Next.)_
4. Most screens are still unskinned (the captain called this mix 'fugly'). Glass header, but raw lists elsewhere: S05 progress shows as plain numbered lists with blank items 1–8; S02 books, S08 edition tabs and S05 view tabs are default buttons. S08 heading reads 'MRK 1:1-13' and the edition line 'BereanStandardBible'. F5/F6 skins pending.
5. Feedback endpoint is not live. DEV and prod are assets-only Workers, so POST /api/feedback returns 405; the C-16 Worker route (owner Otto) is missing. The app queues honestly ('Waiting to send') and retries with backoff, which leaves 405 noise in the console.
6. Analytics vs. the About screen. Cloudflare Web Analytics adds its beacon (static.cloudflareinsights.com) at the edge on both dev and production; the same beacon is already live on production, so not a regression. S15 says 'Count anonymous usage … Off'. Needs Otto or the captain to decide on the zone setting or the disclosure.
7. Update banner only on S13. The 'New version ready · Reload' banner is mounted only on S13 Downloads, although the VersionBanner comment says S05/S06/S08 host it. Users elsewhere get the update when the app is next closed and reopened (verified).
8. Release prep not done (RELEASING step 3). package.json is still 0.2.1, the same as production v1, so the two builds differ only by the +sha in fia-release. No CHANGELOG entry yet. _(Closed by this entry and the 0.3.0 bump once merged.)_
9. Cosmetic leftovers. Without a current pack, S15 shows the licence-file holder only ('Word Collective'); with the pack it shows both holders. The licence notice shows raw JSON. Requests for SF-Pro-\*.otf get the SPA fallback (200 text/html, no font binaries shipped, falls back to system font). Interface text and the header chip stay English when the content is Spanish or Tok Pisin.
10. Sandbox limit, not an app fault. Here Chromium rejects the session proxy CA (ERR_CERT_AUTHORITY_INVALID), so smoke:deployed's browser test cannot hit https://dev.fiaguide.app directly from this sandbox. Covered by the relay run and by GitHub post-deploy (green).

### Next

- Guide audio is already in this cut: F5 (#51) plays the PoC's live Mark 1:1–13 clips (English) as a stand-in C-05 manifest. #51 merged on `main` before this entry's prep PR (#53), so 0.3.0 has it. This line used to say the audio "arrives in 0.3.1"; that was written before #51 landed and is corrected here.
- AI voice to become a clone of the FIA voice per language (queued).

## 0.2.1 — Alpha first train (2026-10-01)

First promotion of the Alpha app (dev → staging → production). Folds in the unreleased 0.2.0 scaffold below and every Alpha lane merged on `main` since.

- **L0 scaffold** (#1): Vite + React + TypeScript skeleton, PWA manifest, tokens, string catalog, screen and component stubs, 18 contract schemas, CI and Workers deploy config. Note: [`release/changes/0.2.0-l0-scaffold.md`](release/changes/0.2.0-l0-scaffold.md).
- **L1 pipeline** (#2): pinned Aquifer FIA → C-03 catalog (17 languages), C-02/C-04 content packs, C-13 rights records; runs server-side. No note in `release/changes/`; see [`pipeline/README.md`](pipeline/README.md).
- **L2 offline / PWA** (#6): C-07 offline engine ported from the PoC (verified save, resume, update, delete), shell precache, tap-to-apply update flow, install helpers. Note: [`release/changes/l2-offline.md`](release/changes/l2-offline.md).
- **L3 guided flow** (#3): guided-flow model, session state machine and workspace/completion persistence; screens S01–S07, S18, SH-2, SH-5. Note: [`release/changes/0.2.x-l3-guided-flow.md`](release/changes/0.2.x-l3-guided-flow.md).
- **L4 media** (#4): alignment, seek, provenance marks, narration and resources modules; screens S08–S12 and SH-1. Note: [`release/changes/0.2.x-l4-media.md`](release/changes/0.2.x-l4-media.md).
- **L5 shell** (#5): settings (C-10), rights (C-13), coverage, feedback outbox; screens S14, S15, S16, S19. Note: [`release/changes/l5-shell.md`](release/changes/l5-shell.md).
- **Promotion tooling** (#7): `dist/version.json` build stamp, deployed smoke, post-deploy workflow, `RELEASING.md`. Note: [`release/changes/0.2.0-promotion-tooling.md`](release/changes/0.2.0-promotion-tooling.md).

Known open items (as stated in the notes):

- Guided-flow countdown uses 2 s; PRD R-408 cites the PoC's 750 ms — pending a ruling (L3).
- Real-device iOS install verification (R-906) and Lighthouse (R-707) not run (L2).
- Feedback endpoint is a stub; submissions queue locally (L5).
- Narration audio absent: L1 ships `narration.json` empty; screens show the absent mark (L4).

## 0.2.0 — L0 scaffold (folded into 0.2.1)

- Fresh Alpha skeleton: Vite + React + TypeScript, PWA manifest, tokens from `design/tokens.json`, string catalog from the screen specs, 24 screen stubs, 20 component stubs, 18 contract schemas with an ajv example test, CI and Workers static-assets deploy config.
- Versions 0.1.x belong to the functional PoC (`klappy/fia-functional-poc`), reference only.

# All of Mark in English and Spanish: 136 text packs, content checks, the app walk

Branch `claude/blissful-bohr-96unp6-mark-full` (base `v2/integration`). Cookbook unit
`work/active/2026-10-03-fia-mark-full-eng-spa` (captain 2026-10-03 ~08:35 ET: "the whole book of mark
for english and spanish as fully populated and tested"), items 1–3. Item 4 (narration) is held on that
unit's ASK.md: no voice is generated here, every `narration.json` still ships `entries: []`.

## What changes

- **136 packs.** `data/packs/{eng,spa}.MRK-*`: every Mark pericope Aquifer has in each language (68 + 68,
  ids from `data/catalog/{eng,spa}.json`), built by the existing pipeline at the pins in
  `pipeline/sources.json`, text tier only. The two 1:1–13 packs are kept byte-identical (the batch skips
  a pack already on disk unless `--force`). New CLI: `npm run book -- MRK eng spa`
  (`pipeline/bin/build-book.mjs`).
- **Catalog.** `npm run catalog` re-run so all 136 entries carry `tierBytesSource: "pack-manifest"`.
  With 139 built packs measured, the text estimate calibration for every unbuilt entry (all 17
  languages) moves to ×5.058 (R-307), so every estimate in `manifest.json` shifts; the build ships all
  136 in `ready.json`, so S02–S04 open every Mark passage in both languages.
- **Content checks** (`pipeline/src/content-check.mjs`, `bin/check-content.mjs`,
  `test/content-check.test.mjs`; in CI through `npm test` plus `npm run check:content -- --chars` in
  the `pipeline` job): every guide step has units; every verse of the range has text in each edition
  (bridged verses like "5:7-8" count; the verses BSB/ASBRT omit by design — 7:16, 9:44, 9:46, 11:26,
  15:28 — are listed in `KNOWN_OMISSIONS`, never silently skipped); the language's own editions are all
  present as source; fallbacks are badged and never AI; every rights line resolves to
  `data/rights/records.json` and every source revision has a line; AI slots carry `ai: true`.
  `--chars` sums the narration characters per language from `narration-plan.json` for the voice ASK.
- **URL check, outside CI** (`npm run check:urls`, `pipeline/bin/check-urls.mjs`): every
  image/map/video/term-audio URL a pack points at answers 200, and the Aquifer file it was read from
  answers 200 at the pinned sha. Network-bound (S3, GitHub raw), so it is not a CI gate.
- **App walk** (`e2e/mark-walk.spec.ts`, CI job `mark-walk`): per pack, S04 opens it, the big button
  walks every visible part to S18, every key term, image, map and video opens once, no console error,
  no missing string; first and last step shot at 390×844 and 1280×800 (artifact `mark-walk-shots`);
  S03 lists all 68 with measured sizes per language; Save for offline on the last passage per language.
  The main `check` job skips it (`--grep-invert "visual-baseline|mark-walk"`).
- **Specs that assumed one Mark pack**: `e2e/f6-s03-pericope-list.spec.ts` and `e2e/nopack.spec.ts`
  now prove "not yet" on a build that withholds one pack (ready index without it, pack files 404).

## Pixels

S03's baseline changes by intent: every Mark row now shows its measured size instead of "not yet in
English". The two S03 PNGs are re-rendered in the CI image (the `visual-baselines` artifact), never by
hand.

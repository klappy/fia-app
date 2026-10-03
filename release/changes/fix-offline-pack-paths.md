# fix — a saved passage opens offline (one pack path)

Branch `claude/blissful-bohr-2wnr60-offline` (base `main`). GAP-OFFLINE from the DEV smoke at
`6eb6f1d`.

## Bug

S04 said "Saved (Text, 0.5 MB)" and S13 listed the pack, but offline S04, S05, S06 and S07 read
"Could not read this passage's details." The guided flow read the guide from
`/data/packs/<id>/guide.json` and `guide-units.json`, while a Text save stores the pack's C-02
paths, `/packs/<id>/…`. The build shipped every pack twice, so online both worked and the gap
only showed with the network gone.

## What changes

- `src/flow/catalog.ts` — the guide (S04–S07, S18) reads `<content base>/packs/<id>/…`, the C-02
  paths a save stores and the worker serves; the catalog manifest stays under `/data`.
- `src/settings/data.ts` — the pack rights line reads `packUrl(<id>, 'rights')` (same C-02 path).
- `src/offline/ship-data-plugin.ts` — packs ship once, at `/packs/<id>/`; `dist/data/packs/` is
  gone. One path per pack file.
- `src/screens/S04PassageCard.tsx` — the save row shows when the worker knows the pack, not only
  when the catalog is readable (the catalog is not part of a save), so offline S04 keeps
  "✓ Saved (Text, 0.5 MB)".
- Tests: `tests/offline.pack-paths.test.ts` (for every built pack, each file S04–S08 read is in
  its Text tier); `tests/ship-data.test.ts` (no `dist/data/packs`); `e2e/offline-passage.spec.ts`
  (save eng Mark 1:1–13, abort every request including the worker's, cold-open S04 → S08);
  `e2e/deployed.spec.ts` reads guide units at the C-02 path.

## Not in this change

- Offline S04 has no "Includes:" list: that list comes from the 7 MB catalog, which no save holds.
- `VITE_FIA_DATA_BASE` now moves only the catalog and rights records; packs follow
  `VITE_CONTENT_BASE`, like the media screens and the offline engine.

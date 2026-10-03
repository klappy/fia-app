# The Spanish UI catalog: app chrome in Spanish

Branch `claude/blissful-bohr-e2bu5m-spaui` (base `v2/integration`). Cookbook unit
`work/active/2026-10-03-fia-spanish-ui-strings`, DoD 1–3 (DoD 4, review and merge, is not this PR).

## What changes

- **`src/i18n/spa.json`**: all 891 `s.*` keys of `en.json`, an AI translation (Latin-American Spanish,
  `tú`, for oral Bible-study facilitators) until a human translation lands. Every `{placeholder}`,
  ICU plural block, clause keyword and `#` is kept.
- **`src/i18n/index.ts`**: `loadCatalog('spa')` imports it lazily (its own chunk, about 14 kB gzip,
  in `offline-shell.json` so it is precached, R-702). `setUiLanguage(code)` switches the active
  catalog; `t` reads whichever is active, with Spanish plural rules (`es` from `languages.ts`). A
  language with no catalog of its own switches to English instead of claiming an AI translation.
- **S01**: one pick sets the guide and the app (SB-3 (1), `s.lang.lede`): the pick saves
  `uiLanguage` too when it has a catalog (eng, spa), else English. `main.tsx` loads a saved non-English
  catalog before the first paint; `App.tsx` remounts the routes on a switch.
- **S14**: the Language row shows `s.common.ui-lang-ai` when the menus are not English
  (design/alpha-screens/README.md:43).

## Tests

- `tests/i18n-spa.test.ts`: key parity, placeholder parity, plural-clause parity, not-a-copy, lazy
  switch with Spanish plurals, no-catalog fallback. `tests/s01-language-glass.test.ts` checks the pick
  saves `uiLanguage`.
- `e2e/spa-ui.spec.ts`: S01 → S02 → S03 in Spanish, no raw keys (text and aria/placeholder/title),
  reload keeps Spanish; S14 shows the mark. `save-row`, `f6-s13-downloads` and `f6-sh23-storage` pick
  Español on S01, so their labels are now asserted in Spanish.
- Visual baselines and the mark walk seed `uiLanguage: 'eng'`, so no baseline is expected to change.

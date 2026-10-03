# Shared layer from the v2 mocks: one stylesheet, screens as compositions

Branch `claude/blissful-bohr-t7m7it-shared-layer` (base `v2/integration`). RULING 2026-10-02 ~20:05 ET
(screens are compositions of kit + a shared app layer styled by one stylesheet; per-screen CSS is layout
only) and ~21:00 ET (keep shipping; the from-scratch rebuild is v3). Borrowed from the nodded mocks,
cookbook `design/alpha-v2-screens/_frame.js` and `_frame.css` @19763f3.

## What changes

- `src/frame/` is the shared app layer. `frame.css` is its one stylesheet, imported once and last
  (`main.tsx`): the coded-mark tokens (`--fia-kind-*`, `--fia-dotring`), `.fia-sr-only`, the guide frame
  and thumb zone, the CatalogRow title rule, the dark `.fia-badge` and `.fia-well` rules, the logo
  qualifier, the legend, and the kit-sheet column. Parts named after the mock's `window.FIA`
  (`index.ts`): `Header` / `LangPill` / `ExploreButton`, `GuideCard`, `Group`, `BeadLegend` /
  `StatesKey` / `LegendWell`, `KINDS`, the text helpers and one text-scale reader.
- `settings/apply.ts` sets `html.fia-scaled` and `html.fia-big` beside `data-text-step`; the large-text
  selectors key on them at the same specificity.
- `ScreenFrame` takes `frame="guide"` (S05, S06, S08, S09) instead of per-screen frame CSS, and
  composes `Header`. `FiaLogo` takes `qualifier`.
- Deleted copies: the S06 frame and thumb CSS, five hand sr-only blocks, six KIND tables, four
  `--sNN-kind-*` alias blocks and every `var(--fia-kind-x, #hex)` fallback, six CatalogRow title rules,
  four dark badge rules, two dark well rules, two kit-sheet column rules, five `keepRef`, five
  text-scale readers, the S07 legend, the S01 and S15 qualifiers, dead `l5-shell.css` selectors.
- `scripts/check-css-budget.mjs` (`npm run check:css`, in `ci.yml`): fails on a new stylesheet or a file
  past its ceiling in `scripts/css-budget.json`; prints total CSS lines and `!important`.

CSS: 4,827 lines / 232 `!important` at `803a96b` → 4,574 / 211. Per-screen files 1,679 → 1,378.

## Pixels

Deliberate, to the mock: S09 and S09b rows take the shared CatalogRow title rule (15px/1.3,
`_frame.css:141`) every other list already had; Explore's two wells are smoked in dark
(`_frame.css:203-204`). Every other baseline is unchanged.

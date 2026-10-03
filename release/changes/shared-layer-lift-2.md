# Shared layer, lift 2: per-screen CSS is layout only

Branch `claude/blissful-bohr-t7m7it-shared-layer-2` (base `v2/integration` @3be02f0, lift 1 = #84 merged).
RULING 2026-10-02 ~20:05 ET (b): screens are compositions of kit + one shared app layer styled by one
stylesheet; per-screen CSS is layout only; a consolidation pass folds the per-screen CSS into shared
components. Door decision 2026-10-03 01:55 ET (cookbook `CLAIM.md` @c995638): the pass is lift 1 (#84)
plus this lift 2. Both ride train 3.

## What changes

- Every visual declaration in `src/screens/*.css` (colour, background, border and radius, shadow, font
  and type scale, line-height, letter-spacing, opacity, blur, and the `--text-dim` re-points) moves into
  `src/frame/frame.css` or goes because a shared rule already set it. Screens compose the shared classes
  by name. The same holds for the S14, S15, S16 and S17 blocks of `src/tokens/alpha.css`.
- `frame.css` gains the lift-2 section: kit literal re-points (`.fia-kit-label`, `.fia-kit-caption`,
  `.fia-kit-muted`, `.fia-kit-chip`, `.fia-chip-on`, `.fia-row-on`, `.fia-segs-kit`, `.fia-filter-kit`,
  `.fia-field-kit`, `.fia-switch`), row parts (`.fia-row-btn`, `.fia-bare`, `.fia-divider`, `.fia-hr`,
  `.fia-hairline-run`, `.fia-row-current`), named parts (`.fia-step-badge`, `.fia-talk`,
  `.fia-done-mark`, `.fia-display`, `.fia-display-sm`, `.fia-glass-area`, `.fia-quiet-link`,
  `.fia-swatch--<kind>`, `.fia-skel-bar`, `.fia-overline--form`), re-points (`.fia-dim-plain`,
  `.fia-sheet--night-dim`, `.fia-quiet-words`, `.fia-kit-captions`), and a type scale: faces
  (`.fia-type-caption|small|label|body|subtitle|title`, `.fia-face-card-title|body|caption`) with
  weight, line, family and spacing modifiers and tones (`.fia-tone-title|body|muted|dim|aside`).
- S17's drawings scale on their own capped `--k`, so no shared face fits them yet. Their visual
  declarations move to `frame.css` under the same selectors, and the layout stays in `alpha.css`.
- `ScreenFrame` takes `titleClassName` (S02's 1.15 hero line).
- `scripts/check-css-budget.mjs` fails on any visual declaration in a per-screen stylesheet
  (`screenVisual: 0`) and on growth of the `alpha.css` hand-written block past `alphaVisual: 5` (the
  root, body and aurora ground). Each failure names `file:line` and the property.

CSS: 4,521 lines / 203 `!important` → 4,627 / 198. Per-screen files 1,338 → 1,138 lines. Per-screen
visual declarations 143 → 0; the `alpha.css` screen blocks' 148 → 0.

## Pixels

None intended, none moved. On the build host, computed styles of every element match the base on all
52 baseline shots at 100%, 200% and 310% text, in both themes, and on S03 select mode, the S01/S02/S03/S19
error states and S16's feedback list. The 52 renders are byte-identical to the base's. Baselines are
not refreshed.

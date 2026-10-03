# kit — re-vendor BT Glass at ad528f4; scripture fonts self-hosted

Train: Alpha v2 lane F (re-vendor before F5). Branch `claude/blissful-bohr-2wnr60-kit` (base `main`).

## What changes

- `src/vendor/glass/` moves from kit @6aa9bc3 to klappy/bt-design-system-generative-glass main
  @ad528f4, vendored whole and byte-identical (FE-1). The kit now carries the 17 v2 icons (#9),
  self-hosted Noto scripture faces with no Google Fonts import (#10), `GlassCheckbox` (#12) and
  `CountdownRing` / `StageRail` / `BeadStrip` (#15).
- `src/offline/shell-manifest-plugin.ts` — Noto Serif TC subsets (Han, ~6 MB) never enter the
  offline shell; they load lazily by unicode-range. The other five Noto faces are precached.
- `vite.config.ts` — woff2 is never inlined into the CSS, so no TC subset rides in the precached
  stylesheet.
- `src/components/glass.ts` — pin comment; `KitIconName` is now the kit's own `IconName` union.
- `NOTICE.md` — SIL OFL 1.1 line for the Noto faces.
- Tests: `tests/offline.shell-fonts.test.ts` (TC out of the shell, five faces in);
  `e2e/fonts-offline.spec.ts` (no Google request on the shell and S14 in light and dark; Hebrew
  renders offline from the shell cache; TC not precached).

## Not in this change

- No screen changes; the new kit components and icons are not wired into any screen yet (F5 on).
- No version bump; no staging/production promotion.

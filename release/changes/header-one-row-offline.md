# Hub header: one row offline, re-fit on late fonts and label changes

Branch `claude/blissful-bohr-v9w7u0-fucd` (base `v2/integration`, depends on #98). Cookbook unit
`work/active/2026-10-03-fia-spanish-ui-strings`, follow-ups FU-c and FU-d.

## What changes

- **FU-d.** Offline at 390 px, the hub header wrapped to two rows: 122 px in English, 110 px in
  Spanish. `useOneRowHub` (`src/frame/Header.tsx`) now steps down a short ladder only while the row
  would wrap: (1) pills at `--sp-6` inline padding, as before; (2) the logo shows its symbol alone and
  the offline chip takes the pills' type size (`--fs-label`) and padding; (3) the pills drop their
  leading icons, and the words stay; (4) Explore shows its compass alone, and its word stays its
  accessible name and title. The language pill always keeps its autonym. Online the ladder stops at
  step 1, so the online header is unchanged at every width. At 390 × 844 offline, English rests at
  step 3 and Spanish at step 4, both one 64 px row. At 1280 × 800 nothing changes.
- **FU-c.** The hook used to measure only on mount and on window resize. It now re-fits when the grid's
  width changes or the row starts to wrap (ResizeObserver), when the labels or the offline state change,
  and when web fonts finish loading (`document.fonts.ready`, `loadingdone`).
- `FiaLogo` gains `mark` (the symbol without the wordmark), used only by step 2.

## Tests

- `e2e/header-one-row.spec.ts`: at 390 × 844, the hub header is one row online, offline and back
  online, in English and in Spanish. A pill that grows after mount (a stand-in for a late font) gets
  re-fitted. All three tests fail on #98's head.

## Not in scope

At 360 px the online header still wraps, as before. The wider header redesign and the big-text grid
are a follow-up.

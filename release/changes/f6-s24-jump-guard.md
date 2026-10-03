# F6-S24 — sheet 24 forward-jump guard in glass

Train: Alpha v2 lane F (F6). Branch `claude/blissful-bohr-t7m7it-l1-sh24` (base `v2/integration`).

## What changes

- `src/screens/SH5ForwardJumpGuard.tsx` — `ForwardJumpSheet` composed of shared parts on the kit
  (nodded mock cookbook `design/alpha-v2-screens/24-sheet-forward-jump-guard.html`): app `Sheet`
  (brand row, talk-red top edge `fia-sheet--stop`, no Close), sheet 21's quoted-question well, the
  jump as coded beads (kit `BeadStrip`), the talk named in words, quiet "Stay here" / "Go ahead
  anyway", one primary "Go to the talk first" (`KitPrimary`, `users`). Kept v1 behaviour (R-412,
  R-410, Q24-a): asked once per talk per session; back is free; going ahead never marks a talk done.
- `src/screens/S07Overview.map.ts` — `jumpBeads(map, from, to)`, shared beside `stepBeads`.
- `src/screens/S07Overview.tsx` — passes `state` and `target` to the sheet.
- `src/flow/ui/guide.css` — layout-only block for the sheet's well rows (no visual rules copied).
- `src/i18n/en.json` — 13 `s.jump.v2.*` keys (v1 `s.jump.*` words in v2.1 vocabulary: talk
  together, Whole guide map); `$meta.keys` set to the true count.
- e2e: `e2e/f6-s07.spec.ts` (sheet 24 regions and words, Stay here, Go ahead anyway, 200/310% at
  320 px); `e2e/sheet-title-close.spec.ts` multi-stop title on the v2 sheet.

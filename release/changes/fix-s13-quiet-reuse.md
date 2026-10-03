# fix — S13's QuietAction reuses the shared quiet button (fix-forward for #73)

Branch `claude/blissful-bohr-t7m7it-l3-s13-fix` (base `v2/integration`). Fix-forward for the
fresh-review HOLD on #73 (rev-L3-r1-2021). #73 merged as `4ee319e`. The HOLD asked for no revert.

## Bug

Shared commit `0d8885b` defined `.fia-quiet` a second time in `src/components/actions.css`. The
shared layer already has `.fia-btn` and `.fia-quiet` in `src/flow/ui/guide.css` (REUSE RULE,
RULING 2026-10-02 ~20:05 ET). `actions.css` loads on every screen through `PrimaryButton.tsx`.
Its `color: var(--text-body) !important` repainted every shipped quiet button: S05, S06, S08,
SH2, SH5, DiscussionStopBand and AudioControls. The mock's `Quiet` keeps the kit's muted colour.
`src/offline/offline.css` also had `.fia-dl__confirm`, a byte-for-byte copy of `.fia-dl__band`.

## What changes

- `src/components/actions.css` keeps only `.fia-kit-primary:disabled`. The `.fia-quiet` block is gone.
- `src/components/QuietAction.tsx` renders `className="fia-btn fia-quiet"`. These are the mock
  `Quiet`'s classes (`_frame.js:211-212`) and the ones the 10 existing call sites use. It no
  longer imports `actions.css`.
- `src/offline/offline.css` drops `.fia-dl__confirm`. S13's Remove confirm uses `.fia-dl__band`.
  One layout-only rule keeps a lone quiet action at the start of the pack card or band
  (`justify-self: start`), as #73 rendered it.
- Measured at 390 × 844 on S13: the quiet colour is back to the kit's, light rgb(71, 80, 96) and
  dark rgb(201, 206, 214). Padding is 10px 12px, the same as before. The confirm band's
  background, padding, radius and gap have not changed.

## Not in this change

- #76 (sheet 22) and #77 (sheet 23) each add their own copy of `.fia-dl__confirm` to
  `offline.css`, and SH4 uses that class. Both need to switch to `.fia-dl__band` when they
  merge this in.
- Two follow-ups on #73 stay open: the v1 primary on S13, and the title sitting outside the
  header.

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
  `Quiet`'s classes (`_frame.js:211-212`) and the ones every other quiet call site uses. It no
  longer imports `actions.css`.
- `src/offline/offline.css` drops `.fia-dl__confirm`. The Remove confirms on S13 and sheet 23
  (`SH4StorageWarning.tsx`, merged in #77) use `.fia-dl__band`. One layout-only rule keeps a lone
  quiet action at the start of the pack card or band (`justify-self: start`), as #73 rendered it.
- Measured at 390 × 844 against `v2/integration` `803a96b` on S13, sheet 22 (both variants) and
  sheet 23 (space with its confirm, and persist). Every quiet action keeps the same size and
  position. The colour goes back to the kit's muted rgb(71, 80, 96) in light (rgb(201, 206, 214)
  in dark), from rgb(36, 44, 58). Padding stays 10px 12px. The confirm bands' background,
  padding, radius and gap have not changed. The labels are centred like the mock `Quiet`. This
  shows only when a label wraps at 200% / 310%.

## Not in this change

- Two follow-ups on #73 stay open: the v1 primary on S13, and the title sitting outside the
  header.

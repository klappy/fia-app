# 0.2.x — L5 shell (S14 · S15 · S16 · S19)

Train: Alpha phase 4, lane L5. Branch `alpha/l5-shell` (base `alpha/l0-scaffold`).

## What this lane carries

- `src/settings/settings.ts` — C-10 `fia.settings.v1`: defaults (narration `source-fallback`, M3/R-501; `telemetryOptIn` false), unknown enum → default with a status line, Aquifer-code language check, ajv validation before every write, PoC keys (`fia.narration.v1`, `fia.media-quality.v1`, `fia-content-language-v1`, `fia-disclosures-v1`) migrated once via the mapping table then removed, Easy mode (R-605) steps text up at once.
- `src/settings/rights.ts` — C-13 records validated and turned into S15 rows; holders, discrepancies, `license_info` and adaptation notices rendered verbatim; notice HTML tokenised (bold/cite only, never innerHTML); FIAMaps holder discrepancy preserved, never resolved (R-312).
- `src/settings/coverage.ts` — R-314 per-language coverage from the C-03 catalog (validated) plus the pipeline's per-language counts: `available` / `english-only` / `absent`, and `listed` (no number claimed) when counts are not loaded; provenance sums from C-03.
- `src/feedback/` — C-16 1.1.0 payload build + validation (anonymous by default, contact optional per M19 default, screenshot > 2 MB dropped with text kept), idempotent outbox marking `received` only on 2xx.
- Screens: S14 Settings (narration, text size, Easy mode, theme, links; `save-failed` toast), S15 About/Rights (C-13 records, LICENSE + NOTICE.md verbatim, AI narration/translation notices by string key, usage-counter toggle → C-10, feedback counts), S16 Feedback (reason chips, text, context card, contact, queued result, "Your feedback" list), S19 Coverage (six type cards, absent badged, Scripture-never-AI note, legend, report-a-gap).
- Components: `SettingsRow` (+ `SettingsToggle` with On/Off text), `FeedbackForm` (controlled compose body).

## Stubbed / not in this lane

- **Feedback endpoint: stub.** `FEEDBACK_ENDPOINT = null`; every submission is queued locally and shows the amber "Queued" band. Outbox uses localStorage via a store seam; C-16 names IndexedDB (follow-on with L2 storage).
- Screenshot attach (SB-8 opt-in) not built — no capture path yet.
- `s.about.rights-note-slot` (M5) deliberately not rendered until Terry lands the note.
- Update row on S15 (R-704) is L2's version banner; hidden.
- S19 per-type audio/description splits and voice-audition row (R-510): C-03 has no per-type provenance or audition field — not rendered rather than invented.
- S14 auto-continue / play-next / content-language-split rows: no C-10 field, so they cannot persist — not rendered.
- Data base path: `VITE_FIA_DATA_BASE` (default `/data`) until L1/L2 settle where `data/` is served.

## Gaps to rule (contract vs spec)

- S14 spec draws four text-size targets ("Text size {step} of 4"); C-10 `textSize` has three values → three targets rendered.
- M18 reason chips: C-16 1.1.0 has no `reason` field → a chip writes its word into the visible text.
- `appVersion` falls back to `<package version>+0000000` until C-14 emits `<meta name="fia-release">`.

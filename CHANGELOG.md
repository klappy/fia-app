# Changelog

All notable changes to the FIA App. One entry per train; the train note lives in `release/changes/<version>-<slug>.md`.

## 0.2.1 — Alpha first train (2026-10-01)

First promotion of the Alpha app (dev → staging → production). Folds in the unreleased 0.2.0 scaffold below and every Alpha lane merged on `main` since.

- **L0 scaffold** (#1): Vite + React + TypeScript skeleton, PWA manifest, tokens, string catalog, screen and component stubs, 18 contract schemas, CI and Workers deploy config. Note: [`release/changes/0.2.0-l0-scaffold.md`](release/changes/0.2.0-l0-scaffold.md).
- **L1 pipeline** (#2): pinned Aquifer FIA → C-03 catalog (17 languages), C-02/C-04 content packs, C-13 rights records; runs server-side. No note in `release/changes/`; see [`pipeline/README.md`](pipeline/README.md).
- **L2 offline / PWA** (#6): C-07 offline engine ported from the PoC (verified save, resume, update, delete), shell precache, tap-to-apply update flow, install helpers. Note: [`release/changes/l2-offline.md`](release/changes/l2-offline.md).
- **L3 guided flow** (#3): guided-flow model, session state machine and workspace/completion persistence; screens S01–S07, S18, SH-2, SH-5. Note: [`release/changes/0.2.x-l3-guided-flow.md`](release/changes/0.2.x-l3-guided-flow.md).
- **L4 media** (#4): alignment, seek, provenance marks, narration and resources modules; screens S08–S12 and SH-1. Note: [`release/changes/0.2.x-l4-media.md`](release/changes/0.2.x-l4-media.md).
- **L5 shell** (#5): settings (C-10), rights (C-13), coverage, feedback outbox; screens S14, S15, S16, S19. Note: [`release/changes/l5-shell.md`](release/changes/l5-shell.md).
- **Promotion tooling** (#7): `dist/version.json` build stamp, deployed smoke, post-deploy workflow, `RELEASING.md`. Note: [`release/changes/0.2.0-promotion-tooling.md`](release/changes/0.2.0-promotion-tooling.md).

Known open items (as stated in the notes):

- Guided-flow countdown uses 2 s; PRD R-408 cites the PoC's 750 ms — pending a ruling (L3).
- Real-device iOS install verification (R-906) and Lighthouse (R-707) not run (L2).
- Feedback endpoint is a stub; submissions queue locally (L5).
- Narration audio absent: L1 ships `narration.json` empty; screens show the absent mark (L4).

## 0.2.0 — L0 scaffold (folded into 0.2.1)

- Fresh Alpha skeleton: Vite + React + TypeScript, PWA manifest, tokens from `design/tokens.json`, string catalog from the screen specs, 24 screen stubs, 20 component stubs, 18 contract schemas with an ajv example test, CI and Workers static-assets deploy config.
- Versions 0.1.x belong to the functional PoC (`klappy/fia-functional-poc`), reference only.

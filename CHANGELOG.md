# Changelog

All notable changes to the FIA App. One entry per train; the train note lives in `release/changes/<version>-<slug>.md`.

## 0.3.1 — Train 1: v2 glass journey (2026-10-03)

Train 1 runs `v2/integration` → `main` as one PR (cookbook `work/active/2026-10-01-fia-alpha-v2/RULING.md` § ~19:55 ET (c)). It brings the lane-F screens that put the journey in BT Glass. Each one merged into `v2/integration` on a recorded fresh YES at its head. 0.3.0 (`main` `8346fe4`) was never promoted, so production stays 0.2.1 until this version is promoted.

The PRs come from `git log --merges --first-parent origin/main..origin/v2/integration`. None of them added a note in `release/changes/`, so the lines below come from the merge log and the PR descriptions. Train note: [`release/changes/0.3.1-train-1-glass-journey.md`](release/changes/0.3.1-train-1-glass-journey.md).

- **Not-yet passages** (#55, GAP-NOPACK): the build writes `dist/data/packs/index.json`, which lists the packs it ships. A passage with no pack now shows the absent badge and reads "not yet in English", where 0.3.0 showed "Could not read this passage's details". Ready passages sort first. If the index can't be read, nothing is marked. This takes the error out of 0.3.0 known gap 2; content is still five packs.
- **S01 First run · language** (#54): kit `LanguagePicker` over the catalog, autonym first. Linear frame with the 44 px lockup hero and one primary, "Continue in {autonym}".
- **S02 Library** (#52): one kit `CatalogRow` per book, with a saved count and a voice line. Passages are listed by reference. The "Where you left off" recap uses kit `StageRail` and `BeadStrip`, and one primary is either "Continue {ref}" or "Open Mark". Ready passages come first.
- **S03 Passage list** (#58): one kit `CatalogRow` per passage on a `GlassSurface` well, each opening S04. A Select mode (J-A2, R-308) shows its state on the kit `GlassChip` (Saved, Selected or Add, FE-2) and saves the chosen passages one at a time at the Text tier.
- **S04 Passage card** (#57): the reference as hero, the voice chip, an Includes legend drawn with kit progress `Bead`s (a kind the pack lacks gets no row), Save for offline on kit `GlassSegmented` with the tiers the data allows, and one primary, "▶ Start {ref}".
- **S06 Read without voice** (#60): the S05 Guide view with voice off, built from F4's frame and F5's shared parts, not a fourth view.
- **S07 Whole guide map** (#62): kit `GlassSheet` opened from Explore. It shows a legend of the guide's coded beads, the step rows, and one primary, "Back to part n".
- **S18 Completion** (#61): a recap plate on kit `StageRail` and beads, with the next passage as the one primary.
- **S19 Coverage** (#59): six kit type cards read from the catalog (Guide, Scripture, Key terms, Images, Maps, Videos), each with a Text cell and an Audio cell. There is no primary, as in the mock.

### Known gaps

1. Not every screen is in glass yet. S08–S13 and sheets SH-3 to SH-5 are not cooked yet (cookbook `work/active/2026-10-01-fia-alpha-v2/SPRINTS.md`, handoff fia-app-sched-1657).
2. Each screen brings its own stylesheet instead of composing shared app components styled once (captain, RULING § ~20:05 ET). A consolidation pass follows this train as its own PR.
3. Content is still five packs (0.3.0 gap 2); other passages now read "not yet" instead of an error.
4. The Guide can't finish if the last part's clip fails to load. On part 10 of step 6, Skip is disabled. After "This narration could not load", the primary reads Continue, but it retries the clip, so S18 never opens (`src/screens/S05Guide.tsx:356-360`, `src/flow/machine.ts:202-203`, `:235-236`). Seen on a local preview at 390×844, where the PoC clip host failed TLS in the sandbox (0.3.0 gap 10). S18 itself renders in glass when opened from a finished record.
5. 0.3.0 gaps 5, 6, 7 and 9 (feedback endpoint, analytics disclosure, update banner only on S13, cosmetic leftovers) are carried forward. This train did not re-check them.

## 0.3.0 — First v2 cut (2026-10-02)

First v2 cut, shipped in phases (captain order 2026-10-01). Gathered from `release/changes/` since 0.2.1 and from every PR merged on `main` since production `dc8ff06` (`git log origin/production..origin/main --merges`): 36 PRs between #11 and #50. Train note: [`release/changes/0.3.0-first-v2-cut.md`](release/changes/0.3.0-first-v2-cut.md).

- **Library loads: pipeline data ships with the build** (#11): `data/` (catalog, rights, packs) is copied into `dist/`, so the content journey gets past S02 (on 0.2.1 it stops at "Could not load the library."). Media screens read `/packs/<id>/…`; `fia-release` meta reads `<version>+<sha7>`. Note: [`release/changes/fix-ship-data.md`](release/changes/fix-ship-data.md).
- **Save for offline** (#14, #17, #18): ⊘ Offline chip and needs-connection rows (R-702); S04 save row with tier picker, sizes and Save (R-306/307/309); catalog tier sizes match the pack manifests (R-307).
- **Feedback client** (#15, #34): outbox sends and flushes, with context chips (R-705 client); S16 attach line reads "part n of m". The server route is not live (known gap 5).
- **BT Glass shell and skins** (#13, #22, #24–#26, #28–#30, #32, #36, #38, #40, #41, #44): F4 glass shell (kit vendored, glass header and Explore, no bottom bar); F6 skins for S14 Settings, S15 About and rights (pack holder and licence lines), S16 Feedback and S17 Install guide, with their review follow-ups; sheet scrim, focus trap and brand row; SH-2 sheet action above the dock.
- **Kit re-vendor** (#50): BT Glass at `ad528f4` (17 v2 icons, self-hosted Noto scripture faces, `GlassCheckbox`, `CountdownRing` / `StageRail` / `BeadStrip`, not yet wired into screens); Noto Serif TC stays out of the offline shell. Note: [`release/changes/kit-revendor-fonts.md`](release/changes/kit-revendor-fonts.md).
- **Content pipeline** (#20, #21, #23, #27, #31, #33, #35, #37, #39): Mark 1:1–13 narration plan carries every PoC-floor slot (B2-prep); 21 key terms from `term-supplements.json` (BL5); each pack carries holder and licence per source from the C-13 rights record (BL8, hardened in #31, pipeline tests gate CI); autonyms, `next-` clip ids and the hidden-example anchor in any language (BL2/6/7); next-action scripts and description texts (BL9); Spanish text step strips AI sentence-start filler (V1-6); short visual descriptions on the M9 shared-base model (V1-4, follow-ups #39).
- **Passage titles** (#42, #43, #45–#48): contracts C-03/C-06/C-10/C-13 1.1.0 for pericope subtitles (BL4b); Bible section headings gathered per Mark pericope (BL4a); text route with a pinned `claude-opus-5-5` client, mock test and CI secret slot (BL4c); subtitle generator (rung, key, cache, ledger, caps), no live calls (BL4d); hardening (#46); `subtitleMode` setting, S14 "Passage titles" switch and S01 summaries line (FS-2).

Also on `main`: five direct commits that sync agent allow rules in `.claude/settings.json` (no app change). Notes in `release/changes/` since 0.2.1: `fix-ship-data.md` and `kit-revendor-fonts.md` only; the other PRs carry no note, so their lines above come from the merge log.

### Known gaps (shipping in phases)

1. Offline save does not cover the Guide (P1; elevate to a blocker if the first cut must meet the 20:41 'verified offline save' floor). S04 says 'Saved (Text, 0.5 MB)' and S13 lists 'MRK 1:1–13 · Text ✓'. With the network gone, S04, S05, S06 and S07 show 'Could not read this passage's details. Try again'; only S08 Scripture opens. Cause: src/flow/catalog.ts reads /data/packs/<id>/guide.json and guide-units.json (and S04 also reads /data/catalog/manifest.json). The Text tier saves /packs/<id>/… paths instead. Not a regression: production has no packs at all. _(Closed before this cut: GAP-OFFLINE #56 merged on `main` ahead of the prep PR #53. Note: [`release/changes/fix-offline-pack-paths.md`](release/changes/fix-offline-pack-paths.md).)_
2. Content is one English pack. Only eng.MRK-1-1-13 exists in English (5 packs in all: eng/spa/tpi Mark 1:1–13, arb GEN-1-1-2-3, hau LUK-6-17-19). The library lists about 1,900 English guides; every other passage (checked Mark 1:14–20, Mark 8:1–10, Genesis 1:1–2:3, John 1:43–51) dead-ends at S04 with 'Could not read this passage's details. Try again'. No crash. Suggest a quick 'not yet' label or hiding passages that have no pack.
3. No audio on S05 ('AI voice not yet available'); F5's stand-in is not on main yet. _(Closed before this cut: F5 #51 merged on `main` ahead of the prep PR #53; see Next.)_
4. Most screens are still unskinned (the captain called this mix 'fugly'). Glass header, but raw lists elsewhere: S05 progress shows as plain numbered lists with blank items 1–8; S02 books, S08 edition tabs and S05 view tabs are default buttons. S08 heading reads 'MRK 1:1-13' and the edition line 'BereanStandardBible'. F5/F6 skins pending.
5. Feedback endpoint is not live. DEV and prod are assets-only Workers, so POST /api/feedback returns 405; the C-16 Worker route (owner Otto) is missing. The app queues honestly ('Waiting to send') and retries with backoff, which leaves 405 noise in the console.
6. Analytics vs. the About screen. Cloudflare Web Analytics adds its beacon (static.cloudflareinsights.com) at the edge on both dev and production; the same beacon is already live on production, so not a regression. S15 says 'Count anonymous usage … Off'. Needs Otto or the captain to decide on the zone setting or the disclosure.
7. Update banner only on S13. The 'New version ready · Reload' banner is mounted only on S13 Downloads, although the VersionBanner comment says S05/S06/S08 host it. Users elsewhere get the update when the app is next closed and reopened (verified).
8. Release prep not done (RELEASING step 3). package.json is still 0.2.1, the same as production v1, so the two builds differ only by the +sha in fia-release. No CHANGELOG entry yet. _(Closed by this entry and the 0.3.0 bump once merged.)_
9. Cosmetic leftovers. Without a current pack, S15 shows the licence-file holder only ('Word Collective'); with the pack it shows both holders. The licence notice shows raw JSON. Requests for SF-Pro-\*.otf get the SPA fallback (200 text/html, no font binaries shipped, falls back to system font). Interface text and the header chip stay English when the content is Spanish or Tok Pisin.
10. Sandbox limit, not an app fault. Here Chromium rejects the session proxy CA (ERR_CERT_AUTHORITY_INVALID), so smoke:deployed's browser test cannot hit https://dev.fiaguide.app directly from this sandbox. Covered by the relay run and by GitHub post-deploy (green).

### Next

- Guide audio is already in this cut: F5 (#51) plays the PoC's live Mark 1:1–13 clips (English) as a stand-in C-05 manifest. #51 merged on `main` before this entry's prep PR (#53), so 0.3.0 has it. This line used to say the audio "arrives in 0.3.1"; that was written before #51 landed and is corrected here.
- AI voice to become a clone of the FIA voice per language (queued).

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

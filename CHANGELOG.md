# Changelog

All notable changes to the FIA App. One entry per train; the train note lives in `release/changes/<version>-<slug>.md`.

## 0.3.2 — Train 2: the remaining screens in glass (2026-10-03)

Train 2 runs `v2/integration` → `main` as one PR (cookbook `work/active/2026-10-01-fia-alpha-v2/RULING.md` § ~19:55 ET (c)). It brings the screens and sheets that train 1 left out (0.3.1 known gap 1), the Guide clip-error fix (0.3.1 known gap 4) and the fix-forward for #73's quiet buttons (#81). Each feature PR merged into `v2/integration` on a recorded fresh YES at its head. Production stays 0.3.1 (`548ceb6`) until this version is promoted.

The PRs come from `git log --merges --first-parent origin/main..origin/v2/integration`: #64 #65 #66 #68 #69 #71 #74 #73 #76 #77 #70 #80 #81. The release-prep PR that adds #81 to this entry merges after it is written and cannot list itself. Every feature PR and fix carries its note in `release/changes/`. The lines below come from those notes, checked against the PR descriptions and the code at `803a96b`; #81's line is checked at `d0fea2b`. Between the two, only #80 (version, entry, train note) and #81 changed files. Train note: [`release/changes/0.3.2-train-2-remaining-screens.md`](release/changes/0.3.2-train-2-remaining-screens.md).

- **S08 Scripture reader** (#66): the guide card's Text view, built from S05's parts. It has the progress band at the guide's position, the card with Text active, the voice chip (→ sheet 20), the edition on kit `GlassSelect`, "Play this verse again", the passage in the card body and the thumb zone. v1 behaviour is kept: tap a word or verse to seek, switching edition keeps the verse, the untimed notice shows once per session, and there is no disabled primary when there is no clip. Note: [`release/changes/f6-s08-scripture-reader.md`](release/changes/f6-s08-scripture-reader.md).
- **S09 Resources** (#70): the card's Resources view lists the part's own resources under "In this part" (`CatalogRow` rows with a quiet (i) → sheet 20). One row, "All resources for this passage", opens S09b: the whole-passage catalog with `GlassSearch`, `FilterChips` (one type at a time, counts inside) and one exit, "‹ Back to part n". The card view has no primary. Explore's row opens S09b too. The PR description still describes its first head (`6c5b121`, the whole catalog inside the card); the reviewed head `5faf502` moved the catalog to S09b, as the note says. Note: [`release/changes/f6-s09-resources.md`](release/changes/f6-s09-resources.md).
- **S10 Key term** (#65): a Layer frame with one labelled way back in the glass header. The term is set large with its ◆ kind bead and the line "Key term · FIA" (shared `LayerHead`). The mark is a `ProvenanceChip`, the definition sits on a kit `GlassSurface`, and there is one primary: Play, Pause, Resume or Play again. It never autoplays (R-407). Note: [`release/changes/f6-s10-key-term.md`](release/changes/f6-s10-key-term.md).
- **S11 Image / map viewer** (#68): a Layer frame. The image comes first, in the shared dark media well, with pinch-zoom and double-tap (R-507). Then the ▲ kind line, the title and the chips: "About this image", or "Map in English · not yet in {language}". Describe stays disabled while the description is not made (R-509). The primary is the way back. Note: [`release/changes/f6-s11-image-viewer.md`](release/changes/f6-s11-image-viewer.md).
- **S12 Video** (#69): a Layer frame. The video plays in the dark well and never autoplays, under the kind line "Video Bible Dictionary · streams" and a source chip (→ sheet 20). Offline, the well reads "Needs connection" and the primary is the way back (R-506). Note: [`release/changes/f6-s12-video.md`](release/changes/f6-s12-video.md).
- **S13 Downloads** (#73): a Layer frame with "‹ Back to {ref}" in the header, group overlines, and pack cards on kit `GlassSurface` with the kit `SyncBadge`. Card actions use the shared `QuietAction`. The v1 catalog row "Catalog + text (all languages) ✓", which was missing, is back. v1 strings and behaviour are unchanged. Note: [`release/changes/f6-s13-downloads.md`](release/changes/f6-s13-downloads.md).
- **S13's quiet actions reuse the shared quiet button** (#81, fix-forward for #73). `QuietAction` renders the shared `.fia-btn .fia-quiet` from `src/flow/ui/guide.css` (`src/components/QuietAction.tsx:20`), the mock `Quiet`'s classes, and `src/components/actions.css` keeps only `.fia-kit-primary:disabled`. The second `.fia-quiet` that #73 added had repainted every shipped quiet button (S05, S06, S08, sheets 21 and 24, `DiscussionStopBand`, `AudioControls`); they go back to the kit's muted rgb(71, 80, 96) in light (rgb(201, 206, 214) in dark), from rgb(36, 44, 58). `src/offline/offline.css` drops `.fia-dl__confirm`, a copy of `.fia-dl__band`; the Remove confirms on S13 and sheet 23 use `.fia-dl__band`. On S13 and sheets 22 and 23, every quiet action keeps its size, position and padding. Note: [`release/changes/fix-s13-quiet-reuse.md`](release/changes/fix-s13-quiet-reuse.md).
- **Sheet 22 Update notice** (#76): the pack line under the title and the revision and download size on a glass well. Keep and Later are quiet, and there is one dark `KitPrimary` with a glyph. Offline, the primary reads "— needs connection" and is disabled; before, it looked tappable but had no handler. Note: [`release/changes/f6-sh22-update-notice.md`](release/changes/f6-sh22-update-notice.md).
- **Sheet 23 Storage warning** (#77): the largest saved packs on a glass well. Each Remove asks first and names what is lost (R-311), and the sheet says "Nothing is deleted automatically." One dark `KitPrimary` with a glyph. Note: [`release/changes/f6-sh23-storage-warning.md`](release/changes/f6-sh23-storage-warning.md).
- **Sheet 24 Forward-jump guard** (#64): rises over S07. It draws the jump as coded beads (kit `BeadStrip`) and names the talk in words. Two quiet buttons, "Stay here" and "Go ahead anyway", and one primary, "Go to the talk first". It asks once per talk per session (R-412), and going ahead never marks a talk done (R-410). Note: [`release/changes/f6-s24-jump-guard.md`](release/changes/f6-s24-jump-guard.md).
- **Guide: a clip that fails to load never traps the guide** (#71). A new machine event, `clip-error` (`src/flow/machine.ts:131-139`), lets the part go on: the primary reads "Next part", or "Finish" on the last part, which reaches S18. It never counts down, and a quiet "Try again" reloads the clip. One voice rule, `voiceOf`, now serves S02, S04 and S05, so Mark 1:1–13 reads "AI voice" on all three; S02 and S04 used to say "Text · voice not yet". This closes 0.3.1 known gap 4. Note: [`release/changes/fix-guide-clip-error.md`](release/changes/fix-guide-clip-error.md).
- **Shared layer, styled once** (carried by the PRs above):
  - `ScreenFrame` `close` (the layer's way back), `LayerHead`, `AudioControls` `hideMark`, and the `src/app.css` layer block with the dark media well (#65, #68, #69).
  - `QuietAction`, `KitPrimary` `disabled`, `src/components/actions.css`, and `src/offline/offline.css` restyled on kit tokens (#73, #76, #77). #81 moved `QuietAction` onto the shared `.fia-btn .fia-quiet`.
  - The `GlassSelect` wrapper and optional `GuideTransport` sides (#66). S05's frame rules in `src/flow/ui/guide.css` now also select S08 and S09 through `:is()` (#66, #70).
  - No new per-screen stylesheet in this train. 14 new string keys: 13 `s.jump.v2.*` and `s.guide.voice-not-yet`.
- **Sync `main` → `v2/integration`** (#74): no app change. It brought `server/SPEC.md` and `contracts/README.md` (#49, already on `main`) and an allow-rule sync in `.claude/settings.json` (`b5d867d`) into integration. It adds nothing new to `main`: `git diff origin/main origin/v2/integration` touches none of those files.
- **Release prep** (#80): no app change. The version goes to 0.3.2 in `package.json` and the `package-lock.json` root, with this entry and the train note.

### Known gaps

1. **Quiet buttons on screens shipped in 0.3.1 rendered darker after #73. Fixed by #81, in this train.** #73 merged on a YES. A HOLD came after the merge (rev-L3-r1-2021, issue comment 5964611068): #73 defined `.fia-quiet` a second time, and its `color: var(--text-body) !important` repainted every quiet button with no more specific rule. The reviewer measured light going from rgb(71,80,96) to rgb(36,44,58). #81 (branch `claude/blissful-bohr-t7m7it-l3-s13-fix`, head `3cf1253`) removed that rule and merged into `v2/integration` as `d0fea2b` on a YES at that head (issue comments 5964918879 and 5964976009). `QuietAction` now uses the shared `.fia-btn .fia-quiet` (`src/flow/ui/guide.css:389-401`), and `src/components/actions.css` holds only `.fia-kit-primary:disabled`. #81 measured the fix on S13 and sheets 22 and 23. The train review on PR #82 measured S05's Back and Skip at rgb(71,80,96) in light and rgb(201,206,214) in dark. S07 and S09 also use `.fia-quiet` and were not measured.
2. **Per-screen CSS consolidation is in flight, not in this train** (0.3.1 gap 2). This train adds no per-screen stylesheet, but the earlier ones remain: `src/screens/S01FirstRunLanguage.css`, `S02Library.css`, `S03PericopeList.css`, `S04PassageCard.css`, `s06.css` (a copy of S05's frame rules, per #66), `S07Overview.css`, `S18Completion.css`, `S19Coverage.css` and `l5-shell.css`. The shared-layer lift runs as its own PR (cookbook `CLAIM.md`, 2026-10-02 22:33 ET). No fia-app PR is open for it at this prep.
3. **S06 has no clip-error handling of its own.** #71's note leaves this as a follow-up. Checked at `803a96b`: S06 has no media element and plays nothing (`src/screens/S06SingleScript.tsx:63`), and it passes `questionClip={null}` to sheet 21 (`:327`). So no clip can fail there today. The follow-up matters once S06 plays a clip.
4. **Mark 1:1–13's part count differs between S03 and S04.**
   - S03 shows "≈108 parts". That is the catalog's `guide.unitsEstimate` in `data/catalog/eng.json`, which the pipeline makes from the guide's bytes ÷ 260 (`pipeline/src/inventory.mjs:146`).
   - Once the guide is loaded, S03 shows 117: the parts walked, without the 13 hidden example parts (`src/screens/pericopeList.ts:50-51`, `:59-64`).
   - S04 says "130 parts": every unit, hidden ones included (`src/screens/passageCard.ts:145-148`).
5. **Mock deltas the PRs leave as follow-ups.**
   - S09: the "Later, before the talk" group and S09b's `ResourceCard` tiles (#70).
   - S08: the playing-state lines need a reading clip, and the pack has no Scripture narration yet (#66).
   - S10–S12: the layer primaries still use the v1 blue `PrimaryButton`, not the mock's dark pill (#65, #68, #69). S11 and S12 lack save-state lines (#68, #69).
   - Sheet 22 has no "What changed" list, and sheet 23 has no Needs / Free bars. Both need data or new strings (#76, #77).
6. **Carried forward.** Content is still five packs (0.3.1 gap 3). 0.3.0 gaps 5, 6, 7 and 9 also carry forward. Gap 7 was re-checked: `VersionBanner` is still mounted only in `src/screens/S13DownloadsOffline.tsx`. Gaps 5, 6 and 9 were not re-checked.

## 0.3.1 — Train 1: v2 glass journey (2026-10-03)

Train 1 runs `v2/integration` → `main` as one PR (cookbook `work/active/2026-10-01-fia-alpha-v2/RULING.md` § ~19:55 ET (c)). It brings the lane-F screens that put the journey in BT Glass. Each one merged into `v2/integration` on a recorded fresh YES at its head. 0.3.0 (`main` `8346fe4`) was never promoted, so production stays 0.2.1 until this version is promoted.

The PRs come from `git log --merges --first-parent origin/main..origin/v2/integration`. None of them added a note in `release/changes/`, so the lines below come from the merge log and the PR descriptions. Train note: [`release/changes/0.3.1-train-1-glass-journey.md`](release/changes/0.3.1-train-1-glass-journey.md).

- **Not-yet passages** (#55, GAP-NOPACK): the build writes `dist/data/catalog/ready.json` (beside the catalog), which lists the packs it ships. A passage with no pack now shows the absent badge and reads "not yet in English", where 0.3.0 showed "Could not read this passage's details". Ready passages sort first. If the index can't be read, nothing is marked. This takes the error out of 0.3.0 known gap 2; content is still five packs.
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

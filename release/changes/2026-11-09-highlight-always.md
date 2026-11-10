# Highlight always (Summit T1, 2026-11-09)

Policy change, ordered by the captain (Klappy) on 2026-11-09, recorded verbatim:

> Make audio the player and the pages turn to the audio. Both pause if the audio pauses. Pages may jump over things, which may cause the audio to seek to the appropriate moment. This inverts the model to fix the audio sync. Highlighting should be antifragile and always highlight the closest matches to create the best UX, previous releases refused highlight features on sections there is no perfect alignment.

> No added links to them, they show up like the first pericope. ... No new design is approved.

> This all has to ship today. Summit is tomorrow.

This change is the highlight half of that order (cookbook plan `work/active/2026-10-03-fia-v3-integrated-delivery/PLAN-2026-11-09-summit-solid.md` § 4 slices I1 and I1b, § 5 R2, § 6 E8). The audio-master inversion (I2–I4) is a separate train.

## What changed

**The UX refusal is gone; the evidence checks are not.** Until now a guide or discussion card showed no gel when its sidecar activity map matched fewer than 70 % of the on-screen words, when any word lay outside the runtime clip (the first recognised word often starts 30–440 ms before the authored clip start; the stop-before-the-next-sound tail can end the clip below the map's `endMs`), or when the generator had emitted a zero-duration word. On the first pericope that was 43 of 111 routes, including the first two screens the room sees. These refusals were added in PR #343 in answer to bot findings; no captain ruling on the floor existed.

- `activityTiming` (new, `apps/web/src/lib/transcript.js`) fits a map to its clip and names a **tier**: `exact` (map unchanged), `clamped` (words clamped into the runtime clip, zero-duration words given a share of the neighbouring gap by text length — the gap-split rule from `passage-timing.js` — or a declared span past the clip), `approximate` (under the 70 % heard-token floor; the layout between heard anchors is the generator's interpolation, which is still the closest match the evidence allows). `activityWords` returns the fitted words (same array, `words.tier`). Only a malformed map (bad counts, non-integer or out-of-order times) is refused.
- `alignmentFromSidecar` (`passage-timing.js`) no longer returns null below the spoken-match or verse-match floors: verses with enough anchors keep word timing, every other verse is verse-timed across the spoken span by text length, and the alignment carries `timing: 'approximate'`.
- `activityAlignment`'s text-offset check stays the only hard refusal for a card. The alignment carries `timing`.
- `AlignedReading` renders `data-timing="exact|clamped|approximate"` on the reading region. **Data attribute only**: no style, marker, label or control keys on it; the gel is pixel-identical at every tier. No new design is approved, so none was added.
- Byte identity, source pins, `audioSha256` / `sourceAudioSha256` / clock-mapping identity and range validation are unchanged everywhere.

**First-screen data fix (I1b).** The shipped S01 sidecar (`b963c67e….words.json`, source `asr:precomputed`) heard only "on" for its first 21.6 s, so S01-U001 was 0/12 and S01-U002 7/24. The committed source-recording evidence (`recording-evidence/315fde5b….json`, faster-whisper on the source MP3) recognised the words; the accepted range records (`recording-sources/66cfb3cb…`) pin S01-U001 to words 9–24 and S01-U002 to 24–51; the verified source→delivery clock mapping is scale 1 / offset 0 (`recording-evidence/d631c18f…`). The two activity maps were regenerated with `transcribe.py`'s own `activity_map` rule over those words: **S01-U001 10/12, S01-U002 23/24**, tier exact. `audioSha256` and every other map are unchanged; the sidecar records the regeneration under `regenerated` (both the public copy and the `product/audio-transcripts` corpus copy). Human review of the regenerated timings (the gate `transcribe.py` names) is still owed.

**Audit and tests re-cut on purpose.** `scripts/audit-first-pericope-timing.mjs` now reports **111/111** routes timed with `byTier` {exact 76, clamped 25, approximate 10}; `evidence/first-pericope/timing-quality.json` is regenerated; `tests/web-shell/first-pericope-timing-quality.test.js` asserts the tier of every id (never a silent pass). `apps/web/tests/activity-evidence.test.js`, `narration-highlight.spec.js` (the low-coverage and outside-clip cases now highlight at a named tier), `passage-timing.test.js` and `alignment.test.js` are re-cut with the captain's order cited.

**Spanish sticky notice (E8).** A pack whose catalog says no guide recording exists anywhere (every Spanish Luke pack) raised "This recording is unavailable. You can continue." on every screen. It is now raised on one screen per session at most; the Passages card already says "Guide recordings unavailable". Packs with partial recordings (eng.MRK-1-14-20) keep the per-screen notice and the `preparationNotice` path unchanged. `apps/web/tests/blocked-notice-once.spec.js`.

**Dead footer code (R2).** `components/StepResources.svelte`, `lib/step-resources.js`, their two tests and the `.step-resources` selector in `lib/swipe.js` are deleted (PR #350 removed the footer PR #345 had mounted; the code could have been re-mounted). The negative assertions in `app.spec.js` and `e2e/approved-layout.spec.js` stay.

**Manifest text.** `index.html` and `manifest.webmanifest` said "all 68 passages of Mark"; the catalog has carried 97 Luke passages per language since the Luke release. Now "68 passages of Mark and 97 passages of Luke".

## Not in this change

- The run planner, controller gap-seek and App wiring (I2–I4) and the device listen (I7): separate train.
- A proportional word estimate inside verse-timed Scripture verses (plan § 4 contract item 6).
- The cookbook gel spec amendment (#276 `text-block.md` "no sidecar → no gel" → "best available estimate") lives in `klappy/fia-app-cookbook`, not here.
- Human review of the regenerated S01 timings; a device pass of the gel at the approximate tier.

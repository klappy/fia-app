# fix — a clip that fails to load never traps the guide

Branch `claude/blissful-bohr-t7m7it-guide-end` (base `v2/integration`). Found on the J-A1 walk
(train1-2021).

## Bug

In the Guide (S05), when a part's clip failed to load, the screen paused the flow
(`S05Guide.tsx` `onError` → `pause`). Paused shows the `resume` primary ("Continue"), and `resume`
only plays the clip again (`machine.ts` `primaryAction`). On the last part Skip is disabled, so
the person could only retry a clip that would not load: S18 completion never opened.

S05's voice chip said "AI voice" for Mark 1:1–13 while S02 and S04 said "Text · voice not yet"
for the same passage. S05 was right: the guide plays the stand-in's AI-voiced PoC clips, and AI
narration is always marked (C-06). S02 and S04 read only the C-03 catalog, which counts no
generated guide narration yet.

## What changes

- `src/flow/machine.ts` — a new `clip-error` event. From `playing` it lands where the narration
  would have ended, without marking the part played: an un-discussed stop still waits; any other
  part shows the forward primary ("Next part", or "Finish" on the last part, which reaches S18).
  It never counts down. The clip stays the part's, so `play` can try it again.
- `src/screens/S05Guide.tsx` — a clip that does not load (media `error`, or a rejected `play()`
  other than `AbortError`) dispatches `clip-error`. The note says "The voice for this part did not
  load. You can read it and go on." Below it, a quiet "Try again" (the shared `SecondaryAction`)
  reloads the clip inside the tap. A browser that wants a tap first (`NotAllowedError`) still
  pauses, and the big button is that tap. No new CSS.
- `src/screens/passageCard.ts` — one rule, `voiceOf`, for S02, S04 and S05: "AI voice" when the
  catalog counts generated narration or the guide plays stand-in clips for the passage; only a
  passage with no clips at all reads "Text · voice not yet". `guideVoice(entry, choice)` names a
  clip that plays (a recording or "AI voice"), as sheet 20 does. A part with no clip reads "Text ·
  voice not yet" in a passage with no clips, else "No voice for this part". S05 now loads the
  catalog, as S04 does.
- `src/screens/libraryModel.ts` — S02's book voice line uses `voiceOf`, so Mark reads "AI voice".
- `src/i18n/en.json` — `s.guide.error-clip` reworded; `s.guide.voice-not-yet` added.
- Tests: `tests/flow/machine.test.ts` (clip-error goes on, never counts down, finishes on the
  last part, waits at a stop, retry plays, ignored unless playing);
  `tests/s04-passage-glass.test.ts` (`voiceOf` and the S05 chip, incl. a no-clip passage);
  `tests/s02-library-glass.test.ts` (Mark's book line); `e2e/f5-guide.spec.ts`: the last part's
  clip is aborted (`page.route`). The page shows the note, retries, and Finish reaches S18. The
  S02, S04 and S05 e2e expect "AI voice" for Mark 1:1–13.

## Not in this change

- S06 (single script) has no clip-error handling of its own. That is a follow-up.

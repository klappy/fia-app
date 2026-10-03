# fix — a clip that fails to load never traps the guide

Branch `claude/blissful-bohr-t7m7it-guide-end` (base `v2/integration`). Found on the J-A1 walk
(train1-2021).

## Bug

In the Guide (S05), when a part's clip failed to load, the screen paused the flow
(`S05Guide.tsx` `onError` → `pause`). Paused shows the `resume` primary ("Continue"), and `resume`
only plays the clip again (`machine.ts` `primaryAction`). On the last part Skip is disabled, so
the person could only retry a clip that would not load: S18 completion never opened.

S05's voice chip also said "AI voice" for Mark 1:1–13 while S02 and S04 said "Text · voice not
yet" for the same passage. The catalog (C-03) says no guide narration was generated yet; the
chip named the stand-in clip instead.

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
- `src/screens/passageCard.ts` — `guideVoice(entry, choice)`: S05's chip follows `voiceOf`. When
  the catalog entry says no generated narration, the part reads "Text · voice not yet". A
  recording, or a part the setting keeps silent, still says so. S05 now loads the catalog (as S04
  does). Before the catalog is read, the clip names its own voice.
- `src/i18n/en.json` — `s.guide.error-clip` reworded; `s.guide.voice-not-yet` added.
- Tests: `tests/flow/machine.test.ts` (clip-error goes on, never counts down, finishes on the
  last part, waits at a stop, retry plays, ignored unless playing);
  `tests/s04-passage-glass.test.ts` (S05 chip rule); `e2e/f5-guide.spec.ts`: the last part's
  clip is aborted (`page.route`). The page shows the note, retries, and Finish reaches S18. The
  first test's chip assertion now expects "Text · voice not yet".

## Not in this change

- Sheet 20 ("About this voice") still names the clip that plays: the stand-in's PoC clips are
  AI-voiced. The chip and the sheet differ until B2b ships the pack's own narration, or until the
  rule in `voiceOf` changes for S02, S04 and S05 together.
- S06 (single script) has no clip-error handling of its own; it is not touched here.

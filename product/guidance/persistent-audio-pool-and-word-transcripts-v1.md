# Persistent per-file audio players and word-level transcripts v1

Status: DRAFT spec, written 2026-11-04 on the captain's direction (t324u, t325u, t326u, t327u). Production waits for the captain. Reference app: klappy/fia-app `main` ffefd9fc; implementation on the draft PR branch `fix/audio-range-audit`.

## Root cause being fixed

Every screen that plays recorded narration treated its audio file as never seen before, even when the next screen used the same file. In the first pericope the guide recordings are six long files (S01-S06) shared by 6 to 43 screens each, and the BSB reading file is used by three inserted reading steps. Per screen the app did all of this:

1. `apps/web/src/App.svelte` `startRecording()` revoked the previous blob URL (`URL.revokeObjectURL(mediaBlob)`), then
2. asked the service worker for the whole file again (`libraryAdapter.playMedia` -> `MEDIA_PLAY`, `apps/web/src/lib/library.js` `playMedia`; `apps/web/public/sw.js` returns `{bytes, mime, timing, playbackRange}`), then
3. built a new `Blob` and a new `URL.createObjectURL(...)`, and
4. `apps/web/src/lib/audio.js` `play()` wrote `owner.src = src` on the shared element, which makes the browser fetch and decode a different URL even though the bytes are identical, then waited for metadata, then seeked to the range start.

The screen change `cancel()` also revoked the blob. So "next" within one recording was a full reload, with a new decode and a new seek, on a clock the text had already moved past. Exact line numbers are in the PR description.

## Two layers: player and controller (separate)

| | Player (engine) | Controller |
|---|---|---|
| Code | `apps/web/src/lib/audio.js` (`createAudioController`, the per-file pool; the exported name is historical, it is the player) | `apps/web/src/lib/script-controller.js` (`createScriptController`) |
| Owns | One persistent audio element per distinct file; decode, play, pause, seek, range bounds, iOS unlock | The stage script (ordered spans, screen to screen), each file's sidecar word map, navigation order |
| Knows | Only a file identity, a source and an accepted range | Screens, pericope order, the journey, which span is current |
| Never | Knows about screens, pericopes or the journey; reads sidecars | Touches the DOM or media elements; creates players |
| Lifetime | Created once, files live in the pool | Created once above the screen/route layer, survives screen navigation |
| Does | `play(text, src, rate, range, fileIdentity)`, `seek`, `stop`, `reserve`, `evict`; reports state and end | Tells the player what to play and when; drives word highlighting from the player clock and the sidecar; drives auto-advance at end of audio; seeks to any word |

Contract: controller -> player `play`, `seek`, `stop`; player -> controller `onState` (media time) and `onEnd`. The controller holds all journey knowledge, so the player can be tested, replaced or pooled without it. Today's PR ships both modules with tests; wiring `App.svelte` so the controller (rather than `startRecording`/`finishAudio`) decides what plays next is the follow-on step, marked TODO in the PR.

## Required behaviour

1. **Pool of persistent players, one per distinct audio file.** Identity is the verified file hash within a delivery revision (`<deliveryRevision>|<sha256>` online, `saved|<sha256>` offline). Exactly one player per identity, never two, never recreated while the app lives. Mark's first-pericope guide files, the BSB reading file and every other file used by other stages each have their own player.
2. **Reuse is an instant seek.** If a screen needs a file whose player is loaded, nothing is fetched, no `src` is written, nothing is re-decoded: the player seeks to the screen's accepted range start and plays. The blob URL for a file lives in a cache keyed by identity and is released only on a delivery-revision change or when the cache cap evicts it (the player's `evict(identity)` removes the matching player).
3. **Whole stage is one script, screen to screen.** Every screen's text is a span of one of the stage's audio files. A screen has no audio of its own beyond a `[startMs, endMs]` span of a file.
4. **Word-level millisecond transcript per file, sidecar only.** See next section.
5. **End of a span auto-drives the next action.** When playback reaches a span's `endMs` the existing completion path (`finishAudio`, hold rules, inserted Scripture sequence `U001 -> U002 -> S01-U002-reading-1 -> ...`) runs exactly once. Discussion holds and manual-wait semantics stay as they are.
6. **iOS.** Every pooled element must be started inside a tap once. The app `reserve()`s the pack's file identities when media status loads, and the next trusted tap `unlock()`s all idle elements.

## Word transcript sidecar (canonical)

A transcript is a **sidecar file next to each audio file**: `<audioSha256>.words.json`, schema `fia-word-transcript@1` (`apps/web/src/lib/transcript.js`).

- `audioSha256`: the delivered bytes it times. `sourceAudioSha256` and `timingMapping`: the original and the verified source-to-delivery clock mapping.
- `words[]`: `{startMs, endMs, text}` for every word of the file, start to end, integer milliseconds in the delivered file's clock (`clockDomain: delivery-media-seconds`).
- `activities{}`: for each screen whose accepted range lies in the file, the on-screen text split into words with char spans `{from, to}` and `{startMs, endMs}`, so any displayed word maps to its millisecond.
- The sidecar is the single source of truth for (a) word-by-word highlighting in lockstep with playback, (b) seeking to any word's exact millisecond, (c) auto-advance at the end of a span.
- **The sidecar is canonical because of permissions, not because of the audio format.** The captain does not always have write access to the audio files, so timings cannot always be embedded in them, while a sidecar is always writable and always accessible. Compression does not change timings. Embedded timings are optional: they may be added where the file is writable, must agree with the sidecar, and are never read as the source of truth.
- The sidecar ships alongside its audio in the same hash-verified delivery; a missing or invalid sidecar means "no word highlight", never a guessed alignment (the existing approximate scroll `durationScrollTop` is the explicit fallback).

### Pipeline step

`scripts/audio-transcripts/transcribe.py` runs over the known audio files of a pack's delivery manifest: for each distinct delivered file, word-by-word transcription (faster-whisper, word timestamps) -> sidecar; each screen's narration is aligned to the heard words (difflib), unheard words are interpolated and everything is made monotone. Runtime activity maps fail closed to untimed text below 70% ASR coverage or if any word falls outside the accepted activity range; interpolation is not proof of matching speech. Scripture audio uses its reviewed alignment (`content/scripture-alignments/*.json`) instead of ASR. First run: `product/audio-transcripts/eng.MRK-1-1-13/` (38 files, 6 guide recordings mapped for 111 screens; the BSB file from the reviewed alignment; the whole-file clips transcribed). ASR times are about plus or minus 0.2 s, so a human review of each sidecar is a release gate, as it is for ranges. Scale-up: run per pack for all Mark and Luke, English and Spanish (pass `--language en` or `--language es`; Spanish selects the multilingual model and preserves accents), then review.

### Optional safety net: regenerate after compression

Compression does not change timings, so this step is not a fix for shifted timings. It is an optional safety net that proves each sidecar still describes the exact bytes that ship. Order when used: compress/transcode audio -> hash the bytes that will ship -> check (or re-time) sidecars against that hash -> publish audio and sidecars together.
`transcribe.py --language en --check` writes nothing and exits 1 if any shipped file has no sidecar named for its sha256 (usable as an optional release gate); `--stale-only` re-times only those files. Verified locally: the committed set passes `--check`; replacing one file with different bytes makes `--check` fail on exactly that file.

### Highlighting behaviour

`highlightSegments(text, words, ms)` splits the on-screen text into segments flagged `spoken`, `active` or upcoming from the player's current media time converted to ms; `wordIndexAt` is a binary search that holds the last started word through gaps. Highlight follows the player clock only (never a wall-clock estimate). Tapping a word calls the controller `seek(seconds)` with `seekMsForWord(...)/1000`, which refuses anything outside the screen's accepted range.

## Verification

Player tests: one element per distinct file; same file again writes no `src` and creates no element; reuse seeks to the new range; `seek()` is range-bounded; `evict()` drops one file. Controller tests (`script-controller.test.js`): tells the player what to play by file identity and range, highlight from the sidecar once per word change, end of audio advances exactly once, seek to a word's millisecond. Transcript tests: schema validation, `wordIndexAt`, `seekMsForWord`, `highlightSegments` keep every character, committed sidecars valid. Not yet done (TODO): wire `highlightSegments` into the guide text component; end-to-end browser check on a real device; sidecar review.

## Out of scope today

Generalizing the pool, sidecars and pipeline to all Bible audio and any future audio on the servers is a separate follow-up scalability plan, to be written after today's Summit fixes. It is intentionally not part of these drafts.

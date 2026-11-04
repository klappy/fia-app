# Scripture: word-timed page turns and word highlighting ON by default (PR324)

## Captain override, Nov 4 2026 — highlighting is ON by default for Scripture

This lifts the Oct 5 switch-off recorded in commits 60ad56ba and 00c22e8b (PR #177) and 722f040b (PR #124). **Turning it off again requires asking the captain first.** The flag is `SCRIPTURE_WORD_HIGHLIGHT` in `apps/web/src/lib/scripture-passage.js`, with the same warning in a comment beside it.

The old rationale ("passage boundaries only", no word timing) no longer holds: the reviewed word sidecar now exists (`public/transcripts/0599996a….words.json`, 147 words, its audio sha matches the delivery file's).

Guards lifted: the `scriptureHighlighting==='disabled'` requirement (`lib/scripture-passage.js`; `lib/media-delivery.js` entry check), the publisher flags (`scripts/scripture-audio-publication.mjs` now emits `'enabled'`; already-published `'disabled'` descriptors stay valid and no longer gate anything), and the "Calibrated alignment delivery is not supported" throw in `lib/media-delivery.js` (a declared alignment must now be pinned by `alignmentSha256`).
Integrity checks that still apply: canonical text sha, source pins, ledger/range-review pins, and the sidecar's `audioSha256` matching the audio file. `scriptureAlignment` stays `null` on passage-only descriptors on purpose: the sidecar is the one timing source.

## Page turns and scrolling follow the spoken words (was: elapsed ÷ duration)

Before: passage screens had no alignment (`mediaForDevice` nulled it for passage-only files), so `AlignedReading` scrolled by `durationScrollTop`, which drifts against the real reading, and nothing was highlighted.
Now: `lib/passage-timing.js` maps the sidecar's top-level words onto the displayed verse text (word-level LCS match), honouring the file's `playbackRange` and `timing.mapping`, and `AlignedReading` uses the existing `alignmentPosition`/`alignedSegments`/`followScrollTop` path. The reviewed Berean sidecar omits five verses (4, 6, 7, 8, 10) of Mark 1:1-13; those are verse-timed inside the silence between their neighbours (split by text length) and never get a word highlighted on a guess. With no sidecar, or words that do not match the text, the old duration scroll remains. `script-controller.js` now also reads a sidecar's top-level `words` (it only read `activities[id].words`).

## Two timing sources (known duplication)

`public/content/scripture-alignments/8a69afa1….json` (13 verses, same audio sha, declared in the delivery manifest) is still shipped and still validated, but it never reaches the reader for passage-only files. **The sidecar is canonical** (captain's ruling); the alignment file is a cross-check only and should be retired or generated from the sidecar.

## State of the visual

Logic and the active-word state (`data-active="true"` on the word span) ship. The final glass/gel look comes only from the cookbook mock-ups (klappy/fia-app-cookbook PR #276), which await the captain's approval. Until then the active word uses one existing token (`--glass-fill-3`), no new styling.

## Limits

`sw.js` does not cache `/transcripts/`, so word timing is online-only (offline falls back to the duration scroll). Not required today. Also removed: the developer line "player pool: N file player(s) · controller-driven highlight from sidecar" from the caption pill.

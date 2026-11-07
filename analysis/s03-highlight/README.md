# Unapproved S03 highlight repair proposal

This is a separate diagnostic proposal on the frozen 55db9ba8 continuous-screen candidate. It does not modify `public/transcripts`, admit recordings, mark ASR certified, or claim native/acoustic acceptance.

`node --test analysis/s03-highlight/build.test.mjs` verifies source/text/clock joins and unchanged runtime quality guards. `buildS03Proposal()` constructs complete alternative activity maps only for S03-U009 (intro), S03-U010 (John the Baptist), and S03-U015 (Satan). The other five list rows, all file-level ASR words, all playback boundaries and U024 remain byte-for-byte unchanged as parsed data. The proposal changes 5/8 structurally aligned rows to 8/8. It uses whole raw word spans rather than splicing isolated intervals.

## Evidence and authority

- Exact original recording SHA256: `6ac21beefbcc42b721de90e499b842c07f6a63f0e6a8f91391ce511613412538`.
- Exact delivered Ogg Opus SHA256: `4396f92c538c1292ccff0c9026f6608686006970df9f1b7028892edbfede05b9`.
- Raw timestamp file: `6ad7a8af089f7a99201359634da6b0766021924b6fcdffdcdd40e804602fb401`; recognition `90d5c1cb6800927670b93e79127d86a6f8f908fdb072701c48450455493121c9` explicitly says raw ASR unreviewed, not verbatim certified, decoded samples starting at zero.
- Existing accepted range ledger: `32ca00e8dfa927e27233aea31a0abdd3768d700654d53d2d93b252b2645629eb` pins that recognition/timestamp file and exact source-text hashes. Its word spans are intro239:245, John245:248 and Satan256:257.
- Accepted source-level drift/range review: `3b87cde1e8731a426d58bdd60ae98e26b336e33aa484ae8bc9d7a64528287e33`, explicitly excluding human listening/browser acceptance.
- Accepted PCM mapping: `e133b61474be6c6bde51045d8a4d3401ac463e71e1741f46d8be7d21da3edce4`, scale1/offset0, source clock `decoded-pcm`; analysis `a3204d55e4dbba1fedf6aeceb2daecd2a9c4e1f160053ceabc1540f79c0bac04` retains measured-unaccepted/publicationReady:false and browser-pending status. Source decoded PTS0.0230208333 is retained; ASR uses concatenated sample-zero time, not native MP3 presentation time. No MP3/Apple-native binding is proposed.

All input filenames are SHA256-verified and identity joins checked. No RMS values are hard-coded or used as new qualification. The earlier per-item boundary holds from `3bce23b761fabf14b9099d585f31ec03e2e4c3ee2e3bd16a67b4bea983ec8f16` remain in the report; continuous playback avoids those internal cuts, but this does not erase the holds for separate-cut use.

## Decision and remaining gates

Intro, John and Satan are locally reconstructable from existing source-bound evidence. Their complete proposed maps satisfy exact displayed-token validation, positive monotonic intervals and the unchanged accepted ranges. This is sufficient to prepare the repair for independent review, not to self-approve it. Native application playback must still verify audible word fidelity, one uninterrupted group clock, all eight row highlights, pause/seek/replay/navigation, and final boundary/tail. Ordinary admitted DEV playback may provide that evidence after legitimate candidate deployment or an explicitly labelled controlled overlay; downloading restricted bytes through another route is not authorized.

U024 cannot be repaired from this alternative alone: raw index801 (`wilderness.`) has295.68–295.68s and index794 recognizes `know` against canonical `no`. Keep it untimed. A genuine alternative positive interval or exact recording/decoder/acoustic review is required, never invented duration.

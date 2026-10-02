# FIA Alpha catalog coverage

Generated 2026-10-02T02:26:23.216Z by `@fia-app/pipeline` (`npm run catalog`). Counts are what Aquifer has per language at the pinned commits in `pipeline/sources.json` (FIATranslationGuide @ eb74445). "—" = nothing on Aquifer for that language: the app shows the English item badged (maps, Scripture where the language has none) or an AI-backfill slot marked `ai: true` (term text, image/video titles, narration, descriptions). Nothing is invented; Scripture is never AI-backfilled.

| Lang | Guide pericopes | Books | Scripture editions | Key terms (text) | Key-term audio | Images (localized title) | Maps | Videos (localized title) | Guide units (est.) |
|---|---|---|---|---|---|---|---|---|---|
| eng | 1497 | 32 | 5 | 256 | 256 | 1743 | 227 | 93 | 139533 |
| arb | 1055 | 19 | 2 | 238 | — | — | — | — | 131571 |
| hin | 1124 | 24 | 4 | 151 | — | 1145 | — | 73 | 238738 |
| ind | 464 | 12 | 4 | 238 | — | — | — | — | 44591 |
| por | 904 | 17 | 1 | 238 | 237 | — | — | 72 | 78312 |
| fra | 595 | 11 | 2 | 237 | 237 | 313 | — | 52 | 57329 |
| swh | 460 | 9 | 1 | 237 | — | — | — | — | 36906 |
| spa | 396 | 6 | 2 | 238 | 10 | 217 | — | 55 | 33301 |
| zhs | 288 | 4 | 1 | 155 | 155 | 154 | — | 47 | 20634 |
| zht | 628 | 10 | 2 | 81 | — | — | — | — | 46748 |
| nep | 253 | 3 | 2 | 238 | — | — | — | — | 50194 |
| rus | 172 | 3 | 1 | — | 37 | — | — | — | 23033 |
| hau | 14 | 1 | — | — | — | — | — | — | 912 |
| apd | 24 | 1 | — | — | — | — | — | — | 4167 |
| bis | 20 | 1 | 1 | — | — | — | — | — | 1801 |
| tpi | 68 | 1 | 1 | 238 | — | — | — | — | 6144 |
| fas | 16 | 1 | — | — | — | — | — | — | 2036 |

Guide units are estimated from body bytes (≈260 B/unit, PoC ratio); a built pack carries the exact count. Maps are English-only on Aquifer and are served to every language badged "not yet in <language>". Image and video bytes are the same for every localization; only titles are localized.

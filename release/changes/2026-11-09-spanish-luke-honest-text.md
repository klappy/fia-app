# Spanish Luke honest text (term links, titles, readings, header leaks, `[ES needed]` marker)

Summit train T3, cookbook `work/active/2026-10-03-fia-v3-integrated-delivery/PLAN-2026-11-09-summit-solid.md` § 6 slices E1, E2, E3, E4, E5. One compiler run over all 330 packs, one catalog re-pin. Tracks klappy/fia-app#336.

Law in force: no machine translation and no machine voice for Spanish (captain, 2026-11-04 3:07 PM ET; exception 3:08 PM ET: a captain-controlled toggle, default OFF, may label machine text for MISSING Spanish only; OFF shows `[ES needed]`; machine voices have no exception). Nothing in this change translates or synthesises anything: every title is the FIAKeyTerms source's own text or its key; the toggle stays data-only, default OFF, with no provider, storage or URL switch. `tests/release/no-machine-spanish.test.js` now fails `npm run test:release` on any Spanish unit, asset or recording whose provenance says a machine produced it, or whose bytes ship without a published source.

Captain, 2026-11-09 ~12:50 ET: "This all has to ship today. Summit is tomorrow." Standing: "Ship early. Ship often" / "Progress over perfection" (2026-11-05). This change ships what the pinned data can say honestly and names what it cannot.

## What changed (compiler `server/fia/compiler/presentation/compile.mjs`, run by `build.mjs`)

| Slice | Rule | Spanish Luke (97) | English Luke (97) | Spanish Mark (68) |
|---|---|---|---|---|
| E1 term links | a raw FIAKeyTerms link id `spa-tN-vN` / `eng-tN-vN` resolves to the pack's `term-<lang>-tN` asset by term number before it is dropped; duplicates collapse to one link | terms reaching a step 77 → 497 of 580; unresolved links 661 → 181 | 517 → 558 of 580; 522 → 142 | 61 → 263 of 514; 267 → 39 |
| E2 term titles | a title that is the FIAKeyTerms key (`holy-spirit`, or the English title in key form) becomes the headword the term's own text opens with (`<p>El <b>Espíritu Santo</b> …`, first letter capitalised); English keys are written out (`Kingdom of God`); a Spanish key with no headword stays the key and is marked as the English fallback | key titles 516 → 131 of 580 | 336 → 0 | 446 → 130 |
| E3 `[ES needed]` | a Spanish pack is compiled beside its English twin; `reportPack` (the reader `scripts/spanish-coverage-audit.mjs` runs) writes `asset.spanishText` = present / missing / english-fallback per resource and key term; `resolveItem` in `ResourceIdentification.svelte` and the `MediaStage` caption shows the plain-text marker beside the title when the state is not present | 330 asset occurrences marked | none (English carries no state) | 145 |
| E4 readings | the "three readings" sequence takes each Scripture edition once; a pack with two editions reads twice instead of repeating RV1909 | 97 packs: RV1909 then ASBRT | three readings unchanged | 68 packs |
| E5 header leaks | a unit whose whole text is the stage title, the passage reference or the two run together compiles to coverage (`treatment: stage-header`) with a `stage-header-unit` diagnostic, not a step | — | `eng.LUK-5-12-16` S05-U001/U002, `eng.LUK-7-36-8-3` S02-U001/U002 dropped | — |

The remaining 181 / 142 / 39 unresolved links point at terms the pack does not carry (for example `spa-t67-v1` in `spa.LUK-1-26-38`); they are diagnostics, not data loss. The 131 Spanish key titles that remain have no headword in their Spanish text; they show as the key with `[ES needed]` beside it, which is the truthful state, and wait on a native speaker, not a machine.

`spanish-coverage.js` now treats a source-marked English title (`titleProvenance {status: missing, fallback: eng}`, which the FIA visual records already carry and the compiler now copies onto the asset) as `english-fallback`, for resources and for key terms. The audit therefore counts more lacking entities than before: it is reporting titles it could not see before, not a regression.

Audit, `node scripts/spanish-coverage-audit.mjs`, before → after (unique items): pericopes 165 / lacking 4 → 165 / 4; resources 487 / lacking 228 → 487 / 228; entities 178 / lacking 6 → 178 / 58 (`entity:english-fallback` 1 → 53, now counting key titles). Occurrences: entity lacking 6 → 215. The four lacking pericopes are unchanged (`spa.LUK-3-1-14` 1 step, `spa.LUK-4-31-44` 2, `spa.LUK-5-12-16` 2, `spa.LUK-7-36-8-3` 2): the two Luke header packs still differ by two unit ids because unit ids are positional, and the audit compares ids.

## Re-pin

`apps/web/public/content/registry.json` is `b27731a3d19ec27187ef6e8d2804515339169987c87562a83a00bca225d14ad7` (2,522,655 bytes; was `f5ce2e24…`). `server/fia/publication/trusted-generalized.json` re-pinned: catalog digest and size, all 331 record envelopes, `compilerCommit` = the compiler commit. `REGISTRY_SHA` in `server/fia/preparation/guide-dispatch.mjs`, the resolver test pin, `server/faces/worker/BACKEND-CLOSURE.json` (guide-dispatch, trusted-generalized), `evidence/first-pericope/timing-quality.json` (registry digest only), the approved-audio proof index (`0e652ebc…`, stored as a replay fixture) and registry entry 5 in `executable-presentation-runtime.mjs` `SUPERSEDED_BUILDS` (appended, nothing edited), then the release closure.

**English Mark is byte-identical, all 68 packs.** `build.mjs` compiles `eng.MRK-*` with `{frozen: true}`: those presentation revisions are bound into `guide-sources.json` (408 rows under guide-dispatch `METADATA_SHA`) and the Mark 1:14-20 prepared-audio delivery sidecar, scripture evidence and preparation catalog. Re-pinning that chain is not a catalog re-pin, so the approved first pericope (`ccd72f23…`, 454,295 bytes) and every other English Mark file keep their bytes; `tests/compiler/presentation.test.mjs` proves the frozen compile reproduces `eng.MRK-1-14-20` exactly.

## Known gaps, recorded, not fixed

- `eng.LUK-3-1-14` S05-U011 ("Talk about how you will translate this poetic language…") has no Spanish sentence in the pinned source. It stays an English-only step; the Spanish pack shows one fewer unit. A native translator supplies it; no machine fills it.
- `eng.MRK-2-23-3-6` S02-U001 ("SETTING THE STAGEMARK 2:23–3:6") is the fifth header leak. English Mark is frozen (above), so it stays until the Mark audio chain is re-pinned; the rule already matches it.
- English Mark term titles keep their source keys for the same reason (326 of 519).
- 131 Spanish Luke and 130 Spanish Mark term titles remain the English key, marked `[ES needed]`.
- 228 visual titles (images, maps, videos) remain the English title, marked `[ES needed]`; no visual has bytes beyond Mark 1:1-13 (plan § 5).
- Spanish guide text `reviewLevel: None` everywhere (plan § 10 Q5, captain disposition).
- Spanish audio 0/165 (plan § 6 E7, multi-day; human-or-machine fact of the upstream recordings unrecorded).
- The `[ES needed]` marker is plain text in the existing title position: no control, badge, colour or new row. The MT toggle has no UI.

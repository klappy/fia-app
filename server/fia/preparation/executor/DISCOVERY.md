# Published guide discovery and observed originals

This follow-on resolves trusted immutable guide requests through published metadata rather than a hand-added accepted-passage row. It is not connected to the hosted request route yet. Existing PR148 and PR150 release surfaces remain separate.

`publishedGuideMetadataFromAudit(bytes,sha256)` verifies an explicitly trusted audit snapshot and removes private filesystem paths and placeholder readiness fields. The source joins in that audit remain a caller-owned trust boundary. Its resulting portable metadata contains literal publisher URLs, presentation revisions, guide content identities and exact source-unit text hashes. It carries no claimed recording-byte identity, source size, accepted timing or playable result.

`createGuideDiscoveryAdapter({metadataBytes,metadataSha256,bucket})` pins a private copy of the metadata bytes before parsing. `resolveRequest` requires exact pack, presentation revision, language, edition, source-unit id and text hash. It returns a section-level input plus the original consumer binding. Different units in one section reuse the same discovery/acquisition while their exact consumer bindings remain separate for subsequent playback projection. The section script identity is the pinned complete guide content hash; source-unit text bytes must also be verified when the alignment adapter loads them.

Book, language, passage and section are metadata parameters. No recording URL is interpolated from a guide version. The English Mark audit resolves 5,977 unit requests across 408 sections and 68 passages without fetching any recording. This observed inventory does not establish Spanish Mark availability or a complete Scripture-audio map.

The discovery adapter stores canonical content-addressed JSON under `preparation/discovery/<sha>.json`, using conditional creation and hash-verified readback. Its publisher validator binds a later acquisition to exactly that trusted selected row. A generic shared S3 hostname alone is not authorization.

`createObservedSourceAdapter` reads and verifies this discovery artifact, validates the requested identity and literal URL, then issues a bounded HTTPS GET with no redirects. This first slice still admits at most 2 MiB of audio/mpeg within a 30-second request deadline. Actual bytes determine the source SHA and size. Existing R2 original storage writes an immutable content-addressed body, an append-only URL/revision/content reference, then an immutable acquisition receipt. Conflicts, corrupt retained data and missing provenance refuse serving rather than overwrite or refetch. A completed warm acquisition reads verified retained bytes and never contacts the publisher.

## Revision and freshness semantics

`source.version` and the acquisition receipt's `sourceVersion` currently identify the **discovery presentation snapshot**. They do not assert an independently verified publisher recording version or that a URL can never change. The authoritative byte identity is the observed source SHA-256.

Normal warm reuse deliberately does not check for upstream updates. Therefore an upstream replacement at the same URL with unchanged presentation text is not detected by this slice alone. The separately specified freshness operation must observe bytes independently, append any changed source SHA, invalidate dependent recognition/alignment/derivative identities, and promote only after acceptance. It must not overwrite the original or mutate the normal acquisition receipt. Eligible old coherent playback may remain available during refresh; revocations and known-bad artifacts must still be excluded by the serving layer. See cookbook PR174 and `SOURCE-FRESHNESS-RECIPE.md` before implementing that operation.

## Evidence and remaining gates

The one real local acquisition proof used the literal Mark 1:21–28 S01 publisher URL. Its hash was unknown before the GET: 853,750 bytes became SHA `faa40ccc1704033ee23679aff097f64f271c07cb9f1474640d1070f9a9739ba4`. A complete local Miniflare R2 restart then reused that exact source with upstream disabled. This is source-only evidence: it does not establish transcription, timing, playback or hosted readiness. Independent review verified retained bytes and joins; a second reviewer warm-only runtime reopen timed out, so it is not counted as an independent real-source restart proof. The synthetic real-R2 restart/corruption test separately passed independent execution.

Public source contains algorithms and synthetic tests, not private raw inventories or transcripts. A production integrator must provide verified metadata loading, current serving eligibility, route/authentication wiring, hosted transcription, calibrated timing/acceptance policy, freshness observation and dynamic publication. The long-original recipe is separate; these adapters do not yet implement its proposed 8 MiB policy.

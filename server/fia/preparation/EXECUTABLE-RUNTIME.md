# Requested executable presentation runtime

Contract: cookbook reviewed `7fa17af806c139cfc353cace39fa6d50ed9e061b`
(PR200 merged `80d76eaa8e8ea4f0c8e0043815ddd8c2ca4fe5fa`).

`prepare_presentation` / `POST /v1/presentation-preparations` accepts exactly
`{packId,baseRevision,sourceRevision,capability:'executable-presentation'}`.
The base catalog supplies this entire object as `preparationDemand`; a client
does not reconstruct source authority. `read_presentation_preparation` and
`GET /v1/presentation-preparations/:jobId` observe an existing job only.

The installed Worker entry subclasses the existing SQLite-backed
`FiaPreparationJobs` with the deployed read snapshot. A fixed, separate object
name, `fia-executable-presentation-authority@1`, owns this publication lane.
Its R2 objects are immutable, conditionally created, hash-verified JSON under
`preparation/executable/`. Existing corruption is refused, never overwritten.
No new namespace, bucket, paid provider, scheduler, or migration is introduced.

The existing source archive is verified and packaged as immutable guide
metadata during the existing build. A demand fetches only its selected guide.
The resolver verifies canonical text/order and published base bytes. Domain
projection, durable decision jobs, and request sidecars remain separate from
the shared HTTP/MCP faces and publication storage. An owning demand completes
publication; concurrent observers can poll it. A read cannot repair a pointer,
invoke a provider, or create a missing sidecar. Startup fences interrupted
decision attempts; uncertain work is not automatically retried.

A demand is offered, and admitted, only when the base artifact was compiled from
the source revision it names. The approved original presentation
(`eng.MRK-1-1-13`, base id `fia-mark-authentic@1`) has its own lineage and is
not projectable from that source, so it is neither offered nor admitted. A demand
the resolver or projector cannot satisfy answers a typed `blocked` envelope with
its code as `reason` (HTTP 409), never a 500.

The execution policy hash includes the approved-audio proof index, and a job is
also keyed by its projector recipe, so a release can supersede the policy or the
recipe that validated a publication. The registry of released builds
(`SUPERSEDED_BUILDS`) is finite and frozen. Every entry is a literal policy and
recipe, with today's provider. None is computed from today's code or content
(`sha256(EXECUTION_POLICY)`, today's policy or a recipe constant), because a later
release moves those values and would rename the build. The entries are:

- `35e074a6…5a47` under `fia-server-source-action-projector@1`: the build without a
  proof index (`aad92a4`);
- `9a7733f5…295c` (the policy bound to proof index `d3be5884`) under `@1`: the
  builds through `e7eb0f0`, before #190 added flow roles;
- `9a7733f5…295c` under `@2`: the builds from `45a3248`.

The entry equal to today's build is the current build, not a historical one. The
registry is release bookkeeping: reads no longer authenticate rows by it. Once a
release moves the policy, a row under an older build fails its verifier and is a
cache miss (below), so the base is served and an explicit Open re-prepares.
`tests/worker-serving/execution-registry.test.mjs` fails when an entry is not
written as a literal, when one of these names changes, or when today's build is not
registered. So a release that moves the policy or the recipe appends its own build
and never edits one. The transition test replays each released build with the proof
index it served, stored byte for byte in `tests/worker-serving/fixtures/approved-audio/`
(DEV serves the same 4311 bytes), so a replay keeps its literal policy after a content
release. A job under `@1` is projected without flow roles, so its publication
reproduces exactly.

The executable publication store is a content-keyed cache over the base catalog,
never an identity or trust ledger (cookbook `klappy/fia-app-cookbook`
`work/active/2026-10-15-fia-package-luke/RULING.md` § DEV publication conflict,
recorded 9281c61; same rule as `work/86ed/2026-10-01-fia-alpha-v2/RULING.md:89`).
No packing, hash or binding check ever blocks usage:

- A publish whose record key (`executable-record:<packId>@<revision>`) already exists
  replaces the row and advances the current pointer. There is no
  `executable-publication-conflict`. A moved policy that reproduces identical bytes
  (DEV's `{9a7733f5, @2}` rows for `eng.MRK-1-14-20`, Mark 1:14–20) rewrites the row
  under the newer job, and the explicit Open is `ready`, never a 409.
- A stored row that fails byte, hash, length, provenance or binding verification
  (corrupt or missing retained bytes, a foreign/dangling pointer, a wrong owner index,
  changed assets, a superseded policy, revocation) is a cache miss. The catalog read
  falls through to the base catalog (the current read serves the base with its
  existing demand, so an explicit Open re-prepares), and an artifact read falls
  through to the base artifacts. A miss never answers `unavailable` because of the
  stored row; an exact revision that only the cache held answers the base's own
  not-found. The failure goes only to the overlay's `diagnose` hook
  (`{event:'executable-cache-miss',where,kind,reason,...}`) for bookkeeping. `kind`
  is `verification` for a named check failure and `transient` for an unnamed
  storage/R2 fault or a timeout (a storage fault on the read itself also falls
  through), so a blip is told apart from a bad row. The production runtime writes
  each miss as one structured `console.warn` line; a throwing or rejecting hook is
  contained and never changes the answer.
- A replaced row prunes the artifact-owner index entries for bound artifacts it no
  longer binds, so stale owners neither count toward the 1024 cap nor cost an
  artifact read a verification pass.
- Integrity pins (artifact sha256/bytes, `mediaAssetsSha256`, owner indexes) stay
  for diagnostics and refresh bookkeeping, not as a usage gate. A row is served as
  executable only when it verifies, so a miss never serves different bytes.

The historical-build authentication (`authenticateCurrent`) is removed: every
unverified current row already falls through to the base, so it was unreachable. A
job-status read of a superseded job reads its demand row. If that row never recorded
a publication, the read answers typed `blocked` `execution-job-policy` (HTTP 409).
If it recorded a revision, the read answers that revision's current row: after an
identical-bytes re-prepare replaced the row, that is `ready` with the newer job's
provenance; otherwise the old row is a cache miss and the read answers typed
`blocked` `revision-not-found` (the base's own not-found). Expected
publication refusals (pointer race, stale base, revocation, refused validation) and
named post-admission refusals answer the typed `blocked` envelope with their code
(HTTP 409) on the write path only. An unnamed fault is not disguised as a refusal. A
transient storage or fetch fault during resolution answers `blocked` with its code
and writes no job row, so it can be retried.

Publication stores verified bytes before atomically advancing its pointer.
New publication checks the latest base, while an eligible previously published
pinned version remains readable. Both catalog and artifact reads recheck
authority and deterministic provenance, including current narration capability
availability, and serve the cached row only when it verifies; otherwise they fall
through to the base.

Catalog `execution.artifacts` lists the bound JSON dependencies as
`{id,sha256,bytes,mime}`. `execution.mediaIdentity:{packId,revision}` is emitted
only after the server verifies that the projected assets exactly equal the
hash-verified base assets; `mediaAssetsSha256` hashes their canonical JSON.
Clients forward this media identity into the existing media revision checks.
It does not assert that every source-referenced medium has delivery bytes.
New artifact HTTP responses use `private, no-store`; explicit private offline
storage follows the established last-verified-snapshot policy and cannot claim
fresh remote eligibility or ignore already observed revocation.

## Current capability limits

Production composition has no source-action question composer or semantic
provider installed. Its output carries unresolved transitions/manual holds and
explicit unavailable narration. Artifact `ready` means verified executable
bytes, **not** that all source meaning or media has been resolved.

The compatibility narration resolver reflects the existing installed original
preparation route by calling its own `eligibleRows`/`resolveSelection` policy.
It does not turn publisher inventory into a playback grant and introduces no
new per-passage table. The existing finite route supports eight P2 units; this
is **not** completion of generic original preparation. A future generic
capability port must replace that compatibility limitation without inventing
audio acceptance. Current eligibility is rechecked when bound references are
served. Injected trusted runtime capabilities are for separately reviewed
composition/tests; no public request may supply them.

Real P2/P3 EN/ES runtime tests prove source/artifact integrity, SQLite/R2 reuse,
and read-only observation. The existing built manifests have no image/map
delivery entries. Visual playback, actual semantic accuracy, generic narration
execution, and deployment remain separate requirements. Repeated whole-record
artifact verification has no production latency measurement yet.

Validation:

```
node --test tests/worker-serving/execution-registry.test.mjs tests/worker-serving/executable-transition.test.mjs
node --test tests/publication/executable-overlay.test.mjs
source /tmp/fia-window-stream-test-env.sh
FIA_MEDIA_PROOF_ROOT=/tmp/fia-client-01a10fba/integration/dist \
FIA_EXECUTION_PROOF_DIR=/tmp/fia-server-execution-proof \
node --test tests/publication/executable-runtime.test.mjs
```

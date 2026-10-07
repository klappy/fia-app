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
recipe that validated a publication. The registry of superseded builds is finite,
each named by its policy and recipe, with today's provider: the build without a
proof index (`aad92a4`) and the builds through `e7eb0f0` with today's policy, both
projecting under `fia-server-source-action-projector@1`, before #190 added flow
roles (`@2`). A job under `@1` is projected without flow roles, so its publication
reproduces exactly. Only the unqualified current read (`read_pack({packId})` and
`GET /v1/packs/<packId>`) may then serve the base with its existing demand, and
only after it authenticates that historical publication exactly: the current
pointer and artifact-owner indexes, the closed publication row, the closed job row
with its recomputed id and retained context bytes, the request row bound to that
revision, and the publication reproduced under that historical build. A reason
string alone never qualifies; a forged, unregistered or corrupt row, a wrong
pointer or index, or missing bytes stays refused. The read writes nothing. The
historical revision and its old job-status read stay denied. This tree has no
publication generations, so the demand is the existing four-field one (cookbook
backport linked from the release note).

Publication rows and their provenance are immutable. Republishing identical bytes
under a newer job is a typed `blocked` `executable-publication-conflict`, never a
replacement. Expected publication conflicts (pointer race, stale base, revocation,
refused validation), named post-admission refusals and a stale-policy job-status
read answer the typed `blocked` envelope with their code (HTTP 409). An unnamed
fault is not disguised as a refusal. A transient storage or fetch fault during
resolution answers `blocked` with its code and writes no job row, so it can be
retried.

Publication stores verified bytes before atomically advancing its pointer.
New publication checks the latest base, while an eligible previously published
pinned version remains readable. Both catalog and artifact reads recheck
authority and deterministic provenance, including current narration capability
availability. Foreign/dangling pointers, changed assets and corrupt evidence
refuse service.

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
node --test tests/publication/executable-overlay.test.mjs
source /tmp/fia-window-stream-test-env.sh
FIA_MEDIA_PROOF_ROOT=/tmp/fia-client-01a10fba/integration/dist \
FIA_EXECUTION_PROOF_DIR=/tmp/fia-server-execution-proof \
node --test tests/publication/executable-runtime.test.mjs
```

# Bounded original-recording preparation

Recipe: cookbook commit `a0f24dffced969249705644d6657b4e520ea44c9`,
`work/active/2026-10-05-hosted-preparation/RECIPE.md`.

This candidate adds actual request-triggered source acquisition and durable byte
reuse to the existing Worker. It is not deployed by these files. It does not yet
run hosted transcription/alignment or admit new publications without a reviewed
catalog update. Those are remaining dependencies for the fully dynamic pipeline.

## Public contract

`POST /v1/preparations` accepts exactly `packId`, `presentationRevision`,
`language`, `edition`, `activityId`, `sourceUnitId`, `sourceTextSha256`, `quality`.
Only literal reviewed catalog selections are accepted, before accessing storage.
No caller URL, operator identity, subscriber or retry key is persisted. Different
activities in one recording resolve to the same canonical input operation.
Book and language are data; the current bounded catalog admits English Mark
1:14–20, first guide section, explicitly requested `original` quality only.

The response is `fia-preparation-status@1`, with `jobId`, `state`, `reason`,
`sourceState`, `selection`, `result`, `resultSha256`, `statusUrl`, `reused`.
First creation is HTTP201, repeat/status HTTP200. `preparing` is durable work;
`blocked` names missing acceptance or failed verification, never playable media.
HTTP503 indicates missing storage or damaged stored evidence. Poll the returned
status URL; browser cancellation does not cancel or recreate the durable job.
Result completion is not permission to autoplay.

An alarm fetches only the admitted source URL, forbids redirects, bounds the
request/body to30seconds and the lesser of exact source length or2MiB, and checks
MIME, bytes and SHA256. Create-only conditional R2 writes store immutable original bytes and a source URL/version provenance reference. Full readback precedes the durable job verification marker. Failure stays blocked; an interrupted persisted attempt is
uncertain and is not automatically retried. All status claims of verified source
and audio responses revalidate the full stored bytes. Warm requests do not fetch
the publisher again.

`GET|HEAD /v1/preparation-audio/<source-sha256>.mp3` serves only already verified
verified R2 bytes, with single HTTP byte ranges and ETag. Responses use no-store so browser caches cannot bypass later serving revocation. It never
starts acquisition by itself. The publisher's missing CORS headers therefore do
not prevent same-origin verified browser loading. It is not a transcode.

## Result admission

Ready results must pass `contract.mjs` against a server-owned expected descriptor.
The immutable ASSETS JSON must use `canonicalJSONString` exactly; its raw hash
therefore equals the client-computable canonical result hash. Source, script,
language/edition/passage, recipe/config, activities and reviewed evidence remain
separately bound. A result is at most32KiB. Original delivery uses the exact
same-origin hash route, original source hash/bytes/duration and `audio/mpeg`.
Medium delivery, when separately admitted, must use the existing transcode origin;
there is no automatic quality substitution or transform request in this adapter.

Accepted result SHA is an output revision, not the canonical input job key.
A new reviewed admission can unblock the same operation on explicit POST.
Revoked/replaced admission is never returned as ready; a late attempt cannot
overwrite a newer admission. Failed unchanged admissions do not repeat work.

Current p2 source and the eight activity ranges are admitted through separately reviewed source and observed Chromium presentation-clock evidence. This is prior accepted timing; it is not hosted ASR execution or a universal-device claim.
The official-recording adapter does not change the broader policy permitting
generated fallback under separately authorized policies.

## Activation and rollback

The proposed `FiaPreparationJobs` SQLite class and `FIA_PREPARATION_JOBS` binding
remain in the existing Worker stack. FIA_ORIGINALS binds separate private fia-originals-development, fia-originals-staging and fia-originals-production buckets; these names are proposed configuration, not provisioned-resource claims. Namespace provisioning, migration
`v1-preparation`, and DEV activation require the captain's scoped disposition and
the existing reviewed release train. No direct deployment is authorized here.
Each environment owns its own namespace and original-source bucket. This slice persists one867865-byte
source in R2 plus metadata; storage/requests/CPU have costs, and no zero-cost claim is
made. No provider credentials, paid ASR or generation call is present.

Rollback disables request routing while retaining class export, migration history
and stored data. Do not delete the class or namespace. Actual hosted acceptance
requires exact deployed identity and cold/warm/restart/range/playback receipts;
local workerd tests do not establish hosted completion.

## Immutable originals and freshness

The user explicitly authorized deterministic R2 original-source persistence. Demand fills a missing `originals/sha256/<hash>.mp3`; it never speculatively fills the corpus. Immutable source URL/version-to-content references live under `originals/refs/`. Concurrent writers use create-only conditions and verify the winner. Corrupt or conflicting bytes are refused, never overwritten or silently reacquired. A completed R2 write can be reconciled after a coordinator restart without fetching the publisher again.

Freshness checks are a separate future operation: a newly observed source revision creates new immutable content and references; it does not overwrite accepted audio. Current catalog eligibility must permit every request; revoked or known-bad sources are excluded even if bytes remain stored. Derived media require separate namespace and policy. The current known-hash2MiB input cap is a bounded p2 slice, not a claim that all future source sizes or first-observation discovery are implemented.

Checkpoint `dc50c7553c180c0d7a2e46570a90455ea650414d` tested DO chunk storage; that storage implementation is superseded by R2 and retained only as historical proof.

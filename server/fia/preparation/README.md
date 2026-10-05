# Bounded original-recording preparation

Recipe: cookbook commit `125bc6c0f5f8500070659ea02a22da720ed9f2fb`,
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
MIME, bytes and SHA256. An atomic transaction stores64KiB chunks plus their
verified marker. Failure stays blocked; an interrupted persisted attempt is
uncertain and is not automatically retried. All status claims of verified source
and audio responses revalidate the full stored bytes. Warm requests do not fetch
the publisher again.

`GET|HEAD /v1/preparation-audio/<source-sha256>.mp3` serves only already verified
durable bytes, with single HTTP byte ranges, ETag and immutable caching. It never
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

Current p2 source is pinned, but `accepted:null` deliberately withholds playback
until reviewed timing and browser presentation-clock evidence are admitted.
The official-recording adapter does not change the broader policy permitting
generated fallback under separately authorized policies.

## Activation and rollback

The proposed `FiaPreparationJobs` SQLite class and `FIA_PREPARATION_JOBS` binding
remain in the existing Worker stack. Namespace provisioning, migration
`v1-preparation`, and DEV activation require the captain's scoped disposition and
the existing reviewed release train. No direct deployment is authorized here.
Each environment owns its own namespace. This slice persists one867865-byte
source plus metadata; storage/requests/CPU have costs, and no zero-cost claim is
made. No provider credentials, paid ASR or generation call is present.

Rollback disables request routing while retaining class export, migration history
and stored data. Do not delete the class or namespace. Actual hosted acceptance
requires exact deployed identity and cold/warm/restart/range/playback receipts;
local workerd tests do not establish hosted completion.

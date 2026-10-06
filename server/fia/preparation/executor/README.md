# Demand-triggered preparation executor

This is an unconnected execution core plus an offline development reference recognizer. It does not add a public route, install a model, provision infrastructure, or establish hosted recognition or accepted playback timing. The preceding reviewed preparation service remains separate.

Recipe: `klappy/fia-app-cookbook` commit `49c620358749f12c70fadea5d34d4804c886f03c`, `work/active/2026-10-05-preparation-executor/RECIPE.md`. Persistent hosted ASR decision: cookbook PR172, existing Otto ticket `work/queued/2026-10-05-fia-durable-request-store/TICKET.md`.

## Execution boundary

`createPipeline({storage, policyId, adapters, verifyArtifact, allowPaid:false})` returns `run(input)` and internal trusted `reconcile(input,node,report)`. The caller supplies a durable transactional store exposing `transaction(callback)` with `get` and `put`. Memory fixtures prove the algorithm. The separate workerd/SQLite test qualifies local Durable Object transactions and retained artifact reuse across a complete runtime restart using synthetic adapters; hosted deployment and real provider restart behavior remain unproven.

The stages are discover, acquire, transcribe, align, accept and publish. The strict semantic input contains packId, book, language, edition, passage, resource, scriptSha256, source publisher/resource/version, modelRecipe modelId/modelRevision/configSha256 and policyRevision. Caller URLs are not accepted. Discovery includes language and passage selection; acquisition shares by verified discovery bytes; recognition shares by actual acquired source bytes plus language/model recipe. Consumer-dependent later stages bind the full input and parent hashes. No known source hash is required in the initial semantic request.

Each adapter is an explicitly trusted `{paid:false, run}` capability. Acquisition returns an artifact whose hash identifies actual source bytes, not a receipt envelope. `verifyArtifact(artifact,{input,node})` must resolve eligible retained bytes and validate the domain-specific identity/authority for that node, then return a Uint8Array. The engine independently checks its SHA-256. This callback must enforce rights revocation and known-bad exclusions even on warm reuse. An artifact descriptor alone is not proof.

Acceptance disposition is read from verified JSON bytes, never mutable descriptor metadata. Only `machine-accepted` or `review-accepted` can advance to publication; `review-required` blocks. The concrete acceptance adapter must bind source, script, recognition and alignment evidence to the consumer and implement the reviewed acceptance policy. There is no calibrated machine-acceptance adapter here. A string saying accepted is not sufficient evidence for a production adapter.

Claims persist before adapter execution. Concurrent callers observing a preparing claim return preparing. An interrupted or ambiguous execution is not automatically replayed. Reconciliation is internal only and requires exact node, input, attempt and revision fences plus evidence; no public authentication mechanism is supplied by this module. Hash-valid output does not itself establish permission to reconcile or publish.

## Bounded recovery

A trusted free adapter can declare `retry:{maxAttempts:2}` or 3; the default is one attempt. The first claim persists the budget, which later adapter configuration cannot raise. A returned `{kind:'retryable-failure', classification:'pre-dispatch'|'idempotent-free-read', evidence:'bounded evidence reference'}` admits the next attempt only on a subsequent demand and only within that budget. This classification must be based on observed evidence, not inferred from a timeout. There is no retry loop or scheduled job.

Thrown exceptions, unknown outcomes and paid calls remain uncertain. Even an explicit classified failure from a paid adapter does not retry automatically. Retained corrupt artifacts are unavailable and never silently replaced. New attempt IDs and revisions fence delayed results from old attempts.

## Offline recognizer

`createLocalRecognitionAdapter` launches `local-recognize.py` using an explicitly configured local interpreter and already-installed model. It uses no shell and forces the model libraries into offline mode. It verifies the acquired bytes, script hash, model file manifest and exact interpreter/package-version manifest before retaining a candidate. The model revision equals the model manifest hash. `localRecognitionConfigSha256(scriptSha256,runtimeManifest)` binds runtime versions and fixed recognition settings into the requested recipe. Runtime upgrades therefore require a new recipe identity.

This reference slice cannot process all official recordings: its 2 MiB source cap excludes the observed 5.14 MB BSB chapter source. Generalized long-original support needs an explicitly reviewed byte/duration/resource policy and bounded streaming or durable staging; removing limits is not an acceptable extension. The decoded duration here is at most 600 seconds, Python deadline 120 seconds and parent deadline 125 seconds. It decodes the same in-memory bytes that were hashed, uses CPU/int8 with four threads and unprompted word timestamp recognition. Tiny English models cannot claim Spanish support. No source text is provided as a recognition prompt. The output remains a raw candidate; word timestamps are estimates.

The bridge needs `resolveSource` and an immutable `storeArtifact` supplied by a trusted local caller. Returned storage SHA must match exact output bytes. Scratch directories retain diagnostic inputs/results; an integrating operator must define cleanup and private storage policy. This bridge is not a production sandbox and does not provide provider authentication, remote worker dispatch or server restart recovery.

## Remaining production work

- Otto's existing-account runtime decision, capacity/cost evidence and reviewed deployment recipe.
- Authenticated dispatch/result reconciliation, persistent model caching and durable output publication.
- Trusted publisher discovery and source-acquisition adapters, and R2 artifact verification.
- Alignment plus calibrated recognition confidence and measured quiet-boundary policies; uncertain cases stay blocked for review.
- Coherent eligible served/desired snapshot integration, dynamic publication and client acceptance.
- Actual hosted cold/warm/restart, outage recovery and browser playback qualification.

Validation commands: `node --test tests/preparation-executor/pipeline.test.mjs tests/preparation-executor/local-adapter.test.mjs` and `python3 tests/preparation-executor/local-recognize.test.py`. The latter identity tests do not install or import the ASR runtime. Run `node --test tests/preparation-executor/worker-storage.test.mjs` with installed esbuild/Miniflare dependencies (or `FIA_WORKER_DEPENDENCIES` pointing to their package.json) for the actual local SQLite restart test. A separate retained local model run exercised Node-to-Python execution against one official source; it is evidence for local execution only.

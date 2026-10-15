# Private durable window execution

`createWindowRecognitionExecutor({storage,artifacts,recognition,maxWindows,stepMs})`
validates a complete canonical planner plan before reserving work. Storage provides
`transaction(callback)` with transactional get/put. Recognition must declare
`paid:false`, a pinned `dependencySha256`, and `run({planIdentity,window,signal})`.
The adapter owns verification of actual full-source/decoder PCM and exact slicing;
the executor cannot infer those facts from returned JSON alone. Its dependency
must bind the decoder/model/runtime/script/language/config implementation.

Recognition returns bounded Uint8Array JSON with schema `fia-window-raw-words@1`,
exact `windowSha256`, `planIdentity`, `window`, runtimeEvidence containing script
and model-manifest hashes plus runtimeManifest, roundingPolicy
`seconds-floor-start-ceil-end@1`, originalSegments and local integer-sample words.
Original segments and all extra raw fields remain in retained bytes. Invalid or
zero-duration words refuse the window, never receive fabricated intervals.
The existing planner projects offsets and retains overlap conflicts; no timing,
transcript reconciliation or playback acceptance is inferred.

Artifacts provide `write(bytes,{signal})` returning `{sha256,reference}` and
`read(descriptor,{signal})` returning bytes. Every result is copied, hash-checked,
identity-validated and read back before completion. Warm corruption returns
unavailable without recognition. Output contains verified artifact references and
the planner projection, never accepted ranges.

Claims and per-plan start budgets are durable transactions. Concurrent requests
observe preparing; they do not diagnose a crash. Trusted single-owner startup may
explicitly call `recoverInterrupted({plan})`, which fences preparing revisions to
uncertain. It must not be called merely because another request is in progress.
Neither uncertainty nor restart causes automatic replay. Timeout/abort passes an
AbortSignal and persists uncertainty; this is not proof the underlying work stopped.
Late immutable artifact writes may survive as orphans but cannot complete a fenced
attempt. Each recognition/artifact wait has stepMs, not a whole-plan deadline;
external request cancellation is supported. Durable storage itself is trusted.

Tests include actual local SQLite/R2 persistence and concurrent ownership. Test
recognition is synthetic; the separate retained-source local adapter proof is not
hosted model activation. No factory, public Worker route or paid provider is wired.

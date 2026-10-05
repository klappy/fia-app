# Local fixture preparation

Recipe: cookbook merged revision `254864c8f02e31ac6da422146e16ffed231d9e8d`, `product/guidance/bounded-audio-job-proof-v1.md` (reviewed candidate `48565d846d0d0ef4e577100f0eaf6bda743da52c`).

This is a zero-cost local fixture CLI, not a hosted operator API, speech generator or playable audio publisher. The operating-system account is trusted; operator text is audit metadata. Programmatic capabilities are supplied by trusted local callers, not accepted as proof of remote identity. The injected provider/fault hooks are trusted test code, not a network sandbox. The built-in provider returns deterministic JSON fixture bytes and makes no external calls.

From repository root, save a fixture request matching `tests/jobs/fixture.mjs` as JSON, then run:

```sh
node server/core/jobs/cli.mjs enqueue /absolute/local/store operator request-key /absolute/request.json
node server/core/jobs/cli.mjs execute /absolute/local/store operator JOB_ID
node server/core/jobs/cli.mjs status /absolute/local/store operator JOB_ID
node server/core/jobs/cli.mjs plan /absolute/local/store operator JOB_ID
node --test tests/jobs/*.test.js
```

Request generation settings, exact source/effective text identities, language, voice/model and recipe are bound into buildKey. Output SHA hashes actual fixture bytes separately. Equal request keys/payloads reuse; changed payload under the same key conflicts. Only queued jobs execute and each gets one attempt. Status conservatively exposes a persisted preparing attempt as uncertain, including while its original worker may still run. This intentionally avoids claiming a stopped worker or an automatic retry opportunity.

Reconciliation command: `reconcile STORE OPERATOR JOB_ID REPORT_JSON`. Report contains `attempt`, numeric `revision`, `outcome` (`unresolved`, `no-output`, or `recovered`), bounded `evidence`, and only for recovered `bytesBase64` containing the original fixture output. Local operator must establish original-attempt evidence; this CLI cannot independently prove an external charge. Matching revision/attempt prevents late provider output from replacing a reconciliation. No reconciliation requeues work.

One local filesystem directory holds the snapshot, immutable content-addressed artifacts and an exclusive lock. Atomic snapshot replacement and fsync require a platform/filesystem supporting directory fsync and atomic rename/link. Errors fail closed; there is no Windows/network-filesystem/cloud durability claim. Do not share the directory with untrusted users or modify live files. Restart does not discard state or infer lock expiry.

A crashed process may leave `lock/owner.json`. Inspect its token and PID; only after verifying that original process is stopped, use `recover-lock STORE OPERATOR TOKEN`. Recovery refuses a live PID or different token. Missing/corrupt owner metadata requires manual investigation, never age-based deletion. A PID reused by another process remains conservatively blocked. Temporary/orphan artifacts confer no completed status and can be retained for investigation.

Full J remains open: real original-recording applicability/provenance/alignment, accepted-media fallback and discussion semantics, real-content AudioPlan, hosted durability/authentication, provider/budget authority, compiler/serving/client integration and production release. Fixture plan entries preserve order and confirm holds but do not establish audible fidelity or playback. No root scripts, client, media/schema3, compiler, release or remote service were changed. The existing root `npm test` does not discover this suite; run the direct command above explicitly. A crash during lock recovery can leave `recovery-lock`; investigate manually rather than deleting it by age.

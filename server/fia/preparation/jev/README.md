# Bounded cue-role decision adapter

Implements Q10/Q13 of cookbook request-pipeline amendment `ae41959` and the
normalized `fia-cue-role@1` contract/schema, copied unchanged beside the adapter.
Provider wire precedent: `klappy/ma8ic8all-jev` commit
`2fe871ee59387d433411b768be2e5926aea71d33`, `src/index.js`.
This is a library, not an activated provider, route, new store or audio qualifier.

`await createJevCueRoleAdapter({AI, contractText, schemaText, modelRevision,
configuration, calibration, resolveExplicit, limits})` returns `identity(input)`
and `decide(input)`. Both bind the same current deterministic mapping when present.
The input has exactly `caseId`, `packId`, `sourceRevision`, `language`, `source`
and `context`. Each source/context unit has `unitId`, `text`, `sha256`; actual
UTF-8 text hashes are verified. IDs are unique across target and context.

Trusted composition supplies the AI binding and policy; HTTP callers cannot
install them. `resolveExplicit(input)` is an optional **synchronous** trusted
lookup returning null or `{decision, policySha256, evidenceSha256}`. It may not
start work, consult an operator or perform async I/O. The closed normalized
schema, evidence membership and pause exclusion apply before bypassing inference.
Its actual decision and evidence identity enter the cache key. It should read a
captured coherent metadata snapshot; a changed mapping yields a different key.
An uncertain mapping remains unknown and does not fall through to a model.

Inference requires an applicable offline policy. `calibration` is null or
`{policySha256, language, modelRevision, configSha256, contractSha256,
schemaSha256, falseMax, trueMin}`. The trusted application owns the policy's
review/provenance; a hash string is not proof of review. There are no built-in
production probability thresholds. Finite, nonoverlapping supplied bands decide
false/true; the gap returns unknown. Unknown language/configuration/calibration
returns unknown without invoking AI. The returned model version must match the
calibrated model revision; changed or absent identity remains unknown. Returned
`model_version` is preferred over `version`, both retained separately.

A call uses exactly `AI.run('typesafe/jev', {state, questions})` with four named
`noul` questions and true/false criteria. It accepts `answers[role].noul` or the
same object under `result`. Values must be finite probabilities from 0 to 1;
missing/extra roles and contradictory pause-only results are invalid. Compound
reading/discussion/resource roles remain legal. The normalized decision's
`evidenceUnitIds` contains the supplied target ID: this names the question's
subject, not a claim that the provider independently produced citations. The
complete supplied context digest and raw provider response remain in provenance.
No Scripture, narration, resource IDs, timing boundaries or acceptance is authored.

The envelope is `fia-jev-cue-decision@1` with `resolved | unknown | unavailable |
invalid`, reason, identity/cacheKey, decision or null, and provenance. `needsReview`
in the unchanged normalized schema maps to **unknown**, never a runtime human
queue. Resolved cue roles are not a playback grant or inferred speech approval.
Raw bounded provider evidence is returned in `evidence` for the caller's private
immutable evidence store, including malformed answers that can safely be captured.
Never expose it or source text in public telemetry. Usage/version values are
observations, not fabricated measurements.

Defaults bound source input to 8 KiB, response to 16 KiB, context to 16 units and
one call to 10 seconds; trusted composition may lower these. Hard ceilings are
64 KiB, 64 KiB, 32 units and 30 seconds. JSON traversal is bounded and rejects
cycles/non-JSON values. These are byte/runtime bounds, not token or money quotas.
A real activation must additionally enforce its existing provider/spend policy.
Timeout/rejection is `provider-outcome-uncertain`: the remote call may continue.
There is no retry, cancellation claim, persistent cache or hidden invocation.

The existing durable coordinator owns coalescing, recording attempts **before**
calling this adapter, private immutable output storage and verified cache reads.
It must recheck source eligibility before consuming a cached decision. Cache keys
include exact input/source/context/language, contract/schema, model/configuration,
calibration, question and limit identities. A policy change invalidates decisions,
not unrelated acquisition/recognition. Test providers are injected solely in tests.

Validation: `node --test tests/preparation/jev-cue-role.test.mjs`. Covers actual
wire normalization, compound and pause roles, unknown calibration/version,
malformed/evidence membership, limits/deadline/no retries, explicit bypass and
cache dependencies. No live paid/model calls or production calibration supplied.

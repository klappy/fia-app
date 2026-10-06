# DEV guide-preparation dispatch, inactive execution

`POST /v1/guide-preparations` accepts exactly six consumer fields: `packId`, `presentationRevision`, `language`, `edition`, `sourceUnitId`, `sourceTextSha256`. `GET /v1/guide-preparations/<jobId>` reads its terminal status. The route exists only when the trusted deployment origin is exactly `https://dev.fiaguide.app`; requests must match that origin and same-origin header policy. Existing reviewed-original preparation routes are preserved.

The bundled audited 408-section metadata is pinned to SHA `554e26f3d7cef0e4bb515923e4fcc081a29d407ef7291f122c6daf28205687a8`. It resolves identity, not execution authority. A request must independently match a current eligible catalog row's exact pack, revision, language, edition, guide section, literal source URL, source hash/length and complete ordered unit/text pins. Ambiguous current authority refuses. Metadata-only sections, arbitrary URLs, extra fields and unknown IDs refuse before namespace access. The actual retained registry and presentation are hash-verified through the private unit resolver before POST accesses a Durable Object. Registry pin changes require explicit reviewed source updates.

The existing `FIA_PREPARATION_JOBS` binding hosts a separate `guide-preparation-v1:<digest>` namespace. Its digest binds trusted section input, dormant actual local model recipe, policy revision, catalog authority and metadata/registry pins. Internal object handling independently enumerates that authority and verifies its actual native Durable Object ID. Public callers cannot access the internal route. Guide state and legacy/stable-original state cannot share the same object; markers are checked again in the terminal write transaction. Authority is rechecked after asynchronous validation and before returning retained state or committing it.

The handler invokes the real `createGuideExecutor` with admission from that exact authority and with **no acquisition or recognition capability installed**. The pinned model/config identity names prior local recognition configuration only; it does not claim that the Worker hosts that model. The expected result is `blocked / recognition-capability-unavailable`, with null result/hash and no accepted playback ranges. This is not playable coverage, source acquisition, ASR activation, or an acceptance/publication endpoint.

Because there is no dispatched execution, the actual inactive factory result is computed before a single atomic terminal status write. Concurrent requests can repeat bounded metadata validation, but cannot dispatch media/model work. There is no persisted `preparing` claim. Factory exceptions become terminal `blocked / execution-unavailable`; they do not become a phantom running job or an automatic retry. Repeated POSTs retain the terminal outcome, while GET performs no factory invocation, ASSETS read, publisher fetch or pipeline work. A future active executor must introduce its own reviewed claim/fence/recovery lifecycle before adding capabilities; simply injecting a recognizer into this inactive route is not an approved activation path.

Private ASSETS and request-body reads have byte caps and bounded waits; cancellation cleanup is nonblocking. The required Worker tests use actual local workerd, SQLite and R2 with retained registry/presentation files. They verify concurrent deterministic IDs, blocked status, restart/read-only GET, no source dispatch, wrong native IDs, opposite-lane refusal, unknown authority, corrupted presentation refusal before namespace, mid-validation revocation and non-DEV disablement. Every fetch response is consumed and the suite runs with `MINIFLARE_ASSERT_BODIES_CONSUMED=true`. The failure-path test deliberately substitutes a throwing factory module; the normal path uses the unmodified real factory. No infrastructure, configuration, deployment, publisher media request or model execution is performed by this change.

## Trusted active lifecycle (local integration only)

A compiled caller may pass `guideExecutionProfile` to `servePreparation`, paired
with a DO subclass's `guideExecutionCapabilities()` returning that exact profile
and a synchronous `create` adapter factory. The production class returns null.
Neither request JSON nor environment JSON installs functions. The profile binds
acquisition, recognition and artifact-policy dependency hashes into a distinct
operation identity. The fixed local model recipe is an identity pin, not a claim
that this Worker hosts that model.

Active POST verifies the same catalog source authority and retained presentation,
then atomically queues one attempt and alarm. The alarm commits `preparing` before
constructing adapters or invoking the real guide executor. Acquisition must return
the exact admitted original hash, length and canonical R2 reference. Tests compose
the actual observed-source adapter with retained local publisher-response bytes,
and feed the unchanged retained P2 raw candidate through a recognition port; they
do not run ASR. The resulting evidence remains `review-required`, with no audio
result, accepted ranges or publication.

Concurrent demand reuses the attempt. A new DO incarnation transitions a valid
persisted preparing record to uncertainty and increments its revision. This does
not prove the old writer stopped: lease checks fence later storage, adapter and
terminal commits, while already issued I/O may leave immutable orphan objects.
Uncertain work has no automatic retry/reset. Queued work is safe to start because
no execution is dispatched before the preparing commit. GET invokes no executor,
source transport or presentation lookup; candidate hashes are explicitly
`receipt-only-not-reverified`. This status is not retained artifact verification,
quality qualification, accepted playback or hosted execution evidence.

Required Worker tests cover the inactive default and active failure/restart fences.
The full retained recording proof additionally uses `FIA_RETAINED_P2` pointing at
the existing 867865-byte P2 original; it is never downloaded by tests. It proves
one source-response invocation and one retained-raw port invocation, not a model
process. Runtime deployments remain inactive pending separate trusted capabilities
and deployment authorization.

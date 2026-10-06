# Request acquisition integration

This private composition resolves an exact guide-unit request against trusted,
hash-verified discovery metadata and joins it to an independently supplied source
hash/length policy. It runs the existing durable pipeline's discovery and
acquisition nodes. Transcription, alignment, acceptance and publication adapters
are absent; successful acquisition ends at `transcribe / capability-unavailable`.
No public Worker route, deployed binding, provider call or playback readiness is
added.

The full metadata snapshot remains the admission authority. Pipeline dependency
identity uses a canonical one-row metadata snapshot and the selected source pin,
recipe and policy revision. Adding unrelated rows or reordering source admissions
does not invalidate existing nodes. Changing the selected pin does. Discovery
`source.version` is a presentation/discovery revision, not a publisher audio
freshness assertion. Known byte pins still require separate trusted admission.

Acquisition streams bytes, but pipeline artifact verification materializes the
selected source (at most 8 MiB) and the existing pipeline copies that array. This
is not end-to-end streaming, total-memory qualification, decoding qualification,
or ASR acceptance. The composition's retained-artifact read has a 30-second
deadline; timed-out stream cancellation is not awaited. Underlying capabilities
retain their own operational contracts.

The local tests use actual retained P2 bytes with explicitly synthetic routing
metadata. The SQLite/R2 fixture exercises concurrent HTTP requests, source
deduplication, offline runtime restart and corrupted-source refusal. It establishes
integration behavior only, not new passage coverage or a hosted deployment.

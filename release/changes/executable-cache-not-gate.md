# Executable store is a cache, never a gate

Per the cookbook package-luke ruling (§ DEV publication conflict), no packing, hash or binding check blocks usage. Server only; no client change.

#254: the executable publication store is a content-keyed cache over the base catalog, not an identity or trust ledger. A publish whose record key already exists replaces the row and advances the pointer, so re-preparing a passage that reproduces identical bytes under a newer job (DEV's Mark 1:14–20) answers `ready`, never `blocked` `executable-publication-conflict`; that code is gone. A stored row that fails byte, hash, length, provenance or binding verification, including a row under a superseded build, is a cache miss: the catalog read serves the base with its preparation demand, so an explicit Open re-prepares, and the artifact read falls through to the base artifacts. A miss never answers `unavailable` because of the stored row, and a row is served as executable only when it verifies.

Follow-up: each miss is now signalled for bookkeeping as one structured log line from the production Worker, tagged `kind` `verification` (a bad row) or `transient` (a storage/R2 fault or timeout, including a storage fault on the read itself, which now also serves the base). A throwing or rejecting diagnostics hook cannot change a read. Replacing a row prunes the artifact-owner index entries it no longer binds. The unreachable historical-build authentication (`authenticateCurrent` and its runtime transition) is removed; the registered build list stays as release bookkeeping.

Tests: `tests/publication/executable-overlay.test.mjs`, `tests/worker-serving/executable-transition.test.mjs`, `tests/worker-serving/executable-cache-followups.test.mjs`.

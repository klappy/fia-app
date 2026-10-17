# Executable overlay: content-keyed cache, never a gate

Repairs red DEV (`f369a85`, runs 39035465438 and 39039486651): after #249 moved the execution policy, opening Mark 1:14–20 re-prepared byte-identical bytes and the server answered 409 `executable-publication-conflict`, so the passage showed "This passage could not be loaded".

Captain ruling 2026-10-17 (cookbook `work/active/2026-10-15-fia-package-luke/RULING.md` § DEV publication conflict): no data-packing algorithm or checksum ever blocks usage in the app. The executable publication store solves deterministic storage for cache reuse, not identity or trust. Same rule as `work/86ed/2026-10-01-fia-alpha-v2/RULING.md:89` and the claude-video-delivery ruling ("this isn't banking").

Server (`server/fia/publication/executable-overlay.mjs`):
- A publish whose record key already exists replaces the row (binding, provenance, base record) and advances the pointer. The key is the artifact digest, so the bytes are the same by construction. `executable-publication-conflict` no longer exists; draft #251's adoption ledger (`fia-executable-adoption@1`) is superseded and not merged.
- A stored row whose retained bytes, byte length or media digest no longer verify (`executable-artifact-corrupt`, `executable-publication-invalid`, `executable-media-binding`, `executable-media-base-unavailable`) is a cache miss: `readCatalog` and `findArtifact` fall through to the base catalog instead of answering `unavailable`.
- Unchanged: revocation, refused validation, stale base, pointer race, and pointer/owner index bindings still answer as themselves. `authenticateCurrent` is unchanged.

`server/fia/preparation/EXECUTABLE-RUNTIME.md` § execution policy states the rule; `BACKEND-CLOSURE.json` and the release closure are re-pinned to these exact bytes.

# Source associations (`fia-source-association@1`)

This is a pure module with no network and no runtime import. It builds a version-bound index from the retained compiled source archives (`server/fia/compiler/presentation/source-packs*.json.gz`, source revision `f8776d92`), plus an optional raw publisher input. It then emits association-only decisions for later consumption through the existing `explicitResult` boundary. That integration, source selection and admission policy are owned elsewhere.

## What the index holds

- **Every guide unit:** pack, language, unit, step, text hash (recomputed and checked against `guide-units.json`), HTML hash, guide revision, source file hash and content hash.
- **Every resource in FIAKeyTerms, FIAImages and FIAMaps:** namespace, id (terms use their language-bound source id, such as `spa-t55-v1`), file, file sha and revision.

## Decision types

| Decision | When it is made | Notes |
|---|---|---|
| `explicit` | Only when the retained raw publisher HTML for the same pack carries the same tag (namespace and id) exactly once, in the one paragraph anchored to that unit by exact text hash | The decision binds the unit's text and HTML hashes, the reference hash, and the resource and raw revisions. |
| `unresolved:raw-provenance-unavailable` | The tag is present only in compiled guide HTML and no raw source is retained | The dependency is named: retained raw publisher HTML at 96bb. The repo holds none today, so every compiled tag lands here. |
| Other `unresolved:<reason>` | The join cannot be made or a check fails | `compiled-only-annotation` (raw source present but without the tag), `unanchored`, `ambiguous-anchor` (abstain), `language-mismatch`, `collection-mismatch`, `missing-resource` (not in the pack's retained catalog), `ambiguous-id`, `revision-drift`, `text-drift`, `no-candidates`. `verifyDecision` also reports `reference-drift` when a unit's HTML or reference changes with unchanged text. |
| `semantic-needed` | The unit asks to look at or show a picture or map, and no explicit reference satisfies that request | The passage's resources of that kind are listed as candidates, never attached. |

## What is never placement truth

- Article-level or passage-level resource lists.
- Unit term ids.
- Compiled `relatedIds` and primary.
- Titles.
- Ledgers.
- Compiled HTML on its own.

## Raw input

`buildSourceIndex(archives, {raw})` accepts `{packs: {[packId]: {repo, revision, path, fileSha256, fragments: [{jsonPath, html, sha256}]}}}`. The checks are:

- the repo names the pack's own guide collection;
- `path` equals the pack's guide `sourceFile`;
- `revision` and `fileSha256` are exact hashes;
- each fragment hashes to its declared sha256.

Anything else makes that pack's references `unresolved:raw-provenance-invalid`. There is no trusted flag, and a label or text match never creates a join. The module cannot re-verify the whole-file sha from fragments, so the producer must do that before it hands fragments over.

The test fixture `tests/preparation/fixtures/source-associations/spa-luk-1-1-4-s05-u003.raw-fragment.json` is one verified paragraph, with its extraction provenance, and is test data only.

## Next seam

The next seam is a request-driven, version-bound raw-source producer. Otto owns it, and it is not built here. Its job is to retain verified publisher guide files per source revision and emit the fragments above. A plausible shape:

- It would be a job beside `server/fia/preparation/visual-original.mjs`.
- It would sit on `server/fia/preparation/executor/fresh-source-observation.mjs`, using a new JSON content port: known length, a whole-file sha256, a content-addressed key under `FIA_ORIGINALS`, and a receipt.
- Its interface would be `retainedGuideFragments({repo, revision, path}) -> raw entry`.

## Coverage

Run `node server/fia/preparation/source-associations/coverage.mjs [language book]...`. The default is English Mark and Spanish Luke.

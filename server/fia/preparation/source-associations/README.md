# Source associations (`fia-source-association@1`)

This is a pure module with no network and no runtime import. It builds a version-bound index from the retained compiled source archives (`server/fia/compiler/presentation/source-packs*.json.gz`, source revision `f8776d92`), plus optional raw publisher evidence that must arrive as branded producer receipts. It then emits association-only decisions for later consumption through the existing `explicitResult` boundary. That integration, source selection and admission policy are owned elsewhere.

## What the index holds

- **Every guide unit:** pack, language, unit, step, text hash (recomputed and checked against `guide-units.json`), HTML hash, guide revision, source file hash and content hash.
- **Every resource in FIAKeyTerms, FIAImages and FIAMaps:** namespace, id (terms use their language-bound source id, such as `spa-t55-v1`), file, file sha and revision.

## Decision types

| Decision | When it is made | Notes |
|---|---|---|
| `explicit` | Only when a producer receipt for the pack's own archive-described guide file carries the same tag (namespace and id) exactly once, in the one paragraph anchored to that unit by exact text hash. Unreachable in production today (see Raw input). | The decision binds the unit's text and HTML hashes, the reference hash, and the resource and raw revisions. |
| `unresolved:raw-provenance-unavailable` | The tag is present only in compiled guide HTML and no producer receipt serves the pack | The dependency is named: the class-A guide-text source route and admission (`RAW_DEPENDENCY`). In production every compiled tag lands here. |
| `unresolved:raw-provenance-invalid` | Raw input that is not a branded producer receipt, or a receipt that differs from the archive descriptor | A refused raw input fails every pack closed. |
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

The authority is set by Terry's ruling (cookbook `2771ded`, ANSWER-SOURCE-EXPLICIT-AUTHORITY, Q1 and Q4). `buildSourceIndex(archives, {raw})` accepts raw evidence only as an array of **producer receipts** from `producer-receipt.mjs`.

**What a receipt is.** A frozen object with a module-private brand, issued by `issueProducerReceipt(read, bytes)`.

**What the issuer checks.** It takes a fresh-source-observation `read()` result and that file's whole retained bytes, then:

- requires an observed `publisher-version` source;
- requires the class-A URL shape: owner BibleAquifer on the raw.githubusercontent.com origin, `<lang>/json/<NN>.content.json`, at an exact 40-hex revision;
- requires `application/json`;
- hashes the bytes itself against the observed sha and length;
- extracts every paragraph itself.

There is no list of revisions or files.

**What the index checks.** It compares each receipt with the descriptor it composes from the retained archive: owner, `provenance.collection`, `provenance.revision`, `sourceFile` and `sourceFileSha256`. A mismatch gives `raw-descriptor-mismatch`, reported as `raw-provenance-invalid`. Anything that is not a branded receipt is refused, and every pack then reports `raw-provenance-invalid`. That covers a plain object, a JSON body, a caller sha or fragment, a copy of a receipt, and a `trusted` flag.

**No explicit in production.** No production module issues receipts. The trusted composer that will read the primitive on retained storage waits on the class-A route dependency (`RAW_DEPENDENCY`: the CONTRACT acquisition-profile clause under Q2, and the reviewed source route and ticket admission under Q3; Otto seat). A test enforces that only `producer-receipt.mjs` names the issuer under `server/`.

**Tests.** Isolated tests use the test-only fake producer `tests/preparation/support/fake-guide-producer.mjs` (Q14), with synthetic whole files built from the retained compiled unit HTML.

**The 96bb fixture.** `tests/preparation/fixtures/source-associations/spa-luk-1-1-4-s05-u003.raw-fragment.json` is a dev-time public read at 96bb023 (Terry's classification, cookbook 37433d2). A test shows it is refused against the archive descriptor (eb744452 / b6de7d69). Any join over it is an isolated test result, never a runtime explicit claim.

## Composer (unrouted)

`composer.mjs` builds each pack's descriptor from the retained archive guide record, after checking that record against `source-bindings.json`. It asks the guide-fragment@1 producer for exactly that file and issues a receipt only when the receipt equals the descriptor. The issuer also requires the guide-fragment@1 policy revision, which carries the acquisition-profile hash, and the JSON content kind.

**Precondition before any wiring (PR293 review N1).** Today the archives and bindings are constructor parameters. A production constructor must load the retained archives and `source-bindings.json` itself, with pinned bytes (as `SOURCE_ARCHIVE_SHA256` pins the Mark archive for `exportGuideSources`). Callers must never pass them in. This is not built yet.

## Coverage

Run `node server/fia/preparation/source-associations/coverage.mjs [language book]...`. The default is English Mark and Spanish Luke.

# Optional verified preparation cache

Recipe: cookbook `47a527c475d8926a9617c6e56363629c380623fa`, `product/guidance/presentation-incremental-v1.md`. This is pack-level local preparation reuse, not complete portion/speech-graph acceptance or runtime acceleration.

The existing build command retains positional input/output and `--sample`. Optional `--packs` selects a comma-separated set of known IDs. `--output` selects output without requiring an input checkout. `--cache` enables an operator-selected disposable directory outside public/output trees. Example, with both directories outside the repository:

```sh
node server/fia/compiler/presentation/build.mjs \
  --packs eng.MRK-1-14-20,spa.MRK-1-14-20 \
  --output /tmp/fia-preparation-output --cache /tmp/fia-preparation-cache
```

Source and exact semantic/inventory authority checks run before every hit. Dependencies include pack source objects, sourceFiles, per-pack ledgers/bindings, recipe identities and actual compiler/reuse/build implementation byte hashes. `presentationBuildKey` is a dependency calculator only; it does not authorize inputs. Production preparation cannot override those implementation hashes.

Only actual bytes matching the independently pinned accepted repository registry can be reused. Self-consistent cache hashes and an `accepted` flag cannot grant authority. Missing/changed acceptance anchor disables reuse with an explicit reason. Updating that pin requires reviewed authority, never silent latest substitution. Newly compiled different output is not cache-accepted. The approved first-pack passthrough and its existing media checks remain outside caching.

Receipts on stdout report built/reused, key and miss/write reason. Public presentation and registry bytes retain existing serialization and source/recipe identities. Cache writes use temporary-file/rename; unreadable, partial, stale or corrupt entries compile fresh. No lock service, network, media preparation or paid work is introduced. Cache is optional and disposable. Concurrent deterministic writers may replace identical entries; no distributed consistency claim follows.

Focused checks (root npm test does not discover the new file):

```sh
node --test tests/compiler/presentation-incremental.test.mjs
node --test --test-name-pattern='four cross-language|semantic bindings' tests/compiler/presentation.test.mjs
```

The second command excludes the historical all-136 sweep. New CLI proofs use only two non-passthrough real packs and temporary directories. No source corpus or public artifact regeneration, actual media verification or environment release is established by this prerequisite.

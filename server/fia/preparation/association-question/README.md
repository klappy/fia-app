# Resource-association question: execution seam (Q18)

This is the bounded execution seam between the association gold cases and a future provider. It is a library and an offline CLI. It makes no model, network or paid call. No runtime, Worker or build path imports it, and it activates no provider.

It consumes PR289 (otto-assoc-eval-cases) at `4359d1e1bd4f40ee2379bacbd0ea634054a54d9d` exactly: the case shape of `scripts/association-eval/inputs.json`, the output fields of `gold.json` and the decisions schema of `score.mjs`. Those files are never edited here; a mismatch goes to the coordinator.

## Files

| File | What |
|---|---|
| `request.mjs` | `buildRequest(input)` turns one PR289 input case into a versioned, typed, provider-neutral request (`fia-association-question-request@1`) and a deterministic `requestSha256`. The request carries the question id, the policy id and its sha256, the prompt-template sha256, and the input case itself. |
| `normalize.mjs` | `normalizeOutput(raw, request)` parses provider output strictly into PR289's output fields. `provenanceFor(...)` builds the separate provenance wrapper. |
| `transports.mjs` | The transport interface, plus `recorded` (fixture replay), `none` (requests only) and an unactivated Jev stub. |
| `cli.mjs` | Reads `inputs.json` (optionally `--only` some case ids), builds requests, calls the transport and writes a PR289 decisions file (or a requests file for `none`). |
| `report.mjs` | Scores a decisions file with PR289's `score.mjs`, unchanged, separately for exact-source and semantic-residue cases, by split and language, and gives the denominators. |

## Inputs

A request is built from one PR289 input case, with no change: `caseId`, `packId`, `pericope`, `language`, plus:
- `source`, which holds `sourceRevision`, `guide` `{sourceId, revision, sourceFile, fileSha256, contentSha256}` and `unit` `{unitId, kind, text, textSha256, html, htmlSha256}`. The text and HTML hashes are verified.
- `candidates[]`, the whole pack catalog as `{collection, id, kind, title, sourceFile, sourceFileSha256, collectionRevision}`.

Unknown fields are refused. The request embeds the case as `input`, so a model and a manual adjudicator see the same source and candidate input.

Gold never reaches a request:
- `GOLD_ONLY_FIELDS` is PR289's `GOLD_ONLY_KEYS`, verbatim, plus `association` and `display`. These keys are refused anywhere in an input.
- The prompt template holds no example answer.
- A test checks every gold case: no gold value appears in the template, and a request holds a gold value only where the case's own input holds it.

## Output

The provider answers in PR289's gold output shape, field for field, with every key present:

```
{decision: 'associate' | 'none' | 'abstain',
 association: {requested: [{collection, id}], optionalCompanions: [{collection, id}] | null, companionPairs: [{from, to}] | null},
 display: {primaryCollection, primaryAssetId, relatedAssetIds: [bare id] | null, insertions: [{activityId, assetId, fulfills}] | null},
 confidence?: 0..1}
```

The rules:
- `null` means "not decided" and stays `null`; no default is ever filled in.
- `abstain` has `association` and `display` set to `null`.
- `none` has `requested: []` and every display field `null`: it asks for no visual, so display content on it is rejected.
- When the primary pair is set, both `primaryCollection` and `primaryAssetId` must be strings.
- Every reference must be in the supplied candidate set. A bare display id must name exactly one candidate.
- `fulfills` must be the target unit id.
- List order is kept, because PR289 scores related and insertion order.

Anything else becomes the decision `invalid-provider-output` with a typed reason, and `score.mjs` counts it as `invalid-decision`. That includes malformed output, a reference outside the candidate set, an extra key and a claimed authority. Nothing is repaired.

**Decisions file:** PR289's `fia-association-eval-decisions@1`. Each entry is `{caseId, output, confidence, provenance}`:
- `score.mjs` scores only `output`.
- `provenance` holds `{authority: 'model-resolved', transport, modelId, modelVersion, questionId, policyId, policySha256, promptTemplateSha256, requestSha256, responseSha256, normalization, invalidReason}`.

**Authority.** Every adapter decision is `model-resolved`. It can never be `source-explicit`, which belongs only to the source-association index built from verified raw fragments (PR290). No argument and no provider output can change it.

## Evaluation report

`report.mjs` assigns each case a stratum from its input's source HTML, never from gold:
- **exact-source-inline:** a typed inline tag with `data-resource-code` FIAImages or FIAMaps and a `data-content-id`. These cases belong to the deterministic index, and a score on them never counts as model quality.
- **semantic-residue:** every other case. Model quality is measured here.

At 4359d1e this stratum matches PR289's gold source for all 24 cases (`ledger-inline` against the rest). The gold case denominators are:

| Stratum | eng tuning | eng held-out | spa tuning | spa held-out |
|---|---|---|---|---|
| exact-source-inline | 0 | 0 | 3 | 3 |
| semantic-residue | 8 | 4 | 2 | 4 |

## Usage

```
node server/fia/preparation/association-question/cli.mjs --cases scripts/association-eval/inputs.json --transport none --out requests.json
node server/fia/preparation/association-question/cli.mjs --cases scripts/association-eval/inputs.json --only <caseId,...> --transport recorded --responses <recorded.json> --out decisions.json
node scripts/association-eval/score.mjs decisions.json --split tuning
node server/fia/preparation/association-question/report.mjs --eval-dir scripts/association-eval --decisions decisions.json
node --test tests/association-question/*.test.mjs
```

The fixture `tests/association-question/fixtures/inputs-tuning-subset.json` holds three PR289 tuning cases verbatim: two semantic-residue cases and one exact-source case. The tests that need PR289's `score.mjs`, `gold.json` or `cases.mjs` skip until `scripts/association-eval/` is on the base. These tests are not part of `npm test`; adding them needs a `package.json` change, which belongs to that file's owner.

**Labels.** Recorded-response output is a pipeline test, never a measure of Jev accuracy. The responses in `tests/association-question/fixtures/recorded-responses.json` are hand-written and are not provider output. Gold scored against itself (1.0) tests only the scorer.

## Jev transport seam (not activated)

`createJevTransport()` throws `not-activated` on every call. The transport shape is borrowed from two places, without reusing any cue-role question or decision:
- `createJevCueRoleAdapter` (`../jev/adapter.mjs`): bounded capture, a deadline, no retry, and a recorded model version;
- the pilot connector wire (`scripts/jev-cue-role-pilot/providers/connector-snippet.js`): CF-Extras `POST /accounts/{id}/ai/run` with body `{model: 'typesafe/jev', input: {state, questions}}`. The pilot observed `jev-1.13.0` on 2026-10-06.

Current Jev entitlement, auth and model availability are **unknown**. The pilot's 40-call paid scope is closed and does not carry over.

### Live transport requirement

A live transport needs all of the following before its first call:

1. **A supported current route.** The connector route observed on 2026-10-06 must be re-verified now. So must a question type that can return this structured output. The pilot's only verified type was the four-boolean `noul`.
2. **Authority.** Either the call falls inside an included plan, or a named paid authority sets a call and spend ceiling.
3. **A call count.** Each call answers one case, with no retries. Using PR289's split at 4359d1e:
   - A **held-out calibration pass** on semantic-residue cases costs **8 calls: 4 English and 4 Spanish**.
   - A **tuning pass** costs **10 calls: 8 English and 2 Spanish**.
   - Exact-source cases (6 Spanish) go to the deterministic index, not the model. If they are sent anyway, they add 3 tuning and 3 held-out calls and are reported apart.
   - Each further pass, for example a noise repeat, costs the same again. The authority names the number of passes.
4. **A version check.** The response's model version is recorded and checked against the calibrated revision, as the cue-role adapter does.
5. **Private evidence.** Raw responses go to a private evidence store, never to public telemetry.

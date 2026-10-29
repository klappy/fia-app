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
| `jev-noul.mjs` | The resource-association questions on the documented Jev `noul` wire (`fia-association-noul@2`): per-case question set, strict wire parser, deterministic composer, recorded-wire shim, and the live transport gate. See `JEV-NOUL-CONTRACT.md`. |
| `jev-calibrate.mjs` | Per-language calibration bands, fit on tuning semantic-residue cases only. |
| `jev-noul.schema.json`, `jev-noul-calibration.json` (uncalibrated), `jev-noul-registration.json` | The wire and calibration schema, the committed calibration, and the registered question and budget record (`JEV-NOUL-REGISTRATION.md`). |
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
- **spanish-luke:** cases from `spa.LUK-*` packs (PR294's manual rows), taken from the input's pack id. They are reported apart from Spanish Mark. Today that is 4 negative cases in 1 pericope, with 0 positive visual associations and 2 unresolved map requests. It is a same-input/output check, not a model-quality claim, and these cases are held out, so they are never fitted.

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

## Jev transport (recorded wire only; live is not activated)

`jev-noul.mjs` puts the association question on the documented `noul` wire in `../jev/adapter.mjs`. No committed doc shows a richer question type, and nothing is reused from cue-role.

How it works:
- **Calls:** up to two per case. Call 1 asks `asksVisual`, `requested_<i>`, `primary_<i>` and `companion_<v>`. Call 2 asks pairwise `before_<a>_<b>` and `pair_<v>_<i>`, and is sent only when it is needed.
- **Caps:** at most 35 questions per call, 15 visual and 4 video candidates, 8 requested visuals to order, and 8 KiB of `state`.
- **Composition:** deterministic, into the full PR289/PR294 gold shape: requested, optional companions, companion pairs, primary, `relatedAssetIds` in order, and insertions with `fulfills` (the projector rule, `source-action-projector.mjs:93`). The result goes through the normalizer, and authority stays `model-resolved`.
- **Uncertainty:** an uncertain or contradictory answer leaves the field null or makes the case abstain.
- **Calibration:** per-language bands, fit on tuning semantic-residue cases only, in two passes so no request depends on gold.
- **Model identity:** Terry's rule (cookbook 8ec3901) applies. `model_version`, `version` and an explicitly versioned `model` are candidates. They must agree with each other and equal the calibrated revision exactly. A bare alias is not an identity, and nothing is ever stamped. See `JEV-NOUL-CONTRACT.md`.
- **Live gate:** `createJevNoulTransport({mode: 'live'})` refuses with `not-activated:<gaps>` unless the registration (`registered-not-funded`, 0 authorized calls) and a verified execution entitlement are present. `authorizedCalls` must also cover the plan, which is 36 calls.

The tests use recorded documented-wire fixtures only. They are **wire tests, not model quality**. `JEV-NOUL-CONTRACT.md` has the per-field rules, and `JEV-NOUL-REGISTRATION.md` has the preflight, the budget and the live-call prerequisites.

The older stub, `createJevTransport()` in `transports.mjs`, still throws `not-activated`.

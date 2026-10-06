# cue-role-v1 Jev pilot harness

Offline harness for the `fia-cue-role@1` pilot. It compares rules alone against rules plus bounded Jev on 24 real FIA guide units: 8 dev units from Mark 1:1-13 and 16 held-out units from Mark 1:14-20, half English and half Spanish. The plan lives in the private cookbook unit `work/active/2026-10-06-fia-cue-role-jev-pilot/PLAN.md`. The contract lives at `server/fia/preparation/jev/cue-role-v1.md`.

Nothing here is a runtime path. No app, Worker or test under `server/**` or `tests/**` imports this directory. It adds no dependency, binding or `wrangler.jsonc` change. Node never holds a provider credential. Instead, the CF connector (or the REST fallback) fires requests that the adapter captured itself, and every later phase replays the stored responses at zero calls.

## Files

| File | What |
|---|---|
| `cases.mjs` / `cases.json` | Builds the 24 cases from `server/fia/compiler/presentation/source-packs.json.gz` (revision `f8776d92…`). Each case carries `input` in the adapter shape, with context set to the previous and next unit. It also carries `gold` (null until the labelers fill it) and `meta` {split, kind, v2Pause, v2Resources, listGroup, templateSha256, estTokens}. Every sha256 re-hashes. A held-out case that shares a template with a dev case is refused. `node cases.mjs --check` verifies the file against a fresh rebuild. |
| `rules.mjs` | Arm A, policy `explicit-cue-rules@1`, with four rules: R-PAUSE (exact cue-text hash in `pause-only-registry.json`), R-LIST-INTRO, R-LIST-ITEM-DISCUSSION and R-LIST-ITEM-DESCRIPTIVE (list membership in `lists.json`, matched on pack + unit id + text hash + guide content hash). Anything else abstains (`null`). The arm is labelled *list-evidence (proposed, independent review pending)*. Arm C `naiveSourceFlags` lives here too. It is a comparator only and never a candidate. |
| `pause-only-registry.json` | The two exact pause-only cue texts and their hashes. Status: proposed, review pending. |
| `run.mjs` | Phases: `requests`, `snippet`, `import`, `derive`, `score`, `report` and `replay`, plus `--gold-check` (gold reconciliation, PLAN step 6). |
| `metrics.mjs` | P/R per role, coverage, abstentions by reason, serious errors (DoD 7), the needsReview rule (DoD 8), flips, latency, tokens, cost per correctly resolved case and the §8 verdict. Cost is stored only as `costPerCorrectRatio` (cost per correctly resolved case ÷ review-only cost per case, unitless) plus review minutes, never as an amount. |
| `calibration.json` | Starts with only the bootstrap bands. `derive` adds one record per language. |
| `providers/replay.mjs` | AI shim backed by the raw cache. Normalizes the wire under D4: `model_version = res.model_version ?? res.version ?? res.model`. |
| `providers/connector-snippet.js` | Code for CF-Extras `execute`. Takes ≤ 8 requests per batch, runs at concurrency ≤ 6 with no retries, and returns `[{rawKey, ms, response: r.result}]`. Concurrency ≤ 6 deviates from PLAN step 4, which says sequential. The 2026-10-06 paid passes ran this way, so latency p50/max are measured under concurrency ≤ 6. `metrics.json.measurement.latency` says so, and RESULTS must too. |
| `providers/rest.mjs` | Fallback through `POST /client/v4/accounts/$CF_ACCOUNT_ID/ai/run` (same body as the connector). The token is read from the 0600 file named by `$CF_AI_TOKEN_FILE`. |

## Run order (every step except firing is offline)

```sh
node scripts/jev-cue-role-pilot/run.mjs --phase requests --set all --dry-run   # one exact request + totals
node scripts/jev-cue-role-pilot/run.mjs --phase requests --set all             # evidence/requests.json (24)
node scripts/jev-cue-role-pilot/run.mjs --phase snippet --probe                # gate 4: request 0 alone
#   paste each snippet into CF-Extras execute; save each result array as out-probe.json, out-N.json
node scripts/jev-cue-role-pilot/run.mjs --phase import --from out-probe.json   # probe gate checked before any batch fires
node scripts/jev-cue-role-pilot/run.mjs --phase snippet --batch 0              # only after a valid probe is imported; batches 0..2 over requests 1-23 (8, 8, 7)
node scripts/jev-cue-role-pilot/run.mjs --phase import --from out-0.json        # import each batch before printing the next
node scripts/jev-cue-role-pilot/run.mjs --phase requests --pass 2              # held-out rerun (16), unless --no-rerun
node scripts/jev-cue-role-pilot/run.mjs --phase snippet --pass 2 --probe       # then --pass 2 --batch 0..1 (8, 7)
node scripts/jev-cue-role-pilot/run.mjs --phase import --pass 2 --from …
node scripts/jev-cue-role-pilot/run.mjs --phase derive --language eng
node scripts/jev-cue-role-pilot/run.mjs --phase score  --language eng           # arms A B C D, dev + held-out, passes 1-2
node scripts/jev-cue-role-pilot/run.mjs --phase report [--rate-in X --rate-out Y --minute-rate Z]   # rates give a unitless ratio only
node scripts/jev-cue-role-pilot/run.mjs --phase replay                          # byte-for-byte metrics.json, 0 calls
```

The probe and the batches partition each pass, so no request appears in two snippets (PLAN D6, one call per case). `snippet` refuses a request with any paid call on record (`evidence/raw/`, `raw-duplicates/` or `raw-refused/`), refuses every batch until the pass has a valid probe in `evidence/raw/`, and refuses a batch that would pass 40 calls in total. Pass 1 requests are written for `--set all` only; `--set dev` and `--set heldout` are for `--dry-run`, because derive, score and report read every pass-1 rawKey from one `requests.json`.

`--evidence-dir`, `--cases` and `--calibration` override the defaults (`./evidence/`, `./cases.json`, `./calibration.json`). Raw responses, decisions and `metrics.json` are private evidence (PLAN D12). Copy `evidence/` into the cookbook unit. The default `evidence/` is gitignored here, so it cannot be committed by accident; keep connector output files (`out-*.json`) outside the repo too.

## Gates and ceilings in code

- **Bootstrap calibration (D5).** The collect pass uses `{falseMax: 0, trueMin: 1}` with `modelRevision` `jev-1.13.0`. Every case reaches the provider and nothing resolves, but `provenance.probabilities` is filled.
- **Probe (gate 4).** Until the raw cache holds a valid response for the pass, `import` refuses the whole batch unless its first response has `answers` for the four roles and a `model` string. The refused rows are still paid calls. They are kept in `evidence/raw-refused/`, count toward every ceiling, are never scored and are never fired again, so a failed probe aborts the pass at one call (PLAN gate 4).
- **Ceilings (D7).** The limits are ≤ 24 cases and 96 questions per pass, 40 calls in total, ≤ 500 estimated tokens per case, ≤ 2,000 observed input tokens per call, ≤ 48,000 cumulative and 30 minutes of paid wall. `requests` checks them before any call. `import` checks the observed `usage`, exits 3 on a breach and records it in `evidence/breaches.json`. `snippet` refuses the next batch while that file exists or while the evidence itself shows a non-spend breach; only a human clears the file. The wall is checked as the sum of per-call `ms`; that equals the wall when calls are sequential and over-counts it under concurrency, so the check is conservative.
- **Duplicates (D6).** A second response for a request already in `evidence/raw/` keeps the first response and is stored in `evidence/raw-duplicates/`. It counts toward calls, tokens and wall, and is reported as the breach `duplicate-calls:<n>`, which counts every paid call beyond the first for one request, refused rows included. The rest of the batch still imports. Re-importing the same row is not a call.
- **Spend (DoD 11).** With `--rate-in`, `--rate-out` and `--spend-ceiling`, `import` prints computed spend as a percentage of the operator ceiling (never the amount) and aborts above 5%. Without them, `import` warns on stderr on every run that spend is unchecked. Rates are never stored in this repo.
- **Spanish (gate 6, D10).** `derive` and `score` require `--language`. `spa` is refused unless every spa row has `gold.reviewer` set to `mirror-eng+backtranslation:<cook>` and a non-empty `gold.backTranslation`.
- **Calibration (DoD 6).** Bands come from dev cases only: `falseMax = max(gold-false noul) + 0.05` and `trueMin = min(gold-true noul) − 0.05`. If `falseMax ≥ trueMin`, the language is *uncalibratable* and is scored only under the exploratory bands {0.4999, 0.5}. Its verdict is REVIEW.
- **Cache keys (§9).** The raw key is `sha256(canonical({model, state, questions, pass}))`. The decision key is the adapter's `cacheKey`. `metrics.json.keys` lists both for each case.

## Gold (PLAN steps 5–6, D10–D11)

An English row is **reconciled** when two distinct labelers' blind labels are merged: `reviewer: <a>+<d>` and `agreement` true or false. A disagreement becomes `needsReview: true` and keeps both reasons. Until the second label arrives, the row carries cook A's label with `agreement: null` and is **pending**. A Spanish row is reconciled when it mirrors its reconciled English row (D10), or when it is divergent and labelled from the Spanish meaning (`mirrors: false`).

`derive`, `score` and `report` refuse pending rows (`gold-unreconciled:…`). A missing label is never a disagreement: a reason such as `D: missing` is refused.

```sh
node scripts/jev-cue-role-pilot/run.mjs --gold-check --against d-labels.json          # agreements, disagreements, diffs
node scripts/jev-cue-role-pilot/run.mjs --gold-check --against d-labels.json --write  # rewrite cases.json: merge D, re-mirror spa
```

`d-labels.json` is `{cases: [{caseId, gold: {roles, needsReview, reason, reviewer}}]}` from the blind second labeler. The labeler sees unit text and the contract only, never cook A's labels. The reconciliation refuses a pending row with no valid label, or with the same labeler as A, and then writes nothing. As committed, all 24 rows are reconciled. The 8 held-out English rows were relabelled blind by `cook-gold-eng-d2`, a fresh seat (6 agreements, S03-U020 among them with needsReview from both labelers; S04-U015 and S06-U004 disagree on needsReview only, so they are needsReview gold), and their 8 Spanish mirrors follow. An earlier held-out second label from the fix seat `fix-laneA-r2` is superseded: a fix seat is not a fresh blind labeler (PLAN D11).

Dev S01-U003, a discussion-list item, is labeler-disagreement gold (`needsReview: true`) in both languages. Arm A's R-LIST-ITEM-DISCUSSION resolves it, so arm A shows one `needs-review-resolved` serious error on dev per language. RESULTS must say it comes from labeler disagreement on a list item, not from a rule defect.

Recall counts an abstention as a miss. Precision counts resolved decisions only. Gold-needsReview cases are left out of role P/R. They count as correct only when the envelope is `unknown` (or `invalid` / `input-invalid`), and as a serious error when resolved.

## Tests

```sh
node --test scripts/jev-cue-role-pilot/*.test.mjs
```

The tests are offline. They use a fake provider in the verified wire shape, which carries `model` and no `model_version`. `rules.test.mjs` includes the lint that keeps natural-language literals and pattern matching out of `rules.mjs`. Every string literal must be on a reviewed list. `input` and `source` may be read only through `sha256`, `unitId`, `packId` and `caseId`, by dotted access, never computed, aliased or passed on. Char-code string building is refused. The test proves the lint trips on each known bypass.

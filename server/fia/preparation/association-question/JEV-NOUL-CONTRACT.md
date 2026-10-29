# fia-association-noul@1: resource association on the documented Jev noul wire

This is the contract for the question set `fia-association-noul-questions@1` (`jev-noul.mjs`). Nothing here is reused from the cue-role questions or the cue-role calibration.

## Wire

The wire is the documented one in `server/fia/preparation/jev/adapter.mjs`:
- named questions of the form `{type: 'noul', instructions, criteria: {true, false}}` (L64-68);
- the call `AI.run('typesafe/jev', {state, questions})` (L127);
- answers read from `answers[key].noul`, a number in [0, 1], either bare or under `result` (L138-141);
- the model version read from `model_version ?? version` (L145-147).

The wire observed on 2026-10-06 carried only `model` (`scripts/jev-cue-role-pilot/run.test.mjs:32`). This contract does not read `model` as a version. So a response without a `model_version` or `version` that matches the calibrated revision is refused as `provider-model-version-unverified`, and the case abstains.

No committed doc shows that Jev supports any question type richer than `noul`. This contract therefore stays on `noul`.

## Questions (built per case from the request's own unit and candidate list, never from gold)

| Key | Question |
|---|---|
| `asksVisual` | Does the target unit ask the group to look at, or be shown, a picture or map? |
| `requested_<i>` | Does the unit ask for visual candidate *i*? |
| `primary_<i>` | Is candidate *i* the first picture or map the unit asks for? |

Index *i* runs over the request's sorted FIAImages and FIAMaps candidates. Videos are not asked, so `optionalCompanions`, `companionPairs`, `relatedAssetIds` and `insertions` stay `null` (undecided).

**Hard caps per call** (one call answers one case):
- at most 15 visual candidates;
- at most 31 questions (1 + 2 × 15);
- a `state` of at most 8,192 bytes;
- a response of at most 16,384 bytes;
- a 10 s deadline;
- no retry.

A case over a cap is never sent. It abstains locally with `question-cap` or `input-limit`. At PR289 e67bb5c the largest case has 15 visual candidates.

## Composition (deterministic, into PR289's gold output shape)

The composer uses the language's calibrated bands `falseMax < trueMin`. A probability strictly between them is uncertain.

1. If `asksVisual` is uncertain, the case is **abstain**.
2. If `asksVisual` is at or below `falseMax`:
   - if any `requested_<i>` is at or above `trueMin`, the case is **abstain**, because the answers contradict each other;
   - otherwise the case is **none**, with `requested: []` and every display field null.
3. Otherwise, if any `requested_<i>` is uncertain, the case is **abstain**.
4. If no `requested_<i>` is at or above `trueMin`, the case is **abstain**.
5. Otherwise the case is **associate**. Its `requested` holds the candidates at or above `trueMin`, in candidate order.
   - If exactly one of those requested candidates has `primary_<i>` at or above `trueMin`, it becomes `display.primaryCollection` and `primaryAssetId`.
   - Otherwise the primary stays null (undecided).

The composed object then goes through `normalizeOutput`, so the PR289 output rules apply to it too. Its authority is always `model-resolved`.

## Calibration (`jev-calibrate.mjs`, the schema in `jev-noul.schema.json`)

- **Where it is fit:** per language, on **tuning** semantic-residue cases only. It is never fit on held-out cases, nor on exact-source inline cases, which belong to the deterministic index.
- **What is pooled:** every (probability, gold label) pair.
- **The bands:** `falseMax` is the highest probability on a false label, and `trueMin` is the lowest probability on a true label.
- **When it is calibrated:** only when both label kinds exist and `falseMax < trueMin`. Otherwise the language is `not-separable` or `insufficient-tuning`, and every one of its cases abstains.
- **What is reported:** held-out and exact-source cases are scored with `report.mjs`, in separate strata.

The committed `jev-noul-calibration.json` is **uncalibrated**. No live tuning responses exist, and recorded-wire fixtures are not calibration evidence.

## Labels

Recorded-wire runs (`createRecordedJevWire`) are **wire tests**, never a measure of model quality.

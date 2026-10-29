# fia-association-noul@2: resource association on the documented Jev noul wire

This is the contract for the question set `fia-association-noul-questions@2` (`jev-noul.mjs`). Nothing here is reused from the cue-role questions or the cue-role calibration. It supersedes v1, which asked only `requested` and `primary` and left videos, `relatedAssetIds`, insertions and companion pairs null.

## Wire

The wire is the documented one in `server/fia/preparation/jev/adapter.mjs`:
- named questions of the form `{type: 'noul', instructions, criteria: {true, false}}` (L64-68);
- the call `AI.run('typesafe/jev', {state, questions})` (L127);
- answers read from `answers[key].noul`, a number in [0, 1], either bare or under `result` (L138-141);
- model identity normalized by Terry's rule (fia-app-cookbook `ANSWER-JEV-MODEL-IDENTITY-2026-10-29.md`, 8ec3901). The rule applies to the provider response object only: the inner `result` when it has answers.

The identity rule:
1. **Candidates.** The candidates are `model_version`, `version` and `model`, counted only when they are non-empty strings. Any other present type, including null, is `invalid` (`provider-model-identity-invalid`).
2. **`model` must be versioned.** It counts only as an explicit versioned identity: it must match `^[a-z][a-z0-9_-]*-\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$` and must not be `typesafe/jev`. A bare or aliased value is not an identity. With no other candidate, that is `provider-model-version-unverified`.
3. **No conflicts.** Several candidates must be exactly equal, otherwise the result is `provider-model-identity-conflict`. No precedence overrides a disagreement.
4. **Exact match.** The resolved identity must equal the calibration's `modelRevision` exactly, or the result is `provider-model-version-unverified`. A null `modelRevision` never matches.
5. **Never stamp.** A missing identity stays null. It is never filled from `MODEL`, the configuration or the calibration.
6. **Provenance.** `provenance.jev.calls[].identity` keeps each observed field, the resolved identity and the field or fields that supplied it.

So the observed 2026-10-06 envelope `{result: {model: 'jev-1.13.0', answers}}` (`scripts/jev-cue-role-pilot/run.test.mjs:32`) carries a valid identity. It still matches only a calibration fit on `jev-1.13.0`. No committed doc shows a question type richer than `noul`, so this contract stays on `noul`.

## Questions

Every question is built from the case's own candidates and unit, plus, for call 2, the call-1 answers. None is built from gold.

| Call | Key | Question |
|---|---|---|
| 1 | `asksVisual` | Does the target unit ask the group to look at a picture or map? |
| 1 | `requested_<i>` | Does the unit ask for visual candidate *i* (FIAImages or FIAMaps)? |
| 1 | `primary_<i>` | Is candidate *i* the first picture or map the unit asks for? |
| 1 | `companion_<v>` | Is video candidate *v* (VideoBibleDictionary) an optional companion to a requested picture or map? |
| 2 | `before_<a>_<b>` | For two requested visuals *a* < *b*, does the unit ask for *a* before *b*? |
| 2 | `pair_<v>_<i>` | Does accepted companion *v* accompany requested visual *i*? |

Call 2 is sent only for an `associate` case with two or more requested visuals, or with an accepted companion.

**Hard caps per call:**
- 15 visual candidates and 4 video candidates;
- 8 requested visuals to order;
- 35 questions;
- a `state` of 8,192 bytes, a response of 16,384 bytes, and a 10 s deadline;
- 2 calls per case at most, with no retry.

At PR289 e67bb5c the largest call 1 has 15 visual and 3 video candidates, which is 34 questions. The largest call 2 orders the 7 requested visuals of S03-U020: 21 pairs, plus up to 7 companion pairs per accepted companion.

A case over a call-1 cap is never sent, and it abstains. If call 2 would be over its cap, it is not sent, and the fields it decides stay null.

## Composition (deterministic, into the PR289/PR294 gold shape)

The composer uses the language's calibrated bands, `falseMax < trueMin`. A probability strictly between them is uncertain.

1. **Decision, requested and primary.** These work as in v1:
   - an uncertain `asksVisual` gives **abstain**;
   - a "no" `asksVisual` with no confident requested candidate gives **none**;
   - a "no" `asksVisual` with a confident requested candidate is a contradiction, and gives **abstain**;
   - an uncertain `requested_<i>` gives **abstain**.
2. **`optionalCompanions`.** These are the videos at or above `trueMin`. If any `companion_<v>` is uncertain, the field and `companionPairs` stay null.
3. **Order.** `before` answers that are all certain and form one consistent total order give the ordered requested visuals. An uncertain answer or a cycle leaves the order undecided.
4. **Display, from the projector rule** (`server/fia/compiler/presentation/source-action-projector.mjs:93`, where the first asset is focal and each later asset gets an inserted step):
   - `display.relatedAssetIds` is the decided order, as bare ids;
   - `primaryCollection` and `primaryAssetId` are the first related asset;
   - `insertions` is `{activityId: '<unitId>-resource-<assetId>', assetId, fulfills: '<unitId>'}` for each related asset after the first.

   A call-1 primary answer that contradicts the decided order sets every display field to null. That happens when a decided primary is not the first related asset, when call 1 gave two or more confident primaries, or when call 1 answered a confident "no" for the first related asset. An undecided primary is filled from the order only when no call-1 primary answer contradicts it. If the order is undecided, `relatedAssetIds` and `insertions` stay null, and the call-1 primary stands.
5. **`companionPairs`.** Each pair is `{from: requested visual, to: video}` for each certain "yes" `pair_<v>_<i>`. An uncertain answer, or a companion that accompanies nothing, leaves the field null. With no companions it is `[]`.

The composed object then goes through `normalizeOutput`. Its authority is always `model-resolved`, and every reason is recorded in `provenance.jev.notes`.

## Calibration (`jev-calibrate.mjs`)

Calibration is per language, on **tuning** semantic-residue cases only. It runs in two passes, so no request depends on gold:
- **Pass 1** fits provisional bands on the call-1 answers.
- **Pass 2** composes call 1 with those bands, builds each call 2 from that composition, and reads the call-2 answers.

The final bands pool every (probability, gold label) pair. A question whose gold field was not adjudicated (null) gives no pair.

The committed `jev-noul-calibration.json` is **uncalibrated**.

## Labels

Recorded-wire runs are **wire tests**, never a measure of model quality.

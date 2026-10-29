# Registered bounded questions and budget: fia-association-noul@2

This is the machine-readable registration in `jev-noul-registration.json`. `registrationGaps()` checks it, and the live transport (`createJevNoulTransport({mode: 'live'})`) refuses with `not-activated:<gaps>` unless the following all hold:

1. The registration's `status` is `registered`, its limits equal the code's limits (including `callsPerCase` 2), and its `authorizedCalls` is at least **36**. The 36 is the registered plan, read from its own budget: `tuningPassSemanticResidue.total` 20 + `heldoutPassSemanticResidue.total` 16. A ceiling below the plan is refused as `authorized-calls-below-registered-plan`.
2. Trusted composition supplies a verified execution entitlement: `{verified: true, route, evidence}`.
3. An AI binding is supplied.

**Today:** the status is `registered-not-funded`, `authorizedCalls` is 0, and no entitlement exists. So every live attempt refuses.

## Bounded questions

| Item | Value |
|---|---|
| Question set | `fia-association-noul-questions@2` (`JEV-NOUL-CONTRACT.md`) |
| Calls per case | 1 or 2, never retried. Call 2 runs only for an `associate` case with two or more requested visuals, or with an accepted companion. |
| Questions per call | at most 35. Call 1: 1 + 2 per visual (15 at most) + 1 per video (4 at most). Call 2: one per pair of requested visuals (8 at most, so 28 pairs) + one per (companion, requested) pair. |
| Input per call | `state` of at most 8,192 bytes; response of at most 16,384 bytes; 10 s deadline |
| Ceiling | `authorizedCalls`, at least 36. The transport counts both calls and stops with `budget-exhausted` at the ceiling. |

## Budget (PR289 split at e67bb5c, semantic-residue cases only; at most 2 calls per case)

| Pass | eng cases | spa cases | Calls (upper bound) |
|---|---|---|---|
| Tuning (fit) | 8 | 2 | 20 (eng 16, spa 4) |
| Held-out (report) | 4 | 4 | 16 (eng 8, spa 8) |
| Exact-source inline | 0 | 6 | 0. These go to the deterministic index and are not sent. If sent anyway, they add up to 12 calls, reported apart. |

One tuning pass plus one held-out pass is at most 36 calls. Each further pass costs the same again.

## Provider preflight (2026-10-29)

The parent ran this preflight read-only, with no inference, no spend and no credential or settings operation. It is recorded here exactly:
- The current Cloudflare OpenAPI documents `GET /accounts/{account_id}/ai/models/search`, `GET /ai/models/schema`, and `POST /ai/run` with body `{model, input, options}`.
- Through the existing Cloudflare connector, `models/search` with `search=jev` returned HTTP 200 with an empty list.
- `models/schema` with `model=typesafe/jev` returned HTTP 404, code 6002, "Model schema not found".

These reads do **not** prove that the historical AI Gateway or custom route is unavailable. They only mean that the Workers AI catalog and schema cannot establish the model's current capability, identity or entitlement.

## Live-call prerequisites (exact)

1. **A supported, current route for `typesafe/jev`, verified now.** The historical connector route `POST /accounts/{id}/ai/run` (observed 2026-10-06) is unverified today, and the Workers AI catalog cannot establish the model's capability.
2. **A response with a resolvable model identity under Terry's rule (cookbook 8ec3901).** That is `model_version`, `version` or an explicitly versioned `model` (for example `jev-1.13.0`). The fields must agree with each other and equal the revision the calibration was fit on. A bare alias such as `typesafe/jev` does not count, and nothing is stamped.
3. **A verified execution entitlement.** This is either an included plan or a named paid authority, supplied by trusted composition as `{verified: true, route, evidence}`. No included-plan entitlement is claimed.
4. **The registration set to `registered`, with `authorizedCalls` of at least 36.** That covers one tuning plus one held-out pass at up to 2 calls per case.
5. **A calibration fit on live tuning responses.** The committed calibration is uncalibrated, and fixtures are not evidence.

No live, paid or network call has been made. The old 40-call cue-role pilot scope does not carry over.

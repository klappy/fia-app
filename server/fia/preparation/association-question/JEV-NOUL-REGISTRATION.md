# Registered bounded questions and budget: fia-association-noul@1

This is the machine-readable registration in `jev-noul-registration.json`. `registrationGaps()` checks it, and the live transport (`createJevNoulTransport({mode: 'live'})`) refuses with `not-activated:<gaps>` unless the following all hold:

1. The registration's `status` is `registered`, its limits equal the code's limits, and its `authorizedCalls` is at least **18**: the registered plan read from its own budget (`tuningPassSemanticResidue.total` 10 + `heldoutPassSemanticResidue.total` 8). A ceiling below the plan, for example 1 or 17, is refused as `authorized-calls-below-registered-plan`.
2. Trusted composition supplies a verified execution entitlement: `{verified: true, route, evidence}`.
3. An AI binding is supplied.

**Today:** the status is `registered-not-funded`, `authorizedCalls` is 0, and no entitlement exists. So every live attempt refuses.

## Bounded questions

| Item | Value |
|---|---|
| Question set | `fia-association-noul-questions@1` (`JEV-NOUL-CONTRACT.md`) |
| Calls per case | 1, with no retry |
| Questions per call | at most 31 (1 + 2 × visual candidates; at most 15 visual candidates) |
| Input per call | `state` of at most 8,192 bytes; response of at most 16,384 bytes; 10 s deadline |
| Ceiling | `authorizedCalls`, at least 18. The transport counts its calls and stops with `budget-exhausted` at the ceiling. |

## Budget (PR289 split at e67bb5c, semantic-residue cases only)

| Pass | eng | spa | Total calls |
|---|---|---|---|
| Tuning (fit) | 8 | 2 | 10 |
| Held-out (report) | 4 | 4 | 8 |
| Exact-source inline | 0 | 6 | 0. These go to the deterministic index and are not sent. If they are sent anyway, they add 6 calls, reported apart. |

One tuning pass plus one held-out pass is 18 calls. The authority names the number of passes. Each further pass costs the same again.

## Provider preflight (2026-10-29)

The parent ran this preflight read-only, with no inference, no spend and no credential or settings operation. It is recorded here exactly:
- The current Cloudflare OpenAPI documents `GET /accounts/{account_id}/ai/models/search`, `GET /ai/models/schema`, and `POST /ai/run` with body `{model, input, options}`.
- Through the existing Cloudflare connector, `models/search` with `search=jev` returned HTTP 200 with an empty list.
- `models/schema` with `model=typesafe/jev` returned HTTP 404, code 6002, "Model schema not found".

These reads do **not** prove that the historical AI Gateway or custom route is unavailable. They only mean that the Workers AI catalog and schema cannot establish the model's current capability, identity or entitlement.

## Live-call prerequisites (exact)

1. **A supported, current route for `typesafe/jev`, verified now.** The historical connector route `POST /accounts/{id}/ai/run` (observed 2026-10-06) is unverified today, and the Workers AI catalog cannot establish the model's capability.
2. **A response that carries `model_version` or `version`.** It must equal the revision the calibration was fit on. The observed wire carried only `model`, which this contract refuses as unverified.
3. **A verified execution entitlement.** This is either an included plan or a named paid authority, supplied by trusted composition as `{verified: true, route, evidence}`. No included-plan entitlement is claimed.
4. **The registration set to `registered`, with `authorizedCalls` of at least the planned calls.** One tuning plus one held-out pass needs 18 calls (eng 12, spa 6).
5. **A calibration fit on live tuning responses.** The committed calibration is uncalibrated, and fixtures are not evidence.

No live, paid or network call has been made. The old 40-call cue-role pilot scope does not carry over.

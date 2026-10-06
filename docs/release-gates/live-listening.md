# Live listening release gate: second passage

This gate prevents a visually correct release from passing while listening does not work. The release owner must integrate it into the existing post-deploy job, after deployed identity verification, then require that successful job before promoting DEV → staging → production. These files do not themselves change the existing workflow or authorize a release.

## Existing authority and incident

The cookbook `product/guidance/fresh-v3-release-v1.md` requires exact-candidate journey/settings/resume and truthful live smoke; its rendered-evidence rule explicitly does not equate source evidence with device/audio evidence. `evaluation/alpha-personas/README.md` is retired Alpha 1 material, not a current release certificate. Its useful observation discipline is retained: actual steps, errors and friction, not invented human emotions or scores. Current post-deploy invokes `smoke:deployed`; that seeded P1 journey does not prove native listening.

The operator persona is a first-time English facilitator starting the second passage with a group. Success means hearing the current instruction without skipping it, hearing the next instruction and selected Scripture, controlling sound, then returning to the saved place. Missing audio is an honest product state but a **failed listening outcome**. Screenshot equality and mocked audio tests cannot satisfy this gate.

## Required invocation (release owner wiring)

Use the exact checked-out deployment candidate and existing authorized CI browser mechanism. Do not use a local browser to circumvent a denied browser permission.

```sh
# All three variables mandatory; staging and production use their matching origin.
export FIA_ENVIRONMENT=dev
export BASE_URL=https://dev.fiaguide.app
export EXPECT_COMMIT=<full-40-character-deployed-commit>
npx playwright test --config playwright.live-listening.config.js
node scripts/live-listening/verify.mjs test-results/live-listening.json
```

Run the validator as an always-run step after the browser step, preserving both exit statuses; upload JSON, attachment evidence, traces, video and screenshots even on failure. No continue-on-error, skipped test acceptance, expected-failure annotations, or retry-to-green. A rejected gate blocks promotion; production failure requires the existing rollback/repair procedure. This applies separately to each environment and candidate; a DEV receipt is not a production receipt. The production run is post-deployment verification, not a claim it ran before deployment.

## Assertions and evidence

Five scenarios use fresh browser contexts and actual UI navigation to `eng.MRK-1-14-20`. No session/localStorage writes, route interception, artificial media events, play stubs or network fixtures. Read-only saved progress identifies the actual unit; canonical first instruction must be visible and played before advancing. The native `Audio` constructor is observed through a transparent proxy returning real native elements, including detached audio. Native `play`, clocks, events and network are untouched. Advancing native time by at least 250 ms with readyState ≥ 2 is required, and Pause must actually stop it. This proves browser playback, not physical speaker audibility, iPhone Safari, Android or microphone/device validation.

Automatic guide Begin/current and Next, automatic BSB, pending cancellation/OFF→ON, explicit prepare→ready→Play, one Pause with matching icon/action, and settings/place persistence are separate mandatory outcomes. A missing preparation window fails that scenario; warm reuse is not evidence of a pending cancellation. Use a trusted legitimately pending source request or a scoped server-owned test activation when available. Never invalidate production success, mint caller-controlled identities or purchase generation merely to force a test state. If no safe pending request exists, this gate remains incomplete rather than claiming coverage from a mock.

Identity checks require the full network `version.json` commit and loaded document `fia-release` metadata, including after reload, with expected origin/environment. The current app embeds only seven commit characters in its loaded document; this distinguishes ordinary stale installed shells but is not cryptographic full-commit loaded-asset attestation. Release owner should add a full loaded-build identity in a separately reviewed runtime change if required. The suite does not seed an old installed offline package and cannot certify every historical installed-shell upgrade. Retain the existing upgrade gate.

Evidence contains measured native clocks, control labels, actual notices, page errors and progress. These are observable friction/success signals. It does not claim human confusion, satisfaction or a persona percentage. Validator unit fixtures are explicitly synthetic and never accepted as release browser receipts.

## Remaining acceptance limitations

The scenario checks actual Pause label/icon/action and Begin/Play icon, not exhaustive accessibility or every transport state. Physical-device safe areas and long-text final-verse visibility still need their separate mobile journey evidence. Current missing BSB audio must fail; do not substitute P1, another translation, text visibility or an unavailable notice to get green. Source/test acceptance is not a deployed pass. No browser run was performed when authoring this gate.

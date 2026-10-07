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
node scripts/live-listening/verify.mjs test-results/live-listening.json controlled-output/controlled-pending.json
```

Run the validator as an always-run step after the browser step, preserving both exit statuses; upload JSON, attachment evidence, traces, video and screenshots even on failure. No continue-on-error, skipped test acceptance, expected-failure annotations, or retry-to-green. A rejected gate blocks promotion; production failure requires the existing rollback/repair procedure. This applies separately to each environment and candidate; a DEV receipt is not a production receipt. The production run is post-deployment verification, not a claim it ran before deployment.

## Assertions and evidence

Three hosted scenarios use fresh browser contexts and actual UI navigation to `eng.MRK-1-14-20`. No session/localStorage writes, route interception, artificial media events, play stubs or network fixtures. Read-only saved progress identifies the actual unit; canonical first instruction must be visible and played before advancing. The native `Audio` constructor is observed through a transparent proxy returning real native elements, including detached audio. Native `play`, clocks, events and network are untouched. Advancing native time by at least 250 ms with readyState ≥ 2 is required, and Pause must actually stop it. This proves browser playback, not physical speaker audibility, iPhone Safari, Android or microphone/device validation.

Automatic guide Begin/current and Next, automatic BSB, pending cancellation/OFF→ON, explicit prepare→ready→Play, one Pause with matching icon/action, and settings/place persistence are separate mandatory outcomes. A missing preparation window fails that scenario; warm reuse is not evidence of a pending cancellation. Use a trusted legitimately pending source request or a scoped server-owned test activation when available. Never invalidate production success, mint caller-controlled identities or purchase generation merely to force a test state. If no safe pending request exists, this gate remains incomplete rather than claiming coverage from a mock.

Identity checks require the full network `version.json` commit and loaded document `fia-release` metadata, including after reload, with expected origin/environment. The current app embeds only seven commit characters in its loaded document; this distinguishes ordinary stale installed shells but is not cryptographic full-commit loaded-asset attestation. Release owner should add a full loaded-build identity in a separately reviewed runtime change if required. The suite does not seed an old installed offline package and cannot certify every historical installed-shell upgrade. Retain the existing upgrade gate.

Evidence contains measured native clocks, control labels, actual notices, page errors and progress. These are observable friction/success signals. It does not claim human confusion, satisfaction or a persona percentage. Validator unit fixtures are explicitly synthetic and never accepted as release browser receipts.

## Remaining acceptance limitations

The scenario checks actual Pause label/icon/action and Begin/Play icon, not exhaustive accessibility or every transport state. Physical-device safe areas and long-text final-verse visibility still need their separate mobile journey evidence. Current missing BSB audio must fail; do not substitute P1, another translation, text visibility or an unavailable notice to get green. Source/test acceptance is not a deployed pass. No browser run was performed when authoring this gate.

## Revised acceptance disposition

The hosted suite now binds current canonical activity/source unit/text hash to the actual verified preparation descriptor, exact delivery-byte SHA observed at native Blob creation, and the expected playback range. Exactly one active owner and one Pause are required. The same assertion predicates have incident mutation tests for duplicate Pause, wrong/missing recording, skipped unit, wrong range and competing owners. Cancellation assertion rejects absent terminal completion and late playback after completion. These are source-level mutation tests, not before/after browser recordings.

The two cold/pending tests were removed from the hosted suite because globally warm P2 is nondeterministic. The overall validator requires both hosted outcomes and the exact-candidate controlled receipt. The separate controlled real-media integration harness is now implemented as `scripts/live-listening/controlled-pending.mjs`; its receipt is mandatory and distinctly labelled, never a hosted claim. No local browser was run. Scripture presently has no accepted preparation tuple compatible with the guide descriptor; that remains a failed, not silently substituted, outcome until the actual Scripture delivery contract is bound.

Narrow owner proposal: add a second meta `fia-source-commit` containing the existing full `stamp.commit` in `scripts/version-stamp.js`, retain the existing release meta, then require the full loaded value in this suite. This proposal is not yet a runtime change. For stronger asset attestation, include hashes of loaded executable assets in the build's reviewed manifest and match browser response bytes. Current short release meta is insufficient to claim that stronger attestation.

## Runnable controlled native-audio harness

```sh
node scripts/live-listening/controlled-pending.mjs EXACT_BUILT_REPO RETAINED_P2_MP3 TLS_DIRECTORY controlled-output
```

The TLS directory contains an ephemeral localhost `local.key`, `local.crt` and SHA256 SPKI base64 in `cert-spki.txt`. The harness binds only 127.0.0.1:5199, trusts only that SPKI in its own Chromium, rejects every external browser request, and stops its browser/server on completion. Retained MP3 must hash to `0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d`; source descriptor bytes must hash to `186956fb526a0671025180f637c0f6e6b336129085e21951da6e59e89b33fcee`. No SQLite state is copied. CI must receive the reviewed retained file as an artifact, not silently acquire new upstream media.

Actual run on fixed candidate `5fa39c844d26827cf1a917a1d97a2bf287932418` passed both controlled scenarios using retained native media. Its receipt is not reusable for a different commit. Each context begins with pending at the test-owned protocol boundary. The test explicitly releases terminal readiness only after OFF→ON or after manual preparation began. Observations after terminal completion prove silence; manual case then proves actual native clock advancement and Pause. This is frontend integration with an orchestration fixture, **not** proof that the hosted Worker/ASR pipeline completes. No before-fix browser comparison was run; mutation checks are separately labelled source evidence.

## Full document identity integration

The hosted suite now requires `meta[name="fia-source-commit"]` to equal the entire expected commit before the journey and after reload; the receipt validator rejects absent or differing `loadedCommit`. Release owner supplied this field in runtime candidate `fa36e8fdb48c5d47a9fef6f9f77c444165643d7b`. Earlier short-meta-only notes above describe the superseded candidate. The historical controlled 5fa39c receipt remains accurately scoped to its older runtime; future controlled runs must target the candidate being released.

## Passage-only Scripture binding

The BSB scenario reads the deployed pack's `/offline/eng.MRK-1-14-20.json` and requires its exact bytes to match the built candidate's manifest. It binds the canonical BSB asset text/source evidence hashes and selected delivery SHA to the actual native Blob, then asserts native time inside the reviewed passage range. This consumes the range-only manifest contract from `60ad56b`; it does not require a guide preparation tuple, legacy audio or invented word/verse alignment. Missing qualified manifest entries still fail. Pure contract tests use actual P2 text with explicitly synthetic delivery descriptors; no live BSB result is claimed by those tests.

Fresh controlled pending evidence also passed against PR176 candidate `9a5d8cde6033417a6cfdf14e6390e6e9aebd56e5`; it was rebuilt and rerun, not inherited from 5fa39c. Its historical receipt remains separate from subsequent candidates.

## Setup open harness wait

Every hosted scenario first opens Mark 1:14–20 from the Passages sheet. That one setup assertion waits up to 15 s (`toContainText(first,{timeout:15000})`) as a harness wait. It is not a switch budget: J1's 5 s switch budget in the cookbook's scripted journeys stays the only switch budget, and the app speedup is its own ticket. There is no global `expect.timeout`, no retry and no skip.

Every receipt records `setupSwitch.elapsedMs`: the page's own clock from the Open passage tap to the first unit's text being present. The receipt verifier requires it on every scenario and does not judge it against 5 s. Ground: Terry's k0020 ruling and DEV post-deploy run 37553559732.

## Settled face before every primary tap

A newly opened passage shows its text while the easy button is still checking availability (R5's checking face, `aria-label="Checking availability"`). Under E4, a tap made while checking is carried out only when the checked action is a play action, so a Continue tapped while checking is dropped. Every hosted primary tap therefore goes through `tapPrimary`. It waits up to 30 s for the face its intent needs (`Continue`, or `Begin`/`Play`/`Resume`), then taps. This is a harness wait for the check, not a budget. There is no global `expect.timeout`, no retry and no skip. No assertion was loosened. The settings scenario adds one: its Continue must move the place to the second screen before the reload. Each receipt lists `primaryTaps`: the intended face, the face first seen, and how many ms the harness waited. Ground: DEV post-deploy runs 37586548196 (fia-app#199) and 37631536968.

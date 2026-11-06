# Shared host intent prerequisite

Accepted recipe: cookbook `b229acf9825958407fc4b7efea4ccb0cd2d23c18`, `product/guidance/shared-host-contract-v1.md`. Behavior reference: FIA app `64c1ce905e18a986cd86f2c4b71b5d7410a6897c`. This is process-local transport-neutral validation and synthetic host conformance, not a working embedded adapter or complete D/K lane.

`createHostContext(view, {capacity: 256})` validates and snapshots a strict `fia.host-view@1`. Use a fresh host-chosen context ID on each new/restored session. Supply all six capability booleans and exact allowed action bindings derived from the current verified experience. `phaseId` is null where no explicit phase exists. No caller identity or capability is independently authenticated here.

`accept(action)` takes `fia.host-action@1`. On `accepted`, apply its single intent through the existing experience implementation, then call `refresh(nextView)` with `nextRevision`. The context consumes that revision before returning and blocks new actions until refresh. Do not retry an accepted intent because application failed: dispose and recover the host's own state under a fresh context. Identical action retries return `duplicate` without an intent; changed reuse returns `action-conflict`. Receipts are retained until disposal, with fail-closed finite capacity. Application, persistence and crash recovery belong to the host; this is not distributed exactly-once execution.

An independent host state change uses `refresh` with a strictly newer revision. Changing pack identity requires a fresh context. `hydrate()` returns no playback intent. The host must restore its session silently before constructing the context; this module does not rewrite saved state. `dispose()` invalidates even duplicate actions and returns one stop intent which the host must execute. No media is stopped by this library itself.

Supported intents: play, pause, continue, explore with an exact assetId, return. The host's existing manual-play path handles real Play; a reducer PLAY event in the synthetic fixture proves only semantic intent dispatch. Automatic callbacks are tested against the unchanged reducer and are not accepted as user actions. No network, paid work, storage, media fetch, flow computation, root wiring or server session is included.

Run the separately scoped checks explicitly:

```sh
node --test tests/host/*.test.mjs
```

The current root `npm test` does not discover this new directory. Tests import the unchanged production engine and session-store only as fixture behavior references. They do not prove a real host, actual playback, browser/device lifecycle, accessibility, offline availability or cold integration. Actual compatible host access, protocol/isolation/assets and observed hydrate/action/dispose/restore remain open K acceptance work.

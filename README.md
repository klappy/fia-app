# FIA v3

A fresh Svelte application for a bundled English Mark 1:1–13 text journey. Read and discuss the full supplied passage, move between sections, open supplied resource text, and preserve position and listening preferences in this browser.

This first increment has no available audio, images/video, additional passages/languages, downloads, hosted content service, feedback collection, account sync or native app. Media descriptions are text, not playable media. `/build-status` gives a timestamped delivery snapshot and the environment's actual build identity.

## Development and verification

Use Node 22 or later. Run `npm ci`, `npm test`, `npm run build`, and `npm run test:release`. Normal feature CI runs the full 111-page journey, live capability assertions, exact old-worker upgrade, and 390×844 / 1280×800 screenshot evidence. Screenshots require independent review before merging main. `npm run smoke:deployed` accepts `BASE_URL` only for the three existing public release environments.

See [RELEASING.md](RELEASING.md) for the existing Git-triggered main → staging → production merge train, and [the release note](release/changes/3.0.0-alpha.1-fresh-v3.md) for source identity, coverage migration, and limits. No deploy happens in GitHub Actions; it observes the existing Cloudflare Workers Builds deployments.

The new shell retires the prior root `/sw.js` worker without deleting caches, local storage or IndexedDB. Existing old data is preserved but not imported into v3. V3 progress uses its own revision-specific keys. This release requires a network connection.

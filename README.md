# 📖 FIA App

**Familiarization · Internalization · Articulation.**

🎧 Guided oral Bible engagement, 🌍 every FIA language & pericope from Aquifer, 📱 offline‑first PWA, ✨ AI‑backfilled narration & translation (always marked), 🪶 one big button. Open source, MIT. Built with Word Collective.

**Status: Alpha, in build.**

## What this is

A phone-first progressive web app that walks a group through a Bible passage with the FIA guide (six steps, three concepts), in any of the 17 languages Aquifer carries FIA content for. Content comes from Aquifer; where a language lacks a resource the app backfills with an AI translation or voice and **always says so** in the person's own words. Scripture text is never AI-generated.

## Repo shape

| Path                   | What                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `src/`                 | the app (Vite + React + TypeScript)                                                          |
| `src/tokens/alpha.css` | generated from `design/tokens.json` by `scripts/build-tokens.mjs`                            |
| `src/i18n/en.json`     | generated string catalog (source keys `s.<screen>.<key>`), see `scripts/extract-strings.mjs` |
| `src/screens/`         | one component per screen S01–S19 and sheet SH-1–SH-5                                         |
| `src/components/`      | the 20 Alpha design-system components                                                        |
| `contracts/`           | the 18 JSON Schemas (draft 2020-12) every build must validate against                        |
| `pipeline/`, `data/`   | content pipeline and its pins (lane L1)                                                      |
| `release/changes/`     | one train note per version                                                                   |

## Develop

```sh
npm ci
npm run dev          # local dev server
npm run lint         # eslint + prettier
npm run typecheck    # tsc
npm test             # vitest (unit + contract examples)
npm run test:e2e     # playwright smoke (chromium)
npm run generate     # regenerate src/tokens/alpha.css and src/i18n/en.json (committed)
npm run build        # vite build only (no tests — tests gate the PR, not the build)
```

## Deploy

Cloudflare Workers static assets (`wrangler.jsonc`), domain **fiaguide.app**, three environments. Workers Builds runs `npm run build` (`vite build` only; tests gate the PR in CI, never the deploy build) and then:

| Branch       | Command                                | Worker            | Domain (attached account-side) |
| ------------ | -------------------------------------- | ----------------- | ------------------------------ |
| `main`       | `npx wrangler deploy --env dev`        | `fia-app-dev`     | dev.fiaguide.app               |
| `staging`    | `npx wrangler deploy --env staging`    | `fia-app-staging` | staging.fiaguide.app           |
| `production` | `npx wrangler deploy --env production` | `fia-app`         | fiaguide.app                   |

No routes or custom domains live in the repo; `workers_dev` stays on for preview URLs. Production merges are the captain's.

## Sources of truth

The product spec lives in the private **FIA App cookbook** (product PRD, contracts narrative, design system, screen specs, journeys). This repo carries only what the app needs to build: the token JSON, the contract schemas and the generated string catalog. When they drift, the cookbook wins and the copy here is refreshed.

## Rights

App code is MIT (see `LICENSE`). Content the app loads is **not** covered by that license; see `NOTICE.md`.

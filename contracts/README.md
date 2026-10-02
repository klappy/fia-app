# contracts/ — the invariants that survive a rebuild

> **Draft for the nod. New file.** fia-app had no `contracts/README.md` before this change. This file carries the rules of the cookbook's `contracts/README.md` (lines 28–55) into the contracts' one home, with the six amendments of the backend page § 2d. Each amendment is marked **[§ 2d-n]**. Written at B2a step 1a. The owner nods the exact words (H27; the captain unless he names another owner, `server/SPEC.md` § 12 O-21), and Terry checks them against the law. None of the amendments applies before that nod. Sources are listed at the end.

One JSON Schema (draft 2020-12) per contract. Each schema's `description` and its row in the index below say what the contract holds, who owns it and which behaviour test guards it. **[§ 2d-2]** Captain ruling: "If something needs consistency, then it needs contracts and schemas and potentially other structure to maintain that between builds and releases." Anything not in this directory is free to change between builds.

**One home.** This directory is the only home of FIA's contracts. At B2a step 1b, `pipeline/contracts/` is deleted and the pipeline reads `../contracts/`; the cookbook's `contracts/` keeps only a README that points here.

## Index

| id                     | file                                 | title                                                                  | owner                      | behaviour test                    | instances live in                               |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------------------- | -------------------------- | --------------------------------- | ----------------------------------------------- |
| C-01                   | `c01-source-pin.schema.json`         | Aquifer source pin                                                     | Otto                       | `contracts.source-pin.test`       | pipeline pins                                   |
| C-02                   | `c02-content-pack.schema.json`       | Content-pack manifest                                                  | Otto                       | `contracts.content-pack.test`     | pack `manifest.json`                            |
| C-03                   | `c03-catalog-manifest.schema.json`   | Catalog manifest                                                       | Otto / Terry               | `contracts.catalog.test`          | `catalog.json` (build)                          |
| C-04                   | `c04-guide-units.schema.json`        | Guide unit and stop model                                              | Auggie                     | `contracts.guide-units.test`      | pack `guide.json`                               |
| C-05                   | `c05-narration-manifest.schema.json` | Narration manifest                                                     | Otto / Terry               | `contracts.narration.test`        | pack `narration.json`                           |
| C-06                   | `c06-provenance.schema.json`         | Provenance record (+ `$defs/counts`)                                   | Terry / Otto               | `contracts.provenance.test`       | embedded in C-02..C-05                          |
| C-07                   | `c07-offline-pack.schema.json`       | Offline pack manifest + save protocol (`$defs`: messages, `saveState`) | Otto                       | `contracts.offline.test`          | SW cache META, page↔SW messages                 |
| C-08                   | `c08-media-derivative.schema.json`   | Media derivative descriptor                                            | Otto                       | `contracts.media-derivative.test` | derivative catalog; C-07 entries                |
| C-09                   | `c09-workspace.schema.json`          | Workspace persistence (+ `$defs/checkpoint`)                           | Auggie                     | `contracts.workspace.test`        | `localStorage` `fia.workspace.v1.<packId>`      |
| C-10                   | `c10-settings.schema.json`           | Settings (+ `$defs/narrationMode`)                                     | Auggie                     | `contracts.settings.test`         | `localStorage` `fia.settings.v1`                |
| C-11                   | `c11-completion-record.schema.json`  | Completion record                                                      | Auggie                     | `contracts.completion.test`       | `localStorage` `fia.completion.v1.<packId>`     |
| C-12                   | `c12-alignment-sidecar.schema.json`  | Alignment sidecar                                                      | Otto / Auggie              | `contracts.alignment.test`        | pack `alignment/*.json`                         |
| C-13                   | `c13-rights-record.schema.json`      | Rights record                                                          | Terry                      | `contracts.rights.test`           | `rights/*.json`, NOTICE                         |
| C-13 (pack projection) | `c13-pack-rights.schema.json`        | Pack rights lines                                                      | Terry                      | `contracts.pack-rights.test`      | pack `rights.json`; becomes C-32 at B2a step 1b |
| C-14                   | `c14-release-audit.schema.json`      | Release stamp and audit                                                | Otto (captain merges prod) | `contracts.release.test`          | `RELEASE-AUDIT.json` per build                  |
| C-15                   | `c15-journey.schema.json`            | Journey and persona ids (+ `$defs/journeyId`, `personaId`)             | CoS / Auggie               | `contracts.journeys.test`         | `journeys/*.json`, e2e specs                    |
| C-16                   | `c16-feedback.schema.json`           | Feedback payload                                                       | Otto / Terry               | `contracts.feedback.test`         | outbox → feedback endpoint                      |
| C-17                   | `c17-scorecard-row.schema.json`      | Persona-run scorecard row                                              | Auggie                     | `contracts.scorecard.test`        | VERDICT scorecard                               |
| C-18                   | `c18-telemetry-event.schema.json`    | Telemetry event                                                        | Otto / Terry               | `contracts.telemetry.test`        | opt-in counter endpoint                         |

**Planned at B2a step 1b** (not in this directory yet; each lands with examples and scenario fixtures):

| id   | file (`.schema.json`)     | fixes the shape of                                                                       | owner  | behaviour test                       |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------- | ------ | ------------------------------------ |
| C-19 | `c19-capability-registry` | one entry per (method, path template) of the server; its instance is `capabilities.json` | Otto   | `contracts.capability-registry.test` |
| C-20 | `c20-response-envelope`   | the MCP answer envelope plus its optional `meta` key                                     | Otto   | `contracts.response-envelope.test`   |
| C-21 | `c21-problem`             | every error on both doors                                                                | Otto   | `contracts.problem.test`             |
| C-22 | `c22-server-status`       | `/api/health` and `status`                                                               | Otto   | `contracts.server-status.test`       |
| C-23 | `c23-job`                 | a job, public and private views                                                          | Otto   | `contracts.job.test`                 |
| C-24 | `c24-pack-inspection`     | drift per pack, and `$defs/rightsChange`                                                 | Otto   | `contracts.pack-inspection.test`     |
| C-25 | `c25-ledger-entry`        | one paid attempt; the day's spend per cap                                                | Otto   | `contracts.ledger-entry.test`        |
| C-26 | `c26-cache-inventory`     | counts and bytes per cache layer                                                         | Otto   | `contracts.cache-inventory.test`     |
| C-27 | `c27-language-catalog`    | `catalog/<code>.json`                                                                    | Otto   | `contracts.language-catalog.test`    |
| C-28 | `c28-pack-guide`          | pack `guide.json`                                                                        | Auggie | `contracts.pack-guide.test`          |
| C-29 | `c29-pack-scripture`      | pack `scripture.json`                                                                    | Auggie | `contracts.pack-scripture.test`      |
| C-30 | `c30-pack-resources`      | pack `resources.json`                                                                    | Auggie | `contracts.pack-resources.test`      |
| C-31 | `c31-narration-plan`      | pack `narration-plan.json`, the voice stage's input                                      | Otto   | `contracts.narration-plan.test`      |
| C-32 | `c32-pack-rights`         | pack `rights.json` (renumbers `c13-pack-rights`)                                         | Terry  | `contracts.pack-rights.test`         |
| C-33 | `c33-server-answers`      | the server's other answers, as `$defs`, each with `schemaVersion`                        | Otto   | `contracts.server-answers.test`      |

Shared patterns (repeated in each file on purpose, so a schema stands alone): language `^[a-z]{3}(-[A-Za-z]{2,8})?$` (Aquifer codes `eng`, `spa`, `arb`, `zhs` …); pericope `^[1-3A-Z]{3}(-\d{1,3}){2,4}$`; packId `<language>.<pericope>`; unit `^S0[1-6]-U\d{3}$`; sha256 `^[a-f0-9]{64}$`; git sha `^[a-f0-9]{40}$`; release stamp `^\d+\.\d+\.\d+\+[a-f0-9]{7}$`.

## Versioning

- Each schema carries `version` (semver) and `$id` `https://fia.klappy.dev/contracts/<id>-<slug>.schema.json`. Each top-level instance (not embedded C-06/C-08 records) carries `schemaVersion` = the schema's **major**.
- **Patch** — description, example or pattern tightening that rejects nothing currently valid. **Minor** — a new optional field, a new enum value, a new `$defs` entry; every existing instance still validates. **Major** — a required field, a renamed or removed field, an enum value removed or re-meant, a key or id format change.
- A major bump ships with a migration: `migrate<Slug>(vN → vN+1)` in the Alpha/Beta code, a fixture of a real vN instance in `contracts/fixtures/` (added when the first migration lands), and a test that the migrated instance validates against vN+1. Persisted records (C-09, C-10, C-11): migrate once on first open, keep the vN copy until the vN+1 record is written, re-validate every field against the loaded pack, show a notice on fallback, never crash. Pipeline records (C-01..C-05, C-07, C-08, C-12, C-13): the builder emits the new major and the C-07 `revision` changes so saved packs show an update notice. Endpoint records (C-16, C-18): the endpoint accepts every major ever shipped.
- Cross-`$ref`s point at `$id`s in this directory only (C-02/C-03 → C-06 counts; C-07 → C-08, C-10; C-17/C-18 → C-15). A referenced schema's major bump is a major bump for the referrer. C-19 and C-20 name answer schemas by `$id` string, not by `$ref`, so this cascade does not bump them at every contract major. **[§ 2d-6]**
- **Requests.** A server row's request is versioned by its own `version` in C-19: a new optional parameter is a minor; a new required parameter, or a removed or renamed one, is a major; wording is a patch. **[§ 2d-4]**
- **Answers, side by side.** Every JSON row of the server takes a reserved `major` query parameter; absent means 1, so apps installed before this rule keep working. The body carries `schemaVersion`. C-19 lists each row's served majors, with one answer `$id` per major. A breaking answer change ships as a new major beside the old one. A major is retired only when telemetry counts no request for it for 30 days **(guess; `server/SPEC.md` § 12 O-6)** and the captain rules on it; a retired major answers `410`, naming the majors served. Deleting a whole contract stays the rule in "Delete a contract" below. **[§ 2d-5]**

## Testing

- `contracts.schema.test` — every file parses as draft 2020-12, has `$id`, `version`, `contract`, `examples[0]`, and `examples[0]` validates against its own schema with the local registry (no network). In this repo it is `tests/contracts.test.ts` (ajv; `npm run test:contracts`).
- Each contract has an owner in the index and one named behaviour test (`contracts.<slug>.test`) in the index; the test asserts the _behaviour_ (hash binding, atomic save, no-autoplay, …), not only the shape. **[§ 2d-3]** The PoC unit tests that seed them: `tests/audio.test.mjs` → C-05/C-09; `media-offline.test.mjs`, `offline.test.mjs` → C-07; `media-variants.test.mjs` → C-08; `workspace.test.mjs` → C-09; `guide-completion.test.mjs` → C-11; `narration.test.mjs` → C-05; `validate-english-alignment.mjs` → C-12; `verify-release*.mjs` → C-14.
- CI gate (R-904): schema test + every instance the build emits (pins, pack manifests, catalog, narration, offline, release audit) validated before deploy.

## Changing a contract — one rule per change (ADR style)

- **Add a field** — optional only; minor bump; example updated; owner approves.
- **Add an enum value** — minor; UI string table (Terry) and any whitelist (SW recipe, C-14 marker list) updated in the same PR.
- **Remove or rename anything** — major; migration + fixture + test in the same PR; captain rules on the bump (POC-REFERENCE § 8: "the captain rules on any breaking bump").
- **Change an id/key format** (packId, unit id, stamp, storage key) — major; C-15 ids and the C-14 stamp format are frozen for the product's life — retire, never reuse.
- **Touch provenance vocabulary (C-06 `status`)** — major; Terry owns the wording, captain rules.
- **Touch C-14 allowlist or markers** — minor, Otto reviews; the marker _values_ never enter the repo.
- **Add a contract** — next `C-nn`, its `description` and a row in the index here **[§ 2d-2]**, an example that validates; something is a contract only if a rebuild or a client of the server must read it. **[§ 2d-1]**
- **Delete a contract** — only when no instance can exist any more (no saved data, no endpoint); mark `deprecated` for one release first.
- **PoC shapes** — reference only; never edited, never imported; a port is a new file plus a listed test.

Files here are authored by hand (a generator was used for the first cut; the JSON is the source of truth from now on). Do not commit instances (real manifests, feedback) into this directory — fixtures only, under `fixtures/`, anonymised. One instance is kept here by design: `capabilities.json`, the C-19 instance and the server's only hand-written list. **(Open for the nod: `server/SPEC.md` § 12 O-18.)**

## Sources

- The page = klappy/fia-app-cookbook `product/ALPHA-V2-BACKEND-ARCHITECTURE.md` @9171c5b (cookbook PR #67). The cookbook README = klappy/fia-app-cookbook `contracts/README.md` @5ab5acd. The narrative file = the same repo's `product/ALPHA-CONTRACTS.md` @5ab5acd, frozen ("cite, do not change", its line 1).
- Status banner: the README takes the cookbook's rules with six amendments, for the owner's nod, Terry checks them, none applies before then — the page:148. H27 — klappy/kitchen `health-code/HYGIENE.md:126`.
- Opening paragraph: the cookbook README:3, with § 2d-2 (the page:150) replacing its pointer to the narrative file.
- One home: the page:145; klappy/kitchen `health-code/HYGIENE.md:135` (H35) and `:108` (H19).
- Index, C-01 to C-18: id, file, title, owner and instances from the cookbook README:9-26; behaviour test names from the narrative file's **Test** line for each contract (lines 46, 56, 66, 76, 86, 96, 107, 117, 127, 137, 147, 157, 167, 177, 187, 197, 207, 217). The pack projection `c13-pack-rights` is fia-app's own file (the page:146); its title is that file's `title` field; its owner is Terry as C-32 (the page:151), and its test name follows § 2d-3's `contracts.<slug>.test`.
- Planned table: file names and shapes from the page:158-174; owners from § 2d-3 (the page:151); test names from § 2d-3's pattern with each file's slug; `capabilities.json` as the C-19 instance from the page:89; "all land in B2a step 1b" from the page:156.
- Shared patterns, Versioning (first four bullets), Testing (first and last bullets, and the PoC seeds), Changing a contract and the closing paragraph: carried from the cookbook README:28-55. The Testing first bullet's "today" line is replaced by this repo's runner (`tests/contracts.test.ts:6-13`, `package.json` script `test:contracts`); that is a fact for this repo, not an amendment.
- § 2d-1 to § 2d-6: the page:149-154. The side-by-side rule in § 2d-5 is the page:51.
- The `capabilities.json` exception: the page:89, :132, against the cookbook README:55; open as `server/SPEC.md` O-18.

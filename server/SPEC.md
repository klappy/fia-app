# FIA server spec — one server, an API plus a full MCP, built on contracts

> **Draft for the nod. Nothing here binds yet.** This is B2a step 1a: the spec comes before the cook (law §5). The captain nods the exact words of this file before it binds (H27). No router, stand-in or contract-schema code lands before that nod; that is step 1b. Written 2026-10-02 by otto-b2a1a-1657 (Otto seat). Each heading ends with a **Sources** list that traces its sentences to the page, the law or a ruling. What those sources leave open is in § 12, each item with the default B2a uses until someone nods.

| Short name       | Source                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| page             | klappy/fia-app-cookbook `product/ALPHA-V2-BACKEND-ARCHITECTURE.md` @9171c5b (head of cookbook PR #67)                                                       |
| review           | the recorded YES on cookbook PR #67 (issue comment 5961176135), its non-blocking items 1–8                                                                  |
| law              | klappy/kitchen `health-code/mcp-server-build-convention.md` @5dad283 (same blob as @55fbd50, which the page read)                                           |
| RULING           | klappy/fia-app-cookbook `work/active/2026-10-01-fia-alpha-v2/RULING.md` @30ae3d4 (lines `:85-89` landed @d10f1fd, `:105-107` @2e75478, `:111-113` @30ae3d4) |
| BUILD-ORDER      | klappy/fia-app-cookbook `work/active/2026-10-01-fia-alpha-v2/BUILD-ORDER.md` @5ab5acd                                                                       |
| HYGIENE          | klappy/kitchen `health-code/HYGIENE.md` @5dad283                                                                                                            |
| lens             | klappy/kitchen `cookbook/lenses/vodka-lens.md` @5dad283 (same blob as @93ef6dd, the import the FIA registration pins)                                       |
| subtitles TICKET | klappy/fia-app-cookbook `work/active/2026-10-02-fia-pericope-subtitles/TICKET.md` @5ab5acd                                                                  |
| canon            | `klappy://canon/principles/vodka-architecture` § Spec Convention (read through oddkit 2026-10-02 21:06Z; it is one of the lens's grounds, lens:19)          |

**Sources**

- Step 1a writes this file for the captain's nod; no router or stand-in code before it: page:237, :217; BUILD-ORDER:24.
- Spec before cook: law:52-56.
- His voice waits for him: HYGIENE:126 (H27).

## 1. Shape and placement

- The server is an API that the app downloads from, plus an MCP server for managing it, built to the house practice.
- It packages the latest versions of living sources on request.
- Stored copies of upstream bytes are a cache keyed by content, never the store of record.
- Generated voice and AI subtitles are not sources, so they are kept as records.
- It is one server, well organized inside: three modules (`server/core/`, `server/fia/`, `server/faces/`) and one wiring file (`server/main.ts`).
- It is one deployment per environment, not two servers.
- **Placement, decided in-seat (not ruled by the captain):** the server runs on the app's own Worker, one per environment: `fia-app-dev` (branch `main`), `fia-app-staging` (branch `staging`) and `fia-app` (branch `production`).
- That placement is reversible, not secret, not his voice and not a named OPEN-FORK, so it is not a captain handoff.
- The Worker runs first on the server's paths (`assets.run_worker_first`) and hands every other path to the app's static files.
- That path list is generated from C-19, so it cannot drift from the capability table.
- The app reaches the server through one build setting: `VITE_FIA_DATA_BASE` set to the empty string.
- Old installed builds keep reading the static `/data/…` files, which the server does not take over.
- The app never speaks MCP **(guess)**.
- Deploy is push, through Workers Builds; no seat runs `wrangler deploy`, and only the captain promotes to production.
- The server becomes two only when one of four reasons appears: another app wants the core (the captain's own reason), a per-invocation Workers limit binds one part only **(guess)**, the spend secrets must sit where FIA code cannot reach them **(guess)**, or the app and the server need separate release timing **(guess)**.

**Sources**

- API plus MCP for managing it, house practice: RULING:105, :107.
- Latest versions on request; cache keyed by content, never the store of record: RULING:85, :87, :89; page:24.
- Voice and subtitles are records: page:24, :31.
- One server, three modules and a wiring file, one deployment per environment: RULING:111, :113; page:10, :239, :243.
- Placement on the app's Worker, the three Workers and branches: page:40. Decided in-seat, not ruled: page:284; review item 1. Reversible: page:235.
- `run_worker_first`, generated from C-19: page:40.
- One build setting; old builds keep `/data/…`; the app never speaks MCP (guess): page:42.
- Deploy is push, no `wrangler deploy`, captain promotes production: law:100-113, :140-147; page:67.
- When to split: page:275; RULING:111.

## 2. What This Server Knows

### `server/core/` — substrate L2, no FIA terms

- How to resolve a listed repo to its latest commit sha, and when it last checked.
- How to fetch bytes by (repo, sha, path), and by S3 URL with an ETag.
- Stores by opaque keys the caller supplies: L1 by (repo, sha, path); L2 and L4 by the caller's key; L3 by output sha256.
- A reference set (holder key → content hashes) that the caller writes, so an L3 entry is deleted only when no holder names it.
- A create-only inbox of opaque objects by id (feedback).
- Append-only logs by stream name (rights changes, subtitle approvals).
- The ledger (C-25) and its daily caps.
- Paid calls (voice, text) behind the ledger and the caps, with their secrets.
- How to mint a transcode URL for (source, content key, recipe), and how to check the reply (codec header, sha256).
- Job state (Workflows, C-23).
- The KV sha pointers and the last ETags.
- How to serve bytes by key with a latest or an immutable header.
- The answer shapes of the rows it owns in § 10: C-22 `status`, C-23, C-25, C-26, and the C-33 `listPage` and `feedbackReceived`.

### `server/fia/` — substrate L5, the FIA builder, versioned with the app

- The registration's vocabulary (AK-8).
- Which upstream files make a pack.
- How to compute the L2 key, the subtitle key (subtitles TICKET § 5) and the voice key.
- The holder → hashes reference set it hands to `core/`.
- C-02 to C-05, C-08, C-12, C-13, C-16, C-24 and C-27 to C-32.
- How to build a C-13 record from `<lang>/metadata.json`.
- What to voice, and which subtitles to regenerate.
- The daily cron's logic (A1, BL4f, retention).

### `server/faces/` — substrate L2, the two doors

- The registry (C-19) and the generated router.
- The auth classes and the login (workers-oauth-provider, grants in `OAUTH_KV`).
- The C-20 envelope and C-21 errors.
- The telemetry wrapper and its D1 table.
- The edge rate limit.
- The boarding pass.
- The answer shapes of the rows it owns in § 10: C-22 health, and the C-33 `whoami`, `docsAnswer` and `telemetryAnswer`; and the C-33 `binaryDescriptor` the MCP door returns for a binary row.

**Sources**

- Heading names: canon § Spec Convention ("What This Server Knows"); lens:26 (rule 1).
- Layers (L2, L5, L2), and that the mapping is a **(guess)**: page:239; lens:28 (rule 3).
- `core/` Knows: page:246. `fia/` Knows: page:251. `faces/` Knows: page:256.
- The last bullet of `core/` and of `faces/` is not in the page's § 4a list. It is derived from the page's own table, which names the module and answer of each row: rows 1-3, 18-26 at page:93-95, :110-118; binary descriptor page:59. Review item 3 names `core/`'s own contracts (C-22, C-23, C-25, C-26, C-33); with these bullets each list names every contract its module answers. They are part of the words the captain nods.

## 3. What This Server Does NOT Know

### `server/core/`

- What a pack, guide, passage, unit, step, pericope or subtitle is.
- Which files a pack needs.
- How any key is computed.
- Who downloads what: there is no account, IP or device on reads.

### `server/fia/`

- How bytes are fetched, cached or stored; it asks `core/`.
- Any credential.
- HTTP or MCP.

### `server/faces/`

- What any capability does inside.
- Any FIA term beyond the names C-19 gives it.

**Sources**

- Heading name and its role as the boundary: canon § Spec Convention ("This list IS the vodka boundary, written down").
- `core/`: page:247. `fia/`: page:252. `faces/`: page:257.

## 4. What This Server Is NOT

### `server/core/`

- The store of record for any source.
- A mirror packaged once.
- A transcoder; transcode.klappy.dev is.
- A TTS or LLM provider.
- A CMS for Aquifer.

### `server/fia/`

- A store.
- The place a licence discrepancy is resolved: it is "recorded, never resolved by code".

`fia/`'s version is part of the L2 key.

### `server/faces/`

- A second implementation of anything.
- A home for business rules.

**Sources**

- Heading name; each item is one that a PR adding scope must rebut: canon § Spec Convention; lens:31 (rule 6).
- `core/`: page:248. `fia/`: page:253 (quoting the pipeline's `rights.mjs:2`). `faces/`: page:258.

## 5. The wiring file and the boundary check

- `server/main.ts` is the only file that imports all three modules.
- It exports `fetch`, `scheduled` and the Workflow classes.
- It registers `fia/` handlers into the router by C-19 id, and `fia/` job steps into `core/`'s job runner.
- It calls the daily cron's logic, which lives in `fia/`.
- C-19's `module` field names the owner of each row, so the boundary is checked row by row.

CI enforces the boundary:

- `core/` and `faces/` never import `fia/`.
- Only `server/main.ts` imports all three.
- A word check runs over the files that the registration's AK-8 binds: `core/`, `faces/` and `server/main.ts`.
- Its word list is the FIA terms in `core/`'s Does NOT Know (pack, guide, passage, unit, step, pericope, subtitle) plus the names of the contracts `fia/` knows (C-02 to C-05, C-08, C-12, C-13, C-16, C-24, C-27 to C-32).
- The list is not C-02 to C-33 as a block, because `core/` answers C-22, C-23, C-25, C-26 and C-33 itself.
- It matches identifiers and string literals inside conditionals only, so Workflows' `step.do` is not a hit.

Rule 5 of vodka-lens@1 has no carve-out for any module, and `fia/` carries the FIA vocabulary by design. So `fia/`'s exemption is an amendment to FIA's vodka-lens registration, sent with this spec. Until it lands, a vodka-lens run on B2a rows holds on rule 5.

**Sources**

- `server/main.ts`: page:243.
- CI boundary, conditionals only, `step.do`: page:241.
- Word list built from `fia/`'s contracts, not C-02 to C-33: review item 3; `fia/`'s list page:251; `core/`'s rows page:94, :110-111, :116.
- AK-8 binds `core/`, `faces/` and `server/main.ts`; `fia/` carries it: page:241.
- Rule 5 and its lack of carve-out: lens:30; page:241. Registration amendment and the hold until it lands: page:241.

## 6. Durable bindings, one set per environment

Each binding sits in exactly one module's Knows and answers NG-6, "Accounts, sync, multi-user state", in one line.

| Binding                                   | Knows item                                                | Holds                                                                                                                                                                                                                 | NG-6                                                                          |
| ----------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `FEEDBACK` R2                             | `core/`: the create-only inbox                            | C-16 items with `receivedAt`; no IP or headers; a contact only if the person typed one. Retention is Terry's period, committed and applied by the cron; until then there is no expiry and no copy outside the bucket. | a one-way inbox: nothing goes back to a phone, so there is no account or sync |
| `PAID` R2, with an indefinite bucket lock | `core/`: L4 by caller key                                 | voice clips; subtitle records                                                                                                                                                                                         | shared output every phone downloads; no per-user state                        |
| `LEDGER` D1 **(guess: B2a may pick R2)**  | `core/`: the ledger, its caps and append-only logs        | C-25 attempts, the day's spend per cap, rights changes, subtitle approvals; no expiry, and `purge` never touches it                                                                                                   | maintainers' records, not app users'                                          |
| `CACHE` R2 and `POINTERS` KV              | `core/`: L1–L3 by key, the reference set, pointers, ETags | cache; expiry on L1 and L2 is for cleanup only, never on a held L3 entry                                                                                                                                              | no user state                                                                 |
| Workflows                                 | `core/`: job state                                        | C-23 records                                                                                                                                                                                                          | jobs name maintainers, not app users                                          |
| `OAUTH_KV`                                | `faces/`: login grants                                    | per-maintainer GitHub grants                                                                                                                                                                                          | maintainers only; app users stay anonymous                                    |
| `TELEMETRY` D1                            | `faces/`: telemetry                                       | counts only                                                                                                                                                                                                           | no user state                                                                 |
| rate-limit binding                        | `faces/`: the edge rate limit                             | per-IP counters held in memory, never stored                                                                                                                                                                          | none                                                                          |

There is no Durable Object, because the MCP handler is stateless. There is no usage store; that row waits until the app sends usage.

**Sources**

- One Knows item per binding, NG-6 in one line: page:260; lens:29 (rule 4); NG-6 is cookbook `product/ALPHA-CHARTER.md:93` as the page quotes it.
- The table: page:262-271.
- No Durable Object, no usage store: page:273; usage row dropped until the app sends usage: page:129.

## 7. The three tools

| Tool        | Takes                                 | Does                                                                                                                                                                                                                                                                                                                                                   | Never does                                                                                      |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `docs`      | `{path?, query?, recipe?, depth?}`    | With no arguments, returns the boarding pass. `path` serves the live reference: C-19, the schemas and this file, at the deployed sha of public fia-app. `query` and `depth` are forwarded to oddkit with `knowledge_base_url` set to `https://github.com/klappy/fia-app`. `recipe` returns the journeys as filled calls. Cached for 300 s **(guess)**. | Serve a bundled snapshot. Invent endpoints. Proxy the private cookbook.                         |
| `execute`   | `{method, path, query?, body?}`       | Runs the call through the API's own router as the logged-in user, so it reaches every row of § 10 with no allowlist of its own. Answers in the C-20 envelope (§ 8).                                                                                                                                                                                    | Hold its own allowlist of endpoints. Run as a service account when a user is present.           |
| `telemetry` | `{sql, source: "exact" \| "sampled"}` | Runs a `SELECT` over the server's own telemetry table and refuses everything else. Its policy is a `docs` topic.                                                                                                                                                                                                                                       | Return any user's grant, token or request body. Hold content, an IP or a token: it counts only. |

- There is no fourth tool. The telemetry policy is a `docs` topic, not a tool. A fourth tool would need a line in this spec saying why `execute` cannot carry it.
- When oddkit is unreachable, `docs` answers `{answer: null, sources: [], governance_source: "minimal", error}`, still inside C-20.
- **Boarding pass** (`docs()` with no arguments) is at most 2,048 bytes. It carries the server's identity and version; the upstream host, version and `observed_at`; the auth state (`logged_in_as` or `login_url`, from `GET /api/whoami`); one line per tool; a domain map of row groups, not all 35 rows; the journeys as filled calls (cold pack then poll, warm, voice); and a cite of `klappy://canon/constraints/mcp-tool-surface-ceiling`.
- The repo carries the same text as `AGENTS.md`.
- **Telemetry** is one wrapper around every call on both doors. Its store is a D1 table `<server>_telemetry`, with an optional Analytics Engine mirror. Its columns are the shared core of klappy/kitchen `rail/3-pass/2026-09-25-mcp-telemetry-shape-survey/VERDICT.md`, by pointer, plus these server columns: `row` (the C-19 id), `door`, `auth_class`, `major`, `status`, `bytes`, `tokens_est`, `upstream_ms`, `cache_layer`, `job_kind` and `spend_usd`.
- **Built with:** the `agents` package's `createMcpHandler` on `@modelcontextprotocol/server` 2.0.0, which is stateless; `@cloudflare/workers-oauth-provider` in front of the server for login; no hand-written JSON-RPC or transport. Two choices differ from the law's text: `createMcpHandler` where law §1 names `McpAgent`, and the D1 telemetry store where it names Analytics Engine. Both wait on Terry (§ 12, O-14 and O-15).

**Sources**

- Three tools, their does and never-does: law:23-29; page:59.
- No fourth tool without a written reason: law:31; page:65. A spec listing more than four tools is sent back: law:54-56.
- `docs` arguments, live reference, oddkit forwarding, TTL (guess), oddkit-down answer, cookbook never proxied: page:62; law:27.
- `execute` through the API's own router, no allowlist, as the logged-in user: page:59; law:28.
- `telemetry` SELECT only, policy as a `docs` topic, counts only: page:65; law:29.
- Boarding pass contents and the `AGENTS.md` copy: page:63; law:81-87.
- Telemetry wrapper, D1 table, columns: page:65 (the wrapper on the HTTP door is a **(guess)** there; O-11); D1 as the store: kitchen `rail/3-pass/2026-09-25-mcp-telemetry-shape-survey/RULING.md:5`, as the page cites it.
- Library and departures: page:64, :288 (i)-(ii); law:10-18.

## 8. `execute`: request, response and envelope

**Request.**

- The shape is `{method, path, query?, body?}`.
- In phase 1 (B2a step 2) `execute` takes `GET` and `HEAD` only. Phase 2 (B2a step 3) adds the write rows 27–35.
- Every JSON row takes four reserved query parameters, on both doors: `major` (absent means 1), `fields` (a projection applied after the answer), and `offset` and `limit` (bytes of the answer after projection).
- Credentials ride only in `Authorization: Bearer` on the request, never in a tool argument, query or body.
- The seat and session ride in the `X-FIA-Agent` header **(guess)**.

**Response.** Every `execute` result is the law's envelope, contract C-20, mapped from the HTTP answer the router gave:

```text
{ observed_at, upstream: {host, version}, request: {tool, …echo}, status, body,
  truncated, next, continue, hints[], cost: {bytes, tokens_est, upstream_ms}, meta? }
```

| Field         | Value                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`      | the HTTP status                                                                                                                                                                 |
| `body`        | the HTTP body; the `body` values of every `continue` page, joined, equal it. A binary row's body is a C-33 binary descriptor `{url, bytes, sha256, mime}`, never inlined bytes. |
| `observed_at` | `X-FIA-Checked-At`, or the answer time on rows with no upstream                                                                                                                 |
| `upstream`    | this server's host and version; the version is read from `package.json`                                                                                                         |
| `request`     | the call, echoed with the `Authorization` header removed                                                                                                                        |
| `truncated`   | `true` when the answer is over 65,536 bytes; `body` is then the first 65,536 bytes of the HTTP answer as text. `fields` trims first.                                            |
| `continue`    | when `truncated` is true: the same `execute` call with `query.offset` and `query.limit` set                                                                                     |
| `next`        | a pre-formed call to the same tool; for a pending build, the poll call `execute {method: "GET", path: "/api/jobs/<id>"}`                                                        |
| `hints[]`     | one-line facts with a next step; a pending build is one line. Errors: `401` gives `login_url`, `404` the nearest paths, `405` the phase or door that has the row.               |
| `cost`        | equal to the telemetry row written for the same call                                                                                                                            |
| `meta`        | optional: `{etag, revision, pending, retry_after}`, read from the HTTP headers                                                                                                  |

- Every result is sent as `structuredContent` and as the same JSON in text. C-20 is declared as `outputSchema` only once every result validates; B2a step 2 re-checks this on `@modelcontextprotocol/server` 2.0.0.
- Every error, on both doors, is C-21: RFC 9457 problem JSON plus `code`, `hints[]`, `errors[]{path, keyword}` (never the submitted values), the accepted majors, `retryable` and `retry_after_s`. Its statuses are 400, 401, 403, 404, 405, 410, 413, 415, 429 and 503; only 429 and 503 are retryable.
- A cold pack (a catalog packId with no complete revision) answers `202` at once with the public view of a C-23 job, `Retry-After` and `X-FIA-Pending: build`. It starts at most one build per (packId, L2 key), package and fill only, never paid, under a daily cap on read-started builds. Over that cap the answer is C-21 `429` with `retryable: true`. A packId not in the catalog answers `404` with the nearest paths.
- A stale pack answers its last complete revision with `X-FIA-Pending: <revision>`. The resolver queues the rebuild when a pointer moves, never the read.
- A half-built manifest is never served.
- Long work returns a job id at once, with rows to read its status and to cancel it.
- A retired answer major answers `410`, naming the majors served.
- On the HTTP door every row names these headers in C-19: `ETag`, `Cache-Control`, `X-FIA-Checked-At`, `X-FIA-Revision`, `X-FIA-Pending`, and `Retry-After` on 202, 429 and 503.
- Submission and status answers take at most 1 s median and 5 s p99, probed on DEV.

**Sources**

- Request shape: law:28; page:59. Phase 1 `GET`/`HEAD` only, writes in phase 2: law:35-37; page:135.
- Reserved parameters: page:51, :55; projection applied after the answer: law:91-92.
- Bearer only, never in arguments: page:80. `X-FIA-Agent` (guess): page:81.
- Envelope fields: law:71-79. Mapping, `meta`, pending hint and poll call: page:46, :61. Version from `package.json`: page:75; HYGIENE:108 (H19). Header removed before the echo: page:80.
- Cap, truncation, `continue`, `fields` first: page:60; law:75. Binary descriptor: page:59. `cost` equals the telemetry row: page:65; law:78-79. Error hints: law:76-77; page:176.
- `structuredContent` and `outputSchema`: page:178.
- C-21: page:162.
- Cold, stale, never half-built: page:46-47, :52. Long work: page:61. `410`: page:51. Headers: page:54. Latency: page:48.

## 9. Auth classes

One check serves both doors. Each row of § 10 names its class, and the door checks it before calling the module behind the row.

| Class                   | Who may call                                                                                                                            | How                                                                                                                                        | Rows                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Public read             | anyone, anonymous                                                                                                                       | no credential                                                                                                                              | 1–22                             |
| Anonymous create        | the app, which posts feedback with `credentials: 'omit'` and no token                                                                   | create-only by id, schema-checked (`400`), size-capped (`413`), rate-limited at the edge **(guess)**; it never reads back and never spends | 27                               |
| Login                   | a GitHub user, through `@cloudflare/workers-oauth-provider`, with one GitHub OAuth app per host (dev, staging, production)              | grants per user in `OAUTH_KV`; users never paste tokens; the credential rides only in `Authorization: Bearer`                              | the gate for the next two        |
| Private read and write  | a login whose GitHub user has push permission on klappy/fia-app (`GET /repos/klappy/fia-app` with the user's token, `permissions.push`) | `actor` is that verified login; `agent` (seat and session) comes in `X-FIA-Agent`; both doors hand the router the same `{actor, agent}`    | reads 23–26; writes 28–30, 33–35 |
| Paid (voice, subtitles) | a private write on the MCP door only (C-19 `doors: [mcp]`), or the server's daily cron                                                  | the HTTP door answers `405` with the hint "MCP only (A1)"; never anonymous                                                                 | 31, 32                           |

- The test for a private caller is push permission, not "can read fia-app": the repo is public, so any token could read it.
- The door removes the `Authorization` header before any `request` echo, any C-23 `inputs` and any telemetry row, and a contract test proves it.
- No irreversible route is callable. Feedback retention is a period Terry names, committed to git and applied by the cron.
- Policy (recipes, voice, source list, caps, retention) changes by git commit, not by server state.
- Registering one GitHub OAuth app per host is the single HUMAN-ONLY step, because it makes a secret. The secrets are `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `COOKIE_ENCRYPTION_KEY`, held as Worker secrets only, never in the repo or a URL.
- Paid work starts only from the cron or an MCP job, never from the anonymous API: "an MCP job" is a logged-in caller's `execute` on the MCP door.

**Sources**

- One check, class per row: page:77.
- The five classes and their carriers: page:78-82; login and grants: law:13-15, :40-46.
- Push permission, not read: page:81.
- Header removed, test: page:80.
- No irreversible route; retention; policy by commit: page:83; law:37-38.
- HUMAN-ONLY step and secrets: law:42-44, :49-50; page:80, :286.
- A1 for paid work: RULING:111, :113; page:280 (the MCP-job reading is Otto's, marked so there), :82.

## 10. Capability rows: reads in phase 1, writes in phase 2

Each row is one entry in `contracts/capabilities.json` (the C-19 instance), keyed by (method, path template). New paths are a **(guess)** until B2a step 1b fixes them; the app's own paths stay. Rows serve both doors unless marked MCP. Fresh: **L** latest (`no-cache`, ETag = sha256 of the body), **I** immutable, **N** `no-store`.

**Reads — rows 1–26, phase 1, land in B2a step 2.**

| #   | Address                                                               | Answer                                                                                                                       | Class   | Module | Fresh               |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------------------- |
| 1   | `GET /api/health`                                                     | C-22                                                                                                                         | public  | faces  | N                   |
| 2   | `GET /api/status`                                                     | C-22 `status`: source pointers with `checked_at`, queue depth, spend today against each cap, last cron run                   | public  | core   | N                   |
| 3   | `GET /api/whoami`                                                     | C-33 `whoami`: `logged_in_as`, or `login_url` when anonymous                                                                 | public  | faces  | N                   |
| 4   | `GET /catalog/manifest.json`                                          | C-03 1.1.0; entries carry `ref` and, when generated and passing, the AI `subtitle`                                           | public  | fia    | L                   |
| 5   | `GET /catalog/{code}.json`                                            | C-27                                                                                                                         | public  | fia    | L                   |
| 6   | `GET /rights/records.json`                                            | C-33 `rightsRecords` `{schemaVersion, records: C-13[]}`                                                                      | public  | fia    | L                   |
| 7   | `GET /packs/{packId}/manifest.json`                                   | C-02, latest complete revision; cold: `202` with the C-23 public view                                                        | public  | fia    | L                   |
| 8   | `GET /packs/{packId}/{file}.json`                                     | by `file`: guide C-28, guide-units C-04, scripture C-29, resources C-30, narration C-05, narration-plan C-31, rights C-32    | public  | fia    | L                   |
| 9   | `GET /packs/{packId}/alignment/{clipId}.json`                         | C-12                                                                                                                         | public  | fia    | L                   |
| 10  | `GET /packs/{packId}/{kind}/{file}`, kind `audio`, `images` or `maps` | the bytes the latest pack names at that path; MCP: binary descriptor                                                         | public  | fia    | L                   |
| 11  | `GET /api/blobs/{sha256}.json`                                        | a pack file by content; answer check skipped, because `fia/` checked the bytes when it built the pack and the hash pins them | public  | core   | I                   |
| 12  | `GET /api/media/{sha256}.{ext}`                                       | L3 bytes (C-08 names the recipe); MCP: binary descriptor                                                                     | public  | core   | I                   |
| 13  | `GET /api/voice/{sha256}.mp3`                                         | an L4 clip, transcode's source; MCP: binary descriptor                                                                       | public  | core   | I                   |
| 14  | `GET /api/sources/{repo}/{rev}/{path}`                                | L1 bytes; `rev` is a commit sha or `latest`; listed repos only                                                               | public  | core   | I (sha), L (latest) |
| 15  | `GET /api/inspect?packId=`                                            | C-24: cached revision against upstream, plus that pack's rights changes from row 16                                          | public  | fia    | N                   |
| 16  | `GET /api/rights/changes?packId=&since=`                              | C-33 list page of C-24 `rightsChange`; append-only, never purged                                                             | public  | fia    | N                   |
| 17  | `GET /api/subtitles/stale?lang=`                                      | C-33 list page of `subtitleStale`                                                                                            | public  | fia    | N                   |
| 18  | `GET /api/jobs/{id}`                                                  | C-23 public view                                                                                                             | public  | core   | N                   |
| 19  | `GET /api/cache/{layer}`                                              | C-26                                                                                                                         | public  | core   | N                   |
| 20  | `docs` tool · `GET /api/docs`                                         | C-33 `docsAnswer`                                                                                                            | public  | faces  | L (300 s)           |
| 21  | `GET /api/contracts/{file}`                                           | the schema file at the deployed sha                                                                                          | public  | faces  | I                   |
| 22  | `telemetry` tool · `GET /api/telemetry?sql=&source=`                  | C-33 `telemetryAnswer`; `SELECT` only                                                                                        | public  | faces  | N                   |
| 23  | `GET /api/jobs`                                                       | C-33 list page of full C-23                                                                                                  | private | core   | N                   |
| 24  | `GET /api/ledger`                                                     | C-33 list page of C-25                                                                                                       | private | core   | N                   |
| 25  | `GET /api/feedback`                                                   | C-33 list page of `feedbackReceived` `{receivedAt, payload: C-16}`                                                           | private | core   | N                   |
| 26  | `GET /api/feedback/{id}`                                              | C-33 `feedbackReceived`                                                                                                      | private | core   | N                   |

**Writes — rows 27–35, phase 2, land in B2a step 3.**

| #   | Address                                                       | Answer                                                                                                     | Class              | Module |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ | ------ |
| 27  | `POST /api/feedback`                                          | takes C-16; `201` or `200` with C-33 `submitAck` `{id, status: "stored" \| "duplicate"}`, else C-21        | anonymous create   | fia    |
| 28  | `POST /api/resolve`                                           | C-23 job: refresh the source pointers now                                                                  | private write      | core   |
| 29  | `POST /api/catalog/build`                                     | C-23 job: rebuild C-03                                                                                     | private write      | fia    |
| 30  | `POST /api/warm` `{packIds}`                                  | C-23 job: package and fill, unpaid, under a concurrency cap                                                | private write      | fia    |
| 31  | `POST /api/voice` `{packIds}`                                 | C-23 job: paid synthesis under A1's daily cap, ledger first                                                | paid, **MCP only** | fia    |
| 32  | `POST /api/subtitles/regenerate` `{lang?, keys?}`             | C-23 job: paid text under the subtitles ticket's § 5 caps, ledger first                                    | paid, **MCP only** | fia    |
| 33  | `POST /api/subtitles/approve` `{key, status, receiptSha256?}` | C-33 `approvalAck`; an append-only approval row (key, status, actor, agent, time), never purged            | private write      | fia    |
| 34  | `POST /api/jobs/{id}/cancel`                                  | C-23, stopping the job and its spend                                                                       | private write      | core   |
| 35  | `POST /api/purge` `{layer, keys}`                             | C-33 `purgeResult`; L1 and L2 only, never an L3 entry a holder names, L4, the ledger, the logs or feedback | private write      | core   |

- Until phase 2 lands, each write row answers `405` on both doors, with a hint naming the phase that has it.
- The daily cron has no address. It shows through rows 2 and 23, and it runs A1's re-voice, the subtitle refresh (BL4f), the resolver and the retention policy.
- Feedback triage stays outside the server.
- A screen that reads existing rows needs no server change. A screen that needs new data needs a new `fia/` row (its schema, example and function), which is a server change but not a core change. `core/` and `faces/` never change for a screen.

**Sources**

- Rows, keys, guessed paths, freshness codes, doors, cron, triage: page:89, :91-127.
- Row 4 says "passing", not "current": review item 5; the catalog build attaches "the passing subtitles" (subtitles TICKET:291, BL4e), and a record that fails Gate 1 "does not ship" (subtitles TICKET:244).
- Reads in step 2, writes 27–35 in step 3: page:135, :217; BUILD-ORDER:24; law:33-38.
- `405` names the phase that has it: law:77.
- Where the line falls for a new screen: page:87; RULING:111, :113.

## 11. Done-means

The law's five done-means, as this server meets them:

| Law §6 check                                                      | This server                                                                                                                     | Step |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `tools/list` ≤ 4                                                  | `tools/list` on `/mcp` on DEV names `docs`, `execute` and `telemetry`                                                           | 2    |
| Login → upstream login → `execute GET /<whoami>` returns the user | log in with GitHub on DEV, then `execute {method: "GET", path: "/api/whoami"}` returns `logged_in_as`                           | 3    |
| `docs` returns the upstream's live reference, not a bundle        | `docs {path}` returns C-19, a schema and this file at the deployed sha of fia-app                                               | 2    |
| `telemetry` answers a `SELECT` and refuses everything else        | on DEV, a `SELECT` answers and any other statement is refused                                                                   | 2    |
| README names the one HUMAN-ONLY step and the three secrets        | fia-app `README.md` names one GitHub OAuth app per host and `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `COOKIE_ENCRYPTION_KEY` | 3    |

The checks behind them, by B2a step:

- **Step 1b:** codegen `--check` fails CI when a generated file is stale. The coverage test fails CI when a route has no row, a row has no route, schema, example or `module`, or the two doors disagree. **Parity** means the HTTP status equals the envelope's `status`, the HTTP body equals `body` with every `continue` page joined, each named header equals its `meta` field, and `X-FIA-Checked-At` equals `observed_at`. A row marked MCP answers `405` on HTTP. The CI boundary checks of § 5 run. The app's tests pass against the stand-in.
- **Step 2:** step 1b's tests pass against DEV unchanged. The boarding pass is at most 2,048 bytes, cites `klappy://canon/constraints/mcp-tool-surface-ceiling`, and equals `AGENTS.md`. An over-cap answer returns `truncated: true` with a `continue` that works. The envelope's `cost` equals its telemetry row. The latency probe passes. One pack is built by a cold read, with its derivatives filled and checked into L3. The voice route runs at its real rate, written in the PR so the captain can set A1's cap, with one test clip in L4 within $5 (G-B on that clip). The caller of that clip is O-1 in § 12.
- **Step 3:** auth parity (each class answers the same on both doors) and the token-strip test pass.
- **Each deploy:** one probe per row on DEV with canonical inputs, plus the latency budget; a failure blocks promotion.

**Sources**

- The five checks: law:58-64. Their steps: BUILD-ORDER:24 (gate column); page:217.
- `/api/whoami` as the whoami row: page:95. Secrets and the one HUMAN-ONLY step: page:80; law:42-50.
- Step 1b checks: page:132-133, :182, :241; BUILD-ORDER:24.
- Step 2 checks: page:63, :182-183, :217; BUILD-ORDER:24 (budget "≤ $5").
- Step 3 checks: page:182, :217.
- Each deploy: page:183.
- Step 2's caller for the test clip is not named in the page: review item 4.

## 12. Open for the owners' nod

Each item is left open by the page, the law or the rulings. B2a uses the default until the named owner nods or rules. None of them is decided here.

| #    | Open                                                                                                            | Default B2a uses                                                                                                                                                                                                                         | Owner                         | Source                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| O-1  | Who makes step 2's one test clip. Row 31 is a write and lands in step 3, so step 2 cannot call it.              | The daily cron on DEV, under a DEV cap committed in git of one clip and $5, ledger row first. The other option is a direct `fia/` test. Reason: A1 already lets the cron spend, caps change by git commit, and the key is a host secret. | captain                       | review item 4; RULING:113; page:83; BUILD-ORDER:24                                                |
| O-2  | A1's daily cap before the captain sets it.                                                                      | 0 on staging and production (no paid cron run), and the O-1 cap on DEV, until he sets it from step 2's rate.                                                                                                                             | captain                       | page:286 (3); RULING:113                                                                          |
| O-3  | The login lands in step 3, but rows 3 and 23–26 are reads that ship in step 2.                                  | In step 2, row 3 answers anonymous with no `login_url`, and rows 23–26 answer C-21 `401` with a hint that the login lands in phase 2 (B2a step 3).                                                                                       | captain                       | page:95, :115-118, :135; law:77                                                                   |
| O-4  | The new paths in § 10.                                                                                          | The paths as written, fixed in C-19 at step 1b.                                                                                                                                                                                          | captain                       | page:89                                                                                           |
| O-5  | The daily cap on read-started builds.                                                                           | A number committed in git in the step-2 PR, from the first DEV build's step count, below Workflows Free's 3,000 steps a day. No read-started build runs on staging or production before it.                                              | captain                       | page:46 (guess); review item 6 (the 3,000 figure is on Cloudflare's 2026-07-07 billing changelog) |
| O-6  | When an old answer major is retired.                                                                            | After 30 days with no request for it in telemetry, and only on the captain's ruling.                                                                                                                                                     | captain                       | page:51 (guess)                                                                                   |
| O-7  | The MCP answer cap.                                                                                             | 65,536 bytes.                                                                                                                                                                                                                            | captain                       | page:60 (the token ratio is a guess)                                                              |
| O-8  | The `docs` cache TTL.                                                                                           | 300 s.                                                                                                                                                                                                                                   | captain                       | page:62 (guess)                                                                                   |
| O-9  | The edge rate limit on anonymous create.                                                                        | The Workers rate-limit binding.                                                                                                                                                                                                          | captain                       | page:79 (guess)                                                                                   |
| O-10 | How a seat's agent name reaches the door.                                                                       | The `X-FIA-Agent` header; where an MCP client cannot set it, the OAuth client's registered name.                                                                                                                                         | captain                       | page:81 (guess), :290                                                                             |
| O-11 | The telemetry wrapper on the HTTP door.                                                                         | The same wrapper on both doors.                                                                                                                                                                                                          | captain                       | page:65 (guess)                                                                                   |
| O-12 | The `LEDGER` store.                                                                                             | D1.                                                                                                                                                                                                                                      | captain                       | page:266 (guess)                                                                                  |
| O-13 | The layer of each module.                                                                                       | `core/` and `faces/` L2, `fia/` L5, sent with the registration amendment.                                                                                                                                                                | FIA App runner, captain's ack | page:239 (guess), :241                                                                            |
| O-14 | Law §1 names `McpAgent`; Cloudflare marks it deprecated.                                                        | `createMcpHandler`.                                                                                                                                                                                                                      | Terry                         | page:64, :288 (i); law:11                                                                         |
| O-15 | Law §1 names Analytics Engine; the 2026-09-25 ruling makes D1 the channel of record.                            | D1, with an optional Analytics Engine mirror.                                                                                                                                                                                            | Terry                         | page:65, :288 (ii); law:16-18                                                                     |
| O-16 | The feedback retention period.                                                                                  | No expiry and no copy outside the bucket until Terry names the period.                                                                                                                                                                   | Terry                         | page:264, :288 (iii)                                                                              |
| O-17 | Whether a seat's GitAuth installation token plus a declared actor may write.                                    | OAuth login only; a GitAuth token is not accepted.                                                                                                                                                                                       | Terry                         | page:288 (iv); law:45-46                                                                          |
| O-18 | C-19's instance `capabilities.json` lives in `contracts/`, but the carried README rule says no instances there. | `contracts/README.md` names `capabilities.json` as the one hand-written instance kept in `contracts/`.                                                                                                                                   | captain (O-21)                | page:89, :132; cookbook `contracts/README.md:55`                                                  |
| O-19 | The server's name, used for `<server>_telemetry` and the boarding pass's identity.                              | `fia-app`, the Worker's name, so the table is `fia_app_telemetry`.                                                                                                                                                                       | captain                       | page:40, :63, :65                                                                                 |
| O-20 | This file is public (fia-app is public) and its Sources cite private cookbook and kitchen paths.                | Keep the cites as path pointers, with no bodies copied; fia-app's `README.md` already points at the private cookbook.                                                                                                                    | captain                       | page:81; fia-app `README.md:53`                                                                   |
| O-21 | Who nods the words of `contracts/README.md`: the page says "the owner's nod" without naming the owner.          | The captain, with Terry's check against the law. The carried rules already have him rule on any breaking bump.                                                                                                                           | captain                       | page:148; cookbook `contracts/README.md:47`; HYGIENE:126                                          |

**Sources**

- The rule for this section: what the sources leave open is listed with a default, never decided silently (BUILD-ORDER:24, "each goes to its owner's nod on the exact words (H27)"; page:288 "B2a uses each default until Terry rules").
- Each row's own cites are in its Source column.

## 13. What this file waits on

1. The captain's nod on the exact words of this file (H27).
2. The owner's nod on the exact words of `contracts/README.md` (the captain by default, O-21), with Terry's check against the law.
3. The FIA App runner's nod on the vodka-lens registration amendment, with the captain's ack as lens-body owner.
4. At step 2, A1's daily cap, set by the captain from the real rate.
5. At step 3, one GitHub OAuth app per web address (HUMAN-ONLY: it makes a secret).
6. Terry's rulings on O-14 to O-17; B2a uses the defaults until then.

**Sources**

- Items 1–5: page:14, :148, :231, :241, :286; review item 2 (the summary must list all of them).
- Item 6: page:288.

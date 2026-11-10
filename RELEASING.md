# Releasing

How a change travels dev → staging → production, and how we prove each step landed. Captain ruling 2026-10-01: agents merge everything, with good hygiene; this routine is that hygiene.

## Environments

| Branch       | Env        | URL                          | Deployed by                                     |
| ------------ | ---------- | ---------------------------- | ----------------------------------------------- |
| `main`       | dev        | https://dev.fiaguide.app     | Workers Builds, `npx wrangler deploy --env dev` |
| `staging`    | staging    | https://staging.fiaguide.app | Workers Builds, `--env staging`                 |
| `production` | production | https://fiaguide.app         | Workers Builds, `--env production`              |

Branches only move forward by merge commits, so `main ⊇ staging ⊇ production` always holds (each is an ancestor of the one before it). Until Otto adds branch protection (kitchen `rail/1-ordered/2026-09-30-fia-app-deploy-wiring`), merge-commit-only and no direct pushes on `staging`/`production` rest on discipline: pick **Create a merge commit** every time.

**One-time bootstrap.** If `staging` or `production` does not exist yet, create each from `main` at a commit that is post-deploy green on dev (`git push origin <sha>:refs/heads/staging`, then the same for `production` once staging is green). After that, they only move by the PRs below.

## Proof a deploy landed

- Every build writes `dist/version.json`: `{ version, commit, branch, builtAt }`. `commit` comes from `WORKERS_CI_COMMIT_SHA` on Workers Builds, `GITHUB_SHA` in Actions, else `git rev-parse HEAD`. It is served `Cache-Control: no-store` (`public/_headers`) and is never precached by the service worker.
- `.github/workflows/post-deploy.yml` runs on every push to `main`, `staging`, `production`: it polls `<url>/version.json` until `commit` equals the pushed sha (10 min timeout), then runs `npm run smoke:deployed` against the live URL. **Green post-deploy is the only proof a step landed.** A red one stops the train.
- By hand: `BASE_URL=https://dev.fiaguide.app EXPECT_COMMIT=<sha> npm run smoke:deployed`, or run the workflow with `workflow_dispatch` (pick env, optional commit).

## The routine

1. **Feature PR → `main`.** CI green (`ci.yml`) plus a review by a fresh agent (never the author). Merge with a **merge commit**. Each PR carries its note in `release/changes/`. Before merging, inspect existing Bugbot reviews, inline threads, and checks for the current head. Bugbot is optional: wait for an existing run to finish; assess and address actionable findings and record dispositions. If it has not run, record that absence and use independent review plus targeted tests. Do not enable, reconfigure, or rerun it just to satisfy this gate; a neutral check is not proof that findings are resolved.
2. **dev.** Workers Builds deploys `main`; wait for **post-deploy green on dev**.
3. **Release prep (when promoting a new version).** Small PR to `main`: bump `package.json` `version`, add the `CHANGELOG.md` entry gathered from `release/changes/` since the last promotion. Merge, post-deploy green on dev.
4. **Promote to staging.** PR `main → staging`, titled `Promote <version> to staging`; body is the release note (the `CHANGELOG.md` entry plus links to the `release/changes/` notes) and the dev post-deploy run link. Merge with a **merge commit — never squash or rebase** (that would fork history and break the ancestor rule). Wait for **post-deploy green on staging**.
5. **Promote to production.** PR `staging → production`, titled `Promote <version> to production`, same body plus the staging post-deploy run link. Merge commit. Wait for **post-deploy green on production**.

Promote only what has gone green on the env below it; never push directly to `staging` or `production`.

After each feature/release lands, run lightweight facilitator journeys against the exact deployed version. Where safe, use separate sessions in parallel: a first-time facilitator finding and explicitly playing the intended passage, a returning/offline facilitator resuming supported downloaded content, and a bilingual facilitator selecting an available language and passage. Adapt the checks to the change rather than repeat an exhaustive matrix. Record environment/head, starting state, actual steps/outcome, success/failure, and comparison with prior evidence. Label qualitative confusion/friction/satisfaction signals as agent assessment, not human research; use unknown when unobserved, without invented numeric scores.

Wrong media, lost progress, unusable controls, or misleading ready state block further promotion. Record and prioritize minor friction. A baseline journey does not qualify a newer candidate; text-only offline success does not establish offline audio. Keep explicit Play and existing spending/infrastructure limits. Do not prewarm a preparation before a reserved UI-first upgrade test.

## Rollback

- **Preferred:** a revert PR on the env branch (`git revert -m 1 <merge>` for a promotion merge), merged, then post-deploy green. Then bring it down the same way a hotfix flows: merge `production → staging` and `staging → main` (merge commits), so no branch re-ships the bad change. To re-land the change later, revert the revert on `main` and promote as usual.
- **Fast path (infra, Otto):** `npx wrangler rollback --env <env>` restores the previous Worker version without a build. Git still needs the revert afterwards, or the next push redeploys the bad commit. `version.json` will show the rolled-back commit, so post-deploy for that sha will not match until git is fixed.

## Superseded reads

- Removing a passage revision from a build no longer withdraws saved copies: from 3.0.4 the server answers a read pinned to a revision it does not hold, and a read of an artifact digest it does not hold, with 503 and the unchanged JSON body, and an installed service worker keeps its saved copy on 503.
- The installed worker still revokes a saved copy on 404, but no pinned pack read answers 404 after this release (a corrupt or revoked prepared record falls to the same 503), so the server can no longer withdraw one revision of a passage that stays published; a deliberate withdrawal of that kind needs a later, explicit mechanism, and none exists yet. Dropping a passage from a build, or a pinned read answered 200 with a different revision, still makes the installed worker revoke the copy, so a future build must not drop or rename a published passage by accident.
- Rollback and replaced revisions: 3.0.4 replaces no passage revision, so the Rollback paths above apply to it. A release that replaces passage revisions can be rolled back to 3.0.4, or to a later build that answers 503 for a superseded read, and never below 3.0.4: a build older than 3.0.4 answers 404 to copies saved or updated under the newer revisions and the installed worker revokes them. For an environment that has served such a release the Rollback paths above do not go below 3.0.4, and the same holds for DEV and staging. 3.1.1 is such a release (262 of 330 passage revisions): there is no rollback below 3.0.4 for an environment that has served 3.1.1.
- Before a promotion, record the revisions production currently serves for a sample of passages; after the staging deploy and again after the production deploy, read those revisions pinned (`/v1/packs/<id>?revision=<recorded>`) and expect 503 with `"reason":"revision-not-found"` for a recorded revision the new build no longer holds, 200 for one it still holds, and never 404; an unpinned read 200 and an unknown passage unpinned 404. A release that replaces no revision answers 200 for every recorded one; there, also read one passage pinned to a revision that never existed (64 zeros) and expect the same 503.
- The 503 is a compatibility answer for workers already installed on devices, not a statement that the server is temporarily down; it is to be replaced once a worker that understands an explicit superseded answer is the oldest one in use.
- "Update download" after 3.1.1: a passage saved from a prepared copy (usually one opened from the Passages sheet) is not replaced by "Update download" until it has been opened again from the Passages sheet on 3.1.1. Until then the tap is refused with the worker's message "The executable saved passage is preserved. Reload before saving this selection.", a reload by itself does not clear it, and the saved copy stays usable offline with its earlier text. The guard is the installed worker's own, unchanged since 3.0.0. The steps a person follows: open the passage again from the Passages sheet ("Open passage" or "Resume passage" on its card), then in Downloads choose the option the copy was saved with, tap "Update download", wait for "The download is verified." and tap "Reload saved version". The same steps are in `release/changes/3.1.1-superseded-read.md` and must be in the facilitator notes before a production promotion.
- The 503 also answers reads that are not superseded reads: a read pinned to any revision of a passage id that does not exist, a read of any well-formed artifact digest the build does not hold, and a read of an artifact the build lists but whose static file is missing. The last is a deploy or data fault that now answers 503: the page tells the reader to check the connection, and the post-deploy journey fails on it only for the passages that journey opens.

## Hotfix

Branch from `production`, PR → `production` (CI green, fresh review, merge commit), post-deploy green. Then flow it back down: merge `production → staging` and `staging → main` (merge commits) so no env branch is ever ahead of the one below it.

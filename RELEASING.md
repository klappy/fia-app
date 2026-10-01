# Releasing

How a change travels dev → staging → production, and how we prove each step landed. Captain ruling 2026-10-01: agents merge everything, with good hygiene; this routine is that hygiene.

## Environments

| Branch       | Env        | URL                          | Deployed by                                     |
| ------------ | ---------- | ---------------------------- | ----------------------------------------------- |
| `main`       | dev        | https://dev.fiaguide.app     | Workers Builds, `npx wrangler deploy --env dev` |
| `staging`    | staging    | https://staging.fiaguide.app | Workers Builds, `--env staging`                 |
| `production` | production | https://fiaguide.app         | Workers Builds, `--env production`              |

Branches only move forward by merge commits, so `main ⊇ staging ⊇ production` always holds (each is an ancestor of the one before it).

## Proof a deploy landed

- Every build writes `dist/version.json`: `{ version, commit, branch, builtAt }`. `commit` comes from `WORKERS_CI_COMMIT_SHA` on Workers Builds, `GITHUB_SHA` in Actions, else `git rev-parse HEAD`. It is served `Cache-Control: no-store` (`public/_headers`) and is never precached by the service worker.
- `.github/workflows/post-deploy.yml` runs on every push to `main`, `staging`, `production`: it polls `<url>/version.json` until `commit` equals the pushed sha (10 min timeout), then runs `npm run smoke:deployed` against the live URL. **Green post-deploy is the only proof a step landed.** A red one stops the train.
- By hand: `BASE_URL=https://dev.fiaguide.app EXPECT_COMMIT=<sha> npm run smoke:deployed`, or run the workflow with `workflow_dispatch` (pick env, optional commit).

## The routine

1. **Feature PR → `main`.** CI green (`ci.yml`) plus a review by a fresh agent (never the author). Merge with a **merge commit**. Each PR carries its note in `release/changes/`.
2. **dev.** Workers Builds deploys `main`; wait for **post-deploy green on dev**.
3. **Release prep (when promoting a new version).** Small PR to `main`: bump `package.json` `version`, add the `CHANGELOG.md` entry gathered from `release/changes/` since the last promotion. Merge, post-deploy green on dev.
4. **Promote to staging.** PR `main → staging`, titled `Promote <version> to staging`; body is the release note (the `CHANGELOG.md` entry plus links to the `release/changes/` notes) and the dev post-deploy run link. Merge with a **merge commit — never squash or rebase** (that would fork history and break the ancestor rule). Wait for **post-deploy green on staging**.
5. **Promote to production.** PR `staging → production`, titled `Promote <version> to production`, same body plus the staging post-deploy run link. Merge commit. Wait for **post-deploy green on production**.

Promote only what has gone green on the env below it; never push directly to `staging` or `production`.

## Rollback

- **Preferred:** a revert PR on the env branch (`git revert -m 1 <merge>` for a promotion merge), merged, then post-deploy green. Then bring the same revert down to `main` (and `staging`) so the next promotion does not re-ship it.
- **Fast path (infra, Otto):** `npx wrangler rollback --env <env>` restores the previous Worker version without a build. Git still needs the revert afterwards, or the next push redeploys the bad commit. `version.json` will show the rolled-back commit, so post-deploy for that sha will not match until git is fixed.

## Hotfix

Branch from `production`, PR → `production` (CI green, fresh review, merge commit), post-deploy green. Then flow it back down: merge `production → staging` and `staging → main` (merge commits) so no env branch is ever ahead of the one below it.

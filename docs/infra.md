# Infra: CI, cache, previews, production (D-036)

Everything runs on `the-keep`. Nothing here is live until the setup steps
below are done. Until then the workflows skip themselves or fall back to
GitHub runners.

## Pieces

| piece | where | notes |
|---|---|---|
| GitHub runner | Dokploy compose `lyterion-ci` (`infra/the-keep/ci.compose.yml`) | label `the-keep`, ephemeral, docker socket mounted |
| turbo remote cache | same compose, `http://turbo-cache:3000` on `dokploy-network` | storage: Garage bucket `turbo-cache` |
| images | `ghcr.io/findmalek/lyterion-{api,dashboard}` | tags `pr-<n>`, `main`, `sha-<sha>` |
| previews | Dokploy project `lyterion-previews` | per PR: 2 apps + 1 Postgres |
| production | Dokploy project `lyterion` | `lyterion-api`, `lyterion-dashboard`, `lyterion-db` |
| deploy logic | `scripts/deploy/dokploy.mjs` | `preview-up`, `preview-down`, `production`, `comment-failed` |

## Previews

On every PR push, `.github/workflows/preview.yml`:

1. builds both images with the PR URLs baked in and pushes `pr-<n>`
2. creates or updates, through the Dokploy API:
   - Postgres `lyterion-db-pr-<n>` (its own container, like a Neon branch)
   - apps `lyterion-api-pr-<n>` and `lyterion-dashboard-pr-<n>`
   - domains `pr-<n>-api.preview.findmalek.engineer` and
     `pr-<n>.preview.findmalek.engineer`, behind `tailnet-only@file`, with a
     cert from the Traefik `vercel` DNS resolver
3. keeps one sticky comment up to date in Vercel's layout
   (`Project | Deployment | Actions | Updated (UTC)`)

Closing the PR deletes the apps and the Postgres container and marks the
comment 🗑 Deleted.

Spotify login on a preview goes through the production api
(`LYTERION_AUTH_PRODUCTION_URL`, Better Auth `oAuthProxy`). Trigger.dev
tasks are not deployed for previews.

## Production

On push to `main`, `.github/workflows/deploy.yml` builds `main` +
`sha-<sha>` and deploys:

- `lyterion-dashboard` at `lyterion.findmalek.engineer`
- `lyterion-api` at `api.lyterion.findmalek.engineer`

It then runs `pnpm deploy:trigger` against the self-hosted Trigger.dev. The
api runs migrations on start (D-035).

## Setup checklist

Done once. Items marked **Malek** need credentials only Malek has.

1. ✅ **DNS on Vercel** (2026-10-12): CNAMEs to `tailnet.findmalek.engineer`,
   same as the other tailnet-only services:
   - `*.preview`
   - `lyterion`
   - `api.lyterion`
2. ✅ **Garage** (2026-10-12): bucket `turbo-cache`, key `turbo-cache-key`
   (`GK33cfbd398235968317dde9ad`, RWO). The secret is in
   `~/.lyterion-turbo-key.txt` on `the-keep` (mode 600). Endpoint:
   `http://infrastructure-garage-lqdycf-garage-1:3900` on `dokploy-network`,
   region `garage`.
3. **Runner registration:** no PAT. A 1h registration token from
   `gh api -X POST repos/FindMalek/lyterion/actions/runners/registration-token`
   is stored as secret `RUNNER_TOKEN` right before the first infra deploy.
   The runner keeps its config in the `runner-data` volume after that.
4. **Dokploy compose `lyterion-ci`:** deployed by the manual `Infra` workflow
   (`.github/workflows/infra.yml` → `dokploy.mjs ci-infra`). It runs on GitHub
   hosted runners against the public Dokploy url, with secrets
   `DOKPLOY_API_KEY`, `RUNNER_TOKEN`, `TURBO_TOKEN`, `GARAGE_ACCESS_KEY` and
   `GARAGE_SECRET_KEY`.
5. **Malek, Dokploy API key:** Settings → Profile → API keys, stored as repo
   secret `DOKPLOY_API_KEY`.
6. **Malek, GHCR read token:** classic PAT with `read:packages`, stored as
   repo secret `GHCR_READ_TOKEN`, with your username as repo var
   `GHCR_USERNAME`.
7. **Spotify app:** add the redirect URI
   `https://api.lyterion.findmalek.engineer/api/auth/callback/spotify`.
8. **Repo variables:**

| var | value |
|---|---|
| `CI_RUNNER` | `the-keep` |
| `TURBO_API` | `http://turbo-cache:3000` |
| `TURBO_TEAM` | `lyterion` |
| `DOKPLOY_URL` | `http://dokploy:3000` (internal, the runner is on `dokploy-network`) |
| `DOKPLOY_PUBLIC_URL` | `https://dokploy.findmalek.engineer` |
| `PREVIEW_DOMAIN` | `preview.findmalek.engineer` |
| `PRODUCTION_DASHBOARD_HOST` | `lyterion.findmalek.engineer` |
| `PRODUCTION_API_HOST` | `api.lyterion.findmalek.engineer` |
| `GHCR_USERNAME` | `FindMalek` |
| `LYTERION_TRIGGER_API_URL` | self-hosted Trigger.dev url (after #4) |
| `LYTERION_TRIGGER_PROJECT_REF` | after #4 |

9. **Repo secrets:**

| secret | value |
|---|---|
| `TURBO_TOKEN` | random, the infra deploy hands the same value to the cache server |
| `RUNNER_TOKEN` | runner registration token, only needed for the first infra deploy |
| `GARAGE_ACCESS_KEY` / `GARAGE_SECRET_KEY` | turbo-cache-key from step 2 |
| `DOKPLOY_API_KEY` | step 5 |
| `GHCR_READ_TOKEN` | step 6 |
| `PREVIEW_APP_ENV` | `LYTERION_BETTER_AUTH_SECRET`, `LYTERION_SPOTIFY_CLIENT_ID`, `LYTERION_SPOTIFY_CLIENT_SECRET`, `LYTERION_AUTH_PRODUCTION_URL=https://api.lyterion.findmalek.engineer`, one `KEY=value` per line |
| `PRODUCTION_APP_ENV` | same keys, minus `LYTERION_AUTH_PRODUCTION_URL` |
| `TRIGGER_ACCESS_TOKEN` | after #4 |
| `PROJECT_TOKEN` | for `project-review-status.yml` |

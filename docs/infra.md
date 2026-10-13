# Infra: CI, cache, previews, production (D-036, D-037)

> D-037: CI and all image builds run on GitHub-hosted runners. `the-keep`
> only hosts the apps and the turbo cache (`turbo.findmalek.engineer`). The
> runner rows and steps below are historical.

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

## Services compose (#7)

`infra/the-keep/services.compose.yml`, deployed as the Dokploy compose
`lyterion-services` by Actions → Infra → `stack: services`. Without a VPN
(D-045) slskd sits straight on `dokploy-network` with no published port.
With the repo secret `PROTON_WIREGUARD_PRIVATE_KEY` set, the deploy uses
`services-vpn.compose.yml` instead, which adds gluetun as below. The apps and
their Postgres stay Dokploy apps (above), so this only holds what they talk
to:

| service | reach | notes |
|---|---|---|
| `gluetun` | none from outside | Proton WireGuard, port forwarding on (D-030, D-033). Kill switch: slskd has no network when the tunnel is down |
| `slskd-config` | none | renders `slskd.yml` and rewrites `listen_port` when Proton rotates the forwarded port; slskd reloads the file. The deploy passes `slskd-config.sh` in as base64, since a raw Dokploy compose has no repo files beside it |
| `slskd` | `http://slskd:5030` on `dokploy-network` | shares `/srv/music` read only, downloads to `/srv/lyterion/slskd-downloads`. LAN only, no Traefik route |
| `bgutil-pot` | `http://bgutil-pot:4416` on `dokploy-network` | PO tokens for yt-dlp, so YouTube downloads need no cookies (D-048). Its version matches the yt-dlp plugin in `apps/api/trigger.config.ts` |
| `ntfy` | `http://ntfy` on `dokploy-network`, public at `ntfy.findmalek.engineer` | access control on, deny-all by default (D-034) |

Repo settings for the Infra run:

| name | kind | value |
|---|---|---|
| `PROTON_WIREGUARD_PRIVATE_KEY` | secret, optional (D-045) | Proton → WireGuard config with NAT-PMP on, the `PrivateKey` line |
| `PROTON_SERVER_COUNTRIES` | var, optional | default `Netherlands` |
| `SLSK_USERNAME` / `SLSK_PASSWORD` | var / secret, optional | the Soulseek account; generated once when unset (Soulseek registers a new name on first login) |
| `NTFY_PUBLIC_HOST` | var, optional | default `ntfy.findmalek.engineer` |

`SLSKD_API_KEY` and `SLSKD_WEB_PASSWORD` are generated on the first deploy and
kept in the compose env, so redeploys never rotate them. Read them in Dokploy
→ `lyterion-services` → Environment.

After the first deploy:

1. Create the ntfy users and token, then subscribe the phone as `findmalek`:
   ```bash
   docker exec -it <ntfy container> ntfy user add --role=admin findmalek
   docker exec -it <ntfy container> ntfy user add lyterion
   docker exec -it <ntfy container> ntfy access lyterion lyterion write-only
   docker exec -it <ntfy container> ntfy token add lyterion
   ```
2. In the Lyterion dashboard → Connections:
   - slskd: url `http://slskd:5030`, api key `SLSKD_API_KEY`
   - ntfy: url `http://ntfy`, topic `lyterion`, the token from step 1
3. Check the tunnel: `docker logs <slskd-config>` prints the forwarded port,
   and slskd's web UI (through an SSH tunnel to port 5030) shows it as the
   listen port with the server connected.

## Trigger.dev (#4)

`infra/the-keep/trigger.compose.yml`, deployed as the Dokploy compose
`lyterion-trigger` by the `Infra` workflow with `stack: trigger`. It is the
official `hosting/docker` webapp + supervisor stack at `v4.7.3`, in one
compose, with two swaps (D-042):

- **Object storage:** Garage, bucket `trigger-packets`, instead of MinIO.
- **Registry:** GHCR. `pnpm deploy:trigger` builds the task image on the
  GitHub runner and pushes it to `ghcr.io/findmalek/…` with the job's own
  token; the supervisor pulls it with `GHCR_READ_TOKEN`.

The webapp's secrets (session, magic link, encryption, worker, Postgres and
ClickHouse passwords) are generated by the first deploy and kept in the
compose env, so later deploys never rotate them. Run containers join
`dokploy-network`, so tasks reach `lyterion-db`, slskd and ntfy by name.

Setup, once:

1. **Garage:** create bucket `trigger-packets` and a key with read/write on
   it. Repo secrets `TRIGGER_GARAGE_ACCESS_KEY` / `TRIGGER_GARAGE_SECRET_KEY`.
2. **GHCR:** repo secret `GHCR_READ_TOKEN` (classic PAT, `read:packages`)
   and repo var `GHCR_USERNAME` (step 6 above).
3. **Login:** repo var `TRIGGER_WHITELISTED_EMAILS`, a regex for your email
   (`^you@example\.com$`). Nobody else can sign in.
4. **DNS:** `trigger.findmalek.engineer` points at the-keep's public IP like
   `turbo.findmalek.engineer`; the deploy adds the domain with a Let's Encrypt
   cert. It is public because GitHub runners deploy through it; every API
   call needs a token. Override with repo var `TRIGGER_PUBLIC_HOST`.
5. **Deploy:** Actions → Infra → `stack: trigger`.
6. **Sign in:** open `https://trigger.findmalek.engineer`, enter your email.
   There is no mail transport, so take the magic link from the webapp log
   (`docker logs <lyterion-trigger webapp> 2>&1 | grep -i magic`).
7. **Project:** create an org and a project `lyterion`, then:
   - repo var `LYTERION_TRIGGER_PROJECT_REF` = the project ref (`proj_…`)
   - repo var `LYTERION_TRIGGER_API_URL` = `https://trigger.findmalek.engineer`
   - repo secret `TRIGGER_ACCESS_TOKEN` = Profile → Personal access tokens
   - repo secret `LYTERION_TRIGGER_SECRET_KEY` = Project → API keys → prod
8. **Tasks:** the next push to `main` (or Actions → Deploy) runs
   `pnpm deploy:trigger`. Then Tasks → `tools.check` → Test: the run prints
   every tool version (ffmpeg, ffprobe, fpcalc, sox, python3, mutagen,
   yt-dlp, rsgain, rip, aria2c) and fails naming any that is missing.

**Host folders in runs (#5, D-043):** the supervisor is our own image,
`ghcr.io/findmalek/lyterion-supervisor`, which is upstream plus
`DOCKER_RUNNER_BINDS`. Every run gets:

| host | in the run |
|---|---|
| `/srv/music` | `/music` (Lyterion writes only under `lyterion/`, D-012) |
| `/srv/lyterion/staging` | `/staging` |
| `/srv/lyterion/slskd-downloads` | `/slskd/downloads` |

Override with the compose env `TRIGGER_RUNNER_BINDS` (comma separated,
`host:container[:ro]`). Before the first Trigger.dev deploy:

1. Actions → Supervisor image → Run (it also runs on every change under
   `infra/the-keep/supervisor/`).
2. GitHub → Packages → `lyterion-supervisor` → visibility **public**, so
   Dokploy pulls it without credentials. It holds only upstream's code and
   the patch.
3. On the-keep: `mkdir -p /srv/lyterion/staging /srv/lyterion/slskd-downloads
   /srv/music/lyterion` and give them to the runs' user
   (`chown -R 1000:1000` on those three).

`tools.check` also writes and deletes a file in each folder and fails naming
any that is missing or read-only.

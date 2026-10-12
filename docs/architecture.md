# Architecture

## Homelab topology (one Dokploy host, D-003)

```
                      Cloudflare Tunnel
                             │
             ┌───────────────┴───────────────┐
         dashboard                          api ── Better Auth (owner + Spotify OAuth)
             │                               │
             └──────────── oRPC ─────────────┤
                                             │ trigger tasks
                                ┌────────────┴────────────┐
                        trigger webapp             trigger supervisor ──spawns──▶ run containers
                        (+ its postgres, redis,                                    │
                         object storage)                                           │
                                                                                   │
   ┌──────────────── volumes ────────────────────────────────────────────────────┤
   │  /music        (Navidrome library, Lyterion writes /music/lyterion only)    │
   │  /staging      (temp downloads, verify, tag; same filesystem as /music)     │
   │  /slskd        (slskd downloads dir)                                        │
   │  /anna         (Anna's Archive index + partial torrent payloads)            │
   └──────────────────────────────────────────────────────────────────────────────┘
        │                         │                          │
     Navidrome                  slskd                    app postgres
  (Subsonic API: scan,     (REST /api/v0, shares
   search, star)            /music read-only)
```

- On `the-keep` these are `/srv/music`, `/srv/lyterion/staging`,
  `/srv/slskd`, `/srv/lyterion/anna`, all on the same `/srv` ext4 disk.
  Navidrome mounts `/srv/music` read-only, and Lyterion mounts it read-write.
- Trigger.dev's object storage reuses the Garage (S3) instance already
  running.
- `/staging` and `/music` must be on the same filesystem so placement is an
  atomic `rename`, not a copy. Navidrome then never sees half-written files.
- slskd shares `/music` read-only. That's free and keeps the Soulseek account
  in good standing.
- Only the dashboard and api go through the tunnel. Trigger webapp, slskd and
  Navidrome admin stay LAN-only.

## Who touches files (spike S1)

**A: run containers mount the volumes.** File ops (verify, tag, place) are
plain functions in `packages/common`, called from tasks.

**B (fallback): `apps/librarian`.** A tiny internal HTTP service that mounts
every volume and owns all file ops: `stage`, `verify`, `tag`, `place`,
`delete`. Tasks orchestrate and call it, and never touch disk themselves.
Same functions as A, behind oRPC.

Either way, the file-op code lives in one package, so the choice only changes
the deploy, not the logic.

## Task image

Built through Trigger.dev build extensions:

- `ffmpeg` (decode check, transcode/downsample, spectral data)
- `chromaprint` (`fpcalc`)
- `sox` (spectrogram and cutoff analysis, resampling)
- Python plus `streamrip`, `yt-dlp`, `mutagen`, `rsgain` (ReplayGain)
- `aria2c` or libtorrent (selective torrent fetch, Anna)

## Monorepo (D-004)

```
apps/
  api/          oRPC router, Better Auth, Trigger webhook
  dashboard/    Next.js, shadcn, monochrome
  librarian/    only if S1 says so
packages/
  db/           Drizzle schema + migrations (generator only)
  env/          zod, LYTERION_*
  auth/ orpc/ ui/ logger/ ai-provider/
  common/
    src/spotify/       client, export, GDPR-export parser
    src/identity/      normalization, grouping, MusicBrainz, canonical release
    src/providers/     interface + one folder per provider
    src/verify/        decode, duration, fingerprint, spectral
    src/library/       tag, layout, place, m3u, navidrome client
    src/trigger/tasks/ one folder per task (sonaraem pattern)
```

## Deploy

- GHCR images for api, dashboard (and librarian), built by CI.
- One `compose.yml` for Dokploy: apps, app Postgres, slskd. Trigger.dev runs
  as its own compose stack (its official `hosting/docker` webapp + worker).
- Trigger tasks are deployed to the self-hosted instance with `trigger deploy`
  pointed at it.

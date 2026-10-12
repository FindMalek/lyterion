# Decisions

Append-only. Each entry: what, why, date. Superseded entries stay, marked.

## D-001 Personal, single-owner tool (2026-10-12)

One instance serves one owner. No multi-tenant code, no allowlist rotation, no
queue of users. The owner uses their own Spotify developer app.

## D-002 Closed source, one repo, every provider in-tree (2026-10-12)

Private `FindMalek/lyterion`. All providers live in the main repo. Revisit
before anything is ever made public: some providers (Deezer ARL, ripper
proxies, Anna's Archive) would draw DMCA takedowns on a public repo.

## D-003 Everything runs in the homelab (2026-10-12)

Dokploy hosts all of it: self-hosted Trigger.dev v4 (webapp + supervisor),
Postgres, Redis, slskd, the apps, and Navidrome. No job runs on third-party
compute. The only outbound calls are to Spotify, MusicBrainz, AcoustID,
LRCLIB, LLM APIs (Jev, Groq), and the providers themselves.

Why: about 150GB of audio per 5k FLAC tracks, local binaries (slskd,
streamrip, yt-dlp, ffmpeg, fpcalc), and the files have to land on a local disk.

## D-004 Monorepo mirrors sonaraem (2026-10-12)

pnpm + Turborepo. `apps/api`, `apps/dashboard`. `apps/web` is deferred
because a single-owner tool has no landing page audience, so self-host docs
go in the README. Packages: `db`, `env` (`LYTERION_*`), `auth`, `orpc`,
`common`, `ui`, `logger`, `ai-provider`, plus the Trigger tasks where
sonaraem keeps them.

## D-005 Retag every file Lyterion writes (2026-10-12)

Navidrome groups by tags, not folders. Every placed file gets a full,
consistent tag set from MusicBrainz (else Spotify), embedded cover, and
Lyterion IDs. Done with `mutagen` (the library beets and Picard use), called
from a small Python helper in the task image, which already needs Python
for streamrip and yt-dlp. See `library.md`.

## D-006 One file per recording (2026-10-12)

Library size is minimized by deduping at the recording level, not the
Spotify-track level. The same song on a single, an album, a deluxe and a
compilation becomes one file, and every playlist points at it. Different
versions (live, remix, acoustic, re-recorded…) stay separate. See
`matching.md` for the grouping rules and the saved-album exception.

## D-007 Every download is verified before placement (2026-10-12)

Decode check, duration, AcoustID fingerprint, real lossless check (spectral
cutoff plus padded 24-bit detection). A failure moves on to the next
candidate. See `verification.md`.

## D-008 Playlists are `.m3u8` files with sidecar covers (2026-10-12)

Written into the library, auto-imported by Navidrome, so every Subsonic
client (desktop and phone) sees them with covers. Lyterion is the source of
truth: edits made in clients get overwritten on the next sync. Needs
Navidrome ≥ 0.61 for sidecar playlist art.

## D-009 Quality policy (2026-10-12)

Lossless first, then the best lossy file. Store codec, bitrate, bit depth,
sample rate and verified-lossless per file. A `quality.upgrade` cron
re-searches lossy files. Max-quality cap: see open question Q3.

## D-010 Anna's Archive is decided by lookup, not by date guessing (2026-10-12)

Whether a track is in the dump is answered by an index lookup (Spotify ID,
then ISRC), not by its release date. The July 2025 date is only a hint. See
`providers.md`.

## D-011 Deterministic matching first, AI only for fuzzy picks (2026-10-12)

ISRC exact matches against catalog providers need no AI. The LLM picker (Jev
when access lands, Groq `gpt-oss-20b` / `gpt-oss-120b` until then) only
ranks fuzzy candidates, mostly slskd results. Below the threshold, the track
goes to manual review.

## D-012 Lyterion never touches files it didn't write (2026-10-12)

The existing Navidrome library is read-only input for dedupe. Lyterion
writes under its own subtree and only deletes or moves files it has a DB
record for. Playlists may reference existing files anywhere in the library.

## D-013 Secrets in env, OAuth tokens in DB (2026-10-12)

Provider credentials, API keys and Navidrome credentials are `LYTERION_*`
env vars set in Dokploy. Only the Spotify OAuth token (via Better Auth) lives
in Postgres.

## D-014 Stage advancement is event-driven, not long parent waits (2026-10-12)

No orchestrator task waits hours on children. Each stage finishes a batch,
updates DB counters, and the last finisher triggers the next stage. This
works whether or not self-hosted checkpointing is available (spike S4).

## D-015 UI (2026-10-12)

Monochrome shadcn, `--radius: 0`, neutral grays, color only for status, 13px
base, monospace for data, dense tables. See `ui.md`.

## D-016 Homelab facts (checked on `the-keep`, 2026-10-12)

- Navidrome `0.64.2` (sidecar playlist covers need ≥ 0.61: ok). It mounts
  `/srv/music` → `/music` **read-only**, and its scanner runs `@every 6h`.
  `ND_COVERARTPRIORITY=cover.*, folder.*, front.*, embedded, external`,
  `ND_LYRICSPRIORITY=.lrc,embedded`.
- beets `2.14.1` already runs alongside it: `/srv/music-inbox` → auto-import
  (musicbrainz, chroma, fetchart, embedart 1200px, lrclib synced lyrics,
  lastgenre, replaygain) → `/srv/music`.
- The existing library is about 50 files (506MB), so dedupe against the
  library barely matters for the first run.
- Disk: `/srv` is 938GB ext4 with 866GB free. Root has 194GB free.
  6 cores, 30GB RAM.
- Garage (S3) is already running, so Trigger.dev's object storage reuses it.
- ext4 has no reflinks, which matters for D-018.

## D-017 Quality target is "transparent", not "maximum" (2026-10-12, supersedes the cap part of D-009)

Listening gear: Redragon speakers, car, IEMs, AirPods-style Bluetooth.
Bluetooth re-encodes everything (AAC on AirPods, SBC on clones), so nothing
above transparent is audible.

- **Lossless source:** store FLAC, downsampled to 16-bit/44.1kHz. That's
  about 30MB for a 4-minute track. Hi-res is never stored.
- **Lossy source:** accepted as final when transparent: MP3 ≥ 256 or V0,
  AAC ≥ 256, Opus/Vorbis ≥ 160.
- **Below transparent** (Opus 75, MP3 ≤ 192, low YouTube formats): accepted
  so the library is complete, and the only thing `quality.upgrade` targets.
- **Ranking:** every transparent candidate is "good enough". Among them, an
  exact match and speed beat lossless-ness, and lossless is only the
  tie-breaker. No waiting on a slow Soulseek FLAC when an exact transparent
  file is available now.
- **Budget:** 5k tracks ≈ 150GB worst case (all FLAC), against 866GB free.

## D-018 Shared songs between two saved albums: two real files (2026-10-12, answers Q4)

Symlinks and hardlinks share the same bytes, and tags live inside the file,
so both paths would carry the same album tag and cover. Navidrome would show
the song twice on one album and never on the other. Copy-on-write reflinks
would solve it, but ext4 doesn't support them. So each saved album gets its
own tagged copy. That's normally a handful of files (a single that's also on
a compilation), so the cost is a few hundred MB at most. Playlists point at
one of the copies, not both.

## D-019 No streaming subscription for now (2026-10-12, answers Q2)

Free sources carry the first run: slskd, proxy backends, Anna's Archive,
YouTube Music. Since D-017 accepts transparent lossy, a subscription isn't
needed for audible quality. Revisit only if the first run's missing list is
large. Then one month of Qobuz or Deezer to bulk-fill and cancel, with
streamrip already wired.

## D-020 Coexist with beets, don't route through it (2026-10-12)

Lyterion writes straight into `/srv/music/lyterion/` with its own
deterministic tags (D-005). It doesn't use the beets inbox. beets in quiet
mode with an `asis` fallback and `duplicate_action: skip` could pick a
different release than placement chose, and could drop intentional copies
(D-018). Lyterion mirrors beets' conventions so the library stays uniform:
the same path format, synced LRCLIB lyrics as `.lrc`, embedded art at 1200px
plus a full-size `cover.jpg`, ReplayGain, and the top 3 genres. beets keeps
handling manual drops into the inbox.

## D-021 Fast-fill mode dropped (2026-10-12, Q7 moot)

Under D-017, Anna's Vorbis 160 and YouTube's Opus ~160 are final-quality, not
placeholders. There's no "grab fast now, upgrade later" mode to choose. Only
the below-transparent files get upgraded.

## D-022 Thorough search, superseding D-021's framing and the ranking order in D-017 (2026-10-12)

Malek picked "slow": every track searches all phases before choosing. No
early exit except an exact ISRC/ID lossless hit, which is already the best
possible result. Ranking among candidates becomes:
transparent > match confidence > lossless > reliability > speed.
Cost at ~7k tracks: slskd searches are paced ≥ 5s apart, so ≈ 10h of search
pacing alone. Expect the first run to take 1–3 days.

## D-023 How a file gets flagged for upgrade (2026-10-12)

`library_file.upgrade_reason` (null = fine) plus `upgrade_priority`. It's
set automatically at verification and manually from the phone:

| reason | set when | priority |
|---|---|---|
| `below_transparent` | effective quality under the D-017 line (Opus 75, MP3 ≤ 192…) | high |
| `fake_lossless` | "FLAC" whose spectrum shows a lossy origin. It's classed by its real cutoff, not its container | high |
| `fake_bitrate` | lossy file whose cutoff betrays a lower source (a "320" that's really 128) | high |
| `unverified_match` | AcoustID didn't know it and match confidence was < 1.0 | medium |
| `youtube_source` | YouTube master, which risks being the video edit or a different loudness | low |
| `owner_flag` | Malek flagged it while listening | top |

**Owner flag from any client:** Lyterion creates a normal (API, editable)
Navidrome playlist named `⇪ Upgrade`, owned by `findmalek`. Adding a song to
it from the phone or desktop flags it. `quality.upgrade` reads the playlist,
sets `owner_flag`, and removes the song once a better file is placed. The
dashboard has the same action as a button.

**The upgrade run (weekly cron plus on demand):** re-searches flagged files
by priority, excludes the current source ref, and accepts only a strictly
better quality class or a verified match. The replacement goes through the
same verify → tag → place path.

**Stars and play counts survive the swap:** Navidrome ≥ 0.55 derives song
IDs from tags (`PID.Track`, default `musicbrainz_trackid|albumid,discnumber,tracknumber,title`,
**check on 0.64**), not from the path, and we write `MUSICBRAINZ_TRACKID`.
So the ID survives a swap even when the extension changes. Playlists are
rewritten if the path changed.

## D-024 Navidrome users (2026-10-12, answers Q11)

`findmalek` is the admin and the only human user. `keep-dashboard` is a
non-admin service user. m3u playlists import as `findmalek`'s. Stars are
per-user, so Lyterion calls Subsonic as `findmalek`
(`LYTERION_NAVIDROME_USER` / `_PASSWORD`).

## D-025 Library size (2026-10-12, answers Q12)

Under 7,000 tracks, so ≤ ~210GB if every file were FLAC. A realistic FLAC
and lossy mix is ~100–150GB, against 866GB free on `/srv`.

## D-026 Upgrade signal is a 1-star rating, superseding the `⇪ Upgrade` playlist in D-023 (2026-10-12)

Listening happens in Arpeggi (phone) and Malek's own web player
(`keep-player` on `the-keep`). Both talk Subsonic, and a rating is the one
action every Subsonic client exposes in a single tap.

- **Signal:** a song rated **1 star** by `findmalek` means "this sounds bad,
  upgrade it". Ratings 2–5 are untouched and can carry taste.
- **Detection:** Lyterion writes a Navidrome smart playlist
  `Playlists/Upgrade queue.nsp` with the rule `rating is 1`. Navidrome keeps
  it current, so Lyterion just polls `getPlaylist` every 15 minutes.
  **Check:** the exact `.nsp` field name for rating on 0.64.
- **Effect:** sets `upgrade_reason = owner_flag` (top priority) and triggers
  `quality.upgrade` for that file right away, not on the weekly run.
- **After a successful upgrade:** `setRating 0` to clear the flag, and an
  ntfy message: `upgraded <artist> – <title>: MP3 128 → FLAC 16/44.1`.
- **No better source yet:** the rating stays at 1, the file stays queued,
  it's retried weekly, and an ntfy message says so once.
- **keep-player:** its "sounds bad" button just calls Subsonic `setRating 1`.
  Same mechanism, no Lyterion API needed.

## D-027 Explicit wins over clean (2026-10-12, answers Q5)

## D-028 Anna's Archive metadata is never kept whole (2026-10-12, answers Q6)

If S3 shows the torrent file names carry Spotify IDs, the `.torrent` files
are the index. Otherwise download once, filter to the owner's tracks into
`anna_track`, and delete it.

## D-029 Spotify: Premium confirmed; daily sync until cancellation (2026-10-12, answers Q13, Q14)

- **The developer app owner has Premium.**
- **`spotify.sync` runs daily** while Spotify is still in use (a few months):
  - new liked songs, saved albums, followed artists and playlist edits are
    exported, auto-acquired and placed
  - m3u files are rewritten
  - items removed on Spotify are removed from the m3u files, but files stay
    (only `library.reconcile` deletes)
- **Final export before cancelling Premium.** Dev-mode access ends with
  Premium, so the dashboard has a "final export" action that runs a full
  export and then disables the cron.
- **Idea, not scheduled:** import Spotify's "Extended streaming history"
  (GDPR request) as Navidrome play counts through Subsonic `scrobble` with
  timestamps, and/or to ListenBrainz.

## D-030 VPN for P2P traffic only (2026-10-12, answers Q15)

A `gluetun` container fronts **slskd** and the **torrent client** (Anna,
`aria2c`/libtorrent). Both expose the home IP to peers. Catalog proxies and
YouTube go out directly: HTTPS, nothing peer-visible, and VPN IPs make
YouTube bot checks worse.

- **The VPN must support port forwarding,** or Soulseek peers that are also
  firewalled can't connect. Candidates: Proton (Plus, NAT-PMP), AirVPN, PIA.
  Mullvad dropped port forwarding in 2023.
- **Forwarded ports can rotate (Proton).** gluetun's
  `VPN_PORT_FORWARDING_UP_COMMAND` pushes the new port into slskd's listen
  port.
- **Kill switch:** gluetun blocks traffic if the tunnel drops, so slskd never
  leaks the home IP.

## D-031 Notifications through ntfy (2026-10-12, answers Q16)

Topics and events:

- **run:** finished, with the summary from the run report
- **review:** batched, max one message an hour, "N tracks need review"
- **upgrade:** D-026 results
- **health:** a provider down for over an hour, the VPN down, the Spotify
  token failing, disk under its floor

Config: `LYTERION_NTFY_URL`, `LYTERION_NTFY_TOPIC`, and an optional token.

## D-032 Two upgrade signals, both polled, amending D-026 (2026-10-12, answers Q19)

Arpeggi is an iOS OpenSubsonic client. Its listed features include playlists
but say nothing about ratings, which is unverified. So Lyterion accepts
either signal:

- **rating = 1** (keep-player, and Arpeggi if it turns out to rate): read
  from the `Upgrade queue.nsp` smart playlist
- **membership in the editable `⇪ Upgrade` playlist** (any client that can
  add to a playlist, Arpeggi included): read with `getPlaylist`

Both are polled every 15 minutes. On success Lyterion clears whichever
signal was used: `setRating 0`, or removes the song from the playlist. The
heart/star is never used as a signal, because it mirrors Spotify liked
songs.

## D-033 VPN: Proton Plus (2026-10-12, answers Q17)

gluetun with `VPN_SERVICE_PROVIDER=protonvpn`, `VPN_PORT_FORWARDING=on`, and
the forwarded port pushed into slskd's listen port on change (D-030).

## D-034 ntfy self-hosted on `the-keep` (2026-10-12, answers Q18)

A `binwiederhier/ntfy` container in Dokploy, LAN plus the Cloudflare Tunnel
so the phone gets pushes away from home. Access control is on, and Lyterion
publishes with a token. It's reusable by other homelab services.

## D-035 Migrations run on api container start (2026-10-12)

The database is LAN-only on `the-keep`, so GitHub runners can't reach it, and
sonaraem's `drizzle-migrate.yml` isn't copied. The api container runs
`pnpm db:migrate` before `next start`. Migrations are always generated with
`pnpm db:generate`.

## D-036 CI, turbo cache and Vercel-style previews, all on `the-keep` (2026-10-12)

Requested by Malek: CI, builds and hosting on Dokploy with per-PR preview
links like Vercel, the same PR comment layout, and turbo cache.

- **Runner:** a self-hosted GitHub Actions runner on `the-keep`, run as a
  Dokploy compose service with repo scope and labels `self-hosted,the-keep`.
  CI jobs run inside the homelab, so they can reach the Dokploy API, the
  turbo cache, Postgres and Garage over the LAN or tailnet.
- **Turbo remote cache:** `ducktors/turborepo-remote-cache` on Dokploy,
  storage in Garage S3 (bucket `turbo-cache`). CI, docker builds and the dev
  machine (via tailnet `turbo.findmalek.engineer`) share it. Config through
  `TURBO_API`, `TURBO_TOKEN` and `TURBO_TEAM`.
- **Images:** one Dockerfile per app using `turbo prune --docker` and Next
  `output: "standalone"`. The turbo cache is passed into `docker build` as a
  build secret. Pushed to GHCR as `ghcr.io/findmalek/lyterion-{api,dashboard}`
  with tags `pr-<n>`, `sha-<sha>` and `main`.
- **Production:** on push to `main`, build, then redeploy the Dokploy apps
  `lyterion-dashboard` (`lyterion.findmalek.engineer`) and `lyterion-api`
  (`api.lyterion.findmalek.engineer`, so the cookie domain is
  `lyterion.findmalek.engineer`), plus a Dokploy-managed `lyterion-db`, then
  `pnpm deploy:trigger` to the self-hosted Trigger.dev. The api runs
  migrations on start (D-035).
- **Previews:** on PR open/sync, build and tag `pr-<n>`, then call the
  Dokploy API:
  - upsert two applications in a `lyterion-previews` project at
    `pr-<n>.preview.findmalek.engineer` and
    `pr-<n>-api.preview.findmalek.engineer`
  - give them their own Dokploy Postgres `lyterion-db-pr-<n>` (like a Neon
    branch)
  - deploy
  On PR close: delete the apps and the Postgres.
- **Networking:** wildcard DNS `*.preview.findmalek.engineer` → the
  Tailscale IP. Each domain gets its cert from the existing Traefik `vercel`
  DNS resolver (`customCertResolver` on `domain.create`), and every router
  sits behind `tailnet-only@file`, same as the other `*.findmalek.engineer`
  services.
- **PR comment, Vercel layout:** one sticky comment found by the hidden
  marker `<!-- lyterion-preview -->` and edited in place. It reads "The
  latest updates on your projects", then a table with columns
  `Project | Deployment | Actions | Updated (UTC)`, one row per app:
  status (🔄 Building, ✅ Ready, ❌ Failed, 🗑 Deleted), an Inspect link to the
  Dokploy deployment, and a Preview link.
- **Spotify login on previews:** Spotify needs exact redirect URIs, so
  previews use Better Auth's `oAuthProxy` plugin. The OAuth callback goes
  through the production api, which forwards the session back to the
  preview.
- **Trigger.dev on previews:** not deployed. Preview apps get no Trigger
  key, so triggering is a no-op there. Tasks are tested with `pnpm
  trigger:dev`.

## D-037 CI back on GitHub runners, homelab only hosts (2026-10-12, amends D-036)

Self-hosted runners filled the Docker disk on `the-keep` (about 53GB of
Docker data, mostly runner images and build cache), so Malek asked to use
GitHub's CI instead.

- **On GitHub-hosted runners:** CI, preview builds and production builds.
  Docker layers are cached with the GitHub Actions cache (`type=gha`).
- **On `the-keep`:** only the turbo remote cache stays, published at
  `turbo.findmalek.engineer` with a Let's Encrypt cert. It's public so
  GitHub runners can reach it; every request needs `TURBO_TOKEN`.
- **Dokploy:** called through its public API (`DOKPLOY_PUBLIC_URL`).
- **Image pulls:** Dokploy pulls from GHCR with the job's own `GITHUB_TOKEN`,
  which is valid while the deploy step waits for Dokploy, so there's no
  long-lived PAT. A redeploy started from the Dokploy UI later can fail to
  pull; redeploy from the workflow instead.
- **App env:** built from individual repo secrets
  (`LYTERION_BETTER_AUTH_SECRET`, `LYTERION_SPOTIFY_CLIENT_ID`, ...), so each
  value can be rotated on its own.
- **Kill switch:** deploys and previews only run when the repo var
  `DEPLOY_ENABLED` is `true`.

## D-038 Dashboard server calls the api over `dokploy-network` (2026-10-12)

Both public hosts sit behind `tailnet-only@file`, so the dashboard container
can't reach `api.lyterion.findmalek.engineer`: its session check failed and
every sign-in bounced back to `/login`. Server-side calls now use
`LYTERION_API_INTERNAL_URL` (`http://<api appName>:3001`), set by
`scripts/deploy/dokploy.mjs`. The browser keeps using the public url.

## D-039 Service credentials are entered in the dashboard (2026-10-12, amends D-013, #83)

Navidrome, slskd, proxy backends, Deezer ARL, AcoustID, Groq, Jev and ntfy are
set from Connections, tested live, and stored in `integration_credential` as
AES-256-GCM ciphertext. The key is `LYTERION_ENCRYPTION_KEY`, or one derived
from `LYTERION_BETTER_AUTH_SECRET` when unset. Every reader goes through
`getCredentials(kind)` (`@lyterion/common/credentials`): the dashboard value,
else the `LYTERION_*` env var, so env-only setups keep working. Secrets never
go back to the browser; a blank secret field keeps the saved one. The
Trigger.dev worker needs the same secret to decrypt. Still env-only: the
Spotify app (Better Auth reads it at boot), Trigger.dev and yt-dlp cookies.


## D-040 First run is claimed with a setup code; the Spotify app lives in the DB (2026-10-12, amends D-039, #83)

A fresh instance has no owner, so `/login` sends the visitor to
`/onboarding`. The api prints a one-time setup code
(`[onboarding] no owner yet. setup code: XXXX-XXXX-XXXX`) on every boot
until someone signs in, and onboarding's writes need it, so only someone
who can read the logs can claim the instance. Steps: setup code → Spotify
app (walkthrough, redirect uri with a copy button, client id and secret
checked with a client credentials token) → sign in with Spotify (becomes
the owner) → Navidrome and the optional services. After that, the Spotify
app is one more row under Connections.

Better Auth is built lazily (`getAuth()` in `@lyterion/core`) and rebuilt
when the Spotify app changes: at once in the api, within 30s in the
Trigger.dev worker. `LYTERION_SPOTIFY_CLIENT_ID` / `_SECRET` are optional
now and only a fallback.

## D-041 Navidrome 0.64.2 checks, against the real binary (2026-10-12, answers the open checks in D-023, D-026, #30, #44)

Run against the `v0.64.2` linux release with a scratch library, the D-016
cover priority, and the files Lyterion writes:

- **m3u8 import:** `Playlists/Night Drive.m3u8` with `../Artist/Album/NN
  Title.ext` paths imports as a read-only playlist owned by the first admin,
  in file order. It needs an admin to exist: a scan before the first admin
  logs "Playlists will not be imported" and imports on the next scan.
- **Sidecar cover:** `Night Drive.jpg` next to the m3u8 becomes the playlist
  cover (`getCoverArt pl-…` returns that image, not a mosaic).
- **Smart playlist:** `{"all":[{"is":{"rating":1}}]}` is the right field.
  `setRating 1` puts the song in `Upgrade queue` at once.
- **Swap keeps identity:** replacing `01 Angel.flac` with `01 Angel.mp3`
  tagged by `write_tags.py` keeps the song ID, the 1-star rating, the star and
  the play count, both with `MUSICBRAINZ_TRACKID` and without it. The
  scanner logs "Found moved files" and repoints playlist entries itself.
  Lyterion still rewrites its m3u8 files, because the file on disk would
  otherwise keep the old extension.

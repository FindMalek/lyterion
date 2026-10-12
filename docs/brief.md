# Lyterion: project brief

Carried over from a planning discussion in the `sonaraem` repo (2026-10-12).
Lyterion (λυτήριον) means "release, deliverance".

> Historical context. Where this conflicts with `decisions.md` (closed source,
> self-hosted Trigger.dev, no batch `/tracks`, no `apps/web` for now), the
> decisions win.

## Goal

A personal, self-hosted tool. It exports the owner's whole Spotify library and
rebuilds it on their own Navidrome server: liked songs, saved albums, followed
artists, and every playlist with its order and covers. Tracks are found across
every source integration so nothing is left missing. It's open source, and
each instance serves its owner only. Runs on Malek's homelab (Dokploy).

Out of scope: a hosted service that fetches audio for other people.

## Architecture (mirrors sonaraem)

pnpm + Turborepo monorepo, Next.js App Router:
- `apps/api`: oRPC, Better Auth (Spotify OAuth for the owner), Trigger.dev webhook
- `apps/dashboard`: connect Spotify and Navidrome, run a migration, live progress, review unmatched tracks
- `apps/web`: landing page and self-host docs
- Packages as in sonaraem: `db` (Drizzle), `env` (zod, every var prefixed `LYTERION_`),
  `auth`, `orpc`, `common`, `ui`, `logger`, `ai-provider`
- Trigger.dev v4 for every background job

## Spotify export

- The owner uses their own Spotify developer app in dev mode and adds
  themselves to its allowlist. The owner account needs Premium (Feb 2026 rule).
- Export: liked tracks, saved albums, followed artists, owned and followed
  playlists (order, cover, description).
- Fallback input: Spotify's "Download your data" export, for playlists the API
  won't return in dev mode.
- Matching key: ISRC from track `external_ids`. Spotify planned to remove it
  in Feb 2026, then reverted that in March 2026. Batch through `/tracks`,
  because album-track listings don't include it.
- sonaraem has reusable Spotify client and sync code, and Playwright allowlist
  automation (`packages/common/src/trigger/tasks/spotify-allowlist/`) if it's ever needed.

## Source providers: find every track

One provider interface: `search(track) → candidates[]`, `fetch(candidate) → file`.
Each candidate reports source, format, bitrate, bit depth, duration and match
confidence. For each track, query providers in parallel, rank the
candidates, take the best, and fall back down the list.

| provider | how | typical quality | notes |
|---|---|---|---|
| Local files and existing Navidrome library | scan and match first | whatever is there | dedupe before downloading anything |
| Soulseek via slskd | slskd REST API (`/api/v0`, Swagger on the instance) | often FLAC | fuzzy results, so filter by duration and format. Must share files |
| streamrip | CLI using the owner's Qobuz / Tidal / Deezer / SoundCloud accounts | FLAC, hi-res | v2.2.0, maintained forks exist |
| Tidal / Qobuz / Deezer / Amazon proxy backends | SpotiFLAC-style backends (hifi-api, Lucida, SquidWTF) | FLAC up to 24/192 | backends die often, so health-check and rotate |
| Deezer on-demand | Octo-Fiesta-style (Deezer ARL) | FLAC / 320 | |
| YouTube Music | yt-dlp, the spotDL / Downtify approach | lossy | last resort. Bot detection needs cookies and a PO-token provider |
| Lidarr + Tubifarry | Lidarr API, album-level grabs | mixed | optional for whole-album completion |
| Anna's Archive Spotify dump | bulk torrents plus metadata SQLite (`spotify_clean_track_files.sqlite3`) | Ogg Vorbis 160k, Opus 75k for zero-popularity tracks | Spotify's own encodes. Covers releases up to July 2025 |
| Bandcamp collection, Qobuz / 7digital purchases | owner's purchases | FLAC | clean sources for whatever the owner already bought |

Quality policy: FLAC when any provider has it, otherwise the best lossy file.
Store format, bitrate and bit depth per track, and run a spectral "fake FLAC"
check. An upgrade job re-searches lossy tracks later.

## Matching

1. Deterministic: ISRC, then normalized artist + title with duration ±2s.
2. Candidate picker for ambiguous cases: **Jev** by TypeSafe AI
   (https://typesafe.ai/blog/introducing-system-one-models-and-jev). It
   returns a typed choice among up to 255 options with a calibrated
   confidence. It costs $0.042 per million input tokens, output is free, and
   latency is 70–500ms. Early access, so check the API docs and console.
   Below a confidence threshold, send the track to manual review.
3. Fallback or tie-break: Groq `openai/gpt-oss-20b` (cheap) and
   `openai/gpt-oss-120b` (hard cases), through `getAIModel(task)` in `ai-provider`.
4. Optional fuzzy candidate search: a Typesense index over the MusicBrainz
   dump and the Anna's Archive metadata.

## Navidrome side

- **No upload API.** Files must land in the music folder, then call
  `startScan` (`fullScan` optional) and poll `getScanStatus`.
- Lyterion uploads the files itself over SFTP, WebDAV or an rclone remote to
  the music folder, plus Navidrome credentials for scans and playlists. If it
  runs on the same host, use a shared volume instead.
- Playlists: `createPlaylist` / `updatePlaylist` (Subsonic API v1.16.1),
  after the scan finishes so track IDs resolve. Star liked songs.
- Folder layout `Artist/Album (Year)/NN - Title.ext`. Pin one MusicBrainz
  release MBID per album so Navidrome doesn't split Deluxe/Standard editions
  (the SoulSync approach).
- Navidrome 0.60 has WebAssembly plugins (Go, Rust, Python). A plugin could
  replace SFTP later.

## Trigger.dev layout

- `migration.start` → `spotify.export` → `match.batch` → `acquire.track`
  (one per track, idempotency key = ISRC or Spotify ID, per-provider
  concurrency limits) → `navidrome.upload` → `navidrome.scan` → `playlists.sync`
- `quality.upgrade` cron re-searches lossy tracks.
- Progress per stage in JSONB, using the same `updateStageProgress` pattern as sonaraem.

## Distribution and hosting

- No SDK, no MCP, no npm package for v1. Ship GHCR images plus a compose file for Dokploy.
- About 30MB per FLAC track, so 5k tracks is about 150GB. Stream through to
  Navidrome and keep only temp files locally. Expose the apps through a
  Cloudflare Tunnel.

## UI

Monochrome, Zed / Keep-dashboard feel:
- shadcn with `--radius: 0` everywhere (sonaraem uses `0.625rem`, so don't copy that)
- neutral grayscale tokens only, color just for status (ok/warn/error)
- dense: small paddings, tables over cards, 13px base, monospace font for
  data (counts, ISRCs, sizes, formats)
- no hero whitespace, no gradients, no rounded pills

## GitHub workflow (copy sonaraem exactly)

- Create the repo `FindMalek/lyterion`.
- Copy the project board:
  `gh project copy 7 --source-owner FindMalek --target-owner FindMalek --title "Lyterion"`,
  then check that the built-in workflows are enabled (item added, PR linked →
  In review, PR merged → Done, auto-close).
- Fields: Status (Backlog, Ready, In progress, In review, Done, On hold),
  Priority (P0–P3), Size (XS–XL), Estimate, Iteration, Start/Target date.
- Views: Prioritized backlog (table, grouped by Status), Status board, Roadmap,
  Bugs, In review (`status:"In review"`), My items (`assignee:@me`).
- Labels: `gh label clone FindMalek/sonaraem --repo FindMalek/lyterion`.
- Copy from sonaraem: `.github/workflows/{ci,commit-lint,pr-auto-assign,project-review-status,drizzle-migrate}.yml`,
  `.github/pull_request_template.md`, `scripts/gh-project-status.sh`,
  `scripts/gh-project-status-for-pr.sh` (change the project number), and the
  `.cursor/rules/` structure, including `03-github-workflow.mdc`.
- Branches only via `gh issue develop <n> --checkout`.

## Prior art to study

- SoulSync (Nezreka, MIT): closest existing product (multi-source, Navidrome sync, MBID pinning)
- Octo-Fiesta: Subsonic proxy that downloads on demand
- SpotiSeek, Soulbeet, NavidroFM: slskd and yt-dlp automation patterns

## First steps for the new session

1. Scaffold the monorepo from sonaraem's structure (no copy-paste of unrelated features).
2. Set up the GitHub repo, project board, labels and workflows as above.
3. Open issues: Spotify export, provider interface plus the first providers
   (local, slskd, streamrip), matching, Navidrome upload/scan/playlists, dashboard UI.

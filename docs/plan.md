# Plan

Milestones become GitHub milestones. Each bullet becomes one issue with the
acceptance line as its done-criteria. Spikes are `type: spike` issues
scheduled ahead of the milestone that needs them.

## M0 Foundations

- GitHub: private repo `FindMalek/lyterion`, `gh project copy 7` → "Lyterion",
  label clone, workflows, PR template, project-status scripts (see brief).
  *Done: board has sonaraem's fields, views and automation.*
- Monorepo scaffold from sonaraem's structure, no unrelated features.
  *Done: `pnpm build`, lint and typecheck pass in CI.*
- `env` package with every `LYTERION_*` var. *Done: app boot fails loudly on
  a missing var.*
- Self-hosted Trigger.dev v4 on Dokploy, plus a hello task with
  ffmpeg/fpcalc/python in the image. *Done: a task runs on the homelab and
  prints the tool versions.*
- Spike S1 (volumes) → decide between librarian and direct mounts.
- `compose.yml` for apps + Postgres + slskd behind gluetun (D-030) + ntfy (D-031). *Done: Dokploy deploys it, and
  the dashboard is reachable through the tunnel.*

## M1 Spotify export

- Spike S2 endpoint audit.
- Better Auth Spotify login (owner only).
- `spotify.export`: liked songs, saved albums, followed artists, playlists,
  items, covers, raw pages. *Done: counts match the Spotify app.*
- Incremental re-run (snapshot IDs, `added_at` cursor), daily `spotify.sync` cron, final-export action (D-029).
- "Download your data" zip import.
- Dashboard: Connections (Spotify) and Runs (export stage).

## M2 Identity and existing library

- Normalization plus version-flag parser, with table tests from real titles.
- MusicBrainz client (1 req/s, UPC→release, ISRC→recording).
- Recording grouping (union-find) plus overrides.
- Placement scoring (saved album, cohesion, type, original, date).
- `library.index` from Navidrome. *Done: already-owned tracks show
  `existing` and never get queued.*
- Dashboard: Library (read-only) and Duplicates.

## M3 Acquisition core

- Provider interface, ranking, phases, early exit.
- Verification (decode, duration, AcoustID, spectral, padded 24-bit). Spike
  S7 sets the thresholds.
- Provider: proxy backends with `providers.health` rotation (the main free lossless catalog, D-019).
- Provider: slskd (search, filter, download, album mode).
- `acquire.recording` / `acquire.release` with queues, idempotency, disk
  guard.
- *Done: 100 random liked songs come in verified with no wrong files.*

## M4 Placement and Navidrome

- Tagging (mutagen helper), covers, layout, sanitization, atomic place.
- Debounced `navidrome.scan` plus `library.link`.
- `stars.sync`.
- *Done: albums don't split in Navidrome, and stars match Spotify.*

## M5 Playlists

- Spike S6.
- `playlists.write`: m3u8, sidecar covers, Liked Songs, hash-gated rewrite.
- Dashboard: Playlists.
- *Done: the phone client shows every playlist in order, with covers.*

## M6 Review and AI picker

- Groq picker behind `getAIModel`, confidence threshold.
- Review queue UI with audio preview.
- Spike S5, then Jev as the primary picker.

## M7 More providers

- Deezer ARL (plus the public Deezer ISRC resolver).
- streamrip, wired but dormant until a subscription exists (D-019).
- YouTube Music (yt-dlp, cookies, bgutil PO token).
- Purchases (Bandcamp, Qobuz).
- Lidarr + Tubifarry (album completion).

## M8 Anna's Archive

- Spike S3 (layout and released buckets).
- Metadata fetch plus filtered index build, `anna.sync`.
- Provider with selective torrent fetch.

## M9 Quality and polish

- `quality.upgrade` cron plus the Upgrades screen, 1-star signal via the smart playlist (D-026).
- ReplayGain and LRCLIB lyrics (Q8).
- `library.reconcile` with a dry run.
- Run report and Providers screen.

## First full migration

M0–M5 is enough for a real run: proxy backends + slskd + existing library, with
everything else landing in review or `missing`. M6–M9 shrink the missing
list.

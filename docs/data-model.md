# Data model (Drizzle, `packages/db`)

Draft. Column lists show intent, not final types.

## Spotify side (raw, per run)

| table | key columns |
|---|---|
| `spotify_track` | `id`, `isrc`, `title`, `artists[]`, `album_id`, `disc`, `track_no`, `duration_ms`, `explicit`, `popularity`, `linked_from_id`, `is_local` |
| `spotify_album` | `id`, `upc`, `title`, `artists[]`, `release_date`, `release_date_precision`, `album_type`, `total_tracks`, `image_url` |
| `spotify_artist` | `id`, `name`, `genres[]` |
| `spotify_playlist` | `id`, `name`, `description`, `owner_id`, `snapshot_id`, `image_url`, `is_collaborative` |
| `playlist_entry` | `playlist_id`, `position`, `spotify_track_id` (nullable for local), `local_name`, `added_at` |
| `library_save` | `kind` (liked_track / saved_album / followed_artist), `spotify_id`, `added_at` |
| `export_page` | raw JSON pages per run, for diffing and debugging |

## Identity

| table | key columns |
|---|---|
| `recording` | `id`, `mb_recording_id`, `title_norm`, `primary_artist_norm`, `version_flags[]`, `duration_ms`, `preferred_spotify_track_id`, `status`, `placed_release_id` |
| `recording_member` | `recording_id`, `spotify_track_id`, `edge` (isrc / mb / fuzzy / fingerprint / manual) |
| `recording_override` | owner split/merge decisions, applied after computed edges |
| `release` | `id`, `mb_release_id`, `mb_release_group_id`, `spotify_album_id`, `title`, `album_artist`, `type`, `date`, `original_date`, `is_saved`, `cover_path` |
| `release_track` | `release_id`, `recording_id`, `disc`, `track_no` |

## Acquisition

| table | key columns |
|---|---|
| `candidate` | `recording_id`, `provider_id`, `ref`, `format`, `bitrate`, `bit_depth`, `sample_rate`, `duration_ms`, `isrc_match`, `match_confidence`, `rank`, `state` (new / fetching / failed / chosen), `failure_reason` |
| `library_file` | `id`, `recording_id`, `release_id`, `path`, `owned` (wrote it vs pre-existing), `codec`, `bitrate`, `bit_depth`, `sample_rate`, `duration_ms`, `fingerprint`, `acoustid_recording`, `spectral_cutoff_hz`, `verified_lossless`, `size_bytes`, `content_hash`, `navidrome_song_id`, `source_provider`, `source_ref` |
| `review_item` | `recording_id`, `reason`, `candidate_ids[]`, `resolved_at`, `resolution` |
| `provider_health` | `provider_id`, `checked_at`, `ok`, `latency_ms`, `rolling_success_rate` |
| `anna_track` | filtered index: `spotify_id`, `isrc`, `popularity`, `bucket`, `file_ref` |

## Runs

| table | key columns |
|---|---|
| `migration_run` | `id`, `started_at`, `finished_at`, `stages` JSONB, `options` JSONB (fast-fill, cap…), `report` JSONB |
| `stage_trigger` | unique `(run_id, stage)`, guarantees one advancement (D-014) |

## Auth

Better Auth tables: the owner user plus the Spotify account and its tokens.

# Spotify export

## Access

- The owner's own developer app, dev mode, owner on its allowlist. The owner
  needs Premium (Feb 2026 rule).
- Scopes: `user-library-read`, `user-follow-read`, `playlist-read-private`,
  `playlist-read-collaborative`.
- Token through Better Auth's Spotify provider, refreshed by the api.

## What gets exported

| item | endpoint | notes |
|---|---|---|
| liked songs | `GET /me/tracks` | full track objects with `external_ids.isrc` and `added_at` |
| saved albums | `GET /me/albums` | album has `external_ids.upc`, but its tracks are simplified (no ISRC) |
| followed artists | `GET /me/following?type=artist` | cursor paging |
| playlists | `GET /me/playlists` | owned + followed + collaborative |
| playlist items | `GET /playlists/{id}/items` | renamed from `/tracks` in 2026, and the response field is `items[].item` |
| playlist cover | `GET /playlists/{id}/images` | largest image, downloaded and stored |

**Unverified:** reports conflict on whether the Feb 2026 dev-mode removals
(batch `/tracks`, `/albums`, `/artists`, other users' playlists) apply to
existing apps. Spike S2 settles it before any code depends on it.

## ISRC for saved-album tracks

Album tracks come without ISRC. In order:

1. The album's UPC → MusicBrainz release by barcode → every track's
   recording MBID and ISRCs in one lookup. That's one request per album, not
   per track.
2. `GET /tracks/{id}` per track, if S2 shows it still works.
3. No ISRC: match on artist + title + duration (`matching.md`).

## Edge cases

- **Local files in playlists** (`is_local: true`): no Spotify ID. Match by
  name, artist and duration against the Navidrome library only. Never
  downloaded.
- **Podcast episodes in playlists:** skipped and counted in the run report.
- **Relinked tracks:** request with `market=from_token`, store `linked_from`.
  Both IDs map to the same Spotify track row.
- **Unavailable or removed tracks** (null `item`, `is_playable: false`):
  still kept by name and ISRC. The providers don't care about Spotify
  availability, which is the point of migrating.
- **Duplicate entries in one playlist:** preserved. Order is position-exact.
- **Playlist folders:** not exposed by the API, and Navidrome has no folders
  anyway. Dropped.
- **Rate limits:** 429 with `Retry-After`. The client honors it globally,
  not per request.

## Incremental re-runs

- Store `snapshot_id` per playlist and skip playlists that haven't changed.
- Liked songs and saved albums: paged newest-first, stopping at the first
  `added_at` older than the last run.
- Every run keeps its raw JSON pages in the DB for diffing and debugging.

## Fallback: "Download your data"

For anything S2 shows the API won't return (followed playlists owned by
others, most likely). The owner uploads the zip in the dashboard, and we
parse `YourLibrary.json` and `Playlist*.json`. Each entry has a track URI,
or names only. Then it's enriched like the API path. **Unverified:** exact
file names and fields in the current export format. Check with a real
export.

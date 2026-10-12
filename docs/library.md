# Library: tags, layout, Navidrome, playlists

## Placement flow

`/staging/<id>` → verify → (lossless: downsample to FLAC 16/44.1, D-017) → tag → cover →
lyrics → ReplayGain → atomic `rename` into `/music/lyterion/…` → DB row →
counts toward the next scan.

## Tags (D-005, `mutagen`)

The metadata source is the MusicBrainz release chosen by placement, falling
back to Spotify.

| tag | value |
|---|---|
| `TITLE`, `ARTIST`, `ARTISTS` (multi-valued) | track credits |
| `ALBUM`, `ALBUMARTIST`, `ALBUMARTISTS` | release credits |
| `TRACKNUMBER`, `TRACKTOTAL`, `DISCNUMBER`, `DISCTOTAL` | position on the placed release |
| `DATE`, `ORIGINALDATE` | release date, original release date |
| `RELEASETYPE`, `COMPILATION` | album/single/EP, VA flag |
| `ISRC`, `BARCODE` | identifiers |
| `MUSICBRAINZ_TRACKID`, `MUSICBRAINZ_RECORDINGID` (Picard naming), `MUSICBRAINZ_ALBUMID`, `MUSICBRAINZ_ARTISTID`, `MUSICBRAINZ_ALBUMARTISTID`, `MUSICBRAINZ_RELEASEGROUPID` | pins the release so Navidrome doesn't split editions |
| `GENRE` | Spotify artist genres, top 3 |
| `LYTERION_RECORDING_ID`, `SPOTIFY_TRACKID` | traceability. Lets `library.link` and re-runs find files by tag |
| `REPLAYGAIN_*` | `rsgain` (Q8) |
| embedded front cover | 1200px max JPEG (matches beets `embedart`), plus a full-size `cover.jpg` in the folder |
| lyrics | LRCLIB synced → `.lrc` sidecar (Q8) |

Existing tags from the source are wiped first, so no junk tags survive from
slskd rips.

Written by `packages/common/python/write_tags.py` (mutagen), which handles
FLAC, Ogg Vorbis, Opus, MP3 and M4A. It follows Picard naming:
`MUSICBRAINZ_TRACKID` holds the **recording** MBID and
`MUSICBRAINZ_RELEASETRACKID` the per-release track MBID.

**Check on 0.64:** Navidrome's default `PID.Track` starts with
`musicbrainz_trackid`, so the two copies of a song kept for two saved albums
(D-018) share it and may collide. If they do, set `PID.Track` to
`musicbrainz_releasetrackid|albumid,discnumber,tracknumber,title`.

## Layout

```
/srv/music/lyterion/                 (Navidrome sees /music/lyterion)
  <AlbumArtist>/<Album> (<Year>)/<Track> <Title>.<ext>          beets `paths.default`
  <AlbumArtist>/<Album> (<Year>)/<Disc>-<Track> <Title>.<ext>   multi-disc
  <AlbumArtist>/<Album> (<Year>)/cover.jpg                      full size, Navidrome's first art choice
  Compilations/<Album> (<Year>)/<Track> <Artist> - <Title>.<ext>
  Playlists/<Name>.m3u8
  Playlists/<Name>.jpg
```

- Same format as the beets config on `the-keep` (D-020), so both trees look alike.
- Path segments are sanitized: no `/ \ : * ? " < > |`, trimmed, NFC,
  ≤ 120 bytes each.
- Name collisions are resolved by adding the MB release disambiguation, and
  the MBID tag still keeps the releases separate in Navidrome.

## Navidrome

- **Scans are debounced:** `startScan` after 200 placed files or 10 quiet
  minutes, never per track, since a scan covers the whole library. Then
  poll `getScanStatus`.
- **`library.link`** after each scan: map recording → Navidrome song ID by
  path (the Subsonic song has `path`) or by the `LYTERION_RECORDING_ID` tag.
- **Stars** (Subsonic `star`):
  - liked songs → star song
  - saved albums → star album
  - followed artists → star artist

## Playlists (D-008)

- Every Spotify playlist plus a "Liked Songs" playlist becomes one `.m3u8`
  in `Playlists/`, with paths relative to the playlist file. Entries may
  point outside `lyterion/` at existing library files (D-012).
- Format: `#EXTM3U`, `#PLAYLIST:<name>`, then `#EXTINF:<sec>,<artist> - <title>`
  plus the path per entry, in Spotify order, duplicates kept.
- Missing tracks are left out of the file and listed in the dashboard. The
  file is rewritten as they arrive.
- Cover: the Spotify playlist image saved as `<Name>.jpg` next to the m3u
  (Navidrome ≥ 0.61 sidecar rule, S6).
- The description goes in a `#` comment line. **Unverified:** whether
  Navidrome reads it.
- Writes are atomic (temp file + rename) and only happen when the content
  hash changes.
- Navidrome auto-imports, so the playlists show up in every Subsonic client
  (desktop, phone) with covers.

## Reconcile

`library.reconcile` (manual or after re-runs):

- moves files whose placement changed (rename plus retag)
- removes Lyterion-owned files whose recording no longer has any reference
  (opt-in, with a dry-run list first)
- rewrites playlists

It never touches files outside `lyterion/` (D-012).

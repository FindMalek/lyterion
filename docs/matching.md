# Matching and dedupe

Three different questions, kept separate:

1. **Identity:** which Spotify tracks are the same recording? (dedupe, D-006)
2. **Placement:** which release does that recording's single file belong to?
3. **Candidate pick:** which provider result is that recording?

## 1. Identity: Spotify track → recording

A *recording* is one specific performance or master. One file per recording.

### Normalization

- Text: NFKD, strip diacritics, lowercase, unify quotes and dashes, collapse
  whitespace, `&` / `and` / `+` equivalence.
- Featured artists move out of the title into a list (`feat.`, `ft.`,
  `with`, `(w/ …)`).
- Bracket and dash suffixes are parsed into **version flags** or **neutral
  tokens**:

| distinct versions (never merged across) | neutral (merge allowed, duration decides) |
|---|---|
| live, remix (+ remixer), acoustic, instrumental, demo, a cappella, radio edit, extended, mono, re-recorded (`Taylor's Version`), sped up, slowed, karaoke, cover | remaster(ed) + year, album version, single version, deluxe, bonus track, explicit, clean |

### Merge edges (union-find over Spotify tracks)

| edge | strength |
|---|---|
| same ISRC | certain |
| ISRCs resolve to the same MusicBrainz recording MBID | certain |
| same normalized primary artist + title + identical version flags + duration ±3s | strong |
| same AcoustID recording after download (verification) | certain, merges retroactively |

- Explicit and clean versions usually have different ISRCs and equal
  durations. They merge, and the preferred one wins (Q5).
- A neutral token ("single version") with a duration gap over 3s means a
  different edit, so no merge.
- Owner overrides from the Duplicates screen (split or merge) are stored and
  always win over computed edges.

## 2. Placement: which release holds the file

A recording appears on several Spotify releases. Pick one, persist it, and
keep it sticky.

1. **Already in Navidrome** (existing file matches): that file is the
   recording's file. Nothing is downloaded (D-012).
2. **On a saved album:** that album. Saved albums must be complete in
   Navidrome. If two saved albums share a recording, Q4 decides whether to
   keep both (the one allowed duplicate) or collapse.
3. **Otherwise, score each candidate release:**
   - **cohesion** (heaviest): how many other wanted recordings already sit on
     this release. This minimizes 1-track album folders. If 4 songs from an
     album are spread over playlists, they share that album rather than
     scattering across singles.
   - release type: album > EP > single > compilation / "best of" / soundtrack
     various-artists
   - original over deluxe or expanded, unless only the deluxe has the track
   - earliest original release date

Re-runs keep the existing placement unless a newly saved album forces a
move. A move is a file rename plus retag, done by `library.reconcile`, never
a re-download.

## 3. Candidate pick

Deterministic first (D-011):

- **Catalog providers** (Qobuz, Tidal, Deezer, proxies): search by ISRC. An
  exact ISRC hit with a duration within ±2s is accepted with no AI.
- **slskd:** results are file paths. Parse artist, album, track number and
  title from the path, then filter by extension and size-implied duration.
  Score with string similarity plus duration plus folder context (does the
  folder look like the right album, does the track number line up). Accept
  above a high threshold.
- **Ambiguous:** send the top ≤255 candidates (path, size, bitrate, user
  speed, queue length) plus the target metadata to the picker. Jev returns
  one choice and a calibrated confidence. Groq `gpt-oss-20b` stands in until
  Jev access arrives, and `gpt-oss-120b` takes retries on low confidence.
- **Below the threshold:** create a review item holding the candidates. The
  owner picks in the dashboard.

Every choice is checked by verification afterwards, so a wrong pick costs one
download and never a wrong file in the library.

## Dedupe against the existing library

`library.index` reads Navidrome (Subsonic `search3` paging or the native API)
and builds a lookup by:

- ISRC tag, if present
- MusicBrainz recording ID tag, if present
- normalized artist + title + duration

An optional deep pass fingerprints existing files (slow, one-off, ~1s per
file) for libraries with poor tags.

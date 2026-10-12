# Dashboard UI (D-015)

## Tokens

- shadcn, `--radius: 0` everywhere
- neutral grayscale (zinc or neutral scale) for everything
- color only for status: ok (green), warn (amber), error (red), info (one
  muted blue, max)
- 13px base, 12px in dense tables, monospace (Geist Mono or JetBrains Mono)
  for counts, ISRCs, sizes, formats, durations and paths
- tight spacing (`p-2`/`p-3`), 1px borders as separators, no shadows, no
  gradients, no pills, no hero whitespace
- tables over cards, sticky headers, keyboard navigation (j/k, enter, /)
- dark first, light supported

## Screens

| screen | content |
|---|---|
| Connections | one row per integration: Spotify, Navidrome, slskd, streamrip services, proxies, Deezer ARL, YouTube, Anna, AcoustID, Groq, Jev. Status, last check, latency, and a test button |
| Runs | run list. The open run shows a stage table (total / done / failed / rate / ETA), bytes, and a quality-class breakdown |
| Library | every recording: status, quality (`FLAC 24/96`, `OPUS 75`), provider, verified ✓, size, placed path. Filters on all of them |
| Review | queue of ambiguous tracks. Target metadata against candidates side by side, an audio preview of a fetched candidate, pick or skip with the keyboard |
| Duplicates | merged groups: which Spotify tracks became one recording and why (edge type). Split and merge actions |
| Playlists | each playlist: entries, found, missing, last written, cover thumbnail |
| Providers | per provider: success rate, verify-fail rate, avg time to file, bytes, health history |
| Upgrades | lossy files and the best known upgrade candidate |
| Settings | quality cap, explicit preference, fast-fill, saved-album dedupe policy, disk budgets |

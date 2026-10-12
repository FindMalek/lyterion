# Providers

## Interface

```ts
interface Provider {
  id: ProviderId;
  kind: "library" | "catalog" | "p2p" | "archive" | "video";
  capabilities: { isrcSearch: boolean; albumFetch: boolean; maxQuality: Quality };
  health(): Promise<ProviderHealth>;
  search(target: RecordingTarget): Promise<Candidate[]>;
  searchRelease?(target: ReleaseTarget): Promise<ReleaseCandidate[]>;
  fetch(candidate: Candidate, dest: StagingPath): Promise<FetchedFile>;
}

type Candidate = {
  providerId: ProviderId;
  ref: string;               // provider-specific handle
  format: "flac" | "alac" | "wav" | "mp3" | "aac" | "opus" | "vorbis";
  bitrateKbps?: number;
  bitDepth?: number;
  sampleRateHz?: number;
  durationMs?: number;
  isrcMatch: boolean;
  matchConfidence: number;   // 0..1
  estimatedSeconds?: number; // queue + transfer estimate
};
```

## Tiers (searched in phases, not all at once)

| phase | providers | when |
|---|---|---|
| A: free and exact | Navidrome library, local folders, purchases (Bandcamp/Qobuz/7digital) | always first |
| B: catalog, ISRC exact | streamrip (Qobuz / Tidal / Deezer / SoundCloud), proxy backends (hifi-api, Lucida, SquidWTF), Deezer ARL | in parallel. Early exit on an ISRC-exact hit at target quality |
| C: P2P | slskd | only if B has no lossless hit. Slow searches, so it's rate limited |
| D: lossy | Anna's Archive (local lookup, checked alongside B), then YouTube Music (yt-dlp) | always searched (D-022). An exact Anna Vorbis 160 hit is a strong candidate, but a lossless one still wins |
| optional | Lidarr + Tubifarry | album-completion jobs, not per track |

For most mainstream tracks, phase B ends the search in seconds with no AI and
no slskd. slskd and the picker handle the long tail.

## Ranking (D-017)

Sort key, in order:

1. **Quality class:** transparent (verified lossless, or lossy at or above
   the transparency line) > below transparent.
2. **Match confidence:** ISRC-exact or Anna exact-ID = 1.0.
3. **Speed estimate:** catalog/Anna ≈ instant, slskd = queue + upload speed.
4. **Provider reliability:** rolling success rate of fetch + verify.
5. **Lossless:** tie-breaker only.

Order per D-022: transparent > match confidence > lossless > reliability >
speed. All phases run (thorough mode). The only early exit is an exact
ISRC/ID lossless hit. Fetch the top candidate. If it fails fetch or
verification, take the next. After N failures, open a review item.

## Album mode

When ≥ 3 wanted recordings share a placed release, acquire the release as a
unit: slskd folder download, or streamrip album URL. One search instead of
N, a consistent rip (same source, same gain), and far fewer Soulseek
searches. Each file is still verified individually.

## Rate and concurrency (Trigger queues)

| queue | limit |
|---|---|
| `slskd-search` | 1 concurrent, ≥ 5s apart (Soulseek penalizes search floods) |
| `slskd-download` | 4 |
| `streamrip` | 2 per service |
| `proxy-*` | 2 per backend, disabled automatically while unhealthy |
| `youtube` | 1, with jitter, cookies + PO-token provider (bgutil) |
| `musicbrainz` | 1 request/s (MusicBrainz policy, needs a User-Agent) |
| `acoustid` | 3 requests/s |
| `verify` | CPU cores − 1 |

## Per-provider notes

- **Navidrome / local:** `library.index` (see `matching.md`). A hit means no
  download at all.
- **slskd:** `/api/v0/searches` → poll → `/transfers/downloads`. Filter by
  extension, bitrate, size, and free upload slots. Shares `/music` read-only.
- **streamrip:** CLI with the owner's accounts (Q2). Supports ISRC-ish
  search and album URLs. Pinned version. Fork-friendly wrapper, since its
  upstream API breaks.
- **Proxy backends:** health-checked every 15 minutes by
  `providers.health`. Endpoints rotate from a list in env. Unhealthy means
  skipped.
- **Deezer ARL:** cookie-based. FLAC with HiFi, 320 otherwise. ISRC lookup
  is free through Deezer's public API (`/track/isrc:{isrc}`), which is also a
  cheap ISRC→metadata resolver for every provider.
- **YouTube Music:** last resort. Match on title + artist + duration, and the
  verification fingerprint is mandatory, since YouTube returns covers and
  live versions often.
- **Purchases:** Bandcamp collection download links, Qobuz purchases.
  Indexed once and treated like the local library.

## Anna's Archive routing (D-010)

What's known: about 256M tracks in the metadata, about 186M unique ISRCs, and
roughly 200GB of compressed metadata. Audio is Spotify's own Vorbis 160k, or
Opus 75k for popularity-0 tracks. The cutoff is July 2025. Audio is released
in stages by popularity bucket. The per-file layout is **unverified** (S3).

**The check is a lookup, not a date guess.** Release date fails both ways.
A 2026 deluxe reissue can contain recordings that are in the dump under the
2019 album with the same ISRC. A 2024 track can be missing because its
popularity bucket hasn't been released yet.

```
annaAvailable(track):
  hit = annaIndex.bySpotifyId(track.spotifyId)
     ?? annaIndex.byIsrc(track.isrc)                 // relinked IDs, reissues
     ?? annaIndex.byIsrc(any ISRC of the recording)  // other releases of the same recording
  if !hit                            → no
  if !releasedBuckets.has(hit.bucket) → not yet (re-checked by anna.sync)
  if !hit.singleFileFetchable         → no (S3: packed archives)
  return { quality: hit.popularity == 0 ? "opus75" : "vorbis160", ref: hit.fileRef }
```

The release date is used only as a cheap hint to skip the lookup when
`release_date > 2025-07` **and** the recording has no other ISRC with an
older release. The lookup itself costs microseconds, so the hint barely
matters.

**Filtered index (default, Q6).** Don't keep 256M rows. After each Spotify
export, stream the metadata once and keep only rows whose Spotify ID or ISRC
is in the owner's library. That's a few thousand rows in Postgres
(`anna_track`). New tracks in later runs trigger an incremental filter pass,
which needs the compressed metadata kept on a cheap disk, or re-downloaded.

**Why it matters (the speed edge case).** An Anna hit is an exact match by
construction: it's Spotify's own audio for that Spotify ID. It needs no AI,
no slskd search and no bot detection, and it fetches in bulk. Under D-017,
Vorbis 160 is final quality, so for every pre-July-2025 track in a released
bucket, Anna can be the whole answer.

**Where it ranks:** Vorbis 160 is transparent, so it ranks with the catalog
hits. Opus 75 is below transparent and only used when nothing else exists,
and `quality.upgrade` targets it.

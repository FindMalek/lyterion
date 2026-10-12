# Verification (D-007)

Runs on every fetched file in `/staging`, before tagging and placement. The
checks run cheapest first and stop at the first failure.

| # | check | how | fail means |
|---|---|---|---|
| 1 | container + full decode | `ffmpeg -v error -i f -f null -` with empty stderr | corrupt or truncated, next candidate |
| 2 | stream facts | `ffprobe`: codec, sample rate, bit depth, channels, duration | record real values, never trust the provider's claim |
| 3 | duration | within ±2s of target (±4s for YouTube, where intros and outros are common) | wrong edit or version |
| 4 | fingerprint | `fpcalc` → AcoustID lookup → recording MBIDs | see below |
| 5 | real lossless | spectral cutoff via `sox`/FFT on 3 windows | lossy-sourced "FLAC": reclassify as lossy |
| 6 | real bit depth | 24-bit file whose low 8 bits are always zero | padded 16-bit: reclassify as 16-bit |

## Fingerprint decision

- **AcoustID returns the expected recording MBID**, or a recording carrying
  the target ISRC: pass, confidence 1.0.
- **AcoustID returns a different recording with the same artist and a
  version flag** (live, remix…): fail, wrong version.
- **AcoustID returns a different recording that's the same song** (MB
  duplicates happen): pass, and add a merge edge (`matching.md`).
- **AcoustID knows nothing:** pass on match confidence alone if ≥ 0.9, else a
  review item. Store the fingerprint anyway. Two unknown files with equal
  fingerprints are still the same recording, which dedupes the library.

Spike S7 measures how often AcoustID has no answer for this library, to set
the threshold.

## Spectral rule of thumb

- Real CD-sourced FLAC has content up to ~20–22kHz.
- MP3 320 cuts off around 19.5–20kHz, MP3 ≤ 256 around 16–19kHz.
- A hard shelf below ~19.5kHz in multiple windows means a transcode.

Thresholds get tuned on known-good and known-bad samples. The result is
stored as `verified_lossless: boolean`, and only true counts as lossless for
ranking and upgrades.

## Stored per file

Codec, bitrate, sample rate, bit depth, duration, fingerprint, AcoustID
recording, spectral cutoff Hz, verified lossless, source provider plus ref,
and fetch time. That's everything the upgrade cron and the dashboard need.

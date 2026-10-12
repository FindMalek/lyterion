# Open questions and spikes

## Questions for Malek

None right now. New questions get the next free id (Q20+).

Answered: Q1 same host (D-016), Q2 no subscription (D-019), Q3 transparent
target (D-017), Q4 two real files (D-018), Q7 dropped (D-021), Q8 lyrics and
ReplayGain on (D-020), Q9 `lyterion/` subtree, Q10 Navidrome 0.64.2 (D-016),
Q11 `findmalek` (D-024), Q12 < 7k tracks (D-025), Q5 explicit (D-027),
Q6 (D-028), Q13/Q14 (D-029), Q15 (D-030), Q16 (D-031), Q17 Proton Plus (D-033),
Q18 ntfy on `the-keep` (D-034), Q19 both signals (D-032).

## Spikes (time-boxed, answer before the milestone that needs them)

| id | spike | blocks | how |
|---|---|---|---|
| S1 | Can self-hosted Trigger.dev v4 run containers mount host volumes (music, slskd downloads, temp)? | M3 | read supervisor env reference, try a bind mount. Fallback: `apps/librarian` service owns all file ops (see `architecture.md`) |
| S2 | Spotify dev-mode endpoint audit against the owner's real app: `/me/tracks`, `/me/albums`, `/me/following`, `/me/playlists`, `/playlists/{id}/items` (owned vs followed), `/tracks/{id}`, `/albums/{id}`, `/playlists/{id}/images` | M1 | script hits each, logs status and whether `external_ids` is present. Reports conflict on whether the Feb 2026 removals apply to existing apps |
| S3 | Anna's Archive torrent layout: one file per track, or packed archives? Which popularity buckets are released? | M8 Anna provider | inspect torrent file lists (metadata only, no payload). Packed archives mean no per-track fetch |
| S4 | Does self-hosted v4 support checkpoint/restore for waits? | nothing (D-014 avoids it) | docs check, informational |
| S5 | Jev API access, request/response shape, limits | M7 | waitlist, then a 1-day wrapper behind `getAIModel` |
| S6 | Navidrome m3u import: visibility to non-admin users, sync-on-change behavior, sidecar cover pickup on 0.61 | M5 | write a test m3u + jpg into a scratch library |
| S7 | AcoustID coverage on a sample of the owner's library (what % of tracks return a recording) | M3 verification thresholds | fingerprint 200 random files from slskd |

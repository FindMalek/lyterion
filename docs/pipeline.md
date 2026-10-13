# Pipeline (Trigger.dev v4, self-hosted)

## Stages

```
migration.start
  └─ spotify.export ──────────────┐
  └─ library.index (parallel) ────┤
                                  ▼
                          identity.resolve      MusicBrainz, grouping, placement
                                  ▼
               acquire.release / acquire.recording   (window of 20, refilled per track, D-046)
                    providers → verify → library.place
                                  ▼
                          navidrome.scan        debounced, also fires mid-run
                                  ▼
                          library.link → playlists.write → stars.sync
```

Crons:

- `quality.upgrade`: weekly, re-searches lossy and unverified files
- `providers.health`: every 15 minutes
- `anna.sync`: daily, released buckets plus the incremental index filter

Manual:

- `review.resolve`: the owner picks a candidate in the UI
- `library.reconcile`

## Stage advancement (D-014)

- A `migration_run` row holds `stages` JSONB: per stage `{status, total,
  done, failed, startedAt, finishedAt}`, using the same
  `updateStageProgress` pattern as sonaraem.
- Each child task increments counters in one SQL statement. When
  `done + failed == total`, the child that made it so triggers the next
  stage. A unique key on `(run, stage)` makes that trigger fire once.
- No task waits on children for hours, so nothing depends on checkpointing
  (S4).
- **Acquire window (D-046).** identity.resolve marks the backlog `waiting`
  (everything `resolved` or `missing`; placed tracks are never redone) and
  sets the acquire total. `dispatchAcquire` claims up to 20 `waiting`
  tracks as `queued` (album by album, `FOR UPDATE SKIP LOCKED`, so racing
  top-ups never overlap) and triggers them; every finished track tops the
  window up again. A failed trigger puts its claims back. A crash in one
  track counts it as failed once and the run goes on.
- **Stale runs.** Acquire tasks whose run is no longer `running` exit
  without work, and the next run frees anything a dead run left `waiting`
  or in flight.
- **Errors** land in the stage's `error` field and show under the run in
  the dashboard.
- The dashboard streams progress with Trigger realtime or polls the run row.

## Idempotency

| task | key |
|---|---|
| `acquire.recording` | `recording:<id>:<run>:<generation>`: placed recordings are never queued again, misses get one try per run |
| `acquire.release` | `release:<id>:<run>:<generation>`: one slskd album search when ≥ 3 wanted recordings share a placed release, then each track as `acquire.recording` would |
| `library.place` | the file's content hash, so a re-place is a no-op |
| `playlists.write` | playlist ID plus content hash |

- Every DB write is an upsert. A re-run of a finished migration only does
  the delta: new Spotify items, failed tracks, and upgrades.
- The generation increments only when the owner forces a retry.

## Failure handling

- **Provider errors** (timeouts, 5xx, bans): the task retries with backoff
  on the same candidate twice, then moves to the next candidate. These are
  never Trigger-level retries of the whole task.
- **Verification failure:** next candidate immediately. The failure is
  recorded on the candidate.
- **All candidates exhausted:** recording status `missing`, plus a review
  item if any candidate came close. `quality.upgrade` and new providers
  revisit missing recordings too.
- **Disk guard:** `acquire.*` pauses when `/staging` exceeds a budget or
  `/music` free space drops under a floor.

## Statuses

Recording: `pending → resolved → searching → fetching → verifying → placed → linked`,
plus `missing`, `review`, `skipped` (owner-excluded), and `existing`
(already in the library).

## Run report

At the end of a run, counts by status, by provider and by quality class,
plus total bytes. Also a list of every missing track and every review item.

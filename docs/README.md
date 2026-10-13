# Lyterion docs

Read in this order:

| doc | what |
|---|---|
| [setup.md](setup.md) | every step to get an instance running, start to finish |
| [brief.md](brief.md) | original context from the sonaraem discussion. `decisions.md` overrides it |
| [decisions.md](decisions.md) | every settled decision, numbered, with the why. Append, never rewrite |
| [open-questions.md](open-questions.md) | unanswered questions and spikes that block decisions |
| [architecture.md](architecture.md) | homelab topology, services, monorepo layout, where files live |
| [pipeline.md](pipeline.md) | Trigger.dev tasks, stages, queues, idempotency, progress |
| [data-model.md](data-model.md) | tables and the entities behind them |
| [spotify.md](spotify.md) | export: endpoints, edge cases, GDPR-export fallback |
| [matching.md](matching.md) | identity, recording-level dedupe, canonical release, AI picker |
| [providers.md](providers.md) | provider interface, tiers, ranking, Anna's Archive routing |
| [verification.md](verification.md) | how a downloaded file is proven to be the right track at the right quality |
| [library.md](library.md) | tagging, folder layout, Navidrome scan, playlists (m3u + cover), stars |
| [ui.md](ui.md) | dashboard screens and design tokens |
| [plan.md](plan.md) | milestones and the issues they become |

## Rules for these docs

- A decision lands in `decisions.md` first, then the topic doc is updated to match.
- An open question moves to `decisions.md` once answered, with the date.
- Anything not verified against a live system is marked **unverified**.

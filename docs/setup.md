# Setup, start to finish

Every step to get Lyterion running on `the-keep`, in order. Each step says
where you do it (the-keep shell, GitHub, a website, the Lyterion dashboard) and
how to tell it worked. The details behind each piece are in
[infra.md](infra.md); the reasons are in [decisions.md](decisions.md).

## 0. What you need

| thing | why | cost |
|---|---|---|
| `the-keep` with Dokploy, Garage and Navidrome running | everything runs there (D-003) | |
| Spotify Premium and a Spotify developer app | dev-mode API access needs Premium on the app owner (D-029) | |
| Proton VPN Plus, optional | hides the home IP from Soulseek peers (D-030); slskd runs without it by default (D-045) | about $4/month |
| AcoustID application key, Groq API key | verification and fuzzy matching | free |

**If you add a VPN, Proton must be a paid plan.** The free plan only offers `*-FREE#` servers,
which block P2P and have no port forwarding (NAT-PMP). slskd would either be
blocked or unable to accept connections, so most downloads fail. Plus
includes both.

## 1. Folders on the-keep

```bash
sudo mkdir -p /srv/lyterion/staging /srv/lyterion/slskd-downloads /srv/music/lyterion
sudo chown -R 1000:1000 /srv/lyterion/staging /srv/lyterion/slskd-downloads /srv/music/lyterion
```

Runs write as uid 1000. Lyterion only writes under `/srv/music/lyterion`
(D-012).

## 2. GitHub repo settings

Settings → Secrets and variables → Actions. The full list with values is in
[infra.md → Setup checklist](infra.md#setup-checklist). The ones every later
step needs:

- secrets: `DOKPLOY_API_KEY`, `GHCR_READ_TOKEN` (classic PAT,
  `read:packages`), `TURBO_TOKEN`, `GARAGE_ACCESS_KEY` / `GARAGE_SECRET_KEY`,
  `LYTERION_BETTER_AUTH_SECRET`
- vars: `DOKPLOY_PUBLIC_URL`, `GHCR_USERNAME`, `PRODUCTION_DASHBOARD_HOST`,
  `PRODUCTION_API_HOST`, `DEPLOY_ENABLED=true`

If a pull from GHCR ever fails with `denied` on the-keep, log the host in
once with the same PAT: `sudo docker login ghcr.io -u <you>` (D-044).

## 3. Turbo cache

Actions → **Infra** → `stack: turbo-cache`. Worked when the run is green and
CI logs show remote cache hits.

## 4. Trigger.dev

Details: [infra.md → Trigger.dev](infra.md#triggerdev-4).

1. Actions → **Supervisor image** → Run, then GitHub → Packages →
   `lyterion-supervisor` → visibility **public**.
2. Garage: bucket `trigger-packets` and a read/write key → secrets
   `TRIGGER_GARAGE_ACCESS_KEY` / `TRIGGER_GARAGE_SECRET_KEY`.
3. Var `TRIGGER_WHITELISTED_EMAILS` = a regex for your email.
4. Actions → **Infra** → `stack: trigger`. Worked when
   `docker ps | grep lyterion-trigger` lists webapp, supervisor, postgres,
   redis, electric, clickhouse, s2 and docker-proxy, all up.
5. Open `https://trigger.findmalek.engineer`, enter your email, and take the
   magic link from `docker logs <…-webapp-1> 2>&1 | grep -i magic` (there is
   no mail transport).
6. Create an org and a project `lyterion`, then set:
   - var `LYTERION_TRIGGER_API_URL` = `https://trigger.findmalek.engineer`
   - var `LYTERION_TRIGGER_PROJECT_REF` = the `proj_…` ref
   - secret `TRIGGER_ACCESS_TOKEN` = Profile → Personal access tokens
   - secret `LYTERION_TRIGGER_SECRET_KEY` = API keys → **prod**
7. Actions → **Deploy** on `main`. It deploys the apps, copies the api's env
   into Trigger.dev, and deploys the tasks.
8. Trigger.dev → Test → `tools.check` → Run. Worked when every tool prints a
   version and `/music/lyterion`, `/staging`, `/slskd/downloads` say
   `writable`.

## 5. Claim Lyterion

1. Get the one-time setup code. It is printed only while nobody owns the
   instance:
   ```bash
   docker logs $(docker ps -qf name=lyterion-api | head -1) 2>&1 | grep "setup code" | tail -1
   ```
2. Open `https://lyterion.findmalek.engineer` (tailnet), enter the code.
3. Spotify app: add the redirect uri the page shows to your app at
   developer.spotify.com, put yourself on the app's user list, paste the
   client id and secret.
4. Sign in with Spotify. You are now the owner; the setup code stops
   printing.
5. Connect Navidrome: url, `findmalek`, password.

## 6. slskd and ntfy

Details: [infra.md → Services compose](infra.md#services-compose-7).

1. **No VPN (default, D-045):** nothing to set. slskd publishes no port;
   don't forward one on the router either.
2. **With a VPN, later:** make a Proton WireGuard config (account.proton.me
   → VPN → Downloads → WireGuard configuration; platform GNU/Linux,
   **NAT-PMP on**, any **P2P** server under Standard server configs), and put
   the value after `PrivateKey =` in the secret `PROTON_WIREGUARD_PRIVATE_KEY`.
   The next Infra run switches slskd behind gluetun.
3. Actions → **Infra** → `stack: services`. The Soulseek login, slskd web
   password and slskd api key are generated on the first run and kept;
   read them in Dokploy → `lyterion-services` → Environment.
4. Check slskd: `docker logs <…-slskd-1> 2>&1 | grep -i "logged in"` shows
   it logged into Soulseek. With the VPN, `docker logs <…-slskd-config-1>`
   also prints Proton's forwarded port instead of `50300`.
5. ntfy users and token:
   ```bash
   docker exec -it <…-ntfy-1> ntfy user add --role=admin findmalek
   docker exec -it <…-ntfy-1> ntfy user add lyterion
   docker exec -it <…-ntfy-1> ntfy access lyterion lyterion write-only
   docker exec -it <…-ntfy-1> ntfy token add lyterion
   ```
   Then subscribe the phone app to `https://ntfy.findmalek.engineer`,
   topic `lyterion`, as `findmalek`.
6. Dashboard → Connections:
   - Soulseek (slskd): url `http://slskd:5030`, api key `SLSKD_API_KEY`
   - ntfy: url `http://ntfy`, topic `lyterion`, the token from step 5

## 7. Matching

Dashboard → Connections:

- **AcoustID:** application key from acoustid.org/new-application
- **Groq:** API key from console.groq.com
- **Jev:** only once TypeSafe AI gives early access; Groq covers it until then

## 8. Optional sources

More sources never lower quality: every track searches all of them and the
ranking (D-017, D-022) only picks a weaker file when nothing better exists.

| source | add it when | what it gives |
|---|---|---|
| Deezer ARL | you have any Deezer account | free account: MP3 128, below the transparent line, so only a last-resort fill that gets queued for upgrade. Premium: MP3 320 / FLAC. Value of the `arl` cookie on deezer.com |
| Proxy backends | you have hifi-api style backend urls | Tidal/Qobuz/Deezer FLAC, health-checked and rotated |
| Lidarr | you already run Lidarr with indexers | whole-album fills for saved albums still missing tracks |
| YouTube Music | already on, no setup | Opus ~160 (transparent). Cookies only matter once YouTube starts blocking |

Downtify isn't a separate source: it wraps spotDL, which downloads from
YouTube Music, the same audio Lyterion already gets through yt-dlp.

## 9. Ready

Connections shows Spotify, Navidrome, slskd, AcoustID and Groq green. Start
the first migration from the dashboard. Expect 1–3 days for the first run
(D-022).

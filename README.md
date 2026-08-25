# Pulse — keep-alive pinger & mini uptime dashboard

A tiny Node/Express service that pings your free-tier **Render** services on a schedule so
they never spin down (Render free web services sleep after ~15 min without traffic, and a
cold Spring Boot start costs 30–60 s). Deployed as a single serverless function on
**Vercel**. Doubles as a dark-themed status dashboard.

## Design: what counts as "success"

Pulse keeps services **awake**, it does not do deep health checking:

- **Any valid HTTP response = success** (`200`, `302`, `401`, `403`, `404`, `500`, …).
  A 404 from a Spring app still proves the JVM woke up and served the request — critical
  for apps that have no health endpoint at all.
- **Failure = network-level problem only**: DNS failure, connection refused, TLS error,
  timeout.
- Per-service `strict: true` opts into real health checking (asserts `expectedStatus`,
  default `200`).

## Endpoints

| Endpoint        | Auth                              | What it does |
| --------------- | --------------------------------- | ------------ |
| `GET /api/ping` | `Authorization: Bearer <CRON_SECRET>` **or** `?key=<CRON_SECRET>` | Pings all services in parallel, stores last result per service, returns JSON results + summary. This is the cron entrypoint. |
| `GET /api/status` | none | Returns the in-memory last-results map (same record shape), 200 always. |
| `GET /`         | none | HTML dashboard (auto-refresh 30 s). |

Ping response shape:

```json
{
  "startedAt": "2026-08-25T10:00:00.000Z",
  "durationMs": 812,
  "results": [
    { "name": "signalops-api", "url": "https://…", "ok": true, "status": 200,
      "latencyMs": 143, "checkedAt": "2026-08-25T10:00:00.143Z" }
  ],
  "summary": { "total": 3, "up": 3, "failed": 0 }
}
```

One dead service never breaks a run (`Promise.allSettled`); individual network errors are
reported per service with `ok: false` and an `error` message.

## Local run

```bash
npm install
npm start          # serves http://localhost:3000 (PORT env to override)
curl "http://localhost:3000/api/ping"     # CRON_SECRET unset → open in dev mode
curl http://localhost:3000/               # dashboard
npm test                                  # unit tests (node:test)
```

Optional local `.env` (see `.env.example`) is auto-loaded; real environment variables win.

## Configuration

Loaded from **`services.json`** (repo root), fully overridden by the **`SERVICES`** env var
(single-line JSON array) when set — so you can add services from the Vercel dashboard
without redeploying.

Per-service schema:

| Field            | Type    | Default  | Notes |
| ---------------- | ------- | -------- | ----- |
| `name`           | string  | required | Unique (case-insensitive) |
| `url`            | string  | required | Must be a valid `http(s)` URL |
| `method`         | string  | `"GET"`  | HEAD is not used by default (unreliable across frameworks) |
| `strict`         | boolean | `false`  | `true` = assert `expectedStatus`; `false` = any response is OK |
| `expectedStatus` | int     | `200`    | Only used when `strict: true` |
| `timeoutMs`      | int     | `8000`   | 500–60000 |

```json
[
  { "name": "signalops-api", "url": "https://signalops-api.onrender.com/actuator/health", "strict": true },
  { "name": "legacy-spring", "url": "https://legacy-spring.onrender.com/" },
  { "name": "portfolio-site", "url": "https://my-portfolio.vercel.app/", "strict": true }
]
```

- **Invalid entries** (missing name/url, bad URL, duplicate names, bad numbers) fail fast
  at boot locally and return a clear 500 with the exact problem on Vercel.
- **Empty/missing config** logs a warning and the dashboard shows "no services configured".

## Deploying to Vercel

### Option A — CLI

```bash
npm i -g vercel
vercel login
vercel                      # link the project from this folder (accept defaults)
vercel env add CRON_SECRET production    # paste a long random secret when prompted
# optional, override services without redeploy:
vercel env add SERVICES production       # paste e.g. [{"name":"my-api","url":"https://my-api.onrender.com/"}]
vercel --prod
curl "https://<your-app>.vercel.app/api/ping?key=<CRON_SECRET>"
```

### Option B — Dashboard

1. Push this folder to GitHub.
2. vercel.com → **Add New… → Project** → import the repo.
3. Framework Preset: **Other** (no build command needed — `api/index.js` + `vercel.json`
   are auto-detected).
4. **Environment Variables**: add `CRON_SECRET` (and optionally `SERVICES`) for
   Production.
5. **Deploy**. Then verify: open `https://<your-app>.vercel.app/` (dashboard) and hit
   `/api/ping?key=<CRON_SECRET>` once.

## Scheduling the pings

Vercel Cron on **Hobby runs at most once per day**, so the primary trigger must be an
external free cron hitting the protected endpoint every 5–10 minutes.

### Recommended: cron-job.org (free)

1. Sign up at cron-job.org → **Cronjobs → Create cronjob**.
2. URL: `https://<your-app>.vercel.app/api/ping?key=<CRON_SECRET>`
   (or use the URL without the key and add a request header
   `Authorization: Bearer <CRON_SECRET>` under Advanced so the secret isn't in the URL).
3. Schedule: **Every 5 minutes**. Save & enable.
4. Optionally enable failure notifications ("Treat as failed" if status ≠ 2xx).

Alternative: UptimeRobot → Add monitor → type **HTTP(s)** → same URL → interval 5 min.

### Built-in Vercel Cron (secondary/fallback)

`vercel.json` already contains a daily crons entry:

```json
"crons": [{ "path": "/api/ping", "schedule": "0 12 * * *" }]
```

- **Hobby:** daily is the max allowed — keep it as a harmless fallback; the external cron
  does the real work.
- **Pro:** change the schedule to `"*/5 * * * *"` and you can drop the external cron.
- Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when that env var is set,
  so no key juggling needed.

## Behavior & limitations

- Uses native `fetch` with `AbortSignal.timeout(timeoutMs)`; follows redirects; never
  downloads response bodies (stream is cancelled immediately after headers).
- Results are cached **in memory per lambda instance** (`Map`). Serverless cold starts
  reset it and Vercel may run multiple instances, so `/api/status` is best-effort
  "last run on this instance" — acceptable for keep-alive purposes. The dashboard shows
  configured-but-not-yet-pinged services as `PENDING`.
- Every ping logs a structured line visible in Vercel logs: `[pulse] name OK 200 143ms`.
- `maxDuration: 60` on the function gives slow services room; worst case ≈ one timeout
  window since all services are pinged in parallel.
- No database, no persistence, no in-app scheduler — by design.

## Project layout

```
api/index.js      Express app (Vercel entrypoint)
lib/config.js     load + validate service config (fail-fast, pure validators)
lib/classify.js   success classification + error description (pure)
lib/pinger.js     fetch wrapper with per-service AbortController timeout
lib/dashboard.js  server-rendered HTML dashboard
lib/store.js      in-memory last-results Map
server.js         local dev listener (loads .env, validates config, exits on bad config)
test/*.test.js    node:test unit tests for validation/classification/dashboard
```

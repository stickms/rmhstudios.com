# RMHLadder — Operations Runbook

Operating the job-discovery pipeline (`server/ladder-worker`) and the resume
subsystem in production. Companion to the design spec
`docs/superpowers/specs/2026-07-15-rmhladder-productionization-design.md`.

## Is it actually running? (prod truth)

The worker is the Docker Compose service `ladder-worker`
(`command: node dist-server/server/ladder-worker/index.cjs`). It runs the
pipeline on `LADDER_CRON_SCHEDULE` (default **every 12h**) and self-bootstraps
an empty database on startup.

Checklist:

1. **Worker process:** `docker compose ps ladder-worker` → should be `Up`.
2. **Worker logs:** `docker compose logs --tail=100 ladder-worker` → look for
   `[ladder-worker] Started`, a resume-readiness line, and periodic
   `[ladder-worker] Run complete [...] discovered=... created=...`.
3. **One-shot status report:** run inside the worker (or web) container:
   ```bash
   pnpm ladder:status
   ```
   Prints last completed run + age (flagged `[STALE]` if older than the 12h
   window), active/expired job counts, sources by status
   (`active/unconfigured/blocked/error/disabled`), and resume-subsystem
   readiness.
4. **Admin dashboard:** `/rmhladder/health` shows the resume subsystem,
   silent sources, and the scrape-run ledger.

If there is no completed run and no `Run complete` log line, the worker is not
running or is crash-looping — check `docker compose logs ladder-worker` for the
stack trace (commonly a missing `DATABASE_URL`).

## Resume uploads fail (503 "temporarily unavailable")

Resumes are PII: production requires **object storage** (no local-disk
fallback) **and** an **encryption key**. If either is missing, uploads return a
generic 503 to users, and the specific missing capability is logged
(`[rmhladder-resume] upload blocked — ...`) and shown on `/rmhladder/health`.

Required env (all four for storage):

| Var | Purpose |
|---|---|
| `S3_BUCKET` | bucket name |
| `S3_ENDPOINT` | S3/R2 endpoint (account host; bucket appended by the SDK) |
| `S3_ACCESS_KEY_ID` | credential |
| `S3_SECRET_ACCESS_KEY` | credential |
| `S3_REGION` | optional (default `us-east-1`) |
| `LADDER_RESUME_ENCRYPTION_KEY` | AES-256-GCM key for resume text + files |

Generate the encryption key (32-byte hex):
```bash
openssl rand -hex 32
```
Set it as `LADDER_RESUME_ENCRYPTION_KEY` in the production env file, then
restart the `web` and `ladder-worker` services so they pick it up.

Verify after provisioning:
```bash
pnpm ladder:status   # resume subsystem: READY
```
Then upload a PDF/DOCX at `/rmhladder/resume` — expect `201`, not `503`.

> Rotating `LADDER_RESUME_ENCRYPTION_KEY` invalidates previously encrypted
> resumes (they can no longer be decrypted). Rotate only with intent.

## Scrape schedule

- Default: **every 12 hours** (`0 */12 * * *`).
- Override without a rebuild: set `LADDER_CRON_SCHEDULE` (standard 5-field
  cron, UTC) in the production env file and restart `ladder-worker`. An invalid
  value fails fast at startup with `Invalid LADDER_CRON_SCHEDULE`.

## Force a run now

The web tier never scrapes. Trigger a manual run from the worker/web container:
```bash
pnpm ladder:run                 # full pipeline, trigger=manual
pnpm ladder:run --limit 20      # cap sources (smoke test)
pnpm ladder:run --platform greenhouse
```
Each run writes a `LadderScrapeRun` row visible on `/rmhladder/health`.

(An in-dashboard "Run now" button that signals the worker is planned for a
later phase; until then use the CLI.)

## Reading review tasks & a tripped circuit breaker

- `/rmhladder/review` lists open review tasks. A `mass_expiry_suspected` task
  with the source set to `error` means the mass-expiry circuit breaker tripped
  (a source's board looked empty for many active jobs at once — usually a fetch
  problem, not real mass-expiry). Investigate the source before clearing.
- `/rmhladder/health` "silent sources" lists sources with a stale
  `lastSuccessAt` — the earliest signal of a quietly-failing board.

## Alerts

`pnpm ladder:status` prints an **ALERTS** section at the bottom, and the
`ladder-worker` logs a `[ladder-worker] HEALTH ALERT [severity] code: message`
line to stderr after each tick for every active alert. The four codes:

| Code | Severity | Meaning | Operator response |
|---|---|---|---|
| `worker_stale` | high | No completed scrape run within the stale window (default 24h). | Check `docker compose ps ladder-worker` and `docker compose logs ladder-worker`. Restart if crash-looping. |
| `breaker_tripped` | high | Open `mass_expiry_suspected` review task(s) — the circuit breaker tripped because a source's board looked empty for many active jobs. | Investigate the flagged source at `/rmhladder/review`. Verify the board is actually live before clearing the task. |
| `resume_not_ready` | high | Resume subsystem blocked — object storage or encryption key unconfigured. | Provision `S3_*` vars and `LADDER_RESUME_ENCRYPTION_KEY` (see the resume section above), then restart `web` and `ladder-worker`. |
| `high_error_run` | medium | The latest scrape run's error rate exceeded the threshold (default 50%). | Check the failing sources on `/rmhladder/health`. Transient network blips self-resolve; repeated failures need source investigation. |

### Tunable thresholds

Override the defaults with env vars (set in the production env file):

| Var | Default | Meaning |
|---|---|---|
| `LADDER_ALERT_STALE_RUN_MS` | `86400000` (24h) | Age threshold (ms) before `worker_stale` fires. |
| `LADDER_ALERT_ERROR_RATE` | `0.5` (50%) | Error rate (0–1) above which `high_error_run` fires. |
| `LADDER_ALERT_MIN_RUN_FOR_RATE` | `10` | Minimum `discoveredCount` before the error-rate check applies (ignores tiny runs). |

## Env var reference (ladder)

See `.env.example` (search `LADDER_`): `LADDER_CRON_SCHEDULE`,
`LADDER_USER_AGENT`, `LADDER_DOMAIN_RATE_LIMIT_MS`, `LADDER_PROBE_BATCH_SIZE`,
`LADDER_RESUME_ENCRYPTION_KEY`, `LADDER_AI_*`, `LADDER_LEASE_*`.

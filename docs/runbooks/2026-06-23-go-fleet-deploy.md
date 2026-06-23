# Deploy Runbook — Go Fleet via the Optimized `deploy.sh` (Compose / VPS)

**Date:** 2026-06-23
**Scope:** How a normal production deploy now ships the **Go fleet** (the
`supervisor` running the five background workers as goroutines + the Go `status`
service) alongside the unchanged Node `web` tier, using the optimized
`deploy.sh` Compose path on the VPS.

This is the **steady-state deploy** runbook. The one-time **cutover** from the
Node worker containers to the Go supervisor is in
[`2026-06-22-go-runtime-cutover.md`](./2026-06-22-go-runtime-cutover.md) — read
that first if the supervisor/status services are not yet live. Once cut over,
every deploy goes through the flow below.

It captures what **PR #187** (slim/full image split + no-op hotswap/migrate
skips) and **PR #188** (warm-cache disk tunables) changed about the mechanics.

> **TL;DR for the on-call:** `git push` → webhook runs `deploy.sh`. The Go fleet
> rebuilds from the **`runner-full`** image; the Node web tier rebuilds from the
> **`runner`** (slim) image. A Go-only / supervisor-only change leaves the slim
> image byte-identical, so the web hotswap **and** the Prisma migrate step both
> **self-skip** — the deploy touches only the fleet. Nothing to do by hand.

---

## 1. The two-image model (what #187 introduced)

One Dockerfile, one build graph, **two runner images** — the `target:` stage is
the only difference (`docker-compose.yml` → `x-build: &build-common`):

| Image | Compose services | Contents | Rebuilt when |
|---|---|---|---|
| `${PROJECT}-app` (**slim** `runner`) | `web`, `socket`, `rmhbox`, `rmhtube` | Node + node_modules + Nitro `.output` + esbuild server bundles. **No** Chromium, git, or Go binaries. | Web/source/env changes only. **Invariant** to `go-services/` changes. |
| `${PROJECT}-app-full` (**full** `runner-full`) | `supervisor`, `status` | Slim image **+** Go binaries (`/app/bin/*`) **+** Chromium + fonts (vibe-worker chromedp) **+** git (discord-bot worktrees). | Any `go-services/` change, plus everything that rebuilds slim. |

Why it matters operationally:

- The four user-facing Node services dropped **~300–400 MB** (Chromium + fonts).
  Faster pulls, smaller SHA-tagged rollback images, less disk.
- The slim image being **invariant to Go changes** is the key that unlocks the
  hotswap/migrate skips in §3. A supervisor-only deploy produces a
  content-identical slim image, so there is genuinely nothing web-facing to ship.
- Both images are SHA-tagged each deploy (`${IMAGE}:${GIT_SHA}` and
  `${IMAGE}-full:${GIT_SHA}`) for instant rollback. They **share most layers**,
  so the second tag costs almost no disk.

`deploy.sh` builds both in one step: `dc build web supervisor` (slim target +
full target). On a warm cache the full target is just the extra
Chromium/git/Go-binary layers on top of slim — near-zero added build time.

---

## 2. The deploy flow (annotated)

Triggered by the webhook on push. Each numbered item is a `deploy.sh` step:

1. **Fetch latest code** — `git fetch` + hard reset to the pushed SHA.
2. **Pre-build disk cleanup** — prune old rollback images; **conditionally** wipe
   build cache only when free disk is low (see §4). Healthy disk → cache kept
   warm.
3. **Build both images** — `dc build web supervisor` → slim (`runner`) + full
   (`runner-full`); tag both `:latest` and `:${GIT_SHA}`.
4. **Sync static assets to R2** (incremental).
5. **Migrations** — `prisma migrate status`; **skip** `migrate deploy` entirely
   when the schema is already up to date (see §3).
6. **Bring up everything except web** — `dc up -d --no-build --scale web=0`. This
   recreates `supervisor`, `status`, `socket`, `rmhbox`, `rmhtube`, workers, etc.
   The **Go fleet rolls here.**
7. **Hotswap web (blue/green)** — `deploy/hotswap-web.sh`; **skips** when the live
   web container already runs the freshly built slim image (see §3).
8. **Health checks (parallel)** — probes `socket`, `rmhbox`, `rmhtube`, `status`
   ports. (Web is not re-checked here — the hotswap already proved it serves.)
9. **Prune + cap build cache** — LRU trim toward the keep target, full reset only
   above the ceiling (see §4).

The **Go fleet** (`supervisor` + `status`) comes up in **step 6** from the full
image. There is no separate fleet command — a standard deploy carries it.

---

## 3. The no-op fast paths (#187) — expected, not a bug

Two steps now self-skip when there is genuinely nothing to do. On a
**Go-only / supervisor-only deploy**, expect to see both skip logs — that is the
optimization working, not a missed step.

### 3a. Web hotswap skip (`deploy/hotswap-web.sh`)
Before spinning up the green container, the script compares the **live web
container's image ID** against the **freshly built slim image ID**. If the live
container is `Running` **and** on the exact same image, it logs and exits 0:

```
Live <color> container already runs <image> — web unchanged, skipping hotswap.
```

No second container, no health wait, no Apache reload. It **only** skips when web
is actually running that image — if web is down, missing, or on a different
image, it falls through to the normal blue/green swap. So a Go-only deploy never
risks the web tier, and a web change always swaps.

### 3b. Prisma migrate skip
`prisma migrate status` exits **0 only** when the schema is fully up to date (no
pending, no failed migrations). In that case `deploy.sh` skips the
resolve+`migrate deploy` container entirely:

```
Schema already up to date — skipping migrate deploy (no pending migrations).
```

Saves a full node+prisma boot (~5–10 s) on every deploy with no new migration
(the common case). A **non-zero** exit means the DB is reachable but reports
pending/failed migrations → the full resolve + `migrate deploy` runs as before.
DB-unreachable is still a hard failure (distinct branch).

> **Sanity check:** a deploy that *does* add a migration must **not** show the
> skip log. If you pushed a migration and see "Schema already up to date", the
> new migration didn't reach the image — stop and investigate before assuming
> it applied.

---

## 4. Disk / cache tunables (#188)

The per-deploy `vite build` re-runs every time (its COPY layer is always busted
by source changes), so a **warm `.vinxi` module-graph cache** is what makes it
incremental instead of cold. The cache wipes are now far less aggressive and
**env-overridable**, trading disk for build speed:

| Env var | Default | Role |
|---|---|---|
| `DEPLOY_MIN_FREE_GB` | `6` (was 10) | Below this free disk → wipe **all** build cache + unused images (the rare safety valve). Lower it on a big disk to keep the cache warm across more deploys. |
| `BUILD_CACHE_KEEP_GB` | `20` (was 5) | Post-build LRU trim target. Larger = more warm cache (notably `.vinxi`) survives. |
| `BUILD_CACHE_CEILING_GB` | `30` (was 8) | Hard ceiling; above it after LRU trim → full cache reset to stop slow creep. Costs one cold rebuild next deploy. |

Set these in the webhook/systemd environment if the VPS disk differs from the
generous default. **No behavior change when disk is healthy** — it only governs
how often the cache survives.

Operational reads:
- "Disk healthy: NG free (≥ 6G) — keeping build cache warm…" → fast incremental
  build expected.
- "Low disk: NG free (< 6G) — wiping all build cache…" → next build is **cold**
  (re-pulls pnpm/vinxi). If you see this every deploy, the disk is undersized for
  the keep target — raise the disk or lower `BUILD_CACHE_KEEP_GB`/ceiling.

---

## 5. Verify the Go fleet is live (post-deploy)

```bash
# Supervisor: health + all five workers present in the merged metrics registry
curl -fsS http://127.0.0.1:9090/health        # → 200
curl -fsS http://127.0.0.1:9090/metrics | grep -o 'service="[^"]*"' | sort -u
#   expect: discord-bot, recap, doctrine-worker, vibe-worker, bot-worker

# Status page (own process; survives a supervisor outage)
curl -fsS http://127.0.0.1:${PORT_STATUS:-7008}/health        # → {"status":"ok",...}
curl -fsS http://127.0.0.1:${PORT_STATUS:-7008}/api/status    # JSON; "Background workers" row probes the supervisor

# Confirm the fleet runs the FULL image (not the slim one)
docker inspect -f '{{.Config.Image}}' ${COMPOSE_PROJECT_NAME:-rmhstudios}-supervisor
docker inspect -f '{{.Config.Image}}' ${COMPOSE_PROJECT_NAME:-rmhstudios}-status
#   both → ${PROJECT}-app-full:latest

# Functional spot-checks (from the cutover runbook):
#   - Discord bot shows online
#   - a forced recap posts EXACTLY once (no double-post)
#   - a stale vibe thumbnail regenerates; a bot image post lands in S3
```

Single worker errors/panics are recovered at the job boundary and logged — they
do **not** cycle the process. Watch per-worker
`rmh_job_runs_total{service=...,outcome="panic"|"error"}` for a worker silently
failing inside the shared process; `/health` alone won't reveal a soft hang in
one goroutine.

---

## 6. Rollback

- **Web tier (slim):** re-run the deploy on the previous SHA, or start the
  prior-tagged slim image directly — the SHA tag is the instant rollback handle:
  ```bash
  docker tag ${PROJECT}-app:<old_sha> ${PROJECT}-app:latest
  # then re-run the hotswap to flip Apache back to it
  ```
- **Go fleet (full):** same handle on the full image, then recreate the services:
  ```bash
  docker tag ${PROJECT}-app-full:<old_sha> ${PROJECT}-app-full:latest
  docker compose -p $PROJECT --env-file $ENV_FILE up -d supervisor status
  ```
- **Fall back to the Node workers entirely:** restore the `# FALLBACK (Node):`
  command block for the affected service in `docker-compose.yml` and
  `docker compose up -d <service>` — the Node code path is unchanged and
  immediately runnable. (Full procedure + Helm rollback in the cutover runbook §4.)

**Roll back when:** supervisor crash-looping, DB pool saturation / `pgx` "pool
exhausted", double-posted recaps, or per-worker metrics missing after ~10 min.

---

## 7. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| `exec format error` on supervisor/status | Image built for the wrong arch | Build **on the target host** (ARM64) or with a matching `--platform`; `GOARCH` must match. |
| Supervisor up but a worker silent | Optional secret missing (worker idles by design) | Check `service=` metrics + logs; set the missing key (see cutover runbook §2 env table). Missing required `DATABASE_URL` fails the whole supervisor at startup. |
| Bot images 404 on the site | `S3_*` unset → images written to `LOCAL_STORAGE_DIR` | Set the `S3_*` keys so posts land in R2/S3. |
| "Schema already up to date" but you pushed a migration | New migration not in the image | Confirm the migration file is committed and the image rebuilt; do not assume it applied. |
| Web didn't update after a web change | Hotswap wrongly skipped | The skip only fires on an identical live image ID — verify the slim image actually rebuilt (source change should bust it); check `dc build web` ran clean. |
| Every deploy is a cold (slow) build | Disk below `DEPLOY_MIN_FREE_GB` each time → cache wiped | Raise disk, or lower `BUILD_CACHE_KEEP_GB`/`BUILD_CACHE_CEILING_GB`; check the "Low disk" log. |
| Build dies mid-COPY: "no space left on device" | Disk exhausted despite the valve | Lower the cache targets and/or raise `DEPLOY_MIN_FREE_GB` so the wipe triggers sooner. |

---

## Appendix — quick reference (Compose / VPS)

| Service | Image | Port(s) | Notes |
|---|---|---|---|
| `web` | `${PROJECT}-app` (slim) | blue/green (`$PORT_WEB`) | Node SSR; hotswapped, not compose-managed |
| `socket` | `${PROJECT}-app` (slim) | 7001 | WS hub |
| `rmhbox` | `${PROJECT}-app` (slim) | 7676 | WS hub |
| `rmhtube` | `${PROJECT}-app` (slim) | 7003 | WS hub |
| `supervisor` | `${PROJECT}-app-full` | 9090 (health/metrics) | **5 workers as goroutines** |
| `status` | `${PROJECT}-app-full` | 7008 | own process; survives outages |

Helm/k3s deploy of the fleet is a separate surface — see the cutover runbook §1–§3
and `deploy/README.md`.

# Prod Cutover Runbook — Run the Go Stack in Production

**Date:** 2026-06-22
**Scope:** Move the runtime from the Node services to the Go binaries: a single
`supervisor` process running the five background workers (discord-bot, recap,
doctrine-worker, vibe-worker, bot-worker) as goroutines, a Go `status` service,
and the already-Go WS hubs (gamehub, rmhmusic, rmhtube, rmhbox) + gateway.
**The React SSR `web` tier stays Node** (unchanged).

This runbook is the operational companion to
`docs/superpowers/specs/2026-06-22-goroutine-migration-design.md` and
`docs/superpowers/plans/2026-06-22-goroutine-migration.md`. Two deploy surfaces
exist and are cut over independently:

- **Docker Compose** (builds on the VPS): one image, `supervisor` and `status`
  run the Go binaries; Node commands preserved as `# FALLBACK (Node):` comments.
- **Helm / k3s** (`deploy/helm/rmhstudios-go`): one `supervisor` Deployment +
  standalone `status` Deployment + the Go hubs. The Node chart
  `deploy/helm/rmhstudios` is the rollback.

> **Golden rule:** flip **status first** (lowest blast radius, isolated), then
> the **supervisor**, then the **hubs** one at a time. Health-gate after every
> step. Never flip two surfaces at once.

---

## 0. Pre-cutover gates (do not skip)

1. **Tests green on the release SHA.** From `go-services/`:
   ```
   bazel test //go-services/cmd/... //go-services/internal/... //go-services/pkg/...
   ```
   Expect **16 targets, all PASS**. (OCI image targets live under
   `//go-services/images/...` and are excluded — they are push-gated, see §1.)

2. **Database migration parity.** Confirm the bot-worker's image budget table
   exists in prod. The Go `bot-worker` writes/reads `image_gen_budget`
   (`day TEXT PK`, `count INT`). If the prod DB was migrated from the Node
   schema this already exists; verify with:
   ```
   psql "$DATABASE_URL" -c '\d image_gen_budget'
   ```
   If absent, run the Prisma migration that creates it **before** cutover, or the
   first bot image-budget reservation will error (it is caught and logged, but
   image posting stays disabled until the table exists).

3. **Toolchain pin unchanged.** The Go module stays `go 1.23`; the AWS SDK is
   pinned to its 1.23-compatible line (`aws-sdk-go-v2 v1.36.x`). Do **not** let a
   `go mod tidy` bump the directive to 1.24 — it would diverge from the Bazel Go
   SDK pin (`go_sdk.download(version = "1.23.0")` in MODULE.bazel).

---

## 1. Build & push images

### Compose (VPS)
The Dockerfile gained a `go-builder` stage (`golang:1.23-alpine`, `CGO_ENABLED=0`,
`GOOS=linux GOARCH=$TARGETARCH`) that compiles `./cmd/...` into `/app/bin/`. Build
**on the target host** (or with `--platform` matching it) so `GOARCH` is correct —
a cross-arch build silently produces exec-format-error containers.

```
docker compose build        # builds go-builder → /app/bin/{supervisor,status,...}
```

- The Dockerfile uses `# syntax=docker/dockerfile:1.7-labs` for `COPY --exclude`
  (keeps the Go tree out of the vite layer). **CI caveat:** `docker build
  --call=check` (stable linter channel) falsely flags `COPY --exclude` as an
  unknown flag. The real build honors the syntax directive. If a CI gate runs
  `--call=check` with warnings-as-errors, allowlist that rule.

### Helm / k3s (Bazel OCI images)
The chart references `rmhstudios-go-supervisor` and `rmhstudios-go-status`.

1. **Build & push the new combined base first** (one-time, and on base changes):
   the supervisor runs vibe-worker (needs Chromium) **and** discord-bot (needs
   git/ssh) in one process, so its image uses `@base_chromium_git`
   (`deploy/docker/base-chromium-git.Dockerfile` = alpine + chromium +
   git/openssh). Build and push it to the registry **before** building the
   supervisor image, or the supervisor image pull 403s:
   ```
   docker build -t ghcr.io/<org>/rmhstudios-go-base-chromium-git:latest \
     -f deploy/docker/base-chromium-git.Dockerfile deploy/docker
   docker push ghcr.io/<org>/rmhstudios-go-base-chromium-git:latest
   ```
2. Build & push all service images (with registry creds):
   ```
   bazel run //go-services/images:supervisor_push   # needs the base above
   bazel run //go-services/images:status_push
   # hubs + gateway already had image targets:
   bazel run //go-services/images:gamehub_push   # rmhmusic, rmhtube, rmhbox, gateway likewise
   ```
   `status_image` uses distroless static (no base prerequisite). Confirm
   `bazel build //go-services/images:supervisor_image //go-services/images:status_image`
   assembles before pushing.

---

## 2. Environment / secret parity

The `supervisor` pod/container needs the **union** of all five workers' env.
Source it from the same secret the Node services used (`rmhstudios-secrets` in
Helm `envFrom`; `env_file` in compose). Required keys:

| Worker | Keys |
|---|---|
| common | `DATABASE_URL`, `DB_POOL_SIZE`/`SERVER_DB_POOL_SIZE`, `LOG_LEVEL`, `METRICS_ADDR` (default `:9090`) |
| discord-bot | `DISCORD_BOT_TOKEN` / `DISCORD_ACTIVITY_BOT_TOKEN`, `DISCORD_DEV_GUILD_ID`, `OWNER_ID`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `RMHBOT_WORKTREES_DIR`, `GITHUB_TOKEN`, `GITHUB_REPO` |
| recap | `DISCORD_ACTIVITY_BOT_TOKEN`, `VITE_DISCORD_ACTIVITY_CLIENT_ID` / `DISCORD_ACTIVITY_CLIENT_ID`, `SITE_URL` / `VITE_BETTER_AUTH_URL`, `RECAP_PORT` (7004, internal goroutine binding) |
| vibe-worker | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (baked into the image base), shared `/app/db` PVC/volume for thumbnails |
| bot-worker | `DEEPSEEK_API_KEY`, `INTERNAL_API_URL` / `INTERNAL_API_SECRET` (SSE notify bridge), `BETTER_AUTH_URL`, `S3_BUCKET` / `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION` / `S3_FORCE_PATH_STYLE`, `LOCAL_STORAGE_DIR`, `XAI_API_KEY` / `XAI_IMAGE_MODEL` / `XAI_IMAGE_ENABLED` / `XAI_IMAGE_DAILY_CAP` |
| status (own pod) | `STATUS_PORT` (7008), `STATUS_WEBSITE_URL`, `STATUS_SUPERVISOR_URL`, `STATUS_DATA_DIR`, probe tuning (`STATUS_PROBE_INTERVAL_MS`, etc.), `DATABASE_URL` (optional — enables the DB probe) |

**Idle-safe:** every worker tolerates a missing optional secret and idles rather
than crashing (no `DEEPSEEK_API_KEY`/Discord token → that worker logs a warning
and does nothing). A missing required `DATABASE_URL` fails the supervisor at
startup (correct — the others need it).

**Shared DB pool floor:** the supervisor opens ONE pool for all five workers.
Size `DB_POOL_SIZE` for the sum of their concurrency, not a single worker.

---

## 3. Staged flip (per surface)

### 3a. status (first — isolated, survives outages)
- **Compose:** the `status` service command already points at `/app/bin/status`.
  `docker compose up -d status`.
- **Helm:** the standalone `status` Deployment runs the Go binary;
  `STATUS_SUPERVISOR_URL` is pre-wired to `http://{release}-supervisor:9090/health`.
- **Health gate:** `curl -fsS http://<status>:7008/health` → `{"status":"ok","uptime":...}`;
  load `GET /` (dashboard) and `GET /api/status` (JSON; field names match the Node
  contract). The "Background workers" row probes the supervisor (see §3b).
- **k8s hub rows (resolved):** the `socket`/`rmhbox`/`rmhtube` status rows now
  take full-URL overrides — `STATUS_SOCKET_URL` / `STATUS_RMHBOX_URL` /
  `STATUS_RMHTUBE_URL` — wired like `STATUS_SUPERVISOR_URL`. The Helm `status`
  Deployment sets them to the rendered Service names (`{release}-gamehub` for
  socket, `{release}-rmhbox`, `{release}-rmhtube`), so all rows read correctly
  under k3s. Unset (compose) → the bare compose-DNS defaults are preserved, so
  compose is unaffected.

### 3b. supervisor (the background workers)
- **Compose:** `docker compose up -d supervisor` (replaces the five Node worker
  containers, which are now `# FALLBACK (Node):` comments).
- **Helm:** `helm upgrade --install rmhstudios-go deploy/helm/rmhstudios-go -f deploy/helm/rmhstudios-go/values-prod.yaml`.
- **Health gate:**
  - `curl -fsS http://<supervisor>:9090/health` → 200.
  - `curl -fsS http://<supervisor>:9090/metrics` → per-worker `service="..."`
    labels present for all five workers (merged registry).
  - Functional: Discord bot shows online; a forced recap posts **once** (verify
    no double-post — the standalone recap Deployment was removed precisely so
    recap runs only here); a stale vibe thumbnail regenerates; a bot post appears.
- **Isolation note:** a single worker's transient error/panic is recovered at the
  job boundary and logged (it does not cycle the process); only an *unrecoverable*
  error trips the errgroup → process exits non-zero → orchestrator restarts the
  whole supervisor. The supervisor `/health` is one liveness signal for all five;
  a soft hang in one goroutine will not flip it — watch per-worker `JobRuns`
  metrics for that.

### 3c. hubs (one at a time)
gamehub, rmhmusic, rmhtube, rmhbox already run Go. Flip each behind the gateway,
health-gate (`/health` 200 + a real WS connect) before the next. Leave `gateway`
and `web` last / unchanged.

---

## 4. Rollback (per stage)

- **Compose:** restore the `# FALLBACK (Node):` command block for the affected
  service (uncomment the Node command, comment the Go one) and
  `docker compose up -d <service>`. The Node code path is unchanged and
  immediately runnable. Expected recovery: one container restart (~seconds).
- **Helm:** roll back the whole Go chart to the Node chart (they share the
  `rmhstudios-secrets` Secret and `rmhstudios-data` PVC — no data migration):
  ```
  helm uninstall rmhstudios-go
  helm upgrade --install rmhstudios deploy/helm/rmhstudios -f deploy/helm/rmhstudios/values-prod.yaml
  ```
  The Node chart still defines all five separate background Deployments from the
  Node image. Confirm with `kubectl get deploy` and the §3 health gates.
- **Trigger to roll back:** supervisor crash-looping (`kubectl get pod` restarts
  climbing), DB pool saturation, double-posted recaps, or missing per-worker
  metrics after 10 min.

---

## 5. Post-cutover (24–48h watch + decommission)

- **Watch:** supervisor restart count (should be 0 steady-state); DB pool
  saturation / `pgx` "pool exhausted" logs (raise `DB_POOL_SIZE` if seen);
  per-worker `rmh_job_runs_total{service=...,outcome="panic"|"error"}` for any
  worker silently failing inside the shared process; bot image posts landing in
  S3 (not the local fallback) — confirm `S3_*` is set, else images write to
  `LOCAL_STORAGE_DIR` and the web app 404s them.
- **Decommission the Node workers** only after 48h clean: remove the
  `# FALLBACK (Node):` blocks from `docker-compose.yml`, and (optionally) drop the
  Node background Deployments from the rollback chart once you accept losing the
  one-step rollback. Keep the Node `web` tier.

---

## Appendix — quick reference

| Service | Port | Image | Notes |
|---|---|---|---|
| supervisor | 9090 (health/metrics) | `rmhstudios-go-supervisor` (`base_chromium_git`) | 5 workers as goroutines |
| status | 7008 | `rmhstudios-go-status` (distroless static) | own process; survives outages |
| gamehub | 7001 | `rmhstudios-go-gamehub` | WS hub (was `socket`) |
| rmhmusic | 7002 | `rmhstudios-go-rmhmusic` | WS hub |
| rmhtube | 7003 | `rmhstudios-go-rmhtube` | WS hub |
| rmhbox | 7676 | `rmhstudios-go-rmhbox` | WS hub |
| gateway | 7005 | `rmhstudios-go-gateway` | edge/BFF |
| web | — | Node (unchanged) | React SSR |

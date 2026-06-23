# Goroutine Supervisor + Straggler Ports + Reversible Runtime Cutover

**Date:** 2026-06-22
**Branch:** `goroutine-migration-eval`
**Status:** Approved design — ready for implementation plan

## Problem

The `go-services/` tree already contains Go ports of 9 services (`discord-bot`,
`recap`, `doctrine-worker`, `vibe-worker`, `gamehub`, `rmhmusic`, `rmhtube`,
`rmhbox`, `gateway`), but the runtime (`docker-compose.yml` and the PR #121 Helm
chart) still runs the **Node** versions for everything. Two services were never
ported at all: `status` and `bot-worker`. Each Go worker is also its own OS
process today; we want the option to run the background workers as **goroutines
in a single supervisor process** to cut container count, share one `pgx` pool,
and (on a single node) share in-memory state without a Redis backplane.

## Goals

1. **Goroutine supervisor** — one Go binary that runs the four background
   workers + the newly-ported `bot-worker` as goroutines under an `errgroup`.
2. **Port the two stragglers** — `bot-worker` (into the supervisor) and `status`
   (Go, but kept as its own isolated process).
3. **Reversible runtime cutover** — point `docker-compose.yml` and the Helm
   chart at the Go binaries / supervisor, keeping the Node path as a documented
   reversible fallback.

## Non-goals

- Rewriting the React SSR **web** tier (stays JS — prior architectural decision).
- Consolidating the WebSocket hubs (`gamehub`, `rmhmusic`, `rmhtube`, `rmhbox`)
  or `gateway` into the supervisor — they stay separate processes to preserve
  independent (Stage 2 HPA) scaling.
- Building the multi-node / multi-region scaling layers (Redis backplane,
  PgBouncer, read replicas) — tracked separately in the infra roadmap.

## Decisions (locked with user 2026-06-22)

| Question | Decision |
|---|---|
| Supervisor scope | **Background workers only**: `discord-bot`, `recap`, `doctrine-worker`, `vibe-worker`, `bot-worker`. Hubs + gateway stay separate. |
| `status` | Port to Go, **keep as its own process** (must survive when the rest is down). |
| `bot-worker` | Port to Go, **run inside the supervisor**. |
| Runtime wiring | **Compose + Helm**, with the Node path kept as a reversible fallback. |

## Architecture

```
┌─ supervisor (1 process, errgroup) ──────────┐   ┌─ separate processes ─┐
│  discord-bot   recap   doctrine-worker       │   │ gamehub  rmhmusic    │
│  vibe-worker   bot-worker (newly ported)     │   │ rmhtube  rmhbox      │
│  one db pool · one metrics registry          │   │ gateway  status(new) │
│  /health aggregates all · /metrics merged    │   └──────────────────────┘
└──────────────────────────────────────────────┘
```

### Foundational refactor: extract `Run`

Today each worker's lifecycle (config load, db open, start loop, wait for
signal, shutdown) lives inline in `cmd/X/main.go`. We extract each worker's
body into a reusable entrypoint in its `internal/` package:

```go
// internal/<worker>/run.go
type Deps struct {
    DB      *db.DB
    Logger  *log.Logger
    Metrics *telemetry.Registry
    Cfg     config.Common
}

// Run blocks until ctx is cancelled or an unrecoverable error occurs.
func Run(ctx context.Context, d Deps) error { ... }
```

- `cmd/supervisor/main.go` opens **one** db pool + **one** metrics registry and
  calls each worker's `Run` under `golang.org/x/sync/errgroup` (already an
  indirect dependency; promote to direct).
- The existing `cmd/discord-bot`, `cmd/recap`, `cmd/doctrine-worker`,
  `cmd/vibe-worker` become **thin wrappers** that build `Deps` and call the same
  `Run`. This preserves standalone execution (per-service debugging and the
  reversible fallback) with zero behavior drift.

## Components

### 1. `cmd/supervisor/main.go`
- `config.LoadCommon("supervisor")`; open shared `db.DB` via
  `db.WaitForReachable`; build one `telemetry.New("supervisor")` registry.
- Start one HTTP server on `MetricsAddr` serving `/health` and `/metrics`.
  `/health` returns `ok` only if every worker reports live (readiness map keyed
  by worker name); `/metrics` exposes the merged registry.
- `errgroup.WithContext`; `g.Go(func() error { return botworker.Run(ctx, deps) })`
  for each of the 5 workers.
- SIGINT/SIGTERM → `cancel()` → `g.Wait()` bounded by a 30s shutdown deadline
  (mirrors `httpx` graceful-shutdown today). Non-nil group error → process exits
  non-zero so the orchestrator restarts the supervisor.

### 2. `internal/botworker/` (new port of `server/bot-worker/index.ts`)
- Maintains a pool of AI-generated bot users (DeepSeek-invented name/handle/bio,
  sourced avatar, private persona) and posts in-voice on a per-bot cadence.
- Raw `pgx` (matching the other ports), not Prisma.
- Idles harmlessly when `DEEPSEEK_API_KEY` is unset (parity with Node).
- Exposes no client HTTP — health/metrics come from the supervisor.

### 3. `internal/status/` + `cmd/status/` (new port of `server/status/index.ts`)
- Periodically probes every other service's `/health`; serves the
  self-contained HTML dashboard, `GET /api/status` (JSON snapshot + uptime
  history), and `GET /health`.
- Probes the **web** app via its public URL (`https://rmhstudios.com`) so status
  reflects what real users hit, exactly as the Node version does.
- Stays its own process / container so the status page survives a stack outage.

### 4. Runtime wiring (reversible)
- `docker-compose.yml`: the four background services + `bot-worker` point at the
  supervisor binary; `status` points at the new Go binary. Node `command:`
  entries preserved as a reversible fallback (commented or `profiles`-gated).
- PR #121 Helm chart: corresponding Deployments updated to the Go images /
  supervisor; values flag (e.g. `runtime: go|node`) toggles back to Node.

## Error handling & shared state

- **Failure isolation trade-off (explicit):** consolidation means one worker's
  fatal error restarts all 5. `Run` functions therefore **return errors instead
  of `log.Fatal`**. Transient per-worker errors (e.g. a flaky DeepSeek call) are
  logged and retried *inside* the worker; only unrecoverable errors propagate to
  the errgroup and cycle the supervisor.
- **Shared pool:** one `pgx` pool sized for the sum of workers via
  `DB_POOL_SIZE`; document the new floor.
- **Merged metrics:** single Prometheus registry; every metric carries a
  `service` label per worker so the merged `/metrics` stays unambiguous.
- **Graceful shutdown:** SIGINT/SIGTERM → `cancel()` → `errgroup.Wait()` with a
  30s deadline.

## Testing

- Existing `pkg/realtime` and worker tests stay green (no behavior drift from the
  `Run` extraction — wrappers are thin).
- New unit tests for `internal/botworker` (persona generation paths, idle-without-key,
  paced posting) and `internal/status` (probe aggregation, JSON snapshot, HTML render).
- One **supervisor test**: all 5 `Run`s start; a single worker returning an error
  cancels the group and `Wait()` returns that error within the deadline.
- Go `e2e/` harness gains a supervisor smoke check (boots supervisor, hits
  `/health`, asserts all workers live).

## Deliverable: prod cutover runbook

After implementation, produce an ordered runbook to actually run Go in prod:
build & push the Go/supervisor images, env-var parity check against the Node
services, flip one service at a time behind the gateway with a health gate after
each, and explicit rollback steps (the reversible Node fallback) at every stage.

## Rollout sequence (implementation order)

1. Extract `Run` for the four existing background workers; convert their `cmd`
   mains to thin wrappers; keep tests green.
2. Port `bot-worker` → `internal/botworker` (+ standalone `cmd/bot-worker` wrapper).
3. Build `cmd/supervisor` over the 5 `Run`s (errgroup, shared pool, merged
   health/metrics).
4. Port `status` → `internal/status` + `cmd/status` (separate process).
5. Wire `docker-compose.yml` + Helm to the Go binaries / supervisor, Node
   fallback preserved.
6. Tests + e2e smoke; write the prod cutover runbook.

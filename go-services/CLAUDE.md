# go-services/ — Go microservice fleet

> Scope: guidance for working inside `go-services/`. Repo-wide context:
> [`/CLAUDE.md`](../CLAUDE.md). Node originals: [`server/CLAUDE.md`](../server/CLAUDE.md).
> Runtime topology & deploy: [`docs/architecture.md`](../docs/architecture.md).
> Operator runbook (authoritative for build/deploy):
> [`docs/go-migration/go-backend-and-bazel.md`](../docs/go-migration/go-backend-and-bazel.md).

Go module `github.com/rmhstudios/rmh-go` (Go 1.23). The module root is
`go-services/`, but the **Bazel workspace root is the repo root**
(`MODULE.bazel` at `/`). Where docs and code disagree, **the code wins** —
`go-services/README.md` and `FOUNDATION.md` predate the Bazel migration and
the newer services.

## Production reality (don't over-claim the migration)

Production is a **hybrid** (see `docker-compose.yml` at repo root):

- **Go is authoritative for:** the five background workers — discord-bot,
  recap, doctrine-worker, vibe-worker, bot-worker — consolidated as goroutines
  in one `supervisor` binary (metrics :9090); the `status` dashboard (7008);
  and `assets` (7007, off the main user path under Compose).
- **Node is still authoritative for:** web SSR (7005), the realtime hubs —
  socket-server (7001), rmhbox (7676), rmhtube (7003), rmhmusic (inside
  socket-server) — and ladder-worker. Apache routes all user traffic to Node
  ports; the Go `gateway` is **not** in the production request path.
- The full-Go topology (gateway fronting Go hubs + Redis backplane) is
  deployable via the Helm chart (`deploy/helm/rmhstudios-go/`) or
  `go-services/docker-compose.go.yml`, but that cutover has not been done.
- In production the Go binaries are built by the **root `Dockerfile`'s
  `go-builder` stage** (plain `go build` into `/app/bin/`, copied into the
  `runner-full` image) — not by Bazel. Bazel is the CI test gate and the
  k3s/registry image path.

## Layout

```
go-services/
  cmd/<svc>/main.go       one main package per binary (15)
  internal/<svc>/         each service's private implementation
  pkg/                    shared libraries (12 packages, API doc: FOUNDATION.md)
  e2e/                    end-to-end tests (build tag `e2e`; real ws clients + Postgres)
  images/BUILD.bazel      hand-maintained OCI image targets (12 images)
  Dockerfile, Makefile    LEGACY docker-build path (used by deploy/deploy-go.sh)
  docker-compose.go.yml   parallel full-Go stack for local/staging
```

### Services (cmd/)

| Service | Port (default) | Transport | Replaces (Node) | Status |
|---|---|---|---|---|
| `gateway` | `PORT_WEB` 7005 | HTTP + WS reverse proxy | web edge | complete; not in prod path; `WEB_UPSTREAM` default is wrong for compose (override needed) |
| `gamehub` | `SOCKET_PORT` 7001 | WS `/socket/` | socket-server | Kowloon Knockout fully ported; other games = generic `RelayGroup` framework, registry currently empty |
| `rmhmusic` | `RMHMUSIC_PORT` 7002 | WS `/rmhmusic-ws/` | rmhmusic | faithful port; auth required |
| `rmhtube` | `RMHTUBE_PORT` 7003 | WS `/rmhtube-ws/` | rmhtube | faithful port; DB room restore |
| `rmhbox` | `RMHBOX_PORT` 7676 | WS `/rmhbox-ws/` | rmhbox | lobby FSM + coordinator complete; 1 of 9 minigames ported (rhyme-time), others stub |
| `recap` | `RECAP_PORT` 7004 | HTTP (health) | recap | fully ported (Lights Out → Discord) |
| `doctrine-worker` | — | worker | doctrine-worker | fully ported (mulberry32 bit-exact puzzle gen, Sahur, decay) |
| `vibe-worker` | — | worker | vibe-worker | fully ported (chromedp thumbnails; needs Chromium in image) |
| `discord-bot` | — | worker | discord-bot | `/chat` + full Alex tamagotchi; idles without token |
| `bot-worker` | — | worker | bot-worker | ported; idles without `DEEPSEEK_API_KEY` |
| `assets` | `ASSETS_PORT` 7007 | HTTP | Apache off-disk CDN | range-aware S3/R2 streaming for `/library /music /models /sprites` |
| `status` | `STATUS_PORT` 7008 | HTTP | server/status | fully ported dashboard + `/api/status` |
| `supervisor` | `METRICS_ADDR` :9090 | — | (consolidation) | runs the 6 workers (discord-bot, recap, doctrine-worker, vibe-worker, bot-worker, streak-saver) as goroutines under an errgroup |
| `ledger` | `LEDGER_ADDR` :7100 | HTTP `/ledger/v0/*` | none (net-new) | implemented, **not integrated**: no BUILD.bazel, no image, not deployed |

Do not confuse **`ledger`** (Go artifact/provenance store) with
**`ladder-worker`** (Node RMHLadder job cron) — the latter has NOT been ported.

### Shared packages (pkg/)

| pkg | Provides |
|---|---|
| `config` | env config: `LoadCommon(service)` → `{ServiceName, Env, DatabaseURL, DBPoolSize, RedisURL, MetricsAddr, LogLevel}`; `GetString/Int/Bool/Duration/CSV`. Never read env ad-hoc. |
| `log` | slog JSON wrapper matching the Node logger's field names (`timestamp`); `New(service, level)`, `.Fatal()` only at boot |
| `db` | pgxpool: `Open(ctx, dsn, poolSize)`, `WaitForReachable(ctx, dsn, 10, 5s)`; typed models in `models.go` (column casing verbatim from Prisma) |
| `auth` | Better Auth **session validation** (see below); `NewValidator(pool)`, `ValidateSession`, `ResolveDiscordAccount`, `ErrUnauthenticated` |
| `httpx` | `Health`, `WriteJSON`, `SessionToken` extraction, graceful `Server.Run`, `SignalContext`, `ServeMetrics` |
| `ratelimit` | in-memory sliding window keyed `(conn, event)`, bounded + GC'd |
| `telemetry` | Prometheus metrics per service; `MergedHandler` for supervisor |
| `events` | pub/sub `Bus`: `Local` (in-proc) or `Redis`, chosen by `FromURL` — empty `REDIS_URL` ⇒ Local |
| `realtime` | the WebSocket framework: `Hub`, `Room`, `Conn`, `Envelope`, `GraceTimers` |
| `objectstore` | range-aware S3/MinIO reader (only place importing the AWS SDK) |
| `worker` | uniform worker contract: `RunFunc(ctx, Deps)`, `RunStandalone`; workers return errors, **never** `log.Fatal` inside `Run` |

## Auth model

Go never issues sessions — Better Auth (Node) does. Go **validates** them
directly against the shared `session` table (`pkg/auth`):

1. Token from `Authorization: Bearer`, or cookie
   `better-auth.session_token` / `__Secure-...` (cookie value is
   `<token>.<signature>` — only the part before the dot is looked up), or
   `?token=` for WS.
2. `SELECT ... FROM "session" s JOIN "user" u ...  WHERE s."token" = $1` →
   `Identity{UserID, Name, Image, IsAdmin}`; expired/unknown ⇒
   `ErrUnauthenticated`.
3. The gateway **strips all inbound `X-Rmh-*` headers** then injects
   `X-Rmh-User-Id/-User-Name/-Is-Admin` for upstreams (anonymous passes
   through; SSR does its own auth).

## Realtime framework (pkg/realtime)

The wire protocol is **not Socket.IO**: plain JSON
`Envelope{event, payload, seq, ts}` over gorilla WebSocket. `seq` is
server-assigned per room (snapshot + seq-stamped deltas, like the Node hubs).
A thin TS client adapter is required before pointing the frontend at Go hubs.

- One `Hub` per service; register handlers with `On`/`OnConnect`/
  `OnDisconnect` **before** mounting `ServeWS` (dispatch map is lock-free).
- `Room` tracks local members + monotonic seq; `Hub.Broadcast` delivers
  locally and publishes to the `events.Bus`; rooms subscribe to
  `rt:room:<id>` on Redis.
- `Conn`: read/write pumps, 256-msg send buffer, 1 MiB frames, ping/pong;
  slow consumers are dropped rather than wedging the room.
- `GraceTimers`: keyed cancellable delayed actions (disconnect grace, room GC).
- **Cross-replica origin (FIXED):** `pkg/events` now frames each publish in a
  `wireEnvelope{Origin, Payload}` carrying the TRUE publisher's origin, and
  `Subscribe` decodes that origin instead of stamping the local replica's, so
  `room.go`'s self-origin skip no longer drops cross-replica fan-out. (Earlier
  revisions of this doc described this as an open bug — it is resolved in
  `pkg/events/events.go`.) The Go WS fleet still isn't in the production request
  path regardless (Apache routes realtime to the Node hubs).

**Adding a realtime game:** simple 1v1 host-authoritative → register a
`gamehub.RelayGroup` (`internal/gamehub/relay.go`) in `buildRelayRegistry`.
Room/lobby games → follow `internal/rmhtube` / `internal/rmhbox` (per-room
mutex, `broadcastAction` seq deltas, snapshot on join). Skeleton in
`FOUNDATION.md`.

## Conventions

- Binary in `cmd/<svc>/main.go` (thin); implementation in `internal/<svc>/`
  with a `Manager` (`NewManager` + `Register` + `Start/Stop`). Workers are a
  `RunFunc` wired both into `cmd/<svc>` (standalone) and `cmd/supervisor`.
- Config via `pkg/config` only; ports via `config.GetString("<SVC>_PORT", default)`.
- Structured logging via `pkg/log` key/value pairs.
- DB via raw pgx + `pkg/db`; quote camelCase columns exactly as Prisma names
  them (`"userId"`, `"expiresAt"`).
- Ports of Node behavior must be faithful; out-of-scope gaps get a
  **compiling** `// TODO(migration):` stub, never broken code.
- **After adding/moving `.go` files: run `make gazelle`**
  (= `bazel run //:gazelle`) from the repo root to regenerate BUILD files.
  Third-party deps: edit `go-services/go.mod`, then gazelle picks them up via
  the root `MODULE.bazel` `go_deps` extension. Hand-maintained exceptions:
  `e2e/BUILD.bazel` (tag `manual`) and `images/BUILD.bazel`.

## Build / test / deploy

From the **repo root**:

```bash
make gazelle        # regenerate BUILD files (after adding Go files)
make test           # bazel test --build_tests_only //go-services/... (+ vitest)
make build          # bazel build //go-services/cmd/...
make test-e2e       # go-services/scripts/e2e/run.sh — throwaway Postgres + real ws clients
make images TAG=…   # OCI images via bazel (go_service_image macro)
```

- CI: `.github/workflows/go-microservices.yml` — Bazel unit gate + Postgres
  e2e + `helm lint`/`template`. Path-filtered to `go-services/**` and the
  Helm chart.
- Images: `bazel/defs.bzl#go_service_image` → `<svc>_image/_load/_push`
  targets in `images/BUILD.bazel`; distroless base, except vibe-worker
  (chromium), discord-bot (git), supervisor (chromium+git). No image for
  bot-worker (lives in supervisor) or ledger.
- k3s deploy: `deploy/deploy-go.sh` (legacy per-service Dockerfile) or
  `make prod` (Bazel + registry) + Helm chart `deploy/helm/rmhstudios-go/`.
  In Helm, recap runs **only** inside supervisor (a standalone recap would
  double-post to Discord).
- Production Compose path: root `Dockerfile` `go-builder` stage → binaries in
  the `rmhstudios-app-full` image (see `docs/architecture.md`).

## Gotchas

1. `go-services/README.md`, `FOUNDATION.md`, and the migration PDF describe
   the original 9-service scope and the Docker build — the fleet is now 13+
   binaries built via Bazel/root-Dockerfile. Trust code +
   `docs/go-migration/go-backend-and-bazel.md`.
2. The legacy `go-services/Makefile` `SERVICES` list and the root `Makefile`
   image loop both lag the real service set — check `images/BUILD.bazel` for
   what's actually buildable.
3. `cmd/ledger` was never integrated (no BUILD.bazel/image, not deployed) and
   was removed in the rewrite reap (R0-T6). The `ledger_*` schema tables remain.
4. Discord bot commands are `/chat` + the Alex tamagotchi; there is no
   `/rmhbot` command (README claim is stale).
5. Cross-replica fan-out via `pkg/events` is fixed (see Realtime above); the Go
   WS fleet is still not in the production request path.

# go-services/ — Go microservice fleet

> Scope: guidance for working inside `go-services/`. Repo-wide context:
> [`/CLAUDE.md`](../CLAUDE.md). Node originals: [`server/CLAUDE.md`](../server/CLAUDE.md).
> Runtime topology & deploy: [`docs/architecture.md`](../docs/architecture.md).
> Operator runbook (authoritative for build/deploy):
> [`docs/go-migration/go-backend-and-bazel.md`](../docs/go-migration/go-backend-and-bazel.md).

Go module `github.com/rmhstudios/rmh-go` (`go 1.26.8`, toolchain `go1.27.1` — see `go.mod`). The module root is
`go-services/`, but the **Bazel workspace root is the repo root**
(`MODULE.bazel` at `/`). Where docs and code disagree, **the code wins** —
`go-services/README.md` and `FOUNDATION.md` predate the Bazel migration and
the newer services.

## Production reality (don't over-claim the migration)

Production is a **hybrid** (see `docker-compose.yml` at repo root):

- **Go is authoritative for:** the `status` dashboard (7008) and `assets`
  (7007, off the main user path under Compose). Nothing else.
- **Node is authoritative for:** web SSR (7005), the realtime hubs —
  socket-server (7001), rmhbox (7676), rmhtube (7003) — and every background
  worker: ladder-worker, homes-worker and `jobs`, which also hosts the Discord
  bot (`server/discord-bot/`). Apache routes all user traffic to Node ports.
- **The Go workers are gone (D3).** Every one (streak-saver, recap, doctrine,
  bot-worker, vibe-worker, and last the Discord bot) was ported to the Node
  `jobs` worker, and the Go copies were deleted with what only existed to run
  them: the Go bot package and its standalone command, `cmd/supervisor` (and its
  compose service and container), `pkg/worker`, `pkg/db`, the worker metrics in
  `pkg/telemetry`, the git base image and its Bazel images. There is no
  fallback to keep in step.
- **The full-Go realtime topology was REMOVED in the rewrite (design §5.2):**
  the `gateway`, the Go hubs (gamehub/rmhbox/rmhtube/rmhmusic), `pkg/realtime`/
  `pkg/events`, the Helm charts, the k8s manifests, and the e2e suite are all
  gone — they never served production traffic and duplicated the Node hubs.
  Recover from git history (tag `pre-rewrite-go-realtime`) if ever revived.
- In production the Go binaries are built by the **root `Dockerfile`'s
  `go-builder` stage** (plain `go build ./cmd/...` into `/app/bin/`, copied
  into the `runner-full` image) — not by Bazel. Bazel is only the CI unit-test
  gate (`go-microservices.yml`).

## Layout

```
go-services/
  cmd/<svc>/main.go       one main package per binary (status + assets)
  internal/<svc>/         each service's private implementation
  pkg/                    shared libraries (config/auth/httpx/ratelimit/telemetry/objectstore/oncall/log)
  images/BUILD.bazel      hand-maintained OCI image targets (status/assets)
  Dockerfile, Makefile    standalone docker-build path for the service images
```

### Services (cmd/)

| Service | Port (default) | Transport | Replaces (Node) | Status |
|---|---|---|---|---|
| `assets` | `ASSETS_PORT` 7007 | HTTP | Apache off-disk CDN | range-aware S3/R2 streaming for `/library /music /models /sprites` |
| `status` | `STATUS_PORT` 7008 | HTTP | server/status | `/api/status` is byte-compatible with the Node original; the dashboard is the site's own liquid-globe design (`internal/status/dashboard.go`); incidents, maintenance, the admin API, feeds, badges, `/metrics` and a Statuspage-compatible `/api/v2` are documented in [`docs/status-page.md`](../docs/status-page.md) |

The Discord bot (Alex `/chat`, the tamagotchi, `/sohumtracker`) runs only in the
Node `jobs` worker. `status` watches the Node jobs through pg-boss's own tables:
B06 job freshness (`nodeJobLimits`), B07 from the bot's
`discord-bot.gateway-heartbeat` queue (a per-minute job that completes only while
the gateway is READY; B07 fires when the last completed one is over 5 minutes old
while the queue is scheduled), and A19 straight from `doctrine_puzzle`
(`internal/status/workers.go`, readers in `cmd/status/dbprobe.go`). The old
supervisor `/metrics` scrape and its A11 worker-down alarm went with the
supervisor. The dead `internal/ledger` artifact store and its `ledger_*` tables
were deleted (audit C3).

### Shared packages (pkg/)

| pkg | Provides |
|---|---|
| `config` | env config: `LoadCommon(service)` → `{ServiceName, Env, DatabaseURL, RedisURL, MetricsAddr, LogLevel}`; `GetString/Int/Bool/Duration/CSV`. Never read env ad-hoc. |
| `log` | slog JSON wrapper matching the Node logger's field names (`timestamp`); `New(service, level)`, `.Fatal()` only at boot |
| `auth` | Better Auth **session validation** (see below); `NewValidator(pool)`, `ValidateSession`, `ResolveDiscordAccount`, `ErrUnauthenticated` |
| `httpx` | `Health`, `WriteJSON`, `SessionToken` extraction, graceful `Server.Run`, `SignalContext` |
| `ratelimit` | in-memory sliding window keyed `(conn, event)`, bounded + GC'd |
| `telemetry` | Prometheus metrics per service (`assets` /metrics) |
| `objectstore` | range-aware S3/MinIO reader (only place importing the AWS SDK) |
| `oncall` | signed alarm client for the off-box watchdog (`status` sends heartbeats and A19/B06/B07) |

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

The Go services here are `status` + `assets`; none terminate
user-facing WebSocket traffic, so there is no WS auth handshake in this fleet.
Realtime auth lives in the **Node** hubs (`server/CLAUDE.md`). The old Go
`gateway` that injected trusted `X-Rmh-*` headers was removed with the Go
realtime topology.

> **Removed:** `pkg/realtime` (the gorilla-WebSocket `Hub`/`Room`/`Conn`
> framework) and `pkg/events` (the Redis/local pub-sub `Bus`), along with the
> `gateway` and the Go hubs (`internal/gamehub`/`rmhtube`/`rmhbox`/`rmhmusic`),
> were deleted in the rewrite (design §5.2) — they never served production
> traffic and duplicated the Node hubs. Older revisions of this doc documented
> that framework and an "adding a realtime game" recipe; recover them from git
> history (tag `pre-rewrite-go-realtime`) if the topology is ever revived.

## Conventions

- Binary in `cmd/<svc>/main.go` (thin); implementation in `internal/<svc>/`.
  New background work is a pg-boss cron in the Node `jobs` worker, not a Go
  worker (D3/D4).
- Config via `pkg/config` only; ports via `config.GetString("<SVC>_PORT", default)`.
- Structured logging via `pkg/log` key/value pairs.
- DB via raw pgx (`status` keeps its own small probe pool); quote camelCase
  columns exactly as Prisma names them (`"userId"`, `"expiresAt"`).
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
make build          # bazel build //go-services/cmd/... + frontend bundle
make images         # build + load every service image into Docker (Bazel)
```

- CI: `.github/workflows/go-microservices.yml` — Bazel unit gate only
  (`bazelisk test --build_tests_only //go-services/...`), path-filtered to
  `go-services/**`. The old Postgres e2e job and the `helm lint`/`template` job
  were removed with the Go realtime/Helm topology (design §5.2).
- Images: `bazel/defs.bzl#go_service_image` → `<svc>_image/_load/_push`
  targets in `images/BUILD.bazel` (`status`, `assets`); distroless base. The git
  base image went with the Go bot.
- **Production Compose path (what actually ships):** root `Dockerfile`
  `go-builder` stage (`go build ./cmd/...`) → binaries in the
  `rmhstudios-app-full` image (see `docs/architecture.md`). The k3s/Helm deploy
  (`deploy/deploy-go.sh`, `deploy/helm/`) was removed with the Go realtime
  topology — Bazel now only gates CI tests + builds local images.

## Gotchas

1. `go-services/README.md` and `FOUNDATION.md` were written for the original
   9-service Helm/realtime design and still mention the removed hubs/gateway and
   `pkg/events`/`pkg/realtime` (and the supervisor/worker skeleton) — the real
   fleet is **2 binaries** under `cmd/` (assets, status). Trust the code + this file.
2. The `go-services/Makefile` and root `Makefile` `SERVICES` lists are
   `status assets`; `images/BUILD.bazel` is the truth for what Bazel builds.
3. There is no `cmd/ledger`: the old `internal/ledger` package and the
   `ledger_*` tables were removed (audit C3).
4. The Discord bot is not here any more: it is `server/discord-bot/` in the Node
   `jobs` worker ([`docs/alex-tamagotchi/`](../docs/alex-tamagotchi/README.md)
   for the pet). Recover the Go original from git history if ever needed.

## Before you commit Go changes

`pnpm check:consistency` (repo `CLAUDE.md` → "The commit gate") flags Go
sources committed without a `BUILD.bazel` update, but the Go fleet's own gate
is Bazel:

- [ ] `make gazelle` run after adding, renaming or moving any `.go` file — the
      `BUILD.bazel` changes belong in the same commit.
- [ ] `make test` green (`bazelisk test --build_tests_only //go-services/...`,
      which is exactly what `go-microservices.yml` runs).
- [ ] Config through `pkg/config`, logging through `pkg/log`, session
      validation through `pkg/auth` against the shared `session` table — a
      service that reads `os.Getenv` or prints straight to stdout is the drift
      those packages exist to prevent.
- [ ] A new binary is wired where it actually ships: the root `Dockerfile`
      `go-builder` stage builds `./cmd/...` for the Compose path, and
      `images/BUILD.bazel` is the truth for what Bazel can build.

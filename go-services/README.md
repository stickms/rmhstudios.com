# rmhstudios-go — Go worker fleet

The Go side of rmhstudios.com's **hybrid runtime**. In production, Go runs the
background-worker tier, the status dashboard, and the asset streamer; **Node**
still runs the web SSR tier and every user-facing realtime hub (see
[`../server/CLAUDE.md`](../server/CLAUDE.md)).

> **Canonical guide:** [`CLAUDE.md`](./CLAUDE.md) in this directory. This README
> is a short orientation. Where they disagree, **the code and `CLAUDE.md` win** —
> and note that `FOUNDATION.md` documents some `pkg/` packages that were removed
> (`pkg/events`, `pkg/realtime`).

Go module `github.com/rmhstudios/rmh-go` (Go 1.23). Module root is `go-services/`;
the **Bazel workspace root is the repo root** (`MODULE.bazel` at `/`).

## What runs in production

| Binary (`cmd/`) | Port | Role |
|---|---|---|
| `supervisor` | 9090 (metrics) | Runs six background workers as goroutines under an errgroup: `discord-bot`, `recap`, `doctrine-worker`, `vibe-worker`, `bot-worker`, `streak-saver` |
| `status` | 7008 | Standalone health dashboard (`/`, `/api/status`) that probes every service; designed to survive outages |
| `assets` | 7007 | Range-aware S3/R2 streaming CDN for `/library` `/music` `/models` `/sprites` |

The other `cmd/` binaries (`bot-worker`, `discord-bot`, `doctrine-worker`,
`recap`, `vibe-worker`) exist so a worker can be run standalone, but in
production they run **inside `supervisor`**. `internal/streaksaver` has no
standalone binary (supervisor-only), and `internal/ledger` is implemented but
wired into no binary — not built, not deployed.

> **Removed in the rewrite (design §5.2):** the earlier full-Go realtime
> topology — a `gateway` fronting Go `gamehub`/`rmhbox`/`rmhtube`/`rmhmusic`
> hubs with a Redis backplane, the `pkg/events` + `pkg/realtime` packages, and
> the Helm/k3s charts — never served production traffic and duplicated the Node
> hubs. Recover from git history (tag `pre-rewrite-go-realtime`) if ever revived.

## Layout

```
go-services/
  cmd/<svc>/main.go     one main package per binary (workers + status + assets)
  internal/<svc>/       each service's private implementation
  pkg/                  shared libraries: config, log, db, auth, httpx,
                        ratelimit, telemetry, objectstore, worker
  images/BUILD.bazel    hand-maintained OCI image targets (Bazel)
  Dockerfile, Makefile  legacy standalone docker-build path (superseded by the
                        root Dockerfile's go-builder stage in production)
```

## Develop, build, test

From the **repo root** (Bazel workspace root):

```bash
make gazelle    # regenerate Go BUILD.bazel files after adding/moving .go files
make build      # bazel build //go-services/cmd/... + frontend bundle
make test       # bazel test //go-services/... (+ vitest)
make images     # build + load every service image into Docker
```

- **CI:** `.github/workflows/go-microservices.yml` runs the Bazel unit gate only
  (`bazelisk test --build_tests_only //go-services/...`), path-filtered to
  `go-services/**`.
- **Production build:** the binaries that ship are compiled by the **root
  `Dockerfile`'s `go-builder` stage** (`go build ./cmd/...`) into the
  `rmhstudios-app-full` image — Bazel is only the CI test gate and a local image
  builder. See [`../docs/architecture.md`](../docs/architecture.md).

## Conventions

Config via `pkg/config`, logging via `pkg/log`, DB via raw pgx + `pkg/db`
(quote camelCase columns exactly as Prisma names them), sessions validated via
`pkg/auth` against the shared `session` table. Workers implement the `pkg/worker`
`RunFunc` contract and return errors rather than calling `log.Fatal`. Full
detail — including the `pkg/` API and the supervisor worker registry — is in
[`CLAUDE.md`](./CLAUDE.md).

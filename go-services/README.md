# rmhstudios-go — Go services

The Go side of rmhstudios.com's **hybrid runtime**. In production, Go runs the
status dashboard and the asset streamer; **Node** runs the web SSR tier, every
user-facing realtime hub and every background worker (see
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
| `status` | 7008 | Standalone health dashboard (`/`, `/api/status`) that probes every service; designed to survive outages |
| `assets` | 7007 | Range-aware S3/R2 streaming CDN for `/library` `/music` `/models` `/sprites` |

There are no Go workers: the last one, the Discord bot, runs in the Node `jobs`
worker (`server/discord-bot/`), and its supervisor was deleted with it (D3).

> **Removed in the rewrite (design §5.2):** the earlier full-Go realtime
> topology — a `gateway` fronting Go `gamehub`/`rmhbox`/`rmhtube`/`rmhmusic`
> hubs with a Redis backplane, the `pkg/events` + `pkg/realtime` packages, and
> the Helm/k3s charts — never served production traffic and duplicated the Node
> hubs. Recover from git history (tag `pre-rewrite-go-realtime`) if ever revived.

## Layout

```
go-services/
  cmd/<svc>/main.go     one main package per binary (status + assets)
  internal/<svc>/       each service's private implementation
  pkg/                  shared libraries: config, log, auth, httpx,
                        ratelimit, telemetry, objectstore, oncall
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

Config via `pkg/config`, logging via `pkg/log`, DB via raw pgx (quote
camelCase columns exactly as Prisma names them). Full detail — including the
`pkg/` API — is in [`CLAUDE.md`](./CLAUDE.md).

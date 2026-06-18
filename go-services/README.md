# rmhstudios-go — Go microservices fleet

A complete Go rewrite of the rmhstudios.com realtime/worker tier, deployable
alongside the existing React SSR app. This is **Stage 4** of the scaling roadmap
recorded in PR #121 (which itself deliberately *declined* a Go rewrite at the
time) — implemented here in full, behind the same Helm/Secret conventions so it
slots into that infrastructure rather than replacing it.

> **Honest scope.** The React SSR tier (TanStack Start) and Better Auth session
> *issuance* remain JavaScript — they cannot be ported without rewriting the
> entire frontend, and there is no Go equivalent for Better Auth's OAuth/cookie
> stack. Every Go service *validates* Better Auth sessions directly against the
> shared `session` table (proven approach, see `pkg/auth`). What is fully ported
> vs. scaffolded is documented per service in `docs/` and in `// TODO(migration)`
> markers in the source.

## Layout

```
go-services/
  pkg/        shared libraries (config, log, db, auth, httpx, ratelimit,
              telemetry, events backplane, realtime websocket framework)
  cmd/<svc>/  one main package per service (= one binary = one container)
  internal/<svc>/  each service's private implementation
  e2e/        end-to-end tests (build tag e2e) — real ws clients + Postgres
  Dockerfile  one multi-stage build, parameterized by SERVICE
  Makefile    build / vet / test / e2e / images / helm targets
```

## Services

| Service | Replaces (Node) | Port | Transport | Notes |
|---|---|---|---|---|
| `gateway` | web edge / API routing | 7005 | HTTP+WS | reverse proxy + auth header injection; single ingress |
| `gamehub` | socket-server | 7001 | WS `/socket/` | Kowloon Knockout ported; generic relay framework for others |
| `rmhmusic` | rmhmusic (in socket-server) | 7002 | WS `/rmhmusic-ws/` | snapshot+delta, playback drift sync; auth required |
| `rmhtube` | rmhtube | 7003 | WS `/rmhtube-ws/` | leader-authoritative video sync, queue, chat, DB restore |
| `rmhbox` | rmhbox | 7676 | WS `/rmhbox-ws/` | lobby FSM + coordinator + state-sync; 1 minigame ported |
| `recap` | recap | 7004 | HTTP | Lights Out daily recap → Discord |
| `doctrine-worker` | doctrine-worker | — | worker | puzzle gen (mulberry32, bit-exact), Sahur, decay |
| `vibe-worker` | vibe-worker | — | worker | headless Chromium thumbnails (chromedp) |
| `discord-bot` | discord-bot | — | worker | `/chat` (DeepSeek) ported; `/rmhbot` scaffolded |

## Develop

```bash
make all          # tidy + vet + test + build   (runs Go inside Docker; no local Go needed)
make test         # unit + integration tests
make e2e          # full e2e: Postgres + real binaries + ws clients
make images TAG=dev   # build one container per service
```

## Deploy

```bash
# single-node k3s (imports images into containerd, like PR #121):
./deploy/deploy-go.sh production
# multi-node (push to a registry):
REGISTRY=registry.example.com ./deploy/deploy-go.sh production
```

The chart reuses PR #121's `rmhstudios-secrets` Secret and (optionally) its
`rmhstudios-data` PVC. Redis is deployed as the realtime backplane so the WS
services scale past one replica (`kubectl scale deploy/rmhstudios-go-gamehub --replicas=3`).

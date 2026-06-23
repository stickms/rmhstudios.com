# Operator Runbook — Go Backend + Bazel Build System

How to build, activate, and wire up the Go realtime/worker tier and run the Bazel build system.

Sourced from the repo as of the Bazel migration (PR #142) and the Go microservices migration. Paths are repo-root relative. Where docs disagree with code, the code is authoritative (see [Doc vs. reality](#doc-vs-reality)).

---

## 0. One-time bootstrap (toolchain)

```bash
make bootstrap        # runs scripts/preflight.sh — installs bazelisk, pnpm, node, helm
```

- Installs **bazelisk** (pinned to Bazel `7.4.1` via `.bazelversion`). Always use `bazelisk`/`make`, never system `bazel`.
- **Go is NOT required locally** — `rules_go` ships a hermetic Go 1.23 SDK.
- **Docker is a hard requirement** for any image build — `preflight.sh` hard-fails if the binary is missing or the daemon isn't running.
- `./scripts/preflight.sh --guard` is the fast check that runs automatically before `build`/`images`/`push`/`prod`/`test`: installs cheap tools, only warns on node/helm, always hard-fails on docker.

### Pinned versions / config

- `.bazelversion` → `7.4.1`; `.bazeliskrc` → `USE_BAZEL_VERSION=7.4.1`
- `.bazelrc`: `--enable_bzlmod`, `--disk_cache=~/.cache/bazel-disk`, `--incompatible_strict_action_env`, `test --test_output=errors`, plus `build:linux_amd64` / `build:linux_arm64` platform configs.
- `MODULE.bazel`: `rules_go 0.50.1`, `gazelle 0.39.1`, `rules_oci 2.0.0`, `rules_pkg 1.0.1`, `aspect_bazel_lib 2.8.1`; hermetic Go SDK `1.23.0`; base image `distroless_base` by digest; `base_chromium` / `base_git` from `ghcr.io/rmhstudios/...:latest`.

---

## 1. Run the Bazel build system

```bash
make gazelle          # regenerate go-services BUILD.bazel files (after adding/moving Go files)
make build            # bazel build //go-services/cmd/...  +  bazel run //:frontend  (→ .output/)
make test             # bazel test //go-services/...  +  pnpm exec vitest run
make images           # build + load all 9 service images locally (rmhstudios-go-<svc>:dev)
make clean            # bazel clean
```

- **Architecture:** defaults to `linux_amd64`; override with `make images PLATFORM=linux_arm64`.
- **Frontend is a coarse, non-hermetic leaf** — `bazel run //:frontend` runs `scripts/frontend-build.sh`:
  `pnpm install --frozen-lockfile --ignore-scripts` → `pnpm exec prisma generate` → `pnpm run build:frontend` (→ `.output/`). New frontend files need **no** BUILD changes.
- ⚠️ **`make images` for `vibe-worker` + `discord-bot`** pulls prebuilt base images from GHCR
  (`rmhstudios-go-base-chromium:latest`, `rmhstudios-go-base-git:latest`). Build/push them **first**:
  ```bash
  make base-images    # docker build + push the chromium/git base images (needs docker + GHCR push)
  ```

### All Makefile targets

| Target | Runs |
|---|---|
| `bootstrap` | `./scripts/preflight.sh` (full install) |
| `dev` | `pnpm run dev` (Node stack; Bazel not involved) |
| `gazelle` | `bazel run //:gazelle` |
| `build` | guard → `bazel build //go-services/cmd/...` → `bazel run //:frontend` |
| `base-images` | `docker build` + `docker push` the chromium/git base images |
| `images` | guard → for each service: `bazel run --config=$(PLATFORM) //go-services/images:<svc>_load` |
| `push` | requires `REGISTRY` → `bazel run --config=$(PLATFORM) //go-services/images:<svc>_push -- --repository=$REGISTRY/rmhstudios-go-<svc> --tag=$SHA` |
| `prod` | requires `REGISTRY` → `make push` → `helm upgrade --install rmhstudios-go deploy/helm/rmhstudios-go -f values-prod.yaml --set image.tag=$SHA --set image.registry=$REGISTRY --atomic --wait` |
| `test` | guard → `bazel test --build_tests_only //go-services/...` → `pnpm exec vitest run` |
| `test-e2e` | `cd go-services && bash scripts/e2e/run.sh` |
| `clean` | `bazel clean` |

### `go_service_image` macro (`bazel/defs.bzl`)

`go_service_image(name, binary, base = "@distroless_base", registry_repo = None, env = None)` generates per service:
- `<name>_image` — `oci_image` (entrypoint `/usr/local/bin/<binary>`)
- `<name>_load` — local repo tag **`rmhstudios-go-<name>:dev`**
- `<name>_push` — default repo **`ghcr.io/rmhstudios/rmhstudios-go-<name>`** (override at runtime via `-- --repository=… --tag=…`)

Architecture is set at build time via `--config=linux_amd64|linux_arm64` (passed by the Makefile), not a macro arg. Wiring: 7 services on `@distroless_base`; `vibe-worker` on `@base_chromium` (sets `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`); `discord-bot` on `@base_git`.

---

## 2. Activate the Go backend

**Mental model:** the Go fleet is a **separate, parallel deployment, not a feature flag.** The 9 Go binaries mirror the Node realtime/worker tier. The **`gateway`** becomes the single ingress and reverse-proxies the WS prefixes to the Go services and everything else to the Node SSR `web` app. Session *issuance* stays in the Node/Better-Auth tier; Go services only *validate* sessions against the shared `session` table. "Activation" = deploy the Go chart and point the front door at the gateway.

### The 9 binaries (`go-services/cmd/*`)

| Binary | Replaces (Node) | Port | Gateway prefix |
|---|---|---|---|
| `gateway` | web edge / API routing | 7005 (`PORT_WEB`) | catch-all `/` |
| `gamehub` | socket-server | 7001 | `/socket/` |
| `rmhmusic` | rmhmusic | 7002 | `/rmhmusic-ws/` (auth) |
| `rmhtube` | rmhtube | 7003 | `/rmhtube-ws/` |
| `rmhbox` | rmhbox | 7676 | `/rmhbox-ws/` |
| `recap` | recap | 7004 | — (hit directly, **not** via gateway) |
| `doctrine-worker` | doctrine-worker | — | worker |
| `vibe-worker` | vibe-worker | — | worker (headless Chromium) |
| `discord-bot` | discord-bot | — | worker |

### Deploy paths

**Local (Docker Compose):**
```bash
docker compose -f docker-compose.go.yml up --build   # Go fleet + Redis; gateway fronts the Node web
```

**Single-node k3s (ctr import — no registry):**
```bash
./deploy/deploy-go.sh production
```

**Multi-node (registry):**
```bash
REGISTRY=registry.example.com ./deploy/deploy-go.sh production
# or, Bazel image path (registry-only):
make prod REGISTRY=registry.example.com
```

- `make prod` is **registry-only** and refuses to run without `REGISTRY`; for single-node use `deploy/deploy-go.sh` (it does `sudo k3s ctr images import`).
- `deploy/deploy-go.sh` builds each service from `go-services/Dockerfile` (`--build-arg SERVICE=<svc>`), then either `docker push` (registry) or `sudo k3s ctr images import` (single-node), then `helm upgrade --install rmhstudios-go …`.

---

## 3. Wire it up

### Env the Go services read

- `DATABASE_URL`, `BETTER_AUTH_*` — Postgres + session validation against the shared `session` table.
- `REDIS_URL` — realtime backplane. Empty = in-process bus; chart/compose provide `redis://rmhstudios-go-redis:6379` (k8s) or `redis://redis:6379` (compose).
- `SOCKET_CORS_ORIGIN` — CSV of allowed WS origins (empty = allow all).
- Per-service ports: `PORT_WEB` (gateway, 7005), `SOCKET_PORT` (gamehub, 7001), `RMHBOX_PORT` (7676), `RMHTUBE_PORT` (7003), `RECAP_PORT` (7004).
- Gateway upstreams (env-overridable, `internal/gateway/proxy.go`): `WEB_UPSTREAM`, `GAMEHUB_UPSTREAM`, `RMHBOX_UPSTREAM`, `RMHTUBE_UPSTREAM`, `RMHMUSIC_UPSTREAM`.

### Front-door cutover — pick one

- **Helm ingress (Traefik):** `deploy/helm/rmhstudios-go/templates/ingress.yaml` already routes **all `/` traffic to the gateway**. Enable with `ingress.enabled: true` + a real `ingress.host` in `values-prod.yaml` (placeholder `REPLACE_ME.example.com`).
- **Apache:** `deploy/apache/rmhstudios.com.conf` still proxies straight to the **Node** ports. To cut over, re-point `/` and the WS prefixes at the gateway port.

### Gaps you must close yourself (not pre-wired)

1. ⚠️ **Frontend client URLs.** `.env.example` ships per-service Node ports
   (`VITE_SOCKET_URL=…:7001`, `VITE_RMHBOX_SOCKET_URL=…:7676`, `VITE_RMHTUBE_SOCKET_URL=…:7003`).
   For a gateway cutover, repoint these `VITE_*` values at the **gateway origin** (it serves every WS prefix on one host). There is no `VITE_GATEWAY_URL`.
2. ⚠️ **`WEB_UPSTREAM` default is `http://web:3000`** — wrong port for the Node web (7005). Compose/Helm override it; any hand-rolled deploy must set it.
3. ⚠️ **`recap` (7004) has no gateway route** — the gateway only proxies `/socket/`, `/rmhbox-ws/`, `/rmhtube-ws/`, `/rmhmusic-ws/`. Route recap separately if it must be public.

---

## Prerequisites checklist

- [ ] **Docker daemon running** — required for `images`/`push`/`prod` and `deploy-go.sh`.
- [ ] **`.env.production` + `rmhstudios-secrets`** — `deploy-go.sh` **reuses** the Secret created by the Node deploy (`deploy/deploy-k8s.sh`). On a fresh cluster, run the Node deploy first, or Go pods come up with no `DATABASE_URL`/auth.
- [ ] **Base images** (`make base-images`) before building `vibe-worker`/`discord-bot`.
- [ ] **Registry** for `make push`/`make prod` and multi-node `deploy-go.sh` (not needed single-node).
- [ ] **Passwordless `sudo k3s ctr`** for single-node ctr import (one-time setup in `deploy/README.md`).
- [ ] **Frontend `VITE_*` repointed** at the gateway for a true cutover.

---

## Single-node vs multi-node

Governed by the `REGISTRY` env var:

- **Single-node (`REGISTRY` unset):** images built locally and imported into containerd via `sudo k3s ctr images import`. Helm gets `image.registry=""` (bare image names). Requires passwordless `sudo k3s ctr`.
- **Multi-node (`REGISTRY=…`):** `docker push`, images tagged `$REGISTRY/rmhstudios-go-<svc>:$SHA`, Helm gets `--set image.registry=$REGISTRY`. Private registries need a `regcred` pull secret (`deploy/README.md`).

---

## Doc vs. reality

- Image targets live at **`//go-services/images:<svc>_load|_push`**, not `//go-services/cmd/<svc>:…` as the Bazel *plan* doc (`docs/superpowers/plans/2026-06-20-bazel-build-system.md`) wrote. The shipped `go-services/images/BUILD.bazel` is authoritative.
- Local load tag is **`rmhstudios-go-<svc>:dev`**.
- The shipped `go_service_image` macro has no `platform` arg — architecture comes from `--config=` at build time.

# Bazel Build System — Design Spec

**Date:** 2026-06-20
**Status:** Approved (design), pending implementation plan
**Topic:** Unified, single-command polyglot build/deploy via a hybrid Bazel + Make setup

## Problem

The repo is a polyglot monorepo with no unified build:

- **Frontend** — Vite / TanStack Start (React), built via `pnpm build` (Vite + esbuild).
- **JS backend services** — 8 services under `server/*`, bundled with esbuild. **Being retired** in favor of Go.
- **Go services** — `go-services/` (own `go.mod`), 9 binaries under `cmd/*`, with its own `Makefile`.
- **Deploy** — `deploy.sh`, `deploy/helm`, `deploy/k8s`, `deploy/terraform`.
- **CI** — separate workflows per side.

Builds are glued together by npm scripts + a separate `go-services/Makefile` + `deploy.sh`. There is no single command, no hermeticity, no unified dependency graph, and caching is per-tool only.

## Goals

All four were explicitly requested:

1. **Single command** builds (and deploys) everything.
2. **Hermetic / reproducible** builds.
3. **Unified polyglot graph** with correct rebuild ordering.
4. **Fast incremental builds + shared caching** across local and CI.

## Decisions (from brainstorming)

- **Backend source of truth: Go.** `go-services/` is the future; the JS `server/*` services are being retired. The build system targets Go binaries for the backend. The frontend stays JS.
- **Approach: Hybrid (C).** Bazel owns the hermetic core (Go + container images); a thin top-level `Makefile` is the ergonomic entrypoint and orchestrates the edges (frontend leaf, Helm deploy).
- **Frontend: coarse Vite leaf.** Kept on Vite/pnpm exactly as-is, wrapped as ONE Bazel target. No fine-grained TS targets (rules_ts fights TanStack Start SSR).
- **Build depth: all the way to deploy.** `make prod` goes source → cluster. Lower tiers (`build`, `images`, `push`) are independently runnable.
- **Bootstrap: Make installs/verifies prereqs.** Cheap/safe pinned tools auto-install; privileged/daemon tools fail fast with copy-paste instructions.

## Non-goals

- Putting the frontend under fine-grained `rules_js`/`rules_ts` (rejected — high friction, low ROI).
- Putting Helm/deploy orchestration *inside* Bazel (kept as scripts invoked by Make).
- Migrating dev workflow into Bazel — `make dev` keeps the existing fast pnpm/HMR loop.
- Rewriting or removing the JS `server/*` services as part of this work (they simply leave the default build path; their retirement is tracked separately).

## Architecture

Bazel (via **bazelisk**, version pinned in `.bazelversion`) at the repo root using **bzlmod**. A thin root `Makefile` is the human-facing entrypoint.

```
/MODULE.bazel          # bzlmod deps: rules_go, gazelle, rules_oci, rules_pkg, aspect_bazel_lib
/.bazelrc              # disk cache + optional remote cache, platform config
/.bazelversion        # pinned Bazel version
/Makefile             # ergonomic targets (see below)
/BUILD.bazel          # //:frontend leaf, top-level aliases
/scripts/preflight.sh # bootstrap / dependency self-install + guard
/go-services/         # nested go.mod — gazelle-generated BUILD.bazel per cmd/internal/pkg
/deploy/helm/         # unchanged, invoked by `make prod`
```

### Components

**Go (`rules_go` + `gazelle`)**
- Gazelle auto-generates and maintains `BUILD.bazel` files under `go-services/`. `go.mod` remains the dependency source of truth via `go_deps.from_file(go_mod = "//go-services:go.mod")`.
- Nested Go module (not at repo root) is supported; gazelle configured with the correct prefix.
- Each `cmd/<svc>` → `go_binary`; `internal/` and `pkg/` → `go_library`; `*_test.go` → `go_test`.
- Cross-compiles to Linux for images via Bazel `--platforms` transitions (macOS dev / Linux prod).
- **No local Go install required** — `rules_go` downloads a hermetic Go SDK.

**Container images (`rules_oci`)**
- One `oci_image` per service, Go binary layered on a base.
- Standard services use a distroless/alpine base.
- **Special bases:** `vibe-worker` needs chromium (+ nss, freetype, harfbuzz, ttf-freefont); `discord-bot` needs git + openssh-client. `rules_oci` cannot run `apk`, so these use **per-variant base images** pulled via `oci.pull`, replacing the current Dockerfile build-arg approach.
- `oci_load` targets load images into the local Docker daemon; `oci_push` targets push to the registry.

**Frontend (coarse Vite leaf)**
- A single Bazel target `//:frontend` that shells out to `pnpm build:frontend`, tagged `local` / `no-sandbox` so it reuses the repo's existing `node_modules` (native deps like `@napi-rs/canvas` and `@resvg/resvg-js` work without Bazel-managed node).
- Deliberately **not hermetic** — accepted tradeoff per the coarse-leaf decision.
- Output (`.output/`) is tarred via `rules_pkg` and fed into the frontend `oci_image`.
- `bazel build //...` therefore includes the frontend.

**package.json change**
- Split today's combined `build` (Vite + esbuild backend) so a new **`build:frontend`** script runs Vite only. The Bazel leaf calls `build:frontend`. The esbuild backend step leaves the default path (Go is the backend now). The old combined `build` may remain temporarily for transition but is no longer the canonical path.

## The single command — Make targets

```
make bootstrap → install/verify all toolchain prereqs (idempotent)
make dev       → existing pnpm dev (concurrently). Bazel NOT in the dev loop — fast HMR preserved.
make gazelle   → regenerate Go BUILD.bazel files
make build     → bazel build //go-services/... //:frontend          (artifacts)
make images    → bazel build //...:image + oci_load into docker     (containers)
make push      → bazel run //...:push                                (push to registry)
make test      → bazel test //go-services/...  +  pnpm test (vitest) +  go e2e
make prod      → images → push → helm upgrade -f values-prod.yaml    (source → cluster)
make clean
```

- `make prod` is the full chain (source → cluster). Each lower tier is independently runnable.
- Make wraps Bazel for ergonomics; the hermetic/incremental/cached graph lives in Bazel for Go + images.
- `build` / `images` / `prod` run a fast preflight guard first (see Bootstrap).

## Bootstrap & dependency self-install

`scripts/preflight.sh`, driven by `make bootstrap` and run as a fast guard before `build`/`images`/`prod`. Detects OS + package manager (Homebrew on macOS, apt/apk on Linux). Idempotent: `command -v` check first, install only if missing.

| Tool | Needed for | Auto-install | Notes |
|---|---|---|---|
| **bazelisk** | everything (pins Bazel via `.bazelversion`) | `brew install bazelisk` / release binary on Linux | the one true entrypoint |
| **node** | frontend leaf + `make dev` | brew / NodeSource; version-checked | large runtime |
| **pnpm** | frontend + dev | `corepack enable pnpm` (ships with node) | trivial once node exists |
| **helm** | `make prod` | `brew install helm` / `get-helm-3` script | only needed at deploy |
| **docker** | `make images` / `prod` | **checked, not auto-installed** | daemon can't be reliably auto-installed headless/CI — hard-fails with guidance |
| ~~go~~ | — | **not required** | `rules_go` provides a hermetic SDK |

**Behavior:** the guard auto-installs cheap/safe pinned tools (bazelisk, pnpm via corepack, helm) so build targets just work. Tools needing sudo or a running daemon (docker; sometimes node) **fail fast with exact copy-paste install commands** rather than running unattended privileged installs. `make bootstrap` is the explicit full-machine setup pass; CI runs it as its first step.

## Caching, CI, testing

**Caching**
- `.bazelrc` enables a local disk cache.
- Remote cache (BuildBuddy or GitHub Actions cache) behind an opt-in flag so CI and dev share build artifacts.

**CI**
- Replace the Go workflow's raw `go build` / `go vet` / `go test` with a single `bazel test //...` job (+ cache).
- Frontend leaf + e2e remain as their current steps.
- The per-side split collapses toward one Bazel job; `make bootstrap` runs first.

**Testing**
- Go: gazelle-generated `go_test` under `bazel test //go-services/...`.
- E2E: existing `scripts/e2e/run.sh` kept, invoked via `make test-e2e`.
- Frontend: vitest unchanged, invoked by `make test`.

## Migration phases

Each phase leaves the repo in a working state.

1. **Scaffold + Go.** `MODULE.bazel`, `.bazelrc`, `.bazelversion`, gazelle setup → `bazel build //go-services/...` produces all 9 binaries. Verify parity with `go build ./...`.
2. **Images.** `oci_image` for standard services; per-variant base images for `vibe-worker` / `discord-bot`; verify containers run.
3. **Frontend leaf.** Add `build:frontend` split, the `//:frontend` Bazel target, and the frontend `oci_image`.
4. **Makefile + bootstrap.** Tiered targets, `scripts/preflight.sh`, wire `make prod` → Helm.
5. **CI.** Bazel job + cache; trim/retire old workflows.

## Known wrinkles / risks

- **`rules_oci` can't run `apk`** — chromium/git handled via pulled per-variant base images, not in-image installs.
- **Frontend leaf is not hermetic** — uses the repo's `node_modules` (accepted per coarse-leaf decision).
- **macOS dev / Linux prod** — handled via Bazel platform transitions for the Go cross-compile.
- **Nested `go.mod`** — gazelle/rules_go configured for a non-root Go module.
- **Docker daemon** — cannot be auto-provisioned headless; preflight hard-fails with guidance instead.

## Open items for the implementation plan

- Exact Bazel version to pin and the rules_* versions.
- Choice of base images (distroless variant; chromium base; git base) and registry coordinates.
- Whether to enable remote cache now (BuildBuddy vs GH Actions cache) or disk-only first.
- Registry/tagging scheme for `make push` / `make prod` (reuse existing `deploy.sh` conventions).

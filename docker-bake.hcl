# ─────────────────────────────────────────────────────────────────────────────
# docker buildx bake — builds BOTH production images from ONE shared build graph.
#
# Why bake instead of two `docker build` invocations (as deploy.yml used to do):
#   The old pipeline built `runner` (slim web), pushed it, then built
#   `runner-full` FROM that pushed image in a SECOND invocation — serializing the
#   full image ~1.5-2.5 min behind the slim one and re-pulling the web image over
#   the network. `bake web full` solves both targets in a SINGLE BuildKit graph:
#   the expensive `vite-builder` stage (the ~5 min long pole) is a shared node,
#   so it is built exactly once and `full` derives from the in-graph `runner`
#   (WEB_IMAGE=runner, the Dockerfile's default self-contained path) with no
#   re-pull. The Go build + Chromium apk layer that `full` adds run in parallel
#   with the frontend build, not after it.
#
#   Even in the worst case where BuildKit did NOT dedupe the shared stage, both
#   images still build CORRECTLY — the only cost would be vite running twice —
#   so this is a performance change, not a correctness risk.
#
# Invoked by .github/workflows/deploy.yml:
#   docker buildx bake --push web full
# with the variables below supplied as job env (HCL variables read from env).
#
# Local use (whole graph, throwaway placeholder args):
#   docker buildx bake --print          # resolve + print the plan, no build
#   docker buildx bake web              # build the slim web image locally
# ─────────────────────────────────────────────────────────────────────────────

# Image names — match .github/workflows/deploy.yml env + deploy.sh GHCR_IMAGE*.
variable "IMAGE_WEB" {
  default = "ghcr.io/stickms/rmhstudios-app"
}
variable "IMAGE_FULL" {
  default = "ghcr.io/stickms/rmhstudios-app-full"
}

# Commit SHA tag the VPS pulls (deploy.sh pulls ${IMAGE}:${GIT_SHA_FULL}).
# Defaults to "dev" for a standalone local bake.
variable "GIT_SHA" {
  default = "dev"
}

# ── Build args (baked into the client bundle by `vite build`) ────────────────
# These are the PRODUCTION public values in CI; harmless placeholders locally.
variable "COMPOSE_PROJECT_NAME" {
  default = "rmhstudios"
}
variable "DATABASE_URL" {
  default = "postgresql://ci-build:ci-build@localhost:5432/ci-build"
}
variable "BETTER_AUTH_SECRET" {
  default = "ci-build-not-a-runtime-secret-000000000000"
}
variable "BETTER_AUTH_URL" {
  default = "http://localhost:3000/"
}
variable "VITE_BETTER_AUTH_URL" {
  default = "http://localhost:3000/"
}
variable "VITE_SOCKET_URL" {
  default = "http://localhost:7001/"
}
variable "VITE_RMHBOX_SOCKET_URL" {
  default = "http://localhost:7676/"
}
variable "VITE_RMHTUBE_SOCKET_URL" {
  default = "http://localhost:7003/"
}
variable "VITE_DISCORD_ACTIVITY_CLIENT_ID" {
  default = "ci"
}
variable "VITE_CDN_BASE_URL" {
  default = ""
}
variable "DEEPSEEK_API_KEY" {
  default = ""
}

# Nitro server preset (perf audit §1.1). `node-cluster` emits a multi-worker
# cluster entry that uses more than one core — the production default so the web
# tier is no longer a single event loop under load. Worker count is capped at
# RUNTIME by NITRO_CLUSTER_WORKERS (docker-compose.yml `WEB_WORKERS`), so an
# image built as cluster still runs single-process when WEB_WORKERS=1. Override
# to `node-server` here only to force a single-process image.
variable "NITRO_PRESET" {
  default = "node-cluster"
}

# The full frontend build args, shared by both targets so the in-graph
# vite-builder stage they both depend on resolves to ONE cache key.
function "frontend_args" {
  params = []
  result = {
    COMPOSE_PROJECT_NAME            = COMPOSE_PROJECT_NAME
    DATABASE_URL                    = DATABASE_URL
    BETTER_AUTH_SECRET              = BETTER_AUTH_SECRET
    BETTER_AUTH_URL                 = BETTER_AUTH_URL
    VITE_BETTER_AUTH_URL            = VITE_BETTER_AUTH_URL
    VITE_SOCKET_URL                 = VITE_SOCKET_URL
    VITE_RMHBOX_SOCKET_URL          = VITE_RMHBOX_SOCKET_URL
    VITE_RMHTUBE_SOCKET_URL         = VITE_RMHTUBE_SOCKET_URL
    VITE_DISCORD_ACTIVITY_CLIENT_ID = VITE_DISCORD_ACTIVITY_CLIENT_ID
    VITE_CDN_BASE_URL               = VITE_CDN_BASE_URL
    DEEPSEEK_API_KEY                = DEEPSEEK_API_KEY
    # Both images derive from the shared vite-builder stage, so the preset must
    # be part of the shared arg set (it keys that stage's cache).
    NITRO_PRESET                    = NITRO_PRESET
  }
}

group "default" {
  targets = ["web", "full"]
}

# ── Slim web image (runner): web, socket, rmhbox, rmhtube — Node, no Chromium ─
target "web" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "runner"
  platforms  = ["linux/arm64"]
  provenance = false
  tags = [
    "${IMAGE_WEB}:${GIT_SHA}",
    "${IMAGE_WEB}:latest",
  ]
  args = frontend_args()
  # Registry-backed layer cache on GHCR — no 10 GB GHA-cache eviction cap, no
  # cross-workflow contention, arm64-native, shareable with other builders.
  #
  # ignore-error=true: the cache export runs AFTER the image is already pushed, so
  # it is a pure best-effort speedup — never on the deploy's correctness path. GHCR
  # occasionally drops the buildx auth session mid-export ("no active session …:
  # context deadline exceeded"); that used to fail the whole `build` job and BLOCK
  # the deploy even though BOTH images were already in GHCR (deploy for 6ff6c7f).
  # With ignore-error the export failure is logged as a warning and the build stays
  # green; the only cost is a colder layer cache on the next run. The image PUSH is
  # unaffected — a genuine push failure still fails the build, as it must.
  cache-from = ["type=registry,ref=${IMAGE_WEB}:buildcache"]
  cache-to   = ["type=registry,ref=${IMAGE_WEB}:buildcache,mode=max,image-manifest=true,oci-mediatypes=true,ignore-error=true"]
}

# ── Full image (runner-full): supervisor, status — + Go bins + Chromium ──────
# FROM the in-graph `runner` (WEB_IMAGE defaults to "runner"), so it shares the
# slim image's whole graph — the frontend build is NOT repeated.
target "full" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "runner-full"
  platforms  = ["linux/arm64"]
  provenance = false
  tags = [
    "${IMAGE_FULL}:${GIT_SHA}",
    "${IMAGE_FULL}:latest",
  ]
  # Same frontend args (they key the shared vite-builder stage) + WEB_IMAGE left
  # at its "runner" default so the stage is derived in-graph, not re-pulled.
  args = merge(frontend_args(), {
    WEB_IMAGE = "runner"
  })
  # Read the web buildcache too (shared base layers). Keep reading the existing
  # full cache while it is useful, but do not export it on every deploy.
  cache-from = [
    "type=registry,ref=${IMAGE_FULL}:buildcache",
    "type=registry,ref=${IMAGE_WEB}:buildcache",
  ]
  # The web target already exports the expensive shared graph (deps, Prisma,
  # Vite, server bundles) at mode=max. Exporting even a mode=min full cache still
  # serialized 392/407 MB layers after both images were pushed: 59s in run
  # 29943953406, ending in a harmless GHCR auth timeout. The full-only Go build
  # (~25s) and Chromium install (~8s) run in parallel with Vite, so persisting
  # them costs more critical-path time than rebuilding them. Omitting cache-to is
  # also fail-soft by construction: a missing/stale cache simply causes a cold
  # full-only stage while the actual image push remains the correctness gate.
}

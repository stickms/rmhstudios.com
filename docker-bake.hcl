# ─────────────────────────────────────────────────────────────────────────────
# docker buildx bake — builds BOTH production images from ONE shared build graph.
#
# Why bake instead of two `docker build` invocations (as deploy.yml used to do):
#   The old pipeline built `runner` (slim web), pushed it, then built
#   `runner-full` FROM that pushed image in a SECOND invocation — serializing the
#   full image ~1.5-2.5 min behind the slim one and re-pulling the web image over
#   the network. `bake web full` solves both targets in a SINGLE BuildKit graph
#   and pushes each as soon as its own half of the graph is done.
#
#   The two images now share only `runtime-base` (Node + curl/ffmpeg + the app
#   user). `full` is Go binaries + Chromium on that base and does not depend on
#   the vite build at all, so it finishes and pushes while vite is still running
#   — it is off the critical path entirely.
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

# Google AdSense. Empty in CI and by default — ads stay off unless a deploy
# supplies real values (see docs/adsense.md).
variable "VITE_ADSENSE_CLIENT_ID" {
  default = ""
}
variable "VITE_ADSENSE_SLOTS" {
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

# ── Whether to re-export the GHCR layer cache on this build ──────────────────
# "true" exports; anything else skips the export entirely.
#
# WHY THIS IS A SWITCH AND NOT ALWAYS-ON (measured, deploy run 31265996205):
# the `cache-to` export is the LAST thing in the build and runs AFTER both
# images are already in GHCR — 43.4s "preparing build cache for export" + 29.2s
# "sending cache export" = 72.6s total, of which ~62s lands after the final image
# push. The `build` job cannot finish until it completes, `deploy-gate` waits on
# `build`, and the VPS webhook fires from `deploy-gate` — so every second of that
# tail is a second the new code is not live, for an artifact that is only ever
# read by a LATER build.
#
# And on the overwhelmingly common deploy, that artifact is worth nothing. The
# stages a re-export could refresh are either (a) unchanged since the last
# export — deps, prisma-generate, prod-deps, vibe-builder, go mod download — so
# the existing `:buildcache` already carries them and rewriting it is a no-op
# with a 72s price tag, or (b) keyed to this exact commit's source tree
# (vite-builder, runner), so no future build can ever hit them.
#
# So the export is worth its cost exactly when an input to a cached stage moved.
# deploy.yml diffs the push for that path set and sets EXPORT_CACHE=true; see the
# "Decide whether to refresh" step there for the list and the reasoning behind
# what is deliberately NOT in it.
#
# Fail-soft in both directions: skipping leaves the previous `:buildcache` in
# place (still a valid `cache-from` source — BuildKit resolves cache by layer
# digest, not by commit), and a stale or missing cache only ever costs a colder
# build, never a wrong one.
variable "EXPORT_CACHE" {
  default = "false"
}

# ── Image layer compression ─────────────────────────────────────────────────
# Measured on deploy run 31265996205: "exporting layers" is 38.3s for `web` and
# 31.2s for `full`, and since the two run concurrently that phase costs ~42s of
# critical path. Most of it is gzip. Switching to zstd typically cuts compression
# time substantially at a similar ratio, and speeds the VPS `docker pull` too —
# it is the single biggest remaining lever on this pipeline.
#
# It is left at gzip by DEFAULT, and that is a deliberate refusal to guess. zstd
# layers use the OCI media type `application/vnd.oci.image.layer.v1.tar+zstd`,
# which the PULLING daemon has to understand — Docker Engine ≥ 23.0. GHCR is
# fine; the production VPS's engine version could not be verified from the
# environment this was written in, and the failure mode is not a slow deploy, it
# is `docker pull` failing on the host with every image already built and pushed.
#
# TO TURN IT ON (one command's worth of verification first):
#
#   1. On the VPS:  docker version --format '{{.Server.Version}}'
#   2. If that is 23.0 or newer, set IMAGE_COMPRESSION=zstd in the bake step's
#      env in .github/workflows/deploy.yml.
#   3. Watch the first deploy's "exporting layers" and the VPS pull, and keep the
#      previous image tagged for rollback (deploy.sh already tags ${GIT_SHA}).
#
# force-compression is required: without it BuildKit reuses already-compressed
# layers from the cache as-is and only NEW layers get the new algorithm, so a
# mixed-format image is what actually ships.
variable "IMAGE_COMPRESSION" {
  default = "gzip"
}

# ── Chromium refresh cadence ────────────────────────────────────────────────
# The full image's `apk add chromium` layer is cached across commits (it sits on
# runtime-base, not on per-commit output). Keying it on the month keeps Alpine's
# Chromium security updates flowing without paying the rebuild — and the ~400 MB
# VPS pull — on every deploy: the first build of each month refreshes it, the
# rest reuse it. Override with an explicit value to force a refresh now.
variable "CHROMIUM_REFRESH" {
  default = formatdate("YYYY-MM", timestamp())
}

# The frontend build args (they key the vite-builder stage). Only the web target
# takes them: the full image no longer contains the frontend build.
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
    VITE_ADSENSE_CLIENT_ID          = VITE_ADSENSE_CLIENT_ID
    VITE_ADSENSE_SLOTS              = VITE_ADSENSE_SLOTS
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
  # Layer compression — gzip unless IMAGE_COMPRESSION says otherwise. See that
  # variable for what to verify on the VPS before switching it to zstd.
  output = [
    "type=image,compression=${IMAGE_COMPRESSION},force-compression=${IMAGE_COMPRESSION != "gzip"}",
  ]
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
  # Exported only when EXPORT_CACHE=true — see that variable for why this is not
  # unconditional (it is a ~62s tail on the deploy critical path that the common
  # deploy gets nothing back from).
  cache-to = EXPORT_CACHE == "true" ? ["type=registry,ref=${IMAGE_WEB}:buildcache,mode=max,image-manifest=true,oci-mediatypes=true,ignore-error=true"] : []
}

# ── Full image (runner-full): supervisor, status, assets — Go bins + Chromium ─
# FROM runtime-base, not from `runner` (see Stage 4b in the Dockerfile): it uses
# nothing from the Node build, so it does not take the frontend args and does not
# wait for vite.
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
  args = {
    CHROMIUM_REFRESH = CHROMIUM_REFRESH
  }
  # Same compression as `web` — these two images share layers on the VPS, so a
  # split algorithm would defeat that dedupe as well as being half a migration.
  output = [
    "type=image,compression=${IMAGE_COMPRESSION},force-compression=${IMAGE_COMPRESSION != "gzip"}",
  ]
  # INLINE cache, read back from the previous push of this same image. Every
  # layer worth caching here (runtime-base, Chromium, the Go binaries) is IN the
  # final image, which is exactly what inline (mode=min) cache covers, and it
  # costs no upload: the cache metadata rides in the image config that is pushed
  # anyway. That is what keeps the Chromium layer byte-identical from one deploy
  # to the next, so the VPS pulls nothing new for it.
  #
  # (The old registry-exported full cache was dropped for cost — 392/407 MB of
  # export after both pushes, 59s in run 29943953406 — and back then those layers
  # changed every commit anyway, because Chromium sat on top of .output. Neither
  # is true now, and inline cache has no export tail to pay.)
  #
  # The inline image is the ONLY cache source, deliberately — do not add the web
  # buildcache "for runtime-base". Measured (local registry, fresh builder per
  # run, BuildKit v0.33): with both sources the Chromium RUN missed on every
  # build, so it got a new digest each time and the VPS re-pulled it; with the
  # inline source alone, a rebuild hit every step and produced a byte-identical
  # image (same config digest). runtime-base is a ~1s rebuild when it does miss.
  # A missing or stale cache is fail-soft by construction: it costs a cold apk +
  # Go build, both in parallel with vite, never a wrong image.
  cache-from = ["type=registry,ref=${IMAGE_FULL}:latest"]
  cache-to   = ["type=inline"]
}

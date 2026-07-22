# syntax=docker/dockerfile:1.7-labs
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Multi-stage Docker build (cache-optimized)
#
# Produces TWO runner images from one shared build graph:
#   - runner       (slim): web, socket, rmhbox, rmhtube  — Node only, no Chromium
#   - runner-full         : supervisor, status           — + Go bins, Chromium, git
# Each service overrides the CMD via docker-compose.yml. Splitting keeps Chromium
# (~300-400 MB) and the Go binaries off the four user-facing services, and makes
# the slim image invariant to go-services changes (so the web hotswap can be
# skipped when nothing web-facing moved).
#
# Architecture: ARM64 (aarch64)
#
# Build graph (BuildKit executes independent stages in PARALLEL):
#
#   deps ──→ prisma-generate ──┬──→ server-builder (esbuild, env-agnostic)
#                              └──→ vite-builder   (vite build, env-specific)
#
#   server-builder + vite-builder + prod-deps → runner (slim)
#   runner + go-builder + apk(chromium,git)    → runner-full
#
# Cache strategy:
#   - pnpm store mount  → avoids re-downloading packages between builds
#   - Vinxi/TanStack cache mounts → incremental Vite builds
#   - deps only rebuilds on lockfile changes (not prisma schema changes)
#   - prisma-generate is a thin layer on top of deps (~3s) — schema changes
#     skip the expensive pnpm install and only re-run prisma generate
#   - server-builder is decoupled from app source → only rebuilds when
#     server/ or lib/rmh* change, NOT on app/component changes
#   - server-builder is env-agnostic → 100% cache hit between prod/staging
#   - node_modules copied from prisma-generate (not builder) → stable layer
#     that includes @prisma/client and only rebuilds on lockfile/schema changes
#   - Optional shared/remote layer cache: set DEPLOY_BUILDKIT_CACHE so a fresh or
#     cache-wiped host repopulates deps/prisma/vite from a registry instead of a
#     cold rebuild (needs a buildx container builder — deploy/setup-buildx-cache.sh)
# ─────────────────────────────────────────────────────────────────────────────

# Base image for the runner-full stage (see Stage 4b). Declared here as a global
# ARG so the FROM below can interpolate it. Default `runner` keeps a standalone
# `docker build --target runner-full` self-contained (builds the whole graph). The
# deploy overrides it with the ALREADY-BUILT slim web image tag so runner-full
# starts FROM a concrete image and never re-derives the vite-builder stage — that
# is what guarantees the expensive frontend build runs exactly once per deploy
# (BuildKit won't share the `COPY --exclude … . .` layer across the two target
# builds, so building runner-full FROM the stage rebuilt vite a second time).
ARG WEB_IMAGE=runner

# ── Stage 1: Install dependencies ──────────────────────────────────────────
# Cached as long as package.json / lockfile don't change.
# Prisma files are NOT copied here — schema changes should only trigger
# a fast `prisma generate`, not a full 70s+ pnpm install.
FROM node:24-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.29.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Skip postinstall (prisma generate) — prisma schema isn't here yet.
# It runs in the prisma-generate stage below where the schema is available.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --ignore-scripts --prefer-offline

# ── Stage 1b: Generate Prisma client ──────────────────────────────────────
# Separated from deps so that schema changes only re-run `prisma generate`
# (~3s) instead of invalidating the entire pnpm install layer (~70s).
FROM deps AS prisma-generate

COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN pnpm exec prisma generate

# ── Stage 1c: Production-only node_modules ────────────────────────────────
# Builds on prisma-generate so the Prisma client is already generated —
# no need for the prisma CLI (a devDep) here. pnpm install --prod then
# prunes devDependencies (vite, esbuild, typescript, eslint, etc.).
# Rebuilds only when lockfile or prisma schema changes.
FROM prisma-generate AS prod-deps

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod --ignore-scripts --prefer-offline

# ── Stage 2: Server bundles (env-agnostic, decoupled from app source) ─────
# esbuild runs in <3s and produces CJS bundles for socket/rmhbox/rmhtube.
# Only copies server/ and the shared lib/ types it imports — so changes to
# app/, components/, public/, etc. do NOT invalidate this stage.
# Because this stage has NO build args, it caches perfectly when deploying
# staging right after production (or vice versa) with the same source code.
FROM prisma-generate AS server-builder

COPY tsconfig.json tsconfig.server.json ./
COPY server ./server/
COPY lib/rmhbox ./lib/rmhbox/
COPY lib/rmhtube ./lib/rmhtube/
COPY lib/rmhmusic ./lib/rmhmusic/
COPY lib/blackjack ./lib/blackjack/
COPY lib/holdem ./lib/holdem/
COPY lib/baccarat ./lib/baccarat/
COPY lib/roulette ./lib/roulette/
# Dream Rift's socket relay handler only needs the shared, import-free netcode
# protocol — copy just that file (the rest of lib/dream-rift is browser code).
COPY lib/dream-rift/net/events.ts ./lib/dream-rift/net/events.ts
# The socket-server's app-progression helper (server/socket-server/economy.ts)
# awards XP + quest progress to RMHType/RMHStudy players, reusing the pure,
# import-free season + quest-catalog definitions so thresholds never drift from
# the web tier — so those two files must be present when the bundle is built.
COPY lib/battlepass/season.ts ./lib/battlepass/season.ts
COPY lib/quests/catalog.ts ./lib/quests/catalog.ts
# The socket-server's Spaces (live text rooms) and Party (cross-game groups)
# handlers import their event-name + type contracts from these dirs
# (server/socket-server/handlers/{spaces,party}.ts). Both are small, import-free
# constant/type modules, so copy the dirs so the bundle can resolve them.
COPY lib/party ./lib/party/
COPY lib/spaces ./lib/spaces/
# lights-out, doctrine, rmhvibe, rmhark-ai, media and storage were only imported
# by the Node workers now running in the Go supervisor — no longer copied here so
# changes to them don't bust this stage's cache.
COPY lib/prisma.server.ts ./lib/prisma.server.ts
COPY lib/url.ts ./lib/url.ts
# The RMHLadder + RMHHomes scrape pipelines fetch external URLs through the
# shared SSRF guard (lib/rmhladder/pipeline/memo-fetch.ts + adapters/http.ts and
# lib/homes/scrape/http.ts each `import('../../ssrf-guard.server')`), so the
# ladder-worker/homes-worker bundles need this file present at bundle time.
COPY lib/ssrf-guard.server.ts ./lib/ssrf-guard.server.ts
# ladder-worker (RMHLadder job-discovery cron) is the one Node worker not in
# the Go supervisor — it needs lib/rmhladder for its pipeline/seed/probe code.
COPY lib/rmhladder ./lib/rmhladder/
# ladder-worker also hosts the data-lifecycle cleanup cron, which imports the
# batched purge queries from this module (relative import, so it must be present
# in this bundle context).
COPY lib/cleanup.server.ts ./lib/cleanup.server.ts
# homes-worker (RMHHomes external-listing scraper cron) needs lib/homes for its
# scrape pipeline/seed and the dependency-light watch notifier. Its bundle only
# reaches lib/homes/scrape + types/distance/watch-match, so the heavier
# geo/watches/listings modules in this dir are copied but never traversed.
COPY lib/homes ./lib/homes/
# Only the Node services still served by compose/helm (socket/rmhbox/rmhtube +
# ladder-worker + homes-worker) are bundled here. recap, status, discord-bot,
# doctrine-worker, vibe-worker and bot-worker were migrated to the Go
# supervisor/status binaries (built in the go-builder stage), so their Node
# entrypoints are no longer compiled or shipped.
RUN pnpm exec esbuild \
    server/socket-server/index.ts \
    server/rmhbox/index.ts \
    server/rmhtube/index.ts \
    server/ladder-worker/index.ts \
    server/homes-worker/index.ts \
    --bundle --platform=node --target=node20 \
    --outdir=dist-server --outbase=. \
    --format=cjs --out-extension:.js=.cjs --packages=external --tree-shaking=true \
    --tsconfig=tsconfig.server.json

RUN test -f dist-server/server/socket-server/index.cjs && \
    test -f dist-server/server/rmhbox/index.cjs && \
    test -f dist-server/server/rmhtube/index.cjs && \
    test -f dist-server/server/ladder-worker/index.cjs && \
    test -f dist-server/server/homes-worker/index.cjs

# ── Stage 2b: Pre-build the hosted vibe packages (cached as a layer) ──────────
# scripts/build-vibe-packages.ts bundles the ~14 "hosted" vibe libs (three, pixi,
# p5, framer-motion, …) into public/vibe-packages/*.js — a ~35s esbuild pass
# (measured). It depends ONLY on that script, the self-contained hosted-package
# registry (lib/rmhvibe/vibe-packages.ts), and the installed versions of those libs
# (already baked into the `deps` layer this builds on) — NOT on any app/component
# source. Isolating it here means BuildKit's registry LAYER cache skips the whole
# pass on every deploy that didn't touch those inputs (the overwhelming common
# case), instead of re-bundling it inside the always-re-run vite-builder stage
# below where a one-line app change forced a full re-bundle. A registry/lib bump
# invalidates this layer and it rebuilds correctly. Output is COPYd into vite-builder.
#
# Runs FROM prisma-generate (full node_modules incl. the devDep bundlers three/
# pixi/p5/esbuild), not prod-deps (which prunes them). node_modules + package.json
# are already present from that base; we add only the three inputs the bundler reads.
FROM prisma-generate AS vibe-builder

COPY tsconfig.json ./
COPY scripts/build-vibe-packages.ts ./scripts/build-vibe-packages.ts
COPY lib/rmhvibe/vibe-packages.ts ./lib/rmhvibe/vibe-packages.ts

RUN pnpm run build-vibe-packages

# ── Stage 3: Vite/Nitro build (env-specific) ─────────────────────────────
# BuildKit executes this IN PARALLEL with server-builder (stage 2).
# Build args are needed because Nitro/TanStack static generation may
# evaluate server-side code. The actual runtime values come from .env files.
#
# Two COPY layers: large, rarely-changing public/ first, then everything
# else. Source-only changes don't recreate the ~350 MB public/ layer.
FROM prisma-generate AS vite-builder

COPY public ./public/
# Exclude go-services from this stage's context copy. .dockerignore no longer
# excludes it globally (the go-builder stage needs it), but the Vite build does
# NOT use it — pulling it in here would bust the expensive vite/public layer
# cache on every Go-only change. Requires the dockerfile:1.7-labs syntax.
#
# Same reasoning for the standalone realtime-service subtrees under server/:
# they are esbuild-bundled by the separate server-builder stage and are NOT in
# the Vite/Nitro module graph (nothing under app/components/lib imports them;
# vite.config.ts references only server/nitro). Excluding them here keeps a
# server-service-only change from busting this stage's ~40s vite build.
# server/nitro (referenced by vite.config.ts) and server/rmhbox (reachable via
# lib/rmhbox) are intentionally kept.
COPY --exclude=go-services \
     --exclude=server/socket-server --exclude=server/rmhtube \
     --exclude=server/rmhmusic --exclude=server/recap \
     --exclude=server/bot-worker --exclude=server/doctrine-worker \
     --exclude=server/status --exclude=server/vibe-worker \
     --exclude=server/shared . .

# The hosted vibe-package bundles, built once in the cached vibe-builder stage
# above (not re-bundled here). public/vibe-packages is .dockerignore'd out of the
# context copy above, so this is the only copy — placed AFTER the context COPY so
# it can't be clobbered. It must exist before `vite build` so Nitro folds it into
# .output/public (the build validates .output/public/vibe-packages/react.js).
COPY --from=vibe-builder /app/public/vibe-packages ./public/vibe-packages

ARG COMPOSE_PROJECT_NAME=rmhstudios
ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG VITE_BETTER_AUTH_URL
ARG VITE_SOCKET_URL
ARG VITE_RMHBOX_SOCKET_URL
ARG VITE_RMHTUBE_SOCKET_URL
ARG VITE_DISCORD_ACTIVITY_CLIENT_ID
ARG VITE_CDN_BASE_URL
# Optional: only used to title/describe NEW library PDFs. Cover rendering itself
# needs no key — titles fall back to the humanized filename when it's absent.
ARG DEEPSEEK_API_KEY
# Nitro server preset (perf audit §1.1). Defaults to `node-server` (single
# process — current behavior). Build with `--build-arg NITRO_PRESET=node-cluster`
# to emit a multi-worker cluster entry that uses more than one core; workers are
# then capped at runtime by NITRO_CLUSTER_WORKERS (set on the web service, and
# raise the container's cpus/mem to match). Nitro's Vite plugin reads this env.
ARG NITRO_PRESET=node-server

ENV DATABASE_URL=${DATABASE_URL} \
    BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET} \
    BETTER_AUTH_URL=${BETTER_AUTH_URL} \
    VITE_BETTER_AUTH_URL=${VITE_BETTER_AUTH_URL} \
    VITE_SOCKET_URL=${VITE_SOCKET_URL} \
    VITE_RMHBOX_SOCKET_URL=${VITE_RMHBOX_SOCKET_URL} \
    VITE_RMHTUBE_SOCKET_URL=${VITE_RMHTUBE_SOCKET_URL} \
    VITE_DISCORD_ACTIVITY_CLIENT_ID=${VITE_DISCORD_ACTIVITY_CLIENT_ID} \
    VITE_CDN_BASE_URL=${VITE_CDN_BASE_URL} \
    DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY} \
    NITRO_PRESET=${NITRO_PRESET}

# NOTE: library cover/metadata generation is NOT run here. The library PDFs are
# excluded from the build context (.dockerignore), so this stage can't render new
# covers anyway — it would only ever be a no-op. The deploy generates them on the
# host before the build (deploy.sh Step 1e), bind-mounting public/ + data/ and
# committing the fresh data/library-metadata.json into the context that this stage
# copies. Dropping the duplicate in-image run saves a Node + pdfjs/canvas startup
# every build.

# Build with a cache mount for faster incremental builds.
# .vinxi cache is preserved between builds for Vite's module graph cache.
# The fix-ssr-css-hash.mjs script corrects any SSR/client CSS hash mismatches
# that may arise from the cache, so it's safe to keep .vinxi across builds.
# NODE_OPTIONS prevents OOM on large bundles (three.js, codemirror, r3f, etc.)
# (build-vibe-packages moved to the cached vibe-builder stage above; its output is
# COPYd in before this RUN, so it is no longer bundled on the vite critical path.)
RUN --mount=type=cache,id=vinxi-cache-${COMPOSE_PROJECT_NAME},target=/app/.vinxi,sharing=locked \
    rm -rf .output \
    # i18n translation is NOT run here. It used to call the DeepSeek API to
    # translate any missing keys before the build — a ~39s live-network step on
    # the deploy critical path that re-translated the same still-uncommitted keys
    # every deploy and discarded the result. Translation now runs in
    # .github/workflows/i18n-translate.yml, which COMMITS the output, so the
    # checked-in catalog is the source of truth. We still regenerate the resource
    # modules from that committed locale JSON (fast, deterministic, offline) so a
    # locale edit that skipped `pnpm i18n:resources` can't ship stale strings.
    # Anything not yet translated falls back to English at runtime.
    && echo "[i18n] regenerating resource modules from committed locales (translation runs in CI, not here)" \
    && pnpm exec tsx scripts/gen-i18n-resources.ts \
    && NODE_OPTIONS='--max-old-space-size=8192' pnpm exec vite build \
    && node scripts/fix-ssr-css-hash.mjs

# Validate, prune, and COPY straight from /app/.output. `.output` is a plain
# layer dir (only .vinxi / .cache are cache mounts), so the runner stage can
# COPY --from it directly — no need to first `cp -a` the (~1.5 GB) tree to a
# second path, which only cost disk + wall-clock every build.
RUN test -d /app/.output && \
    test -f /app/.output/server/index.mjs && \
    test -f /app/.output/public/robots.txt && \
    test -f /app/.output/public/vibe-packages/react.js

# ── Slim runtime image: drop assets that Apache serves off the host disk ──────
# In production, Apache serves /library, /music, /models and /sprites directly
# from the host's public/ checkout (see deploy/apache/rmhstudios.com.conf), so
# these requests never reach the Node app — the container's own copy is dead
# weight (~500 MB, mostly public/library). Prune them from the Nitro output
# AFTER the validation above (which needs models/) and AFTER library cover
# generation (which already ran in `library:metadata`). Everything still served
# by Node — public/images (default avatar, read server-side), public/vibe-packages,
# favicon, brand, etc. — is intentionally kept. (music/ and sprites/ are already
# excluded from the build context via .dockerignore; the rm is a harmless no-op
# for them.)
RUN rm -rf /app/.output/public/library \
           /app/.output/public/models \
           /app/.output/public/music \
           /app/.output/public/sprites

# ── Stage 3b: Go binaries ────────────────────────────────────────────────
# Builds supervisor, status, and bot-worker (plus all other cmd/ packages)
# from the go-services module using the official Go toolchain. The binaries
# are statically linked (CGO_ENABLED=0) so they drop cleanly into the musl
# Alpine runner without libc ceremony.
FROM golang:1.23.12-alpine AS go-builder

WORKDIR /build

# TARGETARCH is set automatically by BuildKit from --platform (defaults to the
# build host's arch). Threading it into GOARCH guarantees the binaries match the
# image's target architecture — critical when building on x86 CI for the ARM64
# host, where a host-arch build would exec-format-fail silently at runtime.
ARG TARGETARCH

# Copy only the module files first so the module download layer is cached
# independently of source changes.
COPY go-services/go.mod go-services/go.sum ./

RUN go mod download

# Copy the full source tree and compile every cmd/ package.
# CGO_ENABLED=0 → fully static binaries (no glibc / musl mismatch in runner).
# GOOS/GOARCH → cross-arch-correct binaries for the image's target platform.
COPY go-services/ ./

RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /app/bin/ ./cmd/...

# ── Stage 4: Slim production runner (web, socket, rmhbox, rmhtube) ────────────
# The four user-facing Node services need only the Node runtime, node_modules,
# the Nitro/.output bundle, and the esbuild server bundles. They do NOT need:
#   - Chromium — the vibe-worker captures thumbnails via Go chromedp (in the
#     supervisor), and the web /api/vibe/thumb route only readFile()s a
#     pre-rendered PNG (lib/rmhvibe/vibe-thumbs.ts is deliberately Playwright-free).
#   - git — only the discord-bot worker (in the supervisor) shells out to git.
#   - the Go binaries — supervisor/status run them, the Node services don't.
# Keeping those OUT of this image:
#   - drops ~300-400 MB (Chromium + fonts) from the four services → faster pulls,
#     less disk, smaller SHA-tagged rollback images;
#   - makes this image INVARIANT to go-services changes, so a Go-only or
#     supervisor-only deploy leaves it byte-for-byte identical — which lets
#     deploy/hotswap-web.sh skip the web hotswap entirely (no second container,
#     no health wait, no Apache reload) when nothing web-facing changed.
# The heavier bits live in the runner-full stage below (supervisor + status).
FROM node:24-alpine AS runner

# curl: container healthchecks (compose) + the deploy's port probes.
# ca-certificates: outbound TLS (R2 sync, DeepSeek, Discord, etc.).
# ffmpeg: slice-it transcodes uploaded audio to compressed AAC/.m4a
# (app/routes/api/slice-it/songs/upload.ts → lib/audio/transcode.server.ts).
RUN apk add --no-cache curl ca-certificates ffmpeg

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 app

# ─── Production-only node_modules ───────────────────────────────────────
# Sourced from prod-deps (not prisma-generate) — excludes devDependencies
# (vite, esbuild, typescript, eslint, etc.) for a significantly smaller image.
# Includes @prisma/client from the prod prisma generate run.
# Rebuilds only when lockfile OR prisma schema changes.
COPY --from=prod-deps --chown=app:nodejs /app/node_modules ./node_modules

# ─── Nitro server output ────────────────────────────────────────────────
# .output/ contains the Nitro server bundle, static assets, and public files.
COPY --from=vite-builder --chown=app:nodejs /app/.output ./.output

# ─── Custom server bundles (from env-agnostic stage) ────────────────────
COPY --from=server-builder --chown=app:nodejs /app/dist-server ./dist-server

# ─── Supporting files (from build context, not a builder stage) ─────────
# NOTE: content/ is intentionally NOT copied. It's untracked, host-only seed
# material (content/blog/*.mdx, content/news/*.mdx) that fed one-off seed/migrate
# scripts (scripts/seed-news.ts, scripts/migrate-blogs.ts). Blog + news are served
# from the database at runtime (prisma.blogPost / news tables), so nothing in the
# image reads content/. Since the build moved to CI (where content/ isn't in the
# checkout), baking it would fail; to run a seed script against it, bind-mount the
# host content/ into a one-shot container (like deploy.sh does for public/).
COPY --chown=app:nodejs scripts ./scripts
COPY --chown=app:nodejs data ./data
COPY --chown=app:nodejs prisma ./prisma
COPY --chown=app:nodejs prisma.config.ts ./prisma.config.ts
COPY --chown=app:nodejs package.json ./package.json

USER app

EXPOSE 7005 7001 7676 7003

CMD ["node", ".output/server/index.mjs"]

# ── Stage 4b: Full runtime (Go supervisor + status) ──────────────────────────
# Adds, on top of the slim runner, everything ONLY the background fleet needs:
#   - Go binaries: supervisor runs 5 workers as goroutines; status is the Go
#     status page server (the remaining hubs/gateway are available for future
#     compose wiring).
#   - Chromium + fonts: the vibe-worker captures gallery thumbnails via Go
#     chromedp, which drives the system Chromium (musl Alpine can't run
#     Playwright's own download — point it at the OS Chromium below).
# Used ONLY by the `supervisor` and `status` compose services. Because Chromium
# is the slow apk layer, isolating it here means a web/source change never
# re-runs it, and a go-services change never touches the slim web image.
#
# FROM ${WEB_IMAGE} (default `runner`; the deploy passes the already-built slim
# web image tag). Building FROM the concrete web image means this stage does NOT
# depend on `runner`/`vite-builder` in the graph, so the deploy's supervisor build
# skips the vite build entirely — the web build already produced it. WEB_IMAGE is
# the global ARG declared before the first FROM (in scope for every FROM line).
FROM ${WEB_IMAGE} AS runner-full

USER root
RUN apk add --no-cache \
    chromium nss freetype harfbuzz ttf-freefont font-noto-emoji

# Reuse the system Chromium for chromedp/Playwright instead of a (musl-incompatible) download.
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# ─── Go binaries (supervisor, status, bot-worker, hubs, gateway) ────────
# Compiled in the go-builder stage (CGO_ENABLED=0, fully static).
COPY --from=go-builder --chown=app:nodejs /app/bin/ /app/bin/

USER app

CMD ["/app/bin/supervisor"]

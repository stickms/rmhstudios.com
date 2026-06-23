# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Multi-stage Docker build (cache-optimized)
#
# Produces a single image used by all services (web, socket, rmhbox, rmhtube).
# Each service overrides the CMD via docker-compose.yml.
#
# Architecture: ARM64 (aarch64)
#
# Build graph (BuildKit executes independent stages in PARALLEL):
#
#   deps ──→ prisma-generate ──┬──→ server-builder (esbuild, env-agnostic)
#                              └──→ vite-builder   (vite build, env-specific)
#
#   All stages feed into → runner
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
# ─────────────────────────────────────────────────────────────────────────────

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
    pnpm install --frozen-lockfile --ignore-scripts

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
    pnpm install --frozen-lockfile --prod --ignore-scripts

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
COPY lib/lights-out ./lib/lights-out/
COPY lib/doctrine ./lib/doctrine/
COPY lib/rmhvibe ./lib/rmhvibe/
COPY lib/rmhark-ai ./lib/rmhark-ai/
COPY lib/media ./lib/media/
COPY lib/storage ./lib/storage/
COPY lib/prisma.server.ts ./lib/prisma.server.ts
COPY lib/url.ts ./lib/url.ts
RUN pnpm exec esbuild \
    server/socket-server/index.ts \
    server/rmhbox/index.ts \
    server/rmhtube/index.ts \
    server/recap/index.ts \
    server/status/index.ts \
    server/discord-bot/index.ts \
    server/doctrine-worker/index.ts \
    server/vibe-worker/index.ts \
    server/bot-worker/index.ts \
    --bundle --platform=node --target=node20 \
    --outdir=dist-server --outbase=. \
    --format=cjs --out-extension:.js=.cjs --packages=external --tree-shaking=true \
    --tsconfig=tsconfig.server.json

RUN test -f dist-server/server/socket-server/index.cjs && \
    test -f dist-server/server/rmhbox/index.cjs && \
    test -f dist-server/server/rmhtube/index.cjs && \
    test -f dist-server/server/recap/index.cjs && \
    test -f dist-server/server/status/index.cjs && \
    test -f dist-server/server/discord-bot/index.cjs && \
    test -f dist-server/server/doctrine-worker/index.cjs && \
    test -f dist-server/server/vibe-worker/index.cjs && \
    test -f dist-server/server/bot-worker/index.cjs

# ── Stage 3: Vite/Nitro build (env-specific) ─────────────────────────────
# BuildKit executes this IN PARALLEL with server-builder (stage 2).
# Build args are needed because Nitro/TanStack static generation may
# evaluate server-side code. The actual runtime values come from .env files.
#
# Two COPY layers: large, rarely-changing public/ first, then everything
# else. Source-only changes don't recreate the ~350 MB public/ layer.
FROM prisma-generate AS vite-builder

COPY public ./public/
COPY . .

ARG COMPOSE_PROJECT_NAME=rmhstudios
ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG VITE_BETTER_AUTH_URL
ARG VITE_SOCKET_URL
ARG VITE_RMHBOX_SOCKET_URL
ARG VITE_RMHTUBE_SOCKET_URL
ARG VITE_DISCORD_ACTIVITY_CLIENT_ID
# Optional: only used to title/describe NEW library PDFs. Cover rendering itself
# needs no key — titles fall back to the humanized filename when it's absent.
ARG DEEPSEEK_API_KEY

ENV DATABASE_URL=${DATABASE_URL} \
    BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET} \
    BETTER_AUTH_URL=${BETTER_AUTH_URL} \
    VITE_BETTER_AUTH_URL=${VITE_BETTER_AUTH_URL} \
    VITE_SOCKET_URL=${VITE_SOCKET_URL} \
    VITE_RMHBOX_SOCKET_URL=${VITE_RMHBOX_SOCKET_URL} \
    VITE_RMHTUBE_SOCKET_URL=${VITE_RMHTUBE_SOCKET_URL} \
    VITE_DISCORD_ACTIVITY_CLIENT_ID=${VITE_DISCORD_ACTIVITY_CLIENT_ID} \
    DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}

# Auto-generate library book covers + metadata for any PDF in public/library that
# doesn't already have them. Idempotent: existing covers (committed under
# public/library/covers) and data/library-metadata.json are reused, so this only
# renders what's new. Must run BEFORE `vite build` so the fresh metadata JSON is
# bundled and the rendered covers are picked up into the public output.
RUN pnpm run library:metadata

# Build with cache mounts for faster incremental builds.
# .vinxi cache is preserved between builds for Vite's module graph cache.
# The fix-ssr-css-hash.mjs script corrects any SSR/client CSS hash mismatches
# that may arise from the cache, so it's safe to keep .vinxi across builds.
# NODE_OPTIONS prevents OOM on large bundles (three.js, monaco, tiptap, etc.)
RUN --mount=type=cache,id=vinxi-cache-${COMPOSE_PROJECT_NAME},target=/app/.vinxi,sharing=locked \
    rm -rf .output \
    && pnpm run build-vibe-packages \
    && NODE_OPTIONS='--max-old-space-size=8192' pnpm exec vite build \
    && node scripts/fix-ssr-css-hash.mjs \
    && cp -a .output /app/build-output

RUN test -d /app/build-output && \
    test -f /app/build-output/server/index.mjs && \
    test -f /app/build-output/public/models/marlonjack.glb && \
    test -f /app/build-output/public/vibe-packages/react.js

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
RUN rm -rf /app/build-output/public/library \
           /app/build-output/public/models \
           /app/build-output/public/music \
           /app/build-output/public/sprites

# ── Stage 3b: Go binaries ────────────────────────────────────────────────
# Builds supervisor, status, and bot-worker (plus all other cmd/ packages)
# from the go-services module using the official Go toolchain. The binaries
# are statically linked (CGO_ENABLED=0) so they drop cleanly into the musl
# Alpine runner without libc ceremony.
FROM golang:1.23-alpine AS go-builder

WORKDIR /build

# Copy only the module files first so the module download layer is cached
# independently of source changes.
COPY go-services/go.mod go-services/go.sum ./

RUN go mod download

# Copy the full source tree and compile every cmd/ package.
# CGO_ENABLED=0 → fully static binaries (no glibc / musl mismatch in runner).
COPY go-services/ ./

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/bin/ ./cmd/...

# ── Stage 4: Production runner ────────────────────────────────────────────
FROM node:24-alpine AS runner

# chromium + fonts: used by the RMHVibe thumbnail capture (Playwright). Alpine
# is musl, so Playwright's own download won't run — we use the OS Chromium and
# point Playwright at it via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH below.
RUN apk add --no-cache curl git \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto-emoji

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
# Reuse the system Chromium for Playwright instead of a (musl-incompatible) download.
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 app && \
    mkdir -p /app/.rmhbot-worktrees && chown app:nodejs /app/.rmhbot-worktrees

# ─── Production-only node_modules ───────────────────────────────────────
# Sourced from prod-deps (not prisma-generate) — excludes devDependencies
# (vite, esbuild, typescript, eslint, etc.) for a significantly smaller image.
# Includes @prisma/client from the prod prisma generate run.
# Rebuilds only when lockfile OR prisma schema changes.
COPY --from=prod-deps --chown=app:nodejs /app/node_modules ./node_modules

# ─── Nitro server output ────────────────────────────────────────────────
# .output/ contains the Nitro server bundle, static assets, and public files.
COPY --from=vite-builder --chown=app:nodejs /app/build-output ./.output

# ─── Custom server bundles (from env-agnostic stage) ────────────────────
COPY --from=server-builder --chown=app:nodejs /app/dist-server ./dist-server

# ─── Go binaries (supervisor, status, bot-worker, hubs, gateway) ────────
# Compiled in the go-builder stage (CGO_ENABLED=0, fully static).
# supervisor runs 5 background workers as goroutines; status is the
# Go status page server; the remaining hubs/gateway are available for
# future compose wiring.
COPY --from=go-builder --chown=app:nodejs /app/bin/ /app/bin/

# ─── Supporting files (from build context, not a builder stage) ─────────
COPY --chown=app:nodejs scripts ./scripts
COPY --chown=app:nodejs content ./content
COPY --chown=app:nodejs data ./data
COPY --chown=app:nodejs prisma ./prisma
COPY --chown=app:nodejs prisma.config.ts ./prisma.config.ts
COPY --chown=app:nodejs package.json ./package.json

USER app

EXPOSE 7005 7001 7676 7003

CMD ["node", ".output/server/index.mjs"]

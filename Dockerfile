# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Multi-stage Docker build (cache-optimized)
#
# Produces a single image used by all services (web, socket, rmhbox, rmhtube,
# news-pipeline). Each service overrides the CMD via docker-compose.yml.
#
# Architecture: ARM64 (aarch64)
#
# Build graph (BuildKit executes independent stages in PARALLEL):
#
#   deps ──┬──→ server-builder (esbuild, only server/ + lib/ — env-agnostic)
#          └──→ vite-builder   (vite build, full source — env-specific)
#
#   All stages feed into → runner
#
# Cache strategy:
#   - pnpm store mount  → avoids re-downloading packages between builds
#   - Vinxi/TanStack cache mounts → incremental Vite builds
#   - server-builder is decoupled from app source → only rebuilds when
#     server/ or lib/rmh* change, NOT on app/component changes
#   - server-builder is env-agnostic → 100% cache hit between prod/staging
#   - node_modules copied from deps (not builder) → stable layer even when
#     source changes, since deps only rebuilds on lockfile changes
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ──────────────────────────────────────────
# Cached as long as package.json / lockfile / prisma schema don't change.
FROM node:24-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# postinstall runs `prisma generate` → creates @prisma/client
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

# ── Stage 2: Server bundles (env-agnostic, decoupled from app source) ─────
# esbuild runs in <3s and produces CJS bundles for socket/rmhbox/rmhtube.
# Only copies server/ and the shared lib/ types it imports — so changes to
# app/, components/, public/, etc. do NOT invalidate this stage.
# Because this stage has NO build args, it caches perfectly when deploying
# staging right after production (or vice versa) with the same source code.
FROM deps AS server-builder

COPY tsconfig.json tsconfig.server.json ./
COPY server ./server/
COPY lib/rmhbox ./lib/rmhbox/
COPY lib/rmhtube ./lib/rmhtube/
COPY lib/rmhmusic ./lib/rmhmusic/

RUN pnpm exec esbuild \
    server/socket-server/index.ts \
    server/rmhbox/index.ts \
    server/rmhtube/index.ts \
    --bundle --platform=node --target=node20 \
    --outdir=dist-server --outbase=. \
    --format=cjs --out-extension:.js=.cjs --packages=external --tree-shaking=true \
    --tsconfig=tsconfig.server.json

RUN test -f dist-server/server/socket-server/index.cjs && \
    test -f dist-server/server/rmhbox/index.cjs && \
    test -f dist-server/server/rmhtube/index.cjs

# ── Stage 3: Vite/Nitro build (env-specific) ─────────────────────────────
# BuildKit executes this IN PARALLEL with server-builder (stage 2).
# Build args are needed because Nitro/TanStack static generation may
# evaluate server-side code. The actual runtime values come from .env files.
#
# Two COPY layers: large, rarely-changing public/ first, then everything
# else. Source-only changes don't recreate the ~350 MB public/ layer.
FROM deps AS vite-builder

COPY public ./public/
COPY . .

ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG VITE_BETTER_AUTH_URL
ARG VITE_SOCKET_URL
ARG VITE_RMHBOX_SOCKET_URL
ARG VITE_RMHTUBE_SOCKET_URL

ENV DATABASE_URL=${DATABASE_URL} \
    BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET} \
    BETTER_AUTH_URL=${BETTER_AUTH_URL} \
    VITE_BETTER_AUTH_URL=${VITE_BETTER_AUTH_URL} \
    VITE_SOCKET_URL=${VITE_SOCKET_URL} \
    VITE_RMHBOX_SOCKET_URL=${VITE_RMHBOX_SOCKET_URL} \
    VITE_RMHTUBE_SOCKET_URL=${VITE_RMHTUBE_SOCKET_URL}

# Clean build every time to avoid stale .vinxi cache causing asset hash
# mismatches between the SSR bundle and the actual CSS files on disk.
# NODE_OPTIONS prevents OOM on large bundles (three.js, monaco, tiptap, etc.)
RUN rm -rf .vinxi .output \
    && NODE_OPTIONS='--max-old-space-size=8192' pnpm exec vite build \
    && cp -a .output /app/build-output

RUN test -d /app/build-output && test -f /app/build-output/server/index.mjs

# ── Stage 4: Production runner ────────────────────────────────────────────
FROM node:24-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# ─── node_modules from deps stage (NOT from builder) ────────────────────
# This is the single largest layer. By sourcing it from the deps stage
# instead of the builder, this layer is cached independently of source
# code or env-arg changes — it only rebuilds when the lockfile changes.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# ─── Nitro server output ────────────────────────────────────────────────
# .output/ contains the Nitro server bundle, static assets, and public files.
COPY --from=vite-builder --chown=nextjs:nodejs /app/build-output ./.output

# ─── Custom server bundles (from env-agnostic stage) ────────────────────
COPY --from=server-builder --chown=nextjs:nodejs /app/dist-server ./dist-server

# ─── Supporting files (from build context, not a builder stage) ─────────
COPY --chown=nextjs:nodejs scripts ./scripts
COPY --chown=nextjs:nodejs content ./content
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs prisma.config.ts ./prisma.config.ts
COPY --chown=nextjs:nodejs package.json ./package.json

USER nextjs

EXPOSE 7005 7001 7676 7003

CMD ["node", ".output/server/index.mjs"]

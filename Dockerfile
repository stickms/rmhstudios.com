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
#   deps ──→ source ──┬──→ server-builder (esbuild, env-agnostic)
#                     └──→ vite-builder   (vite build, env-specific)
#
#   All four stages feed into → runner
#
# Cache strategy:
#   - pnpm store mount  → avoids re-downloading packages between builds
#   - Vinxi/TanStack cache mounts → incremental builds (shared across envs)
#   - server-builder is env-agnostic → 100% cache hit between prod/staging
#   - node_modules copied from deps (not builder) → stable layer even when
#     source changes, since deps only rebuilds on lockfile changes
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
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

# ── Stage 2: Source base ─────────────────────────────────────────────────────
# Copies source code on top of deps. This is the shared parent for both
# build stages — BuildKit builds it once and both children reference it.
FROM deps AS source

COPY . .

# ── Stage 3: Server bundles (env-agnostic → fully cached between envs) ──────
# esbuild runs in <3s and produces CJS bundles for socket/rmhbox/rmhtube.
# Because this stage has NO build args, it caches perfectly when deploying
# staging right after production (or vice versa) with the same source code.
# BuildKit runs this IN PARALLEL with the vite-builder stage.
FROM source AS server-builder

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

# ── Stage 4: Vite/Nitro build (env-specific) ────────────────────────────────
# BuildKit executes this IN PARALLEL with server-builder (stage 3).
# Build args are needed because Nitro/TanStack static generation may
# evaluate server-side code. The actual runtime values come from .env files.
FROM source AS vite-builder

ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_RMHBOX_SOCKET_URL
ARG NEXT_PUBLIC_RMHTUBE_SOCKET_URL

ENV DATABASE_URL=${DATABASE_URL} \
    BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET} \
    BETTER_AUTH_URL=${BETTER_AUTH_URL} \
    NEXT_PUBLIC_BETTER_AUTH_URL=${NEXT_PUBLIC_BETTER_AUTH_URL} \
    NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL} \
    NEXT_PUBLIC_RMHBOX_SOCKET_URL=${NEXT_PUBLIC_RMHBOX_SOCKET_URL} \
    NEXT_PUBLIC_RMHTUBE_SOCKET_URL=${NEXT_PUBLIC_RMHTUBE_SOCKET_URL}

# Cache mounts for incremental rebuilds (shared across prod + staging):
#   - .vinxi / .tanstack: TanStack Start build cache (route manifests, etc.)
#   - .output: Nitro server bundle output (reused across incremental builds)
# NODE_OPTIONS prevents OOM on large bundles (three.js, monaco, tiptap, etc.)
# .output is produced by Nitro inside the cache mount, then copied to
# /app/build-output so it persists after the RUN layer for COPY --from.
RUN --mount=type=cache,id=vinxi-cache,target=/app/.vinxi,sharing=locked \
    --mount=type=cache,id=tanstack-cache,target=/app/.tanstack,sharing=locked \
    NODE_OPTIONS='--max-old-space-size=8192' pnpm exec vite build \
    && cp -a .output /app/build-output

RUN test -d /app/build-output && test -f /app/build-output/server/index.mjs

# ── Stage 5: Production runner ───────────────────────────────────────────────
FROM node:24-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# ─── node_modules from deps stage (NOT from builder) ────────────────────────
# This is the single largest layer. By sourcing it from the deps stage
# instead of the builder, this layer is cached independently of source
# code or env-arg changes — it only rebuilds when the lockfile changes.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# ─── Nitro server output ────────────────────────────────────────────────────
# .output/ contains the Nitro server bundle, static assets, and public files.
COPY --from=vite-builder --chown=nextjs:nodejs /app/build-output ./.output

# ─── Custom server bundles (from env-agnostic stage) ────────────────────────
COPY --from=server-builder --chown=nextjs:nodejs /app/dist-server ./dist-server

# ─── Supporting files ───────────────────────────────────────────────────────
COPY --from=source --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=source --chown=nextjs:nodejs /app/content ./content
COPY --from=source --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=source --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=source --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 7005 7001 7676 7003

CMD ["node", ".output/server/index.mjs"]

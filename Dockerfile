# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Multi-stage Docker build
#
# Produces a single image used by all services (web, socket, rmhbox, rmhtube,
# news-pipeline). Each service overrides the CMD via docker-compose.yml.
#
# Architecture: ARM64 (aarch64)
#
# Uses BuildKit cache mounts to persist:
#   - pnpm store  → avoids re-downloading packages between builds
#   - Next.js cache → enables incremental builds
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:24-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependency manifests first (layer cache optimization)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install ALL dependencies (dev + prod) — needed for build stage.
# postinstall runs `prisma generate` automatically.
# BuildKit cache mount keeps the pnpm store between builds so only
# new/changed packages need downloading.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

# ── Stage 2: Build application ───────────────────────────────────────────────
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependencies from previous stage (includes generated Prisma client in node_modules)
COPY --from=deps /app/node_modules ./node_modules

# Copy full source
COPY . .

# Build Next.js (standalone output) + esbuild server bundles
# These env vars are needed at build time because Next.js static page
# generation runs server-side code (Better Auth init, Prisma queries).
# The actual runtime values come from .env files at container start.
ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_RMHBOX_SOCKET_URL
ARG NEXT_PUBLIC_RMHTUBE_SOCKET_URL

ENV DATABASE_URL=${DATABASE_URL}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV BETTER_AUTH_URL=${BETTER_AUTH_URL}
ENV NEXT_PUBLIC_BETTER_AUTH_URL=${NEXT_PUBLIC_BETTER_AUTH_URL}
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}
ENV NEXT_PUBLIC_RMHBOX_SOCKET_URL=${NEXT_PUBLIC_RMHBOX_SOCKET_URL}
ENV NEXT_PUBLIC_RMHTUBE_SOCKET_URL=${NEXT_PUBLIC_RMHTUBE_SOCKET_URL}

# Cache .next/cache between builds for incremental compilation
RUN --mount=type=cache,id=nextjs-cache,target=/app/.next/cache,sharing=locked \
    pnpm run build

# Verify build artifacts exist
RUN test -d .next/standalone && \
    test -d .next/static && \
    test -f dist-server/server/socket-server/index.js && \
    test -f dist-server/server/rmhbox/index.js && \
    test -f dist-server/server/rmhtube/index.js

# ── Stage 3: Production runner ───────────────────────────────────────────────
FROM node:24-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# ─── Next.js standalone server ───────────────────────────────────────────────
# The standalone output includes a minimal server.js + only the node_modules
# it actually needs. We also need .next/static and public/ for assets.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# ─── Custom server bundles (socket-server, rmhbox, rmhtube) ─────────────────
# esbuild bundles use --packages=external, so they need the full node_modules
# at runtime (dotenv, socket.io, @prisma/client, ws, etc.).
# Copy the full node_modules from builder — this overwrites/merges with the
# standalone node_modules which only contains Next.js traced deps.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/dist-server ./dist-server

# ─── News pipeline scripts ──────────────────────────────────────────────────
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# ─── Content (news MDX files etc.) ──────────────────────────────────────────
COPY --from=builder --chown=nextjs:nodejs /app/content ./content

# ─── Prisma schema + config (needed for `prisma db push` during deploy) ─────
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 7005 7001 7676 7003

# Default: run the Next.js standalone server
# Override via docker-compose `command` for socket/rmhbox/rmhtube services
CMD ["node", "server.js"]

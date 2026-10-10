# syntax=docker/dockerfile:1.7-labs
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Multi-stage Docker build (cache-optimized)
#
# Produces TWO runner images from one shared build graph:
#   - runner       (slim): web, socket, rmhbox, rmhtube, Node workers — Node only
#   - runner-full         : supervisor, status, assets — Go bins + Chromium, no app layers
# Each service overrides the CMD via docker-compose.yml. Splitting keeps Chromium
# (~300-400 MB) and the Go binaries off the user-facing services, and makes each
# image invariant to the other's inputs: a Go-only change leaves the slim image
# byte-identical (so the web hotswap is skipped), and a web-only change leaves the
# full image's layers untouched (so the VPS pulls nothing new for it).
#
# Architecture: ARM64 (aarch64)
#
# Build graph (BuildKit executes independent stages in PARALLEL):
#
#   deps ──┬──→ image-variants (sharp, cached on public/images)
#          └──→ prisma-generate ──┬──→ server-builder (esbuild, env-agnostic)
#                                 └──→ vite-builder   (vite build, env-specific)
#
#   runtime-base + server-builder + vite-builder + prod-deps → runner (slim)
#   runtime-base + apk(chromium) + go-builder                → runner-full
#
# Cache strategy:
#   - pnpm store mount  → avoids re-downloading packages between builds
#   - deps only rebuilds on lockfile changes (not prisma schema changes)
#   - prisma-generate is a thin layer on top of deps (~3s) — schema changes
#     skip the expensive pnpm install and only re-run prisma generate
#   - server-builder is decoupled from app source → only rebuilds when
#     server/ or lib/ change, NOT on app/component/public changes (and it runs
#     in parallel with vite-builder, so even a rebuild costs no wall-clock)
#   - server-builder is env-agnostic → 100% cache hit between prod/staging
#   - node_modules copied from prisma-generate (not builder) → stable layer
#     that includes @prisma/client and only rebuilds on lockfile/schema changes
#   - Optional shared/remote layer cache: set DEPLOY_BUILDKIT_CACHE so a fresh or
#     cache-wiped host repopulates deps/prisma/vite from a registry instead of a
#     cold rebuild (needs a buildx container builder — deploy/setup-buildx-cache.sh)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ──────────────────────────────────────────
# Cached as long as package.json / lockfile don't change.
# Prisma files are NOT copied here — schema changes should only trigger
# a fast `prisma generate`, not a full 70s+ pnpm install.
FROM node:24.21.0-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.34.6 --activate

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
# esbuild runs in <3s and produces CJS bundles for the six Node services.
# Copies server/ + lib/ and nothing else — app/, components/ and public/ stay
# out, so a page or component change does NOT invalidate this stage.
# Because this stage has NO build args, it caches perfectly when deploying
# staging right after production (or vice versa) with the same source code.
#
# WHY `COPY lib` AND NOT A FILE-BY-FILE LIST: this block used to be 83 separate
# `COPY lib/<one thing>` lines, each with a comment explaining which handler
# imported it, so that a change to an uninvolved lib/ subtree left the stage
# cached. That traded badly on both sides of the ledger:
#
#   - It bought nothing on the clock. The stage it protects is a ~3s esbuild,
#     and BuildKit runs it CONCURRENTLY with vite-builder (~90s+). Rebuilding it
#     costs zero wall-clock — it finishes deep inside another stage's critical
#     path either way. Meanwhile the 85 layers it added were real: every one is
#     a record to checksum each build and an entry in the mode=max cache
#     manifest, which is exactly the "preparing build cache for export" phase
#     that ran 43.4s on the last measured deploy.
#   - It was a standing footgun. The list had to be a superset of the bundles'
#     transitive imports, so adding one `import` to a socket handler broke the
#     production image build with a module-not-found — at deploy time, not in
#     local dev or CI, because only this stage has the truncated tree.
#
# `lib/` is 15 MB and esbuild is import-driven + tree-shaking with
# `--packages=external`, so copying all of it is a strict superset that produces
# byte-identical bundles. Tests/mocks are already stripped by .dockerignore.
FROM prisma-generate AS server-builder

COPY tsconfig.json tsconfig.server.json ./
COPY server ./server/
COPY lib ./lib/

# Only the Node services still served by compose (socket/rmhbox/rmhtube +
# ladder-worker + homes-worker + jobs) are bundled here. recap, status,
# discord-bot, doctrine-worker, vibe-worker and bot-worker were migrated to the
# Go supervisor/status binaries (built in the go-builder stage), so their Node
# entrypoints are no longer compiled or shipped.
RUN pnpm exec esbuild \
    server/socket-server/index.ts \
    server/rmhbox/index.ts \
    server/rmhtube/index.ts \
    server/ladder-worker/index.ts \
    server/homes-worker/index.ts \
    server/jobs/index.ts \
    --bundle --platform=node --target=node24 \
    --outdir=dist-server --outbase=. \
    --format=cjs --out-extension:.js=.cjs --packages=external --tree-shaking=true \
    --tsconfig=tsconfig.server.json

RUN test -f dist-server/server/socket-server/index.cjs && \
    test -f dist-server/server/rmhbox/index.cjs && \
    test -f dist-server/server/rmhtube/index.cjs && \
    test -f dist-server/server/ladder-worker/index.cjs && \
    test -f dist-server/server/homes-worker/index.cjs && \
    test -f dist-server/server/jobs/index.cjs

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

# The assertion that the runner used to make with a RUN of its own, next to the
# COPY that places these files. It lives here now because the runner's COPYs are
# `--link` and must not be followed by a RUN (see Stage 4); the guarantee is the
# same, since the runner copies this exact directory.
RUN pnpm run build-vibe-packages \
    && test -f public/vibe-packages/react.js

# ── Stage 2c: Responsive image variants (cached on public/images) ─────────────
# scripts/gen-image-variants.ts encodes an AVIF + WebP at up to four widths for
# every master under public/images/** (~290 files). The variants are gitignored
# AND dockerignored, so the encode always starts cold here — and it used to run
# inside vite-builder's RUN, whose cache key is the whole source tree. Every
# deploy therefore re-encoded every image from scratch on the critical path, for
# output that depends on nothing but the masters (measured cold on 4 cores: 220s
# serial; 57s since the script runs a parallel pool — still far too much to pay
# per commit for unchanged art).
#
# As its own stage it depends only on the encoder's inputs: the installed sharp
# (`deps`, NOT prisma-generate — a schema change must not re-encode images), the
# script, and public/images. BuildKit's registry layer cache then skips it on
# every deploy that didn't touch art, and when art does change it runs in
# PARALLEL with prisma-generate rather than inside the vite RUN.
#
# It also emits lib/images/variants.gen.ts. vite-builder takes that regenerated
# manifest along with the files, exactly as the in-RUN step used to overwrite the
# committed one, so the manifest and the files can never disagree in the image.
FROM deps AS image-variants

COPY scripts/gen-image-variants.ts ./scripts/gen-image-variants.ts
COPY public/images ./public/images/

RUN pnpm exec tsx scripts/gen-image-variants.ts

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

# Responsive image variants + their regenerated manifest, from the cached stage
# above. Unlike the vibe packages (next note), these DO have to land before
# `vite build`: Nitro bakes every public file into its build-time asset manifest
# (.output/server/worker.mjs lists each /images/_variants/* URL), and a file the
# manifest doesn't know is never served — so they cannot be dropped in later.
# After the context COPY so the regenerated manifest wins over the committed one.
COPY --from=image-variants /app/public/images/_variants ./public/images/_variants
COPY --from=image-variants /app/lib/images/variants.gen.ts ./lib/images/variants.gen.ts

# NOTE: the hosted vibe-package bundles are deliberately NOT copied in here.
#
# They used to be, with the reasoning "it must exist before `vite build` so Nitro
# folds it into .output/public". That was true but expensive: a `COPY --from` is a
# build-graph EDGE, so it made BuildKit hold this stage — the build's long pole,
# ~66 s of Vite/Nitro — until vibe-builder had finished its own bundling, for a
# payload the Vite build never reads.
#
# It never reads it because `public/vibe-packages/*.js` are standalone browser
# bundles addressed by STRING PATH at runtime by generated vibe pages
# (lib/rmhvibe/vibe-packages.ts, served through app/routes/api/vibe/pkg/$file.ts).
# Nothing under app/ components/ lib/ imports them, so they are not in the module
# graph — Vite's entire involvement was copying the directory verbatim into
# .output/public/.
#
# So the runner stage copies them to that same destination directly, and
# vibe-builder now runs fully parallel with this stage instead of gating it. The
# `react.js` assertion is made in vibe-builder itself, on the exact directory the
# runner copies, so the guarantee is unchanged.
# See docs/performance-audit-2026-08-12.md §3.2.

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
# Google AdSense (optional). Empty = ads fully off; see docs/adsense.md.
ARG VITE_ADSENSE_CLIENT_ID
ARG VITE_ADSENSE_SLOTS
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
    VITE_ADSENSE_CLIENT_ID=${VITE_ADSENSE_CLIENT_ID} \
    VITE_ADSENSE_SLOTS=${VITE_ADSENSE_SLOTS} \
    DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY} \
    NITRO_PRESET=${NITRO_PRESET}

# NOTE: library cover/metadata generation is NOT run here. The library PDFs are
# excluded from the build context (.dockerignore), so this stage can't render new
# covers anyway — it would only ever be a no-op. The deploy generates them on the
# host before the build (deploy.sh Step 1e), bind-mounting public/ + data/ and
# committing the fresh data/library-metadata.json into the context that this stage
# copies. Dropping the duplicate in-image run saves a Node + pdfjs/canvas startup
# every build.

# NO CACHE MOUNT HERE — and this note is why, so it isn't "restored" as an
# obvious oversight. This RUN used to carry
# `--mount=type=cache,id=vinxi-cache-${COMPOSE_PROJECT_NAME},target=/app/.vinxi`
# described as "Vite's module graph cache", plus a buildkit-cache-dance pair in
# deploy.yml to carry that mount between CI runs. It cached NOTHING: `.vinxi` is
# a **Vinxi** artifact, and TanStack Start 1.168 does not use Vinxi — it builds
# through Vite/Nitro directly. Nothing in this repo or in the build writes
# `/app/.vinxi` (the only remaining mentions are ignore-list entries), so the
# mount was an empty directory, and the CI dance that carried it was moving
# ~2.7 MB of nothing (measured, deploy run 31265996205) while adding a restore,
# an inject, and a post-build extract to the deploy path.
#
# There is also no "incremental Vite build" to preserve. A rolldown production
# build keeps no persistent on-disk module graph between runs — `node_modules/
# .vite` is the DEV dep-optimizer cache — and this RUN opens with `rm -rf .output`
# anyway. If a future Vite/Nitro version does gain a persistent build cache, add
# a mount for ITS real path and measure it; do not reinstate `.vinxi`.
#
# NODE_OPTIONS prevents OOM on large bundles (three.js, codemirror, r3f, etc.)
# (build-vibe-packages moved to the cached vibe-builder stage above; its output is
# COPYd in before this RUN, so it is no longer bundled on the vite critical path.)
# The final command reports payload size against this exact candidate output
# inside the shared BuildKit graph without rebuilding Vite in a separate CI job.
# Bundle sizing remains visible in build logs, but no longer blocks images.
RUN rm -rf .output \
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
    # Responsive image variants (OPT-24) are NOT generated here any more — they
    # come from the cached image-variants stage, COPYd in above. They are still
    # NOT optional decoration: the files under public/images/_variants/ are
    # gitignored, and every consumer emits a `srcSet` for the paths the manifest
    # lists. A `srcset` carrying `w` descriptors REPLACES `src` in the candidate
    # set, so if the files were absent the art would not fall back to the master,
    # it would fail outright. That is why `pnpm build` chains images:variants
    # before `vite build`, and why the COPY above is not removable.
    && NODE_OPTIONS='--max-old-space-size=8192' pnpm exec vite build \
    && node scripts/fix-ssr-css-hash.mjs \
    && pnpm exec tsx scripts/ci/bundle-budget.ts

# Validate, prune, and COPY straight from /app/.output. This stage has no cache
# mounts at all, so `.output` is a plain layer dir and the runner stage can
# COPY --from it directly — no need to first `cp -a` the (~1.5 GB) tree to a
# second path, which only cost disk + wall-clock every build.
# (The vibe-packages assertion is NOT here — those files no longer pass through
# this stage. It lives in vibe-builder, which produces them.)
RUN test -d /app/.output && \
    test -f /app/.output/server/index.mjs && \
    test -f /app/.output/public/robots.txt

# ── Slim runtime image: drop assets that Apache serves off the host disk ──────
# In production, Apache serves /library, /music, /models and /sprites directly
# from the host's public/ checkout (see deploy/apache/rmhstudios.com.conf), so
# these requests never reach the Node app — the container's own copy is dead
# weight (~500 MB, mostly public/library). Prune them from the Nitro output
# AFTER the validation above (which needs models/) and AFTER library cover
# generation (which already ran in `library:metadata`). Everything still served
# by Node — public/images (default avatar, read server-side), favicon, brand,
# etc. — is intentionally kept. (`public/vibe-packages` is not in this stage's
# .output at all any more: the runner copies it straight from vibe-builder, so
# there is nothing here to prune or preserve.) (music/ and sprites/ are already
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
FROM golang:1.27.1-alpine AS go-builder

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
#
# ── Shared runtime base (both images start here) ─────────────────────────────
# Everything below this line in either image is a layer on top of these, so the
# two images share them on the VPS. Nothing here depends on app source.
FROM node:24.21.0-alpine AS runtime-base

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

# ── Stage 4: Slim runner (continued) ──────────────────────────────────────────
# Every COPY here is `--link`, and there is deliberately no RUN after the first
# one. That is a build-time optimisation, not style:
#
# A plain COPY is applied ON TOP of its parent's filesystem, so BuildKit has to
# materialise the parent first. With the layer cache imported from GHCR, the
# cached node_modules layer is only a REMOTE reference — so the first non-cached
# COPY after it (the per-commit .output) forced BuildKit to download that layer
# from the registry just to stack on it: 18.7s of the deploy's critical path
# (deploy run 37999110833, `COPY --from=prod-deps` "DONE 18.7s" right after vite
# finished), for a layer whose bytes then went straight back to GHCR unchanged.
# A `--link` layer is built independently of what is below it, so a cached layer
# stays a remote reference end to end — it is cross-repo mounted on push, never
# pulled. A RUN would need the merged filesystem and undo that, hence the
# vibe-packages assertion living in vibe-builder's RUN rather than here.
#
# `--chown` is numeric because a `--link` copy cannot read this image's
# /etc/passwd: 1001:1001 is app:nodejs from runtime-base above.
FROM runtime-base AS runner

# ─── Production-only node_modules ───────────────────────────────────────
# Sourced from prod-deps (not prisma-generate) — excludes devDependencies
# (vite, esbuild, typescript, eslint, etc.) for a significantly smaller image.
# Includes @prisma/client from the prod prisma generate run.
# Rebuilds only when lockfile OR prisma schema changes.
COPY --link --from=prod-deps --chown=1001:1001 /app/node_modules ./node_modules

# ─── Nitro server output ────────────────────────────────────────────────
# .output/ contains the Nitro server bundle, static assets, and public files.
COPY --link --from=vite-builder --chown=1001:1001 /app/.output ./.output

# ─── Hosted vibe-package bundles ────────────────────────────────────────
# Standalone browser bundles (three, pixi, p5, framer-motion, …) that generated
# vibe pages load by URL. They are NOT part of the Vite module graph, so they are
# copied to their final destination here rather than routed through vite-builder
# — which is what lets vibe-builder run in parallel with the Vite build instead of
# gating it. Placed AFTER the .output COPY so it cannot clobber them. (The
# `react.js` assertion lives in vibe-builder: see the note above this stage.)
# See docs/performance-audit-2026-08-12.md §3.2.
COPY --link --from=vibe-builder --chown=1001:1001 /app/public/vibe-packages ./.output/public/vibe-packages

# ─── Custom server bundles (from env-agnostic stage) ────────────────────
COPY --link --from=server-builder --chown=1001:1001 /app/dist-server ./dist-server

# ─── Supporting files (from build context, not a builder stage) ─────────
# NOTE: content/ is intentionally NOT copied. It's untracked, host-only seed
# material (content/blog/*.mdx, content/news/*.mdx) that fed one-off seed/migrate
# scripts (scripts/seed-news.ts, scripts/migrate-blogs.ts). Blog + news are served
# from the database at runtime (prisma.blogPost / news tables), so nothing in the
# image reads content/. Since the build moved to CI (where content/ isn't in the
# checkout), baking it would fail; to run a seed script against it, bind-mount the
# host content/ into a one-shot container (like deploy.sh does for public/).
COPY --link --chown=1001:1001 scripts ./scripts
COPY --link --chown=1001:1001 data ./data
COPY --link --chown=1001:1001 prisma ./prisma
COPY --link --chown=1001:1001 prisma.config.ts ./prisma.config.ts
COPY --link --chown=1001:1001 package.json ./package.json

USER app

EXPOSE 7005 7001 7676 7003

CMD ["node", ".output/server/index.mjs"]

# ── Stage 4b: Full runtime (Go supervisor + status + assets) ─────────────────
# Everything ONLY the background fleet needs:
#   - Go binaries: supervisor runs the workers as goroutines; status is the Go
#     status page server; assets serves the R2-backed static paths.
#   - Chromium + fonts: the vibe-worker captures gallery thumbnails via Go
#     chromedp, which drives the system Chromium (musl Alpine can't run
#     Playwright's own download — point it at the OS Chromium below).
# Used ONLY by the `supervisor`, `status` and `assets` compose services.
#
# FROM runtime-base, NOT FROM runner. Those three services are Go binaries: they
# never read node_modules, .output, dist-server or scripts/ (vibe-worker renders
# from a data: URL; the only path any of them touches is the /app/db volume). The
# image used to be built FROM the slim runner anyway, which put Chromium ABOVE the
# per-commit .output layer — so although this stage was meant to isolate "the
# slow apk layer", every web change re-ran it (deploy run 37999110833: apk 7.4s,
# then 14.5s re-compressing ~400 MB of Chromium, then a push), and the VPS
# re-pulled and re-extracted Chromium on every single deploy. It also made this
# image wait for the whole vite build, though it uses nothing from it.
#
# From runtime-base, Chromium sits on layers that never change with app source,
# so it is cached (inline cache on this image — see docker-bake.hcl) and a
# web-only commit gives this image no new layers at all. It still shares
# runtime-base with the slim image on the VPS, so splitting costs no disk.
#
# CHROMIUM_REFRESH busts the apk layer on a schedule (docker-bake.hcl passes the
# year-month), so Chromium keeps picking up Alpine's security updates — roughly
# monthly, where it used to happen per commit only as a side effect of the bug
# above.
FROM runtime-base AS runner-full

ARG CHROMIUM_REFRESH=
RUN echo "chromium refresh: ${CHROMIUM_REFRESH:-unset}" \
    && apk add --no-cache \
    chromium nss freetype harfbuzz ttf-freefont font-noto-emoji

# Reuse the system Chromium for chromedp/Playwright instead of a (musl-incompatible) download.
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# ─── Go binaries (supervisor, status, assets, workers) ──────────────────
# Compiled in the go-builder stage (CGO_ENABLED=0, fully static). `--link` so the
# cached Chromium layer below stays a remote reference (see Stage 4).
COPY --link --from=go-builder --chown=1001:1001 /app/bin/ /app/bin/

USER app

CMD ["/app/bin/supervisor"]

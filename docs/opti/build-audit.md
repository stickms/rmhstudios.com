# Build Speed & Storage Audit (2026-06-20)

Goal: fastest possible builds while keeping disk usage low. Audited the Docker
build (`deploy.sh` → `Dockerfile`), `.dockerignore`, and the build scripts.

## TL;DR

The pipeline is already well-engineered (parallel BuildKit stages, pnpm/Vinxi
cache mounts, good layer ordering, disk-aware cache pruning). The two real drags
were **(1)** ~500 MB of assets being shipped through the build context + image
that Apache now serves off the host, and **(2)** the build-cache hard-reset
ceiling, which forces periodic *cold* builds. (1) is fixed below; (2) is a tuning
recommendation that needs the VPS's real disk numbers.

## What's already good (don't touch)

- **Parallel stages** — `server-builder` (esbuild, env-agnostic) and
  `vite-builder` run concurrently; `deps`/`prisma-generate` are split so schema
  changes don't trigger a full `pnpm install`.
- **Cache mounts** — pnpm store + Vinxi cache persist across builds.
- **Layer ordering** — `COPY public` before `COPY . .`, so source edits don't
  bust the big public layer.
- **Disk-aware pruning** — `deploy.sh` keeps the cache *warm* when disk is
  healthy and only wipes under pressure. Rollback images capped at 2.
- Vite already has `reportCompressedSize:false`, `sourcemap:false`.

## Changes made (this commit)

### 1. Stop shipping Apache-served assets in the image — `Dockerfile`
After the build + validation, prune the dirs Apache serves off the host:
```dockerfile
RUN rm -rf /app/build-output/public/{library,models,music,sprites}
```
Runtime image shrinks ~**500 MB** (mostly `public/library`). Smaller image →
faster pulls, faster `compose up`, less disk per rollback tag (×2 kept).

### 2. Keep library PDFs out of the build context — `.dockerignore`
```
public/library/*.pdf      # ~488 MB, served by Apache from host
public/vibe-packages      # regenerated in-build by build-vibe-packages
```
- Build context shrinks ~488 MB → less to send to the daemon **every build**.
- `COPY public` layer shrinks ~488 MB → smaller build cache → the 8 GB ceiling
  (below) is hit far less often → **fewer cold builds**.
- `covers/` is intentionally kept (the metadata step reads it); `data/library-
  metadata.json` (committed) is the catalogue the image actually uses.

### 3. Make the metadata step safe with PDFs absent — `generate-library-metadata.ts`
The script rebuilds `library-metadata.json` from the PDFs it finds and overwrites
the file. With PDFs now excluded from the build context it would have written an
empty object. Added an early guard: **0 PDFs → log and exit without writing**, so
the committed metadata is preserved. (Normal local runs with PDFs present are
unchanged.)

### 4. Automatic library cover/metadata generation in prod — `deploy.sh` + `package.json`
Because PDFs are excluded from the build context, covers can't be generated
*inside* the build. Instead, `deploy.sh` generates them **on the host before the
build** (new "Generating library covers + metadata" step): it runs the previous
app image as a one-shot with the host's `public/` + `data/` bind-mounted and
`node scripts/generate-library-metadata.ts`. This renders only NEW covers into
`public/library/covers` (Apache serves them off the host) and refreshes
`data/library-metadata.json`, which `vite build` then bakes into the image
(`lib/library` imports it). `@napi-rs/canvas` was moved to runtime
`dependencies` so the image carries the renderer (~15 MB). The step is
best-effort — any failure falls back to the committed metadata and never blocks
a deploy — and is a no-op on the first deploy (no prior image yet).

> **Net workflow:** adding a library PDF is now fully automatic in prod — drop
> the PDF in `public/library/`, push, deploy. The cover + metadata are generated
> host-side during the deploy; the PDF is served by Apache from the host
> checkout. (Generating locally with `pnpm run library:metadata` still works and
> lets you preview/commit covers ahead of time.)

## Recommendations (need VPS disk numbers — not changed blindly)

### A. Raise the build-cache reset ceiling
`deploy.sh` does a full `builder prune -af` (→ next build is **cold**) whenever
the cache exceeds `BUILD_CACHE_CEILING_GB=8`. This project's warm cache (three.js,
monaco, tiptap, pixi, pdfjs, playwright + Vinxi graph) plausibly *needs* more than
8 GB, so the ceiling likely trips often — the prime suspect for "builds take a
long time." Changes 1–2 cut the cache footprint, buying headroom. If `df -h` on
the Docker data dir shows room, raise the ceiling (e.g. 12–15 GB) and the
pre-build low-disk threshold accordingly — each cold build avoided saves the full
`pnpm install` (~70 s) + a cold `vite build` (minutes).

### B. Trim cache *mounts* surgically instead of nuking everything
The hard reset exists because `--keep-storage` can't trim *inside* the pnpm-store
/ Vinxi mounts, so they creep. A lighter touch: periodically (e.g. every Nth
deploy) run `pnpm store prune` to drop unreferenced package versions, and clear
stale Vinxi entries, rather than a full `builder prune -af`. Keeps layer cache
(node_modules, deps) warm while bounding the mounts.

### C. (Optional) Verify base-image layer caching
`runner` does `apk add chromium nss freetype …` — a cached layer that only
rebuilds if the `node:24-alpine` base digest changes. Pin/refresh deliberately so
a silent base bump doesn't cause a surprise slow build.

## Expected impact of changes 1–3

| | Before | After |
|---|---|---|
| Build context | ~520 MB public | ~30 MB public |
| `COPY public` layer / cache | ~520 MB | ~30 MB |
| Runtime image (`public` in `.output`) | full assets | library/models/music/sprites removed |
| Cold-build frequency | ceiling tripped often | tripped less (smaller cache) |

Net: smaller storage **and** fewer cold builds — the two goals don't conflict
here, because most of the weight was assets that no longer belong in the image.

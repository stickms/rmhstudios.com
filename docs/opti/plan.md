# RMH Studios — Full-Website Optimization & Dead-Code Removal Plan

> Generated 2026-06-20 from a full read of the codebase. Scope: `app/`, `components/`,
> `lib/`, `hooks/`, `stores/`, `server/`, `scripts/`, `public/`, build config, and deps.

## Execution status (updated 2026-06-20)

Everything except the CDN migration has been executed. Several items turned out to be
**already handled by the codebase/framework** — recorded here so they aren't re-attempted.

| Item | Status |
|---|---|
| 0.1 Library asset audit | ✅ Audited — 0 orphans (all 44 files referenced); size reduction deferred to CDN |
| 0.1 CDN migration of `public/` | ⏸️ **Deferred (per request)** |
| 0.2 Gitignore generated vibe-packages | ✅ Already gitignored & untracked |
| 0.3 Delete legacy `server/socket-server.ts` | ✅ Deleted + tsconfig entry removed |
| 0.4 Remove `threejs-brain-animation` | ✅ Removed |
| 1.1 Lazy-load heavy routes | ✅ `autoCodeSplitting` is the framework **default (on)** — components already split; no change needed |
| 1.2/1.3 Large-module + vendor chunk splitting | ✅ Verified: `mockData.ts`/research papers isolated to their route chunks; vendor chunks already configured |
| 1.4 Strip client `console.log` | ✅ Added `esbuild.pure` (drops `console.log`/`debug` at minify; keeps warn/error) |
| 2.1 Server infra dedup | ✅ Already factored into `server/shared/`; `auth.ts`/`config.ts` left **intentionally divergent** (rmhbox has a Discord-auth path; security-sensitive) |
| 2.1b recap/kowloon wiring | ✅ `recap` added to `build`/`start`; orphaned `kowloon-knockout/relay.ts` deleted |
| 3.1 Consolidate formatters | ✅ `formatCount`/`timeAgoShort`/`formatRelativeTime` in `lib/utils.ts`; 7 call-sites updated |
| 3.2 Standardize on `OptimizedImage` | ✅ Build-thumbnail call-sites converted (avatars/blob-previews/external art left as-is) |
| 3.3 Markdown stack | ✅ Reviewed — both libs legitimately used; no change |
| 3.4 TODO triage | ✅ 4 markers, all legit feature notes; nothing to remove |
| 4 Repo hygiene | ✅ `src/` deleted; `clean` script added; `.DS_Store` already untracked |
| 5 Unused-dep sweep | ✅ Removed `@radix-ui/react-popover`, `@tanstack/react-virtual`, `embla-carousel-autoplay`; **knip file/export sweep left as manual follow-up** (too many false positives to auto-act on) |

Verification: `pnpm lint` (0 errors) + `tsc --noEmit` (0 errors) on changed files; lockfile re-synced.

---
>
> **Read this first — two project-specific traps that make "obvious" cleanups wrong:**
> 1. **`lib/rmhvibe/vibe-packages.ts` is a curated registry.** Packages like `gsap`, `d3`,
>    `konva`, `p5`, `chart.js`, `matter-js`, `lodash-es` have **zero import sites in the app**
>    but are installed *on purpose* so the RMHVibe sandbox can host/inline them for
>    user-generated pages. **Do not delete them.** A dep is only truly unused if it's absent
>    from both the app *and* `VIBE_PACKAGES`.
> 2. **`*.server.ts` files are stubbed on the client** by the `stubServerFiles()` Vite plugin
>    (`vite.config.ts:15`). Don't "fix" a client import of a server file — that's by design.

---

## Codebase at a glance

| Area | Files | Lines | Notes |
|---|---|---|---|
| `components/` | 612 | 127,924 | Largest surface; per-feature subtrees |
| `lib/` | 430 | 108,170 | Game engines, data, schemas |
| `server/` | 110 | 36,490 | 8 standalone Node services + handlers |
| `app/` | 269 | 31,416 | 130+ TanStack routes (all eager) |
| `go-services/` | 85 | 18,490 | Separate Go microservices |
| `public/` | — | **743 MB** | git-tracked assets (see §1) |

The app is healthy and already does several things right (manual vendor chunks, server-file
stubbing, heavy 3D/editor libs externalized). The wins below are concentrated in **(a) the
asset/repo weight, (b) eager route loading, and (c) duplicated server infrastructure.**

---

## Priority 0 — Highest impact, low risk

### 0.1 Reduce the 743 MB of git-tracked public assets
`public/` is **743 MB and fully committed to git** (none of it is gitignored):

| Dir | Size |
|---|---|
| `public/library` | 488 MB |
| `public/sprites` | 123 MB |
| `public/music` | 95 MB |
| `public/models` | 20 MB |
| `public/vibe-packages` | 8.7 MB (generated — see 0.2) |
| `public/images` | 7.5 MB |

This bloats every clone, the Docker build context, and image layers.

**Actions (in priority order):**
- Move large binary media (`library`, `music`, `models`, large `sprites`) to object storage
  (S3/R2/Spaces) or Git LFS and serve via CDN. The app already has an image proxy
  (`app/routes/api/image-proxy.ts`) and `lib/image-optimize.ts` to build on.
- Audit `public/library` (488 MB) for orphaned/superseded covers and PDFs against
  `data/library-metadata.json`; delete anything not referenced.
- Confirm `.dockerignore` excludes whatever moves to CDN so the build context shrinks.
- **Verify before deleting:** grep each asset path against the codebase; library/build assets
  are often referenced by string-built URLs, not literal imports.

### 0.2 Stop committing generated `public/vibe-packages/`
These are built by `scripts/build-vibe-packages.ts` (run in `pnpm build`). If committed,
they're 8.7 MB of regenerable output. **Gitignore the build outputs**, keep the build step.
Confirm the Docker/deploy flow runs `build-vibe-packages` (it does, via the `build` script).

### 0.3 Delete the orphaned legacy socket server
`server/socket-server.ts` (**1,164 lines**) is superseded by the `server/socket-server/`
directory. It is imported **nowhere** — its only reference is `tsconfig.server.json`.

**Action:** delete `server/socket-server.ts` and remove its entry from `tsconfig.server.json`.
Confirm `server/socket-server/index.ts` is the one wired into `package.json` and `Dockerfile`
(it is).

### 0.4 Remove the one genuinely-unused dependency
`threejs-brain-animation` appears **only in `package.json`** — not in the app, not in scripts,
not in `VIBE_PACKAGES`. Remove it.

> Re-confirm with `grep -rl "threejs-brain-animation" --include=*.ts --include=*.tsx .`
> (excluding `node_modules`) before removing. Run the same check for any other dep you suspect,
> and **cross-check against `VIBE_PACKAGES` first** (see top-of-file trap #1).

---

## Priority 1 — Performance: client bundle & route loading

### 1.1 Lazy-load heavy routes (biggest perf lever)
**All 130+ routes use `createFileRoute` and `app/routeTree.gen.ts` statically imports every
one.** `createLazyFileRoute` usage is **0**. The Vite config itself documents the fallout:

> "With 130 eager routes the crawl never settles… the page never hydrates."
> (`vite.config.ts:249`, the `holdUntilCrawlEnd: false` workaround)

Heavy game/editor routes (`altair`, `velum2099`, `void-breaker`, `kowloon-knockout`,
`rmhcode`/Monaco, `temple-of-joy`, `slice-it`, `dream-rift`, `synapse-storm`) are pulled into
the initial graph even when a visitor only wants a marketing page under `_site/`.

**Action:** split route code from route definitions using TanStack Router's lazy pattern
(`*.lazy.tsx` / `createLazyFileRoute`) for the heavy game/tool routes first. Several routes
already do component-level `lazy()` (e.g. `altair/index.tsx`, `velum2099`, `neon-driftway`) —
extend that consistently and push it up to the route boundary so the route *module* itself is
deferred, not just its canvas. Measure with `pnpm build` chunk output before/after.

### 1.2 Verify per-feature splitting of the largest data/engine modules
Large modules that should each live in their own lazily-loaded chunk (confirm they aren't in a
shared eager chunk):
- `lib/rmh-eats/mockData.ts` — **7,234 lines** (mock data shipped to client?). If this is demo
  data, gate it behind a dynamic import or move it server-side.
- `components/research/papers/*.tsx` — three files at ~3,000 lines each. These are static
  article content; lazy-load per paper (route is already `research.$slug.tsx`).
- `lib/temple-of-joy/data/upgrades.ts` (2,991), `lib/altair/engine/*`, `components/velum2099/
  game/scene/CyberpunkScene.ts` (2,297). Ensure each is reached only through its route chunk.

### 1.3 Confirm the existing manual chunks still hold
`vite.config.ts` already isolates `three`, `monaco` (sub-split by area), `tiptap`, `pixi`,
`recharts`, `framer-motion`. Keep this — just verify after route-splitting that these vendor
chunks aren't being pulled into the entry chunk by an eager route import.

### 1.4 Strip `console.log` from production client code
**55 `console.log` calls** in `app/`/`components/`/`lib/`. Replace with a gated logger or strip
via build (`esbuild` `drop: ['console']` for the client build), keeping intentional
`console.warn`/`error`. Don't blanket-drop on the server services — they use real logging.

---

## Priority 2 — Server: deduplicate per-service infrastructure

Each standalone service (`socket-server`, `rmhbox`, `rmhtube`, `rmhmusic`, `discord-bot`)
re-implements the same plumbing. `server/shared/` already exists and is the right home, but is
under-used:

| File | Copies | Canonical home |
|---|---|---|
| `prisma-client.ts` | 6 | `server/shared/prisma-client.ts` (already 45 lines, fuller) |
| `logger.ts` | 6 | `server/shared/logger.ts` (already 52 lines) |
| `rate-limit.ts` | 4 | `server/shared/rate-limit.ts` (already 93 lines) |
| `auth.ts` | 3 (rmhbox/socket/rmhtube, 100–154 lines) | extract shared core |
| `config.ts` | 4 | extract shared env-parsing helper, keep per-service values |

**Action:** the per-service `prisma-client.ts`/`logger.ts` files are mostly 7–22 line re-stubs.
Re-export from `server/shared/` instead of duplicating, then delete the duplicates. For `auth.ts`
and `config.ts`, factor the shared validation/env-parsing into `server/shared/` and leave only
service-specific values behind. This is the single largest **maintenance**-redundancy win in
the server tree. Each service is bundled independently (esbuild `--packages=external`), so
sharing a module has no bundling downside.

### 2.1 Fix the recap/kowloon build inconsistencies (found while mapping services)
- `server/recap/index.ts` (309 lines) is built in the **Dockerfile** (line 94) and run in
  **docker-compose** (line 141) but is **absent from `package.json`'s `build`/`start`/dev
  scripts.** Local builds never produce it. Add it to the npm scripts or document why it's
  Docker-only.
- `server/kowloon-knockout/relay.ts` (159 lines) is built/wired **nowhere** (gameplay appears
  to run through `server/socket-server/handlers/kowloon-knockout.ts`). Confirm it's live; if
  not, delete it.

---

## Priority 3 — Code redundancy & consistency

### 3.1 Consolidate duplicated date/number formatting
`formatDate`/`formatNumber`/`formatDistanceToNow` helpers are re-defined across at least:
`lib/temple-of-joy/numbers.ts`, `lib/lights-out/seed.ts`, `lib/daily-puzzles/seed.ts`,
`components/user-builds/BuildDetail.tsx`, `components/feed/ConversationView.tsx`,
`components/feed/ProfileColumn.tsx`, `components/rmhcode/TokenGenerator.tsx`.

**Action:** add formatters to `lib/utils.ts` (already the home of `cn`) and replace local
copies. `date-fns` is already a dependency — use it consistently rather than hand-rolled
relative-time logic.

### 3.2 Standardize on the existing image component
`components/ui/OptimizedImage.tsx` + `lib/image-optimize.ts` exist, but several call sites still
build `<img>`/URLs by hand (`components/builds/OfficialBuildCard.tsx`,
`components/user-builds/BuildCard.tsx`, etc.). Route all user/library imagery through
`OptimizedImage` so sizing/lazy/`loading="lazy"` is consistent.

### 3.3 Markdown stack — both libs are used; keep but scope
`marked` (3 sites) and `react-markdown` (4 sites) coexist. This is acceptable (server-side
string rendering vs React rendering), but confirm neither is pulled into a shared eager chunk,
and pick one for any *new* markdown rendering to avoid a third path.

### 3.4 Address the 10 TODO/FIXME/HACK markers
Low volume (10 across `app`/`components`/`lib`/`server`). Triage in one pass: fix the trivial
ones, convert real work into tracked issues, delete stale ones.

---

## Priority 4 — Repo hygiene / build artifacts

- **`dist-server/`** exists on disk with stale Feb/Mar build output. It *is* gitignored (good),
  but clean it locally (`rm -rf dist-server`) so it's regenerated fresh.
- **`.output/` is 1.5 GB** locally (gitignored). Add a `clean` script
  (`rimraf .output dist-server .tanstack tsconfig.tsbuildinfo`) and document it.
- **`src/` is empty** — delete the directory.
- **`.DS_Store` files are committed** throughout (`server/.DS_Store`, `components/.DS_Store`,
  `lib/.DS_Store`, `public/.DS_Store`, `docs/.DS_Store`, `cli/.DS_Store`, `db/.DS_Store`,
  root). Add `.DS_Store` to `.gitignore` and `git rm --cached` them.

---

## Priority 5 — Dependency audit (do carefully)

Run a tooling-assisted pass, but **filter every result against `VIBE_PACKAGES`** (trap #1).

```bash
# Candidates: in package.json, but check VIBE_PACKAGES before removing
for p in <suspect>; do
  echo "$p: app=$(grep -rl "['\"]$p['\"]" --include=*.ts --include=*.tsx app components lib server scripts hooks stores | wc -l)"
done
```

Already verified in this pass:
- `threejs-brain-animation` → **truly unused, remove** (§0.4).
- `gsap`, `d3`, `konva`, `p5`, `chart.js`, `matter-js` → **0 app sites but in `VIBE_PACKAGES` (hosted). KEEP.**
- `lodash-es` → 0 app sites but `VIBE_PACKAGES` inline tier (must stay a runtime dep). KEEP.
- `react-player` (1), `pixi.js` (2), `jszip` (1), `turndown` (1) → low but real usage. Keep.

Then consider `depcheck`/`knip` for a fuller unused-export and unused-file sweep across
`components/` and `lib/` (the two largest trees), which static greps here can't fully cover.
**Run `knip` and treat its output as candidates, not commands** — verify each before deleting.

---

## Suggested execution order

1. **P0** — assets to CDN/LFS, gitignore generated/`.DS_Store`, delete `server/socket-server.ts`
   + empty `src/`, remove `threejs-brain-animation`. *(High impact, near-zero risk.)*
2. **P1.1** — lazy-load heavy routes; re-measure bundle. *(Biggest runtime win.)*
3. **P2** — collapse duplicated server infra into `server/shared/`; fix recap/kowloon wiring.
4. **P1.4 + P3** — strip client `console.log`, consolidate formatters/image usage.
5. **P5** — `knip`/`depcheck` sweep for unused files/exports.

## Verification per change
- `pnpm lint` and a typecheck (`tsc -p tsconfig.json --noEmit`) after each batch.
- `pnpm build` and diff the client chunk list / sizes before vs after route-splitting.
- `pnpm epic:test` / `vitest` where the touched area has coverage.
- For asset removals: grep the path across the repo (literal **and** string-constructed URLs)
  before deleting; assets are frequently referenced via interpolated paths.
- For dep removals: install clean (`pnpm install`) and run `pnpm build` to catch transitive use.

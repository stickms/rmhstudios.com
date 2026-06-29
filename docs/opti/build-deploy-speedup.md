# Build & Deploy Speedup Plan (2026-06-29)

> Scope: the **production deploy path** — `deploy.sh` → `docker compose build` →
> `Dockerfile` (`web` = `runner`, `supervisor` = `runner-full`), plus the Vite
> build itself and the GitHub Actions CI. Read after `docs/opti/build-audit.md`
> (2026-06-20), which already shipped the asset-out-of-image and library-on-host
> work. This doc is the *next* layer of wins, measured against the pipeline as it
> exists today (content-hash build skip, blue/green hotswap, backgrounded R2 sync
> all already in place).

## TL;DR

The pipeline is genuinely well-engineered, so the remaining wins are specific,
not sweeping. Ranked by **(impact ÷ risk)**:

| # | Lever | Where | Est. saving / deploy | Risk | Effort | Status |
|---|---|---|---|---|---|---|
| 1 | `COMPOSE_BAKE=1` — build `web`+`supervisor` as one parallel DAG | `deploy.sh` build step | **30–90 s** on changed builds | low | 1 line | ✅ done 2026-06-29 |
| 2 | Gate the per-deploy `library:metadata` container boot | `deploy.sh` Step 1e | **5–10 s** every deploy | low | ~15 lines | ✅ done 2026-06-29 |
| 3 | Drop the redundant `cp -a .output build-output` (~1.5 GB copy) | `Dockerfile` vite-builder | **3–8 s** every changed build | low–med | ~5 lines | ✅ done 2026-06-29 |
| 4 | ~~Lazy-load heavy routes~~ → **investigated, premise wrong** (see §4) | `app/**` routes | ~0 build-time | — | — | ❌ not a build win — routes already split |
| 4b | Lazy-load i18n per language (eager 2.2 MB → active lang only) | `lib/i18n/resources.ts` | **runtime**: ~600 KB initial JS | med (SSR) | medium refactor | 🔎 found 2026-06-29 — see §4 |
| 4c | `stub-server-files` resolveId pre-filter (skip needless `this.resolve`) | `vite.config.ts` | ~3–4% client build (more when cold) | low | 1 line | ✅ done 2026-06-29 |
| 5 | Surgical cache-mount trimming instead of full `builder prune -af` | `deploy.sh` Step 1b | avoids occasional **cold** build (~2–4 min) | med | ~20 lines | ⏳ deferred — see note |
| 6 | `pnpm prune --prod` instead of a second `pnpm install --prod` | `Dockerfile` prod-deps | seconds, only on lockfile/schema change | low | 1 line | ⚠️ kept as-is — see note |
| 7 | Offload image build to CI + ship via registry (multi-node path) | CI + `make prod` | moves build off the request path | high | large | ⛔ not recommended (needs infra) |

Items **1–3 (Batch A) are implemented** (2026-06-29): low risk, touch only the
deploy edges, and together remove ~40–110 s of wall-clock from a typical changed
deploy. Item **4** is the highest *ceiling* but is a real refactor (a build +
bundle-diff loop per route batch) — staged as its own PR. Items **5–7** are
situational; see the per-item notes below for why each is deferred rather than
applied blind.

> **Verify Batch A on the first real deploy.** All three changes fail *safely*
> (the build-validation `test -f` / `test -d` aborts before any bad image ships,
> so the old container keeps serving), but none could be run against the actual
> ARM64 prod host from the dev environment. Watch the first deploy's per-step
> `step_done` timings and confirm both `:latest` + `:${GIT_SHA}` images rebuild.

---

## How a deploy actually spends its time today

From `deploy.sh`, a normal source-change deploy runs roughly:

1. **Step 1** — `git fetch`/`reset` (fast).
2. **Step 1b** — pre-build disk cleanup; *usually* a no-op prune, but under disk
   pressure escalates to `builder prune -af` → next build is **cold** (see #5).
3. **Step 1e** — `library:metadata`: boots a **one-shot container** (node +
   pdfjs/canvas, ~5–10 s) on *every* deploy, even when no PDF changed (#2).
4. **Step 2** — `build_inputs_hash` check. If nothing build-relevant changed,
   the whole build is skipped and images are re-tagged (already excellent). On a
   real change → `dc build web supervisor` (the long pole, #1/#3/#4).
5. **Step 2a** — R2 asset sync, **backgrounded** (good — overlaps the rest).
6. **Steps 3–6** — migrations (already short-circuited when schema is current),
   `compose up` (everything but web), blue/green `hotswap-web.sh`, health checks,
   prune. All already tight.

So on the common "code changed" path, the wall-clock is dominated by **Step 2's
`dc build`**, fronted by the **always-on library container boot (Step 1e)**.
Everything 1–3 below targets exactly that.

---

## 1. Build both images as one parallel DAG (`COMPOSE_BAKE=1`)

**Mechanism.** `deploy.sh:611` runs `dc build web supervisor`. Plain Compose v2
builds services **sequentially**: it fully builds `web` (target `runner`:
`deps → prisma-generate → server-builder ∥ vite-builder → runner`), *then* builds
`supervisor` (target `runner-full`). `runner-full` is `runner` + the `go-builder`
stage + the Chromium/git apk layer. Because it's a second, separate BuildKit
invocation, **`go-builder` does not start until the entire `web` build has
finished** — even though it depends on nothing in the web graph.

With `COMPOSE_BAKE=1`, Compose delegates to `buildx bake`, which lowers both
services into a **single BuildKit graph**. BuildKit then schedules every
independent stage concurrently: `go-builder` (Go compile of all `cmd/...`, +
`go mod download`) runs **in parallel with `vite-builder`**, and the shared
`deps`/`prisma-generate`/`server-builder` stages are de-duplicated to one
execution instead of being re-walked per service.

**Change (illustrative — not applied):**
```sh
# deploy.sh, Step 2
if ! COMPOSE_BAKE=1 dc build web supervisor; then
```

**Impact.** On any build where `go-services/` changed (or the Go layer is cold),
the Go compile + static link currently runs *after* the ~minutes-long Vite build;
bake folds it under the Vite build's shadow. Estimated **30–90 s** on changed
builds, ~0 on a fully warm cache. The Dockerfile header already *claims* "BuildKit
executes independent stages in PARALLEL" — that's true *within* one target, but
`dc build A B` without bake gives you two serial targets. Bake makes the claim
actually hold across both images.

**Risk: low.** Same Dockerfile, same args, same outputs; only the scheduler
changes. Verify the two images are byte-equivalent and that the SHA-tag/rollback
flow is unaffected. Roll back by removing the env var.

**Verification.** Time `dc build web supervisor` vs `COMPOSE_BAKE=1 dc build …`
with a warm cache after touching one file under `go-services/` and one under
`app/`. Confirm `docker image inspect` shows both `:latest` tags rebuilt.

---

## 2. Stop booting the library-metadata container on every deploy

**Mechanism.** Step 1e (`deploy.sh:545`) runs the previous app image as a
one-shot (`node scripts/generate-library-metadata.ts`) with `public/` + `data/`
bind-mounted, to render covers for **new** PDFs and refresh
`data/library-metadata.json` *before* the Vite build bakes it in. The script is
idempotent and renders only new covers — but the **container + node + pdfjs/canvas
startup (~5–10 s) happens unconditionally**, even on the overwhelmingly common
deploy where no PDF was added.

**Change (illustrative).** Cheaply detect whether any `public/library/*.pdf` is
newer than `data/library-metadata.json` (or changed in the just-pulled commit
range) and skip the container entirely otherwise:
```sh
# Only boot the renderer if a PDF actually changed since the last build.
if find public/library -maxdepth 1 -name '*.pdf' -newer data/library-metadata.json | grep -q .; then
    # …existing docker run…
else
    log "No new library PDFs — skipping cover/metadata generation."
fi
```
(Or diff `git diff --name-only HEAD@{1} HEAD -- public/library` around the
Step 1 pull.)

**Impact.** Removes a **5–10 s** node+canvas boot from essentially every deploy.
Small but it's pure, unconditional overhead on the critical path today.

**Risk: low.** The step is already best-effort with a committed-metadata
fallback; skipping when nothing changed is strictly a no-op. Keep the existing
"no prior image" guard. Edge case to preserve: a *cover* deleted from
`public/library/covers` without a PDF change — rare; a `DEPLOY_FORCE_LIBRARY=1`
override covers it.

---

## 3. Don't copy `.output` to `build-output` (~1.5 GB, every changed build)

**Mechanism.** In the vite-builder stage (`Dockerfile:169–175`):
```dockerfile
RUN … rm -rf .output \
    && pnpm run build-vibe-packages \
    && vite build \
    && node scripts/fix-ssr-css-hash.mjs \
    && cp -a .output /app/build-output
```
The final `cp -a .output /app/build-output` duplicates the entire Nitro output
(pre-prune, ~1.5 GB) on disk so later steps reference a stable `build-output`
path. But `.vinxi` is the only cache *mount* here — `.output` is an ordinary
build-layer dir, so nothing requires the copy. The validation
(`Dockerfile:177`), the Apache-asset prune (`:193`), and the runner `COPY --from`
(`:268`) can all target `/app/.output` directly.

**Change (illustrative):** drop the `cp -a`, and repoint the three downstream
references from `/app/build-output` → `/app/.output`.

**Impact.** Saves a full-tree `cp -a` of the Nitro output every time the
vite-builder layer rebuilds (i.e. every source change) — **~3–8 s** depending on
disk, plus the transient disk headroom the duplicate consumes (relevant to the
disk-pressure path in #5).

**Risk: low–med.** Purely mechanical, but it's three coordinated references in
the Dockerfile — get all three or the build breaks loudly (good: it fails the
validation `test -f` immediately, never ships a bad image). Double-check nothing
else in the repo greps for `build-output`.

> Note: confirm the `cp` wasn't deliberately isolating `.output` from the
> `.vinxi` cache-mount semantics. Reading the stage, `.output` and `.vinxi` are
> distinct paths and `.output` is rebuilt fresh each run, so the copy looks
> purely vestigial — but validate on a warm-cache build before trusting it.

---

## 4. Route lazy-loading — investigated and measured; **premise was wrong**

The original framing claimed eager routes inflated the **Vite build** (the
deploy's long pole) and that splitting them would "make the long pole shorter."
A measured profile (2026-06-29, warm `node_modules`, local) disproves both halves:

### 4.0 Measured build profile

| Phase | Time | Notes |
|---|---|---|
| `pnpm run build-vibe-packages` | ~9 s | 16 hosted ESM bundles; cached via mount in Docker |
| `vite build` — **client** | ~16 s | 7 830 modules → assets |
| `vite build` — **ssr** | ~12 s | 2 955 modules |
| `vite build` — **nitro** | ~7 s | 5 676 modules → server bundle |
| **`vite build` total** | **~40 s** | steady-state |

> The very first build after `pnpm install` measured ~63 s (client 37.7 s) but
> every subsequent build — even after deleting `.nitro`/`.tanstack` — is ~40 s.
> That first-run gap is OS page-cache / native-module warmup, **not** a
> controllable build cache. So steady-state is ~40 s and the build is already
> well-optimized; cache *warmth* (which `deploy.sh` already protects) is the
> dominant cold-vs-warm factor, exactly as build-audit.md §A noted.

### 4.1 Why route-splitting is a no-op here

- **No route statically imports a heavy lib.** All 179 route files were grepped
  for top-level `three`/`pixi.js`/`monaco-editor`/`@tiptap`/`recharts`/`maplibre`/
  `konva`/`p5`/`matter-js`/`gsap`/`@react-three` imports → **zero** hits. Heavy
  libs are always reached through `lazy()` or child components.
- **Routes are already code-split.** Even `altair.tsx`, which *statically* imports
  `AltairShell`, builds into its own async chunk (`altair-*.js`, 75 KB) — it is
  **not** in the 450 KB entry chunk. TanStack Start / Rolldown already splits
  route modules into per-route async chunks. Converting them to
  `createLazyFileRoute` would move code that is *already* in an async chunk into
  another async chunk: no change.
- **Lazy ≠ less build work anyway.** Even if a route weren't split, Vite/Rolldown
  transforms every reachable module regardless of static-vs-dynamic import.
  Lazy-loading reassigns code to a deferred chunk (a *runtime* win); it does not
  remove modules from the graph, so it does **not** cut build time. The original
  doc conflated "shrink the eager graph" with "shrink the build" — they're
  different. **Net: dropped as a build-time lever.**

### 4b. The real eager bloat is i18n (a *runtime* win)

The one genuinely-eager heavy payload is translations, not routes.
`lib/i18n/resources.ts` **statically imports every locale JSON for all three
languages** (`en` 428 KB + `ar` 940 KB + `zh` 844 KB = **2.2 MB raw**), bundled
into the eagerly-loaded `localeStore`/`RESOURCES` chunk (**866 KB** minified
client-side). `lib/i18n/instances.ts` builds the i18n instances from `RESOURCES`
at startup and is pulled in by `components/Providers.tsx` (eager), so **every
visitor downloads English + Arabic + Chinese** even though they render one.

**Win:** load only the active language eagerly (the server already knows it from
the cookie/`Accept-Language`) and lazy-load the others on switch → ~600 KB+ less
initial JS for the typical English visitor, and ~1.4 MB less for everyone.

**Risk: med (SSR-sensitive).** The server must render synchronously in the active
language, so the refactor has to keep the active language's namespaces available
at SSR time and only defer the *other* languages. Needs a build + an SSR smoke
test in `en`/`ar`/`zh` to rule out missing-namespace fallbacks and hydration
mismatches. Tracked as its own task — it's a runtime/TTI improvement, **not** a
build/deploy speedup, so it's out of this doc's primary scope but recorded here
because it's the highest-value eager-payload finding.

### 4c. `stub-server-files` resolveId pre-filter (done)

The custom `stubServerFiles()` plugin (`vite.config.ts`) called `this.resolve()`
on **every** import in the graph just to test the filename against
`*.server.{ts,tsx}`, making it the single largest consumer of build *plugin*
time (~52 % on a cold build). Since every one of the 464 server-file import sites
uses a specifier literally containing `.server` (and there are no
`index.server.*` barrels), a `if (!source.includes(".server")) return null;`
guard skips the expensive resolve for ~99 % of imports. Measured effect: plugin
share 37 % → 30 %, client build ~3–4 % faster (more on cold builds). Small but
free and safe — shipped.

---

## 5. Trim cache *mounts* surgically instead of nuking the whole cache

**Mechanism.** Step 1b escalates, under disk pressure, to
`docker builder prune -af` (`deploy.sh:~533`). That evicts not just the layer
cache but the **cache mounts** (`pnpm-store`, `.vinxi`), which `--keep-storage`
can't trim internally — so the *next* build is fully **cold**: a `pnpm install`
(~70 s) plus a cold `vite build` (minutes). The code already tries hard to avoid
this (LRU layer trim → rollback-image trim → only then the nuke), but when it
does fire, it's the most expensive single event in the whole pipeline.

**Change (illustrative).** Before the full nuke, reclaim *inside* the mounts:
periodically (or under pressure) run `pnpm store prune` (drops unreferenced
package versions) and clear stale `.vinxi` entries, keeping the warm
layer/module-graph cache. Only fall through to `builder prune -af` if still under
the headroom floor. Items #1's bake de-dup and #3's dropped 1.5 GB copy both buy
headroom that makes the nuke fire **less often** on their own.

**Impact.** Each avoided cold build saves the full `pnpm install` + cold Vite
build (~2–4 min). Frequency depends entirely on the VPS disk — needs the real
`df -h` on the Docker data dir to tune (same open question as build-audit.md §A).

**Risk: med.** Mount pruning semantics differ across Docker versions; test that
`pnpm store prune` against the mounted store doesn't corrupt an in-flight build
(run it only when the deploy lock is held, which it already is).

**Status: deferred.** A host-side `pnpm store prune` does *not* reach the
BuildKit cache *mount* (that store lives inside BuildKit at
`/root/.local/share/pnpm/store`, not on the host) — trimming inside the mount
needs a dedicated build stage that runs the prune, which is more involved and
can't be validated from the dev environment. It also needs the VPS's real
`df -h` to tune the ceilings (same open question as build-audit.md §A). Batch A's
#3 (−1.5 GB/build) already buys disk headroom that makes the full nuke fire less
often, which is the cheaper half of this win. Revisit with the host disk numbers.

---

## 6. `pnpm prune --prod` instead of a second full `pnpm install --prod`

**Mechanism.** The `prod-deps` stage (`Dockerfile:68–71`) runs a *second*
`pnpm install --frozen-lockfile --prod` on top of the full `deps` tree to drop
devDependencies. `pnpm prune --prod` removes extraneous (dev) packages from the
existing `node_modules` without a full re-resolve/re-link pass.

**Impact.** Small, and only on the rare builds where this stage isn't cached
(lockfile or prisma schema changed). Listed for completeness.

**Risk: low**, but validate the resulting `node_modules` is identical to the
install-based one (esp. `@prisma/client` from the prod generate, and the
`.pnpm` store links). If parity isn't exact, leave as-is — the stage is well
cached.

**Status: kept as-is.** `pnpm prune --prod` removes "extraneous" packages, and
the generated Prisma client lives at `node_modules/.prisma/client` — generated
output, not a registry package — so there's a real risk prune treats it as
extraneous and deletes it, breaking the runtime image. That can't be verified
without running the actual Docker build (not possible from the dev environment),
and the stage only re-runs on a lockfile/schema change (rare, and well cached),
so the upside is small. Per this doc's own guidance ("if parity isn't exact,
leave as-is"), kept the `pnpm install --prod` form. Revisit only with a tested
build that confirms `.prisma/client` survives the prune.

---

## 7. (Situational) Move the image build off the deploy host

**Mechanism.** Today the ARM64 prod host builds the image inline during the
deploy (single-node `docker compose` path). The repo *also* has a multi-node path
(`make prod` → Bazel image build → push to `$REGISTRY` → Helm `--atomic --wait`,
`Makefile:60`) and the Go CI already supports an opt-in Bazel **remote cache**
(`BAZEL_REMOTE_CACHE`, `.github/workflows/go-microservices.yml`). Building the
image in CI (on a beefier runner, with registry-exported BuildKit cache
`--cache-to/--cache-from`) and having the host just `pull` would take the build
**off the deploy's critical path** entirely.

**Impact.** Potentially the largest structural change — the host deploy becomes
pull + hotswap (seconds) instead of build + hotswap. But it only pays off if CI
build+push+pull is faster than the host's warm incremental build, which today is
already fast thanks to the content-hash skip and warm mounts.

**Risk: high, effort: large.** New registry/auth/cache infrastructure, ARM64
build runners, and a rearchitected deploy trigger. Only worth it if the team is
already moving to the multi-node Helm path. **Not recommended** while the
single-node compose deploy is the production reality — #1–#4 give most of the
wall-clock back at a fraction of the cost.

---

## CI (`go-microservices.yml`) — already good, minor notes

- `concurrency: cancel-in-progress` ✅ aborts superseded runs.
- `actions/cache` on `~/.cache/bazel-disk` keyed by `go.sum`+`MODULE.bazel` ✅,
  plus opt-in `BAZEL_REMOTE_CACHE` ✅.
- The `build-test`, `e2e`, and `helm` jobs run in parallel ✅.
- Minor: `e2e` uses `setup-go` cache; `build-test` could also seed
  `actions/setup-go` to warm the module cache before Bazel's `go mod download`.
  Marginal — leave unless CI time becomes a complaint.

No frontend/Docker-image build runs in CI today (deploy is host-side), so CI is
**not** on the production deploy's critical path — don't over-invest here.

---

## Recommended order

1. ✅ **Batch A (safe, done 2026-06-29):** #1 `COMPOSE_BAKE=1`, #2 gate
   library-metadata, #3 drop the `.output` copy. Touch only the deploy edges;
   together they remove ~40–110 s from a typical changed deploy and never risk a
   wrong skip. Measure each with `step_done` timings already in `deploy.sh`.
2. **Then #4** (route lazy-loading) as the dedicated structural project — biggest
   ceiling, needs its own PR and bundle-diff discipline. Suggested first batch:
   the heaviest game/tool routes (`altair`, `velum2099`, `void-breaker`,
   `rmhcode`/Monaco, `temple-of-joy`, `dream-rift`, `synapse-storm`).
3. **#5** once the VPS `df -h` numbers are known (also resolves build-audit.md §A).
4. **#6/#7** only if a measured need appears.

## Verification checklist (per change)

- Time a warm-cache deploy before/after (`deploy.sh` already logs per-step
  durations via `step_start`/`step_done`).
- Confirm `build_inputs_hash` skip still triggers on a no-op redeploy.
- Confirm both `:latest` and `:${GIT_SHA}` tags are produced for slim + full
  images, and blue/green hotswap + health checks pass.
- `pnpm lint` + typecheck for any code-side change (#4); bundle-size diff for #4.

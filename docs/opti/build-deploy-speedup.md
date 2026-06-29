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

| # | Lever | Where | Est. saving / deploy | Risk | Effort |
|---|---|---|---|---|---|
| 1 | `COMPOSE_BAKE=1` — build `web`+`supervisor` as one parallel DAG | `deploy.sh` build step | **30–90 s** on changed builds | low | 1 line |
| 2 | Gate the per-deploy `library:metadata` container boot | `deploy.sh` Step 1e | **5–10 s** every deploy | low | ~15 lines |
| 3 | Drop the redundant `cp -a .output build-output` (~1.5 GB copy) | `Dockerfile` vite-builder | **3–8 s** every changed build | low–med | ~5 lines |
| 4 | Lazy-load heavy game/tool routes (shrink Vite module graph) | `app/**` routes | **large** (cuts the long pole) | med | large refactor |
| 5 | Surgical cache-mount trimming instead of full `builder prune -af` | `deploy.sh` Step 1b | avoids occasional **cold** build (~2–4 min) | med | ~20 lines |
| 6 | `pnpm prune --prod` instead of a second `pnpm install --prod` | `Dockerfile` prod-deps | seconds, only on lockfile/schema change | low | 1 line |
| 7 | Offload image build to CI + ship via registry (multi-node path) | CI + `make prod` | moves build off the request path | high | large |

Items **1–3** are the recommended first batch: low risk, touch only the deploy
edges, and together remove a meaningful chunk of wall-clock from *every* deploy.
Item **4** is the highest *ceiling* but is a real refactor. Items 5–7 are
situational.

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

## 4. Lazy-load heavy routes — shrink the Vite module graph (highest ceiling)

**Mechanism.** This is the single biggest lever on the **Vite build itself**,
which is the deploy's long pole. The app has **0** `createLazyFileRoute` usages
and **473** `createFileRoute` route files; `app/routeTree.gen.ts` statically
imports every route. The Vite config already documents the fallout
(`vite.config.ts:255–262`): with so many eager routes the optimizer's
static-import crawl "never settles," forcing the `holdUntilCrawlEnd:false`
workaround. Heavy game/editor routes (`altair`, `velum2099`, `void-breaker`,
`rmhcode`/Monaco, `temple-of-joy`, `dream-rift`, `synapse-storm`, …) and their
multi-thousand-line engine/data modules are pulled into the build graph
regardless of which page a visitor hits.

A larger eager graph means **more work per `vite build`** (more modules to
transform, resolve, and chunk) *and* a larger client output. Splitting the heavy
routes at the **route-module boundary** (`*.lazy.tsx` / `createLazyFileRoute`),
not just the canvas component, defers whole subtrees out of the eager graph.

**Impact.** Potentially the largest reduction in Vite build wall-clock and output
size — this is the "make the long pole shorter" option rather than "schedule
around it" (#1–#3). Also a runtime/TTI win for visitors.

**Risk: med, effort: large.** It's a real refactor across many routes and must be
done incrementally (heaviest routes first) with bundle-size diffs before/after.
This is the natural follow-up once the quick wins land. See `docs/opti/plan.md`
§1.1 for the original framing — still unexecuted.

**Verification.** `pnpm build`, diff the client chunk list/sizes and the build
duration before vs after each batch; confirm the manual vendor chunks
(`three`/`monaco`/`tiptap`/`pixi`/`recharts`/`framer-motion`,
`vite.config.ts:138`) don't get pulled back into the entry chunk.

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

1. **Batch A (safe, do first):** #1 `COMPOSE_BAKE=1`, #2 gate library-metadata,
   #3 drop the `.output` copy. Touch only the deploy edges; together they remove
   ~40–110 s from a typical changed deploy and never risk a wrong skip. Measure
   each with `step_done` timings already in `deploy.sh`.
2. **Then #4** (route lazy-loading) as the dedicated structural project — biggest
   ceiling, needs its own PR and bundle-diff discipline.
3. **#5** once the VPS `df -h` numbers are known (also resolves build-audit.md §A).
4. **#6/#7** only if a measured need appears.

## Verification checklist (per change)

- Time a warm-cache deploy before/after (`deploy.sh` already logs per-step
  durations via `step_start`/`step_done`).
- Confirm `build_inputs_hash` skip still triggers on a no-op redeploy.
- Confirm both `:latest` and `:${GIT_SHA}` tags are produced for slim + full
  images, and blue/green hotswap + health checks pass.
- `pnpm lint` + typecheck for any code-side change (#4); bundle-size diff for #4.

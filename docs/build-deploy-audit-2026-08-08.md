# Build & deploy speed audit — 2026-08-08

Successor to [`ci-speed-audit-2026-07-17.md`](./ci-speed-audit-2026-07-17.md),
which moved the image build into CI, parallelized the deploy gate, merged both
images into one `buildx bake` graph, and swapped the GHA layer cache for a GHCR
registry cache. All of that landed and works. This audit re-measures the
pipeline **as it exists after those changes** and asks the same question again.

Every number below is read off real Actions runs (deploy run
[`31265996205`](https://github.com/stickms/rmhstudios.com/actions/runs/31265996205),
commit `7d0263d9`, 2026-08-08 — a representative green deploy) rather than
estimated.

## TL;DR

The pipeline no longer has a slow *build*. It has a slow *tail*: **~62 seconds
of every deploy is spent packaging and bookkeeping after both production images
are already sitting in GHCR**, with the webhook that ships them held behind it.

| # | Finding | Cost | Status |
|---|---|---|---|
| 1 | The GHCR cache export runs **after** both images are pushed and blocks the deploy trigger | **~62 s every deploy** | ✅ fixed — now conditional |
| 2 | The `.vinxi` build cache mount + its CI cache-dance cache **nothing** (Vinxi is not in this stack) | ~3–5 s + 3 steps + a moving part on the deploy path | ✅ fixed — removed |
| 3 | `server-builder` spends 85 COPY layers protecting a 3-second esbuild that runs in parallel with Vite | layer/manifest overhead + a deploy-time footgun | ✅ fixed — collapsed to 3 |
| 4 | `check`'s typecheck (54 s) runs serially ahead of lint/test and makes it the **PR gate's** long pole | ~35 s per PR run | ✅ fixed — split into parallel jobs |
| 5 | Image layer export is 38.3 s (web) + 31.2 s (full) under gzip | ~20 s + faster VPS pull | ⚠️ made a one-word flip, gated on a VPS check — see §5 |
| 6 | `runner-full` carries a full Node runtime its three Go services never execute | ~0 (layers dedupe with `web`) | ⛔ not worth it — see §6 |

**Measured effect on the deploy:** the `build` job's critical path drops from
**4 m 20 s → ~3 m 18 s**, and push-to-webhook from **~4 m 30 s → ~3 m 28 s**, on
every deploy that doesn't touch the lockfile, Prisma schema, vibe-package
registry, `go.mod` or the Dockerfile — which is the overwhelming majority.

**Measured effect on the PR gate:** `web-ci` wall-clock drops from **~2 m 17 s →
~1 m 45 s**, where the production build (1 m 38 s) is now the pole rather than a
serial typecheck-then-lint-then-test job.

> ### ⚠️ Required manual follow-up — branch protection
>
> §4 renames a job, which renames a status check. **`web-ci / check` no longer
> exists**; it is now `web-ci / typecheck` and `web-ci / test`. If `web-ci /
> check` is marked required in Settings → Branches, PRs will wedge after this
> merges (a required check that never runs blocks merge). Remove `web-ci /
> check` and add `web-ci / typecheck` + `web-ci / test`. Every other check name
> is unchanged.

---

## Where a deploy actually spends its time

Push → webhook is three jobs. `ci` and `build` run concurrently; `deploy-gate`
waits on both and fires the VPS webhook.

```
16:03:04  push
16:03:09  ├─ build      ────────────────────────────────────────────┐  4m20s
16:03:14  └─ ci         ──────────────────┘ 2m21s                   │
16:07:29                                          deploy-gate ──────┘  7s
16:07:36  webhook → VPS deploy.sh
```

`ci` is **not** the critical path (2 m 21 s: install 22 s, typecheck 56 s, lint
4 s, docs freshness 2 s, test 26 s). `build` is, and inside it the single
`docker buildx bake --push web full` step is 3 m 52 s of the 4 m 20 s:

| Phase | Wall-clock | Ends at |
|---|---|---|
| All build stages (deps → prisma → vibe/server/vite/go/chromium) | ~128 s | 16:05:36 |
| `full` image export + push (31.2 s layers + 7.4 s push) | 40.6 s | 16:06:17 |
| `web` image export + push (38.3 s layers + 9.4 s push) | 49.2 s | 16:06:18 |
| **`web` cache export to GHCR** (43.4 s prepare + 29.2 s send) | **72.6 s** | **16:07:20** |

Read the last two rows together. **Both images are fully pushed to GHCR at
16:06:18. The job does not end until 16:07:20.** For 62 seconds the artifact
that gets deployed is complete, published, and pullable — and the deploy is
waiting on a cache write.

Only ~55% of the build job is building. The rest is packaging, and most of
*that* is bookkeeping for a future build.

---

## 1. The cache export is a tail, and usually a pointless one ✅

`docker-bake.hcl` exported `cache-to … mode=max` on the `web` target
unconditionally. Two separate problems.

**It is serial and last.** BuildKit runs the cache export after the image
export. `deploy-gate` needs `build`, and the webhook fires from `deploy-gate`,
so the export sits directly between "the images exist" and "the VPS is told
about them."

**On the common deploy it caches nothing new.** Split the graph by what a
re-export could possibly refresh:

- `deps`, `prisma-generate`, `prod-deps`, `vibe-builder`, `go mod download` —
  expensive and reusable across commits, but **unchanged** since the last
  export, so `:buildcache` already holds them. Rewriting identical content costs
  72 s and changes nothing.
- `vite-builder`, `runner` — keyed to this exact commit's source tree. No future
  build can ever hit them. Exporting them is pure waste, forever.

So the export pays for itself in exactly one case: an input to a cached,
expensive, *cross-commit-reusable* stage moved.

**Fix.** `EXPORT_CACHE` is now a bake variable; `deploy.yml` diffs the push
(`git diff HEAD^1 HEAD`, hence `fetch-depth: 2`) against the path set that keys
those stages — `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`.npmrc`, `prisma/`, `prisma.config.ts`, `tsconfig{,.server}.json`,
`scripts/build-vibe-packages.ts`, `lib/rmhvibe/vibe-packages.ts`,
`go-services/go.{mod,sum}`, `Dockerfile`, `docker-bake.hcl` — and exports only
on a hit. Non-`push` events (i.e. `workflow_dispatch`) always export, which is
the manual "rebuild the cache" button.

Deliberately **absent** from that list: `server/**`, `lib/**`, and the rest of
`go-services/**`. They do invalidate stages, but those stages are a ~3 s esbuild
and a ~25 s Go build that BuildKit runs *concurrently with the ~90 s+
vite-builder*. Caching work that finishes inside someone else's critical path
saves zero wall-clock, so paying 62 s of serial export to preserve it is
strictly a loss. Only stages that would otherwise **extend** the critical path
belong in the gate.

Fail-soft in both directions: skipping leaves the previous `:buildcache` in
place (still a valid `cache-from` — BuildKit resolves cache by layer digest, not
by commit), and a stale or missing cache only ever costs a colder build, never a
wrong one. `ignore-error=true` is retained for when it does run.

Verified against real history: `HEAD~1..HEAD` (a feature commit) → skip;
`HEAD~3..HEAD` (which included a dependency bump) → export on `package.json` +
`pnpm-lock.yaml`.

## 2. The `.vinxi` cache mount caches nothing ✅

The `vite-builder` stage carried
`--mount=type=cache,id=vinxi-cache-…,target=/app/.vinxi`, documented as "Vite's
module graph cache," and `deploy.yml` carried three steps (an `actions/cache`
restore, a `buildkit-cache-dance` inject, and a post-build extract) to carry that
mount between CI runs.

`.vinxi` is a **Vinxi** artifact. TanStack Start 1.168 does not use Vinxi — it
builds through Vite/Nitro directly. Nothing in this repo or in the build writes
`/app/.vinxi`; the only surviving mentions were ignore-list entries in
`tsconfig.json`, `eslint.config.mjs` and `.gitignore`. The mount was an empty
directory, and the CI dance was moving **2.7 MB of nothing** every run (the
run's own `Cache saved` line: `Sent 2740654 of 2740654`).

There is also no incremental Vite build to preserve: a rolldown production build
keeps no persistent on-disk module graph between runs (`node_modules/.vite` is
the *dev* dep-optimizer cache), and the stage opens with `rm -rf .output` anyway.

Removed: the mount, all three workflow steps, and the stale claims in the
Dockerfile header and `docker-compose.cache.yml`. The `.dockerignore` entries
stay as insurance against a future dance re-creating those staging dirs inside
the `COPY --exclude … . .` layer.

## 3. 85 COPY layers guarding a 3-second esbuild ✅

`server-builder` listed 83 individual `COPY lib/<one module>` lines — each with
a comment naming the handler that imported it — so that a change to an
uninvolved `lib/` subtree left the stage cached. That traded badly both ways:

- **It bought no wall-clock.** The stage is a ~3 s esbuild that BuildKit runs
  concurrently with `vite-builder` (~90 s+). Rebuilding it is free. The 85
  layers were not: each is a record to checksum every build and an entry in the
  `mode=max` cache manifest — i.e. the "preparing build cache for export" phase
  that measured 43.4 s.
- **It was a live footgun.** The list had to stay a superset of the bundles'
  transitive imports, so adding one `import` to a socket handler broke the
  *production image build*, after merge — not in local dev, not in CI, because
  only that stage has the truncated tree. `lib/__tests__/server-bundle-copies.test.ts`
  exists solely because this failure mode shipped the entire socket hub dead
  once.

`lib/` is 15 MB, and esbuild is import-driven with `--packages=external` and
tree-shaking, so `COPY lib ./lib/` is a strict superset that produces
byte-identical bundles. Collapsed to three COPYs.

The guard test was **not** deleted — it was widened. Copying `lib/` whole makes
an uncopied `lib/` module impossible, but says nothing about a server file
importing `@/components/…`, `@/stores/…` or `@/hooks/…`, which is the same
silent `require("@/…")` → `MODULE_NOT_FOUND`-on-boot failure out of a tree the
stage has never carried and never should. The test now walks the same import
graph and asserts every reached file — not just `lib/` ones — is covered by a
COPY it parses out of the Dockerfile. It is strategy-agnostic: it was correct
under the curated list, is correct under `COPY lib`, and would be correct again
if someone narrows the stage back for cache-granularity reasons.

Verified: the graph reaches 202 `lib/` + 105 `server/` files; 0 uncovered.

---

## 4. The typecheck is real work, and it was serialized ✅

The obvious suspicion was a broken incremental cache: `check`'s typecheck ran
54 s despite a restored `.tsbuildinfo`, against the "~7 s warm" claim in
`web-ci.yml`'s own comment. Measured directly against this tree
(`typescript-native`, 4-core box):

| Scenario | Time |
|---|---|
| Cold (no `.tsbuildinfo`) | **91 s** |
| Warm, nothing changed | **8 s** |
| Warm, one leaf file re-saved (no content change) | 7 s |
| Warm, **content** change to `lib/utils.ts` (widely imported) | **34 s** |
| Warm, reverted | 8 s |

So the cache works exactly as advertised, and the buildinfo (3.2 MB) is written
and reused. CI's ~54 s is simply what a merge commit costs: it changes many
files, several of them widely imported, and tsc re-checks the whole downstream
cone. **There is no cache bug to fix** — which also means no amount of cache
tuning will move this number. Parallelism is the only lever left.

(Note the third row. An earlier version of this measurement used `touch`, which
proves nothing: tsc invalidates by content hash, so a re-saved file with
identical bytes is correctly a no-op. Only the content-change row is a real
test.)

**Fix.** `web-ci`'s `check` job is split into `typecheck` and `test` (lint +
docs freshness + unit suite), which now run concurrently. `check` was 2 m 07 s —
longer than the production `build` job (1 m 38 s) it is supposed to be cheaper
than — and becomes ~1 m 32 s / ~1 m 10 s in parallel, putting `build` back as
the PR gate's pole.

`deploy.yml`'s `ci` job is deliberately **not** split. There, `build` is the
critical path (~3 m 18 s vs `ci`'s 2 m 21 s), so a second runner's
checkout+install would buy zero deploy latency. Worth revisiting only if
`build` ever drops below ~2 m 30 s.

One coupling this required: the tsc and eslint caches used to share a single
`tsc-eslint-*` key holding both directories. With the work in two jobs, that
entry would be raced by two writers and half-ignored by each reader, so they are
now separate `tsc-*` / `eslint-*` entries. `deploy.yml`'s `ci` still writes
**both**, which is load-bearing: a PR restores from the base branch's cache
scope, so if `main` stopped publishing a prefix every new PR would pay the 91 s
cold typecheck. Expect one cold run per prefix as the old combined entries age
out.

---

## Not done (or not fully), and why

### 5. zstd image compression ⚠️ armed, not fired

Layer export is 38.3 s (web) + 31.2 s (full); since they run concurrently that
phase is ~42 s of critical path, most of it gzip. `compression=zstd` typically
cuts that substantially and speeds the VPS `docker pull` too. It is the biggest
single lever left.

**It is wired up but left off.** `docker-bake.hcl` now takes an
`IMAGE_COMPRESSION` variable (default `gzip`, i.e. today's exact behavior), read
from a one-word `IMAGE_COMPRESSION: gzip` line in the deploy workflow.

It is off because turning it on is a guess I could not check. zstd layers use
`application/vnd.oci.image.layer.v1.tar+zstd`, which the **pulling** daemon must
understand — Docker Engine ≥ 23.0. GHCR is fine; the production VPS's engine
version is not verifiable from a CI container, and the failure mode is not a
slow deploy but `docker pull` failing on the host *after* both images are built
and pushed. One command settles it:

```bash
# on the VPS
docker version --format '{{.Server.Version}}'
```

≥ 23.0 → change `gzip` to `zstd` in `.github/workflows/deploy.yml` and watch the
first deploy's "exporting layers" and pull. `deploy.sh` already tags
`${GIT_SHA}` for rollback. (`force-compression` is switched on with it —
without it BuildKit reuses already-gzipped cached layers and ships a
mixed-format image, which is the worst of both.)

### 6. `runner-full` carrying an unused Node runtime ⛔

`runner-full` is `FROM runner`, so it ships the full production `node_modules`,
`.output` and `dist-server` — while its three compose services (`supervisor`,
`status`, `assets`) execute only static Go binaries. Confirmed by grep: no Go
service shells out to `node`, `npx` or `pnpm`, so none of that payload is
reachable.

Left alone on purpose. Because `full` derives from `runner` in-graph, those
layers are **identical blobs** — deduplicated in GHCR, and already resident on
the VPS from the `web` pull, so the marginal storage and pull cost is ~0. A lean
`alpine + chromium + go-bins` image would trade shared layers for unshared ones
and could easily pull *slower*. The only real gain is CI export time, which is
better attacked by #5.

---

## What this leaves

A deploy that reaches the VPS webhook in **~3 m 28 s instead of ~4 m 30 s**, and
a PR gate that answers in **~1 m 45 s instead of ~2 m 17 s**.

Of the remaining deploy time, ~2 m 08 s is genuine building and ~1 m 20 s is
image export and push. The next ~20 s is §5, and it is one word behind one
command on the VPS. After that there is no large, obvious block of waste left on
this pipeline: the build is the build, and shaving it further means making Vite
itself faster (see `docs/performance-audit-2026-08-04.md` on why
`routeTree.gen.ts`'s 739 static route imports are the shape of that problem)
rather than removing overhead around it.

### How to verify this landed

On the first deploy after merge, in the `build` job's bake log:

- The step "Decide whether to refresh the BuildKit layer cache" should say
  **"Cached-stage inputs changed"** — this PR touches `Dockerfile` and
  `docker-bake.hcl`, so the first run correctly *does* export. The run after it
  (assuming an ordinary app-only change) should say "skipping the cache export".
- On that second run, `#… exporting cache to registry` should be **absent
  entirely**, and the job should end within a few seconds of the last
  `pushing manifest`.
- `deploy-gate`'s webhook trigger timestamp should sit ~60 s closer to the image
  push than it did in run 31265996205.

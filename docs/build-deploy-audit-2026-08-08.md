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
| 4 | `ci`'s typecheck (56 s) becomes the critical path once #1 lands | — | ⏳ next lever, not done |
| 5 | Image layer export is 38.3 s (web) + 31.2 s (full) under gzip | ~30–40 s | ⏳ needs a VPS Docker version check |
| 6 | `runner-full` carries a full Node runtime its three Go services never execute | ~0 (layers dedupe with `web`) | ⛔ not worth it — see §6 |

**Measured effect of what shipped:** the `build` job's critical path drops from
**4 m 20 s → ~3 m 18 s**, and push-to-webhook from **~4 m 30 s → ~3 m 28 s**, on
every deploy that doesn't touch the lockfile, Prisma schema, vibe-package
registry, `go.mod` or the Dockerfile — which is the overwhelming majority.

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

## Not done, and why

### 4. `ci`'s typecheck is the next critical path ⏳

With #1 landed, `build` ≈ 3 m 18 s and `ci` = 2 m 21 s. `ci` is still not
binding, but it is close, and typecheck is 56 s of it — barely better than the
~68 s cold figure quoted in `web-ci.yml`, despite a restored `.tsbuildinfo`.
Worth investigating why the incremental cache is not paying off on merge commits
before splitting `ci` into parallel typecheck / lint / test jobs (which would
take it to ~1 m 10 s). Deliberately left alone here: it is not on the critical
path today, and this audit's changes should be measured on their own first.

### 5. zstd image compression ⏳

Layer export is 38.3 s + 31.2 s under buildx's default gzip. `compression=zstd,
force-compression=true` typically cuts that substantially and speeds the VPS
pull too. **Not applied**: it requires the production VPS's Docker to support
zstd pulls (Engine ≥ 23), which cannot be verified from here, and a wrong guess
breaks `docker pull` on the host at deploy time. Check the daemon version first,
then flip it on the `web` target and measure.

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

A deploy that reaches the VPS webhook in ~3 m 28 s instead of ~4 m 30 s, where
~2 m 08 s of that is genuine building and the remaining ~1 m 20 s is image
export and push. The next 30–40 s is #5; the next structural win after that is
#4. There is no longer a large, obvious block of waste on the deploy path — the
remaining items are each worth under a minute and carry real verification
requirements.

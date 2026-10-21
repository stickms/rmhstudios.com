# 01 — Method: how a number is produced

A number in this program is evidence only if someone else can reproduce it with
a command written next to it. This page defines the instruments, the dataset,
the environment, and what may be compared with what.

## 0. Two classes of evidence

Every results row is tagged with the class of its evidence:

| Class | What | Available | How it may be produced |
| --- | --- | --- | --- |
| `exact` | counts, bytes, headers: queries per request, payload bytes, `cache-control`/`etag`, event-loop block count. Identical on any machine. | Stage A and B | a vitest test that counts Prisma calls, or the dev server (`vite dev`); the harness once it exists |
| `latency` | TTFB, total time, rps, p95 under load: anything a clock or a contended CPU can move. | **Stage B only** | the harness against a production build, per §2 |

A Stage A change ships on `exact` evidence alone. It is re-measured for latency
in Stage B and reverted if it shows no win there (`05-agent-protocol.md` §3). A
row never claims latency from an `exact` measurement.

## 1. The instruments (built by WS0)

All live under `scripts/perf/`. Agents use them; only WS0 (and later the
coordinator) changes them. If an instrument is wrong, report it in your results
file instead of patching it in your branch — two harnesses produce two
incompatible baselines.

### 1.1 `scripts/perf/server-bench.mjs` — the HTTP harness

Runs against a base URL and a route list. No new dependencies: Node's built-in
`fetch`/`undici` and `perf_hooks`.

```bash
node scripts/perf/server-bench.mjs \
  --base http://localhost:7105 \
  --routes scripts/perf/server-routes.json \
  --auth both            # anon | signed | both
  --warmup 5 --samples 30 \
  --concurrency 16 --duration 10 \
  --out docs/server-perf-2026-10-21/results/<name>.json
node scripts/perf/server-bench.mjs --compare before.json after.json   # markdown diff table
node scripts/perf/server-bench.mjs --only '/api/leaderboard*' ...     # a subset
```

Per route × auth mode it records:

| Field | Meaning |
| --- | --- |
| `ttfb.p50/p95/p99` | ms until response headers arrive, **sequential** samples (latency, no queueing) |
| `total.p50/p95` | ms until the body is fully read |
| `bytes` | decoded body bytes (median); `encodedBytes` with `accept-encoding: gzip, br` |
| `status` | every status seen; any non-2xx/3xx marks the row invalid |
| `phases` | median of each `Server-Timing` phase (`total`, `sess`, `cache`, `db`, `loader`, `render`) |
| `queries` | median per-request query count (see §1.3) |
| `rps`, `load.p95` | throughput and p95 TTFB in the **concurrent** run (`--concurrency` workers for `--duration` s) |
| `cacheControl` | the `cache-control` header as served |

### 1.2 `scripts/perf/server-routes.json` — the route list

The fixed set every comparison runs over. Each entry: `path` (with seeded ids
substituted from the dataset manifest), `class` (`core` · `content` ·
`interactive` · `api`), `auth` (`anon`, `signed`, or `both`), and an optional
`method`/`body` for the few POSTs worth timing. It must cover:

- every `_site` page the 10-08 frame-budget sweep covered (`/`, `/games`,
  `/apps`, `/news`, `/library`, `/leaderboard`, `/events`, `/communities`,
  `/market`, `/search?q=…`, …), a profile page, a post page, a community page;
- the server functions those pages call when navigated to client-side (TanStack
  `/_serverFn/*` requests — capture the real URLs from a browser session);
- the 40 most-called API `GET`s — ranked by call count in the client code
  (`grep -r "fetch('/api/"` + React Query keys), not by guess;
- a representative POST from each of: post create, like, comment, follow.

Adding routes later is allowed; removing one requires a note in `ws-0.md`.

### 1.3 Query counts

The per-request query budget (`lib/prisma.server.ts` `QueryBudget`) already
counts every Prisma operation per request. WS0 exposes the count to the harness
through a response header **gated by an env flag that is off by default**
(`RMH_PERF_HEADERS=1` → `x-rmh-queries: <n>`), with a test asserting the header
is absent when the flag is unset. `Server-Timing` stays `dur`-only — see the
security note in `lib/otel/timing.ts`.

### 1.4 `Server-Timing` phases

WS0 wires the call sites listed in `lib/otel/timing.ts` (`sess`, `cache`, `db`,
and `loader`/`render` where a choke point exists). This is permanent production
instrumentation, not a bench-only hack: it ships, and RUM reads it.

### 1.5 `scripts/perf/seed-perf-db.ts` — the dataset

A **deterministic** (fixed PRNG seed) synthetic dataset, so a number from one
worktree is comparable with a number from another. Sized so that indexes
matter — a 200-row table hides every missing index:

| Entity | Rows (minimum) |
| --- | ---: |
| users (+ profiles) | 20,000 |
| posts (RMHarks) | 200,000 |
| follows | 400,000 (power-law: a few accounts with 5k+ followers) |
| likes / reactions | 1,000,000 |
| comments | 150,000 (one thread ≥ 2,000 comments) |
| notifications | 500,000 |
| DMs / conversations | 50,000 / 5,000 |
| communities / memberships | 200 / 40,000 |
| leaderboard/game score rows | 200,000 across the catalog games |

It writes `scripts/perf/.dataset.json` (gitignored): the ids the route list
substitutes, and a **valid signed-in session cookie** for a bench user (a
`session` row plus the cookie signed with `BETTER_AUTH_SECRET` exactly as Better
Auth signs it), and one for a heavy user (follows 2,000 accounts, 500 unread
notifications). Loading it is `pnpm tsx scripts/perf/seed-perf-db.ts`; WS0
records how long it takes.

The seeded database is kept as a Postgres **template** (`rmh_perf_template`);
every worktree gets its own copy with
`createdb -T rmh_perf_template rmh_ws<N>` (seconds, not minutes) so agents never
share mutable state.

### 1.6 Hub load (`scripts/perf/socket-bench.mjs`, built by WS5)

Opens N Socket.IO clients against a hub, drives a scripted event mix, and
records server event-loop delay (`perf_hooks.monitorEventLoopDelay`, exposed by
the hub behind the same `RMH_PERF_HEADERS`-style env flag), broadcast latency
p50/p95, and RSS. WS5 builds it in Stage A (it needs no WS0 file); its latency
figures are Stage B evidence like any other, its handler and per-event
allocation counts are `exact`.

## 2. The environment

- **Node 24.18** (`/opt/node24/bin` in the agent container — put it first on
  `PATH`). Never measure on Node 22; the repo's `engines` says 24 and V8
  differences are not noise.
- **Production build only for latency and throughput**: `pnpm build` then
  `node .output/server/index.mjs` with `NODE_ENV=production`. `vite dev` numbers
  are not latency evidence (no minification, on-demand transforms, HMR).
  **Query counts, payload bytes and cache headers may be measured on `vite
  dev`** — they do not depend on the build.
- Local Postgres 16 and Redis on the same host, `REDIS_URL` **set** (production
  runs Redis; a cache that only works without it is not production behaviour).
  Run a second pass with `REDIS_URL` unset only when the change touches the
  degradation path.
- One web process (production runs one per colour). `DATABASE_POOL_SIZE`
  default.
- Warm vs cold: the harness's warmup samples make every reported number
  **warm**. Cold-start (first request after boot) is measured separately by
  restarting the server and timing the first request to `/`, three times.

**The heavy-command lock.** The container shares 4 cores between about eight
parallel agents, so every heavy command runs under **one** lock:
`flock /tmp/rmh-perf-build.lock <cmd>`. It covers `pnpm build`, the bench,
`pnpm exec tsc --noEmit`, and `git commit` (the commit hook runs the gate, which
runs `tsc`). A latency number measured while another agent builds, type-checks
or commits is not comparable with one measured while it doesn't, which is why the
bench holds the same lock. Targeted `vitest run <paths>` and eslint on single
files are light and run unlocked; the whole suite does not. Hold the lock
briefly.

**Container caveats.** The agent container shares 4 cores between parallel
agents; absolute numbers are pessimistic and noisy. Therefore:

1. Compare **within one worktree, same session, back-to-back** (before build →
   after build), never against a number another agent produced.
2. Run before and after **twice each, interleaved** (A B A B). Report the median
   of the two medians and the spread. If the spread of A overlaps B, the result
   is "no measurable change".
3. Query counts and bytes are exact and hardware-independent — prefer them as
   the headline when the change's effect is on those.

## 3. What counts as evidence

A results row is accepted when it has all of:

- the **metric** and **route(s)** it moved;
- **before** and **after** values from the same worktree and session (§2);
- the **command** that produced them (copy-pasteable);
- the **commit** that contains the change;
- a **correctness note**: which test proves the response is unchanged (an
  existing test, or one added in the same commit).

Not evidence: "should be faster", a microbenchmark of a function no route calls
at that rate, a number from `vite dev`, a single sample, a number from a
different machine than its baseline.

## 4. The baseline

WS0 produces `results/baseline.json` (both auth modes, every route) on the
merged-to-date tree with the instrumentation in place, plus `ws-0.md`
summarising: top 15 routes by signed-in p95 TTFB, top 15 by query count, every
route over its query budget, every `GET` without a cache policy that the
harness shows is anonymous-invariant, cold-start time, and the phase breakdown
of the five slowest pages. That summary is what the workstreams re-prioritise by in Stage B.

Because the workstreams run in parallel on a loaded box, each **re-baselines its
own subset** in its own worktree before any Stage B measurement (§2.1). The WS0
baseline picks the targets; the per-worktree baseline proves the win. Stage A
leads come from reading the code; Stage B re-prioritises them by the baseline.

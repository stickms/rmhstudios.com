# 01 — Method: how a number is produced

A number in this program is evidence only if someone else can reproduce it with
a command written next to it. This page defines the instruments, the dataset,
the environment, and what may be compared with what.

## 0. Two classes of evidence

Every results row is tagged with the class of its evidence:

| Class | What | How it may be produced |
| --- | --- | --- |
| `exact` | counts, bytes, headers: queries per request, payload bytes, `cache-control`/`etag`, event-loop block count. Identical on any machine. | a vitest test that counts Prisma calls, the dev server (`vite dev`), or the harness |
| `latency` | TTFB, total time, rps, p95 under load: anything a clock or a contended CPU can move. | the harness against a production build, per §2 |

A change may ship on `exact` evidence alone (a removed query is removed on any
machine). Once the harness is available it is re-measured for latency, and
reverted if it shows no win there. A row never claims latency from an `exact`
measurement.

## 1. The instruments (built by WS0)

All live under `scripts/perf/`. Change them in that directory, in one place:
patching a private copy produces two incompatible baselines. If an instrument is
wrong, say so in the results file.

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
is absent when the flag is unset. `Server-Timing` is `dur`-only, and its phase
entries are behind the same flag (the `trace` id is always sent for `lib/rum.ts`) —
see the security note in `lib/otel/timing.ts`.

### 1.4 `Server-Timing` phases

WS0 wires the call sites listed in `lib/otel/timing.ts` (`sess`, `cache`, `db`,
and `loader`/`render` where a choke point exists). This is permanent production
instrumentation, not a bench-only hack: it ships, and RUM reads it.

### 1.5 `scripts/perf/seed-perf-db.ts` — the dataset

A **deterministic** (fixed PRNG seed) synthetic dataset, so a number from one
checkout is comparable with a number from another. Sized so that indexes
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
each working copy takes its own database with
`createdb -T rmh_perf_template <your_db>` (seconds, not minutes) so runs never
share mutable state.

### 1.6 Hub load (`scripts/perf/socket-bench.mjs`, built by WS5)

Opens N Socket.IO clients against a hub, drives a scripted event mix, and
records server event-loop delay (`perf_hooks.monitorEventLoopDelay`, exposed by
the hub behind the same `RMH_PERF_HEADERS`-style env flag), broadcast latency
p50/p95, and RSS. Its latency figures are `latency` evidence like any other; its handler
and per-event allocation counts are `exact`.

### 1.7 Go evidence (WS7)

The Go services have no `Server-Timing` and are not in `server-routes.json`, so
the two classes of evidence (§0) look like this:

- **Exact:** query counts per worker tick or per request from
  `pg_stat_statements` (`calls` before/after, reset between runs); `allocs/op`
  and `B/op` from `go test -bench -benchmem`; response bytes and headers
  (`cache-control`, `etag`, `content-encoding`, status on a conditional or range
  request) from `curl -i`.
- **Latency:** `go test -bench` ns/op, or an HTTP bench of `assets`/`status`
  (same method as §1.1: sequential TTFB, then concurrent). Run it with
  no other heavy command running (§2), before and after in the same session, A B A B.

Toolchain notes (the sandbox this program ran in; adjust for your machine):

```bash
export GOTOOLCHAIN=go1.26.8
export BAZELISK_BASE_URL=https://github.com/bazelbuild/bazel/releases/download   # releases.bazel.build is blocked by the proxy
/opt/bazel/bazel --version                # bazelisk
make gazelle && make test                 # from the repo root
go test ./...                             # fallback (in go-services/) if Bazel module fetch is blocked
```

`go test ./...` proves correctness only; the Bazel run is what CI runs, so say
in the results row which one you used. On a shared box give Bazel limits, e.g.
`--jobs=2 --local_ram_resources=2048`.

## 2. The environment

- **Node 24.18.** Never measure on Node 22; the repo's `engines` says 24 and V8
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

**Heavy commands.** `pnpm build`, the bench, `pnpm exec tsc --noEmit` and the
commit gate (which runs `tsc`) are CPU-heavy. A latency number measured while any
of them runs on the same machine is not comparable with one measured while none
does, so serialise them: do not build, type-check or commit during a bench, and
do not bench during one. (The program did this with one `flock` around every
heavy command; any mechanism that gives the same exclusion will do.) Targeted
`vitest run <paths>` and eslint on single files are light; the whole suite is not.

**Shared-hardware caveats.** The program's box shared 4 cores between parallel
runners; absolute numbers there are pessimistic and noisy. On any shared machine:

1. Compare **within one checkout, same session, back-to-back** (before build →
   after build), never against a number another agent produced.
2. Run before and after **twice each, interleaved** (A B A B). Report the median
   of the two medians and the spread. If the spread of A overlaps B, the result
   is "no measurable change".
3. Query counts and bytes are exact and hardware-independent — prefer them as
   the headline when the change's effect is on those.

## 3. What counts as evidence

A results row is accepted when it has all of:

- the **metric** and **route(s)** it moved;
- **before** and **after** values from the same checkout and session (§2);
- the **command** that produced them (copy-pasteable);
- the **commit** that contains the change;
- a **correctness note**: which test proves the response is unchanged (an
  existing test, or one added in the same commit).

Not evidence: "should be faster", a microbenchmark of a function no route calls
at that rate, a number from `vite dev`, a single sample, a number from a
different machine than its baseline.

## 4. The baseline

`results/baseline.json` (both auth modes, every route; not checked in, see
[`06-report.md`](06-report.md) for where the raw runs live) was taken on the tree with
the instrumentation in place; `results/ws-0.md` summarises it: top 15 routes by
signed-in p95 TTFB, top 15 by query count, every route over its query budget,
every `GET` without a cache policy that the harness shows is anonymous-invariant,
cold-start time, and the phase breakdown of the five slowest pages. That summary
is what the workstreams prioritised by.

Because measurements share a loaded box, each workstream **re-baselines its own
subset** in its own checkout before measuring latency (§2, caveat 1). The program
baseline picks the targets; the local baseline proves the win. Reading the code
produces leads; the baseline re-prioritises them.

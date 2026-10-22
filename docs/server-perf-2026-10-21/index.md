# Server-side performance program — 2026-10-21

A full server-side performance pass over the website, run 2026-10-21 to
2026-10-22. This folder holds the method, budgets and rules it ran under, the
workstreams, the per-workstream results, and the final report. Start with
[`06-report.md`](06-report.md) for the outcome. The method, budgets and rules
stay useful for the next pass.

| File | What it settles |
| --- | --- |
| this page | Goal, scope, phases, who decides what |
| [`01-method.md`](01-method.md) | How a number is produced. The harness, the dataset, the environment, what counts as evidence |
| [`02-budgets.md`](02-budgets.md) | What "fast enough" means per route class, and what "done" means per change |
| [`03-rules.md`](03-rules.md) | Engineering rules every change obeys — cache safety above all |
| [`04-workstreams.md`](04-workstreams.md) | The work, split into workstreams with **disjoint file ownership**, each with its leads and exit criteria |
| `results/ws-*.md` | One ledger per workstream. Every claimed win is a row with before/after numbers |
| [`06-report.md`](06-report.md) | **Start here for the outcome.** The merged before/after, the correctness and privacy fixes, what shipped, what was rejected, what is left, and the production verification plan |

---

## 1. Why this is not a repeat of earlier passes

The server has already had three passes and most of their findings are fixed.
Do **not** re-diagnose them — check the code first:

- [`scalability-audit-2026-07-17.md`](../scalability-audit-2026-07-17.md) — its
  P0/P1 list is largely done: view counts buffer in Redis
  (`lib/hot-counters.server.ts`), explore sorts on `followerCount`, comments are
  paginated, Better Auth `cookieCache` is on, the L1+L2 `cached()` helper exists
  (`lib/cached.server.ts`), a read replica client exists (`prismaRead`).
- [`loading-audit-2026-08-11/`](../loading-audit-2026-08-11/index.md) — measured
  origin TTFB at 26–80 ms warm for `/` and concluded **the database and the
  handler layer do not need a revamp**. Its
  [`06-backlog.md`](../loading-audit-2026-08-11/06-backlog.md) "Measured and
  rejected" table is binding here: nothing on it is re-attempted without new
  evidence. Its backlog items for the server tier (API caching, database,
  edge) are the origin of several workstreams below.
- [`performance-audit-2026-10-08.md`](../performance-audit-2026-10-08.md) and
  [`performance-audit-2026-10-21.md`](../performance-audit-2026-10-21.md) — the
  client-side passes (frame budget, critical CSS, preload priority; the second
  is from the same day as this program). Out of scope here; this program does
  not touch bundles or browser rendering.

What those passes did **not** do, and this one does:

1. **Measure the server under load and signed in.** Every prior TTFB figure is
   a single warm anonymous request. Signed-in pages skip the edge cache, run the
   session lookup, the tier resolution and the personalized loaders — that is
   the traffic the origin actually serves. Throughput (req/s at a concurrency)
   and tail latency (p95/p99) were never measured at all.
2. **Attribute the time.** `Server-Timing` carries only `total`; the `sess`,
   `cache`, `db`, `loader` and `render` phases designed in `lib/otel/timing.ts`
   were never wired. Without them every regression is an investigation.
3. **Harvest the query budget.** The per-request query counter exists
   (`lib/prisma.server.ts`, opened by `server/nitro/otel.ts`); nobody has run
   every route through it and worked the list (backlog §8).
4. **Adopt the caching the API wrapper already implements.** ~448 route files
   declare a `GET`; ~44 declare a `cache` policy (backlog §3).
5. **Look at the realtime hubs and CPU-bound endpoints** (OG cards, image
   variants, sitemaps), which no pass has profiled.

## 2. Goal

Lower origin latency and origin cost per request **on the traffic production
actually serves**, without changing what any user sees except how soon they
see it. Concretely, in priority order:

1. Signed-in SSR TTFB — p50 and p95 — on the core and content route classes.
2. Server throughput: requests/second the single Node web process sustains at
   fixed concurrency before p95 crosses budget.
3. Queries per request — every route under its budget in [`02-budgets.md`](02-budgets.md).
4. API `GET` latency and cacheability.
5. Event-loop health of the realtime hubs under synthetic load.

## 3. Scope

**In:** the Nitro web tier (SSR loaders, server functions, API routes, Nitro
plugins), `lib/**/*.server.ts`, Prisma schema/indexes/queries, caching (L1/L2,
HTTP cache headers), the Node realtime hubs and workers under `server/`, and
CPU-bound endpoints (OG/image/sitemap/RSS), and the Go fleet under
`go-services/` (the `supervisor`'s six workers, `status`, `assets`). The Go
services share the production Postgres with the web tier, so a worker's polling
or per-item queries are user-facing latency, not a separate system's problem.

**Out:** client bundles, CSS, rendering performance in the browser (covered by
the 10-08/10-09 passes); infrastructure
changes on the VPS (PgBouncer, Postgres tuning, Apache/Cloudflare — proposals
go in the report, changes go through `deploy/` and an operator).

**Non-goals:** new features; refactors without a measured win; replacing
libraries (Prisma, Better Auth, TanStack Start) — the rules say why.

## 4. Phases

The work ran in four phases. Workstreams started together, so no one waited for
the harness; what the harness gates is the kind of evidence a change may carry
(`01-method.md` §0), not when work starts.

| Phase | Output | Gate to next phase |
| --- | --- | --- |
| **P0 — Instrument and baseline** (WS0) | the harness, the seeded perf dataset, the wired `Server-Timing` phases, `results/baseline.json` + `results/ws-0.md` | a baseline exists for every route in the route list, both auth modes; budgets in `02-budgets.md` are ratified against it |
| **P1 — Parallel workstreams** (WS1–WS9) | commits per workstream + `results/ws-N.md`, each Shipped row tagged `exact` or `latency` | each workstream meets its exit criteria or closes with "measured, no win" |
| **P2 — Integration** | workstreams merged (`04-workstreams.md` §Merge order); full commit gate on the merged tree; full harness re-run; `06-report.md` | merged tree green; no route regressed past tolerance (`02-budgets.md` §3) |
| **P3 — Production verification** | RUM/synthetic windows per [`performance-slo.md`](../performance-slo.md) | the rollback policy there applies unchanged |

Evidence that is exact and hardware-independent (query counts, payload bytes,
cache headers) can be produced before the harness exists. Latency claims wait
for it, and any change shipped on exact evidence alone is re-measured for
latency afterwards and reverted if it shows no win.

## 5. Who decides

- **Integration** (whoever merges the work) owns this folder, ratifies budgets
  after the baseline, resolves ownership disputes, and writes `06-report.md`.
  Workstream authors do not edit `index.md`, `01`–`04`, or another workstream's
  results file.
- **A workstream author** owns its files (see `04-workstreams.md`), decides
  *how* to hit its exit criteria, and is expected to **reject its own ideas**
  when the numbers say so. A results file full of honest "no win" rows is a
  good outcome; a merged change with no number is not.
- **Disagreement with a rule** goes in the results file under "Rule
  objections", with evidence. Follow the rule meanwhile.

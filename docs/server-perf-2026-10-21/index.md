# Server-side performance program — 2026-10-21

Triggered by: **"a full server side performance optimization of the website —
design the documents that will govern the optimization process, then dispatch
agents to implement the change."**

This folder governs that program. It is written for the agents doing the work
and for the person reviewing it. Read it in order the first time; afterwards
[`04-workstreams.md`](04-workstreams.md) and your own results file are enough.

| File | What it settles |
| --- | --- |
| this page | Goal, scope, phases, who decides what |
| [`01-method.md`](01-method.md) | How a number is produced. The harness, the dataset, the environment, what counts as evidence |
| [`02-budgets.md`](02-budgets.md) | What "fast enough" means per route class, and what "done" means per change |
| [`03-rules.md`](03-rules.md) | Engineering rules every change obeys — cache safety above all |
| [`04-workstreams.md`](04-workstreams.md) | The work, split into workstreams with **disjoint file ownership**, each with its leads and exit criteria |
| [`05-agent-protocol.md`](05-agent-protocol.md) | The operating procedure for an implementing agent: setup, build lock, commits, reporting |
| `results/ws-*.md` | One ledger per workstream, written by its agent. Every claimed win is a row with before/after numbers |
| [`06-report-template.md`](06-report-template.md) | The skeleton `06-report.md` follows |
| `06-report.md` | Written at integration: the merged before/after, what shipped, what was rejected |

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
  evidence.
- [`performance-audit-2026-10-08.md`](../performance-audit-2026-10-08.md) — a
  client-side pass (frame budget). Out of scope here.

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

P0 and P1 **overlap**: WS0–WS7 start together, each in its own git worktree, so
no agent waits for another. What WS0 gates is not the start of a workstream but
the kind of evidence it may produce, in two stages:

- **Stage A — before the harness exists.** Static analysis, diagnosis, scan
  scripts, and fixes whose evidence is *exact* and hardware-independent (query
  counts, payload bytes, cache headers — `01-method.md` §0). Latency claims
  wait. WS0-owned files (`04-workstreams.md` §Concurrency) are not edited.
- **Stage B — after the coordinator's ready marker.** The coordinator merges WS0
  and sets the marker; each agent merges WS0 into its branch, re-baselines,
  **re-measures every Stage A change** and reverts any that shows no win, then
  continues the loop with latency evidence.

| Phase | Who | Output | Gate to next phase |
| --- | --- | --- | --- |
| **P0 — Instrument & baseline** | one agent (WS0), concurrent with Stage A of P1 | the harness, the seeded perf dataset, the wired `Server-Timing` phases, `results/baseline.json` + `results/ws-0.md` | baseline exists for every route in the route list, both auth modes; coordinator ratifies the budgets in `02-budgets.md` §4 against it, merges WS0 and sets the ready marker |
| **P1 — Parallel workstreams** | one agent per workstream (WS1–WS7): Stage A from the start, Stage B after the marker | commits on a workstream branch + `results/ws-N.md`, each Shipped row tagged `exact` or `latency` | each workstream meets its exit criteria or closes with "measured, no win" |
| **P2 — Integration** | coordinator | workstreams merged in the order in `04-workstreams.md` §Merge order; full commit gate on the merged tree; full harness re-run; `06-report.md` | merged tree green; no route regressed past tolerance (`02-budgets.md` §3) |
| **P3 — Production verification** | operator, after deploy | RUM/synthetic windows per [`performance-slo.md`](../performance-slo.md) | the rollback policy there applies unchanged |

## 5. Who decides

- **The coordinator** (the session that dispatched the agents) owns this folder,
  ratifies budgets after P0, resolves ownership disputes, merges, and writes
  `06-report.md`. Agents do not edit `index.md`, `01`–`05`, or another
  workstream's results file.
- **An agent** owns its workstream's files (see `04-workstreams.md`), decides
  *how* to hit its exit criteria, and is expected to **reject its own ideas**
  when the numbers say so. A results file full of honest "no win" rows is a
  good outcome; a merged change with no number is not.
- **Disagreement with a rule** goes in the agent's results file under
  "Rule objections", with evidence. The agent follows the rule meanwhile.
- **The documentation is written by an agent.** A documentation agent revises
  this folder as the process changes and drafts `06-report.md` from
  [`06-report-template.md`](06-report-template.md) and the `results/` files; the
  coordinator reviews and owns the result.

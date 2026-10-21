# 02 — Budgets and definitions of done

Budgets say how fast is fast enough, so work stops where the user stops
noticing. They are **origin** budgets on the local bench (`01-method.md` §2) —
not the RUM/synthetic budgets in [`performance-slo.md`](../performance-slo.md),
which include the network and the browser and remain the production authority.

## 1. Route classes

Same classes as `scripts/ci/synthetic-perf-bands.json`, plus `api`:

| Class | Examples |
| --- | --- |
| `core` | `/`, `/games`, `/apps`, profile, post page |
| `content` | `/news`, `/library`, blog, `/events`, `/communities`, `/leaderboard` |
| `interactive` | `/market`, `/search`, `/creator-studio`, app landings |
| `api` | `/api/**` `GET`s and the timed POSTs; `/_serverFn/*` |

## 2. Provisional budgets (ratified after P0)

Warm, production build, one process, seeded dataset, Redis on. "Signed" means
the heavy bench user from `01-method.md` §1.5.

| Class | Anon TTFB p50 / p95 | Signed TTFB p50 / p95 | Queries / request (signed) | Load p95 @ c=16 |
| --- | ---: | ---: | ---: | ---: |
| `core` | 60 / 120 ms | 120 / 250 ms | ≤ 12 | ≤ 2× sequential p95 |
| `content` | 60 / 120 ms | 100 / 200 ms | ≤ 10 | ≤ 2× sequential p95 |
| `interactive` | 80 / 160 ms | 150 / 300 ms | ≤ 15 | ≤ 2× sequential p95 |
| `api` (`GET`) | 15 / 40 ms | 25 / 60 ms | ≤ 5 | ≤ 2× sequential p95 |
| `api` (POST) | — | 40 / 100 ms | ≤ 8 (writes in one transaction) | — |

Plus, for every route:

- **No unbounded read** — every `findMany` on a table that grows with users has
  a `take` (the unbounded-read guard in `lib/prisma.server.ts` logs offenders).
- **Response bytes**: an SSR page's serialized loader/dehydrated data ≤ 60 KB
  decoded for anon, ≤ 90 KB signed. An API `GET` list response ≤ 50 KB per page.
- **Cold start**: first request to `/` after boot ≤ 1.5 s (warmup plugin
  included).
- **Hubs**: event-loop delay p99 ≤ 20 ms at the WS5 scripted load; broadcast
  p95 ≤ 50 ms.
- **Go background workers** (`supervisor`'s six): DB queries per worker tick
  are bounded (a constant, not a function of rows or items); no query takes
  more than 50 ms on the seeded dataset; the pool size is declared in
  `pkg/config` and is ≤ the worker's concurrency.
- **Go HTTP services**: `assets` and `status` responses fall under the `api`
  class and its `GET` budget above.

**Ratification.** After P0 the coordinator replaces "provisional" with the
ratified table, adjusting a number only when the baseline shows it is wrong for
this hardware (e.g. every route, including trivial ones, sits above it). A
budget is never loosened to make a specific slow route pass — that route is the
work.

## 3. Regression tolerance

No change may make any route in the route list worse than its baseline by more
than **the larger of 10 % or 5 ms** on p50 TTFB, or add **any** query, in
either auth mode — unless the results row explains the trade (e.g. "+1 query on
`/x`, −6 on `/y`, same request"). The coordinator re-checks this across the
merged tree in P2.

## 4. Definition of done — per change

A change is merged only when:

1. **It moved a number** — a results row per `01-method.md` §3, with the after
   value inside budget *or* a measured improvement on a route that is over
   budget.
2. **The response is unchanged** — same status, same body shape, same headers
   other than the ones the change intends (e.g. a new `cache-control`). A
   cache-policy change additionally passes the cache-safety checklist in
   `03-rules.md` §2.
3. **Nothing else regressed** (§3) on the routes the change could reach.
4. **`pnpm check:consistency` passes** on the commit (the hook enforces it).
5. **The tests it relies on exist** — a new cache or a rewritten query ships
   with the test that would fail if it served the wrong data.

## 5. Definition of done — per workstream

A workstream is done when every lead in its section of `04-workstreams.md` is
either **shipped** (a results row), **rejected** (measured, no win — the row
says so and the change is not merged), or **deferred** (with the reason and what
would unblock it), and every route it owns is inside budget or has a row
explaining why it cannot be from this workstream.

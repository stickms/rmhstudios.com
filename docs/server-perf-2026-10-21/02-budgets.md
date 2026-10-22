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

## 2. Ratified budgets

Ratified at integration (2026-10-22; drafted by the documentation agent, the coordinator reviews) against `results/baseline.json` and the post-merge runs `results/after.json` and
`results/after-run2.json` ([`06-report.md`](06-report.md) section 1). They were provisional until then.

Warm, production build, one process, seeded dataset, Redis on. "Signed" means the heavy bench user from
`01-method.md` section 1.5.

| Class | Anon TTFB p50 / p95 | Signed TTFB p50 / p95 | Queries / request (signed) | Throughput floor, rps at c=16 (anon / signed) |
| --- | ---: | ---: | ---: | ---: |
| `core` | 60 / 120 ms | 120 / 250 ms | <= 12 | 70 / 55 |
| `content` | 60 / 120 ms | 100 / 200 ms | <= 10 | 105 / 75 |
| `interactive` | 80 / 160 ms | 150 / 300 ms | <= 15 | 95 / 80 |
| `api` (`GET`) | 15 / 40 ms | 25 / 60 ms | <= 5 | 220 / 140 |
| `api` (POST) | - | 40 / 100 ms | <= 8 (writes in one transaction), see the note below | none (sequential only) |

Plus, for every route:

- **No unbounded read** - every `findMany` on a table that grows with users has
  a `take` (the unbounded-read guard in `lib/prisma.server.ts` logs offenders).
- **Response bytes**: an SSR page's serialized loader/dehydrated data <= 60 KB
  decoded for anon, <= 90 KB signed. An API `GET` list response <= 50 KB per page.
- **Cold start**: the first `GET /` after `/api/health` answers has TTFB <= 1.5 s (warmup plugin
  included). Boot to health is reported separately and is not budgeted.
- **Hubs**: event-loop delay p99 <= 20 ms at the WS5 scripted load; broadcast
  p95 <= 50 ms.
- **Go background workers** (`supervisor`'s six): DB queries per worker tick
  are bounded (a constant, not a function of rows or items); no query takes
  more than 50 ms on the seeded dataset; the pool size is declared in
  `pkg/config` (`GO_DB_POOL_SIZE`, default 3) and is <= the worker's concurrency.
- **Go HTTP services**: `assets` and `status` responses fall under the `api`
  class and its `GET` budget above.
- **No request errors**: a load pass with any non-2xx/3xx status, or any 429, is invalid for the throughput floor, not
  merely slow. (The harness sends a fresh `cf-connecting-ip` per request so the per-IP rate limiter is not measured.)

### 2.1 Ratification record

**What was checked, and what changed.** Only the "Load p95 @ c=16" column changed; every other number is the provisional one.
The rule was that a number is adjusted only when the baseline shows it is wrong for this hardware, for instance when every
route, trivial ones included, sits above it. None of the other numbers is: in `results/after.json` the TTFB budgets are
exceeded by 5 of 239 rows, the query budgets by 8, and the page-bytes budget by 35 of 111 page rows. Those rows are the
work, not the budget (`06-report.md` sections 4 and 6). A budget is never loosened to make a specific slow route pass,
and none was.

**Cold-start wording, not a number.** The provisional text, "first request to `/` after boot <= 1.5 s (warmup plugin
included)", was ambiguous between the first request and boot plus the first request. The baseline read it as the first
request, and so does this table: after `cold-start-after.json` the first `GET /` has TTFB 128 ms anonymous and 257 ms signed
(median of 3), and boot to `/api/health` is 1.28 s (1.26 s signed runs). Boot plus first request is 1.53 s anonymous and
1.58 s signed by total time, so it would not meet 1.5 s on the other reading; the number was not changed to hide that.

**The load rule is replaced by a throughput floor (WS0's objection, accepted by the coordinator).** The provisional rule,
"load p95 <= 2x sequential p95 at c=16", failed on all 233 load rows in the baseline, including `/api/health`: sixteen
concurrent requests queue on one Node process by definition, so load p95 is about 16 times the service time divided by the
cores in use, and no route that costs more than about 1 ms of CPU can meet a 2x bound. A rule every route fails measures
nothing. Throughput is what the single process can sustain, so the replacement is a floor on requests per second at c=16.

**How the floors were set.** From the two post-merge runs, `GET` rows only, taking each route's lower rps of the two runs and
then the class and auth median of those (the figures are in `results/after.json` and `results/after-run2.json`):

| Class | Auth | Routes | Median rps (lower of 2 runs) | Multiplier | Floor | Routes below the floor today |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `core` | anon | 9 | 144.8 | 0.5 | 70 | none |
| `core` | signed | 9 | 119.1 | 0.5 | 55 | none |
| `content` | anon | 29 | 217.3 | 0.5 | 105 | `/explore` 42.9, `/c/perf-community-1` 44.9, `/tag/tag1` 45.7 |
| `content` | signed | 36 | 153.7 | 0.5 | 75 | `/achievements` 67.8, `/explore` 36.1, `/c/perf-community-1` 38.2, `/tag/tag1` 38.8 |
| `interactive` | anon | 12 | 195.6 | 0.5 | 95 | none |
| `interactive` | signed | 16 | 167.4 | 0.5 | 80 | `/search` 68.4 |
| `api` `GET` | anon | 53 | 890.4 | 0.25 | 220 | `/api/users/search` 15.3, `/api/search` 89.6, `/api/communities/.../members` 160.6, `/api/rmharks/.../similar` 160.7 |
| `api` `GET` | signed | 69 | 562.9 | 0.25 | 140 | `/api/users/search` 15.1, `/api/search` 21.4, `/api/profile/user3/rmharks` 113.6, `/api/rmharks?cursor=...` 105.1, `/api/explore` 118, `/_serverFn/` explore 117.5, `/api/communities/.../members` 135, `/api/rmharks/.../similar` 130.1 |

Reasoning:

- **Why the median, and why a fraction of it.** In both runs the route-to-route spread is small: the median difference
  between runs is 3.1% and 90% of routes differ by under 8.9%, so a floor at half the class median is far outside run noise and
  also outside a different-day, different-load comparison. A route below half of its own class's median is an outlier by
  construction.
- **Why the multiplier differs.** Page classes are tight (the lower quartile is 0.67 to 0.99 of the median, because every page
  shares the same shell). The `api` class spans two orders of magnitude (15 to 4,386 rps) because it mixes a constant
  micro-cached answer with a hydrated feed page; half the median would fail a quarter of the routes that are each doing real work, so it
  is a quarter of the median, which still catches the pathological rows.
- **The routes below a floor are the open list, not a reason to move the floor.** `/tag/tag1` and
  `/api/users/search` were the slowest routes in the baseline and are still below their floors; the others are 200 KB
  pages or hydrated lists. They are listed in `06-report.md` and need their own results row to sit below a floor.
- **Not measured.** These floors are for this box (4 shared cores, Node 24, glibc, one process). The production
  `node-cluster` build with two workers on musl was not measured, so production throughput is not predicted by them. They
  are for comparing a later build on this same harness, not for sizing a deployment.

**Note on the POST query budget.** Since main's `016d2b199` (revoked sessions cannot write during the cookie-cache
window) every non-GET request reads the session row and its user row, two queries that were not in the baseline. The
`api` POST rows are now: post create 6, like 7, comment 9, follow 10. Comment and follow exceed the budget of 8 by 1 and
2 and are listed as such in `06-report.md` section 4. The budget was not raised: the two reads are a deliberate security
fix, and the budget is the thing that says a later pass should look for a cheaper way to carry it (for example one
joined read).

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

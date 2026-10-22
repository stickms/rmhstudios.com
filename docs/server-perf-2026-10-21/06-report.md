# Server-side performance program: report

Merged tree `4662bbbfa` (integration tip), baseline `8e107956` (`results/baseline.json`), written 2026-10-22.
Governing documents: [`index.md`](index.md), [`01-method.md`](01-method.md), [`02-budgets.md`](02-budgets.md) (ratified in this change),
[`03-rules.md`](03-rules.md). Ledgers: [`results/ws-0.md`](results/ws-0.md) to
[`results/ws-9.md`](results/ws-9.md).

The raw `server-bench` runs (`results/baseline.json`, `results/after.json`, `results/after-run2.json`, about 9k lines each) are not checked in: `results/compare.md` and this report carry the numbers. They are kept in git history at `1b437552d`, e.g. `git show 1b437552d:docs/server-perf-2026-10-21/results/after.json > after.json`, and `server-bench --compare` / `--summary` take any two paths.

## Summary

- **Outcome.** The typical route was already fast, so the medians barely moved (section 1). The program's measurable speed
  gains are a handful of routes: the signed tag feed 645 to 31 ms, signed post search 637 to 83 ms, people search 423 to 255 ms,
  plus in-process wins on sitemaps, OG cards, hub stalls, the status page and two worker queries.
- **The larger result is correctness.** Reading the paths to speed them up found a run of privacy defects: non-public
  posts on timeline page 2+, the profile Likes tab, post unlock, comment and post writes, and private communities.
  All are fixed with tests that fail on the parent (section 3).
- **Do first after deploy:** production `/api/auth/*` very likely returns 500 on any request carrying `x-forwarded-for`
  (zod 4.4.3 is below Better Auth's peer requirement). The fix is a lockfile bump that needs an image rebuild; verify it with
  `curl -H 'x-forwarded-for: 203.0.113.7' /api/auth/get-session` returning 200 (section 7, step 1).
- **Regressions.** Of 239 compared rows, 20 are outside the `02-budgets.md` section 3 tolerance: three on latency, all one
  cause (the new post-visibility filter binds a 2,000-follow viewer's follow list), seventeen on queries added by
  privacy fixes and by main's session-revocation fix. Recorded, not fixed (section 4).
- **Not measured:** hubs, sitemaps, OG cards and the Go services on the merged tree (their numbers are from the ledgers),
  the production `node-cluster` build, any production number.

**Environment deviations.** The baseline and the after-run are not a lab-grade A/B (`01-method.md` section 2):

- They were taken on different days (baseline 2026-10-21 19:35 UTC, load1 1.43; after 2026-10-22 06:52 and 07:09 UTC,
  load1 1.60 and 1.56) under different box load, with main's performance effort (two merges, 98 commits) in between.
  Where main shipped the same optimisation as a workstream, the numbers below are main's and the workstream's together.
- The seeded database gained migrations since the baseline (community invites and join requests, the two WS9 partial
  indexes, the three WS8 `post_hashtag` migrations). The after-run database is `rmh_perf_template` plus
  `prisma migrate deploy`, not the baseline's database.
- The four POST rows write to the database, so the posts, likes, comments and follows from the first run, the second run and
  the baseline all differ in content. Response bytes on feed-shaped routes move for that reason (for example
  `/api/rmharks?limit=20` signed 10,350 to 14,181 B; home signed 116,870 to 123,634 B), not necessarily because of a code change.
- One web process on the `node-server` preset, as in the baseline. Production runs `node-cluster` (two workers) on musl;
  neither was measured.
- **Query counts and response bytes are exact. Latency is indicative.** Two after-runs were taken back to back with the
  identical command to give a spread: across all 239 rows the median absolute difference in p50 TTFB between the runs
  is 0.2 ms (p90 0.6 ms, max 6.5 ms, `/api/search` signed), requests per second differ by a median 3.1% (p90 8.9%), and
  no row's query count differs (`results/after.json` against `results/after-run2.json`).

Commands (same flags as `results/ws-0.md` recorded for the baseline; both runs on the production build,
`NODE_ENV=production RMH_PERF_HEADERS=1`, Redis on, one process):

```bash
pnpm build
node --env-file=.env .output/server/index.mjs &
node scripts/perf/server-bench.mjs --base http://localhost:7105 --auth both \
  --routes scripts/perf/server-routes.json --warmup 5 --samples 30 --concurrency 16 --duration 4 \
  --out docs/server-perf-2026-10-21/results/after.json            # and again to after-run2.json
node scripts/perf/server-bench.mjs --compare docs/server-perf-2026-10-21/results/baseline.json \
  docs/server-perf-2026-10-21/results/after.json > docs/server-perf-2026-10-21/results/compare.md
node scripts/perf/cold-start.mjs --port 7105 --runs 3 --out docs/server-perf-2026-10-21/results/cold-start-after.json
```

## 1. Headline

Medians over the route list's `GET` rows that are valid in both runs (239 rows in each file, none invalid, no request
errors in either load pass). Each cell is baseline to after-run 1 (run 2 in brackets). The figure is the median of the
per-route values, not a traffic-weighted number. Queries are the median `x-rmh-queries` per route; home's streamed first
feed page is not counted (`ws-0.md` Deferred 2). Computed from `results/baseline.json`, `results/after.json` and
`results/after-run2.json`.

| Class | Auth | Routes | TTFB p50 ms | TTFB p95 ms | rps at c=16 | Queries |
|---|---|---:|---:|---:|---:|---:|
| core | anon | 9 | 7.3 to 8.8 (8.7) | 11.2 to 11.5 (12.5) | 152 to 145 (145) | 1 to 1 |
| core | signed | 9 | 9.4 to 10.9 (11.0) | 13.6 to 13.5 (13.7) | 138 to 119 (120) | 2 to 1 |
| content | anon | 29 | 4.1 to 4.6 (4.6) | 7.4 to 8.2 (8.7) | 229 to 217 (223) | 0 to 0 |
| content | signed | 36 | 6.4 to 6.9 (6.9) | 9.7 to 9.2 (10.0) | 164 to 161 (154) | 2.5 to 1 |
| interactive | anon | 12 | 4.7 to 5.4 (5.3) | 7.9 to 8.2 (9.0) | 212 to 196 (198) | 0 to 0 |
| interactive | signed | 16 | 5.8 to 6.3 (6.5) | 9.5 to 9.3 (9.9) | 179 to 169 (172) | 1 to 0 |
| api | anon | 54 | 1.6 to 1.7 (1.7) | 2.2 to 2.3 (2.3) | 996 to 890 (937) | 1 to 1 |
| api | signed | 70 | 2.5 to 3.1 (3.1) | 3.2 to 3.9 (3.8) | 663 to 569 (566) | 2 to 2 |

**What the medians say.** They say very little changed for the typical route, and that is the honest result: the
baseline's typical route was already inside budget (`ws-0.md`: everything outside its top-15 table was under 20 ms p95), so the
program's speed gains are concentrated in a few routes, and its larger effect is on what the routes are allowed to
return (section 3). Signed pages lost about one query each (most likely main's no-cookie Better Auth skip and
`getRequestSession` dedupe, the swap WS1 made first; this was not isolated). Typical latency and throughput moved the other
way by a small amount: `api` signed p50 +0.6 ms and rps -14%; pages -2% to -14% rps. Part of that is the unexplained
fixed cost described next, part is the privacy checks, part is day-to-day box load. All eight class medians are inside
their `02-budgets.md` section 2 TTFB and query budgets.

**An unexplained fixed cost per request.** The trivial `/api/health` (no session, no query) went from p50 0.6 ms and
1,820 rps to 0.8 ms and 1,437 rps (run 2: 0.7 ms, 1,551 rps); `/api/presence/online` (0 queries) from 1,836 to 1,450 rps.
That is roughly 0.15 ms of extra CPU per request on every route and it explains most of the `api` throughput drift. No
workstream touched those paths. The candidate is main's per-process performance collector (`7879e21d5`: Nitro request
hooks and a Prisma timing extension; it is not in the baseline and has no off switch), but this was not isolated by an A/B
build, so it stays unattributed.

### Biggest single wins

Wins are from the HTTP harness where the route is in `server-routes.json`; routes it does not cover (sitemaps, OG
cards, the Go services, the hubs, the worker queries) are quoted from the ledgers, in-process, and say so. Hubs, sitemap and OG were
**not re-measured on the merged tree**.

| Win | Workstream | Before | After | Source |
|---|---|---|---|---|
| `/tag/tag1`, signed (heavy user) TTFB p50 / p95, rps | WS8 | 645.1 / 714.0 ms, 5.5 rps | 31.0 / 36.4 ms (run 2: 32.4 / 41.6), 40.5 rps | `baseline.json` against `after.json`, row `tag\|signed`. In-process ledger: 78 / 116 to 13 / 22 ms, EXPLAIN 16,013 buffers to 99 (`ws-8.md` #1) |
| `/tag/tag1`, anonymous | WS8 | 72.4 / 80.2 ms, 34.2 rps | 22.5 / 28.2 ms, 46.8 rps | same files, row `tag\|anon`. +1 query (ids, then hydrate) |
| `/api/search?q=build`, signed | WS8 | 636.9 / 687.3 ms, 4.9 rps | 82.8 / 89.2 ms (run 2: 89.3 / 102), 21.5 rps | same files, row `api-search\|signed`. The 83 ms is the post-search part (`ws-8.md` Rejected: 20k matching rows) |
| `/api/users/search?q=user1` | WS8 | 422.5 / 459.9 ms signed; 424.0 / 453.7 anon; 9 rps | 255.5 / 260.7 ms; 254.4 / 261.0; 15 rps | same files. A rare query ("heavy", "zzqx") goes from 606 / 590 ms to 4.8 / 3.4 ms in-process (`ws-8.md` #2): the HTTP route uses the common query "user1", where the floor is the trigram scan of 11k matches |
| `status` page `GET /` | WS7 | 34,936 allocs/op, 8.6 MB, 9.25 ms | 14 allocs/op, 91 KB, 0.038 ms | `go test -bench`, `ws-7.md` #1; `/api/dashboard` 951 to 12 allocs, `/metrics` 6,202 to 10. Not an HTTP-harness route |
| Go worker pool (six workers on one shared connection) | WS7 | `MaxConns = 1` | `GO_DB_POOL_SIZE`, default 3 | `99980abec`. No before/after number in any results file |
| 40k-URL sitemap chunk, event-loop stall | WS6 | ~140 ms Prisma decode plus 40-50 ms render | ~25 ms, then served from a 10 min L1 or a 304 | `ws-6.md` #8, #9, in-process |
| OG card cold render, event-loop stall | WS6 and main | page 224 ms, post 233, story cards 896 / 918 | page 10 ms, post 13, story cards 27 / 31 (main's `svgToPng`; WS6 added `loadSystemFonts:false`, 144 to 56 ms) | `ws-6.md` #1, #7, in-process |
| Hub first-action stall (cold Prisma, 3 casino seats) | WS5 | 444 / 284 ms event-loop max | 13.9 / 18.9 ms | `ws-5.md` #2. RMHTube chat DB commits 38.7 to 15.2 per second (#4, exact) |
| Public-GET micro-cache, `/api/tournaments` | WS3 | 1.4 / 1.8 ms, 1,183 rps, 1 query | 0.8 / 1.0 ms, 1,222 rps (run 2: 1,259), 0 queries | `baseline.json` against `after.json`. At production table sizes the saving per hit is the query time; here the query is 1 ms (`ws-3.md` #6) |
| Bot-worker recent-comments scan, `rmheet_comment` | WS9 | Parallel Seq Scan, ~3.9k buffers, 40 ms | Index Scan, ~1.4k buffers, 4.2 ms (cold) | `EXPLAIN (ANALYZE, BUFFERS)`, `ws-9.md`. Vibe stale-thumbnail poll 2.59 ms to 0.14 ms |
| Mention search, signed | WS2 and main | 5.3 / 9.0 ms, 244 rps, 3 queries | 2.0 / 2.7 ms, 830 rps, 0 queries | `baseline.json` against `after.json` (shared with main's `757b1d6df`; WS2 row 13 removed the remaining follow-edge load) |
| `/explore`, signed | WS4 and main | 39.0 / 47.3 ms, 5 queries | 33.5 / 37.6 ms, 3 queries | same files |
| Cold start, first `GET /` | none | 160 ms anon / 263 ms signed (boot 1,359 / 1,378 ms) | 128 / 257 ms (boot 1,277 / 1,260 ms) | `results/cold-start.json` against `cold-start-after.json`, median of 3 |

Not a win, and recorded as such: `/achievements` signed still serves a 311,598 B document (baseline 317,733 B); the
catalog markup is a component problem (section 6, item 4). Home signed went 9.8 / 15.5 to 12.8 / 17.0 ms and 107 to 87 rps
(run 2: 12.9 / 19.3, 86 rps); that is outside run-to-run spread, the body grew by 6.8 KB (the dataset effect above) and
home now runs the signed-in feed reconcile (+1 op on a warm hit, `ws-2.md` #4), the likely cost; this was not
isolated.

## 2. Per-workstream summary

Counts are rows in each ledger's Shipped / Rejected / Deferred tables. "Superseded" rows are work main shipped
first (the integration branch kept one implementation, main's); they are not counted as shipped. Evidence class
in brackets: `exact` = counts, bytes, headers; `latency` = a clock.

| WS | Shipped | Rejected | Deferred | Headline | Ledger |
|---|---:|---:|---:|---|---|
| 0 | 5 | 1 | 4 | Harness, seeded dataset, `Server-Timing` `sess`/`cache`/`db`, `x-rmh-queries`; found that every production request reported 0 queries because of two bundled `AsyncLocalStorage` copies (`2c8178d7a`) [exact] | [`results/ws-0.md`](results/ws-0.md) |
| 1 | 4 (+2 superseded) | 1 | 7 | zod 4.4.3 to 4.6.5 so `/api/auth/*` stops returning 500 on `x-forwarded-for` [exact]; `/news` document 655,258 B to 55,681 B anonymous [exact] | [`results/ws-1.md`](results/ws-1.md) |
| 2 | 14 (+4 superseded) | 3 | 1 | Seven correctness and privacy fixes in the feed, comments and profile paths (section 3); mention-search 6.7 to 5.3 ms in-process [latency] | [`results/ws-2.md`](results/ws-2.md) |
| 3 | 5 (+1 superseded) | 3 | 2 open (D1 shipped as row 6) | Public-GET micro-cache: `/api/tournaments` 935 to 1,243 rps at c=16, 1 to 0 queries [latency]; `apiCache` invalidations now reach every process [exact] | [`results/ws-3.md`](results/ws-3.md) |
| 4 | 11 + 2 correctness fixes + invites feature | 4 | 7 | Private communities members-only on every read path; read-replica routing of search, boards and admin counts; messages-search snippet 16-29 ms to 2-3 ms [latency] | [`results/ws-4.md`](results/ws-4.md) |
| 5 | 4 | 4 | 4 | Hub first-action stall 444 / 284 ms to 13.9 / 18.9 ms (Prisma warm at boot) [latency]; RMHTube chat commits 38.7 / 39.7 to 15.2 per second [exact] | [`results/ws-5.md`](results/ws-5.md) |
| 6 | 9 (+2 superseded) | 2 | 4 | Sitemap chunk build blocked the loop ~140 ms plus 40-50 ms of rendering, now ~25 ms, then served from L1/304 [latency, exact]; OG render stall 224-245 ms to 10-16 ms (superseded by main's `svgToPng`, which this branch tuned: 144 to 56 ms) [latency] | [`results/ws-6.md`](results/ws-6.md) |
| 7 | 10 | 3 | 5 | `status` cached responses: `GET /` 34,936 to 14 allocs/op, 9.25 to 0.038 ms; bot-worker DM tick 61 statements to 1; streak-saver sweep 500 statements to 1 [exact] | [`results/ws-7.md`](results/ws-7.md) |
| 8 (added mid-program) | 2 | 3 (no change) | 0 | `/tag/:tag` heavy user 78 / 116 ms to 13 / 22 ms; people search "heavy" 606 / 639 ms to 4.8 / 7.1 ms [latency, in-process] | [`results/ws-8.md`](results/ws-8.md) |
| 9 (added mid-program) | 2 indexes | 1 index | 0 | `recentCommentsQuery` 40 ms / ~3.9k buffers to 4.2 ms / ~1.4k; vibe stale poll 2.59 to 0.14 ms [exact buffers, latency] | [`results/ws-9.md`](results/ws-9.md) |

**WS0 (harness and baseline).** Built `scripts/perf/` (`server-bench.mjs`, `server-routes.json` with 137 entries,
`seed-perf-db.ts`, `cold-start.mjs`), wired three `Server-Timing` phases and the bench-only `x-rmh-queries` header,
and cut the template database. The first production build reported zero queries on every route: Nitro bundled the
tracing hook and the app separately, each with its own `AsyncLocalStorage`; the fix pins both stores on `globalThis`
(`2c8178d7a`). `loader` and `render` phases were not wired (no choke point). WS0 also raised a rule objection on the
`load p95 <= 2x sequential p95` budget, which section 8 and `02-budgets.md` now resolve.

**WS1 (SSR shell and loaders).** The Stage A session-dedupe change was overtaken by main's identical swap, so the
standing wins are the `/news` loader (655,258 B to 55,681 B anonymous document, 2 queries to 1; the 138 KB figure in the
Stage A rows was measured on `vite dev`) and the two production-build findings: the zod defect that made Better
Auth's IP check a no-op and 500 any `/api/auth/*` request carrying `x-forwarded-for` (`8ea00b929`), and two r3f
`<Canvas>` pages that raised a render error on every server render (`a7baf7972`). It measured page payloads (14-26 KB of
loader data; the rest is markup) and cold start (unchanged, 161 ms anonymous / 314 ms signed first TTFB) and found no
loader change that would move either.

**WS2 (feed, graph, notifications, messages).** The workstream's real output is correctness: the For-You timeline
leaked non-public posts on page 2+, the profile Likes tab had no visibility check, and repost, comment, like, unlock
and quote accepted posts the caller could not read (section 3). The performance rows are the signed-in first-page cache
(reconcile at serve time: about 1 ms and 1-2 Prisma operations on a hit, against 14 on a cold assemble), the routing
fix that put those pages in the per-viewer LRU (`1625b3abc`), a bounded mention-search (6.7 / 10.7 to 5.3 / 5.5 ms),
and keyset-correct followers/following lists (7 of 40 rows returned for a tie-heavy user, now 40 of 40). The `rmheet ... LATERAL`
baseline lead was attributed to the tag feed and handed to WS8.

**WS3 (API layer).** Triaged all GET/HEAD handlers (507 at the time of the scan; 512 after the last main merge) into a
verdict per route and made the table a failing test, so a new route has to be classified. Declared public policies on
eight proven anonymous-invariant GETs and dropped the session lookup from eight routes that never read it. Because the repo has
no Apache or Cloudflare cache rule for `/api`, those `s-maxage` values are inert at the edge; the micro-cache in
`defineHandler` (per worker, `min(sMaxAge, 30 s)`, single-flight, 64 KB cap) is the origin-side answer. The Redis
bridge makes the ~25 `apiCache.invalidate*` call sites reach every process (it matters with main's two-worker web
tier). Handler fixed overhead was measured and left alone: about 0.5 ms over the `/api/health` floor.

**WS4 (database).** Moved search, board, news-list and admin-count reads to `prismaRead`, trimmed over-fetching
selects (news body, library `toc`, user-builds cards), bounded `/api/feedback` and the library cover variants,
and replaced the messages-search snippet with one bounded `DISTINCT ON` query. No index was added by WS4 itself; the
indexes came from WS8 and WS9. Its two correctness rounds are in section 3: private communities (members-only, then
listed-and-locked with invite links and join requests, migration `20261022030000`) and the user-builds search/cursor
overwrite. Four index and sitemap ideas were measured and rejected (section 5).

**WS5 (realtime hubs).** Built `socket-bench.mjs`. Baseline hub health was already inside budget (event-loop p99
0.9-3.8 ms against 20 ms; broadcast p95 0.9-2.4 ms against 50 ms), so the shipped rows are the specific stalls and costs the
bench exposed: a cold Prisma on first casino action (444 / 284 ms to 13.9 / 18.9 ms), per-socket encoding of farming
broadcasts (FARM_STATE 575 / 504 us to 122 / 134 us), and RMHTube chat writes at one commit per message (38.7 / 39.7 per
second to 15.2, with up to 1 s of chat lost on a hard crash). Four other ideas were already done or unsafe.

**WS6 (CPU-bound endpoints).** The OG-render rows were overtaken by main's `dedupeOgRender` and `svgToPng` (the
branch kept the story-card cache-key fix, `dff14c642`, and tuned `svgToPng` with `loadSystemFonts: false`, 144 / 141
to 56 / 91 ms). Standing wins: the image-variant key space bounded to a 27-rung ladder with single-flight and a CPU
gate (the stall on `fs.stat` during 8 concurrent AVIF encodes: 1,364-2,419 ms to 0.6-5.5 ms), sitemap chunks
streamed in 5k slices (event-loop stall ~140 ms plus 40-50 ms rendering, to ~25 ms) behind a 10 min L1 with ETag and
304, and a capped, cached `/api/oembed`. All sitemap, OG and oembed figures are in-process; no HTTP-level run.

**WS7 (Go services).** Hand-edited `BUILD.bazel` files because Bazel could not fetch modules in the sandbox
(follow-up in section 6). Shipped ten rows, all `exact` on allocations or statement counts: the status page
response cache (2 s, per probe cycle), a precompiled-regexp bot-worker tick (57,918 to 1,000 allocs), batched DM, streak
and decay statements, connection reuse in the prober, and conditional requests in `assets`. The supervisor's
single shared connection (Deferred 3 in the ledger) was fixed afterwards in `99980abec`: `GO_DB_POOL_SIZE`, default 3.
That commit carries no before/after number in any results file.

**WS8 (search and tags, added mid-program).** The tag feed ordered by the post's `createdAt` while the
`post_hashtag` index carried link time, so no index could stop at 21 rows. Stamping the post's `createdAt` on the link,
realigning old links (migrations `20261022160000`-`160200`) and reading by keyset took the heavy user from 78 / 116 ms to
13 / 22 ms in-process and the EXPLAIN from 3,993 primary-key probes (16,013 buffers, 15.5 ms) to 21 index rows (99
buffers, 0.22 ms). People search was a sequential scan because its `OR` spanned a join; a token-aware probe now picks
an index-eligible plan for rare queries (606 / 639 ms to 4.8 / 7.1 ms) and a single fold-once scan for common ones (432 / 466 to 264 / 278 ms).
Equivalence was checked against the old code on 282 tag pages and about 30 people queries with zero mismatches.

**WS9 (worker index follow-ups, added mid-program).** Two partial indexes recommended by WS7: `vibe_page` stale
thumbnails (2.59 ms and 348 buffers to 0.14 ms and 11, polled every 10 s) and live recent comments (40 ms to 4.2 ms
cold). The `conversation(lastMessageAt)` index was rejected: the planner kept its bitmap scan at the same 1,055 buffers.
Neither partial index appears in `schema.prisma` (Prisma cannot express them).

## 3. Correctness and privacy fixes found during the program

These came out of reading the paths to make them fast, and several are worth more than the speed work. Each has a
test that fails on the parent commit; the counts are from the ledgers. Where a fix added a deliberate query, the
extra cost is listed, because section 4 will show it as a "regression" against the baseline. The privacy rows are
`exact` evidence: they are planted-row and status-code tests, not timings.

### 3.1 Privacy: a viewer could read or write what they should not see

| # | Defect | Fix | Cost of the fix | Commit | Test (fails on parent) | Ledger |
|---|---|---|---|---|---|---|
| 1 | The For-You timeline (`/api/rmharks`, page 2+) returned PRIVATE, FOLLOWERS and CIRCLE posts: the keyset `OR` overwrote the audience `OR`. The Following surface skipped CIRCLE/SUPPORTERS/repost audience rules | keyset and audience filters combine with `AND`; Following applies the audience rules | none | `23a135720` | `lib/feed/__tests__/timeline-audience.test.ts` (7 of 8 fail) | WS2 #1 |
| 2 | Profile Likes tab and profile reposts had no visibility check (deleted, audience, blocks, paywall lock) | full check in the query; Likes also drops 4 COUNTs per post and an unbounded reactions include | none | `386bac60f` | `visible-post-where.test.ts` | WS2 #2 |
| 3 | `POST /api/rmharks/:id/repost` accepted posts the caller could not see (6 of 6 invisible cases) | 404, no write | +1 read | `a08c094a6` | `repost-visibility.test.ts` | WS2 #3 |
| 4 | Every comment read (thread GET, comment likers, comment reposters, thread summary, translate) ignored the parent post's visibility | `canReadThread`: not deleted, audience, hidden author; 404 otherwise | +1 post read on a thread GET, +1 targeted follow/circle read on non-public posts | `47714e890` | `comment-thread-visibility.test.ts` (19 of 25 fail) | WS2 #8 |
| 5 | Comment writes (create, reply, like, repost, react, view), post likers/reposters GET and `/api/v1/posts/:id/comments` GET on invisible threads | same gate; undo actions stay allowed, un-react returns no roster | comment POST +0 public (+1 targeted non-public); comment like/repost/view +1; likers/reposters +1 | `f0b71d61b` | `comment-write-visibility.test.ts` (43 of 58 fail) | WS2 #9 |
| 6 | Post-level writes and readers: like, react, bookmark, save, poll vote, quote, **unlock** (returned any post's text for free or unlocked posts and charged for unreadable ones), the thread-by-id read (no check at all), v1 `/posts/:id` and `/me/bookmarks`, oEmbed, embed, OG and story cards, `ask-feed`, recommend, digest, site-wide post search; @mention notifications carried a post's text to users who cannot read it | the same thread rule; mention fan-out reads visibility per recipient | +0 on public posts for like, react, bookmark, unlock, quote; poll vote +1; saves +1; mentions +1 read per fan-out | `60f3680df` | `post-write-and-reader-visibility.test.ts` (44 of 66 fail) | WS2 #11 |
| 7 | Posts in a private community were readable by non-members by id, on profiles, in likes, reposts, tags, explore and quotes | members-only (any `community_member` row); `communityVisibleWhere` anti-join in the same statement; `canViewPost` now requires `communityId`; cached feed pages drop any post with a `communityId` | +0 for ordinary posts; +1 `community` read per post-level check on a community post | `bb607016e` | `private-community-posts.test.ts` (8 of 12 fail) | WS2 #10 |
| 8 | Private communities on every community read path: `getCommunity`, `/feed` incl. cursor pages (the membership read ran only on page 1), extras, `/members`, `/announcements`, `/api/community-pages`, revisions, and `/communities` listing; `POST /join` let a non-member join a private community | members-only reads (404, indistinguishable from a missing community); join refused | `/announcements` GET moved onto `defineHandler` | `2eb6725b2` | `private-community-access.test.ts` (9 of 10 fail) | WS4 C1 |
| 9 | `GET /api/comments/:id/translate` served a removed or edited comment's translation from a public cache (browser 1 h, shared 24 h) | public cache dropped; deleted/edited/post-visibility checked on every request; memo keyed by text hash | +1 indexed read per hit | `4525a9338` | `comment-translate.test.ts` (4 of 5 fail) | WS2 #5 |
| 10 | The signed-in feed cache (60 s) served blocked, deleted, muted and no-longer-visible posts | reconcile at serve time (blocks, mutes, deletes, audience, unfollow, circle, muted tags/words, unlock) | warm hit: 0 to 1 op (For-You) / 2 ops (Following), about 1 ms | `2563e1eed` | `timeline-cache-reconcile.test.ts` (10 of 12 fail) | WS2 #4 |
| 11 | Circle edits left the affected members' cached feed pages in place | drop pages for old and new members | n/a | `e4face3b8` | `circle-invalidation.test.ts` | WS2 #6 |
| 12 | After main split the feed cache, signed-in pages were routed to the 5,000-entry general LRU, not `viewerFeedCache`: the router matched `feed:v2:` while the producer wrote `feed:v3:`. Viewer pages competed with anonymous feed and sidebar keys | `VIEWER_FEED_PREFIX` exported from `lib/cache.ts`; the producer builds keys from it | none; eviction rate was not measured | `1625b3abc` | routing test fails if the prefix is reverted | WS2 #12 |
| 13 | OG story card cache key was the post id only: an edit or content warning was served stale for the TTL | key covers everything drawn | none | `dff14c642` | `postStoryCacheKey` test | WS6 #3 |

Left ungated on purpose (`results/ws-2.md` Notes): `POST /rmharks/:id/view` (constant `{success:true}`, IP-rate-limited,
buffered in Redis; a primary-key read on the hottest write path buys nothing) and `POST /moderation/report` (intake
must work for content the reporter just lost access to). Not audited: search inside a community, `lib/feed/rss.server.ts`
(already `communityId: null`), own-data aggregates (wrapped, recap, bio, export).

### 3.2 Private communities as a feature: listed and locked, with invites and join requests

The members-only rule removed the only way into a private community, so WS4 built the way in (user decision):
metadata (name, icon, colour, description, member count, lock badge) is public; posts, members, announcements, pages,
revisions, events and flairs are members-only. Models `CommunityInvite` and `CommunityJoinRequest` (migration
`20261022030000`, additive); invite links with `maxUses`, `expiresAt` and revocation; join requests with a 7-day
re-request cooldown; routes under `/api/communities/$slug/{invites,join-request,join-requests}`; a locked preview at
`/c/$slug` and an invite page at `/c/$slug/invite/$code` (both `noindex`, out of the sitemap); Requests and Invites tabs in the
mod tools. Commits `5d145e0e5`, `f4330ce65`, `30b57e416`, `6818c0e96`, `0f18894de`, `3baa0df46`. Tests include
`invites-concurrency.test.ts` (opt-in via `RMH_TEST_DATABASE_URL`): 40 concurrent accepts of a `maxUses=5` invite admit exactly 5.
The UI has not been checked in a browser (section 6).

### 3.3 Correctness: other defects

| # | Defect | Fix | Commit | Ledger |
|---|---|---|---|---|
| 14 | **Production `/api/auth/*` returned 500 on any request with `x-forwarded-for`.** The app resolved zod 4.4.3; Better Auth core needs `^4.5.4` (`z.validate`). pnpm only warned about the unmet peer, and rolldown compiled the missing export to `(void 0)`, so `isIPv4` threw `TypeError: (void 0) is not a function`. `vite dev` resolves Better Auth's own zod 4.6.5 copy, so dev never showed it. Production exposure: `deploy/apache/rmhstudios.conf` uses `ProxyPass /` without `ProxyAddHeaders Off`, so Apache adds `X-Forwarded-For` to every request, and the Dockerfile installs with `--frozen-lockfile` (the same 4.4.3). Sign-in, sign-up, OAuth callbacks and sign-out are therefore likely failing in production now. **I could not check the VPS**; the production build reproduces it exactly, and main still pins `zod ^4.4.3`. | zod bumped to `^4.6.5` (lockfile edited to only the zod hunks); needs an image rebuild | `8ea00b929` | WS1 B1 |
| 15 | `lib/feed/notify-mentions.server.ts` auto-merged without its `prisma` import: main swapped it for `findUsersByHandles` while this branch's audience gate still reads the post, so every mention notification would have thrown | import restored while merging main; type predicate aligned with main's `HandleMatch` | `789fb650e` (merge) | merge message |
| 16 | `GET /api/user-builds` with `search` plus a `cursor` and `sort=popular\|views`: the cursor `OR` overwrote the search `OR`, so search was dropped on page 2 | `where.AND` of both groups | `46bbfb39a` | WS4 C2 |
| 17 | Followers/following lists paged on `createdAt` alone, skipping ties (7 of 40 rows returned for 40 follows with one timestamp, limit 7) | page on `(createdAt, id)`; bare ISO cursors still accepted; six routes | `c08dd25c9` | WS2 #14 |
| 18 | Marking DMs read left the Redis `dm:unread:<uid>` badge stale for up to 60 s; read-all took 2 statements | both routes drop the key; read-all is 1 statement | `b48d5289c` | WS2 #7 |
| 19 | `<Canvas>` on `/cookgame` and `/isleworks` raised `Cannot read properties of null (reading 'useMemo')` on every server render (WS0 counted about 2,000 logged errors per baseline run) | client-only boundary; 0 errors in a sweep of all 398 static page paths | `a7baf7972` | WS1 B2 |
| 20 | Every production request reported `x-rmh-queries: 0` and `total`-only timing | `AsyncLocalStorage` stores pinned on `globalThis` | `2c8178d7a` | WS0 #3 |

## 4. Regressions checked

The `02-budgets.md` section 3 check across the merged tree: every route and both auth modes, flagged when p50 TTFB is
worse by more than the larger of 10% or 5 ms, or the query count rose.

```bash
node scripts/perf/server-bench.mjs --compare docs/server-perf-2026-10-21/results/baseline.json \
  docs/server-perf-2026-10-21/results/after.json     # full table: results/compare.md
```

**Result: 239 rows compared (137 route entries, both auth modes where they apply), 0 new rows, 0 invalid; 20 rows are
outside tolerance. Three are flagged on latency (two of them also added queries); the other seventeen are added queries only.
Every one has a stated cause below.** Run 2 flags exactly the
same 20 rows with the same query counts (`--compare` of `after-run2.json`; p50 shown as run 1 / run 2). No route's query count rose without
an identified cause. No change was made: the rule for this section is to record.

How each was investigated: the four slowest (and the For-You feed) were re-run alone (`--only thread,api-profile-posts,api-profile-likes,api-bookmarks,api-feed-foryou`,
twice, signed) and with the lighter `bench` user (100 follows) to test the cause; then the SQL for every flagged route
was read from the Postgres statement log (`log_statement=all` on the after-run database, one warm request each) to see which
statements were added and what they bound.

### 4.1 Latency regressions (3 rows flagged, 1 near-miss), all from one cause

| Route | Auth | p50 baseline to merged (run 1 / 2) | Queries | Cause | Verdict |
|---|---|---|---|---|---|
| `/thread/cp00000100` | signed | 9.4 to 17.7 / 17.8 ms (alone: 22.2, 18.8) | 5 to 5 | The thread-by-id read had no visibility check; it now applies `viewerVisiblePostWhere` (`60f3680df`). For a viewer who follows 2,000 accounts the FOLLOWERS branch binds all 2,000 ids: the statement carries 2,023 parameters, and one `close_friend` read is added (the query count stays 5 because main removed another) | Real, deliberate, scales with the viewer's follow count. Same route with the `bench` user (100 follows): 12.0 ms |
| `/api/profile/user3/rmharks` | signed | 7.5 to 14.1 / 14.4 ms (alone: 15.0, 13.7) | 7 to 8 | Profile reposts get the full visibility check (`386bac60f`): +1 `follow` read, +1 `close_friend` read, 2,025 parameters | Real, deliberate. `bench` user: 7.7 ms, equal to the heavy user's baseline of 7.5 |
| `/api/profile/heavyuser/likes` | signed | 6.6 to 14.3 / 15.4 ms (alone: 14.6, 14.3) | 2 to 5 | Likes tab gets the visibility check (`386bac60f`): `close_friend` read, the 2,023-parameter filter, and the reactions split into a `groupBy` count plus a viewer-reaction read, replacing a nested include | Real, deliberate. `bench` user: 3.9 ms (a different body, 46 B) |
| `/api/bookmarks` | signed | 3.4 to 7.4 / 7.9 ms (alone: 7.2, 7.8) | 2 to 3 | The list applies the same filter in the same statement (`60f3680df`), 2,019 parameters, +1 `close_friend` read | Real, deliberate. +4.0 ms is under the 5 ms floor but over 10%. `bench` user: 4.8 ms |

These are all the heavy bench user, the worst case in the dataset (2,000 follows); a typical account follows far fewer
and the same routes cost the `bench` user (100 follows) much less (the baseline did not record that user, so this is a
cause test, not a before/after). The cost is the shape of the fix, not the
privacy rule: the post visibility predicate expands the viewer's follow list into an `IN` list of bound parameters. A
correlated `EXISTS (SELECT 1 FROM follow ...)` on `(followerId, followingId)` would carry the same rule in a constant
number of parameters. That is a follow-up (section 6.2, item 40); it needs the visibility tests in `lib/feed/__tests__/`
to keep passing, which is why it was not done here.

### 4.2 Added queries within the latency tolerance (16 rows; with `/api/bookmarks` above, 17)

| Route | Auth | Queries | p50 (run 1 / 2) | Why the query was added |
|---|---|---|---|---|
| `/api/rmharks?limit=20` | signed | 0 to 1 | 1.4 to 3.5 / 3.2 ms | Signed-in feed pages are reconciled at serve time (`2563e1eed`, `ws-2.md` #4); For-You adds 1 op on a warm hit (design: "For-You 1 op, Following 2 ops") |
| `/api/rmharks?feed=following&limit=20` | signed | 0 to 2 | 1.4 to 4.2 / 4.4 ms | Same |
| `/_serverFn/9e7d4e85...` (initial feed) | signed | 0 to 1 | 1.4 to 3.1 / 2.8 ms | Same code path by shape. The statement log showed no extra statement for this route on a warm request, so the op is attributed by shape, not by log |
| `/api/rmharks/cp00000001/comment`, `/cp00000100/comment` | anon and signed (4 rows) | 2 to 3 | +0.9 to +1.3 ms | Every comment read applies the parent post's visibility (`47714e890`, `ws-2.md` #8): +1 post read |
| `/api/profile/heavyuser/likes` | anon | 2 to 3 | 2.2 to 2.8 / 2.7 ms | The Likes visibility check (`386bac60f`) |
| `/api/rmharks` (POST create) | signed | 4 to 6 | 9.8 to 11.3 / 9.7 ms | **Not from a workstream:** main's `016d2b199` forces the session row and its user row to be read on every non-GET request (revoked sessions can no longer write during the cookie-cache window): the first two statements of every write in the log |
| `/api/rmharks/cp00000092/like` (POST) | signed | 6 to 7 | 5.3 to 7.6 / 6.6 ms | Same two session reads, minus one read main removed from `togglePostLike`; the public-post thread check adds columns, not a query (`60f3680df`) |
| `/api/rmharks/cp00000092/comment` (POST) | signed | 7 to 9 | 6.3 to 9.2 / 10.2 ms | Same two session reads |
| `/api/profile/user10/follow` (POST) | signed | 8 to 10 | 6.9 to 9.6 / 9.2 ms | Same two session reads |
| `/tag/tag1` | anon | 2 to 3 | 72.4 to 22.5 / 22.6 ms | WS8's keyset feed reads the ids first, then hydrates them: one query more, 50 ms faster (`8db580139`) |
| `/api/search?q=build` | signed | 7 to 8 | 636.9 to 82.8 / 89.3 ms | WS8's people-search probe (a `count(*)` of the `LIKE` matches picks the plan) |
| `/api/users/search?q=user1` | anon and signed (2 rows) | 2 to 3 | 424.0 to 254.4; 422.5 to 255.5 ms | Same probe |

Four of those rows (`/tag/tag1` anon, `/api/search`, and `/api/users/search` twice) got an extra query and are 50 to 550 ms faster. The
four write rows' extra queries are main's security fix, which `02-budgets.md` section 2 ("api POST") now accounts for.

### 4.3 Also looked at

- **Unexplained fixed cost.** `/api/health` anon 0.6 to 0.8 ms and 1,820 to 1,437 rps; every `api` class median rps fell 6% to
  14%. Under the 5 ms floor, so it is not a section 3 flag, but it is the same direction on every row (section 1).
- **Bytes.** Pages shrank by about 4 KB on 40 signed routes (for example `/games` signed 101,080 to 97,809 B; main's changes,
  not a workstream's). `/api/rmharks?limit=20` signed grew 10,350 to 14,181 B for the dataset reason in the header.
- **Budget status after the merge** (`node scripts/perf/server-bench.mjs --summary results/after.json`): five rows over a TTFB budget
  (`/api/users/search` both modes, `/api/search` signed, `/api/announcements` anon p95 44.2 against 40 with a p50 of 2.5, `/api/communities/perf-community-1/members` anon p50 15.8
  against 15) and eight over a query budget (`/rmhladder` 17 of 15, `/api/profile/user3/rmharks` 8 of 5, `/api/search` 8 of 5, the community feed 6 of 5,
  the `fetchBoard` server function 6 of 5, and the follow, comment writes). The baseline had six and six.

## 5. Rejected ideas registry

Merged from the Rejected tables and the "superseded by main" rows of every ledger. Binding in the way the loading
audit's "Measured and rejected" table is: do not retry without new evidence. Each row carries the number that killed
it. "Rejected on correctness" rows have no timing because the objection is that the cache would serve wrong data.

### 5.1 Measured, no win

| WS | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---:|---:|---|
| 0 | Wrap `nitroApp.fetch` in `AsyncLocalStorage.run` so the request hook's scope reaches handlers | all | `x-rmh-queries` | 0 | 0 | The cause was two bundled module copies, not `enterWith`; fixed by pinning on `globalThis` |
| 1 | `getSidebarData({recommendedUsers:false})` on `/explore` | `/explore` signed | queries | 7 | 7 | `listExplore` reads the same `getFollowingIds` key, so the follow query only moved; 4 user objects left the payload |
| 2 | Slimmer notifications list query | `listNotifications`, 2,000-row user | p50 / p95, 1 op | 1.94 / 8.08 ms | n/a | One indexed op on `(userId, createdAt desc)`; nothing to remove |
| 2 | Cheaper post GET (`_count.votes`) | post GET | p50 / p95 | anon 1.75 / 4.09; viewer 2.31 / 6.58 ms | n/a | `_count.votes` is per option (bounded), not per post |
| 2 | Drop `_count` from the comment GET | comment GET | p50 / p95 | 1.96 / 13.75 ms | 1.89 / 4.26 ms | p50 equal; the p95 gap was not reproduced. Handler is already keyset-bounded. `rmheet_comment_view` is empty in the seed, so a large views table is not covered |
| 3 | Private `Cache-Control` windows on 216 viewer-bound GETs | `/api/search`, `/api/shop`, `/api/users/search`, `/api/communities`, ... | headers | none | none | Results carry block, mute, membership or owned state, and a browser copy cannot be purged after the viewer's own write (`03-rules.md` 1.3) |
| 3 | Public cache on market listings, awards, replay lookups, UGC comment/revision lists | see `PUBLIC_BUT_NOT_CACHED` in `lib/__tests__/api-cache-policy.test.ts` | headers | none | none | Viewer-independent, but the actor must see their own action at once or moderation must not be stale; a test fails if a reason goes stale |
| 3 | Tune `defineHandler` fixed overhead | `/api/delight/config`, `/api/experiments` | p50 over `/api/health` | `/api/health` 0.7 ms | 1.2-1.8 ms (no cookie), 2.2 ms (signed) | About 0.5 ms for the rate-limit round trip and 0.4 ms for session and tier; nothing is done twice. No change made |
| 4 | Keyset pagination or a server cache for sitemap chunks | `/sitemaps/posts-N.xml` | `EXPLAIN ANALYZE` | offset 150,000: 364 ms | offset 0: 396 ms | Cost is the 40k rows each chunk returns plus the join, not the offset skip. A 40k-entry chunk in L1 is about 4 MB. (WS6's batching then reduced the loop stall, a different metric.) |
| 4 | Trigram GIN on `direct_message.content` | `/api/messages/search` | `EXPLAIN ANALYZE` | 0.3 ms (semi join from the viewer's conversations) | n/a | Scoped to the viewer's conversations, never scans the 50k-row table; an index only adds write cost |
| 4 | Parallelise `getCommunity` (member + announcements) | `/api/communities/$slug` | round trips | 3 | 2 | One local-socket round trip is not measurable. Reverted unmerged; retry only against a remote DB |
| 4 | New index for the post-search recall query | `/api/search` posts | `EXPLAIN ANALYZE` | 3.7 ms, five Bitmap Index Scans | n/a | Already index-backed. Caveat: seeded post text is synthetic, so the heap-fetch and `ts_rank` path was not exercised |
| 5 | Hoist `serializeSave` in farming `persistFarm` | farming save | n/a | n/a | n/a | Returns a shallow object over `farm.tiles`; the JSON cost is inside Prisma either way |
| 5 | Cache handshake session lookups | all hubs | storm p50 | 413 ms (cold) | 213 ms (cached) | Already done: bounded 60 s positive caches in socket-server, rmhtube and rmhbox auth |
| 5 | Batch casino bet and settle writes | blackjack, holdem, baccarat, roulette | n/a | n/a | n/a | Money path: debits are guarded atomic UPDATEs and must not be deferred (`03-rules.md` 1.3); settlement is already one transaction per round |
| 5 | Single emit for casino, tube, music and rmhbox room broadcasts | those hubs | n/a | n/a | n/a | Already `io.to(room).emit` (one encode); only farming used per-socket loops |
| 6 | `loadSystemFonts:false` alone on the synchronous resvg path | OG | resvg ms | 219 | 193 | About 12% of CPU but still a 193 ms block; kept only as part of the async change (now main's `svgToPng`) |
| 6 | Move sharp off the event loop | image routes | loop stall | <= 4.8 ms | n/a | Sharp is already off-thread; the real problem was threadpool starvation, fixed by the CPU gate |
| 7 | Cache `pkg/auth.ValidateSession` | none | queries per call | 1 | n/a | No binary in the fleet calls it; a cache would be dead code and a new session-staleness surface |
| 7 | Share the minute-poll settings read between bot-worker ticks | bot-worker | statements per minute | ~1.4 | ~1.0 | 0.4 statements a minute of a primary-key read; not worth a second staleness rule |
| 7 | Pre-render the status page on a timer | `status` | n/a | n/a | n/a | The page depends on the wall clock; on-demand with a 2 s TTL and probe-cycle invalidation costs the same with no timer |
| 8 | Post search (posts part of `/api/search`) | `/api/search?q=build` | p50 | ~116 ms | n/a | Both indexes are used; cost is heap-fetching, rechecking and ranking 20k matching rows (10% of the table). Needs a smaller candidate pool, i.e. different results |
| 8 | Lateral fold-once on every people query | `/api/users/search` | plan | n/a | n/a | The planner inlines it on the rare-query plan; it only wins on the common-query plan, where it is already used |
| 8 | Changes to `hashtag-search` and `mention-search` | hashtag search, `/api/feed/mention-search` | plan | 0.1 ms | n/a | Already index scans (main) |
| 9 | `conversation(lastMessageAt DESC)` index | bot-worker `recentBotConversationsQuery` | warm time, buffers | 1.07 ms, 1,055 | 1.07 ms, 1,055 | The planner keeps a bitmap scan; cost is the per-row `user` and `direct_message` lookups. Revisit if `conversation` grows by orders of magnitude |

### 5.2 Rejected on correctness (no timing taken)

| WS | Idea | Route(s) | Why not |
|---|---|---|---|
| 3 | `derivedContent` public cache on `ai/takeaways` | `/api/ai/takeaways` | The handler returns 200 `{takeaways: []}` when the AI call fails and its own memo never stores that; an HTTP cache cannot tell the two apart and would pin a transient failure for 5 min (browser) to 1 h (shared) |
| 2 | Public or long cache on comment translations (existing) | `/api/comments/:id/translate` | Served removed comments for up to 24 h; removed (section 3.1, row 9) |

### 5.3 Superseded by main (do not redo; main's version is what runs)

| WS | Idea | Replaced by | Note |
|---|---|---|---|
| 1 | Session dedupe via `getRequestSession` in 28 `_site` route files (`37d96ba8f`) | main `ee1932f80` | Identical swap in the same files; the test stays |
| 1 | Seed the appearance preference in the root loader | main `219655bd6` | |
| 2 | Per-connection SSE `JSON.stringify` | main `858221ef6` (`lib/feed-sse-serialize.ts`) | Latency not re-measured here |
| 2 | Capped mention-search follow loads, counters, notification mute cache | main `757b1d6df` | WS2 row 13 removed the remaining full-edge load |
| 3 | `apiCache` FIFO to LRU with `API_CACHE_MAX_ENTRIES` | main `7cff5e5a6`, `ff05b6a36` (true LRU, byte budget from the heap) | The Redis invalidation bridge was kept on top |
| 6 | Async resvg render and shared card cache (`653ceb9d5`) | main `88de16e44` (`dedupeOgRender`, `svgToPng`); `cf817ad07` removed `rasterizeSvg` and `createCardCache` | `loadSystemFonts:false` (`589cfdcc3`) and the story-card key (`dff14c642`) survived |
| 5 | `/__perf` hub probe in the request handlers | main's `/internal/metrics` collector | `perf-probe.ts` was deleted; `socket-bench.mjs` reads `/internal/metrics` |

## 6. Follow-ups and handoffs not done

Deferred leads and unrouted handoffs, each with what would unblock it. Items 1-14 were named by the integrator at
integration; the rest are open rows from the ledgers. Infrastructure proposals are marked `ops` (out of scope, `index.md` section 3).

### 6.1 Named at integration

| # | Source | Item | file | Why not done | Unblock |
|---|---|---|---|---|---|
| 1 | WS1 B1 | **Rebuild and deploy the image so the zod bump reaches production** (section 3.3, row 14). Nothing else in this table is as urgent | `package.json`, `pnpm-lock.yaml` | Needs a deploy | Deploy, then step 1 of section 7 |
| 2 | WS7 | The status page's 2 s response cache: the user chose to leave it as built (`STATUS_RESPONSE_CACHE_TTL`, default `2s`, `0s` disables) | `go-services/internal/status` | Decision recorded; nothing to do | Set the env to `0s` to disable |
| 3 | WS7 | Doctrine timezone list is cached for 10 min. No code writes `doctrineTimezone` today, so there is no invalidation hook. Any future timezone setting must add one in the same change | `go-services/internal/doctrine` (`767990f41`) | Nothing writes the field | The feature that sets it |
| 4 | WS1 | `/achievements` signed renders every catalog card into SSR HTML: 316,549 B document, about 280 KB of markup, against a 90 KB budget (`after.json` re-measures it) | `components/feed/AchievementsColumn`, `JourneyColumn` | A component change, not a loader fix; WS1 did not own it | Collapse by category or render beyond the first tab client-side |
| 5 | WS2 | The anonymous first page `timeline:anon:v2` (30 s plus 120 s stale-while-revalidate) is not reconciled: a removed public post can be served from origin for up to about 150 s (the edge cache likely dominates) | `lib/feed/timeline.ts` | Row 12 concerned the signed-in path only | A decision on whether 150 s of anonymous staleness is acceptable |
| 6 | WS5 | Done after review: `socket-bench.mjs` reads main's `/internal/metrics` (CPU and wall time as deltas between two snapshots; event-loop delay is the collector's current window, reported as p50/p90/p99/max) and `server/shared/perf-probe.ts` was deleted. No hub re-measurement was done on the merged tree | `scripts/perf/socket-bench.mjs` | — | Re-run the hub mixes if hub numbers are needed |
| 7 | WS7 | Bazel `BUILD.bazel` files were hand-edited (module fetch was blocked in the sandbox, 403 on `bcr.bazel.build` and on the bats-core tarball) | `go-services/**/BUILD.bazel` | `make gazelle` and `make test` never ran | Run `make gazelle && make test` where Bazel can fetch, commit the diff |
| 8 | WS4 | The invite and join-request UI is not checked in a browser: three themes, two widths, keyboard | `components/**` (CommunitiesColumn, mod tools), `/c/$slug`, `/c/$slug/invite/$code` | No browser session in the agent environment | A manual pass per `docs/page-consistency.md` |
| 9 | WS4 | Non-English strings for the invites feature (English strings were added and extracted) | `locales/*/` | Translations come from the `i18n-translate` workflow | Run it |
| 10 | WS6, WS8 | Sitemap keyset path (WS6 Deferred 1 and WS4 handoff; WS4 measured offset-skip as not the cost, so the case is cold-build time, ~800 ms for chunk 1 and ~1.9 s for chunk 4) and the RSS tag-feed read (`hashtags.some.hashtag.tag`: all 3,993 `post_hashtag` rows for `tag1`, 22 ms median, 16,016 buffers), which should use WS8's keyset path | `lib/sitemap.server.ts`, `lib/feed/rss.server.ts:77` | WS6 pinned the Prisma `where` shapes in tests; the RSS handoff to WS8 was not picked up (WS8 shipped `listTagFeed` only) | EXPLAIN-backed partial index proposal and updated pin tests; route `tagFeedItems` through the new index |
| 11 | WS6 | `lib/og/__tests__/render.test.ts` can time out on a cold resvg load when the box is heavily loaded | `lib/og/__tests__/render.test.ts` | Flaky only under load | Raise that test's timeout or warm resvg in a `beforeAll` |
| 12 | WS6 | Sitemap staleness: the 10 min L1 means a community made private (or a post deleted) stays listed for up to 10 minutes more, on top of the 1 h `max-age` the route already sent. Private communities and community posts stay excluded by the pinned `isPrivate: false` / `communityId: null` predicates | `lib/sitemap.server.ts` | Accepted trade (`1a956ba04`) | Drop the chunk key from L1 when a community is made private, if 10 min matters |
| 13 | WS5 | RMHTube chat batching loses up to 1 s of chat on a hard crash (graceful shutdown flushes) | `server/rmhtube` (`66fb87580`) | Accepted trade | Reduce the interval, or accept |
| 14 | integration | Nine commits carry a `Co-Authored-By` trailer that does not match the program's (`1562fe194`, `99980abec`, `c08dd25c9`, `f7cb0c610`, `b03dbd472`, `6b1c8ed42`, `1a956ba04`, `e496f36ce`, `fa67809e1`). The user chose to leave history as is | git history | Rewriting merged history | n/a |

### 6.2 Open rows from the ledgers

| # | Source | Item | file | Why not done | Unblock |
|---|---|---|---|---|---|
| 15 | WS1 D3 | Non-English documents carry the core i18n catalogs inline: `/communities` 49 KB (en) vs 191 KB (de), 199 KB (ja), 221 KB (ar) | `lib/i18n/**` | Per-route namespace subsetting risks hydration mismatches | CPU measurement of seroval on the 140 KB; a route-aware namespace map with a hydration test |
| 16 | WS1 D4 | Anonymous edge-cache allowlist additions | `deploy/apply-cloudflare-cache-rules.sh:120`, `anon-html-cache.test.ts` | The origin allowlist is inert until the Cloudflare rule matches, and the sync test fails if they disagree | Operator decision, then a per-route audit under `03-rules.md` section 2 |
| 17 | WS1 D5, B | `warmup.ts` still primes the sidebar for `/` that the `/` loader no longer calls. The production image is built `node-cluster`, which was **not built or measured**: each worker runs `warmup.ts` and the deploy's single health curl warms only one | `server/nitro/warmup.ts`, `docker-bake.hcl` | No cluster build was measured | Restart-and-time the first request on each worker |
| 18 | WS1 D2 | `/news` reads every article and filters client-side | `app/routes/_site/news` | A `take` changes behaviour | Server-side search and paging (product decision) |
| 19 | WS3 | `s-maxage` on `/api` is inert: no Apache or Cloudflare cache rule exists for `/api`, and Cloudflare does not cache JSON by default. The origin micro-cache is the only effective layer today (`ops`) | `deploy/` | Operator change | Add a Cloudflare rule for the declared-public routes |
| 20 | WS3 D4 | 58 raw GET handlers are not on `defineHandler` (e.g. gift-sub, spaces, `communities/$slug/announcements`) | `app/routes/api/**` | Adoption is a handler-body change | Adopt the wrapper; `gift-sub` would then take a public policy |
| 21 | WS3 | `apiCache` consumers (54, none on `cached()`), with the invalidation bridge now making them coherent across processes | `lib/communities/*.server.ts`, `lib/safety/link-risk.server.ts`, `lib/doctrine/tiers.ts`, ... | Optional migration | Only if an L2 or single-flight is wanted |
| 22 | WS4 D1 | Doc corpora in search (`blog`, `news`, `build`) put unindexable expressions in the predicate (`array_to_string(tags)`, `left(content,4000)`) so the planner must seq-scan | `lib/search/**` | The seed has no blog, news or build rows | Seed those tables, `EXPLAIN` `searchDocs` |
| 23 | WS4 D2 | `/library` shelf reads every visible upload | `lib/library/library.server.ts` | Needs UI paging | Product decision |
| 24 | WS4 D3, WS6 | Request-path `optimizeImage` callers that bypass the CPU gate: `api/albums/asset/$.ts` (width up to 4096, no cache), `api/admin/curated-builds/image/$filename.ts`, upload ingest | `lib/media/ingest.server.ts` | The albums route allows widths above the ladder maximum; gating uploads changes failure to 503 | Decide the ladder maximum and the upload 503 semantics |
| 25 | WS4 D4 | Custom-feed keyword feeds do `content ILIKE` over a 7-day window; four reads run in sequence | `lib/discovery/feeds.server.ts` | No custom-feed rows in the seed | Seed and `EXPLAIN` |
| 26 | WS5 D1-D4 | rmhbox heartbeat builds shared lobby state per recipient; no Prisma warm in rmhbox; the `jobs`, `ladder-worker` and `homes-worker` DB pools were not profiled; spaces chat could reuse `createBatchWriter` | `server/rmhbox`, `server/jobs`, `server/ladder-worker`, `server/homes-worker` | Hubs are inside budget at the scripted load (rmhbox ELD p99 3.1 ms) | A load where rmhbox ELD p99 exceeds 10 ms (about 50 full lobbies); a `pg_stat_activity` run per worker |
| 27 | WS6 D4, D5 | OG fonts are fetched from `fonts.gstatic.com` at every boot (144-158 ms, 30 s cooldown with 500s on failure), and the PNG cache is per process so a restart or blue/green swap re-renders; sharp concurrency on musl is unmeasured (`ops`) | `lib/og/**` | Variable `@fontsource` Inter is woff2, which satori cannot read | Vendor two TTFs; measure on the VPS |
| 28 | WS7 D1 | The status prober renders three public SSR pages (`/`, `/sitemap.xml`, `/blog/rss.xml`) every 15 s: about 17k renders a day on the web tier | `go-services/cmd/status/main.go` | Changes what the dashboard shows | Product decision; a per-target interval env |
| 29 | WS7 D2 | `saveHistoryLocked` writes about 100 KB of JSON every 15 s (0.58 ms, about 590 MB a day) | `go-services/internal/status` | Changes crash-recovery granularity | Decision on the acceptable loss window |
| 30 | WS7 D3 and `99980abec` | The Go pool is now `GO_DB_POOL_SIZE`, default 3 (six workers previously shared one connection). The commit message says a load harness measured it, but no before/after is in any results file. It raises live-DB connections; check headroom against `max_connections` | `go-services/pkg/db/db.go`, `scripts/db-connection-budget.mjs` | Not measured in this program | Capacity check at deploy (section 7) |
| 31 | WS7 D4 | Doctrine decay runs every hour of every Monday (24 passes), decaying 5% again each time for players who stay inactive | `go-services/internal/doctrine` | Faithful to the Node worker; fixing it changes game balance | Product decision |
| 32 | WS7 D5 | discord-bot watch flush (about 12 selects and upserts per tracked user per minute) and pet care tick | `go-services/internal/discordbot` | Needs a live Discord session | A staging run with a token |
| 33 | WS7 | `pg_stat_statements` is not preloaded on the shared Postgres, so Go statement counts come from counting tests and `pg_stat_*` counters | the Postgres instance (`ops`) | Needs a restart | Enable it in staging |
| 34 | WS0 | `loader` and `render` `Server-Timing` phases are not wired; `x-rmh-queries` is written at headers, so queries for content that streams afterwards (home's first feed page) are not counted | `lib/otel/timing.ts`, `server/nitro/otel.ts` | No choke point | An `app/server.ts` wrapping `defaultStreamHandler`; a trailer or log line at stream end |
| 35 | WS0 | The dataset does not fill news, library, blog, market or event tables, and only 12 payload-less `/_serverFn/*` ids are in the route list; those numbers are floors | `scripts/perf/seed-perf-db.ts`, `server-routes.json` | Time | Extend the seed; capture real `?payload=` URLs |
| 36 | WS0 | The Nitro bundle and the app bundle each contain `prisma.server`, and the `globalThis` singleton guard is skipped in production, so two `PrismaClient` pools may exist | `.output/server/_chunks/prisma.server.mjs` | Low priority and unverified | `grep -l "new PrismaClient" .output/server -r` on a build |
| 37 | WS8 | Common-query people search is still 260-320 ms (11k of 20k synthetic users match "user1"); trigram `%` and `<%` per row is the floor without changing recall | `lib/search/**` | Would change results | None planned |
| 38 | WS9 | The two partial indexes are not in `schema.prisma`; a `prisma migrate dev` will offer to drop them | `prisma/migrations/20261022150000_*`, `20261022150100_*` | Prisma cannot express partial indexes; migration comments warn | Never accept the drop |
| 39 | this report, section 1 | An unexplained fixed per-request cost of about 0.15 ms: `/api/health` 0.6 to 0.8 ms and 1,820 to 1,437 rps, the whole `api` class down 6-14% in rps. The candidate is main's per-process performance collector (`7879e21d5`), which has no off switch | `server/nitro/perf.ts`, `lib/perf/process-metrics.ts` | Not isolated: it needs an A/B build with the collector disabled | Add an env switch to the collector, build twice, compare `/api/health` |
| 40 | this report, section 4.1 | The post visibility predicate expands a viewer's follows into an `IN` list: 2,000 bound parameters for the heavy user cost about +8 ms on `/thread/:id`, profile posts and likes, and bookmarks | `lib/feed/audience.server.ts` (`viewerVisiblePostWhere`) | The fix would touch every privacy test; this pass records regressions and does not fix them | Replace the FOLLOWERS branch with a correlated `EXISTS` on `follow (followerId, followingId)`; re-run `lib/feed/__tests__/` and the four routes with `--only thread,api-profile-posts,api-profile-likes,api-bookmarks` |
| 41 | this report, section 1 | Sitemaps, OG cards, `/api/oembed`, the status page and the hubs are not in `server-routes.json`, so their wins are in-process or Go-bench figures and were not re-measured on the merged tree | `scripts/perf/server-routes.json` | The route list is WS0's and was fixed before those workstreams finished | Add `/sitemaps/posts-1.xml`, `/api/og/*` and `/api/oembed` to the list, and run `socket-bench.mjs` against `/internal/metrics` |

## 7. Production verification plan

Per [`performance-slo.md`](../performance-slo.md): the origin numbers in section 1 do not include the network or the
browser, so they are not the production authority. RUM and the synthetic workflow are, and the rollback policy there
applies unchanged: roll back when, for two consecutive comparable windows with at least 100 samples per affected group,
p75 exceeds the route-class budget or p95 exceeds 125% of it, or a synthetic breach of 25% or more on the new version
repeats on a confirmation run (`./deploy.sh production <previous-sha>`, then re-run the synthetic workflow and
recompute the RUM window). The program has no production baseline of its own: capture the pre-deploy RUM and synthetic
windows (`rum-slo-report.mjs --by-device --min-samples=100`) before the swap, because the origin baseline cannot stand in for them.

**First, before any timing: the auth fix.** Within minutes of the swap, from outside the VPS and from the host:

```bash
curl -si -H 'x-forwarded-for: 203.0.113.7' https://rmhstudios.com/api/auth/get-session   # expect 200
```

It returned 500 (`TypeError: (void 0) is not a function at isIPv4`) on this branch's production build with the old
zod (WS1 B1), and 200 afterwards; this report's own run confirms 200 on the merged build. Then confirm a real sign-in, a
sign-out and an OAuth callback complete, and that the web container logs contain no `isIPv4`. If production is
currently failing sign-in, error rates on `/api/auth/*` should fall to zero at this step.

| # | Signal | Window | Baseline | Alert or rollback threshold |
|---|---|---|---|---|
| 1 | `GET /api/auth/get-session` with `x-forwarded-for`; `/api/auth/*` error rate; `isIPv4` in logs | first 15 min after swap | 500 on the old image (WS1 B1) | Any non-200 on the curl, or any `isIPv4` log line: roll back and investigate the image |
| 2 | RUM TTFB p75 / p95 per route class from `[rum:metric]` | two 24 h windows, at least 100 samples per group | the pre-deploy window | p75 over `lib/rum-slo-bands.json` (core 800 ms, content 1,000, interactive 1,200, realtime 1,500) or p95 over 125% of it, twice in a row |
| 3 | Synthetic Lighthouse TTFB, three runs per route (`synthetic-perf.yml`, every 6 h) | next two scheduled runs | the last run before the swap | A breach of 25% or more on the new version, repeated on a confirmation run |
| 4 | `/tag/*` and people-search latency (`Server-Timing: total` on `/tag/<tag>`, `/api/users/search`, `/api/search`) | 24 h | origin baseline: `/tag/tag1` signed 645 / 714 ms, `/api/users/search` 422 / 460 ms, `/api/search` 637 / 687 ms (`baseline.json`), on the seeded dataset only | No quantitative production baseline exists. Compare against the pre-deploy window; investigate if either route is slower than before |
| 5 | Postgres: connections in use against `max_connections`; slow-statement log for the `post_hashtag` and `rmh_search_norm` shapes | first hour, then daily | not measured | The Go supervisor now opens up to `GO_DB_POOL_SIZE` (default 3) instead of 1 connection; if headroom is short, set it to 1 and redeploy |
| 6 | Migration application: nine migrations since main. `20261022030000` creates the invite and join-request tables; `20261022150000`, `20261022150100` and `20261022160100` are `CREATE INDEX CONCURRENTLY`, each followed by an `…_ensure_valid` migration that rebuilds the index (non-concurrently) only if it is invalid or missing; `20261022160200` is `DROP INDEX CONCURRENTLY` of the index the new one supersedes, and runs only after that check; `20261022160000` is an `UPDATE` of mismatched `post_hashtag` rows | during `deploy.sh` | n/a | `deploy.sh` output and the `prisma-migrate-status` workflow. A concurrent build that hits the 5 s `lock_timeout` leaves an invalid index; deploy.sh's P3009 retry then records the `IF NOT EXISTS` create as applied, and the `…_ensure_valid` migration repairs it |
| 7 | Web container restarts, 429 rate on writes, CPU of the web and hub processes | 24 h | not measured in production | Restarts or sustained CPU rise versus the pre-deploy window |
| 8 | Hub event-loop delay and broadcast latency on `/internal/metrics` (the merged tree) | a busy evening | scripted-load baseline: event-loop p99 0.9-3.8 ms, broadcast p95 0.9-2.4 ms (`ws-5.md`) | `02-budgets.md` hub budget: event-loop p99 over 20 ms, broadcast p95 over 50 ms |
| 9 | Moderation and privacy spot checks: a blocked user's post disappears from a cached signed-in feed within one request; a private community's posts 404 for a non-member; a locked community page shows metadata only | right after the swap | before: up to 60 s of stale permissions (WS2 #4) | Any exposure is a rollback and an incident |

### New caches and how to purge them

If any of these misbehaves in production, this is what to purge. Every one is bounded and has a stated staleness; none is a CDN rule.

| Cache | Where | Staleness or TTL | Invalidation | Purge or disable |
|---|---|---|---|---|
| Response micro-cache for public-declared GETs (`/api/tournaments`, `/api/forecasting/seasons`, `/api/dream-rift/coop` serve from it; the other declared routes have no query) | `lib/api/handler.server.ts`, per worker, 500 entries / 16 MB | `min(sMaxAge, 30 s)`, 200s only, <= 64 KB, no `Set-Cookie` | TTL only | `API_RESPONSE_CACHE_ENTRIES=0`, or restart the worker |
| `apiCache` invalidation bridge | `lib/cache.ts` plus `lib/cached.server.ts`, Redis channel `cache:invalidate` | n/a (propagates an existing invalidation to every process, once, with an origin id to stop loops) | the ~25 `apiCache.invalidate*` call sites | Unset `REDIS_URL` for local-only behaviour; restart |
| Signed-in feed first page, reconciled at serve time | `feed:v3:` keys in `viewerFeedCache` (`VIEWER_FEED_PREFIX`) | the page may be up to 60 s old, but blocks, mutes, deletes, audience, unfollow and circle changes are applied on every serve | reconcile at read; circle edits drop affected members' pages | Delete `feed:v3:*` in Redis |
| Sitemap chunks | per-process L1 in `lib/sitemap.server.ts`, strong ETag, `If-None-Match` to 304 | 10 min, plus the 1 h `max-age` already sent; a community made private stays listed up to 10 min longer | none | Restart the process |
| `/api/oembed?type=og` per-URL cache | `cachedNullable`, single-flight | 24 h; upstream failures are not cached | none | Delete the keys, or restart |
| Status page response cache | Go `status`, 64-key cap, single-flight, post-gzip | 2 s, valid within one probe cycle and one store version; admin and `/health` never cached | probe cycle and store write | `STATUS_RESPONSE_CACHE_TTL=0s` |
| Doctrine distinct-timezone list | Go `doctrine` | 10 min | none; no code writes `doctrineTimezone` | Restart the supervisor |
| Comment-translate memo | `lib/feed`, keyed by text hash, bounded | none shared; deleted, edited and post visibility checked on every request | n/a | Restart |
| DM unread badge `dm:unread:<uid>` | Redis | previously 60 s; now dropped by `read` and `read-all` | those two routes | Delete the key |
| RMHTube chat write buffer | `server/rmhtube` batch writer | up to 1 s of unflushed chat in memory; lost on a hard crash | flushed on graceful shutdown | n/a |
| Image variants | `/api/feed/image/*`, `/api/image-proxy`, `/api/library/cover/$id` | the key space is bounded to 27 width rungs; encodes are single-flight and CPU-gated (a full queue answers 503 with `Retry-After`) | n/a | Watch for 503s from the gate; raise `RMH_CPU_GATE_LIMIT` if they appear |

## 8. Rule objections

Collected from the workstream ledgers (WS1 to WS9 recorded none), with the integrator's ruling where one was given.

| From | Objection | Ruling |
|---|---|---|
| `ws-0.md` 1 | `02-budgets.md` section 2, "load p95 <= 2x sequential p95 at c=16", fails every one of the 233 load rows, trivial routes included: sixteen requests on one Node process queue by definition. Proposed a throughput floor instead | **Accepted by the coordinator.** Replaced by a per-class throughput floor, set from the post-merge runs; `02-budgets.md` section 2.1 has the numbers and the reasoning. No other number was changed |
| `ws-0.md` 2 | `01-method.md` section 1.2 ranks the 40 most-called API GETs by static call count; that is crude (shared fetch paths, no frequency). The list was built from client-reference counts plus the shell's polling endpoints | **No ruling given.** Not part of the accepted objection, so `01-method.md` is unchanged and the route list stands. Real frequency needs RUM or the access log |

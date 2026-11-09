# WS0 — Instrumentation, harness, dataset, baseline — results

Worktree baseline taken 2026-10-21 19:20–19:38 UTC, commit `8e107956` plus the bench-IP change committed
with this file (see Commands). Environment deviations: see "Environment notes" — all benign, all
documented. Dataset: full scale, seed 126 s.

## Shipped

| # | Change | Route(s) | Metric | Before | After | Commit | Correctness test |
|---|---|---|---|---:|---:|---|---|
| 1 | `Server-Timing` phases `sess` / `cache` / `db` wired (defineHandler + `getRequestSession`, `cached*()`, Prisma `$allOperations`) | all | phases in header | `total` only | `sess`,`cache`,`db`,`total` | `2444a0fa` | `lib/__tests__/otel-server-timing.test.ts` |
| 2 | `x-rmh-queries` header, `RMH_PERF_HEADERS=1` only | all | query count visible to harness | none | integer, absent by default | `2444a0fa` | `lib/__tests__/perf-headers.test.ts` (absent by default / for any value but `1`) |
| 3 | **Bug fix:** trace scope and query-budget `AsyncLocalStorage` pinned on `globalThis` | all, production build only | phases + query count | `x-rmh-queries: 0` on every route, `total`-only Server-Timing | real values (`/` cold: sess 164, cache 399, db 968 ms, 18 queries) | `2c8178d7` | two-module-copy tests in `otel-server-timing.test.ts` |
| 4 | `seed-perf-db.ts`, dataset manifest with signed cookies, `rmh_perf_template` | — | seed time | — | 126 s (+22 s migrate, 2 s `createdb -T`) | `8e107956` | cookie verified against Better Auth (below) |
| 5 | `server-bench.mjs` (+`--compare`, `--summary`, `--only`, `--auth`), `server-routes.json` (137 entries), `cold-start.mjs` | — | — | — | 239 baseline rows, 0 invalid | `8e107956` + this commit | — |

`loader` / `render` are **not wired, on purpose**: there is no single choke point. Loaders are declared in 76
route files and invoked inside the router; there is no `app/server.ts`, so nothing wraps
`defaultStreamHandler`; and the `response` hook fires at headers, before streamed content finishes. `sess` +
`cache` + `db` attribute most of a loader's time. `lib/otel/timing.ts` says so.

**Why #3 mattered.** The first production build showed `total`-only timing and 0 queries everywhere. Cause:
Nitro bundles `server/nitro/otel.ts` into `.output/server/index.mjs` while the app lives in the separate
`_ssr` bundle, so each had its own `new AsyncLocalStorage()`. Dev and tests load one copy, so nothing caught
it. `lib/prisma.server.ts` was touched beyond "the `$allOperations` hook only" (the `budgetStorage`
declaration) because the budget store has the same defect — mechanical, explained in the commit.

**Signed cookie.** `value = encodeURIComponent(token + '.' + base64(HMAC-SHA256(BETTER_AUTH_SECRET, token)))`,
name `better-auth.session_token` (`__Secure-` prefix only when `BETTER_AUTH_URL` is https). Verified two ways:
`auth.api.getSession` in a standalone Better Auth instance returns the right user for both cookies and `null`
for a tampered one, and `GET /api/auth/get-session` on the production build returns the user. The
`session_data` cookie-cache cookie is not minted (5 min TTL); the bench collects a fresh one from
`/api/auth/get-session` every 4 minutes, like a browser.

## Baseline headline (full tables: `baseline.json`, regenerate with `--summary`)

Warm, production build, one process, Redis on, seeded dataset, heavy user for "signed". 239 rows, 0 invalid.

**Top 15 by signed p95 TTFB**

| route | class | p50 ms | p95 ms | queries | KB |
| --- | --- | ---: | ---: | ---: | ---: |
| `/tag/tag1` | content | 645.1 | 714.0 | 5 | 200 |
| `/api/search?q=build` | api | 636.9 | 687.3 | 7 | 12.9 |
| `/api/users/search?q=user1` | api | 422.5 | 459.9 | 2 | 0.7 |
| `/explore` | content | 39.0 | 47.3 | 5 | 207 |
| `/_serverFn/94e29d35…` (fetchExplore) | api | 19.6 | 34.6 | 4 | 29.5 |
| `/explore?q=build` | interactive | 24.6 | 34.5 | 5 | 77 |
| `/c/perf-community-1` | content | 25.5 | 32.8 | 10 | 199 |
| `/api/rmharks` (POST create) | api | 9.8 | 31.6 | 4 | 0.4 |
| `/api/communities/…/members` | api | 19.3 | 26.2 | 3 | 62 |
| `/api/rmharks?cursor=…` | api | 14.0 | 23.4 | 5 | 10.9 |
| `/messages` | content | 14.1 | 22.5 | 4 | 89 |
| `/achievements` | content | 13.7 | 19.4 | 3 | 310 |
| `/api/explore` | api | 16.6 | 18.4 | 4 | 12.5 |
| `/api/rmharks/…/quotes` | api | 14.0 | 17.5 | 4 | 0 |
| `/api/profile/user10/follow` (POST) | api | 6.9 | 15.6 | 8 | 0 |

Everything not in this table is under 20 ms p95. **Anonymous top:** `/api/users/search` 424/454, `/tag/tag1`
72/80, `/explore` 24/33, `/c/…` 20/28, `/api/communities/…/members` 18/27, home `/` 12.5/17.3.

**Top by query count (signed):** `/rmhladder` 18, `/c/perf-community-1` 10, `/u/cu00000002` 8, `follow` POST 8,
`/u/heavyuser` 7, `/u/user3` 7, `/library` 7, `/api/profile/user3/rmharks` 7, `/api/search` 7, comment POST 7.

**Over the query budget (6):** `/rmhladder` 18 (15), `/api/profile/user3/rmharks` 7 (5), `/api/search?q=` 7 (5),
`/api/communities/…/feed` 6 (5), `/_serverFn/72a8e700…` (fetchBoard) 6 (5, anon and signed).

**Over the TTFB budget (6):** `/tag/tag1` signed 645/714 (budget 100/200) and anon 72/80 (60/120);
`/api/search` signed 637/687 (25/60); `/api/users/search` 422/460 signed and 424/454 anon; `/api/communities/…/members` anon p95 26.7 (p50 18 vs 15).

**Over the response-size budget** (pages ≤ 60 KB anon / 90 KB signed): home 112/117 KB, `/achievements` 310 KB,
`/explore` 207 KB, `/c/…` 199 KB, `/tag/…` 200 KB, `/communities` 145 KB, `/roadmap` 145 KB, `/store` 117 KB.
Almost every page is 50–70 KB anonymous, so the floor is the shell. `/api/communities/…/members` is 62 KB
(budget 50 KB). Origin serves **uncompressed** (`encodedBytes == bytes`); Apache/Cloudflare compress in production.

**Throughput (c=16, one Node process).** Median page ≈ 183 rps, median API GET ≈ 769 rps; home 113 rps anon /
107 rps signed, load p95 240 / 184 ms. Slowest: `/api/search` 4.9 rps, `/tag/tag1` 5.5 rps signed, `/api/users/search` 9 rps.
No request errors.

**Uncached anonymous-invariant GETs** (anon and signed bodies identical and stable across samples, no
`public`/`s-maxage`; *candidates only* — read the handler per `03-rules.md` §2): `/api/rmharks?limit=20`
(+ cursor page), `/api/rmharks/{id}`, `/{id}/comment`, `/{id}/similar`, `/{id}/quotes`,
`/api/profile/{h}/rmharks`, `/api/feed/mention-search`, `/api/users/search`, `/api/communities/{slug}/feed`,
`/api/leaderboards/players`, `/api/market/listings`, `/api/events`, `/api/tournaments`, `/api/predictions`,
`/api/user-builds`, plus `private, no-store` ones (`/api/experiments`, `/api/qotd/today`). The bodies match
only because the heavy user's personalised bits are empty in this dataset for them; `/api/rmharks` reads the
session itself (`auth: 'none'`), so it is **not** safe to make public on this evidence.

**Cold start** (`results/cold-start.json`, 3 runs per mode, server killed between): boot to `/api/health`
1.36 s (anon runs) / 1.38 s; first `GET /` TTFB **160 ms anon, 263 ms signed** (total 253 / 303 ms) — inside
the 1.5 s budget, even boot + first request ≈ 1.6 s.

**Phase breakdown, the five slowest signed pages (median ms)**

| route | ttfb p50 | total | sess | cache | db | loader | render |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/tag/tag1` | 645.1 | 644.3 | 1.2 | 0 | **617.2** | - | - |
| `/explore` | 39.0 | 36.6 | 1.0 | 0.1 | 17.3 | - | - |
| `/explore?q=build` | 24.6 | 24.0 | 0.9 | 0.1 | 16.4 | - | - |
| `/c/perf-community-1` | 25.5 | 24.5 | 0.9 | 0 | 7.8 | - | - |
| `/messages` | 14.1 | 13.4 | 1.0 | 0 | 3.9 | - | - |

`db` is cumulative query time (it can exceed `total` under `Promise.all`). On `/c/…`, `/explore`, `/messages`
roughly half of `total` is neither `sess` nor `db`: that is render + loader glue, i.e. the SSR cost WS1 owns.

**Slow statements (>20 ms)**, `results/baseline-querylog.txt`: 1,285 executions, 9 shapes. 233 executions of
the user-search `rmh_search_norm(...) LIKE / % / <%` query (total 291 s, max 3.1 s); 249 executions of a
`rmheet LEFT JOIN LATERAL user/profile` timeline-shaped read (112 s, max 2.7 s); 727 `community_member`
list reads (25 s); 67 post-search statements (20 s, max 950 ms). No `[db:query-budget]` breach (nothing
exceeded 40 queries). The dev-only unbounded-`findMany` guard does not run in production by design, so
there are no unbounded-read lines; WS4 should grep for them statically or run the harness on `vite dev`.

## Rejected (measured, no win)

| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---:|---:|---|
| 1 | Wrap `nitroApp.fetch` in `AsyncLocalStorage.run` so the request hook's scope reaches handlers | all | x-rmh-queries | 0 | 0 | The cause was two bundled module copies (fix #3), not `enterWith` not propagating; the wrap was reverted before commit. |

## Deferred

| # | Lead | Why | What would unblock it |
|---|---|---|---|
| 1 | `loader` / `render` phases | no choke point (above) | a `app/server.ts` entry wrapping `defaultStreamHandler`, if WS1 adds one |
| 2 | Per-query count for streamed content | `x-rmh-queries` is written when headers are ready, so queries from work that streams after the shell (home's first feed page) are missed; home shows 0 anon / 1 signed | a trailer or a log line at stream end; use `[db:query-budget]` logs or `vite dev` for the full count |
| 3 | News/library/blog/market/events content tables | not seeded: those routes read tables the dataset does not fill (several redirect or render empty), so their numbers are floors | extend `seed-perf-db.ts` and re-cut the template |
| 4 | Server functions with arguments | only the 12 payload-less `/_serverFn/*` ids are in the list; ids are build-stable | capture real `?payload=` URLs from a browser session |

## Handoffs

| To | file:line | What | Evidence |
|---|---|---|---|
| WS2 / WS4 | tag feed (`app/routes/_site/tag.$tag.tsx`, `lib/tags*.ts`) | `/tag/tag1` signed is 645 ms (db 617 ms) vs 72 ms anon; 9 rps under load. Same page, personalised query is ~9× slower; likely a viewer filter (blocks/mutes/follows) defeating the `post_hashtag` index | `baseline.json` rows `tag|signed`/`tag|anon`; `EXPLAIN (ANALYZE, BUFFERS)` on `rmh_ws0` |
| WS4 | `lib/search/**` (user + post search) | `/api/users/search` 424 ms, `/api/search` 637 ms: `rmh_search_norm(col) LIKE/%/<%` over `user` and `rmheet.content` is a sequential scan at 20k users / 200k posts (233 + 67 slow statements, max 3.1 s) | `baseline-querylog.txt` |
| WS2 | `lib/feed/**` | 249 slow executions (avg 450 ms, max 2.7 s) of the `rmheet … LEFT JOIN LATERAL` hydration query under the concurrent pass | `baseline-querylog.txt`; attribute with `EXPLAIN` |
| WS3 / WS4 | `app/routes/api/communities/$slug/members.ts` | 62 KB response (> 50 KB budget) and 727 slow `community_member` reads: unbounded page | `baseline.json` `api-community-members` |
| coordinator / WS3 | `lib/auth.ts`, bundle config | **Possible production defect.** In the production build Better Auth's `isIPv4` is `undefined` (`node:net` stubbed by the bundler), so any `/api/auth/*` request carrying `x-forwarded-for` returns 500 (`TypeError: (void 0) is not a function at isIPv4`). Apache normally adds that header; verify on the VPS before assuming it is benign. Without the header Better Auth logs "could not determine a client IP" and uses one shared bucket per path | server log lines 10–60; reproduce: `curl -H 'x-forwarded-for: 10.1.1.1' localhost:7105/api/auth/get-session` |
| WS1 | `@react-three/fiber` `Canvas` on a server-rendered route | `Error in renderToReadableStream: Cannot read properties of null (reading 'useMemo')` at `CanvasImpl`: **~2,000 logged errors per baseline run**; React falls back to client rendering for that boundary but pays the failed render and the log write on every request | `server-ws0.log` (2,038 occurrences in the first run) |
| WS1 | page payloads | home 112–117 KB, `/achievements` 310 KB, `/explore` 207 KB, `/c/…` 199 KB, `/tag/…` 200 KB vs 60/90 KB budget; the anonymous floor is ~50 KB for any page | `baseline.json` `bytes` |
| WS1 / WS3 | warmup / prisma | The Nitro bundle (`_chunks/prisma.server.mjs`) and the app bundle (`_ssr/prisma.server-*.mjs`) each contain `prisma.server`; the `globalThis` singleton guard is skipped in production, so two `PrismaClient` pools can exist. Low priority (the second is only used by warmup/otel plugin imports) but unverified | `grep -l "new PrismaClient" .output/server -r` |
| WS3 | `/api/pulse` | returns 406 to `Accept: application/json` (SSE stream); not in the route list | probe |

## Budget status (owned routes, after)

WS0 owns no routes. Instrument overhead: `measure()` adds one `AsyncLocalStorage.getStore()` and one
`performance.now()` pair per `cached()`/query; the repeat run of `/` below is within noise of the first.

| Route | Auth | TTFB p50/p95 | Queries | Bytes | In budget? |
|---|---|---|---:|---:|---|
| `/` (run 1, baseline) | anon | 12.5 / 17.3 | 0* | 112 KB | TTFB yes, bytes no |
| `/` (run 2, repeat) | anon | 9.0 / 14.2 | 0* | 112 KB | same |
| `/` (run 1, baseline) | signed | 9.8 / 15.5 | 1* | 117 KB | TTFB yes, bytes no |
| `/` (run 2, repeat) | signed | 10.3 / 19.2 | 1* | 117 KB | same |

\* streamed content not counted (Deferred #2). Repeat spread: anon p50 ±3.5 ms, signed p50 ±0.5 ms.

## Rule objections

1. **`02-budgets.md` §2 "Load p95 @ c=16 ≤ 2× sequential p95".** Every one of the 233 load rows breaches it,
   including trivial ones: sixteen concurrent
   requests on one Node process queue by definition, so p95 ≈ 16 × service time ÷ cores in use. The ratio
   cannot be met by any route that takes more than ~1 ms of CPU. Proposed replacement: a **throughput floor**
   (rps at c=16, e.g. pages ≥ 150 rps, API GET ≥ 500 rps measured on this box) plus "load p95 ≤ c × sequential
   p50 × 1.5". Baseline medians to ratify against: pages 183 rps, API 769 rps.
2. **`01-method.md` §1.2** says "the 40 most-called API GETs ranked by call count". Static call-count ranking
   is crude: the same fetch paths are shared across prefixes and call sites say nothing about frequency; the
   list was built from client-reference counts plus the shell's polling endpoints (`/api/notifications`,
   `messages/unread-count`, `streak`, `progress`, …). Real frequency needs RUM or the access log.

## Environment notes

- **Rate limits.** The in-app limiter is per client IP and multiplied ×4 (clamped ≤ 20), so a harness at
  hundreds of rps from one address measures the 429 path (13 rows went invalid in the first attempt). The
  bench sends a fresh `cf-connecting-ip` per request (not `x-forwarded-for`, see the `isIPv4` handoff);
  `/api/auth/get-session` is excluded from the concurrent pass (`load: false`) for the same reason.
- **Migrations:** `prisma migrate deploy` on an empty DB worked (22 s, 221 migrations); `db push` was not
  needed. The template was re-migrated for `20261021120000_bot_worker_settings` after merging main; that
  table is not read by any route in the list, so it is not seeded.
- **Server stdout** needs the worktree `.env` exported (Nitro does not load it); nothing else was missing.
  The production build served every route in the list without an env fix.
- **Redirects.** Several legacy URLs 307 (`/arcade`→`/games`, `/leaderboard`→`/games?sub=leaderboard`,
  `/market`→`/store?tab=market`, …); the route list uses the targets. The full-screen apps redirect
  anonymous users to `/login`, so they are signed-only rows.
- **SIGTERM.** The drain plugin makes `node .output/server/index.mjs` ignore SIGTERM for a long time;
  `cold-start.mjs` uses SIGKILL. Leftover servers hold port 7105 and silently serve the next bench.
- **Mutating routes.** The four POST rows write to `rmh_ws0` (a post, a like toggle, a comment, a follow);
  recreate the DB from the template for a clean slate. Baselines were taken after a few of those had run.
- The baseline ran while other agents used the box (load1 ≈ 1.4–2.0); the harness serialised on the shared
  lock, so no other benchmark overlapped, but absolute numbers are still pessimistic.

## Commands

```bash
export PATH=/opt/node24/bin:$PATH
# one-time (coordinator already did this): template DB + manifest
createdb -h localhost -U postgres rmh_perf_build && DATABASE_URL=postgresql://postgres:password@localhost:5432/rmh_perf_build pnpm prisma migrate deploy
pnpm tsx scripts/perf/seed-perf-db.ts --db rmh_perf_build            # 126 s; writes scripts/perf/.dataset.json
psql -c 'ALTER DATABASE rmh_perf_build RENAME TO rmh_perf_template' -c 'ALTER DATABASE rmh_perf_template IS_TEMPLATE true'
# per worktree
createdb -T rmh_perf_template rmh_ws0 && psql -d rmh_ws0 -c 'ALTER DATABASE rmh_ws0 SET log_min_duration_statement=20'
flock /tmp/rmh-perf-build.lock pnpm build
set -a; source .env; set +a
NODE_ENV=production PORT=7105 RMH_PERF_HEADERS=1 node .output/server/index.mjs > server.log 2>&1 &   # OUTSIDE the lock
# the full baseline (~17 min)
flock /tmp/rmh-perf-build.lock node scripts/perf/server-bench.mjs --base http://localhost:7105 --auth both \
  --warmup 5 --samples 30 --concurrency 16 --duration 4 --out docs/server-perf-2026-10-21/results/baseline.json
node scripts/perf/server-bench.mjs --summary docs/server-perf-2026-10-21/results/baseline.json
# reproduce `/` in both auth modes (10 s)
flock /tmp/rmh-perf-build.lock node scripts/perf/server-bench.mjs --base http://localhost:7105 --only home --auth both --out /tmp/home.json
node scripts/perf/server-bench.mjs --compare docs/server-perf-2026-10-21/results/baseline.json /tmp/home.json
# cold start (needs the port free)
node scripts/perf/cold-start.mjs --port 7105 --runs 3
```

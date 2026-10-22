# WS3 — API layer: cache-policy adoption and handler overhead — results

> Point-in-time ledger as of `c4c8d6091` (#925). Figures are from the seeded perf dataset or in-process runs, not production; SHAs and branch names refer to that program's worktrees.

Worktree baseline taken 2026-10-21, commit e97b5192 (then merged with `claude/focused-darwin-bmii1v` @ 796295bd for the upstream routes). Environment deviations: **Stage A only** — `WS0_READY` never appeared, so nothing here is a latency claim. Every Shipped row is `exact` (call counts or response headers), measured by vitest, not by the HTTP harness.

## Shipped
| # | Change | Route(s) | Metric | Before | After | Commit | Correctness test | Evidence |
|---|---|---|---|---:|---:|---|---|---|
| 1 | Triage script + named public policies (`lib/api/cache-policies.ts`) | all 507 GET/HEAD | handlers classified with a reason | 0 | 507 | dfab8c4d | `api-cache-policy.test.ts` runs it | exact |
| 2 | `auth: 'optional'` -> `'none'` where nothing reads the viewer | slice-it/showcase, ai/takeaways, canvas/log, canvas/state, slice-it/replay, slice-it/replay/$id, community-pages/$id/revisions, handles/history | `auth.api.getSession` calls per request | 1 | 0 | c5d1f872 | `api-dead-session.test.ts` (fails if one route is reverted — checked) | exact |
| 3 | Public cache policy on 8 anonymous-invariant GETs | doctrine/puzzles/leaderboard, dream-rift/coop, forecasting/seasons, slice-it/showcase (`leaderboard` 30/60/300); tournaments, achievements/$userId, doctrine/incidents (`liveList` 15/30/60); pf2ecal/sessions/archive (`archive` 300/900/3600) | GETs with a declared `cache` option | 44 | 52 | a010f2d6 | `api-cache-policy.test.ts`: static scan clean + dynamic call with/without cookie, Authorization, Accept-Language: 0 session reads, only IP/conditional/encoding headers read, identical status and body (33 of 47 public routes return 2xx under the empty Prisma stub; the rest are covered by the read assertions) | exact |
| 4 | `apiCache.invalidate*` now also publishes on the existing `cache:invalidate` Redis channel (hook in `lib/cache.ts`, registered by `lib/cached.server.ts` at module load; origin id stops echo loops; `cached.server` drops via `dropLocal*`; local-only without `REDIS_URL`) | the ~25 `apiCache.invalidate*` call sites (communities automod/settings/flairs, link-risk, muted words, tiers, ops notices, ...), no file edited | processes that see an invalidation | 1 (the writer) | all (2 web workers, plus the second container during a swap) | this round's commit | `lib/__tests__/api-cache-bridge.test.ts`: two simulated processes on a fake bus; key and prefix; exactly one publish (no loop); own echo ignored; no Redis = local-only | exact |
| 5 | ~~`apiCache` FIFO -> LRU, `API_CACHE_MAX_ENTRIES`~~ **Superseded by main `7cff5e5a6` / `ff05b6a36`** (true LRU + byte budget sized from the worker heap; the knob is gone). The Redis invalidation bridge (#4) was kept and now sits on the `apiCache` facade. | - | - | - | - | - | - | superseded |
| 6 | Server-side response micro-cache in `defineHandler` for `cache.visibility: 'public'` + `auth: 'none'` GETs (closes D1). Own LRU (500 entries / 16 MB, `API_RESPONSE_CACHE_ENTRIES`, 0 disables), TTL `min(sMaxAge, 30 s)`, single-flight, 200 only, <= 64 KB, per worker | /api/tournaments, /api/forecasting/seasons, /api/dream-rift/coop (the three public routes that query the DB; the other five declared routes issue no query on this dataset and are unchanged within noise) | anon p50 ms / rps @c=16 / queries | 1.9 / 935 / 1 ; 1.8 / 1036 / 1 ; 1.8 / 1041 / 1 | 0.8 / 1243 / 0 ; 1.0 / 1673 / 0 ; 1.1 / 1562 / 0 | this round's commit | `api-response-cache.test.ts` (no cross-key bleed, TTL, no cache of errors/Set-Cookie/oversize, single-flight) and `api-cache-policy.test.ts` (dynamic public check clears the cache per call) | latency (production build, single process, same build with the knob 0 vs default, 100 samples + 5 s at c=16) |

Row 6 checklist (03-rules section 2): key = method+path+query (a public route reads no session/cookie/header, proven by the triage scan and the dynamic test); visibility = only routes the triage proves anonymous-invariant, `auth: 'none'`, no membership gate; invalidation = TTL only, stated cap 30 s (<= the route's own `sMaxAge`); coherence = deliberately per worker, not `cached()`: a worker's entry is at most 30 s old and no write path needs to purge a public-declared route; stampede = single-flight; memory = hard ceiling 16 MB per worker (byte budget) plus 500 entries; test = above. Cluster note: with N workers each fills its own copy, so the hit rate is about 1/N of a shared cache for low-rate routes, and the saving is largest on hot routes. The measured win is on a dataset where these queries are tiny (1 ms); on a real table the saving per hit is the query time.

Row 5's memory estimate is void: main's byte budget replaces it.

Caveat on the value of #3: the repo has no Apache or Cloudflare cache rule for `/api` (`deploy/` checked). Cloudflare does not cache JSON by default, so `s-maxage` on `/api` is inert until an operator adds a cache rule (a coordinator item for the report, not a code change); the browser `max-age`, ETag and 304 are real today. See Deferred D1 for a server-side answer that does not depend on that.

## Rejected (measured, no win)
| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---|---|---|
| R1 | `derivedContent` public cache on `ai/takeaways` | ai/takeaways | — | — | — | Not measured, rejected on correctness: the handler returns 200 `{takeaways: []}` when the AI call fails, and its own memo deliberately never stores that. An HTTP cache cannot tell the two apart and would pin a transient failure for 5 min (browser) to 1 h (shared) plus SWR. Only the `auth: 'none'` change shipped. |
| R2 | Short `private` windows on viewer-bound GETs (216 undeclared) | e.g. /api/search, /api/shop, /api/users/search, /api/communities | — | — | — | Rejected by rule: results carry block/mute/membership/owned state or the viewer edits the data, and a browser copy cannot be purged after their own write (03-rules 1.3; loading audit section 4 reached the same conclusion). The table gives each one its reason. |
| R3 | Cache on market/listings, awards, replay lookups, UGC comment/revision lists | see `PUBLIC_BUT_NOT_CACHED` in the test | — | — | — | Viewer-independent but the actor must see their own action at once, or visibility/moderation must not be stale. Each reason is in the test table, and the test fails if one goes stale. |

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| D1 | **Shipped (row 6 above; `lib/api/response-cache.server.ts`, `api-response-cache.test.ts`), no longer deferred.** Server-side response micro-cache inside `defineHandler` for routes declaring `visibility: 'public'` (L1 keyed by URL, TTL = `sMaxAge`) | Gives a real origin saving regardless of any CDN rule, and the triage + dynamic test already prove the declared set is anonymous-invariant. Needs a hunk in `lib/api/handler.server.ts`, WS0-owned until Stage B. | `WS0_READY`, then measure req/s on a public route. |
| D3 | `defineHandler` fixed overhead (session resolve, one Redis EVAL round trip per rate-limited request, zod parse) on a trivial route; check whether `redis.eval` re-sends the Lua script text instead of EVALSHA | Needs the harness and Server-Timing phases. | `WS0_READY`. |
| D4 | 58 raw GET handlers not on `defineHandler` (e.g. gift-sub, spaces, communities/$slug/announcements) | There is no options object for WS3 to edit; adoption is a handler-body change (WS4 / adoption backlog). `gift-sub` (constant price table) would take a public policy once adopted. | WS4 adopting the wrapper. |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS2 | app/routes/api/comments/$commentId/translate.ts:44 | Existing public cache (browser 1 h, shared 24 h, SWR 24 h) on a translation of a user comment; a deleted comment's translation stays served for that long. Moderation staleness against 03-rules 1.3. Suggest a much shorter window or key on the comment's `updatedAt`. | handler checks `deletedAt` only on a miss |
| WS2 | app/routes/api/rmharks/$id/like.ts:10 (and repost, comment like/repost) | Viewer-independent likes/reposts lists, no policy; leave uncached unless WS2 adds invalidation. | scan verdict `public`, reason in `PUBLIC_BUT_NOT_CACHED` |
| WS4 | `lib/communities/{automod,settings,flairs,contributors,onboarding,sisters}.server.ts`, `lib/safety/link-risk.server.ts`, `lib/feed/timeline.ts` (muted words), `lib/feed/signals.server.ts`, `lib/search/saved.server.ts`, `lib/doctrine/tiers.ts`, `lib/ops/{notices,experiments}.server.ts` | `apiCache` with a write-path `apiCache.invalidate` that is local-only. Moderation, permission and mute data stays stale on the other blue/green process until TTL. Now coherent across processes through the bridge (Shipped #4); migrating to `cached()` is only needed for an L2 or single-flight, so optional. | `pnpm tsx scripts/api-cache-triage.ts --apicache` (appendix B): 0 of 54 consumers use `cached()`; 25 files have invalidate calls |
| WS4 | app/routes/api/feedback.ts:11 | GET lists every feedback row, no `take`, with `include`. | read |
| WS6 | app/routes/api/{oembed,image-proxy,feed/image,library/cover,...} | Hand-rolled Cache-Control on 175 handlers is fine for the binary immutable ones; nothing to change from WS3. | triage table |

## Budget status (owned routes, after)
Not measured (Stage A). Header and call-count facts only:

| Route | Auth | TTFB p50/p95 | Queries | Bytes | In budget? |
|---|---|---|---|---|---|
| the 8 routes in Shipped #3 | none | not measured | not measured | unchanged | n/a: declared `Cache-Control: public, max-age=…` + weak ETag |
| the 8 routes in Shipped #2 | none | not measured | unchanged | unchanged | session lookups 1 -> 0 |
| /api/admin/bots (new upstream) | admin | not measured | — | — | classified no-store; no policy by design |

## Rule objections
None.

## Commands
```
pnpm tsx scripts/api-cache-triage.ts                 # summary + table (appendix A, regenerated on demand)
pnpm tsx scripts/api-cache-triage.ts --json          # machine-readable
pnpm tsx scripts/api-cache-triage.ts --apicache      # appendix B
pnpm exec vitest run lib/__tests__/api-cache-policy.test.ts lib/__tests__/api-dead-session.test.ts
```

Scan summary after merging upstream (507 GET/HEAD handlers, 449 on `defineHandler`): policy declared via `cache` 52, hand-rolled `Cache-Control` 175 (114 of them explicit `no-store`); verdicts public 102, private 320, review 12 (viewer-independent but the GET writes), no-store 73. Undeclared: public 20, private 216, review 2, no-store 42. Every undeclared `public`/`review` route has a reason in the test; every undeclared `private`/`no-store` route's reason is the `reasons` column. The only new upstream GET is `/api/admin/bots` (admin -> no-store). `messages/search` is WS2's and was not touched.

Limits of the scan: it follows calls through repo modules to depth 5; unresolved imports are listed as `UNRESOLVED` in the reasons. `public` means "no viewer signal found", a necessary condition, not a decision to cache. `GET refs` counts string references to the URL in client and server code, an undercount where URLs are built elsewhere; Stage B should re-rank with WS0's route list.

## Appendix A — triage table (not kept)

The full per-route table (every `GET`/`HEAD` handler with its auth, wrapper, verdict and declared policy) is
generated by `scripts/api-cache-triage.ts` and nothing checks a pasted copy for freshness, so it is not kept here.
Regenerate it on the current tree with `pnpm tsx scripts/api-cache-triage.ts`; `lib/__tests__/api-cache-policy.test.ts`
is the executable check that the policies it reports stay safe.

## Appendix B — apiCache consumers

Snapshot from the time of writing (also generated, `--apicache`); regenerate rather than trust it.

| file | on cached()? | get/set/inval | keys | also imported by server/** |
|---|---|---|---|---|
| `app/routes/api/doctrine/reactions.ts` | no | 0/0/3 |  | - |
| `lib/delight/museum.server.ts` | no | 1/1/3 | `KEY` | - |
| `lib/doctrine/incidents.ts` | no | 1/1/3 | `cacheKey` | - |
| `lib/doctrine/reputation.ts` | no | 2/2/3 | `cacheKey` | - |
| `lib/posts-plus/qotd.server.ts` | no | 2/2/3 | `cacheKey` | - |
| `lib/reading/glossary.server.ts` | no | 1/1/3 | `CACHE_KEY` | - |
| `lib/search/saved.server.ts` | no | 1/1/3 | `key` | - |
| `lib/calendar/feed.server.ts` | no | 1/1/2 | `key` | - |
| `lib/communities/sisters.server.ts` | no | 1/1/2 | `key(communityId` | - |
| `lib/doctrine/narrative.ts` | no | 2/2/2 | `cacheKey` | - |
| `lib/feed/signals.server.ts` | no | 1/1/2 | `key(userId` | - |
| `lib/games/meta.server.ts` | no | 1/1/2 | `aggKey(gameId` | - |
| `lib/ops/notices.server.ts` | no | 1/1/2 | `ACTIVE_KEY` | - |
| `lib/reading/highlights.server.ts` | no | 2/2/2 | `cacheKey` | - |
| `lib/safety/link-risk.server.ts` | no | 1/1/2 | ``linkrisk:${host}`` | - |
| `app/routes/api/doctrine/puzzles/submit.ts` | no | 0/0/1 |  | - |
| `lib/analytics/cost.server.ts` | no | 1/1/1 | `cacheKey` | - |
| `lib/bums-rush/progress/save.server.ts` | no | 0/0/1 |  | - |
| `lib/calendar/office-hours.server.ts` | no | 1/1/1 | `key` | - |
| `lib/communities/automod.server.ts` | no | 1/1/1 | `rulesKey(communityId` | - |
| `lib/communities/contributors.server.ts` | no | 1/1/1 | `key(communityId` | - |
| `lib/communities/flairs.server.ts` | no | 1/1/1 | `key(communityId` | - |
| `lib/communities/onboarding.server.ts` | no | 1/1/1 | `key(communityId` | - |
| `lib/communities/settings.server.ts` | no | 1/1/1 | `key(communityId` | - |
| `lib/delight/config.server.ts` | no | 1/1/1 | `CACHE_KEY` | - |
| `lib/doctrine/tiers.ts` | no | 1/1/1 | `cacheKey` | - |
| `lib/economy/community-goal.server.ts` | no | 1/1/1 | `LIST_KEY` | - |
| `lib/feed/timeline.ts` | no | 2/2/1 | `cacheKey` `mutedWordsKey(userId` | - |
| `lib/game/director.server.ts` | no | 2/2/1 | `key` | - |
| `lib/ops/experiments.server.ts` | no | 1/1/1 | `RUNNING_KEY` | - |
| `lib/posts-plus/series.server.ts` | no | 1/1/1 | `key` | - |
| `lib/slice-it/hub.server.ts` | no | 1/1/1 | `HUB_CACHE_KEY` | - |
| `lib/slice-it/library.server.ts` | no | 1/1/1 | `key` | - |
| `lib/slice-it/showcase.server.ts` | no | 1/2/1 | `cacheKey(userId` | - |
| `app/routes/api/ai/suggest-tags.ts` | no | 1/1/0 | `TRENDING_CACHE_KEY` | - |
| `app/routes/api/ai/takeaways.ts` | no | 1/1/0 | `key` | - |
| `app/routes/api/badge/$userId/$gameId.ts` | no | 1/1/0 | `key` | - |
| `app/routes/api/bums-rush/leaderboard.ts` | no | 1/1/0 | `cacheKey` | - |
| `app/routes/api/doctrine/puzzles/leaderboard.ts` | no | 1/1/0 | `cacheKey` | - |
| `app/routes/api/doctrine/puzzles/today.ts` | no | 1/1/0 | `cacheKey` | - |
| `app/routes/api/rmharks.ts` | no | 1/1/0 | `probeKey` | - |
| `lib/ai/catch-up.server.ts` | no | 1/1/0 | `key` | - |
| `lib/delight/fortune.server.ts` | no | 1/1/0 | `key` | - |
| `lib/delight/translate.server.ts` | no | 1/1/0 | `key` | - |
| `lib/economy/savings-goal.server.ts` | no | 1/1/0 | `key` | - |
| `lib/economy/statement.server.ts` | no | 1/1/0 | `key` | - |
| `lib/feed/personalize.server.ts` | no | 1/2/0 | `cacheKey(userId` | - |
| `lib/forecasting/forecasting.server.ts` | no | 3/3/0 | `key` | - |
| `lib/homes/geo.server.ts` | no | 1/1/0 | `cacheKey` | - |
| `lib/ops/route-views.server.ts` | no | 1/1/0 | `'ops:route-views'` | - |
| `lib/posts-plus/link-rescue.server.ts` | no | 1/1/0 | `throttleKey` | - |
| `lib/search/expand.server.ts` | no | 1/2/0 | `key` | - |
| `lib/trick-week/trick-week.server.ts` | no | 1/1/0 | `key` | - |
| `lib/wrapped/narrative.server.ts` | no | 1/2/0 | `key` | - |


## Stage B (merged tree) additions

**Handler fixed overhead** (production build, one process, Redis on; `results` scratchpad `ws3-off.json`, micro-cache off, 100 sequential samples + 5 s at c=16):

| Route | shape | p50 ms | p95 ms | rps @c=16 |
|---|---|---:|---:|---:|
| /api/health | no wrapper floor | 0.7 | 0.9 | 1588 |
| /api/delight/config anon | defineHandler none + rate limit + policy | 1.2 | 1.5 | 1663 |
| /api/experiments anon (no cookie) | defineHandler optional + rate limit read | 1.8 | 2.4 | 1400 |
| /api/experiments signed | same + session + one cached read | 2.2 | 2.7 | 837 |

The wrapper costs about 0.5 ms over the floor with no cookie (rate-limit EVALSHA round trip, which main already made one RTT), and a signed request adds about 0.4 ms p50 and cuts c=16 throughput by 40% (session resolve + tier). Nothing is done twice that I could see; all inside the `api` budget. No change made.

**Public policy latency/throughput**: see row 6; the five routes with no query sit at 1.0-1.2 ms / 1.5-1.7k rps either way.

**New main GETs triaged** (`pnpm tsx scripts/api-cache-triage.ts`, 512 GET/HEAD, 5 new): /api/admin/deepseek/balance, /api/admin/deepseek/history, /api/admin/perf, /api/admin/perf/db, /api/admin/perf/heap are all `auth: 'admin'`, already `no-store`; left private/no-store by design, no edit.

**Not measured**: `/api/pf2ecal/sessions/archive` returned 400 without params (excluded).

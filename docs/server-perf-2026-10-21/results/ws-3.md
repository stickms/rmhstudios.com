# WS3 — API layer: cache-policy adoption and handler overhead — results

Worktree baseline taken 2026-10-21, commit e97b5192 (then merged with `claude/focused-darwin-bmii1v` @ 796295bd for the upstream routes). Environment deviations: **Stage A only** — `WS0_READY` never appeared, so nothing here is a latency claim. Every Shipped row is `exact` (call counts or response headers), measured by vitest, not by the HTTP harness.

## Shipped
| # | Change | Route(s) | Metric | Before | After | Commit | Correctness test | Evidence |
|---|---|---|---|---:|---:|---|---|---|
| 1 | Triage script + named public policies (`lib/api/cache-policies.ts`) | all 507 GET/HEAD | handlers classified with a reason | 0 | 507 | dfab8c4d | `api-cache-policy.test.ts` runs it | exact |
| 2 | `auth: 'optional'` -> `'none'` where nothing reads the viewer | slice-it/showcase, ai/takeaways, canvas/log, canvas/state, slice-it/replay, slice-it/replay/$id, community-pages/$id/revisions, handles/history | `auth.api.getSession` calls per request | 1 | 0 | c5d1f872 | `api-dead-session.test.ts` (fails if one route is reverted — checked) | exact |
| 3 | Public cache policy on 8 anonymous-invariant GETs | doctrine/puzzles/leaderboard, dream-rift/coop, forecasting/seasons, slice-it/showcase (`leaderboard` 30/60/300); tournaments, achievements/$userId, doctrine/incidents (`liveList` 15/30/60); pf2ecal/sessions/archive (`archive` 300/900/3600) | GETs with a declared `cache` option | 44 | 52 | a010f2d6 | `api-cache-policy.test.ts`: static scan clean + dynamic call with/without cookie, Authorization, Accept-Language: 0 session reads, only IP/conditional/encoding headers read, identical status and body (33 of 47 public routes return 2xx under the empty Prisma stub; the rest are covered by the read assertions) | exact |

Caveat on the value of #3: the repo has no Apache or Cloudflare cache rule for `/api` (`deploy/` checked). Cloudflare does not cache JSON by default, so `s-maxage` is inert until an operator adds a cache rule; the browser `max-age`, ETag and 304 are real today. See Deferred D1 for a server-side answer that does not depend on that.

## Rejected (measured, no win)
| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---|---|---|
| R1 | `derivedContent` public cache on `ai/takeaways` | ai/takeaways | — | — | — | Not measured, rejected on correctness: the handler returns 200 `{takeaways: []}` when the AI call fails, and its own memo deliberately never stores that. An HTTP cache cannot tell the two apart and would pin a transient failure for 5 min (browser) to 1 h (shared) plus SWR. Only the `auth: 'none'` change shipped. |
| R2 | Short `private` windows on viewer-bound GETs (216 undeclared) | e.g. /api/search, /api/shop, /api/users/search, /api/communities | — | — | — | Rejected by rule: results carry block/mute/membership/owned state or the viewer edits the data, and a browser copy cannot be purged after their own write (03-rules 1.3; loading audit section 4 reached the same conclusion). The table gives each one its reason. |
| R3 | Cache on market/listings, awards, replay lookups, UGC comment/revision lists | see `PUBLIC_BUT_NOT_CACHED` in the test | — | — | — | Viewer-independent but the actor must see their own action at once, or visibility/moderation must not be stale. Each reason is in the test table, and the test fails if one goes stale. |

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| D1 | Server-side response micro-cache inside `defineHandler` for routes declaring `visibility: 'public'` (L1 keyed by URL, TTL = `sMaxAge`) | Gives a real origin saving regardless of any CDN rule, and the triage + dynamic test already prove the declared set is anonymous-invariant. Needs a hunk in `lib/api/handler.server.ts`, WS0-owned until Stage B. | `WS0_READY`, then measure req/s on a public route. |
| D2 | `apiCache.invalidate*` bridge: make every local invalidation also publish on the existing `cache:invalidate` Redis channel (hook in `lib/cache.ts`, registered by `lib/cached.server.ts`) | Fixes all 25 coherence-sensitive call sites without editing their WS4-owned files; needs the `cached.server.ts` edit. | `WS0_READY`. |
| D3 | `defineHandler` fixed overhead (session resolve, one Redis EVAL round trip per rate-limited request, zod parse) on a trivial route; check whether `redis.eval` re-sends the Lua script text instead of EVALSHA | Needs the harness and Server-Timing phases. | `WS0_READY`. |
| D4 | 58 raw GET handlers not on `defineHandler` (e.g. gift-sub, spaces, communities/$slug/announcements) | There is no options object for WS3 to edit; adoption is a handler-body change (WS4 / adoption backlog). `gift-sub` (constant price table) would take a public policy once adopted. | WS4 adopting the wrapper. |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS2 | app/routes/api/comments/$commentId/translate.ts:44 | Existing public cache (browser 1 h, shared 24 h, SWR 24 h) on a translation of a user comment; a deleted comment's translation stays served for that long. Moderation staleness against 03-rules 1.3. Suggest a much shorter window or key on the comment's `updatedAt`. | handler checks `deletedAt` only on a miss |
| WS2 | app/routes/api/rmharks/$id/like.ts:10 (and repost, comment like/repost) | Viewer-independent likes/reposts lists, no policy; leave uncached unless WS2 adds invalidation. | scan verdict `public`, reason in `PUBLIC_BUT_NOT_CACHED` |
| WS4 | `lib/communities/{automod,settings,flairs,contributors,onboarding,sisters}.server.ts`, `lib/safety/link-risk.server.ts`, `lib/feed/timeline.ts` (muted words), `lib/feed/signals.server.ts`, `lib/search/saved.server.ts`, `lib/doctrine/tiers.ts`, `lib/ops/{notices,experiments}.server.ts` | `apiCache` with a write-path `apiCache.invalidate` that is local-only. Moderation, permission and mute data stays stale on the other blue/green process until TTL. Migrate to `cached()` + `invalidateCached`, or accept D2 (bridge) instead. | `pnpm tsx scripts/api-cache-triage.ts --apicache` (appendix B): 0 of 54 consumers use `cached()`; 25 files have invalidate calls |
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
pnpm tsx scripts/api-cache-triage.ts                 # summary + table (appendix A)
pnpm tsx scripts/api-cache-triage.ts --json          # machine-readable
pnpm tsx scripts/api-cache-triage.ts --apicache      # appendix B
pnpm exec vitest run lib/__tests__/api-cache-policy.test.ts lib/__tests__/api-dead-session.test.ts
```

Scan summary after merging upstream (507 GET/HEAD handlers, 449 on `defineHandler`): policy declared via `cache` 52, hand-rolled `Cache-Control` 175 (114 of them explicit `no-store`); verdicts public 102, private 320, review 12 (viewer-independent but the GET writes), no-store 73. Undeclared: public 20, private 216, review 2, no-store 42. Every undeclared `public`/`review` route has a reason in the test; every undeclared `private`/`no-store` route's reason is the `reasons` column. The only new upstream GET is `/api/admin/bots` (admin -> no-store). `messages/search` is WS2's and was not touched.

Limits of the scan: it follows calls through repo modules to depth 5; unresolved imports are listed as `UNRESOLVED` in the reasons. `public` means "no viewer signal found", a necessary condition, not a decision to cache. `GET refs` counts string references to the URL in client and server code, an undercount where URLs are built elsewhere; Stage B should re-rank with WS0's route list.

## Appendix A — triage table (all GET/HEAD handlers, by GET refs)
Columns: `dH` = on `defineHandler`, `raw` = not; `declared` = `cache` option or `hand:` the Cache-Control the body sets.

| URL | GET refs | owner | auth | wrapper | verdict | declared | reasons |
|---|---:|---|---|---|---|---|---|
| `/api/profile/$id` | 27 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/search` | 12 | WS3 | optional | dH | private | - | viewer: uses userId |
| `/api/messages/$conversationId` | 11 | WS2 | required | dH | no-store | - | write: prisma.directMessage
          .updateMany, incrby(); viewer: uses session, parameter viewerId |
| `/api/user-builds` | 10 | WS3 | none | dH | no-store | - | write: prisma.rmhCodeToken.update; session: getSession(), auth.api.getSession, getSession |
| `/api/slice-it/songs/$id` | 9 | WS3 | optional | dH | private | - | viewer: uses userId, parameter viewerId… |
| `/api/oembed` | 8 | WS6 | none | dH | no-store | hand: `<dynamic> \| public, max-age=3600, stale-while-revalidate=3600` | write: prisma.linkCheck.updateMany, prisma.linkCheck.createMany; stream: TransformStream, ReadableStream |
| `/api/user-builds/$id` | 7 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/game-saves/$gameId` | 6 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/messages` | 6 | WS2 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/explore` | 5 | WS2 | n/a | raw | private | hand: `private, max-age=30` | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId… |
| `/api/games/$id/leaderboard` | 5 | WS3 | none | dH | review | `{ visibility: 'public', maxAge: 60, sMaxAge: 60, staleWhileRevalidate: 300 }` | write: prisma.gameStat.upsert, prisma.gameStat.updateMany; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/image-proxy` | 5 | WS6 | none | dH | no-store | hand: `public, max-age=2592000, stale-while-revalidate=2592000` | write: prisma.user.update; stream: TransformStream, ReadableStream |
| `/api/og/sohumtracker` | 5 | WS6 | none | dH | public | hand: `<dynamic>` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/rmharks` | 5 | WS2 | none | dH | no-store | - | write: tx.rMHark.create, tx.user.update, tx.community.update…; session: getSession(), auth.api.getSession, getSession; viewer: parameter viewerId |
| `/api/shop` | 5 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/slice-it/songs` | 5 | WS3 | optional | dH | private | - | viewer: uses userId, parameter viewerId… |
| `/api/spaces/$id` | 5 | WS3 | n/a | raw | public | - | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/bums-rush/profile` | 4 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/feed/image/$filename` | 4 | WS6 | n/a | raw | private | hand: `public, max-age=31536000, immutable` | header: header accept |
| `/api/homes/listings/$id` | 4 | WS3 | optional | dH | no-store | - | write: prisma.homeListing
      .update; viewer: parameter viewerId, uses session… |
| `/api/kaikai-debt/stats` | 4 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 30, staleWhileRevalidate: 120 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/notifications` | 4 | WS2 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/rmharks/$id` | 4 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/spaces/live` | 4 | WS3 | n/a | raw | public | hand: `public, max-age=5, stale-while-revalidate=20` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/users/search` | 4 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/achievements/$userId` | 3 | WS3 | none | dH | public | `CACHE_POLICY.liveList { visibility: 'public', maxAge: 15, sMaxAge: 30, staleWhileRevalidate: 60 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/admin/insights/experiments` | 3 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/insights/notices` | 3 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/arcade/backlog` | 3 | WS3 | optional | dH | private | - | viewer: uses userId |
| `/api/bulk` | 3 | WS3 | required+feature | dH | private | - | auth: required; membership-gated; viewer: uses userId |
| `/api/calls/ice` | 3 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/casino/rooms` | 3 | WS3 | none | dH | public | hand: `no-store` | auth: none; no session/header/viewer/write/stream signal; external: fetch() |
| `/api/communities` | 3 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/communities/$slug` | 3 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session |
| `/api/doctrine/puzzles/today` | 3 | WS3 | none | dH | review | `{ visibility: 'public', maxAge: 300, sMaxAge: 3600, staleWhileRevalidate: 86400 }` | write: prisma.doctrinePuzzle.create; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/feed/mention-search` | 3 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/feeds/$id` | 3 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId… |
| `/api/group-chats/$id` | 3 | WS2 | required | dH | no-store | - | write: prisma.groupChatMember.update; viewer: uses session, parameter viewerId |
| `/api/homes/listings` | 3 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/leaderboards/$gameId` | 3 | WS3 | optional | dH | no-store | hand: `<dynamic>` | write: prisma.gameStat.upsert, prisma.gameStat.updateMany; viewer: parameter viewerId, uses userId |
| `/api/leaderboards/players` | 3 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session |
| `/api/library/cover/$id` | 3 | WS3 | n/a | raw | private | hand: `public, max-age=31536000, immutable` | header: header accept |
| `/api/marathon-lists` | 3 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/og/moment/$id` | 3 | WS6 | none | dH | public | hand: `public, max-age=31536000, s-maxage=31536000, immutable` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/playlists` | 3 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/preferences/appearance` | 3 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/profile/avatar/$filename` | 3 | WS2 | n/a | raw | public | hand: `public, max-age=3600 \| public, max-age=31536000, immutable` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/ranked` | 3 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/rideshare/rides` | 3 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/rmharks/$id/take` | 3 | WS2 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId… |
| `/api/rmhmusic/guess` | 3 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/slice-it/admin/content` | 3 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/slice-it/songs/artists` | 3 | WS3 | none | dH | public | hand: `public, max-age=60, s-maxage=300` | auth: none; no session/header/viewer/write/stream signal |
| `/api/sohumtracker/activity` | 3 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 5, staleWhileRevalidate: 30 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/study/decks` | 3 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/study/decks/$id` | 3 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/account/recovery/requests` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/admin/albums` | 2 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/admin/delight/hunts` | 2 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/insights/cohorts` | 2 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/insights/errors` | 2 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/reading/stories` | 2 | WS3 | admin | dH | no-store | hand: `private, no-store` | auth: admin (low traffic, must be fresh) |
| `/api/admin/release-notes` | 2 | WS3 | admin | dH | no-store | hand: `private, no-store` | auth: admin (low traffic, must be fresh) |
| `/api/admin/users` | 2 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/altair/meta` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/arcade` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/arcade/basket` | 2 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId |
| `/api/badge/$userId/$gameId` | 2 | WS3 | none | dH | review | `{ visibility: 'public', maxAge: 3600, sMaxAge: 86_400, staleWhileRevalidate: 86_400 }` | write: prisma.gameStat.upsert, prisma.gameStat.updateMany; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/bookmarks` | 2 | WS3 | required | dH | private | - | auth: required; viewer: parameter viewerId, uses session… |
| `/api/calc-notebooks` | 2 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/chat-folders` | 2 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/coins` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/coins/statement` | 2 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/communities/$slug/feed` | 2 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session… |
| `/api/context-notes` | 2 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId… |
| `/api/daily-puzzles/results` | 2 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/discord/embed` | 2 | WS3 | n/a | raw | public | - | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/doctrine/incidents` | 2 | WS3 | none | dH | public | `CACHE_POLICY.liveList { visibility: 'public', maxAge: 15, sMaxAge: 30, staleWhileRevalidate: 60 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/doctrine/puzzles/replay` | 2 | WS3 | none | dH | no-store | - | write: prisma.doctrinePuzzleReplay.create; session: getSession(), auth.api.getSession, getSession |
| `/api/doctrine/sahur/status` | 2 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/emoji-packs/$slug` | 2 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId |
| `/api/emoji-packs/installed` | 2 | WS3 | required | dH | private | - | auth: required; viewer: parameter viewerId, uses userId |
| `/api/feed/signal` | 2 | WS2 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/forest-explorer/save` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/gif/search` | 2 | WS3 | n/a | raw | private | - | header: request.headers passed whole |
| `/api/gift-exchanges/$id` | 2 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: parameter viewerId, uses userId |
| `/api/group-chats` | 2 | WS2 | optional | dH | private | - | viewer: uses session |
| `/api/history/resume` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/lists/$id/feed` | 2 | WS3 | optional | dH | private | - | viewer: uses session, parameter viewerId… |
| `/api/market/listings` | 2 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/messages/saved` | 2 | WS2 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/messages/stream` | 2 | WS2 | required | dH | no-store | hand: `no-cache, no-transform` | write: redisPublish(); stream: ReadableStream, text/event-stream; viewer: uses session |
| `/api/messages/voice/$filename` | 2 | WS2 | required | dH | private | hand: `private, max-age=300` | auth: required; viewer: uses userId |
| `/api/museum` | 2 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 60, sMaxAge: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/notifications/preferences` | 2 | WS2 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/office-hours/host/$id` | 2 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/personas/$id` | 2 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/playlists/$id` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/predictions` | 2 | WS3 | optional | dH | no-store | - | write: db.prediction.create, tx.predictionPosition.update, tx.prediction.update; viewer: uses session, parameter viewerId |
| `/api/preferences/layout` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/preferences/notifications` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/profile/plus` | 2 | WS2 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/progress` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/push/public-key` | 2 | WS3 | n/a | raw | public | hand: `public, max-age=3600` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/reading/doc` | 2 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId |
| `/api/recap` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/referrals/me` | 2 | WS3 | required | dH | no-store | - | write: prisma.user.update; viewer: uses session |
| `/api/requests` | 2 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId |
| `/api/rideshare/directions` | 2 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/rmharks/$id/translate` | 2 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/rmhbox/leaderboard` | 2 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter currentUserId |
| `/api/rmhladder/answers` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/rmhmusic/guess/$id` | 2 | WS3 | optional | dH | private | - | viewer: uses session… |
| `/api/rmhmusic/spotify/search` | 2 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 300, sMaxAge: 3600, staleWhileRevalidate: 86400 }` | auth: none; no session/header/viewer/write/stream signal; external: fetch() |
| `/api/rmhtube/commentary` | 2 | WS3 | required | dH | private | - | auth: required |
| `/api/rmhtube/timed-comments` | 2 | WS3 | required | dH | private | - | auth: required; viewer: parameter viewerId, uses userId |
| `/api/saves` | 2 | WS3 | required | dH | private | - | auth: required; viewer: parameter viewerId, uses session |
| `/api/scheduled` | 2 | WS3 | required | dH | no-store | - | write: tx.rMHark.create, tx.user.update, tx.community.update…; viewer: uses session |
| `/api/series` | 2 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/series/$id` | 2 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId… |
| `/api/settings/alt-text` | 2 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/settings/auto-delete` | 2 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/signal-forge/load` | 2 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/slice-it/charts/$id` | 2 | WS3 | optional | dH | private | - | viewer: uses userId |
| `/api/slice-it/packs` | 2 | WS3 | optional | dH | private | - | viewer: uses userId, parameter viewerId… |
| `/api/slice-it/setlists/$id` | 2 | WS3 | optional | dH | private | - | viewer: uses userId, parameter viewerId… |
| `/api/slice-it/showcase` | 2 | WS3 | none | dH | public | `CACHE_POLICY.leaderboard { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/slice-it/songs/$id/cover` | 2 | WS3 | optional | dH | private | hand: `<dynamic>` | viewer: uses userId |
| `/api/sohumtracker/alert` | 2 | WS3 | required | dH | private | `{ visibility: 'private', maxAge: 0 }` | auth: required; viewer: uses userId |
| `/api/sohumtracker/export` | 2 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/sohumtracker/stream` | 2 | WS3 | none | dH | no-store | hand: `no-cache, no-transform` | stream: ReadableStream, text/event-stream |
| `/api/storefront/creator/$userid` | 2 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session |
| `/api/streak` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/study-plans` | 2 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/tags/$tag` | 2 | WS3 | optional | dH | private | - | viewer: uses session, parameter viewerId… |
| `/api/versecraft/save` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/webrings/$slug` | 2 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/wishlist` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/wrapped` | 2 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/account/export` | 1 | WS3 | required | dH | private | hand: `no-store` | auth: required; viewer: uses session |
| `/api/account/recovery/codes` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/account/recovery/contacts` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/account/recovery/hold` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/account/standing` | 1 | WS3 | required | dH | no-store | hand: `private, no-store` | write: prisma.userStrike
      .updateMany; viewer: uses session |
| `/api/activity` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/admin/analytics` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/admin/announcements` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/admin/appeals` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/admin/audit-log` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/admin/bots` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/canvas` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/context-notes` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/delight/fortunes` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/delight/translations` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/delight/translations/export` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/economy` | 1 | WS3 | admin | dH | no-store | hand: `private, max-age=30` | auth: admin (low traffic, must be fresh) |
| `/api/admin/insights/routes` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/library` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/admin/library/quota-requests` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/admin/library/storage-health` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/admin/link-rules` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/mod-macros` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/predictions` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/admin/qotd` | 1 | WS3 | admin | dH | no-store | hand: `private, no-store` | auth: admin (low traffic, must be fresh) |
| `/api/admin/reading/glossary` | 1 | WS3 | admin | dH | no-store | hand: `private, no-store` | auth: admin (low traffic, must be fresh) |
| `/api/admin/reading/stories/$id/suggest` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/redemptions` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/admin/reports` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/admin/review-counts` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/admin/rideshare/applications` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/admin/rideshare/rides` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/admin/view-as` | 1 | WS3 | admin | dH | no-store | hand: `private, no-store` | write: prisma.adminAuditLog.create; viewer: uses userId |
| `/api/ai/takeaways` | 1 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/albums/asset/$` | 1 | WS3 | n/a | raw | private | hand: `public, max-age=31536000, immutable` | header: header accept |
| `/api/altair/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/announcements` | 1 | WS3 | n/a | raw | private | hand: `<dynamic>` | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/arcade/daily` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId |
| `/api/arcade/patch-notes` | 1 | WS3 | none | dH | public | hand: `public, max-age=60` | auth: none; no session/header/viewer/write/stream signal |
| `/api/arcade/rival` | 1 | WS3 | required | dH | no-store | - | write: prisma.gameStat.upsert, prisma.gameStat.updateMany, prisma.arcadeRival.update…; viewer: uses userId |
| `/api/arcade/runs` | 1 | WS3 | optional | dH | private | - | viewer: uses userId |
| `/api/arcade/tips` | 1 | WS3 | optional | dH | private | - | viewer: uses userId… |
| `/api/awards` | 1 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/battlepass` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/birthday` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/birthday/next` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required |
| `/api/bulk/$id` | 1 | WS3 | required+feature | dH | private | - | auth: required; membership-gated; viewer: uses userId |
| `/api/bums-rush/leaderboard` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId… |
| `/api/calendar-feed` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/calendar/$token` | 1 | WS3 | none | dH | public | `{ visibility: 'private', maxAge: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/canvas` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId |
| `/api/canvas/log` | 1 | WS3 | none | dH | public | hand: `public, max-age=3600` | auth: none; no session/header/viewer/write/stream signal |
| `/api/canvas/state` | 1 | WS3 | none | dH | public | hand: `no-store` | auth: none; no session/header/viewer/write/stream signal |
| `/api/canvas/stream` | 1 | WS3 | optional | dH | no-store | hand: `no-cache, no-transform` | stream: ReadableStream, text/event-stream; viewer: uses userId |
| `/api/chats/$kind/$id/meta` | 1 | WS2 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/circle` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/comments/$commentId/translate` | 1 | WS2 | none | dH | private | `{ visibility: 'public', maxAge: 3600, sMaxAge: 86400, staleWhileRevalidate: 86400 }` | header: request.headers passed whole |
| `/api/communities/$slug/macros` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/communities/$slug/members` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/community-goals` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId, uses session |
| `/api/connections/grids` | 1 | WS3 | none | dH | public | hand: `public, max-age=15, s-maxage=30` | auth: none; no session/header/viewer/write/stream signal |
| `/api/connections/grids/$id` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId |
| `/api/creator/redeem` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/creator/studio-overview` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/daily-puzzles/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/daily-puzzles/puzzle` | 1 | WS3 | none | dH | review | `{ visibility: 'public', maxAge: 300, sMaxAge: 3600, staleWhileRevalidate: 3600 }` | write: prisma.dailyPuzzle.create; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/delight/config` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 60, sMaxAge: 60 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/developer/keys` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/developer/keys/$id/usage` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; header: request.headers passed whole; viewer: uses session |
| `/api/discord/daily-progress` | 1 | WS3 | n/a | raw | private | - | header: header authorization |
| `/api/discord/race` | 1 | WS3 | n/a | raw | public | - | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/discovery/alerts` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/discovery/memories` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/discovery/trending/$tag` | 1 | WS3 | none | dH | public | hand: `public, max-age=300` | auth: none; no session/header/viewer/write/stream signal |
| `/api/discovery/watch` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/doctrine/puzzles/leaderboard` | 1 | WS3 | none | dH | public | `CACHE_POLICY.leaderboard { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/doctrine/reputation` | 1 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/doctrine/reputation/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/doctrine/safehouse/content` | 1 | WS3 | none | dH | no-store | - | write: prisma.doctrineAccessLog.createMany; session: getSession(), auth.api.getSession, getSession |
| `/api/doctrine/safehouse/disclosures` | 1 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/dream-rift/coop` | 1 | WS3 | none | dH | public | `CACHE_POLICY.leaderboard { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/dream-rift/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/dunesday/sync/$feedId` | 1 | WS3 | none | dH | private | - | header: request.headers.get(<dynamic>) |
| `/api/email/unsubscribe` | 1 | WS3 | n/a | raw | no-store | hand: `no-store, max-age=0` | write: prisma.notificationPreference.upsert |
| `/api/embed/oembed` | 1 | WS6 | none | dH | public | hand: `public, max-age=3600, stale-while-revalidate=86400` | auth: none; no session/header/viewer/write/stream signal |
| `/api/emoji-packs` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId |
| `/api/events` | 1 | WS3 | optional | dH | private | - | viewer: uses session, parameter viewerId… |
| `/api/events/$id` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session… |
| `/api/experiments` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId |
| `/api/feed/hashtag-search` | 1 | WS2 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/feed/stream` | 1 | WS2 | n/a | raw | no-store | hand: `no-cache, no-transform` | stream: ReadableStream, text/event-stream; session: getSession(), auth.api.getSession, getSession |
| `/api/feeds` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: parameter viewerId, uses userId |
| `/api/forecasting/calibration` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/forecasting/seasons` | 1 | WS3 | none | dH | public | `CACHE_POLICY.leaderboard { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/fortune/today` | 1 | WS3 | none | dH | review | `{ visibility: 'public', maxAge: 60, sMaxAge: 60 }` | write: prisma.fortuneCookie
        .updateMany; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/friendly` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/gabriels-horn/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/gabriels-horn/table-read` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/game-night` | 1 | WS3 | none | dH | public | hand: `no-store` | auth: none; no session/header/viewer/write/stream signal |
| `/api/games/$id/reviews` | 1 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/games/synapse-storm/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/games/synapse-storm/save` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/gift-exchanges` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/gifts/scheduled` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/globeset/record` | 1 | WS3 | optional | dH | private | - | viewer: uses userId |
| `/api/handle/check` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/history` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/history/position` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/homes/ai-image` | 1 | WS3 | required | dH | private | - | auth: required |
| `/api/homes/geocode` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/homes/listings/$id/roommate` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: parameter viewerId, uses userId |
| `/api/homes/roommate` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/homes/watches` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/hunt` | 1 | WS3 | required | dH | no-store | hand: `private, no-store` | write: prisma.huntProgress.upsert; viewer: uses userId |
| `/api/hunt/marker` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/jams` | 1 | WS3 | none | dH | public | hand: `no-store` | auth: none; no session/header/viewer/write/stream signal |
| `/api/jams/$slug` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/kaikai-debt/ledger` | 1 | WS3 | optional | dH | no-store | - | write: tx.kaikaiDebtEntry.createMany; viewer: uses userId |
| `/api/kaikai-debt/stream` | 1 | WS3 | optional | dH | no-store | hand: `no-cache, no-transform` | stream: ReadableStream, text/event-stream; viewer: uses userId |
| `/api/laundry-sort/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/library/collections` | 1 | WS3 | none | dH | private | - | session: getViewer(), getSession(), auth.api.getSession…; header: request.headers passed whole |
| `/api/library/file/$id` | 1 | WS3 | n/a | raw | public | hand: `public, max-age=31536000, immutable` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/library/quota` | 1 | WS3 | n/a | raw | private | - | session: getViewer(), getSession(), auth.api.getSession…; header: request.headers passed whole |
| `/api/lists` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/marathon-lists/shared/$shareId` | 1 | WS3 | none | dH | public | hand: `public, max-age=30` | auth: none; no session/header/viewer/write/stream signal |
| `/api/massive-march/signals` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId |
| `/api/messages/search` | 1 | WS2 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/messages/sidebar` | 1 | WS2 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/messages/unread-count` | 1 | WS2 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/neon-driftway/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/neon-driftway/livery` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/nightrail/tricks` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId, parameter viewerId… |
| `/api/notices/active` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/office-hours` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/office-hours/bookings/$id/ics` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/og/pf2ecal` | 1 | WS6 | none | dH | review | hand: `public, max-age=300, s-maxage=900, stale-while-revalidate=3600` | write: prisma.pf2eSession.createMany; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/og/post/$id/story` | 1 | WS6 | none | dH | public | hand: `public, max-age=600, s-maxage=3600, stale-while-revalidate=86400` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/onboarding` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/personas` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/personas/avatar/$filename` | 1 | WS3 | n/a | raw | public | hand: `public, max-age=31536000, immutable` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/pf2ecal` | 1 | WS3 | optional | dH | no-store | `{ visibility: 'private', maxAge: 5, staleWhileRevalidate: 30 }` | write: prisma.pf2eSession.createMany; viewer: uses userId, uses user |
| `/api/pf2ecal/sessions/$id/recap` | 1 | WS3 | none | dH | review | - | write: prisma.pf2eSession
    .updateMany; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/pf2ecal/sessions/archive` | 1 | WS3 | none | dH | public | `CACHE_POLICY.archive { visibility: 'public', maxAge: 300, sMaxAge: 900, staleWhileRevalidate: 3600 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/photo-of-the-day` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/predictions/$id/comments` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses session |
| `/api/preferences/muted-words` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/preferences/presence` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/presence/online-count` | 1 | WS3 | n/a | raw | public | hand: `public, max-age=30` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/profile-links` | 1 | WS3 | required | dH | no-store | - | write: tx.profileLink.createMany; viewer: uses userId |
| `/api/profile/$id/card` | 1 | WS2 | none | dH | public | hand: `public, max-age=600, s-maxage=3600, stale-while-revalidate=86400` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/profile/$id/plus` | 1 | WS2 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 30, staleWhileRevalidate: 120 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/profile/analytics` | 1 | WS2 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/profile/banner/$filename` | 1 | WS2 | n/a | raw | public | hand: `public, max-age=31536000, immutable` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/profile/me` | 1 | WS2 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/profile/top-four` | 1 | WS2 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/promo/free-month` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/qotd/answers` | 1 | WS3 | optional | dH | no-store | hand: `private, no-store` | write: prisma.qotdPrompt.updateMany; viewer: parameter viewerId, uses userId… |
| `/api/qotd/archive` | 1 | WS3 | none | dH | review | hand: `public, max-age=60, stale-while-revalidate=60` | write: prisma.qotdPrompt.updateMany; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/qotd/today` | 1 | WS3 | optional | dH | no-store | hand: `private, no-store` | write: prisma.qotdPrompt.updateMany; viewer: parameter viewerId, uses userId |
| `/api/reading/goal` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/reading/shelves` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/recipes` | 1 | WS3 | required | dH | no-store | hand: `private, no-store` | write: prisma.gameStat.upsert, prisma.gameStat.updateMany; viewer: uses userId |
| `/api/release-notes` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 600 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/reminders` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/replays/$id` | 1 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/replays/ghost` | 1 | WS3 | optional | dH | no-store | hand: `private, max-age=300` | write: prisma.gameStat.upsert, prisma.gameStat.updateMany; viewer: uses userId |
| `/api/rideshare/driver` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/rideshare/earnings` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/rideshare/geocode` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/rideshare/places` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/rideshare/reverse` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/rideshare/rides/$id/sync` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/rmharks/$id/comment` | 1 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/rmharks/$id/history` | 1 | WS2 | optional | dH | private | - | viewer: uses userId, parameter viewerId… |
| `/api/rmharks/$id/insights` | 1 | WS2 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/rmharks/$id/similar` | 1 | WS2 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId… |
| `/api/rmharks/$id/summary` | 1 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/rmhbox/history` | 1 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/rmhbox/packs` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId, uses isAdmin |
| `/api/rmhcode/auth/list` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/rmhladder/calendar` | 1 | WS3 | required | dH | private | hand: `no-store` | auth: required; viewer: uses session |
| `/api/rmhladder/export` | 1 | WS3 | required | dH | private | hand: `no-store` | auth: required; viewer: uses session |
| `/api/rmhladder/interview-reports` | 1 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/rmhladder/resume/$id` | 1 | WS3 | n/a | raw | private | hand: `private, no-store` | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/rmhtube/heat` | 1 | WS3 | required | dH | private | - | auth: required |
| `/api/rmhtube/watch-later` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/rmhtype/keystats` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/safety/pile-on` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/schedule` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 60, sMaxAge: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/scheduled/capsules` | 1 | WS3 | required | dH | no-store | hand: `private, no-store` | write: tx.rMHark.create, tx.user.update, tx.community.update…; viewer: uses userId |
| `/api/search/saved` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/series/post/$postId` | 1 | WS3 | optional | dH | private | hand: `private, max-age=30` | viewer: parameter viewerId, uses userId |
| `/api/services/rebar-reservations` | 1 | WS3 | optional | dH | private | - | viewer: uses userId |
| `/api/settings/game-assists` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/settings/play-limits` | 1 | WS3 | required | dH | no-store | - | write: prisma.userPlayLimits.update; viewer: uses session |
| `/api/shop/daily` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId |
| `/api/shop/search` | 1 | WS3 | required | dH | private | hand: `private, max-age=60` | auth: required |
| `/api/signal-forge/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/slice-it/charts/ranking` | 1 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/slice-it/daily` | 1 | WS3 | optional | dH | private | - | viewer: uses userId |
| `/api/slice-it/leaderboard` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId… |
| `/api/slice-it/packs/$id` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId… |
| `/api/slice-it/replay` | 1 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/slice-it/replay/$id` | 1 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/slice-it/setlists` | 1 | WS3 | optional | dH | private | - | viewer: uses userId, parameter viewerId… |
| `/api/slice-it/songs/$id/charts` | 1 | WS3 | optional | dH | private | - | viewer: uses userId, parameter viewerId |
| `/api/slice-it/songs/$id/comments` | 1 | WS3 | optional | dH | private | - | viewer: uses userId, parameter viewerId… |
| `/api/slice-it/songs/artist/$key` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId… |
| `/api/slice-it/songs/stream/$id` | 1 | WS3 | optional | dH | private | hand: `<dynamic>` | viewer: uses userId |
| `/api/speedrun/categories` | 1 | WS3 | optional | dH | private | - | viewer: uses isAdmin |
| `/api/speedrun/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/speedrun/replays` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/spotify/search` | 1 | WS3 | required | dH | private | - | auth: required |
| `/api/staking` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/stamps` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/stamps/image/$filename` | 1 | WS3 | none | dH | public | hand: `public, max-age=31536000, immutable` | auth: none; no session/header/viewer/write/stream signal |
| `/api/stamps/mine` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/studio/challenges` | 1 | WS3 | required | dH | no-store | hand: `private, no-store` | write: prisma.studioChallenge.updateMany, prisma.notification.update, prisma.notification.create… |
| `/api/studio/challenges/$id` | 1 | WS3 | required | dH | no-store | hand: `private, no-store` | write: prisma.studioChallenge.updateMany, prisma.notification.update, prisma.notification.create…; viewer: parameter viewerId, uses userId |
| `/api/studio/challenges/audio/$filename` | 1 | WS3 | none | dH | public | hand: `public, max-age=31536000, immutable` | auth: none; no session/header/viewer/write/stream signal |
| `/api/studio/tiers` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/study-buddy` | 1 | WS3 | required | dH | no-store | hand: `private, no-store` | write: prisma.studyBuddyRequest.updateMany; viewer: uses userId |
| `/api/study/decks/$id/review` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/study/marketplace` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session |
| `/api/temple-of-joy/efficiency` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/temple-of-joy/save` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/themes` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/themes/$id` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session |
| `/api/themes/shop` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 3600 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/tips/leaderboard` | 1 | WS3 | n/a | raw | public | hand: `public, max-age=120` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/today` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/tournaments` | 1 | WS3 | none | dH | public | `CACHE_POLICY.liveList { visibility: 'public', maxAge: 15, sMaxAge: 30, staleWhileRevalidate: 60 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/tournaments/$id` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session |
| `/api/tournaments/$id/pickem` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/translate` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: parameter viewerId, uses userId |
| `/api/trash` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/user-builds/$id/comments` | 1 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/user-builds/categories` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 3600 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/user-builds/featured` | 1 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/users/$id/wishlist` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/vega/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/velum2099/contracts` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: parameter viewerId, uses userId |
| `/api/versecraft/progress` | 1 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/versecraft/seeds` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: uses userId |
| `/api/vibe/thumb/$slug` | 1 | WS3 | n/a | raw | public | hand: `public, max-age=31536000, immutable` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/void-breaker/leaderboard` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/wager` | 1 | WS3 | optional | dH | no-store | - | write: tx.userProfile.upsert, tx.coinTransaction.create, tx.wagerMatch.update; viewer: uses session, parameter viewerId |
| `/api/wager/$id` | 1 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session |
| `/api/webrings` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/webrings/$slug/hop` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId… |
| `/api/wheel` | 1 | WS3 | optional | dH | private | - | viewer: uses session |
| `/api/when` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/when/$id` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: parameter viewerId, uses userId |
| `/api/when/$id/ics` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/worlds/festival` | 1 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 30, staleWhileRevalidate: 120 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/worlds/snapshots` | 1 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/worlds/visit/$code` | 1 | WS3 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/admin/curated-builds/image/$filename` | 0 | WS3 | none | dH | private | hand: `public, max-age=31536000, immutable` | header: header accept |
| `/api/admin/curated-builds/image/proxy` | 0 | WS3 | optional | dH | no-store | hand: `no-store` | stream: TransformStream, ReadableStream; viewer: uses session |
| `/api/admin/delight/fools` | 0 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/admin/gift-exchanges/$id/verify` | 0 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/advent` | 0 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/auth/$` | 0 | WS3 | n/a | raw | private | - | header: header origin |
| `/api/builds/consent` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/builds/cover/$file` | 0 | WS3 | n/a | raw | public | hand: `public, max-age=31536000, immutable` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/calls/history` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId… |
| `/api/calls/privacy` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/chats/$kind/$id/media` | 0 | WS2 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/chats/$kind/$id/thread/$messageId` | 0 | WS2 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId, parameter viewerId |
| `/api/communities/$slug/announcements` | 0 | WS3 | n/a | raw | public | - | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/communities/$slug/automod` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/communities/$slug/census` | 0 | WS3 | optional | dH | private | - | viewer: uses userId, parameter viewerId |
| `/api/communities/$slug/challenge` | 0 | WS3 | optional | dH | no-store | - | write: prisma.communityChallenge.updateMany, prisma.communityChallenge.update, prisma.communityFlair.create…; viewer: uses userId, parameter viewerId |
| `/api/communities/$slug/contributors` | 0 | WS3 | optional | dH | private | - | viewer: uses userId |
| `/api/communities/$slug/extras` | 0 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId |
| `/api/communities/$slug/modqueue` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/communities/$slug/onboarding` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/communities/$slug/starboard` | 0 | WS3 | optional | dH | private | - | viewer: uses userId, parameter viewerId… |
| `/api/community-pages` | 0 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId, uses isAdmin |
| `/api/community-pages/$id/revisions` | 0 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/datacenter/compute` | 0 | WS3 | optional | dH | private | `{ visibility: 'private', maxAge: 30 }` | viewer: uses userId |
| `/api/discord/activity-image` | 0 | WS3 | n/a | raw | public | hand: `<dynamic>` | auth: n/a; no session/header/viewer/write/stream signal; external: fetch() |
| `/api/discovery/surprise` | 0 | WS3 | optional | dH | private | hand: `no-store` | viewer: parameter viewerId, uses userId |
| `/api/discovery/today` | 0 | WS3 | none | dH | review | hand: `public, max-age=300, s-maxage=600` | write: prisma.dailyDigestSnapshot.upsert; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/doctrine/incidents/$id` | 0 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 3600 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/dunesday/feeds/$feedId/calendar.ics` | 0 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 600, sMaxAge: 600, staleWhileRevalidate: 3600 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/dunesday/feeds/$feedId/rss.xml` | 0 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 600, sMaxAge: 600, staleWhileRevalidate: 3600 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/economy/savings-goals` | 0 | WS3 | required | dH | no-store | hand: `private, no-store` | write: prisma.savingsGoal
      .updateMany; viewer: uses userId |
| `/api/events/$id/ics` | 0 | WS3 | n/a | raw | public | hand: `public, max-age=300` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/feedback` | 0 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/games/$id/guides` | 0 | WS3 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/gift-sub` | 0 | WS3 | n/a | raw | public | - | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/group-chats/$id/messages` | 0 | WS2 | required | dH | no-store | - | write: prisma.groupChatMember.update; viewer: uses session, parameter viewerId |
| `/api/group-chats/$id/stream` | 0 | WS2 | required | dH | no-store | hand: `no-cache, no-transform` | write: redisPublish(); stream: ReadableStream, text/event-stream; viewer: uses session |
| `/api/guides/$id` | 0 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session |
| `/api/handles/change` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/handles/history` | 0 | WS3 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/handles/impersonation` | 0 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/health` | 0 | WS3 | n/a | raw | public | hand: `no-store` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/kaikai-debt` | 0 | WS3 | none | dH | review | `{ visibility: 'public', maxAge: 5, sMaxAge: 5, staleWhileRevalidate: 30 }` | write: tx.kaikaiDebtEntry.createMany; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/lists/$id` | 0 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses session |
| `/api/massive-march/campaigns` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/memory` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/messages/$conversationId/mutations` | 0 | WS2 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/messages/$conversationId/thread` | 0 | WS2 | required | dH | private | - | auth: required; viewer: parameter viewerId, uses userId |
| `/api/moderation/block` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/moderation/mute` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/news/approve` | 0 | WS3 | n/a | raw | public | hand: `no-store, max-age=0` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/news/reject` | 0 | WS3 | n/a | raw | public | hand: `no-store, max-age=0` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/office-hours/host/$id/summary` | 0 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 60, sMaxAge: 60, staleWhileRevalidate: 300 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/og/app/$appId` | 0 | WS6 | none | dH | public | hand: `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/og/blog/$slug` | 0 | WS6 | none | dH | public | hand: `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/og/game/$gameId` | 0 | WS6 | none | dH | public | hand: `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/og/job/$jobId` | 0 | WS6 | none | dH | public | hand: `public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/og/post/$id` | 0 | WS6 | none | dH | public | hand: `public, max-age=600, s-maxage=3600, stale-while-revalidate=86400` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/og/profile/$id` | 0 | WS6 | none | dH | public | hand: `public, max-age=600, s-maxage=3600, stale-while-revalidate=86400` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/og/replay/$id` | 0 | WS6 | none | dH | public | hand: `public, max-age=31536000, immutable` | auth: none; no session/header/viewer/write/stream signal; external: fetch(), safeFetch() |
| `/api/onboarding/first-week` | 0 | WS3 | required | dH | no-store | - | write: prisma.userQuest.createMany; viewer: uses session |
| `/api/pf2ecal/calendar.ics` | 0 | WS3 | none | dH | review | `{ visibility: 'public', maxAge: 900, sMaxAge: 900, staleWhileRevalidate: 3600 }` | write: prisma.pf2eSession.createMany; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/pools` | 0 | WS3 | optional | dH | private | - | viewer: parameter viewerId |
| `/api/pools/$id` | 0 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId |
| `/api/predictions/$id` | 0 | WS3 | optional | dH | private | - | viewer: uses session, parameter viewerId |
| `/api/preferences/conversation` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/profile/$id/endorsements` | 0 | WS2 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/profile/$id/followers` | 0 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/profile/$id/following` | 0 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/profile/$id/guestbook` | 0 | WS2 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/profile/$id/kudos` | 0 | WS2 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/profile/$id/likes` | 0 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId |
| `/api/profile/$id/pronunciation` | 0 | WS2 | none | dH | public | hand: `public, max-age=31536000, immutable` | auth: none; no session/header/viewer/write/stream signal |
| `/api/profile/$id/rmharks` | 0 | WS2 | none | dH | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole; viewer: parameter viewerId… |
| `/api/profile/$id/shelves` | 0 | WS2 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/profile/$id/stamps` | 0 | WS2 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/profile/$id/webrings` | 0 | WS2 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId… |
| `/api/profile/layout` | 0 | WS2 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/ranked/$game/leaderboard` | 0 | WS3 | none | dH | public | `{ visibility: 'public', maxAge: 30, sMaxAge: 60 }` | auth: none; no session/header/viewer/write/stream signal |
| `/api/reading/highlights` | 0 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/ready` | 0 | WS3 | n/a | raw | public | hand: `no-store` | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/recommend` | 0 | WS3 | optional | dH | private | `{ visibility: 'private', maxAge: 60 }` | viewer: uses userId |
| `/api/requests/$id` | 0 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId |
| `/api/rmharks/$id/comment/$commentId/like` | 0 | WS2 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/rmharks/$id/comment/$commentId/repost` | 0 | WS2 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/rmharks/$id/embed` | 0 | WS2 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId |
| `/api/rmharks/$id/like` | 0 | WS2 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/rmharks/$id/quotes` | 0 | WS2 | optional | dH | private | hand: `private, no-store` | viewer: parameter viewerId, uses userId… |
| `/api/rmharks/$id/repost` | 0 | WS2 | none | dH | public | - | auth: none; no session/header/viewer/write/stream signal |
| `/api/rmhbox/stats` | 0 | WS3 | n/a | raw | private | - | header: request.headers passed whole |
| `/api/rmhladder/referrals` | 0 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/rmhladder/resume` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/rmhladder/searches` | 0 | WS3 | n/a | raw | private | - | session: getSession(), auth.api.getSession, getSession; header: request.headers passed whole |
| `/api/rmhtube/oembed` | 0 | WS3 | n/a | raw | no-store | hand: `<dynamic>` | stream: TransformStream, ReadableStream |
| `/api/saves/folders` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/schedule/admin` | 0 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/shop/loadouts` | 0 | WS3 | required | dH | private | hand: `private, no-store` | auth: required; viewer: uses userId |
| `/api/slice-it/admin/review` | 0 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/slice-it/admin/takedown` | 0 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/slice-it/charts` | 0 | WS3 | optional | dH | private | - | viewer: uses userId |
| `/api/slice-it/charts/$id/reviews` | 0 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId |
| `/api/slice-it/charts/$id/revisions` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/slice-it/shelves` | 0 | WS3 | optional | dH | private | - | viewer: parameter viewerId, uses userId |
| `/api/slice-it/uploader-stats` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/spaces` | 0 | WS3 | n/a | raw | public | - | auth: n/a; no session/header/viewer/write/stream signal |
| `/api/speedrun/runs` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses userId |
| `/api/speedrun/verify` | 0 | WS3 | admin | dH | no-store | - | auth: admin (low traffic, must be fresh) |
| `/api/studio/overview` | 0 | WS3 | required | dH | private | - | auth: required; viewer: uses session |
| `/api/unfurl` | 0 | WS6 | optional | dH | no-store | hand: `public, max-age=86400, stale-while-revalidate=86400` | stream: TransformStream, ReadableStream |
| `/api/versecraft/world` | 0 | WS3 | n/a | raw | review | - | write: prisma.versecraftWorld.update; viewer-independent GET that writes: idempotent seed or counter? (human review) |
| `/api/vibe/pkg/$file` | 0 | WS3 | n/a | raw | public | hand: `public, max-age=31536000, immutable` | auth: n/a; no session/header/viewer/write/stream signal |


## Appendix B — apiCache consumers

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

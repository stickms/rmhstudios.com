# WS2 — Feed, social graph, notifications, messages — results

Stage A only (WS0_READY never appeared). Seeded scratch DB (3k users, 60k posts, heavy user following 2,000), commit e97b5192 + merge of upstream 796295bd. Environment deviations: no WS0 harness; tsc native only completes with `GOMAXPROCS=2 GOMEMLIMIT=3GiB ... --singleThreaded` (default run is OOM-killed, exit 137, on this box).

## Shipped
| # | Change | Route(s) | Metric | Before | After | Commit | Correctness test |
|---|---|---|---|---|---|---|---|
| 1 | SECURITY: keyset `OR` no longer overwrites audience `OR`; Following surface applies CIRCLE/SUPPORTERS/repost audience rules | `/api/rmharks` (For-You page 2+, Following) | planted PRIVATE/CIRCLE/FOLLOWERS rows leaked (exact) | 3 (page 2), 1 (Following) | 0 | 23a13572 | lib/feed/__tests__/timeline-audience.test.ts (7/8 fail on parent) |
| 2 | SECURITY: profile Likes tab + profile reposts get the full visibility check (deleted, audience, blocks, paywall lock); Likes uses lite include + bounded reactions (no 4 COUNTs per post, no unbounded reactions include) | `/api/profile/:id/likes`, `/api/profile/:id/rmharks` | leaked posts (exact); latency of Likes not measured | all liked posts shown | filtered in the query | second WS2 commit (`git log`) | lib/feed/__tests__/visible-post-where.test.ts |

## Rejected (measured, no win)
none

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| 1 | Signed-in first-page cache (`feed:v2`) has no invalidation: blocks/mutes/deletes/visibility stale up to 60s (TTL 15 + SWR 45), violating 03-rules 1.3 | Design drafted, not implemented: serve-time reconcile of the cached page (hidden set, one PK query for deleted/audience, follow/circle checks only when needed, muted words/tags applied at serve) keeping L2 | next pass |
| 2 | mention-search loads ALL followers/following of the viewer (unbounded) | plan: bound to the <=50 candidates | next pass |
| 3 | `/messages/:id/read` and `/messages/read-all` never adjust the `dm:unread:<uid>` Redis counter: badge stale up to 60s; read-all also runs two queries | plan: adjust by count / drop key | next pass |
| 4 | SSE `rmhark.created`: `JSON.stringify` per connection per event | plan: stringify once, splice `delivery` | next pass |
| 5 | Notifications list joins `userDisplaySelect` per actor; post GET / profile polls use `_count.votes` instead of `voteCount`; comment GET joins user + unbounded `reactions` + `_count.views` per comment | latency claims need the harness | WS0 |
| 6 | `messages/search` ILIKE `%q%` content scan (rate-limited 30/min, conversations `take: 30`, snippet query has no `take`; upstream only added `isBot`) | needs trigram index | WS4 |
| 7 | followers/following lists page by `createdAt lt` only (ties skip rows) | correctness, low priority | — |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS3 | lib/cache.ts (`maxEntries=1000`, FIFO) | every per-user cache (following ids, hidden, signals, feed pages, display per author) shares 1000 slots; thrashes with a few hundred active users | static |
| coordinator | app/routes/api/rmharks/$id/repost.ts | repost does not check the post's audience | static |
| coordinator | lib/circle.server.ts | circle writes invalidate nothing (needed if circle set is ever cached) | static |
| note | docker-compose.yml:248 | prod runs 2 Nitro workers, each with its own L1; L2 matters for feed-cache hit rate | static |

## Budget status (owned routes, after)
Not measured (no harness). Cold For-You assemble, heavy user: 14 Prisma ops (0 when cached). Following: 4 (+1 circle read after commit 1).

## Rule objections
none

## Commands
Probe: getTimeline as heavy user with and without a cursor, via `pnpm exec tsx` against the seeded DB. Tests: `pnpm exec vitest run lib/feed/__tests__/`.

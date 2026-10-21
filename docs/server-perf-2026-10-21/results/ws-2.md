# WS2 — Feed, social graph, notifications, messages — results

Stage A only (WS0_READY never appeared). Seeded scratch DB (3k users, 60k posts, heavy user following 2,000), commit e97b5192 + merge of upstream 796295bd. Environment deviations: no WS0 harness; tsc native only completes with `GOMAXPROCS=2 GOMEMLIMIT=3GiB ... --singleThreaded` (default run is OOM-killed, exit 137, on this box).

## Shipped
| # | Change | Route(s) | Metric | Before | After | Commit | Correctness test |
|---|---|---|---|---|---|---|---|
| 1 | SECURITY: keyset `OR` no longer overwrites audience `OR`; Following surface applies CIRCLE/SUPPORTERS/repost audience rules | `/api/rmharks` (For-You page 2+, Following) | planted PRIVATE/CIRCLE/FOLLOWERS rows leaked (exact) | 3 (page 2), 1 (Following) | 0 | 23a13572 | lib/feed/__tests__/timeline-audience.test.ts (7/8 fail on parent) |
| 2 | SECURITY: profile Likes tab + profile reposts get the full visibility check (deleted, audience, blocks, paywall lock); Likes uses lite include + bounded reactions (no 4 COUNTs per post, no unbounded reactions include) | `/api/profile/:id/likes`, `/api/profile/:id/rmharks` | leaked posts (exact); latency of Likes not measured | all liked posts shown | filtered in the query | second WS2 commit (`git log`) | lib/feed/__tests__/visible-post-where.test.ts |
| 3 | SECURITY: repost required no visibility on the post | `POST /api/rmharks/:id/repost` | reposts of invisible posts accepted | 6 of 6 invisible cases accepted | 404, 0 writes (+1 read) | repost commit | lib/feed/__tests__/repost-visibility.test.ts — exact |
| 4 | Signed-in first-page cache reconciled at serve time (blocks, mutes, deletes, audience, unfollow, circle, muted tags/words, unlock) | `/`, `/api/rmharks` signed-in | stale permission/moderation window; Prisma ops on warm serve | up to 60s; 0 ops | 0s; For-You 1 op, Following 2 ops (cold unchanged 14 / 5) | cache commit | lib/feed/__tests__/timeline-cache-reconcile.test.ts (10/12 fail on parent) — exact |
| 5 | Comment translate: dropped public 1h/24h cache; fresh deleted/edited/post-visibility check on every request; memo keyed by text hash, bounded | `GET /api/comments/:id/translate` | removed comment still served | up to 24h (shared) | 0 | translate commit | lib/feed/__tests__/comment-translate.test.ts (4/5 fail on parent) — exact; +1 indexed read per hit |
| 6 | Circle edits drop affected members' cached feed pages; documented that removal is immediate via reconcile | `lib/circle.server.ts` | invalidations on circle change | 0 | old+new members | circle commit | lib/feed/__tests__/circle-invalidation.test.ts |
| 7 | DM unread badge: read / read-all drop `dm:unread:<uid>`; read-all 2 statements -> 1 | `POST /api/messages/:id/read`, `/read-all` | badge stale after mark-read; statements | up to 60s; 2 | 0s; 1 | dm commit | lib/feed/__tests__/dm-unread-counter.test.ts — exact |

## Rejected (measured, no win)
none

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| 2 | mention-search loads ALL followers/following of the viewer (unbounded) | plan: bound to the <=50 candidates | next pass |
| 4 | SSE `rmhark.created`: `JSON.stringify` per connection per event | plan: stringify once, splice `delivery` | next pass |
| 5 | Notifications list joins `userDisplaySelect` per actor; post GET / profile polls use `_count.votes` instead of `voteCount`; comment GET joins user + unbounded `reactions` + `_count.views` per comment | latency claims need the harness | WS0 |
| 6 | `messages/search` ILIKE `%q%` content scan (rate-limited 30/min, conversations `take: 30`, snippet query has no `take`; upstream only added `isBot`) | needs trigram index | WS4 |
| 7 | followers/following lists page by `createdAt lt` only (ties skip rows) | correctness, low priority | — |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS3 | lib/cache.ts (`maxEntries=1000`, FIFO) | every per-user cache (following ids, hidden, signals, feed pages, display per author) shares 1000 slots; thrashes with a few hundred active users | static |
| note | docker-compose.yml:248 | prod runs 2 Nitro workers, each with its own L1; L2 matters for feed-cache hit rate | static |

## Budget status (owned routes, after)
Not measured (no harness). Cold For-You assemble, heavy user: 14 Prisma ops (0 when cached). Following: 4 (+1 circle read after commit 1).

## Notes
- Anonymous first page (`timeline:anon:v2`, 30s + 120s SWR) is not reconciled: a removed public post can be served up to 150s from the origin (edge cache likely dominates). Not changed.
- Comment GET routes do not check the parent post's audience (translate now does). Candidate for a follow-up.
- Scratch probe files deleted; scratch DB rmh_ws2_a left in place.

## Rule objections
none

## Commands
Probe: getTimeline as heavy user with and without a cursor, via `pnpm exec tsx` against the seeded DB. Tests: `pnpm exec vitest run lib/feed/__tests__/`.

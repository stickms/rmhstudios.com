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
| 8 | SECURITY: every comment read applies the parent post's visibility (not deleted, audience, hidden author) via `canReadThread`; 404 otherwise. Covers thread GET, comment likers GET, comment reposters GET, thread summary, comment translate | `GET /api/rmharks/:id/comment`, `/comment/:cid/like`, `/comment/:cid/repost`, `/rmharks/:id/summary`, `/api/comments/:cid/translate` | non-visible threads served; ops on public post thread GET | any post's thread readable by id | 404; +1 read (post row) on thread GET, +1 on FOLLOWERS/CIRCLE/SUPPORTERS (targeted follow/circle read), 0 extra on summary/translate | circle-of-round-3 commit | lib/feed/__tests__/comment-thread-visibility.test.ts (19 of 25 fail on parent) — exact |
| 9 | SECURITY: comment writes (create/reply incl. dev-API `createComment`, like, repost, react, view), post likers/reposters GET and `/api/v1/posts/:id/comments` GET apply `canReadThread`. Adding needs a readable thread; undo (unlike, un-repost, un-react) stays allowed, un-react returns no roster; `hide` exempt (post-author-only, reveals nothing) | `POST /rmharks/:id/comment`, `/comment/:cid/{like,repost,view}`, `/comments/:cid/react`, `GET /rmharks/:id/{like,repost}`, `GET /v1/posts/:id/comments` | invisible threads writable/readable | writable | 404, 0 writes; ops: comment POST +0 public (+1 targeted non-public), comment like/repost/view +1 (comment->post, adds only), react +0 public, post likers/reposters +1, v1 GET +0 public (+1 targeted) | round-4 commit | lib/feed/__tests__/comment-write-visibility.test.ts (43 of 58 fail on parent) — exact |
| 10 | SECURITY: private-community posts are members-only on every post-level read (WS4 rule: any `community_member` row). `canViewPost` now requires `communityId` (tsc forced all 9 callers), `communityVisibleWhere` (relation `isNot`, no `OR` key, verified on the seeded DB) applied in `viewerVisiblePostWhere`, profile lists, tags, explore, quotes; cached feed pages drop any post with a `communityId` | by id (`/rmharks/:id`, history, translate, take, embed, notes), profile posts, likes, reposts, comments (all gates), tags, explore, quotes, `feed:v3` | private-community posts readable by non-members | readable | 404 / not listed; ops: +0 for ordinary posts (communityId null), +1 `community` read per post-level check on a community post, query-side fragment is an anti-join in the same statement (0 extra ops); timeline unchanged (already `communityId: null`, anon partial index untouched); reconcile +0 | community commit | lib/feed/__tests__/private-community-posts.test.ts (8 of 12 fail on parent) + reconcile case |
| 11 | SECURITY: post-level writes and remaining readers apply the thread rule (deleted, audience, hidden author, private community). Writes: like, react, bookmark, save, poll vote, unlock (it returned ANY post's text for free/unlocked posts and charged for unreadable ones), quote; @mention notifications no longer carry a post's text to users who can't read it. Readers: bookmarks list, saves hydrate, thread by id (had no check), v1 `/posts/:id` and `/me/bookmarks`, oEmbed/embed/OG/story/post-page meta (private community), `ask-feed`, recommend, digest, site-wide post search (SQL excludes private communities unless a communityId scope is given). Undo (unlike, un-react, un-bookmark, un-vote, unsave) stays allowed; un-react returns no roster. Left ungated on purpose: post view counter (see Notes), report | many | invisible posts writable/readable | writable/readable | 404 / tombstone / filtered; ops: like, react, bookmark +0 on public posts (columns added to the existing select), vote +1 on add (PK read), unlock +0, saves +1 on add, quote +0, mentions +1 read per fan-out, bookmarks/hydrateSaves/thread/v1-bookmarks +0 (anti-join in the same statement), v1 post +0, search +0 (extra predicate) | round-5 commit | lib/feed/__tests__/post-write-and-reader-visibility.test.ts (44 of 66 fail on parent) |

## Stage B (partial: in-process probes on the seeded `rmh_ws2` database, not the production-build harness)

Method: `tsx` script calling `getTimeline` as the heavy user (2,000 follows), warm Postgres and Redis, 60-200 iterations, per-request query count from `withQueryBudget`. Evidence type: `latency` (hardware-dependent, one process, no concurrency).

| Path | Ops | p50 | p95 |
|---|---:|---:|---:|
| For-You first page, cache hit, **with** serve-time reconcile (feed:v3) | 1 | 1.07 ms | 2.8 ms |
| Following first page, cache hit, with reconcile | 2 | 1.62 ms | 8.2 ms |
| For-You, bench user, cache hit, with reconcile | 1 | 0.95 ms | 3.3 ms |
| For-You cold assemble (page key dropped; per-user sub-caches warm) | 5 | 21.3 ms | 47.9 ms |
| Following cold assemble | 5 | 25.2 ms | 66.5 ms |

So the reconcile costs about 1 ms and 1-2 ops on a hit and keeps the cache about 20x cheaper than assembling; the pre-fix hit was 0 ops. `/tag/tag1` as the heavy user: 120 ms / 3 ops vs anonymous 77 ms / 2 ops.

**Baseline lead: `rmheet LEFT JOIN LATERAL user/profile` (249 slow runs, avg 450 ms).** Not the timeline: the heavy user's For-You / Following queries run in about 5 ms each. The shape (rmheet + lateral author display, hashtag filter, audience `OR`) is the **tag feed** (`lib/tags.server.ts`, `/tag/:tag`): `EXPLAIN (ANALYZE, BUFFERS)` on `rmh_ws2` shows 3,993 posts for `tag1`, each fetched by primary key (16,013 buffer hits) and then top-N sorted, 14 ms anonymous and 41 ms with the heavy user's audience `OR` + the 2,000-id `IN` list, which grows to the observed hundreds of ms under c=16 on 4 shared cores. The fix is a query-shape/index change on `post_hashtag` (keyset by `(hashtagId, createdAt desc)` so the scan stops at 21 rows), which is WS8's (tag-feed ownership), not changed here.

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
- `POST /rmharks/:id/view` stays ungated: it answers a constant `{success:true}`, reveals nothing, is IP-rate-limited and buffered in Redis; a DB gate would add a primary-key read to every impression on the hottest write path. Worst case is a counter bump on an id the caller already holds. `POST /moderation/report` stays ungated: moderation intake must work for content the reporter may have only just lost access to, and it echoes nothing.
- Not audited: search inside a community (`communityId` scope: caller/WS4's access check), `lib/feed/rss.server.ts` (WS6; already `communityId: null`), own-data aggregates (wrapped, recap, bio, export).
- Scratch probe files deleted; scratch DB rmh_ws2_a left in place.

## Rule objections
none

## Commands
Probe: getTimeline as heavy user with and without a cursor, via `pnpm exec tsx` against the seeded DB. Tests: `pnpm exec vitest run lib/feed/__tests__/`.

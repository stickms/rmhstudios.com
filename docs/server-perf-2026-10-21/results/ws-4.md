# WS4 — Database: queries, indexes, read-replica adoption, search — results

Worktree baseline taken 2026-10-21 (Stage A static analysis; DB checks on `rmh_ws4`, a copy of `rmh_perf_template`), base commit e97b5192. Environment deviations: **WS0's `WS0_READY` marker never appeared**, so the harness (`server-bench.mjs`, `Server-Timing`, `x-rmh-queries`) was not used. Every Shipped row is therefore `exact` evidence (query counts, columns, cache keys, which client a query uses) except the messages/search row, whose latency is a single indicative run. No migration or index was added (see Rejected).

## Shipped
| # | Change | Route(s) | Metric | Before | After | Commit | Correctness test | Evidence |
|---|---|---|---|---:|---:|---|---|---|
| 1 | `/news` list + RSS select list columns (no `content`), on `prismaRead` | `/news`, `/news/rss.xml` | columns read per article; markdown body in SSR payload | all 19 cols (body twice for featured) | 13 cols, no body | 2588a1c7 (WS1 independently landed 4fca3ced on the same query; merged cleanly) | `lib/__tests__/news-list-select.test.ts` | exact |
| 2 | Library shelf query drops per-book `toc` JSON | `/library` | toc outlines in SSR payload | every upload's outline | none (reader/admin keep it) | f027960f | `lib/library/__tests__/shelf-select.test.ts` | exact |
| 3 | Friends leaderboard + tag feed use the shared capped/cached `getFollowingIds`; tag feed reads hidden + follows in parallel; player leaderboard on `prismaRead` | `/api/leaderboards/players?scope=friends`, `/tag/$tag`, `/api/tags/$tag` | direct unbounded `follow.findMany` per cold read | 1 (2,000 rows for the heavy user) | 0 (cached list, cap 5,000) | aeacd1b9 | `lib/__tests__/ws4-follow-reads.test.ts` | exact |
| 4 | Explore per-viewer follow list via `getFollowingIds` | `/explore`, `/api/explore` | direct unbounded `follow.findMany` per signed-in view | 1 | 0 | 45bb8318 | same test | exact |
| 5 | All search corpora + vector neighbours on `prismaRead` | `/api/search`, `/api/users/search` | queries on the primary | 6+ per search | 0 (replica when configured; identical otherwise) | 0d4784ad | `lib/search/__tests__/read-path.test.ts` (primary client throws) | exact |
| 6 | User-builds list + featured select card columns (not `include`) | `/api/user-builds`, `/featured` | scalar columns per card | 22 (incl. `readme`) | 15 | eabef18f | `lib/__tests__/user-builds-list-select.test.ts` | exact |
| 7 | Board page reads on `prismaRead` (generic GameStat boards, ranked ladder + ranked leaderboard route); `rankOf` stays primary | `/api/games/$id/leaderboard`, `/api/ranked/$game/leaderboard` | reads on primary | all | 0 | 1db15dac | `lib/__tests__/ws4-board-reads.test.ts` | exact |
| 8 | Admin bot activity counts on `prismaRead` | `/api/admin/bots` | reads on primary | 8 | 0 | eb7187c6 | `lib/rmhark-ai/bot-stats-read-path.test.ts` | exact |
| 9 | `GET /api/feedback` bounded to newest 100 + column select | `/api/feedback` | rows read per call | unbounded (all rows + user join) | ≤ 100 | defc0ecb | `lib/__tests__/feedback-list-bound.test.ts` | exact |
| 10 | Library cover variants: snap to WS6's width ladder, single-flight, CPU gate | `/api/library/cover/$id?w=` | R2 GET + sharp encode for a sweep of 60 distinct widths | 60 | ≤ 27 (ladder) | cc5547fa | `lib/__tests__/library-cover-variants.test.ts` | exact |
| 11 | Messages search snippet: one `DISTINCT ON` query bounded to the ≤30 matched conversations (was every matching message, de-duplicated in Node) | `/api/messages/search` | snippet query on seeded DB, 30 largest conversations | 16–29 ms, all matching rows transferred | 2–3 ms, ≤ 30 rows | ea2597d9 | row counts/snippets identical for `message #12`, `a_c`, `50%` against the old Prisma query on `rmh_ws4`; equal-`createdAt` ties pick either row as before | latency (single run, indicative) |

## Rejected (measured, no win)
| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---:|---:|---|
| R1 | Keyset pagination (and a server cache) for `posts`/`users` sitemap chunks | `/sitemaps/posts-N.xml` | `EXPLAIN ANALYZE` of the posts chunk query (200k posts, 40k per chunk) | offset 150,000: 364 ms | offset 0: 396 ms | Cost is the 40k rows each chunk must return plus the 15–20k-row join, not the offset skip: the deep page is no slower than the first. Keyset would save nothing, and a server cache of a 40k-entry chunk is ~4 MB of L1 per chunk. The route is already edge-cached 1 h. Users chunk: 21 ms. |
| R2 | `pg_trgm` GIN on `direct_message.content` for the messages-search conversation match | `/api/messages/search` | `EXPLAIN ANALYZE` of the `EXISTS … ILIKE` for the busiest user (20 conversations) | 0.3 ms (nested-loop semi join, starts from the viewer's conversations via the participant index) | n/a | Scoped to the viewer's own conversations, so it never scans the 50k-row table; an index would only add write cost to a high-volume table. |
| R3 | Parallelise `getCommunity` (member + announcements) | `/api/communities/$slug` | round trips | 3 serial | 2 | One RTT on a local socket is not measurable; reverted unmerged. Worth re-trying only against a remote DB. |
| R4 | Post search recall query: new index | `/api/search` posts | `EXPLAIN ANALYZE` | 3.7 ms, all five predicates are Bitmap Index Scans (`rmheet_content_tsv_idx`, `rmheet_content_norm_trgm_idx`) | n/a | Already index-backed. Caveat: the seeded post content is synthetic, so the hit path (heap fetch + `ts_rank` sort) was not exercised. |

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| D1 | Doc corpora in search (`blog`, `news`, `build`) OR an unindexable expression (`array_to_string(tags)`, `left(content,4000)`) into the predicate, so the planner must seq-scan | Seed has no blog/news/build rows, so no EXPLAIN is possible | Seed those tables (a few thousand rows), `EXPLAIN` the `searchDocs` queries; then either index the expressions or split the OR |
| D2 | `listAllBooks` / `/library` shelf still reads every visible upload (no `take`) | Needs UI paging; changes what the page shows | A product decision on shelf pagination |
| D3 | Remaining ungated `optimizeImage` request-path callers: `api/albums/asset/$.ts` (public, `w` up to 4096, no cache at all), `api/admin/curated-builds/image/$filename.ts`, and the upload ingest paths (`lib/media/ingest.server.ts`, avatar/banner/emoji uploads) | The albums route allows widths above the ladder maximum (2048), so snapping would shrink images; gating the upload paths changes their failure mode to 503. Production serves albums from the CDN, so the route is a dev/no-CDN fallback | Decide the ladder maximum for albums; decide upload-side 503 semantics (WS6) |
| D4 | Custom-feed view (`lib/discovery/feeds.server.ts getFeedView`): keyword feeds do `content ILIKE` over a 7-day window; four independent reads run in sequence | No custom-feed rows in the seed | Seed custom feeds; `EXPLAIN` the keyword branch |
| D5 | Bot admin: bot list pulls full `botPersona` text for up to 1,000 bots | Admin-only, fetched once on mount | Not worth a change |
| D6 | The ~dozen local-only `apiCache` invalidations | Routed to WS3 (bridge in `lib/cache.ts`) | WS3 |
| D7 | All baseline-driven work (`baseline-querylog.txt`, routes over query budget) and interleaved before/after latency | `WS0_READY` never appeared | Run Stage B once the harness lands |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS6 | `app/routes/api/albums/asset/$.ts`, `lib/media/ingest.server.ts` | See D3 | read of the code |
| coordinator / WS2 | `lib/feed/audience.server.ts` (`viewerVisiblePostWhere`, `canViewPost`), `app/routes/api/rmharks/$id.ts`, profile post lists | Post-level reads do not consider `community.isPrivate`: a post in a private community is still reachable by id / profile list for a non-member. Out of the community read paths fixed below | read of the helpers |

(The two handoffs from the first report, private-community exposure and the user-builds `where.OR` overwrite, are fixed; see below.)

## Correctness fixes (round 2)
Not performance work; both decided by the user.

| # | Fix | Commit | Test |
|---|---|---|---|
| C1 | **Private communities are members-only on every community read path.** A non-member or anonymous viewer gets the codebase's existing outcome for a private resource (`requireReadable`): null / 404, indistinguishable from a missing community. Paths: `getCommunity` and `getCommunityFeed` (SSR `/c/$slug` loader, `/api/communities/$slug`, `/feed` incl. cursor pages, where the membership read previously ran only on page 1), `getCommunityExtras`, `/members`, `/announcements` (GET moved onto `defineHandler` to read the viewer), `/api/community-pages` (list and one page, by slug or id) and `/community-pages/$id/revisions`. `listCommunities` (the `/communities` loader and `/api/communities`) lists a private community only to its members, anonymous sees public ones, as search and the sitemap (`isPrivate: false`) do. `POST /join` no longer lets a non-member join a private community (there is no invite flow; members can still leave). No HTTP cache covered these (none declared public); the `apiCache` entries behind them are keyed by community id and only reached after the gate. Two `PUBLIC_BUT_NOT_CACHED` entries came out of `api-cache-policy.test.ts` because their handlers now read the viewer. | 2eb6725b | `lib/__tests__/private-community-access.test.ts`: 9 of 10 cases fail on the parent (10th is the public-community control) |
| C2 | `GET /api/user-builds`: `search` + `cursor` + `sort=popular|views` no longer lets the cursor overwrite the search filter (`where.AND` of the two OR groups). | 46bbfb39 | `lib/__tests__/user-builds-search-cursor.test.ts` |

## Budget status (owned routes, after)
Not measured: no harness. Query counts for touched routes are unchanged or lower (rows 3, 4, 5, 7, 8 remove queries from the primary; no route gained a query).

## Rule objections
None. One note on 03-rules §4.6: the messages-search snippet uses a parameterised `$queryRaw` because Prisma cannot express `DISTINCT ON` with a bound; the comparison above (16–29 ms vs 2–3 ms) is the justification, from a single run.

## Commands
```bash
# unit evidence
pnpm exec vitest run lib/__tests__/news-list-select.test.ts lib/library/__tests__/shelf-select.test.ts \
  lib/__tests__/ws4-follow-reads.test.ts lib/search/__tests__/read-path.test.ts \
  lib/__tests__/user-builds-list-select.test.ts lib/__tests__/ws4-board-reads.test.ts \
  lib/rmhark-ai/bot-stats-read-path.test.ts lib/__tests__/feedback-list-bound.test.ts \
  lib/__tests__/library-cover-variants.test.ts
# DB checks
createdb -h localhost -U postgres -T rmh_perf_template rmh_ws4      # PGPASSWORD=password
psql -d rmh_ws4 -f sm.sql    # EXPLAIN (ANALYZE, BUFFERS) of the sitemap posts/users chunk queries, offset 150000 vs 0
psql -d rmh_ws4 -f se.sql    # post search recall query
psql -d rmh_ws4 -f ms.sql    # messages-search conversation match
# snippet equivalence: old prisma.directMessage.findMany({distinct}) vs the DISTINCT ON query, same 30 conversations
```

## Feature: invites & join requests (private communities)

Decision: private communities are **listed + locked**. Metadata (name, icon, colour,
description, member count, lock badge) is public; posts, members, announcements, pages,
revisions, events and flairs stay members-only (404 for non-members). Out of the sitemap;
the locked page and the invite page are `noindex`.

**Models** (`prisma/migrations/20261022000000_community_invites_join_requests`, additive,
`check-migration-safety` clean, BigInt identity PKs per the new-table policy):
`CommunityInvite` (unique 192-bit `code`, `maxUses`, `uses`, `expiresAt`, `revokedAt`,
index on `communityId`), `CommunityJoinRequest` (`@@unique([communityId, userId])`,
status PENDING/APPROVED/DENIED, `message` <= 280, `decidedById/At`).

**Routes**: `POST/GET /api/communities/$slug/invites`, `DELETE .../invites/$id`;
`POST/DELETE .../join-request`; `GET .../join-requests`, `POST .../join-requests/$id`;
`POST .../join` takes `{ invite }`. All `defineHandler` + zod + rate limits.
**Pages**: `/c/$slug` (locked preview), `/c/$slug/invite/$code`. **UI**: locked cards in
`CommunitiesColumn`, Requests and Invites tabs in the mod tools (the existing mod queue
is a post-report model, so requests got their own tab).

**Permission**: the existing `requireMod` check (owner + moderators) reused for invites
and request decisions.
**Notifications**: `createNotification` type SYSTEM (entityType `community-join-request`
to mods, `community-join-decision` to the requester), so the user's system preference applies.
**Re-request policy**: a denied user may ask again after 7 days; the single row is reset to
PENDING (keeps the unique key and cooldown stops re-queueing in front of the same mods).
**Caches**: none added. `/api/communities` GET has no cache policy and the list carries
per-viewer member/request state, so it is never shared-cached.
**Tests**: `lib/communities/__tests__/invites-and-requests.test.ts`, `locked-seo.test.ts`
(sitemap exclusion, noindex heads), `invites-concurrency.test.ts` (opt-in via
`RMH_TEST_DATABASE_URL`; 40 concurrent accepts of maxUses=5 admit exactly 5; green on
`rmh_ws4`), `lib/__tests__/private-community-access.test.ts` (locked preview metadata only,
content paths 404).

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
| coordinator / product | `lib/community.server.ts` `getCommunityFeed`, `listCommunities`, `app/routes/api/communities/$slug/feed.ts` | Neither the community feed nor the browse list checks `isPrivate`/membership, although `isPrivate` exists and `lib/search/posts.server.ts` and the sitemap exclude private communities. Possible content exposure; may be intended (private = invite-only to join), not verified | read of the handlers |
| WS3 | `app/routes/api/user-builds.ts` GET | `search` + `cursor` + `sort=popular` overwrite each other's `where.OR` (existing bug, not perf) | read of the handler |
| WS6 | `app/routes/api/albums/asset/$.ts`, `lib/media/ingest.server.ts` | See D3 | read of the code |

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

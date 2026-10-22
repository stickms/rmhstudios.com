# WS6 — CPU-bound endpoints — results

Second pass 2026-10-22 on the seeded dataset (200k posts, 20k users), merged at 8b75c8886. Worktree baseline taken 2026-10-21 (Stage A, in-process timing under the shared build lock), base commit e97b5192, merged with `claude/focused-darwin-bmii1v` @ 796295bd. Environment deviations: **No production build or HTTP-level numbers** (sitemap/RSS/oembed rows used the seeded dataset in-process). Every latency figure below is an in-process measurement on the shared 4-core box (glibc, so `sharp.concurrency()` is 1 here; production is Alpine/musl where it defaults to the core count). Compare only within a row.

## Shipped
| # | Change | Route(s) | Metric | Before | After | Evidence | Commit | Correctness test |
|---|---|---|---|---:|---:|---|---|---|
| 1 | **Superseded by main** (`dedupeOgRender` + `svgToPng`, 88de16e44; my `rasterizeSvg` was removed in cf817ad07). Kept from this row: `loadSystemFonts:false` on `svgToPng` (589cfdcc3). Original: resvg `renderAsync` (threadpool) behind the CPU gate | `/api/og/*` (all kinds) | event-loop stall per cold render | page card 224 ms, post 233, profile 229, game+art 245 (first ever 1574); story cards 896 / 918 | 10 / 13 / 11 / 16 (first ever 71); stories 27 / 31 | latency | 653ceb9d | `cpu-bound-gate.test.ts` (PNG bytes identical to the sync path) |
| 2 | **Superseded by main** (`dedupeOgRender`; `createCardCache` removed in cf817ad07). Original: bounded LRU+TTL with in-flight de-dup, replacing five copied `Map` blocks | `/api/og/*` | renders per cold key under N concurrent requests | N | 1 | exact | 653ceb9d | `cpu-bound-gate.test.ts` |
| 3 | Post story card key now covers everything drawn (was id only: edit or content-warning served stale for the TTL) | `/api/og/post/$id/story` | stale-content window | up to 10 min + s-maxage | 0 for this process cache | exact | dff14c64 | `postStoryCacheKey` test |
| 4 | Width ladder (27 rungs) and q snapped to 5s; invalid values mean "no constraint" | `/api/feed/image/*`, `/api/image-proxy` | distinct encodes reachable for one object by sweeping `w` | 2048+ per format per q | 27 | exact | 5b8c2cde | `image-variant-serving.test.ts` |
| 5 | `getOrEncodeVariant`: single-flight load+encode on a miss | same | loads+encodes for N concurrent cold requests of one key | N | 1 | exact | 5b8c2cde | `image-variant-serving.test.ts` |
| 6 | CPU gate (default threadpool size − 1) around sharp encodes; full queue answers 503 + Retry-After | same | `fs.stat`+`dns.lookup` latency during 8 concurrent AVIF encodes | max 1364 ms (w1024), 2419 ms (w1600); idle 0.13 ms | max 0.6 ms / 5.5 ms | latency | 5b8c2cde | gate tests in `cpu-bound-gate.test.ts` |
| 7 | `loadSystemFonts:false` on main's `svgToPng` (SVGs have no `<text>`: satori emits outlines) | `/api/og/*` | `renderAsync` ms, 1200x630 / 1080x1920 | 144 / 141 | 56 / 91 | latency (median of 13, interleaved; PNG bytes identical) | 589cfdcc3 | `cpu-bound-gate.test.ts`, `lib/og/__tests__`; bench `svgtopng-fonts-bench.mts` |
| 8 | Sitemap chunks: `posts`/`users` read in 5k-row queries and serialised into a gzip stream with a yield between slices | `/sitemaps/*.xml` | event-loop stall, one 40k-URL `posts` chunk | ~140 ms (Prisma decode of 40k rows, one block) plus a 40-50 ms synchronous `renderUrlset` | ~25 ms | latency (heartbeat, 4 runs) | 1a956ba04 | `sitemap-serve.test.ts`, `sitemap-sections.test.ts` |
| 9 | Per-chunk L1 cache (10 min) with single-flight; strong ETag, `If-None-Match` to 304, `buildCacheHeaders` public headers, `Vary: Accept-Encoding`, identity fallback | `/sitemaps/*.xml` | DB queries + CPU per crawler request after the first | 1 chunk build per request | 0 within 10 min / 304 | exact | 1a956ba04 | `sitemap-serve.test.ts` |
| 10 | `relationLoadStrategy: 'join'` for the `posts` page | `/sitemaps/posts*.xml` | query ms, 40k rows | 434 / 495 (offset 0 / 120k) | 339 / 393 (noisy box; second pass 301 vs 273 at offset 0) | latency (median of 5-7) | 1a956ba04 | `sitemap-sections.test.ts` |
| 11 | `/api/oembed?type=og`: 64 kB capped read, 24 h per-URL `cachedNullable` (single-flight; upstream failures not cached); tenor read capped at 256 kB | `/api/oembed` | origin bytes buffered / origin fetches per repeat link | whole body / 1 per call | at most 64 kB / 1 per 24 h | exact | b03dbd472 | `oembed-og-cache.test.ts` |

Trade-off on #8: the cold build of a `posts` chunk takes longer in wall time (about 800 ms for chunk 1 and about 1.9 s for chunk 4, from ~415 ms for chunk 1) because each 5k sub-query re-scans the offset. It is built once per 10 minutes per process and served as 304/cached after that, and the loop is free in between, which is the trade the budget asks for. Keyset boundaries would remove the re-scan but the `sitemap-sections` tests pin the `where`/`orderBy` shapes; a raw-SQL page measured 80-190 ms against 270-400 ms through Prisma and is left for WS4 (needs a partial index on the public-post predicate, no EXPLAIN-backed proposal yet).

Trade-off on #9: nothing invalidates the L1 entry, so a community made private (or a post deleted) stays listed for up to 10 more minutes on top of the 1 h `max-age` the sitemap already sent. Private communities and community posts remain excluded by the pinned `isPrivate: false` / `communityId: null` predicates.

Trade-off on #6: a burst of 8 AVIF w1024 encodes finishes in 1082 ms wall instead of 703 ms. Intended: the rest of the process stays responsive.

Response differences from #4: a width off the ladder is served at the next rung up (never smaller); quality is within 2 of the request. Every width the client emits (`OptimizedImage` WIDTHS, 32 px placeholder, avatar sizes) is on the ladder, so real traffic gets the same bytes.

## Rejected (measured, no win)
| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---:|---:|---|
| 1 | `loadSystemFonts:false` alone (sync path) | OG | resvg ms | 219 | 193 | ~12% of CPU but still a 193 ms block; kept only as part of the async change. Satori emits outlines, so the SVG has no `<text>`; PNG identical. |
| 2 | Moving sharp off the event loop | image routes | loop stall | ≤ 4.8 ms | n/a | sharp is already off-thread (stall ≤ 5 ms at every width/format, 30 ms outlier once under 8 concurrent AVIF with GC). The real problem was threadpool starvation (shipped #6). |

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| 1 | Sitemap keyset boundaries / raw-SQL page for `posts`/`users` | Would cut the cold build from ~800 ms and remove the offset re-scan; conflicts with the pinned Prisma `where` shapes | WS4 partial index proposal with EXPLAIN, then update the pin tests |
| 2 | RSS tag feed | Measured below: linear in tag size. Same fix as WS8's `post_hashtag` keyset path, so recorded as a handoff rather than duplicated | WS8 |
| 4 | OG fonts fetched from fonts.gstatic.com at every boot (144–158 ms here; 30 s cooldown with 500s on failure); PNG cache is per-process so a restart or blue/green swap re-renders | The variable `@fontsource` Inter is woff2 (satori cannot read it), so bundling needs committed TTFs. CDN `s-maxage` already absorbs repeats | operator decision on vendoring two TTFs; Redis L2 for PNGs is possible but unmeasured |
| 5 | Sharp concurrency on Alpine | Prod is musl, where libvips defaults to one thread per core, on top of the gate | measure on the VPS |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS4 | `app/routes/api/library/cover/$id.ts` | Same variant pattern: arbitrary `w`/`h`/`q`, no single-flight, ungated encode. Replace with `snapDimension`/`snapQuality` + `getOrEncodeVariant` (see `app/routes/api/image-proxy.ts`) | `lib/__tests__/image-variant-serving.test.ts` |
| WS4 | `lib/sitemap.server.ts` (`posts`, `users`, `homes`, `builds`, `jobs` pages) | `skip`-based pagination up to 160k rows. `posts` and `users` are now read in 5k sub-queries, so each re-scans its offset; raw SQL measured 80-190 ms vs 270-400 ms via Prisma for 40k rows. A partial index on the public-post predicate (`audience`, `deletedAt`, `communityId`, `unlockPrice`, `originalId` order by `createdAt, id`) would let a keyset page replace `skip`. `homes`/`builds`/`jobs` are small and unmeasured | `scripts/perf-ws6/sitemap-bench.mts`, `sitemap-query-bench.mts` |
| WS8 | `lib/feed/rss.server.ts:77` `tagFeedItems` | `hashtags.some.hashtag.tag` plans as: resolve tag, read ALL `post_hashtag` rows for it (3,993 for `tag1`), nested-loop join to `rmheet`, filter, top-N sort. Cost is linear in the tag size: `tag1` (3,993 posts) 22 ms median, `tag2` (1,713) 15 ms, `tag317` (84) 2.8 ms, unknown tag 1.4 ms; 16,016 buffers for `tag1`. A keyset read of `post_hashtag (hashtagId, createdAt desc)` limit 40 (overfetch to survive the visibility filter) would be O(40). Same index/query shape as WS8's tag-feed keyset path, so not duplicated here | `scripts/perf-ws6/rss-tag-bench.mts`; EXPLAIN ANALYZE on `rmh_ws6` |
| anyone calling `optimizeImage` outside the routes | `lib/media/ingest.server.ts` etc. | Encodes there are not gated | n/a |

## Budget status (owned routes, after)
Sitemap, OG and oembed figures are in-process (no HTTP/production build). Event-loop budget (no block > 50 ms per request): met for every OG kind after warm-up (10–31 ms); first-ever game-card render 71 ms (one-time sharp/wasm init).

## Rule objections
None.

## Commands
```bash
# 2026-10-22 additions (run with --env-file=.env pointing at the seeded DB)
pnpm exec tsx --env-file=.env scripts/perf-ws6/svgtopng-fonts-bench.mts
SITEMAP_BENCH_MODE=before|after pnpm exec tsx --expose-gc --env-file=.env scripts/perf-ws6/sitemap-bench.mts posts 1 5
pnpm exec tsx --env-file=.env scripts/perf-ws6/sitemap-query-bench.mts 120000 5
pnpm exec tsx --env-file=.env scripts/perf-ws6/rss-tag-bench.mts
pnpm exec vitest run lib/__tests__/sitemap-serve.test.ts lib/__tests__/sitemap-sections.test.ts lib/__tests__/oembed-og-cache.test.ts

export PATH=/opt/node24/bin:$PATH
# removed: scripts/perf-ws6/og-bench.mts (OG cold render / stall) benchmarked the synchronous Resvg.render path that main's svgToPng replaced (88de16e44); see git history
# removed: scripts/perf-ws6/resvg-bench.mts (sync vs async, system fonts, byte equality) benchmarked the synchronous Resvg.render path that main's svgToPng replaced (88de16e44); see git history
flock /tmp/rmh-perf-build.lock pnpm exec tsx scripts/perf-ws6/sharp-bench.mts       # encode time / stall per width x format, 8-way burst
flock /tmp/rmh-perf-build.lock pnpm exec tsx scripts/perf-ws6/threadpool-bench.mts  # starvation, ungated
flock /tmp/rmh-perf-build.lock pnpm exec tsx scripts/perf-ws6/threadpool-gated.mts  # starvation, gated (RMH_CPU_GATE_LIMIT=2|3)
pnpm exec vitest run lib/__tests__/cpu-bound-gate.test.ts lib/__tests__/image-variant-serving.test.ts lib/__tests__/og-cards.test.ts
```

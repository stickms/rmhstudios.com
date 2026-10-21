# WS6 — CPU-bound endpoints — results

Worktree baseline taken 2026-10-21 (Stage A, in-process timing under the shared build lock), base commit e97b5192, merged with `claude/focused-darwin-bmii1v` @ 796295bd. Environment deviations: **Stage B not run** — `WS0_READY` never appeared, so there is no seeded dataset, no production build and no HTTP-level numbers. Every latency figure below is an in-process measurement on the shared 4-core box (glibc, so `sharp.concurrency()` is 1 here; production is Alpine/musl where it defaults to the core count). Compare only within a row.

## Shipped
| # | Change | Route(s) | Metric | Before | After | Evidence | Commit | Correctness test |
|---|---|---|---|---:|---:|---|---|---|
| 1 | Rasterise OG cards with resvg `renderAsync` (threadpool) + `loadSystemFonts:false`, behind the CPU gate | `/api/og/*` (all kinds) | event-loop stall per cold render | page card 224 ms, post 233, profile 229, game+art 245 (first ever 1574); story cards 896 / 918 | 10 / 13 / 11 / 16 (first ever 71); stories 27 / 31 | latency | 653ceb9d | `cpu-bound-gate.test.ts` (PNG bytes identical to the sync path) |
| 2 | `createCardCache`: bounded LRU+TTL with in-flight de-dup, replacing five copied `Map` blocks | `/api/og/*` | renders per cold key under N concurrent requests | N | 1 | exact | 653ceb9d | `cpu-bound-gate.test.ts` |
| 3 | Post story card key now covers everything drawn (was id only: edit or content-warning served stale for the TTL) | `/api/og/post/$id/story` | stale-content window | up to 10 min + s-maxage | 0 for this process cache | exact | dff14c64 | `postStoryCacheKey` test |
| 4 | Width ladder (27 rungs) and q snapped to 5s; invalid values mean "no constraint" | `/api/feed/image/*`, `/api/image-proxy` | distinct encodes reachable for one object by sweeping `w` | 2048+ per format per q | 27 | exact | 5b8c2cde | `image-variant-serving.test.ts` |
| 5 | `getOrEncodeVariant`: single-flight load+encode on a miss | same | loads+encodes for N concurrent cold requests of one key | N | 1 | exact | 5b8c2cde | `image-variant-serving.test.ts` |
| 6 | CPU gate (default threadpool size − 1) around sharp encodes; full queue answers 503 + Retry-After | same | `fs.stat`+`dns.lookup` latency during 8 concurrent AVIF encodes | max 1364 ms (w1024), 2419 ms (w1600); idle 0.13 ms | max 0.6 ms / 5.5 ms | latency | 5b8c2cde | gate tests in `cpu-bound-gate.test.ts` |

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
| 1 | Sitemaps on 200k posts: `posts`/`users` sections page with `OFFSET` up to 160k plus a join, no server-side cache (only `Cache-Control: max-age=3600`), 40k-URL XML built as one string | Needs the seeded dataset and a production build to measure; query shape lives in `lib/sitemap.server.ts` (WS4's file). A rendered chunk is ~7 MB, too large for `cached()`'s Redis L2 JSON, so it needs L1-only or keyset boundaries | `WS0_READY` + dataset. Plan: measure cold chunk time and loop stall; keyset the `posts`/`users` pages; cache rendered XML with `l2:false` and a 1 h TTL (the HTTP TTL already tolerates that staleness) |
| 2 | RSS tag/user feeds | Already `take: 40`, select-only; tag feed filters through `hashtags.some.hashtag.tag` — needs `EXPLAIN` on 200k posts | dataset |
| 3 | `/api/oembed?type=og` (used by `LinkPreview`): `res.text()` uncapped, no server cache, unlike `/api/unfurl` which is capped and Redis-cached | Fix is to point `LinkPreview` at `/api/unfurl` (client file, not WS6) or add a capped read + Redis cache here | decision on which; low CPU, a memory/outbound-fetch risk |
| 4 | OG fonts fetched from fonts.gstatic.com at every boot (144–158 ms here; 30 s cooldown with 500s on failure); PNG cache is per-process so a restart or blue/green swap re-renders | The variable `@fontsource` Inter is woff2 (satori cannot read it), so bundling needs committed TTFs. CDN `s-maxage` already absorbs repeats | operator decision on vendoring two TTFs; Redis L2 for PNGs is possible but unmeasured |
| 5 | Sharp concurrency on Alpine | Prod is musl, where libvips defaults to one thread per core, on top of the gate | measure on the VPS |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS4 | `app/routes/api/library/cover/$id.ts` | Same variant pattern: arbitrary `w`/`h`/`q`, no single-flight, ungated encode. Replace with `snapDimension`/`snapQuality` + `getOrEncodeVariant` (see `app/routes/api/image-proxy.ts`) | `lib/__tests__/image-variant-serving.test.ts` |
| WS4 | `lib/sitemap.server.ts` (`posts`, `users`, `homes`, `builds`, `jobs` pages) | `skip`-based pagination up to 160k rows | static reading; unmeasured |
| anyone calling `optimizeImage` outside the routes | `lib/media/ingest.server.ts` etc. | Encodes there are not gated | n/a |

## Budget status (owned routes, after)
Not measured over HTTP (Stage B did not run). Event-loop budget (no block > 50 ms per request): met for every OG kind after warm-up (10–31 ms); first-ever game-card render 71 ms (one-time sharp/wasm init).

## Rule objections
None.

## Commands
```bash
export PATH=/opt/node24/bin:$PATH
flock /tmp/rmh-perf-build.lock pnpm exec tsx scripts/perf-ws6/og-bench.mts          # OG cold render / stall (run at e97b5192-era code and at 653ceb9d)
flock /tmp/rmh-perf-build.lock pnpm exec tsx scripts/perf-ws6/resvg-bench.mts       # sync vs async, system fonts, byte equality
flock /tmp/rmh-perf-build.lock pnpm exec tsx scripts/perf-ws6/sharp-bench.mts       # encode time / stall per width x format, 8-way burst
flock /tmp/rmh-perf-build.lock pnpm exec tsx scripts/perf-ws6/threadpool-bench.mts  # starvation, ungated
flock /tmp/rmh-perf-build.lock pnpm exec tsx scripts/perf-ws6/threadpool-gated.mts  # starvation, gated (RMH_CPU_GATE_LIMIT=2|3)
pnpm exec vitest run lib/__tests__/cpu-bound-gate.test.ts lib/__tests__/image-variant-serving.test.ts lib/__tests__/og-cards.test.ts
```

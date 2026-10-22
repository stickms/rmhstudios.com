# WS1 — SSR shell and page loaders — results

> Point-in-time ledger as of `c4c8d6091` (#925). Figures are from the seeded perf dataset or in-process runs, not production; SHAs and branch names refer to that program's worktrees.

Stage A only (static analysis + dev-server query/byte counts). Stage B (production-build latency, cold start, heavy-user runs) has NOT been done: the WS0 harness marker had not appeared when this was written. Worktree baseline taken 2026-10-21 on commit e97b5192, DB `rmh_ws1_a` (migrated, not the seeded template; 1 user, 80 synthetic news articles). Environment deviations: `vite dev` for counts/bytes only; commits taken while holding the shared lock via a holder script (the sandbox refuses `flock … git`).

## Shipped
| # | Change | Route(s) | Metric | Before | After | Commit | Evidence | Correctness test |
|---|---|---|---|---:|---:|---|---|---|
| 1 | 28 `_site` route files + 3 ladder pages use `getRequestSession()` instead of raw `auth.api.getSession` (request memo + no-cookie fast path) | `/library` and every loader above | queries, signed, cookie without `session_data` | 13 | 9 | 37d96ba8 | exact (in prod `cookieCache` removes the queries; saving is repeated cookie verify + tier lookup) | `lib/__tests__/ssr-session-dedupe.test.ts` |
| 2 | `/news` loader: narrow select (no `content`), featured derived from the one query (since moved behind `getNewsIndexArticles()` in `lib/news.ts`, on `prismaRead`, same nine columns) | `/news` | document bytes anon; queries | 655,258 B; 2 | 138,301 B; 1 | 4fca3ced | exact; markup with scripts stripped byte-identical (97,329 B) | `lib/__tests__/news-index-loader.test.ts` |

## Rejected (measured, no win)
| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---:|---:|---|
| 1 | `getSidebarData({recommendedUsers:false})` on `/explore` (11df4e14, reverted in this commit) | `/explore` signed | queries | 7 | 7 | `listExplore` reads the same `getFollowingIds` cache key, so the `follow` query just moves there; only 4 unused user objects left the payload. |

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| 1 | (Superseded by main 219655bd6, see the Superseded table.) Root loader `appearancePreference.findUnique` runs serially after the session on every signed-in document | One PK lookup; caching needs `invalidateCached` in `app/routes/api/preferences/appearance.ts` (not WS1-owned) | Stage B number showing it matters; then a handoff for the one-line invalidation |
| 2 | `/news` read is still unbounded | Page searches/paginates all articles client-side; a `take` changes behaviour | Server-side search + paging (product decision) |
| 3 | Non-English documents carry core i18n catalogs inline: `/communities` 49 KB (en) vs 191 KB (de), 199 KB (ja), 221 KB (ar) | Per-route namespace subsetting risks hydration mismatch | Stage B CPU measure of seroval on the 140 KB; route-aware namespace map with a hydration test |
| 4 | Anon edge-cache allowlist additions | Origin allowlist is inert until `deploy/apply-cloudflare-cache-rules.sh` matches, and `anon-html-cache.test.ts` fails if they disagree; deploy script is not WS1-owned. I did not audit any candidate route end to end | Coordinator/operator decides to widen the CF rule; then audit per 03-rules §2 |
| 5 | `warmup.ts`: comment says it primes the sidebar for `/`, but the `/` loader no longer calls `getSidebarData` (explore/profile/post do). It does not prime Better Auth, the SSR render modules, or any non-en locale | Need cold-start measurement (first signed-in request after boot) | Stage B: restart-and-time `/` x3, then try `nitroApp.localFetch('/')` priming |
| 6 | Profile loader: `listAchievements` runs after `getProfile` and re-resolves the user; could run in parallel with the raw id | Latency only | Stage B |
| 7 | Sidebar follow exclusion fetches up to 5,000 follow ids on a 30 s cache miss; a 20-id `IN` query would do | Trade-off (query per render vs cached array) needs heavy-user numbers | Stage B with the 2,000-follow user |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS4 | `lib/achievements.server.ts:33` | `listAchievements` re-queries the user by `OR(id, handle)` though callers hold the id; returns the full static catalog per call (`/achievements` document 308 KB) | dev run, empty DB |
| WS4 | `lib/news.ts:19-31` | `getAllNewsArticles`/`getFeaturedNewsArticles` select whole rows; now unused by `/news` (still used by RSS) | route no longer imports them |
| WS4 | `lib/library/library.server.ts` (`listAllBooks`) | `/library` issues two `library_document` queries (one `originFilename` scan) | query log |
| Coordinator | `deploy/apply-cloudflare-cache-rules.sh:120` | Any allowlist widening needs the CF rule edited in lockstep | `anon-html-cache.test.ts` sync tests |
| Remaining ladder pages | `app/routes/_site/rmhladder/*.tsx` | still raw `auth.api.getSession`; migrating turns lookup errors into /login redirects | allowlist in ssr-session-dedupe test |

## Upstream merge note
Merged `claude/focused-darwin-bmii1v` (796295bd). Its `__root.tsx` change adds only a client `<EversionRoot />` (lazy bridge, effects only) and reformatting; nothing in the root loader or SSR data path.

## Budget status (owned routes, after)
Not measured (no harness, no seeded dataset). Dev-server counts only: `/news` anon 1 query, `/library` signed 9, `/communities` signed 4, `/explore` signed 7 (cold caches: session 2, follow, appearance, block/mute 3).

## Rule objections
None.

## Commands
- Counts/bytes: dev server `pnpm exec vite dev --port 7115`, Prisma query log lines per request (script in the session scratchpad `ws1/q.sh`), signed cookie built with HMAC-SHA256 of the session token under `BETTER_AUTH_SECRET`.
- Before/after code: `git show HEAD:<file> > <file>` swap, same server.
- Tests: `pnpm exec vitest run lib/__tests__/ssr-session-dedupe.test.ts lib/__tests__/news-index-loader.test.ts lib/__tests__/anon-html-cache.test.ts`

## Stage B (relaunch, merged tree 9949ca7ef, production build, DB rmh_ws1, port 7115)

### Shipped
| # | Change | Metric | Before | After | Commit | Evidence | Correctness test |
|---|---|---|---|---|---|---|---|
| B1 | zod 4.4.3 -> 4.6.5 (Better Auth core needs `zod ^4.5.4` for `z.validate`) | `GET /api/auth/get-session` with `x-forwarded-for: 10.1.1.1`, production build | 500 `(void 0) is not a function at isIPv4` | 200 (sign-in with bad body: 400) | 8ea00b929 | exact (status codes, repro below) | `lib/__tests__/better-auth-zod-peer.test.ts` (fails on 4.4.3, passes on 4.6.5) |
| B2 | `/cookgame`, `/isleworks`: `<Canvas>` behind `ClientOnly` | SSR errors "reading 'useMemo'" in a sweep of all 398 static page paths | 2 routes erroring | 0 | a7baf7972 | exact (server log count) | none possible without a browser; SSR output now the existing fallback |

B1 root cause: Nitro's bundle has one zod chunk, built from the app's copy (4.4.3), but `@better-auth/core/utils/ip` calls `z.validate()` (added in zod 4.5). pnpm only warned about the unmet peer; rolldown compiles the missing namespace export to `(void 0)`. Dev (vite) resolves Better Auth's own 4.6.5 copy, so it never showed. Production exposure: `deploy/apache/rmhstudios.conf` proxies with `ProxyPass /` and no `ProxyAddHeaders Off`, so mod_proxy adds `X-Forwarded-For` to every request, and the Dockerfile installs with `--frozen-lockfile` (same 4.4.3). Any `/api/auth/*` request that reaches Better Auth (sign-in, sign-up, OAuth callbacks, sign-out; get-session only when a session cookie is present, after e0bf35ea9) therefore threw in production. I could not check the VPS; the build reproduces it exactly. main (origin/main fe1175c56) still pins zod ^4.4.3. Repro: build, run `node .output/server/index.mjs`, `curl -si -H 'x-forwarded-for: 10.1.1.1' localhost:$PORT/api/auth/get-session`. Lockfile edit is `pnpm install --lockfile-only` with only the zod hunks kept (the local pnpm 10.28 drops `libc:` lines the repo's pnpm writes); zod 3.25.76 and other consumers unchanged.

### Re-measured / superseded
| Stage A item | Status |
|---|---|
| #1 session dedupe on 28 route files (37d96ba8) | Superseded by main ee1932f80 (same `getRequestSession` swap in the same files); no separate win to claim. Test kept. |
| #2 `/news` narrow select | Stands: anon document 655,258 B -> 55,681 B today (1 query; the 138 KB figure was dev mode), signed 59,217 B. |
| Deferred #1 appearance seed | Superseded by main 219655bd6. |

### Payload findings (item 3), production build, bytes = document, scripts = inline serialized loader data
| Route | anon total | scripts | markup |
|---|---:|---:|---:|
| `/` | 119,025 | 24,825 | 94,200 |
| `/communities` | 153,002 | 26,126 | 126,876 |
| `/games` | 98,140 | 17,320 | 80,820 |
| `/achievements` anon | 52,528 | 14,110 | 38,418 |
| `/achievements` signed | 316,549 | ~25,000 | ~280,000 |

Loader/dehydrated data is 14-26 KB on every page, so the 90 KB budget is met by the data; the bytes are markup. Floor of ~38 KB markup = sidebar lucide SVGs (22 KB) + preload links (6.7 KB). Signed `/achievements` renders every catalog card (~2.5 KB each) into SSR HTML: not a loader fix. No loader change made; none would move the number.

### Cold start (item 5)
`cold-start.mjs --runs 3` on this build (NITRO_PRESET default node-server, one process; `web-cluster.mjs` falls through to `index.mjs` when no `worker.mjs` exists): boot 1380 ms anon, first `/` TTFB median 161 ms anon / 314 ms signed (baseline 145-164 / 248-). Unchanged within noise. The production image is built with `node-cluster` (docker-bake.hcl), which I did NOT build or measure: there each worker runs `warmup.ts` itself and the deploy's single health curl warms only one worker; first-request cost on the other N-1 workers is the open question. Warmup still primes the sidebar for `/` that the `/` loader no longer calls (Deferred #5).

### Handoffs
| To | file | What | Evidence |
|---|---|---|---|
| components owner | `components/feed/AchievementsColumn` / JourneyColumn | signed `/achievements` SSRs all catalog cards: 280 KB of markup. Collapse by category or render beyond the first tab client-side | 316,549 B document |
| coordinator | `package.json`, `deploy/` | zod bump needs the Docker image rebuilt; consider `ProxyAddHeaders` unchanged (header is now handled) | B1 |

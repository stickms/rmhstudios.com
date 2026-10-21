# WS1 — SSR shell and page loaders — results

Stage A only (static analysis + dev-server query/byte counts). Stage B (production-build latency, cold start, heavy-user runs) has NOT been done: the WS0 harness marker had not appeared when this was written. Worktree baseline taken 2026-10-21 on commit e97b5192, DB `rmh_ws1_a` (migrated, not the seeded template; 1 user, 80 synthetic news articles). Environment deviations: `vite dev` for counts/bytes only; commits taken while holding the shared lock via a holder script (the sandbox refuses `flock … git`).

## Shipped
| # | Change | Route(s) | Metric | Before | After | Commit | Evidence | Correctness test |
|---|---|---|---|---:|---:|---|---|---|
| 1 | 28 `_site` route files + 3 ladder pages use `getRequestSession()` instead of raw `auth.api.getSession` (request memo + no-cookie fast path) | `/library` and every loader above | queries, signed, cookie without `session_data` | 13 | 9 | 37d96ba8 | exact (in prod `cookieCache` removes the queries; saving is repeated cookie verify + tier lookup) | `lib/__tests__/ssr-session-dedupe.test.ts` |
| 2 | `/news` loader: narrow select (no `content`), featured derived from the one query | `/news` | document bytes anon; queries | 655,258 B; 2 | 138,301 B; 1 | 4fca3ced | exact; markup with scripts stripped byte-identical (97,329 B) | `lib/__tests__/news-index-loader.test.ts` |

## Rejected (measured, no win)
| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---:|---:|---|
| 1 | `getSidebarData({recommendedUsers:false})` on `/explore` (11df4e14, reverted in this commit) | `/explore` signed | queries | 7 | 7 | `listExplore` reads the same `getFollowingIds` cache key, so the `follow` query just moves there; only 4 unused user objects left the payload. |

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| 1 | Root loader `appearancePreference.findUnique` runs serially after the session on every signed-in document | One PK lookup; caching needs `invalidateCached` in `app/routes/api/preferences/appearance.ts` (not WS1-owned) | Stage B number showing it matters; then a handoff for the one-line invalidation |
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

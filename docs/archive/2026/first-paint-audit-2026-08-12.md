# First-paint / load audit — 2026-08-12

Triggered by: **"initial paint/load audit and fix — the website takes a while to
load on first visit. We can break files into chunks, paint first and then load
intermediate skeletons. Ensure we aren't just waiting for a bunch of data."**
Then: **"do this for all pages"** and **"the homepage/feed definitely doesn't
load fast currently — even when I'm signed in."**

Read [`loading-audit-2026-08-11/`](loading-audit-2026-08-11/index.md) first. Its
findings hold; this pass does not revisit them. What follows is the part that
audit did not cover: not how many bytes a page costs, but **when the first
useful pixel appears** and **what the server is waiting on before it sends
anything.**

## Method, and one caveat

Static analysis over the whole route tree, six parallel lenses (shell critical
path · loader triage · the feed · chunk graph · skeleton coverage · server
waterfalls), then **every finding was handed to an adversarial verifier whose
job was to refute it**. That mattered more than usual here: **34 of 48 findings
were refuted** — wrong line numbers, already-fixed, impact overstated by an
order of magnitude, or a proposed fix that would have broken SEO meta,
hydration, or an auth gate. Only the 14 survivors are below.

Numbers come from a real `pnpm build` on this box and from
`scripts/ci/bundle-budget.ts`. No browser was available, so there is **no new
FCP/LCP measurement in this pass** — where a runtime number appears it is cited
from 08-11's harness, and claims resting on it are marked.

## The headline

**The homepage was rendering its own skeleton into the SSR HTML.**

`/`'s loader has been correct since it was written — it returns the first feed
page *unawaited*, so it streams. But `RadialFeed` renders from the module-level
`feedStore`, and the store is seeded from that streamed page by a `useEffect`.
**Effects do not run during SSR.** So the server rendered `FeedWheelSkeleton`,
the streamed posts rode along in the payload unused, and the real rmharks
appeared only after the entry bundle (245 KB brotli eager) had downloaded,
parsed, and hydrated — 08-11 measured ~570 ms of long tasks on `/` alone.

Every ingredient of a fast homepage was already in place. The last step —
*render them* — was missing. `FeedList`, the classic feed column, has always
had this (`usingInitial` / `displayItems`); only the radial home lacked it.

That is also why signing in did not help. It is worse for signed-in visitors,
for a reason that is correct and not going to change: anonymous HTML is
edge-cacheable, and authenticated HTML is `private, no-cache`
(`server/nitro/anon-html-cache.ts`), so **every signed-in page load is a full
origin SSR render.** Signed-in users never get the cache that makes anonymous
traffic feel fast, so they feel every millisecond the origin spends.

## What was measured and rejected — do not re-attempt

The most useful output of this pass is what it stops the next one from doing.

| Idea | What killed it |
| ---- | -------------- |
| **Defer the other ~41 blocking route loaders** | 08-11's own harness contradicts the premise: FCP on `/` (deferred) is 724–824 ms vs `/library` (blocking, five parallel DB reads) 716–852 ms and `/news` (blocking) 644–660 ms. **The streaming route is not faster.** Warm TTFB is 26–80 ms; FCP is gated by JS, not by loaders. A 41-route refactor with per-route skeletons is a large, visually risky diff for a win the site's own numbers do not show. Do it per-route, driven by a measured slow loader — not as a sweep. |
| **Defer the 8 rmhladder loaders specifically** | They `throw redirect(...)` from inside the awaited loader. Deferring the promise moves the throw off the blocking path and **breaks the auth gate.** |
| **Add `pendingComponent` to `/`** | Would replace the streamed shell with a full-page skeleton and make `/` *worse*. The deferred promise + `<Suspense fallback={<FeedWheelSkeleton/>}>` is already the right shape. |
| **Retune `defaultPendingMs` / `defaultPendingMinMs`** | Gated off on the server; reaches initial load only for routes with `ssr: false`, of which there are none. Purely client-nav latency, and the proposed retune shifts the penalty window rather than closing it. |
| **Merge the single-icon chunks** | Real fragmentation, ~zero bytes: the 17 entry-closure icon chunks total 4.21 KB raw. Costs hydration-start, not first paint. |
| **`Link` early hints (`responseLinkHeader`)** | ~5–6 KB of `Link` headers on every HTML response (87 preloads on `/`), which must survive the Apache hop and Cloudflare. Ceiling is bounded by a 26–80 ms TTFB. |

## Fixed in this branch

| Fix | Effect | Where |
| --- | ------ | ----- |
| **The feed's first page now server-renders.** Prefer the streamed page while the store is pristine, guarded on the same surface check the seeding effect uses. | Posts move from "after hydration" into the SSR HTML. Biggest user-visible win here, and the direct answer to the reported complaint. | `components/radial/RadialFeed.tsx` |
| **Two detail routes stop fetching their own origin during SSR.** `/builds/$slug` and `/user-builds/$slug` called `fetch('${VITE_BETTER_AUTH_URL}/api/user-builds/…')` from inside their loader — a full second request cycle (public hostname, CDN, Apache, another Nitro render with its own session lookup) in front of the first byte. | One whole HTTP round trip + a second Nitro cycle off TTFB on both routes. | `lib/user-builds-detail.server.ts` (new), both route files, `app/routes/api/user-builds/$id.ts` |
| **The boot warmup primed a cache key nothing read.** `limit` is part of `getTimeline`'s cache key and is not clamped; warmup asked for 20, the homepage asks for 15. The warmup ran, reported success, and the first anonymous visitor still paid the full cold timeline assembly. | Restores the warm-cache path the warmup exists to provide. | `server/nitro/warmup.ts` |
| **9 auth gates resolved the session twice, serially.** All `beforeLoad` gates called `auth.api.getSession` directly; router-core finishes every `beforeLoad` before any loader, so each added a full Better Auth resolution ahead of the root loader's own. | Collapses two serial session resolutions into one on those routes. | `rmhtype`, `rmhbox`, `rmhstudy`, `rmhtube`, `rmhmusic`, `rmhcalculator`, `studio`, `altair/multiplayer`, `_site/admin/route` |
| **The nav globe left the eager shell graph.** 87 KB of source, statically imported by `RadialShell` → on every `_site` page, but rendered only while the menu is open. Now lazy, with intent-preloading (hover/focus/pointerdown) and an idle backstop so the 500 ms open motion never waits on it. | **5.3 KB brotli / 14.5 KB raw off every `_site` page.** `SiteShell` chunk 55,382 → 46,361 raw. | `components/radial/RadialHub.tsx` |
| **`/predictions` loaded five casino tables to show one.** | **32.2 KB brotli → at most 8.0 KB.** | `components/rmhcoins/PlayTab.tsx` |
| **A latent `technologies` bug**, surfaced by removing the loopback: the column is Prisma `Json` (`JsonValue`, nullable) and every consumer treats it as `string[]`. `res.json()` typed it `any` and hid it. Now coerced once. | A legacy row holding null renders as "no technologies" instead of throwing on `.map`. | `lib/user-builds-detail.server.ts` |
| **The site-reference generator's auth-gate heuristic.** It classified a route as a conditional gate by grepping for the literal `getSession`; `getRequestSession` does not contain that substring, so moving the gates onto it silently reclassified them as unconditional redirects — the generated docs began claiming `/rmhcalculator` bounces *everyone* to `/login`. | Rule fixed in the same commit, per `CLAUDE.md`. | `scripts/generate-site-reference.ts` |

Tests: `lib/__tests__/feed-first-paint.test.ts` pins the streamed-page predicate
(including the surface guard that stops a stale For-You page flashing over a
filtered feed) and asserts warmup and the homepage request the same page size.
The warmup assertion was **verified to fail on the reintroduced bug.**

Suite: **275 files / 6,794 tests green** (was 274 / 6,789).

## Still open, ranked

1. **`globals.css` — 465 KB raw / 47.9 KB brotli, render-blocking on every
   page, 65–67% used.** Now the single largest *unconditional* blocker of first
   paint, and with the JS side well-picked-over it has the highest remaining
   ceiling. Still needs eyes, not automation (three themes × two widths × ~30
   full-screen apps). 08-11 §5.
2. **The 3D games and `/rmhmusic`: 4.8–6.0 s of main-thread long tasks** after
   download completes. Unchanged, still the highest ceiling in the product, still
   genuine investigation. 08-11 §7.
3. **Per-route loader deferral, driven by measurement.** Not the sweep above —
   instrument first (`DATABASE_QUERY_BUDGET`, 08-11 §8, still unharvested), find
   the loaders that are actually slow, defer those with a real skeleton.
4. **The remaining `auth.api.getSession` call sites** (52 route files, 61 calls).
   The 9 gates are done; the rest need per-site judgement, because
   `getRequestSession` swallows errors (`.catch(() => null)`) and 27 of those
   calls currently have no `.catch()` — for a personalized page that turns a
   transient DB error into a silent signed-out render rather than an error
   boundary.
5. **zod on the critical path** — 71 KB raw / 16.6 KB brotli via 246 module
   paths. Unchanged from 08-11 §1; still `zod/mini` or accept it.

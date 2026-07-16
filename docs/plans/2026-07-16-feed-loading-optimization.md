# Feed Loading Optimization — Analysis & Implementation Plan

**Date:** 2026-07-16
**Status:** Ready for implementation
**Scope:** The home feed (`/`) load path — server timeline assembly, SSR streaming,
API payloads, and client rendering.
**Audience:** This document is written for implementation agents. Each fix below is
self-contained: files to touch, the exact change (with code), and a definition of
done. Fixes are independently shippable unless a dependency is called out.

---

## 0. Symptom and diagnosis summary

**Reported symptom:** the feed is extremely slow to load, and the browser tab stays
in the "loading" state (spinner) long after the page appears — it "pauses the
loading of the website."

**Why the tab keeps spinning:** `app/routes/_site/index.tsx` returns the sidebar and
the first feed page as **deferred promises** (`loader: () => ({ sidebar:
fetchSidebarData(), initialFeed: fetchInitialFeed() })`). With TanStack Start
streaming SSR, the HTML document stream is held open until every deferred promise
resolves and its data is flushed into the stream. So the shell paints fast, but the
**document `load` event — and the tab spinner — wait for `getTimeline()` to finish**.
Every millisecond of server timeline latency is user-visible twice: once as feed
skeleton time, once as "the site is still loading" time. The deferred pattern is
correct; the fix is making the deferred work fast and cutting everything else that
competes with it.

**Top contributors found (each expanded in §2, fixed in §3):**

| # | Finding | Layer | Impact |
|---|---------|-------|--------|
| F1 | Announcements re-sent and DB rows discarded on **every** pagination page | server | ~25% payload + DB waste per page |
| F2 | Viewer context (blocks/mutes ×3 queries, follow list, muted words) re-queried on every feed read, uncached | server | 5+ queries per request before the feed query even starts |
| F3 | Missing/weak indexes: no partial feed index, `rmheet_like` has no `(userId, createdAt)` index (interest profile scans), no `(userId, createdAt)` on `rmheet`/`rmheet_repost` for the Following feed | DB | Feed + personalization queries degrade with table growth |
| F4 | Every author row joins `UserProfile` + equipped-`inventory` and re-resolves cosmetics per request | server | Per-row join fan-out on the hottest query |
| F5 | `publishDueForUser` is **awaited** before every first-page feed read | server | Serial DB round-trip on the hot path |
| F6 | No caching for the anonymous first page; no `Cache-Control` on `/api/rmharks` | server | Logged-out landing traffic hits full timeline assembly |
| F7 | Home route loader has no `staleTime` — every back-nav re-runs both server fns; the feed result is then **discarded** by the store's hydrate guard | SSR | A full wasted timeline query + 2 RPCs per return visit |
| F8 | `LinkPreview` fetches `/api/oembed` on **mount** for every card with a URL (server then fetches the external site) | client | Up to ~20 fetches + server-side external HTTP at hydration time |
| F9 | `RMHarkOverflowMenu` eagerly imports 6 dialogs (`ReportDialog`, `TipDialog`, `EditPostModal`, `EngagementListModal`, `InsightsModal`, `ShareModal`); `RMHarkActions` eagerly imports `ComposeModal` | bundle | Modal code for click-only UI ships and evaluates during hydration |
| F10 | `userDisplayStore.setUsers` replaces every touched user object each batch → all visible cards re-render on every page append / SSE event | client | Main-thread churn during scroll and live updates |
| F11 | `FeedColumn` subscribes to the whole feed store → header/composer subtree re-renders on every SSE count update | client | Unnecessary re-renders at 60Hz-ish event rates |
| F12 | Muted words are loaded inside `getTimeline` then thrown away; the client separately fetches `/api/preferences/muted-words` on mount | both | One redundant query + one redundant request |
| F13 | Client mount-time request fan-out and image sizing (see §2.13) | client | Connection contention at TTI |

**What is already good (do not regress):** deferred loader with `<Suspense>`/`Await`
streaming; keyset cursor pagination; denormalized engagement counts; bounded
reaction aggregation (`loadReactionSummaries`); `content-visibility: auto` on feed
cards (`.feed-card-cv`); IntersectionObserver-gated view beacons; singleton SSE
connection with per-viewer delivery metadata; 60s announcement cache; memoized
`FeedItem` rows; module-level feed store that survives navigation; **no client
feed fetch on first load** (the store hydrates from the SSR-streamed page);
idle-gating (`useIdleReady`) on announcements/onboarding/right-sidebar widgets;
ref-counted singleton hooks so the twice-mounted `LeftSidebar` fetches once;
post images via `OptimizedImage`/`BlurImage` with srcSet + native lazy loading.

---

## 1. How the feed loads today (request trace)

### 1.1 First visit (SSR)

```
GET /
├─ root loader: getInitialUser() + getInitialI18n()      (request-scoped session memo — shared)
├─ page loader: returns { sidebar: <promise>, initialFeed: <promise> }  (UNAWAITED)
├─ shell HTML flushes (feed skeleton paints)
├─ fetchInitialFeed → getRequestSession → getTimeline({ surface:'foryou', limit:20 })
│    ├─ [await] publishDueForUser(viewer)               ← F5: serial, awaited in API route only (see below)
│    ├─ Promise.all: getHiddenAuthorIds (3 queries) + follow findMany   ← F2
│    ├─ Promise.all: rMHark.findMany + rMHarkRepost.findMany
│    │     each include: user(+profile,+inventory) / likes / reposts /  ← F4
│    │     bookmarks / unlocks / poll(options,_count,votes) / original(+user)
│    ├─ loadReactionSummaries (groupBy + findMany)
│    ├─ buildInterestProfile (rMHarkLike.findMany take 80)              ← F3: no index
│    ├─ getAnnouncementItems (60s cache) + interleave 3:1               ← F1
│    └─ getMutedWords (userProfile.findUnique) → applied → DISCARDED    ← F12
├─ initialFeed data streams into <Suspense> slot; store hydrates
└─ document stream closes → tab spinner finally stops
```

(`publishDueForUser` runs in the `/api/rmharks` GET handler, i.e. on pagination and
client-driven first pages — not inside `fetchInitialFeed`. Both paths are hot.)

### 1.2 Hydration burst (client, ~same moment)

Immediately at hydration, signed-in (full inventory in §2.13):

- `GET /api/auth/get-session`, `GET /api/profile/me`,
  `GET /api/preferences/appearance`, `GET /api/preferences/muted-words` (F12),
  `GET /api/notifications/unread-count`, `POST /api/streak`,
  `POST /api/presence/heartbeat` — **each** with its own server-side session +
  entitlements resolution.
- `useFeedSSE` opens `EventSource('/api/feed/stream')` (server: session + full
  follow-graph query per connection).
- Every card with a bare URL fires `/api/oembed?...` on mount (F8); Tenor
  share-URL GIFs do the same (`GifEmbed`).
- One eager blur-placeholder image request per post image, raw unproxied avatar
  per card, one eager CDN SVG per distinct emoji (§2.13).
- Twemoji parses all streamed feed DOM on the main thread (batched, acceptable).

(Widgets that are already idle-gated — messages SSE, announcements, onboarding,
right-sidebar presence/today — arrive after idle; that pattern is the model for
Fix 3.3.)

### 1.3 Pagination

`GET /api/rmharks?limit=20&filter=all&cursor=…` → session resolution (Better Auth +
entitlements via `customSession`) → `publishDueForUser` skipped (cursor present) →
same timeline assembly as above **including announcements re-interleaved** (F1).

### 1.4 Back-navigation to `/`

Route loader re-runs (no `staleTime`) → 2 server-fn RPCs (separate HTTP requests,
separate session resolutions) → full `getTimeline` runs server-side → client store
is already seeded, so `hydrate()` **no-ops and the payload is discarded** (F7).

---

## 2. Findings in detail

### 2.1 (F1) Announcements are re-sent on every page and waste fetched rows

`lib/feed/timeline.ts` `getForYouTimeline` filters announcements only by
`createdAt < cursorDate` (timeline.ts:560–563). Game/app announcements carry the
static date `2025-01-01`, so on every pagination page (cursor dates are 2026)
**all of them pass the filter**, get re-sorted, and the same top ~5 are interleaved
3:1 again. Consequences per page:

- Up to 5 of 20 fetched RMHark rows are sliced off and thrown away (fetched from
  the DB with the full include tree, never sent).
- ~25% of every page payload is duplicate announcement JSON. The client silently
  drops the dupes (`fetchNextPage` filters by existing id in `stores/feedStore.ts:249`),
  which hides the bug but keeps the waste.

### 2.2 (F2) Per-request viewer context is uncached

Every feed read runs, before or beside the main query:

- `getHiddenAuthorIds` (`lib/moderation.server.ts:12–29`) — **3 parallel queries**
  (blocks, mutes, blocked-by). Uncached.
- Viewer follow list (`prisma.follow.findMany`) — run in `getForYouTimeline`,
  again in `getFollowingTimeline`, again in `getSidebarData`
  (`lib/sidebar-data.ts:192`), and once per SSE connection
  (`app/routes/api/feed/stream.ts:36`). Uncached.
- `getMutedWords` (`userProfile.findUnique`) — every read. Uncached.

These change rarely and have obvious invalidation points (block/mute/follow/mute-word
mutations). At 6+ queries per feed page they dominate the pre-query latency.

### 2.3 (F3) Missing indexes

From `prisma/schema.prisma`:

- `RMHark` has `@@index([createdAt(sort: Desc), id(sort: Desc)])` — the keyset
  order — but the hot query also filters `deletedAt IS NULL AND communityId IS NULL
  AND threadRootId IS NULL`. A **partial index** with exactly those predicates makes
  the scan skip dead/community/thread rows instead of filtering them post-read.
- `RMHark` has no `(userId, createdAt DESC, id DESC)` index → the Following feed
  (`userId IN (…) ORDER BY createdAt DESC, id DESC`) can't do an ordered
  per-author scan.
- `RMHarkRepost` has `@@index([userId])` and the keyset index, but not
  `(userId, createdAt DESC, id DESC)` → same problem for Following reposts.
- `RMHarkLike` has **only** `@@unique([rmheetId, userId])` → `buildInterestProfile`
  (`lib/feed/personalize.server.ts:65–71`: `where { userId } orderBy createdAt desc
  take 80`) cannot use an index at all — full scan of the likes table per cold
  profile build.

### 2.4 (F4) Per-author profile + inventory joins on the hottest query

`userDisplaySelect` (`lib/user-display.ts:11–29`) selects 8 user columns **plus**
`profile { displayName, customImage }` **plus** `inventory { where: { equipped:
true } }`, and `resolveUser` recomputes equipped cosmetics per row. This runs for
the author of every post, every quoted original's author, and every reposter — on
every request. The resolved display object is viewer-independent and changes only
when a user edits their profile or equips an item, making it an ideal short-TTL
cache (or denormalization) candidate.

### 2.5 (F5) `publishDueForUser` awaited on the hot path

`app/routes/api/rmharks.ts:44–46`: on every signed-in first-page fetch, the handler
`await`s a `scheduledPost.findMany` (plus potential publishes) **before** starting
`getTimeline`. In the common case (no due posts) this adds a full serial round-trip
to every first-page load for the sake of a rare event.

### 2.6 (F6) No anonymous-page caching

The anonymous For-You first page (`userId: null`, `filter: 'all'`, no cursor, no
search) is identical for every signed-out visitor, yet each request runs full
timeline assembly. There is also no `Cache-Control` header on `/api/rmharks` GET.

### 2.7 (F7) Home loader re-runs and its result is discarded

`app/routes/_site/index.tsx` sets no `staleTime`, and TanStack Router's default is
0 → every navigation to `/` re-runs the loader. On client-side navs each server fn
is its own HTTP request with its own session/entitlement resolution. The feed store
is module-level and already populated after the first visit, so
`hydrate()` (`stores/feedStore.ts:205–212`) intentionally no-ops — the entire
`fetchInitialFeed` round-trip (a full 20-item timeline query) is thrown away.
`defaultPreload: 'intent'` (`app/router.tsx`) makes this worse: hovering any link
to `/` triggers the same wasted work (mitigated only by the 30s preload stale time).

### 2.8 (F8) LinkPreview fetches on mount, per card

`components/feed/LinkPreview.tsx:25–54` fires `/api/oembed?type=og&url=…` in a mount
effect. A first page where many posts contain links issues that many parallel
fetches during hydration; each one makes the **server** fetch the external URL
(SSRF-guarded, but still an outbound HTTP request). Only the module-level `ogCache`
map (per-tab) dedupes. The view beacon in `RMHarkCard` already solved this exact
problem with IntersectionObserver — LinkPreview should do the same.

### 2.9 (F9) Click-only modals are eagerly bundled and evaluated

`components/feed/RMHarkOverflowMenu.tsx:26–31` statically imports `ReportDialog`,
`TipDialog`, `EditPostModal`, `EngagementListModal`, `InsightsModal`, `ShareModal`;
`components/feed/RMHarkActions.tsx` statically imports `ComposeModal`. All of it is
pulled into the home-route chunk and evaluated during hydration although none of it
renders until a click. (`EmojiPickerPanel` is already `lazy()` — follow that
pattern.)

### 2.10 (F10) `userDisplayStore.setUsers` invalidates object identity wholesale

`stores/userDisplayStore.ts:18–38`: every batch (`cacheItemUsers` runs on every page
fetch, SSE create, reconcile) builds a **new merged object for every user in the
batch** even when nothing changed. `useFreshUser` subscribers (3 per card:
author, reposter, original author) see new references and re-render. Appending page
2 re-renders every page-1 card whose author reappears; each SSE-created post
re-renders every visible card by that author.

### 2.11 (F11) `FeedColumn` subscribes to the whole feed store

`components/feed/FeedColumn.tsx:45`: `const { setFilter, search, setSearch,
setMutedWords } = useFeedStore()` — a whole-store subscription. Every `updateItem`
(each SSE like/comment/repost count tick) re-renders `FeedColumn` and its header,
search, composer, and announcement children. `RMHarkActions` already demonstrates
the fix (`useFeedStore((s) => s.updateItem)`).

### 2.12 (F12) Muted words: loaded server-side, discarded, re-fetched client-side

`getTimeline` (`lib/feed/timeline.ts:655–668`) loads muted words to filter the page,
then drops them. `FeedColumn` (`components/feed/FeedColumn.tsx:64–76`) fetches
`/api/preferences/muted-words` on mount to filter live SSE posts. Returning the
words with the timeline result eliminates the extra endpoint round-trip at
hydration time.

### 2.13 (F13) Client mount fan-out and images

A signed-in load of `/` fires this at (or just after) hydration, **in addition to**
the document/JS/CSS and the feed itself. Every API call below also costs a
server-side Better Auth session resolution (plus the `customSession` entitlements
lookup):

**Immediate on mount:**
- `GET /api/auth/get-session` — better-auth client re-validates even though the
  shell was SSR-seeded with `initialUser` (`components/Providers.tsx:167`; shared
  nanostore, so it's one request despite many `useSession()` consumers).
- `GET /api/profile/me` (`components/Providers.tsx:263,270–276`) — cosmetic
  display-name/avatar overlay.
- `GET /api/preferences/appearance` (`components/Providers.tsx:418,411–448`) —
  theme/accent sync.
- `GET /api/preferences/muted-words` (`components/feed/FeedColumn.tsx:67`) — F12.
- `EventSource /api/feed/stream` (`hooks/useFeedSSE.ts:92`) — singleton, needed.
- `GET /api/notifications/unread-count` (`lib/useNotificationCount.ts:33`) —
  immediate, then every 45s + on focus.
- `POST /api/streak` (`lib/useStreak.ts`) — auto check-in (once/day guarded).
- `POST /api/presence/heartbeat` (`lib/usePresenceHeartbeat.ts:21`) — immediate,
  then every 60s.

**Idle-gated (already deferred via `useIdleReady` — good):**
`EventSource /api/messages/stream`, `GET /api/onboarding`,
`GET /api/announcements`, and (desktop only) `GET /api/presence/online-count`,
`GET /api/today`, `GET /api/presence/friends`.

**Conditional:** `GET /api/promo/free-month` (established users),
`POST /api/referrals/claim` (pending ref code), `PUT /api/preferences/appearance`
(when device/account values diverge), `GET /api/admin/review-counts` (admins).

**Per-card (×20):**
- View beacons `POST /api/rmharks/{id}/view` — already IntersectionObserver-gated
  (`RMHarkCard.tsx:142–172`); only near-viewport cards fire. Good.
- `GET /api/oembed?type=og&url=…` per linked post on **mount** (F8).
- `GET /api/oembed?url=…` per Tenor *share*-URL GIF on **mount**
  (`components/feed/GifEmbed.tsx:75–88`; direct media URLs skip it) — same
  problem/fix as F8.

**Images:**
- Post images go through `PostImageGrid` → `ui/BlurImage` → `ui/OptimizedImage`
  with srcSet + `loading="lazy"` — good — **but** the 32px blur placeholder
  `<img>` (`components/ui/BlurImage.tsx:114–125`) has no `loading` attribute →
  one **eager** request per post image, even far below the fold.
- Feed avatars (`components/feed/UserAvatar.tsx:43`) render the **raw external
  URL** (Discord/Google CDN) with no proxy/srcSet/size variant — unlike the shared
  `ui/UserAvatar`, which proxies through `/api/image-proxy`.
- `ComposeBox` author avatar (`ComposeBox.tsx:457`) has no `loading` attribute →
  eager.
- Twemoji (`components/ui/TwemojiProvider.tsx`) rewrites every rendered emoji into
  an `<img src="https://cdn.jsdelivr.net/...svg">` with **no `loading`/`decoding`
  attributes** — one eager external CDN request per distinct glyph visible in the
  feed.

**Verified non-issues:** `FeedList` performs **no** client feed fetch on first load
(it hydrates from the SSR-streamed page); `ProfileHoverCard` fetches on hover-open
only; poll/like/repost/report/tip fetch on click only; the ref-counted sidebar
hooks fire once per page even though `LeftSidebar` mounts twice (desktop rail +
mobile drawer); `MobileNav.tsx` is dead code (not mounted anywhere).

---

## 3. Fix plan

Phases are ordered by (impact ÷ risk). Within a phase, fixes are independent.

**Global definition of done for every fix:** `pnpm exec tsc --noEmit`, `pnpm lint`
(no new warnings), and `pnpm exec vitest run` pass; no new i18n strings without
`t()` + `pnpm i18n:extract`; behavior verified per the fix's own "Done when".

---

### Phase 1 — Server hot path (highest impact)

#### Fix 1.1 — Interleave announcements only on the first page

**Files:** `lib/feed/timeline.ts`

**Change:** in `getForYouTimeline`, skip announcements entirely when a cursor is
present. Delete the `cursorDate` filtering (it no longer has a job).

```ts
// BEFORE (timeline.ts:497–498)
const announcementsPromise: Promise<FeedItem[]> =
  search ? Promise.resolve([]) : getAnnouncementItems(filter);

// AFTER — announcements are a first-page-only garnish; pagination pages are pure posts.
const announcementsPromise: Promise<FeedItem[]> =
  search || cursor ? Promise.resolve([]) : getAnnouncementItems(filter);
```

Then simplify the post-processing (timeline.ts:558–589): remove `cursorDate` /
`filteredAnnouncements` and use `announcements` directly. The interleave loop and the
non-`all` merge branch stay as they are — with an empty announcements array on
cursor pages they naturally emit `dbItems` untouched, and the cursor logic
(anchored to the last RMHark) is unchanged.

**Why safe:** the client already de-dupes by id, so first-page announcements never
duplicate; cursor pages simply stop carrying dead weight. The `filter !== 'all'`
tabs (game/app/blog) show static catalogs — those are first-page-only experiences
already (their items all share one static date; pagination past them yields nothing
new).

**Done when:** requesting page 2 (`cursor` set) of `/api/rmharks?filter=all` returns
20 items, all `type: "rmhark"`, and no `build:*`/`blog:*` ids; page 1 still
interleaves 3:1.

#### Fix 1.2 — Cache viewer context (hidden authors, follow list, muted words)

**Files:** `lib/moderation.server.ts`, new `lib/social/follow-graph.server.ts`,
`lib/feed/timeline.ts`, `lib/sidebar-data.ts`, `app/routes/api/feed/stream.ts`,
plus the mutation endpoints listed below.

**Change A — hidden authors.** Wrap `getHiddenAuthorIds` in `apiCache` (30s TTL —
`lib/cache.ts` singleton), and invalidate on mutation:

```ts
// lib/moderation.server.ts
import { apiCache } from '@/lib/cache';

const HIDDEN_TTL = 30_000;
const hiddenKey = (userId: string) => `hidden-authors:${userId}`;

export async function getHiddenAuthorIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const cached = apiCache.get<string[]>(hiddenKey(userId));
  if (cached) return cached;
  // …existing 3-query Promise.all body…
  apiCache.set(hiddenKey(userId), ids, HIDDEN_TTL);
  return ids;
}

export function invalidateHiddenAuthors(userId: string): void {
  apiCache.invalidate(hiddenKey(userId));
}
```

Call `invalidateHiddenAuthors(session.user.id)` from the block and mute
POST/DELETE endpoints (find them with `grep -rl "userBlock\|userMute" app/routes/api`
— block/unblock and mute/unmute handlers).

**Change B — follow list.** Create one shared, cached reader and use it everywhere
the viewer's follow list is loaded:

```ts
// lib/social/follow-graph.server.ts  (new file)
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';

const TTL = 30_000;
const key = (userId: string) => `following-ids:${userId}`;

/** The ids the viewer follows. Cached ~30s; invalidated on follow/unfollow. */
export async function getFollowingIds(userId: string): Promise<string[]> {
  const cached = apiCache.get<string[]>(key(userId));
  if (cached) return cached;
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const ids = rows.map((f) => f.followingId);
  apiCache.set(key(userId), ids, TTL);
  return ids;
}

export function invalidateFollowingIds(userId: string): void {
  apiCache.invalidate(key(userId));
}
```

Replace the inline `prisma.follow.findMany` calls in `lib/feed/timeline.ts`
(both surfaces), `lib/sidebar-data.ts:192`, and `app/routes/api/feed/stream.ts:36`
with `getFollowingIds(userId)`. Call `invalidateFollowingIds(followerId)` from the
follow/unfollow endpoint(s) (`grep -rl "follow.create\|follow.delete\|follow.upsert" app/routes/api lib`).

**Change C — muted words.** Same pattern around `getMutedWords` in
`lib/feed/timeline.ts` (60s TTL, key `muted-words:{userId}`), invalidated from the
muted-words preferences endpoint (`app/routes/api/preferences/muted-words.ts` or
wherever `mutedWords` is written).

**Note:** `apiCache` is per-process (fine — web SSR is a single process per color in
the blue/green deploy). The 30s staleness window on blocks/follows is acceptable
because the mutating user's own next read is fixed by invalidation; only
*other-instance* staleness would exceed 30s, and there is one web instance.

**Done when:** a feed page for a warm viewer issues no `user_block`/`user_mute`/
`follow`/`user_profile(mutedWords)` queries (verify with the dev query log,
`lib/prisma.server.ts` logs queries in development); blocking a user then reloading
immediately hides them.

#### Fix 1.3 — Add the missing indexes

**Files:** `prisma/schema.prisma` + a migration (`pnpm db:migrate` for dev;
partial indexes need raw SQL in the migration).

**Change A — schema additions (Prisma-expressible):**

```prisma
model RMHark {
  // …existing…
  @@index([userId, createdAt(sort: Desc), id(sort: Desc)])   // Following feed scan
}

model RMHarkRepost {
  // …existing…
  @@index([userId, createdAt(sort: Desc), id(sort: Desc)])   // Following reposts scan
}

model RMHarkLike {
  // …existing…
  @@index([userId, createdAt(sort: Desc)])                   // interest-profile sample
}
```

**Change B — partial index for the For-You scan (raw SQL, added to the generated
migration file, since Prisma can't express partial indexes):**

```sql
-- The For-You feed's exact hot predicate: root, non-community, live posts in keyset order.
CREATE INDEX IF NOT EXISTS "rmheet_feed_scan_idx"
  ON "rmheet" ("created_at" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL AND "community_id" IS NULL AND "thread_root_id" IS NULL;
```

(Confirm the exact snake_case column names against the `@map` attributes in the
model before writing the migration. If any differ, use the mapped names.)

**Done when:** `pnpm db:push`/migration applies cleanly and
`EXPLAIN (ANALYZE, BUFFERS)` on the For-You query shows an index scan on
`rmheet_feed_scan_idx`; the interest-profile query plan uses the new like index.

#### Fix 1.4 — Take `publishDueForUser` off the critical path

**Files:** `app/routes/api/rmharks.ts`

**Change:**

```ts
// BEFORE (rmharks.ts:44–46)
if (userId && !cursor) {
  await publishDueForUser(userId).catch(() => {});
}

// AFTER — fire-and-forget: a just-due scheduled post appears on the next
// read/SSE tick instead of adding a serial DB round-trip to every first page.
if (userId && !cursor) {
  void publishDueForUser(userId).catch(() => {});
}
```

**Trade-off (accepted):** an author whose scheduled post became due in the last few
seconds sees it one refresh later. The SSE `rmhark.created` event (if the publisher
emits one) or the next pagination shows it.

**Done when:** first-page latency for signed-in users no longer includes the
`scheduled_post` query in the serial chain (dev query log timing).

#### Fix 1.5 — Cache the anonymous first page + send `Cache-Control`

**Files:** `lib/feed/timeline.ts` (or `app/routes/api/rmharks.ts`), `app/routes/_site/index.tsx`

**Change:** in `getTimeline`, short-circuit the exact anonymous first-page shape:

```ts
export async function getTimeline(params: GetTimelineParams): Promise<TimelineResult> {
  // The signed-out For-You first page is identical for every visitor — serve it
  // from a short cache so landing traffic doesn't run timeline assembly.
  const anonCacheable =
    !params.userId && params.surface === 'foryou' && params.filter === 'all' &&
    !params.cursor && !params.search;
  const anonKey = 'timeline:anon:first';
  if (anonCacheable) {
    const cached = apiCache.get<TimelineResult>(anonKey);
    if (cached) return cached;
  }
  // …existing body…
  if (anonCacheable) apiCache.set(anonKey, finalResult, 30_000);
  return finalResult;
}
```

`apiCache` is already imported in this file. 30s staleness for logged-out browsing
is invisible (their SSE stream still delivers new posts live).

Optionally also add `headers: { 'Cache-Control': 'private, max-age=15' }` to the
`/api/rmharks` GET response **only when `userId === null`** — do NOT add any shared
(`public`) caching, the CDN must never cache a cookie-authenticated feed.

**Done when:** two anonymous first-page requests within 30s produce one set of
timeline queries (dev query log); signed-in responses are unchanged and carry no
cache header.

#### Fix 1.6 — Stop re-running the home loader on every navigation

**Files:** `app/routes/_site/index.tsx`

**Change:** add `staleTime` to the route so back-navs inside a session reuse loader
data (the feed store already keeps the live timeline; the loader's job is only the
first paint):

```ts
export const Route = createFileRoute('/_site/')({
  validateSearch: /* …unchanged… */,
  // Back-nav / repeat visits within 60s reuse the cached loader payload. The feed
  // store (module-level) is the live source of truth after hydration — the loader
  // result is only consumed by a pristine store, so re-running it sooner is waste.
  staleTime: 60_000,
  loader: () => ({ sidebar: fetchSidebarData(), initialFeed: fetchInitialFeed() }),
  /* …unchanged… */
});
```

**Done when:** navigating away from `/` and back within 60s issues **zero**
server-fn requests (network tab), and the feed still renders instantly from the
store; after 60s the loader refreshes as before.

---

### Phase 2 — Payload & request-count reductions

#### Fix 2.1 — Return muted words with the timeline; drop the client fetch

**Files:** `lib/feed/timeline.ts`, `components/feed/FeedColumn.tsx`,
`components/feed/FeedList.tsx` (hydrate call site), `stores/feedStore.ts`

**Change:** `getTimeline` already has the words in hand — return them:

```ts
export interface TimelineResult {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
  empty?: boolean;
  /** Viewer's muted words (signed-in only) so the client can filter live SSE posts
   *  without a second round-trip. */
  mutedWords?: string[];
}

// in getTimeline():
if (!muted.length) return { ...result, mutedWords: muted };
return { ...result, items: applyMutedWords(result.items, muted), mutedWords: muted };
```

- `app/routes/_site/index.tsx` `fetchInitialFeed` passes it through:
  `return { items, nextCursor, hasMore, mutedWords: feed.mutedWords ?? [] }`.
- `components/feed/FeedColumn.tsx`: add `mutedWords?: string[]` to the
  `InitialFeed` interface and forward it to `FeedList` as an
  `initialMutedWords` prop.
- `components/feed/FeedList.tsx`: pass it into the seed call —
  `hydrate(initialItems, initialCursor, initialHasMore, initialMutedWords)`.
- `stores/feedStore.ts`: `hydrate(items, cursor, hasMore, mutedWords?)` sets
  `mutedWords` when provided; `fetchNextPage`/`refresh` also
  `set({ mutedWords: data.mutedWords ?? state.mutedWords })`.
- `components/feed/FeedColumn.tsx:64–76`: **delete** the
  `/api/preferences/muted-words` mount fetch entirely.

**Done when:** the home page issues no request to `/api/preferences/muted-words`,
and a live SSE post containing a muted word still never appears.

#### Fix 2.2 — Defer LinkPreview fetches until the card is near the viewport

**Files:** `components/feed/LinkPreview.tsx`

**Change:** gate the fetch behind an IntersectionObserver (mirror the view-beacon
pattern in `RMHarkCard.tsx:142–172`):

```ts
export function LinkPreview({ url, className = '' }: LinkPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<OgData | null>(() => ogCache.get(url) ?? null);
  const [loading, setLoading] = useState(() => !ogCache.has(url));
  const [imgError, setImgError] = useState(false);

  // Only fetch once the card approaches the viewport — a first feed page with many
  // links must not fan out N oembed requests (each a server-side external fetch)
  // during hydration.
  useEffect(() => {
    if (ogCache.has(url) || visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [url, visible]);

  useEffect(() => {
    if (!visible || ogCache.has(url)) return;
    // …existing fetch body unchanged…
  }, [visible, url]);

  // Attach ref to BOTH branches' root so observation works while loading:
  if (loading) return <div ref={ref} className={/* …existing skeleton… */} />;
  // …and wrap the <a> in the same measured element or put ref on a wrapper div.
}
```

Keep the skeleton state for not-yet-visible cards (it reserves layout, preventing
CLS when the preview loads).

**Done when:** loading the feed with many linked posts fires oembed requests only
for cards within ~1 viewport of the fold, and more as you scroll.

#### Fix 2.3 — Lazy-load click-only modals out of the home chunk

**Files:** `components/feed/RMHarkOverflowMenu.tsx`, `components/feed/RMHarkActions.tsx`

**Change (pattern already used by `EmojiPickerButton`):**

```tsx
// RMHarkOverflowMenu.tsx — replace the six static modal imports with:
import { lazy, Suspense } from 'react';
const ReportDialog = lazy(() => import('@/components/moderation/ReportDialog').then(m => ({ default: m.ReportDialog })));
const TipDialog = lazy(() => import('@/components/economy/TipDialog').then(m => ({ default: m.TipDialog })));
const EditPostModal = lazy(() => import('./EditPostModal').then(m => ({ default: m.EditPostModal })));
const EngagementListModal = lazy(() => import('./EngagementListModal').then(m => ({ default: m.EngagementListModal })));
const InsightsModal = lazy(() => import('./InsightsModal').then(m => ({ default: m.InsightsModal })));
const ShareModal = lazy(() => import('./ShareModal').then(m => ({ default: m.ShareModal })));
```

Wrap each conditional render site in `<Suspense fallback={null}>` (the modals are
open/closed by state, so a null fallback flashes nothing). If a modal is a named
export, keep the `.then(m => ({ default: m.X }))` shim as above.

Same treatment for `ComposeModal` in `RMHarkActions.tsx` (it renders only when
`quoteOpen`).

**Important:** these components must remain rendered **conditionally**
(`{open && <Suspense>…`) so the dynamic import only happens on first open.

**Done when:** `pnpm build` output shows the modal code in separate chunks (grep the
client manifest for `InsightsModal`/`ShareModal`), and opening each modal from the
feed still works (first open may show a one-frame delay — acceptable).

#### Fix 2.4 — Request sized image variants in the feed

**Files:** `components/feed/PostImageGrid.tsx` (and the avatar component if it
renders raw URLs — see §2.13).

**Change:** `/api/feed/image/$filename` already supports `?w=` +
`format` negotiation with immutable caching (`app/routes/api/feed/image/$filename.ts:33–58`).
Feed cards render at most ~600px columns; request that size instead of the stored
2048px original. For images served from that endpoint, append the width param:

```ts
/** Feed grid renders ≤ ~600px wide; ask the image route for that variant. */
function feedVariant(url: string): string {
  if (!url.startsWith('/api/feed/image/')) return url; // external GIF/CDN URLs untouched
  return `${url}${url.includes('?') ? '&' : '?'}w=640`;
}
```

Use `feedVariant(u)` for grid `<img src>`, keep the full-size URL for the
lightbox/detail view. Ensure every feed `<img>` has `loading="lazy"`
`decoding="async"`, and explicit `width`/`height` or an aspect-ratio container
(prevents CLS; the grid already constrains layout — verify).

**Done when:** feed image requests carry `?w=640`, transfer sizes drop accordingly,
and the post-detail page still loads the full-resolution image.

---

### Phase 3 — Client render efficiency

#### Fix 3.1 — Stop `setUsers` from churning object identity

**Files:** `stores/userDisplayStore.ts`

**Change:** skip the write when the merge is a no-op, and only replace changed
entries:

```ts
setUsers: (users) => {
  set((state) => {
    let changed = false;
    const next = { ...state.cache };
    for (const u of users) {
      if (!u.id) continue;
      const existing = next[u.id];
      if (!existing) {
        next[u.id] = u;
        changed = true;
        continue;
      }
      const merged = {
        ...existing,
        ...u,
        image: u.image ?? existing.image,
        name: u.name ?? existing.name,
      };
      // Identity-stable when nothing actually changed, so useFreshUser
      // subscribers (3 per visible card) don't re-render on every batch.
      const dirty = (Object.keys(merged) as (keyof typeof merged)[]).some(
        (k) => merged[k] !== existing[k],
      );
      if (dirty) {
        next[u.id] = merged;
        changed = true;
      }
    }
    return changed ? { cache: next } : state;
  });
},
```

Caveat: `cosmetics` is a nested object — if the server sends a fresh object each
time, the shallow `!==` will mark it dirty. If profiling still shows churn, compare
`cosmetics` by `JSON.stringify` or keep the previous reference when
`JSON.stringify` matches. Start with the shallow version; measure.

**Done when:** with React DevTools profiler, appending page 2 re-renders only the
new rows, not page-1 cards.

#### Fix 3.2 — Selector-based subscriptions in `FeedColumn`

**Files:** `components/feed/FeedColumn.tsx`

**Change:**

```ts
// BEFORE
const { setFilter, search, setSearch, setMutedWords } = useFeedStore();

// AFTER — actions have stable identities; `search` is the only reactive value.
const setFilter = useFeedStore((s) => s.setFilter);
const search = useFeedStore((s) => s.search);
const setSearch = useFeedStore((s) => s.setSearch);
const setMutedWords = useFeedStore((s) => s.setMutedWords); // deleted by Fix 2.1
```

(`FeedList` legitimately needs `items`/`loading`/`pendingItems` etc.; its
whole-store subscription is fine because it renders those.)

**Done when:** React DevTools profiler shows SSE count updates re-rendering only
`FeedList` + the affected card, not the header/composer subtree.

#### Fix 3.3 — Defer non-critical boot fetches to idle

**Files:** `components/Providers.tsx`, `lib/useNotificationCount.ts`,
`lib/useStreak.ts`, `lib/usePresenceHeartbeat.ts`

**Change:** the repo already has the right primitive — `useIdleReady` (used by
`FeedAnnouncements`, `OnboardingChecklist`, the right-sidebar widgets). Apply it to
the remaining mount-time calls that are cosmetic or tolerant of a few seconds'
delay, so the hydration window belongs to the feed, images, and SSE:

- `components/Providers.tsx` — gate the `/api/profile/me` and
  `/api/preferences/appearance` effects on idle (both only *overlay* data the SSR
  seed already provides; a 1–2s delay is invisible).
- `lib/useNotificationCount.ts` — delay the first `unread-count` fetch to idle;
  keep the 45s/focus cadence.
- `lib/useStreak.ts` / `lib/usePresenceHeartbeat.ts` — delay the initial
  `POST` to idle; keep the intervals.

Implementation note: these are hooks/effects, so either consume `useIdleReady()`
where they're mounted or add the idle gate inside the hook itself (preferred —
every consumer benefits). Follow the exact pattern in
`components/feed/OnboardingChecklist.tsx`.

**Do NOT defer:** `/api/auth/get-session` (auth correctness),
`/api/feed/stream` (live feed), or anything already idle-gated.

**Done when:** the Network tab for the first ~1.5s after load shows only:
document, assets, `get-session`, `feed/stream`, above-fold images/beacons — with
profile/appearance/notification/streak/presence calls arriving after idle.

#### Fix 3.4 — Apply the Fix-2.2 IntersectionObserver gate to `GifEmbed`

**Files:** `components/feed/GifEmbed.tsx`

**Change:** Tenor *share* URLs trigger a `/api/oembed` resolution fetch on mount
(`GifEmbed.tsx:75–88`). Gate it behind the same near-viewport IntersectionObserver
as Fix 2.2 (share one small `useNearViewport(ref, rootMargin)` hook between
`LinkPreview` and `GifEmbed` — put it in `hooks/useNearViewport.ts`). The existing
`tenorCache` module map stays.

**Done when:** GIF share-URL resolutions only fire for cards near the viewport.

#### Fix 3.5 — Image loading attributes and avatar variants

**Files:** `components/ui/BlurImage.tsx`, `components/feed/UserAvatar.tsx`,
`components/feed/ComposeBox.tsx`, `components/ui/TwemojiProvider.tsx`

**Changes (each independent, one-liners except the avatar):**

1. **BlurImage placeholder:** add `loading="lazy" decoding="async"` to the 32px
   blur placeholder `<img>` at `BlurImage.tsx:114–125` (mirror whatever
   priority/eager prop the full image honors, if one exists).
2. **ComposeBox avatar:** add `loading="lazy" decoding="async"` at
   `ComposeBox.tsx:457`.
3. **Feed avatars:** `components/feed/UserAvatar.tsx:43` renders raw external
   avatar URLs. Route them through the same proxy/variant path as
   `components/ui/UserAvatar` (`/api/image-proxy` with a small width) so 20 cards
   don't each pull a full-size Discord/Google avatar. Reuse the shared component
   or its URL builder rather than duplicating logic — check
   `components/ui/OptimizedImage.tsx:36–59` for the helper.
4. **Twemoji:** pass an `attributes` callback so emoji `<img>`s are lazy:

```ts
// components/ui/TwemojiProvider.tsx — extend PARSE_OPTIONS:
const PARSE_OPTIONS = {
  folder: 'svg',
  ext: '.svg',
  className: 'emoji',
  callback: twemojiCallback,
  attributes: () => ({ loading: 'lazy', decoding: 'async' }),
} as const;
```

**Done when:** below-fold feed images produce no placeholder requests until
scrolled near; avatar requests are small proxied variants; emoji SVG requests for
below-fold content don't fire at load.

---

### Phase 4 — Deeper work (do after measuring Phases 1–3)

#### Fix 4.1 — Cached batched author-display loader (removes the per-row joins, F4)

**Status: implemented.** `lib/user-display.server.ts#getUserDisplayMap` resolves
authors in one batched, per-id-cached (60s) read; `lib/feed/timeline.ts` selects
only the scalar `userId` (the `user`/`original.user` joins are gone) and looks
authors up through the map. Invalidated on profile edit, avatar change, and
cosmetic equip/unequip (`invalidateUserDisplay`).

**Files:** `lib/user-display.ts` (new server variant), `lib/feed/timeline.ts`

**Sketch:** split the feed query from author resolution:

1. Remove `user: { select: userDisplaySelect }` (and `original.user`, repost `user`)
   from the includes; select only the id columns.
2. After the query, collect distinct author ids and resolve through a new
   `getUserDisplayMap(ids: string[])` in a `lib/user-display.server.ts`:
   - check `apiCache` per id (`user-display:{id}`, TTL 60s),
   - one `prisma.user.findMany({ where: { id: { in: misses } }, select: userDisplaySelect })`
     for the misses,
   - `resolveUser` each, cache, return a `Map`.
3. Map ids → display objects during item mapping.
4. Invalidate `user-display:{id}` from profile-edit and shop equip/unequip
   endpoints (`grep -rl "profile.update\|equipped" app/routes/api lib/shop`).

This drops two joins per author per request to (amortized) zero, at the cost of a
60s cosmetics-staleness window (mitigated by invalidation for the editing user).
**Do this only if the Phase-1 query-log timing still shows the include tree
dominating** — it touches the same mapping used by every card and must ship with a
side-by-side JSON diff of `/api/rmharks` output before/after (shapes must be
identical).

#### Fix 4.2 — Trim the poll include for the common case

Most posts have no poll, but the include tree always joins
`poll → options → (_count.votes, viewer votes)`. If Prisma query logs show the poll
join costing, restructure like reactions: select `poll: { select: { id: true } }`
in the main query, then batch-load full poll data only for the (usually zero) posts
that have one. Same "identical output shape" bar as Fix 4.1.

#### Fix 4.3 — Windowed rendering / store cap (only if long-session scrolling degrades)

`content-visibility: auto` already skips offscreen layout/paint, but the DOM and
store still grow unboundedly during long infinite-scroll sessions. If profiling
shows degradation past ~300 items: virtualize `FeedList` with
`@tanstack/react-virtual` (keep `.feed-card-cv` for the rendered window), or
cheaper: cap `items` at ~400 on append (drop from the head, keeping `hasMore`
pagination intact; back-scroll re-fetches via cursor). Interacts with scroll
restoration (`hooks/useScrollRestoration.ts` + `html.nav-restoring` CSS) — test
back-nav restore explicitly.

#### Fix 4.4 — Redis-backed shared caches (only if the web tier goes multi-instance)

All Phase-1 caches use in-process `apiCache`, which is correct for the current
single-instance blue/green deploy. If SSR is ever horizontally scaled, move the
viewer-context caches (Fix 1.2) and anon first page (Fix 1.5) behind
`redisGetJSON`/`redisSetJSON` (`lib/redis.server.ts` no-ops without `REDIS_URL`, so
the code path can ship dormant).

---

## 4. Measurement & verification

Before/after each phase, capture:

1. **Server timing:** in dev, `lib/prisma.server.ts` logs queries — count queries
   and total time for `GET /api/rmharks?limit=20&filter=all` signed-in (warm and
   cold cache). Target after Phase 1: ≤ 6 queries warm (main pair + reactions pair
   + interest-profile hit), no serial pre-queries.
2. **EXPLAIN:** `EXPLAIN (ANALYZE, BUFFERS)` for the For-You and Following queries
   before/after Fix 1.3.
3. **Tab-loading time:** DevTools Network → `document` request duration for `/`
   (this is the stream-open time the user reported). It should approach the
   timeline latency, which Phase 1 cuts.
4. **Hydration request count:** Network tab request count in the first 3s after
   load, signed-in with a 20-post feed containing links. Fixes 2.1/2.2/3.3 should
   remove `/api/preferences/muted-words`, most `/api/oembed`, and below-fold image
   requests from that burst.
5. **Bundle:** `pnpm build` then compare the home-route chunk size (Fix 2.3).
6. **RUM:** `lib/rum.ts` already reports Web Vitals to `/api/rum` — watch LCP/INP
   for the `/` route across a deploy.
7. **Regression suite:** `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run`.

**Feature-level regression checklist (manual):**
- Page 1 shows composer + announcements interleaved; page 2+ pure posts.
- Muted words filter both fetched pages and live SSE posts.
- Blocking/muting a user hides them on the next reload.
- Following/unfollowing updates the Following tab within ~30s (cache TTL) and
  immediately after the mutating user's own action.
- Locked (paid) posts still render the paywall teaser everywhere.
- Back-nav to `/` restores scroll position instantly with no loader request.
- Announcement cards, polls, quote cards, reactions, translations all render as before.

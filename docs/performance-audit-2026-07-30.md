# Website Performance Audit — 2026-07-30

A follow-on pass over the tree after the 2026-07-17 full-stack audit and the
2026-07-29 3D audit. Both of those were largely implemented, so this pass
deliberately looked **only for things they did not cover**, and every finding
below was re-verified against the code as it exists today.

Read the two prior documents first — they are still accurate and their
"already healthy / do not re-fix" lists still hold:

- [`performance-audit-2026-07-17.md`](performance-audit-2026-07-17.md) — DB
  indexes, FTS search paths, bundle splitting, SSR i18n, virtualized timelines,
  serving topology.
- [`3d-performance-audit.md`](3d-performance-audit.md) — the WebGL games: render
  tiers, DPR clamps, instancing/culling, bloom resolution, glTF conversion.

**Method.** Four sweeps, each mechanical rather than by inspection, so the
result is a complete set for its category rather than a sample:

1. Every `@relation(fields: [...])` column in `schema.prisma` checked against
   whether it leads any index, then cross-referenced against the queries that
   actually filter on it (scripts in the commit message trail; they are throwaway).
2. Every repeating client timer (`setInterval` + `requestAnimationFrame`) and
   what it costs per minute.
3. Every `getComputedStyle` call site, checked for whether it sits in a frame loop.
4. Every `findMany` without a `take`.

---

## What shipped in this pass

| #   | Change                                                      | Effect                                                                            | Where                                                                |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `POST /api/pulse` + shared client pulse replaces 4 pollers  | idle signed-in tab: **5 → 2 requests/min**, **4 → 1** session resolutions         | `app/routes/api/pulse.ts`, `lib/pulse.ts`                            |
| 2   | Notification writes no longer awaited on like/unlike/follow | **~3 fewer serial queries** in front of the response on the hottest write path    | `lib/social/engagement.server.ts`                                    |
| 3   | Comment notification block deferred as a unit               | **~4–12 fewer serial queries** in front of the comment response                   | `lib/social/engagement.server.ts`                                    |
| 4   | Hashtag linking batched                                     | **3N → 5 fixed** queries, and the post-create transaction closes far sooner       | `lib/tags-extract.server.ts`                                         |
| 5   | Five missing predicate indexes                              | two per-viewer seq scans per presence poll, plus the notification dedupe, removed | `prisma/schema.prisma` + `20260730120000_hot_path_predicate_indexes` |
| 6   | `getComputedStyle` hoisted out of the slice-it frame loop   | removes **1 + N forced style recalcs per frame** (N = visible hold notes)         | `components/game/GameCanvas.tsx`                                     |
| 7   | Song comment list bounded                                   | removes an unbounded public payload                                               | `app/routes/api/slice-it/songs/$id/comments.ts`                      |

Verified: `tsc --noEmit` clean, `eslint` 0 errors and **no new warnings**
(GameCanvas was 13 warnings before and after), `vitest run` 252 files / 4600
tests green, production `vite build` green.

### 1. The idle tab made five authenticated requests a minute

Each of these was individually well behaved — ref-counted module singleton,
idle-deferred, visibility-aware — but none of them knew about the others, so a
signed-in tab with the shell mounted ran five timers and the server resolved the
session five times a minute before doing any actual work:

| Timer                                 | Interval | Owner                                 |
| ------------------------------------- | -------- | ------------------------------------- |
| `POST /api/presence/heartbeat`        | 60s      | `lib/usePresenceHeartbeat`            |
| `GET /api/notifications/unread-count` | 45s      | `lib/useNotificationCount`            |
| `GET /api/presence/friends`           | 60s      | `components/feed/FriendsOnlineWidget` |
| `GET /api/friends/active`             | 60s      | `hooks/useActiveFriends`              |
| `GET /api/presence/online-count`      | 60s      | `components/radial/RadialLiveRail`    |

The first four are now one `POST /api/pulse`. The payload is **demand-driven**:
the client sends the union of the sections its currently-mounted consumers need,
so a phone (where the friends rail is `display: none`) never makes the server run
the follow-graph fan-out, and a tab with only the nav badge mounted pays for one
counter read. The presence heartbeat is the request's side effect, so simply
having any subscriber keeps the user "online now".

`online-count` was **deliberately left out**. It needs no session, is identical
for every visitor, and ships as a cacheable `GET` with `max-age=30`. Folding it
into a per-user `POST` would have converted a shared, edge-cacheable response
into an uncacheable one — a net loss.

The four replaced endpoints still exist and still work; nothing in the app calls
them. `full-rewrite-design-2026-07-18.md:811` carries the acceptance criterion
"`/api/notifications/unread-count` QPS reduced >90% in prod" — this is that.

`lib/pulse.ts` keeps the properties the hooks it replaced had earned, and
`lib/__tests__/pulse.test.ts` pins them: section demand ref-counting, one shared
in-flight request, a mid-flight subscriber not having to wait a full interval for
a newly-demanded section, "absent section ≠ empty section", and a response that
raced teardown being unable to repopulate the cache.

### 2–3. Engagement responses waited on notification writes

`setPostLike` had already been optimized (parallel lookups, a 2-query core
transaction, progression enqueued to pg-boss) — but it then **awaited**
`createNotification`, which is itself a preference read, an unread-dedupe
`findFirst`, and an insert-or-update. Three serial round trips in front of the
response, on the site's highest-frequency write, for a side effect the liker
never observes. Same shape on unlike, follow, and unfollow.

The comment path was worse: a parent-author lookup, up to two notification
chains, and mention resolution — all serial, all in front of the response.

All of these are now deferred. They were already wrapped in internal
`try`/`catch` and swallow their own errors, so voiding them changes no error
semantics. The comment block is deferred as a unit and closes over values already
in scope, so it issues no extra reads.

The follow path additionally awaited three serial `progressAchievement` upserts
against the _followed_ user's rows; those are now deferred the same way, next to
the `enqueueProgression` call that was already voided.

### 4. Hashtag linking ran three queries per tag inside the post-create transaction

`linkPostHashtags` looped per tag doing `upsert` + `create` + `update`. A
10-hashtag post was 30 serial round trips **while holding the post-create
interactive transaction open**, pinning a pool connection for the sum of all of
their latencies. Now five statements regardless of tag count.

The set-difference step (which tags are _newly_ linked) is computed rather than
assumed: on the create path it is always empty, but the same function runs when a
post's content is re-linked, and double-counting there would permanently skew
trending.

`unlinkPostHashtags` went from 1 + N to 3.

### 5. Five predicate indexes

The FK sweep found **83 relation columns that lead no index**. That number is
misleading and is the most useful thing in this document, so it gets its own
section below. Five had a live read path:

- `rmhtube_room_member(userId, leftAt)` and `rmh_music_room_member(userId, leftAt)`
  — the social-presence fan-out asks "which of these online users are in an open
  room" on a per-viewer poll. Both tables were indexed only as `(roomId, userId)`,
  so the userId-leading lookup **seq-scanned both membership tables on every
  poll**. This was the single worst find of the pass.
- `notification(userId, read, type, entityId)` — the unread-dedupe `findFirst`
  and the retraction `deleteMany` matched on `(userId, actorId, type, entityType,
entityId, read=false)` with only `(userId, read, createdAt)` available, so both
  scanned every unread row the recipient holds — on every like, comment, follow
  and unlike.
- `SongComment(songId, createdAt DESC)` — this model carried **no index at all**,
  so every song page scanned and sorted the whole table.
- `prediction(creatorId, status)` — the per-author pending-submission cap,
  counted on every market creation.

### 6. `getComputedStyle` inside the slice-it draw loop

`getComputedStyle()` flushes pending style and layout. `components/game/GameCanvas.tsx`
called it **once per frame** for the background colour and **again per visible
LONG note**, inside the per-slice loop — several forced style recalculations per
frame, on the one screen in the app where frame timing _is_ the gameplay. Six
theme values are now resolved once and invalidated by a `MutationObserver` on the
`<html>` class/style attributes (which is what `DarkModeWrapper` toggles).

This also fixed a latent visual bug: the per-note read resolved
`--slice-hold-trail` against `document.documentElement`, but the `--slice-*`
palette is scoped to `.slice-theme` (a wrapper `div`). The lookup therefore
returned `""` and silently fell back to the hard-coded light-mode trail colour in
both themes. Reading from the canvas resolves it correctly.

The sweep found no other `getComputedStyle` in a frame loop. In particular
`lib/liquid-gl/` — the site-wide WebGL layer, the one place where this would hurt
every page — is clean by construction: `readSceneStatic()` uses
`getComputedStyle` once per theme change, and the per-frame `readLiveInputs()`
reads inline `element.style`, which does not flush.

---

## The 83 unindexed foreign keys, and why only five were indexed

This is the finding most likely to be re-discovered and over-corrected later, so
the reasoning is recorded here.

83 of 328 relation columns lead no index. Postgres does not auto-index FK
columns, so the instinct is to add 83 indexes. **Don't.** Almost all 83 are only
reachable two ways, and both turn out to be closed:

1. **A hard delete of the parent row.** For the ~50 `Cascade` FKs pointing at
   `User`, that would be `DELETE FROM user`, which this codebase never does:
   `app/routes/api/account/delete.ts` is an _erasure_ — it deletes credentials
   and scrubs the profile, deliberately leaving the row and its authored content
   in place ("rather than a hard row delete, which risks foreign-key failures
   across the ~199-model schema"). No user row is ever deleted, so no
   `userId`-leading cascade scan ever runs.

2. **The parent-id direction of a post/comment cascade.** That direction is
   already indexed everywhere it matters — `rmheet_view`, `rmheet_reaction`,
   `rmheet_poll_vote`, `rmheet_comment_like`, `rmheet_comment_reaction`,
   `rmheet_comment_repost` and `rmheet_comment_view` each lead with `rmheetId`,
   `commentId` or `optionId` in a unique or explicit index.

So the remaining 78 are latent, not live. Each index would cost a btree insert on
every write to tables that are among the highest-write in the schema (views,
reactions, likes), to protect a delete path that does not exist. They are worth
revisiting **only** if account deletion ever becomes a hard delete, or if a
moderation tool grows a "purge all content by user" action — at which point the
list should be regenerated rather than trusted from here.

---

## Found and not implemented, ranked

### HIGH — `/api/presence/friends` and `/api/friends/active` are two fan-outs over the same graph

`getOnlineFriends` and `getActiveFriends` (`lib/presence.server.ts`) both walk
the viewer's follow graph, both filter on `lastSeenAt`, and both resolve user
display shapes — for two widgets that render nearly the same list. They are now
sections of one request, but they are still two independent server computations
with two caches (45s and 15s). Merging them into one query whose result is
projected two ways would roughly halve the remaining presence cost. Left alone
because they have genuinely different semantics (follows vs. mutuals, and
`activeFriends` applies per-target presence-visibility filtering) and conflating
them risks leaking presence to a non-mutual — a privacy bug, not a perf bug.

### HIGH — the presence "online" signal is derived from a value throttled to 5-minute writes

Both presence readers filter `lastSeenAt >= now - 2min`, but `markPresence`
throttles the Postgres `lastSeenAt` write to roughly once per 5 minutes per user
(Redis holds the live set). A 2-minute window over a 5-minute-granularity column
cannot be right: it misses genuinely-online users. Answering "who is online"
entirely from the Redis presence set — which is already the authority for the
site-wide count — would be both cheaper and more accurate. This is a correctness
issue with a performance payoff, and the prior audit flagged its §3.3 ancestor.

### MEDIUM — 194 `findMany` calls have no `take`

Most are inherently bounded (a user's own playlists, lists, API keys). The ones
that grow without the caller's control, in rough order of exposure:

- `app/routes/api/rmharks/$id/comment.ts:75,186` — comment tree levels. The BFS
  was batched per the prior audit's §2.5, but each level is still unbounded.
- `lib/feed/thread.server.ts:18` — a thread's posts.
- `app/routes/api/messages/search.ts:67` — DM search results.
- `app/routes/api/discord/embed.ts:322` — daily participants.
- `lib/replays.server.ts:172`, `lib/ranked.server.ts:51,56`,
  `lib/tournaments/tournament.server.ts:608`.

Each needs a product call on what the cap should be and whether the surface needs
pagination, which is why they are listed rather than changed.

### MEDIUM — 2D canvas games were never audited

The 3D audit instrumented every route that opens a WebGL context. The 2D canvas
games were out of its scope and remain unmeasured. The static signals that stand
out:

- `lib/void-breaker/renderer.ts` — 24 `shadowBlur` assignments and 12 gradients
  created inside the draw path. `shadowBlur` is among the most expensive canvas 2D
  operations, and a gradient rebuilt per entity per frame is pure waste (cache per
  colour/radius, or bake to an offscreen sprite once). It does have a `reducedFx`
  flag, so the mechanism for a quality tier already exists.
- `components/game/GameCanvas.tsx` — 15 `shadowBlur` assignments beyond the
  `getComputedStyle` issue fixed above.
- `lib/vega/Renderer.ts` (6), `components/velum2099/game/ui/Minimap.ts` (8).

The right move is to point the existing 3D harness (it counts draw calls via a
monkey-patched `WebGL2RenderingContext`) at a canvas-2D equivalent — patch
`CanvasRenderingContext2D.prototype` fill/stroke/drawImage — and get numbers
before changing anything. `lib/render/tier.ts` already exists and is
renderer-agnostic, so a 2D game can consume the same tier.

### MEDIUM — the app tier has no virtualization

The prior audit's §6.1 extracted `components/feed/VirtualPostList.tsx` and
applied it across all six feed timelines. Nothing outside the feed uses it.
Unbounded, unvirtualized lists in the full-screen apps:
`components/rmhtube/ChatPanel.tsx` (649 lines, a realtime chat that accumulates
for the room's lifetime), `components/rmhtube/MemberList.tsx`,
`components/library/LibraryCollections.tsx`, `components/library/AlbumViewer.tsx`.
`ChatPanel` is the one that matters — it has the same growth profile as the
`GroupChatView` the prior audit fixed.

### LOW — `lib/liquid-gl` allocates a string per frame while idle

`frame()` calls `buildInlineSig()` every frame to detect a theme change, which
concatenates four inline-style reads into a fresh string — including on the idle
path that then early-returns without rendering. The reads are cheap (inline
style, no flush) but the module docblock claims "zero per-frame allocation", and
at 120Hz this is ~120 short-lived strings a second on every page. Compare the four
values field-by-field against the cached copy instead of building a string, or
check the signature every Nth frame. Genuinely minor; listed for honesty because
the docblock overstates the current state.

---

## Measurement

Nothing here was measured against production; the effects in the table are query
counts and request counts read off the code, which are exact, plus one style-recalc
count that is structural. The RUM and synthetic plumbing described in
[`performance-slo.md`](performance-slo.md) is the way to confirm the latency
effect of items 2–4, and its checklist still has "forward `[rum:metric]` logs to a
durable metrics backend" unchecked — until that is done, before/after percentiles
for a write-path change are not obtainable from this repo.

The pulse change is the one item with an effect visible without a metrics
backend: request count per idle tab per minute, straight from a browser network
panel or an Apache access log.

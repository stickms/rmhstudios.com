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

| #   | Change                                                       | Effect                                                                             | Where                                                                |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `POST /api/pulse` + shared client pulse replaces 4 pollers   | idle signed-in tab: **5 → 2 requests/min**, **4 → 1** session resolutions          | `app/routes/api/pulse.ts`, `lib/pulse.ts`                            |
| 2   | Notification writes no longer awaited on like/unlike/follow  | **~3 fewer serial queries** in front of the response on the hottest write path     | `lib/social/engagement.server.ts`                                    |
| 3   | Comment notification block deferred as a unit                | **~4–12 fewer serial queries** in front of the comment response                    | `lib/social/engagement.server.ts`                                    |
| 4   | Hashtag linking batched                                      | **3N → 5 fixed** queries, and the post-create transaction closes far sooner        | `lib/tags-extract.server.ts`                                         |
| 5   | Five missing predicate indexes                               | two per-viewer seq scans per presence poll, plus the notification dedupe, removed  | `prisma/schema.prisma` + `20260730120000_hot_path_predicate_indexes` |
| 6   | `getComputedStyle` hoisted out of the slice-it frame loop    | removes **1 + N forced style recalcs per frame** (N = visible hold notes)          | `components/game/GameCanvas.tsx`                                     |
| 7   | Song comment list bounded                                    | removes an unbounded public payload                                                | `app/routes/api/slice-it/songs/$id/comments.ts`                      |
| 8   | Presence answered from Redis; the two fan-outs share work    | fixes a real "shows offline while online" bug; no DB read at all on the Redis path | `lib/presence.server.ts`, `lib/hot-counters.server.ts`               |
| 9   | Three genuinely unbounded queries capped                     | incoming ranked challenges and Discord guild leaderboards no longer grow unbounded | `lib/ranked.server.ts`, `app/routes/api/discord/embed.ts`            |
| 10  | RMHTube + RMHMusic chat scrollback bounded, memos fixed      | client chat no longer grows for the room's lifetime or re-sorts on playback ticks  | `lib/rmhtube/store.ts`, `lib/rmhmusic/store.ts`, both `ChatPanel`s   |
| 11  | Canvas-2D probe committed; blurred shadows put behind a tier | slice-it: **10 → 0** blurred-shadow activations/frame on low-end + reduced motion  | `scripts/perf/canvas2d-probe.mjs`, `lib/render/canvas2d-fx.ts`       |
| 12  | `liquid-gl` theme check moved out of the frame loop          | zero per-frame work/allocation for theme detection, on every page                  | `lib/liquid-gl/index.ts`                                             |

Verified: `tsc --noEmit` clean, `eslint` 0 errors and **no new warnings**
(checked file-by-file against the pre-change baseline), `vitest run` 252 files /
4600 tests green, production `vite build` green, and the migration applied to a
real PostgreSQL 16 with all five indexes confirmed and no `migrate status` drift.

Items 1–7 were the first pass; 8–12 are the follow-up described under
"Second pass" below, which also corrects two findings the first pass overstated.

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

## Second pass — the rest of the list

Everything the first pass deferred was then worked through. This section records
what each item turned out to be, including the two where the honest answer was
"the finding was overstated".

### 8. Presence now answers from Redis, and the two fan-outs share their work

Both presence readers filtered `lastSeenAt >= now - 2min`, but `markPresence`
throttles that Postgres write to roughly once per 5 minutes per user
(`PRESENCE_DB_THROTTLE_MS`) because Redis holds the live set. **A 2-minute window
over a 5-minute-granularity column reports most genuinely-online users as
offline.** This was a correctness bug with a performance payoff, and it is now
answered from the Redis presence set — the same buckets the site-wide count
already trusts — via `filterOnlineUsers` (`lib/hot-counters.server.ts`), which is
two `SMISMEMBER`s regardless of how many follows are being tested, and returns
null so the caller falls back to the old `lastSeenAt` filter when Redis is off.

`getOnlineFriends` and `getActiveFriends` now share `onlineFollowIds` — the follow
graph plus the online test, cached per viewer, with **no database read at all on
the Redis path**. `getActiveFriends` also gained the larger win: its mutual check
(`follow.findMany`) used to run against the viewer's entire follow list, up to a
5000-wide `IN` list; it now runs against the already-online subset.

What was deliberately **not** shared is the user-row fetch. The two surfaces
select different scopes with different limits, and folding them into one capped
base query would silently truncate the rail's mutuals for anyone with more online
follows than the cap. Two `take`-bounded PK reads is the correct shape.

`getActivities` also went from one Redis `GET` per friend to a single `MGET`.

**One behaviour change worth calling out:** `presenceVisibility: 'nobody'` is now
honoured by `getOnlineFriends` too. It was only applied by `getActiveFriends`, so
a user who had explicitly opted out of presence still appeared in the "Friends
online" widget. Merging the two loaders forced a decision, and honouring an
explicit privacy opt-out is the conservative one — but it does mean that widget
shows fewer people than before. Reverse it by dropping `visibilityFilter()` from
`getOnlineFriends` if the old behaviour was intended.

### 9. Unbounded queries — the "194" was overstated

The original scan counted any `findMany` without a `take:` **key**, which missed
shorthand `take,` and queries bounded by an `id: { in: [...] }` built from an
already-capped set. Corrected count: **163**, and of the eight sites the first
pass named, five were false positives:

| Site                       | Verdict                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `comment.ts:75`            | already takes a `take` argument — bounded                        |
| `comment.ts:186`           | bounded by `REPLY_CAP_PER_PARENT` × batch                        |
| `tournament.server.ts:608` | shorthand `take` — bounded                                       |
| `replays.server.ts:172`    | shorthand `take` — bounded                                       |
| `messages/search.ts:67`    | bounded by `distinct` over a capped conversation set             |
| `ranked.server.ts:51,56`   | **real** — capped at 50                                          |
| `discord/embed.ts:322`     | **real** — capped at 100                                         |
| `thread.server.ts:18`      | author-bounded (`MAX_SEGMENTS = 25`); defensive cap at 100 added |

The ranked one is the only one that mattered: **anyone can open a challenge
against you**, so the incoming list grows with other people's actions and each row
hydrated a full user-display include. The rest of the 163 are user-scoped lists
(your playlists, your API keys, your saved places) whose size the owner controls.

### 10. The app tier did not need a virtualizer — it needed a bound

`ChatPanel`'s problem was not that it rendered every row; it was that
`room.chat` **grew for the room's entire lifetime**. The same store already capped
`systemMessages` at `slice(-100)` and simply never applied the same treatment to
chat. Both RMHTube and RMHMusic had the identical bug. Capped at 200; older
history stays server-side.

With the array bounded the DOM is bounded, which is what virtualization would have
bought — at a fraction of the risk of retrofitting a virtualizer into a realtime
chat with variable-height rows, reactions, a mention dropdown and autoscroll.

Two adjacent re-render bugs fell out of reading it: `getChatEntries` was keyed on
the whole store in a `useMemo`, and `useRmhTubeStore()` subscribes to the whole
store — which changes on every `SYNC_STATE` and clock sync — so the entire
transcript was re-merged and re-sorted several times a minute on updates that had
nothing to do with chat. RMHMusic's copy had no memo at all. `getChatEntries` now
takes the two arrays it reads so the memo can be keyed correctly.

The other candidates dissolved on inspection: `MemberList` is structurally capped
(`ABSOLUTE_MAX_MEMBERS = 50`), and the library lists are user-scoped.

### 11. 2D canvas games — measured, and the harness is committed

`scripts/perf/canvas2d-probe.mjs` is the 2D counterpart to the (throwaway) WebGL
harness: it patches `CanvasRenderingContext2D.prototype` and counts rasterising
ops, **non-zero `shadowBlur` activations**, gradient/pattern constructions and
`getComputedStyle` calls, per frame. Unlike the 3D one it is committed, so this is
repeatable.

Measured at 1280×720, DPR 1, software rasteriser (no GPU — treat fps as
relative-only, exactly as the 3D audit warns; the op counts are hardware
independent):

| Route            |  fps | ops/frame | shadowBlur-on/frame | gradients/frame | getComputedStyle/frame |
| ---------------- | ---: | --------: | ------------------: | --------------: | ---------------------: |
| `/slice-it`      | 44.7 |        15 |              **10** |               0 |                  **0** |
| `/laundry-sort`  | 59.9 |        16 |                   0 |               0 |                      0 |
| `/neon-driftway` | 33.6 |         1 |                   0 |               0 |                      0 |

Two things to read off that table:

1. **slice-it enabled a blurred shadow ~10 times per frame against ~15 rasterising
   operations** — two thirds of everything it drew went through a blur, and that is
   at rest on a menu, before any notes are on screen. `shadowBlur` is the most
   expensive thing on a 2D canvas: the shape is rasterised to a scratch surface,
   blurred, then composited.
2. `getComputedStyle/frame` is **0**, which independently confirms the fix in item
   6 above is working in a real browser.

The fix is `lib/render/canvas2d-fx.ts` — the 2D counterpart to `lib/render/tier.ts`,
gating decorative blur on the site's existing low-end signals (`html.perf-lite`,
the same class that already disables the glass blur, the aurora parallax and the
liquid layer, plus reduced motion) rather than a new heuristic. Resolved once per
theme/class change, never per frame. Verified with the harness:

| `/slice-it`                | ops/frame | shadowBlur-on/frame |
| -------------------------- | --------: | ------------------: |
| default                    |        15 |                  10 |
| `--reduced` (gate engaged) |        15 |               **0** |

Identical geometry, zero blur — so the gate drops only the expensive part.
void-breaker already had a `reducedFx` flag driven by reduced motion; it now also
honours `perf-lite`, so it degrades on the same signal as everything else.

**Honest caveat:** fps did not measurably move at rest (44.8 → 44.5) because 15
ops/frame is not enough work for the blur to dominate on this capture machine. The
removed work is real and the gate is verified to fire; the frame-rate claim needs
a run during actual gameplay on real hardware. Routes behind a menu or a loadout
screen (`/void-breaker`, `/house-always-wins`, `/synapse-storm`, `/temple-of-joy`)
were not reached — the harness reports `no canvas animation observed` rather than
summarising a menu, and driving them to gameplay needs per-route click selectors
that are not written yet. `lib/vega/Renderer.ts` and
`components/velum2099/game/ui/Minimap.ts` still have un-gated `shadowBlur` and are
not on a routable path this harness could reach.

### 12. `liquid-gl` no longer touches the theme in the frame loop

`frame()` built a signature string every frame — including on the idle path that
then returned without rendering — to detect a theme change. The check now lives in
a `style` `MutationObserver`, so the frame loop does nothing at all for it.

The reason it was in the loop is documented in the module: inline style churns on
every pointer move via `--light-x/y`, so a naive `style` observer would fire
constantly. The callback therefore compares the three colour variables and only
re-parses when one actually changed — a pointer move fails that test and does
nothing — and `MutationObserver` batches into a microtask, so a drag costs one
comparison per batch instead of one per frame, and an idle page costs nothing.

---

## Measurement

The request-count and query-count effects are read off the code and are exact. The
canvas-2D numbers are measured (see item 11 for the harness, the conditions, and
what the numbers do _not_ establish). The migration was applied to a real
PostgreSQL 16 instance and all five indexes verified present, with
`prisma migrate status` reporting no drift.

Not measured: the latency effect of items 2–4. The RUM and synthetic plumbing in
[`performance-slo.md`](performance-slo.md) is how to confirm those, and its
checklist still has "forward `[rum:metric]` logs to a durable metrics backend"
unchecked — until that is done, before/after percentiles for a write-path change
are not obtainable from this repo.

The pulse change is the one item with an effect visible without any metrics
backend: request count per idle tab per minute, straight from a browser network
panel or an Apache access log.

### Re-running the canvas probe

```bash
pnpm dev                       # or any server on BASE_URL
node scripts/perf/canvas2d-probe.mjs --all --seconds=12
node scripts/perf/canvas2d-probe.mjs --route=/slice-it --reduced
```

`CHROME_PATH` overrides the browser binary; `BASE_URL` defaults to
`http://localhost:7005`.

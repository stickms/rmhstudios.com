# 01 — RMHTube watch statistics that count

Surface: the RMHTube hub (`server/rmhtube/`), the RMHTube landing page
(`/rmhtube`, app tier) and the owner's own profile app card. Wave 2. Namespace
`rmhtube-stats`.

## User story

As a member who watches with friends most evenings, I want RMHTube to keep my
own counts — hours watched, videos, rooms hosted and joined — and show me the
last thirty days, so that the "0h watched" on my profile card means something.

As a member who does not want a record kept, I want to pause it, and I want
nobody else to see it.

## Requirements elicitation

- **What exists (verified):**
  - `RmhTubeUserStats` (`prisma/schema/rmhtube.prisma`) has seven counters and
    **no writer anywhere**: `grep -rn "rmhTubeUserStats\." lib server` finds
    only the read in `lib/profile/app-profiles.server.ts` (`readRmhTube`),
    which renders "{{hours}}h watched", videos, rooms hosted and rooms joined,
    `visible: OWNER_ONLY` with the comment "Owner-only until there is a setting
    that says otherwise".
  - The Node hub `server/rmhtube/` (`room-manager.ts`, `sync-engine.ts`,
    `chat-handler.ts`, `party-handler.ts`, `prisma-client.ts`) owns room
    creation, joins, the play/pause clock, chat and reactions.
  - The erasure registry classifies `RmhTubeUserStats` as `todo` ("the member's
    own watch statistics; erase candidate", `lib/account/erasure-registry.ts`);
    its relation to `User` has no `onDelete`.
  - Sprint 02 rejected an RMHTube *watch history* (a per-video list); this
    feature keeps counts and minutes per day only, never which videos.
- **Decisions:**
  - **What counts.** A *watched minute* is a whole minute of wall-clock time in
    which the member's socket was in a room and the room's clock was playing.
    A *video watched* is a queue item that played for at least 50% of its
    known duration, or for 2 minutes when the duration is unknown, while the
    member was present (once per member per item per room session). *Rooms
    created*, *rooms joined* (distinct rooms per UTC day), *messages sent* and
    *reactions used* count the hub events of the same names.
  - **Batching.** The hub keeps per-member deltas in memory and flushes them
    every 60 seconds and on room close and on shutdown (`shutdown.ts`) as one
    `upsert` per member with `increment`; a lost minute on a crash is
    acceptable, a double count is not (each flush subtracts what it wrote).
  - **Per-day minutes.** New `RmhTubeWatchDay (userId, day "YYYY-MM-DD" UTC,
    minutes)`, upserted in the same flush, kept for **90 days** (a daily jobs
    cleanup is not needed: the flush deletes the member's rows older than 90
    days at most once per day per member, tracked in memory).
  - **Never after deletion.** The flush upserts, so a delta held in memory
    when a member deletes their account would recreate the erased row. Each
    flush first reads the batch's users (`id in …`, selecting
    `deletionScheduledAt` and what `isDeletedAccount` reads) and drops the
    deltas of any member who requested deletion or was anonymised; the
    deletion request also signs the member out, so no new deltas follow.
  - **Pause.** `RmhTubeUserStats.paused Boolean @default(false)` (and
    `pausedAt`). When paused, the hub records nothing for the member; existing
    counts stay until the member chooses "Clear my statistics" (a
    `useConfirm`). Signed-out viewers are never counted. Clear runs in the
    web tier while the hub holds up to 60 s of deltas in memory, so Clear
    also sets `clearedAt DateTime?` on the row, and the hub's flush
    drops any delta accumulated before it (it re-reads the row with the pause
    flag); without this, the minute in flight would reappear.
  - **Who sees it.** Only the member. The profile card stays `OWNER_ONLY`
    (this feature does not add a public setting — that is the comment's
    "setting that says otherwise", left for the owner). Nothing goes to the
    developer API, the feed or other members' room views.
  - **The panel.** The RMHTube landing (`components/rmhtube/RmhTubeLanding.tsx`)
    gains a "Your watching" section for signed-in members: the six counters,
    a 30-day bar chart of minutes (`components/ui/bar-chart.tsx` with its
    table alternative) — styled through the app tier's own tokens (L8) — and
    the Pause / Resume and Clear controls.

## Functional requirements

1. FR-1 The hub records the six counters and per-day minutes as defined above.
2. FR-2 `GET /api/rmhtube/stats` returns the viewer's counters, `paused`, and
   the last 30 days of minutes (zero-filled, UTC days).
3. FR-3 `PUT /api/rmhtube/stats/pause` `{ paused }` and `DELETE
   /api/rmhtube/stats` (clear: resets counters, deletes day rows).
4. FR-4 The landing panel with loading, empty ("Nothing recorded yet"),
   paused ("Paused. Nothing new is recorded.") and error states.
5. FR-5 The existing profile card shows the real numbers (no code change
   beyond what the writer makes true; its test is extended).
6. FR-6 Erasure and export (below).

## Non-functional requirements

- **Correctness:** flushes are idempotent per batch (a delta is cleared only
  after its write commits); the "video watched" rule is evaluated by the
  member's presence intervals, not the room's; the pause flag is re-read by the
  hub at most every 60 seconds and at join.
- **Performance:** at most one write per present member per minute; no write
  on the sync hot path; the panel is one indexed read (`@@id([userId, day])`).
- **Security:** `auth: 'required'`; `rateLimit: 'read'` for GET, `'write'` for
  the two writes. The hub writes only for authenticated sockets.
- **Privacy:** owner-only on every path; erased on deletion; exported.
- **Design:** app tier (L8): the panel uses `components/rmhtube/rmhtube.css`
  and `--app-*`; motion only as response to input.
- **i18n:** `rmhtube-stats`.

## Data model and API

- `RmhTubeUserStats` gains `paused Boolean @default(false)`, `pausedAt
  DateTime?` and `clearedAt DateTime?`; its `user` relation is left as it is (changing a foreign key is
  not additive, and erasure is explicit anyway). New `RmhTubeWatchDay`
  (`@@id([userId, day])`, `@@map("rmhtube_watch_day")`), back-relation under
  the auth anchor. Migration `20261128020100_s08_rmhtube_stats`.
- `lib/rmhtube/stats.ts` (pure: `isVideoWatched`, `minutesFromIntervals`,
  `zeroFill30`), `stats-schema.ts`, `stats.contract.ts`, `stats.server.ts`
  (`getMyStats`, `setPaused`, `clearStats`, `exportRmhTubeStats`,
  `rmhTubeStatsErasureOps`), `server/rmhtube/stats-recorder.ts` (the in-memory
  deltas and flush), modules `lib/rmhtube/api/rmhtube.stats.server.ts` and
  `rmhtube.stats.pause.server.ts`.
- Registry: `RmhTubeUserStats` and `RmhTubeWatchDay` → `erase`;
  `TODO_CEILING` falls by one.

## Testing requirements

- Main suite `server/rmhtube/__tests__/stats-recorder.test.ts`: minutes only
  while playing and present; 50% / 2-minute rule; one video per item per
  session; flush increments and clears deltas; a failed flush keeps them;
  paused members are skipped; signed-out sockets never counted; a member
  with `deletionScheduledAt` set or anonymised is never written.
- Main suite `lib/rmhtube/__tests__/stats-api.test.ts` (owner only, pause,
  clear) and `lib/account/__tests__/rmhtube-stats-erasure.test.ts`.
- Product suite `lib/rmhtube/__tests__/stats.product.test.ts` (pure helpers).
- `lib/__tests__/app-profiles.test.ts` stays green; `erasure-coverage.test.ts`
  passes with the lower ceiling.

## Acceptance criteria

- [ ] Watching a 4-minute video to the end in a room adds 4 minutes, one video
      and one room joined; the landing shows them and the profile card agrees.
- [ ] Pausing stops all counting; Clear resets to zero after confirmation.
- [ ] No other member, API key or page can read the numbers.
- [ ] Deleting the account removes both tables' rows.
- [ ] The landing panel works at 390 px and 1280 px, light and dark app
      themes, and once in `ar`.

## Out of scope

A public setting for the card, per-video history, watch time for solo players
outside rooms, leaderboards of watch time.

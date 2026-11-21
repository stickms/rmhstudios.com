# 01 — Your replays and replay boards

Surface: a new settings page `/settings/replays`, a "Replays" section on the
game library page (`components/steam/GamePage.tsx`) of every replayable game,
and owner actions on the full-screen replay viewer
(`app/routes/replays.$id.tsx`).
Wave 3. Namespace `replay-library`.

## User story

As a player who saves replays of my best runs, I want one place that lists
them, where I can make one public or unlisted and delete one I no longer want —
and, as a player browsing a game, I want to watch the best public replays of
it — so that the replays I save are something I can manage and others can
find, not rows that only a direct link reaches.

## Requirements elicitation

- **What exists (verified):** `GameReplay` (`prisma/schema/games.prisma`) is
  written by `saveReplay` (`lib/replays.server.ts`) from `POST /api/replays`
  (`lib/game/api/replays.server.ts`) and the Neon Driftway ghost route
  (`app/routes/api/replays/ghost.ts`); Slice It shows replays on its own
  leaderboard (`features/slice-it/ui/Leaderboard.tsx`). Two server functions
  have **no caller**: `listReplaysForGame` and `deleteReplay` (the latter only
  from the hand-rolled `DELETE` in the route file
  `app/routes/api/replays/$id.ts`, which no client calls). There is no list of
  a member's own replays, no way to change a replay's visibility after saving,
  and no place where a game's public replays can be browsed
  (`components/steam/GamePage.tsx` has reviews, guides and stats only).
  `anonymizeAccount` (`lib/account/deletion.server.ts`) does not erase
  `game_replay`, so a deleted member's replays stay public under the tombstone.
- **Decisions:** no schema change — the `[userId, createdAt desc]` and
  `[game, score desc]` indexes already serve both lists. A replay that backs a
  speedrun entry (`SpeedrunEntry.replayId`) cannot be deleted or unlisted by
  its owner (the run's proof would disappear); the page says so and links the
  run. Ghosts (Neon Driftway, always `unlisted`) are listed and can be deleted,
  never made public. Boards show public replays of the current game logic
  version only (older versions may not play back). Boards hide replays by
  members the viewer has blocked or who blocked the viewer, and by banned
  members (`User.bannedUntil` in the future).

## Functional requirements

1. FR-1 `/settings/replays` (signed in; a settings-hub destination named
   "Replays") lists the member's replays newest first, 20 per page with
   "Load more": game title, score, duration, date, visibility, and a "Ghost"
   or "Speedrun proof" marker where it applies. A game filter (a `select` of
   the games the member has replays for) narrows the list.
2. FR-2 Each row has View (opens `/replays/$id`), a visibility switch
   (Public / Unlisted) and Delete (through `useConfirm`). Speedrun-proof rows
   show the switch and Delete disabled with the reason as text.
3. FR-3 The replay viewer shows the same visibility switch and Delete to the
   owner only; deleting returns to `/settings/replays` with a toast.
4. FR-4 The game library page of every game in `REPLAYABLE_GAME_IDS`
   (`lib/game/replay.ts`) gets a "Replays" section: the top 10 public replays
   of the current version (score, author, duration, date), each linking to the
   viewer, and an empty state ("No public replays yet").
5. FR-5 Saving a replay (`SaveReplayButton`, Slice It) is unchanged, but the
   success state links "Your replays".
6. FR-6 Erasure deletes the member's replays except those backing a speedrun
   entry (which stay as board history under the tombstone, like the entry).

## Non-functional requirements

- **Security:** list, patch and delete are session-only and touch only the
  caller's rows (`where: { id, userId }`); another member's id answers 404.
  The board is `auth: 'optional'`; blocks are applied when a viewer is signed
  in. `visibility` is a zod enum; `game` is checked against
  `REPLAYABLE_GAME_IDS`; the cursor is a zod-validated opaque string.
- **Performance:** board query uses `[game, score desc]` with `take: 10` and a
  `version` filter; cache it `CACHE_POLICY`-style for anonymous viewers only
  (never cache a signed-in, block-filtered response). The mine list uses
  `[userId, createdAt desc]` with cursor pagination.
- **Privacy:** erasure under the `s04-01` anchor; an `exportReplays(userId)`
  function (metadata only: game, score, duration, visibility, createdAt — not
  the input log) for the account export.
- **Accessibility:** the visibility control is `components/ui/switch.tsx` with
  a visible label; rows are a list (`<ul>`), each with one link and labelled
  buttons ("Delete replay of Lights Out, score 1,200").
- **i18n:** all strings in `replay-library`; numbers and dates via
  `Intl.NumberFormat`/`Intl.DateTimeFormat`; game titles from the catalog.
- **Steel:** rows on `border-b border-site-border`, `t-body` titles and
  `t-meta` numbers; no cards; Delete is a quiet button (the page has no ink
  primary). The game page section follows the page's existing section style.

## Data model and API

- No migration.
- `lib/game/replay-library.ts` (pure: row mapping, which actions are allowed
  for a row), `lib/game/replay-library-schema.ts` (zod),
  `lib/game/replay-library.contract.ts`:
  - `GET /api/replays/mine?game=&cursor=` → `{ items, nextCursor }`
  - `GET /api/replays/board?game=` → `{ items }` (top 10)
  - `PATCH /api/replays/$id` `{ visibility }` → the row
  - `DELETE /api/replays/$id` → `{ ok: true }`
  - `GET /api/replays/$id` (moved unchanged from the route file)
- Registered modules `lib/game/api/replays.mine.server.ts`,
  `replays.board.server.ts`, `replays.$id.server.ts` (GET, PATCH, DELETE);
  delete `app/routes/api/replays/$id.ts` (the `$id` path must leave the
  router together with its static siblings —
  `lib/api/__tests__/route-table.test.ts`).
- `lib/replays.server.ts`: `listMyReplays`, `setReplayVisibility`,
  `deleteReplay` (guarded against speedrun proofs), `listReplaysForGame`
  (version filter, block and ban filtering), `replayErasureOps(userId)`,
  `exportReplays(userId)`.
- Settings hub: one destination in `lib/settings-nav.ts` and its literal label
  in `components/settings/settings-nav-labels.ts` (+ its test).
- Route `app/routes/_site/settings/replays.tsx` (`noindex`, `EXCLUDED_ROUTES`
  under `s04-01`).

## Testing requirements

- Main suite `lib/game/__tests__/replay-library.test.ts`: another member
  cannot patch or delete a replay (404); a speedrun-proof replay refuses
  delete and unlist (409); a ghost cannot be made public; the board omits
  blocked, blocking and banned authors and other versions.
- Main suite `lib/account/__tests__/replay-erasure.test.ts`: the ops delete
  every replay of the member except speedrun proofs.
- Product suite `lib/game/__tests__/replay-library.product.test.ts`: row
  mapping and allowed actions per row kind.

## Acceptance criteria

- [ ] A saved Lights Out replay appears in `/settings/replays`, can be made
      unlisted (it disappears from the game's board) and deleted.
- [ ] The Lights Out game page lists the top public replays.
- [ ] A speedrun-proof replay cannot be deleted and says why.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Comments or likes on replays, replay titles, sharing a replay to the feed
from the list (the viewer's share stays as it is), replays for games that do
not record them yet.

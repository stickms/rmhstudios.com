# 07 — Leaderboard privacy on every board

Surface: every server path that reads a ranked list of members, the "Hide me from leaderboards" switch
(`/settings/privacy`). Wave 6. Namespace `board-privacy`.

## User story

As a member who turned on "Hide me from leaderboards", I want that to be true of every board on the site — the daily
puzzles, the typing daily, ranked, speedruns, Doctrine, pick'em, community contributors — so that the switch means what
it says.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 05 01: `leaderboardHiddenUserIds()` (`lib/game/leaderboard-privacy.server.ts`) returns members with
    `UserProfile.hideFromLeaderboards` and members whose `bannedUntil` is in the future, cached 60 s, capped at
    `HIDDEN_ID_CAP = 5 000` (`lib/game/leaderboard-privacy.ts`). Its readers: the unified boards
    (`lib/game/adapters.server.ts`, `generic-adapter.server.ts`), the per-game routes for Void Breaker, Vega, Neon
    Driftway, the XP board (`lib/leaderboard.server.ts`), the friends and community scopes
    (`leaderboard-scope.server.ts`), the RMH Music boards.
  - Sprint 05's follow-up: "covers game boards + XP only; doctrine, daily puzzles, rmhtype daily, speedrun, ranked,
    Discord daily boards not covered". A grep for board readers that do not call it finds, among others:
    `lib/daily-puzzles/api/daily-puzzles.leaderboard.server.ts`, `lib/rmhtype/api/rmhtype.daily.leaderboard.server.ts`,
    `lib/ranked/api/ranked.$game.leaderboard.server.ts`, `lib/speedrun/api/speedrun.leaderboard.server.ts`,
    `features/doctrine/api/doctrine.puzzles.leaderboard.server.ts`,
    `lib/competitive/api/tournaments.$id.pickem.server.ts` (pick'em standings),
    `lib/forecasting/api/forecasting.seasons.server.ts`, `lib/discovery/api/tips.leaderboard.server.ts`,
    `lib/communities/api/communities.$slug.contributors.server.ts`, `lib/trick-week/api/nightrail.tricks.server.ts`,
    `lib/delight/api/hunt.server.ts`, `lib/api/routes/leaderboards.players.server.ts`, and the replay boards
    (`listReplaysForGame` in `lib/replays.server.ts` behind `lib/game/api/replays.board.server.ts`; 18 changes that
    function's order and adds a seed filter next wave, so 07 adds only the hidden-set filter to its `where`).
  - The switch's text (`components/settings/LeaderboardPrivacyControls.tsx`) describes game boards.
  - There is no registry of board readers, so the next board will miss it too.
- **Decisions:**
  - **A registry.** `BOARD_PRIVACY_READ_PATHS` (exported beside the helper in `lib/game/leaderboard-privacy.server.ts`,
    or in the pure `leaderboard-privacy.ts`) lists every server file that returns a ranked list of members;
    `BOARD_PRIVACY_EXEMPT` maps the others that look like boards to a reason (a tournament bracket — entrants chose to
    enter; an election league — Tier 3, owner; a member's own history). A source-scan test
    (`lib/game/__tests__/board-privacy-paths.test.ts`) fails a `*.server.ts` file under `lib/`, `features/` or `server/`
    whose **file name** contains `leaderboard`, `standings`, `board`, `pickem`, `contributors` or `tricks`, or whose
    source calls `findMany` with an `orderBy` on `score`, `rating`, `totalXp`, `wpm`, `bestWpm` or `timeMs` together
    with a `take`, and that is in neither list — the way `QUIET_COUNT_READ_PATHS` and `FOLLOW_LIST_READ_PATHS` are held.
    Each listed path must also contain `leaderboardHiddenUserIds` (the test checks it), so a listed file cannot silently
    drop the filter.
  - **What "hidden" means on each:** the member's row is left out of a public list and of its rank arithmetic (the next
    member moves up); the member still sees their own row and rank on boards that show "your position" ("Hidden from
    others" beside it). Friends-scoped and community-scoped boards follow the unified boards' existing behaviour (hidden
    there too). Pick'em standings and community contributors are public lists of members and are covered; a tournament's
    bracket and its entrant list are not boards (exempt: entering is the act of being listed).
  - **Discord daily boards** (the bot in `server/discord-bot/`) are covered if the bot posts a member list; if it posts
    only the caller's own result, exempt with that reason. The implementer confirms which.
  - **Caching:** a board that caches its response publicly keeps doing so; the hidden set is the same for every caller
    (as sprint 05 established), so the cache stays anonymous-invariant.
  - **The switch's text** changes to a new key: "Leave me off every public board and ranking: game scores, daily
    puzzles, typing, ranked, speedruns, pick'em and community contributors. You still see your own place."
  - **The developer API** boards (`/api/v1/leaderboards/{game}`) already read the unified boards; confirm and list them.

## Functional requirements

1. FR-1 Every board reader listed above (and any the scan finds) filters through `leaderboardHiddenUserIds()`, keeping
   "your position" for the viewer.
2. FR-2 `BOARD_PRIVACY_READ_PATHS`, `BOARD_PRIVACY_EXEMPT` and the source-scan test.
3. FR-3 The switch's new description.

## Non-functional requirements

- **Correctness:** filtering happens before `take`/rank (fetch `take + hidden-in-window` or filter in the query with
  `userId: { notIn }` when the set is small; the helper's 5 000 cap holds the `notIn` size); ranks are recomputed after
  filtering.
- **Performance:** one cached set per process; no board does a per-row lookup.
- **Privacy:** a banned member is hidden as before; nothing in the response says that someone was hidden.

## Data model and API

- No schema change. Edits: each board reader above, `lib/game/leaderboard-privacy.server.ts` (the constants only — the
  helper's behaviour is unchanged), `components/settings/LeaderboardPrivacyControls.tsx`.
- New `lib/game/__tests__/board-privacy-paths.test.ts`.

## Testing requirements

- Main suite `lib/game/__tests__/board-privacy-coverage.test.ts`: for each listed reader that can be driven in-process
  with mocked Prisma, a hidden member is absent, the next member's rank moves up, and the hidden member sees their own
  position.
- The path ratchet above.
- Existing leaderboard-privacy tests stay green.

## Acceptance criteria

- [ ] A member with the switch on is absent from the daily puzzle board, the RMHType daily board, ranked, speedrun,
      Doctrine, pick'em and community contributor lists, and sees their own place on each that shows one.
- [ ] A new file that returns a board without the helper fails the path test.
- [ ] The switch's text names the boards it covers.

## Out of scope

Per-board switches, hiding from tournament brackets, the elections leagues (Tier 3), changing who sees a member's own
profile stats.

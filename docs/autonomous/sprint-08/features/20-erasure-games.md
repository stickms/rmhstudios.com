# 20 — Erasure: game progress and saves, board by board

Surface: `anonymizeAccount`, the erasure registry, the game boards that read
these tables. Wave 7. No namespace.

## User story

As a member who deletes their account, I want my saves, runs and daily
results in every game to go — and my name off every board that showed them —
so that deleting the account does not leave a ghost of me at rank 14.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 05 01 (leaderboard privacy) erased the per-game player tables and
    `GameStat`; the registry's `todo` entries for the rest say "per-game
    progress, saves or daily results of the member; some feed boards, so each
    needs its board checked before it is erased" (`lib/account/erasure-registry.ts`).
  - `anonymizeAccount` ends with `dropLearnerBoardCaches(userId, …)` — the
    precedent for clearing a cached board when its rows go.
  - The tables (schemas under `prisma/schema/games/` and
    `prisma/schema/games.prisma`, `hearth.prisma`, `rmhtype.prisma`):
    `AltairCoopProfile`, `AltairMatchPlayer`, `AltairMetaProgress`,
    `AltairSoloRun`, `ArcadeSeedRun`, `CanvasCooldown`, `ConnectionsPlay`,
    `DailyPuzzleScore`, `GabrielsHornTableRead`, `GamePlayStatus`,
    `HuntProgress`, `NdwLivery`, `RMHboxProfile`, `SliceDailyEntry`,
    `SliceRun`, `SliceSetlist`, `SongPlay`, `TempleOfJoySave`,
    `Tf2HudUserBlob`, `VersecraftProgress`, `VersecraftSave`,
    `RmhTypeDailyEntry`, `RmhTypeKeyStat`, `RmhTypeLessonProgress`,
    `RmhTypeProfile` (25).
- **Decisions — per table** (checked against the schema and each board's
  reader on the sprint 07 tip; the implementer re-confirms each reader, and a
  table whose check fails stays `todo` with the new reason, reported):

  | Model | Decision | Board and why |
  | ----- | -------- | ------------- |
  | `AltairCoopProfile` | erase | The co-op board orders this table (`totalCoopWins`, `totalRevivesGiven` indexes) at read time; the row going takes the member off it. |
  | `AltairMatchPlayer` | **deidentify** | A row in a shared co-op match (`AltairMatch.players`, up to four players). `userId` is required, so the row stays; `userName` (a copied display name) becomes "Deleted user". Other players' match keeps its shape. |
  | `AltairMetaProgress`, `AltairSoloRun` | erase | Solo meta progress and solo runs (in-game coins only; the site ledger is separate and kept). |
  | `ArcadeSeedRun` | erase | Daily / seed / basket boards: `board()` in `lib/arcade/runs.server.ts` reads these rows, cached 30 s per seed key; the TTL is the drop (no key list to read). |
  | `CanvasCooldown` | erase | A timer, no board. |
  | `ConnectionsPlay` | erase | **No children** (it is the child of `ConnectionsGrid`). The grid's `playCount`, `solveCount`, `ratingSum`, `ratingCount` stay: anonymous tallies on a kept, member-authored grid (the counter rule below). |
  | `DailyPuzzleScore` | erase | The leaderboard and results endpoints (`lib/daily-puzzles/api/daily-puzzles.{leaderboard,results}.server.ts`) read at request time; the member's own stats cache `dailyStatsKey(userId)` is dropped after the transaction. |
  | `GabrielsHornTableRead` | erase | The member's own tells statistics. |
  | `GamePlayStatus` | erase | Counts by status are computed at read. |
  | `HuntProgress` | erase | The hunt's finish board orders `durationMs` at read. |
  | `NdwLivery`, `TempleOfJoySave`, `Tf2HudUserBlob`, `VersecraftProgress`, `VersecraftSave` | erase | Saves and cosmetics. `Tf2HudUserBlob` is a link to a content-addressed blob other members may share; the blob stays (an orphan sweep is not this feature's). |
  | `RMHboxProfile` | **deidentify** (reset) | **Has children:** `RMHboxMatchPlayer.profile` is `onDelete: Cascade`, so deleting the profile would delete the member's rows from other players' multiplayer matches. The totals, streaks and `minigameStats` are reset to their defaults instead, and the RMHBox boards (`server/rmhbox/leaderboard.ts`, both `findMany`s) gain `totalGamesPlayed: { gt: 0 }` so a reset profile is never listed. The member's `RMHboxMatchPlayer.userName` copies become "Deleted user" (that model has no `User` relation, so no registry entry; an `updateMany` by `userId`). |
  | `SliceDailyEntry`, `SliceRun` | erase | The daily board and per-chart boards read at request time. The library shelves cache (10 min, anonymous) lists songs, never players. |
  | `SliceSetlist` | erase, **scope** `isPublic = false` | Private setlists go. **Public** setlists are published lists other members open, like public decks (an open owner decision), so they stay under "Deleted user"; the scope says so. |
  | `SongPlay` | erase | Per-member play counts; `Song.plays` stays (counter rule). |
  | `RmhTypeDailyEntry` | erase | The daily board orders `wpm` at read. |
  | `RmhTypeKeyStat`, `RmhTypeLessonProgress` | erase | Private counters and lesson progress. |
  | `RmhTypeProfile` | **deidentify** (reset) | **Has children:** `RmhTypeMatchPlayer.profile` cascades, so erasing would cut the member out of other racers' finished races. Totals and bests reset to defaults; the board (`fetchLeaderboard` in `server/socket-server/handlers/rmhtype.ts`) already requires `bestWpm > 0`, so the reset profile drops off it. The member's `RmhTypeMatchPlayer.userName` copies become "Deleted user" (no `User` relation, no registry entry). |

  **Counter rule (shared with 19):** an anonymous tally on a kept model
  (`ConnectionsGrid` plays and ratings, `Song.plays`) is left as it is: it
  records that something happened and names nobody, correcting it would
  touch a `keep` model (the coverage test forbids that), and other members'
  visible numbers would jump. No table stays `todo` for "needs a counter
  correction".

  **Known residue, reported not fixed:** `RmhTypeMatch.results`,
  `RMHboxMatch.results` and `AltairMatch.results` are JSON snapshots that may
  hold the player's name; the implementer reports whether any reader shows a
  name from them (if one does, the follow-up is a reader change, not a JSON
  rewrite inside the deletion transaction).

  If every table holds, all 25 leave `todo`: `TODO_CEILING` goes from 68
  (after 19) to **43**.
- **Shape:** `gameProgressErasureOps(userId)` in
  `lib/account/erasure-games.server.ts` under the `s08-20` anchor (Prisma
  operations only: `deleteMany`, and `updateMany` for the two resets and the
  three name copies), plus `dropGameBoardCaches(userId)` after the
  transaction (today: `dailyStatsKey(userId)`; the 30 s arcade boards expire
  on their own). `TODO_CEILING` falls by the number classified.

## Functional requirements

1. FR-1 Each of the 25 tables erased, de-identified or kept with a reason
   that names its board or why not, as tabled above.
2. FR-2 The member's cached stats dropped after the transaction.
3. FR-3 The RMHBox boards skip reset profiles; the three `*MatchPlayer`
   name copies read "Deleted user".
4. FR-4 Registry, ceiling and generated deletion doc.

## Non-functional requirements

- **Correctness:** no other player's data is deleted; boards read after
  deletion never name the member.
- **Performance:** one statement per table; cache drops are keyed, never a
  scan.
- **Privacy:** the point of the feature.

## Data model and API

- No schema change. New `lib/account/erasure-games.server.ts`; edits to
  `deletion.server.ts` (anchor and the after-transaction call),
  `erasure-registry.ts`, `docs/account-deletion.md`,
  `server/rmhbox/leaderboard.ts` (the `totalGamesPlayed > 0` filter).

## Testing requirements

- Main suite `lib/account/__tests__/game-progress-erasure.test.ts`: the
  operation for each table and its `where`; no `deleteMany` on
  `RMHboxProfile` or `RmhTypeProfile` (only the reset `updateMany`); the
  three name copies updated by `userId`; `SliceSetlist` deleted only where
  `isPublic` is false; no update on `ConnectionsGrid` or `Song`; cache drop
  called with the member's key.
- `server/rmhbox/__tests__/…` (the board's existing test, or a new one):
  a profile with `totalGamesPlayed = 0` is not listed.
- `erasure-coverage.test.ts` with the lower ceiling;
  `pnpm docs:deletion:check`.
- Existing game board tests stay green (`lib/__tests__/leaderboard*`,
  daily puzzles, Slice It ranking, arcade seeded).

## Acceptance criteria

- [ ] A member with a Slice It daily entry, a seeded Dream Rift run and a
      Versecraft save deletes their account: the rows are gone and today's
      boards no longer list them.
- [ ] A finished RMHType race and an RMHBox match still show every racer,
      the deleted one as "Deleted user"; neither board lists the reset
      profile.
- [ ] A public Slice It setlist of the deleted member stays; a private one
      goes.
- [ ] `TODO_CEILING` equals the number of `todo` entries left; every table
      left `todo` has a reason that names what blocks it.

## Out of scope

Ratings (`EloRating`, `RankedSeasonRating` — a product call), Doctrine
reputation, purchased items and inventory, game reviews and guides (owner
decision).

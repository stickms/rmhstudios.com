# 04 — Your Altair co-op record, and the co-op boards

Surface: Altair's "Your runs" screen (a co-op record above the co-op list), the Altair leaderboard (two co-op tabs),
the data export. Wave 4. Namespace `altair-coop`. App tier (L8).

## User story

As a member who plays Altair co-op with friends, I want to see my co-op record — runs, wins, revives given and
received — and how it compares with other players, so that being the one who keeps the team alive counts for
something.

## Requirements elicitation

- **What exists (verified):**
  - `AltairCoopProfile` (`prisma/schema/games/altair.prisma`: `totalCoopRuns`, `totalCoopWins`,
    `totalRevivesGiven`, `totalRevivesReceived`, `totalCoopKills`, `totalCoopCoins`, `favoriteClassId`, indexes on
    `totalCoopWins` and `totalRevivesGiven`) is written only from server-verified co-op matches
    (`features/altair/engine/verify/persist.server.ts`, inside the match transaction) and **read by nothing**. The
    erasure registry already says "the co-op board orders this table at read time", but no board exists.
  - `favoriteClassId` is set on the first co-op run only (the `create` branch) and never updated, so it names the
    first class played, not the favourite.
  - The board endpoint `GET /api/altair/leaderboard?type=` (`features/altair/api/altair.leaderboard.server.ts`) offers
    `time`, `kills`, `xp`, `gold`, `survival` over `AltairPlayer`, applies board privacy (`notHiddenWhere`,
    `leaderboardHiddenUserIds`) and a public cache policy.
  - "Your runs" (sprint 13 03): `features/altair/ui/screens/RunsScreen.tsx` over `features/altair/api/
    altair.runs.server.ts`, with co-op matches from `AltairMatchPlayer` (which carries `classId`).
  - The export carries `altairRuns` (sprint 13) and not the co-op totals.
- **Decisions:**
  - **Record:** "Your runs" gains a co-op record line above the co-op list: runs, wins (and the win rate as a whole
    percentage), revives given, revives received, kills; and the favourite class computed now as the class the member
    played most in co-op (`AltairMatchPlayer.classId`, ties to the most recent), not the stored field. A member with no
    co-op profile sees no record line.
  - **Boards:** two new `type` values, `coop-wins` and `coop-revives`, over `AltairCoopProfile` ordered by the indexed
    column, top 10, names joined now through the existing username rule; board privacy applies through
    `leaderboardHiddenUserIds()` and `userNotHiddenWhere` (the required-`userId` form; `AltairCoopProfile.userId` is
    required, so the `notHiddenWhere` `OR userId: null` form is wrong here), which covers members who hid themselves
    and members banned now (`bannedUntil` in the future) — the same set the `AltairPlayer` boards leave out. An erased
    member has no profile row (`erase`). A member's own place is not computed this sprint.
  - **The stored `favoriteClassId`** is left as written (no migration); nothing reads it after this feature, and the
    computed favourite replaces it on screen. Recorded for the owner as a column to drop later.
  - **Export:** `altairCoop` (the totals and the computed favourite) under the sprint 14 export anchor.
  - **Erasure:** unchanged (`erase`, already in place).

## Functional requirements

1. FR-1 `features/altair/engine/coop-record.ts` (new, pure): win rate, favourite class from class counts with the
   recency tie-break.
2. FR-2 `features/altair/engine/coop-record.server.ts` (new): `getCoopRecord(userId)` (the profile plus a grouped
   count of `AltairMatchPlayer.classId`), `coopBoard(kind)`, `exportAltairCoop(userId)`.
3. FR-3 `features/altair/api/altair.leaderboard.server.ts`: the two `type` values call `coopBoard`; the cache policy is
   unchanged; the route stays in `BOARD_PRIVACY_READ_PATHS` (already the file's rule) and
   `features/altair/engine/coop-record.server.ts` is added under the Wave 0 anchor in `lib/game/leaderboard-privacy.ts`.
4. FR-4 The record in `GET /api/altair/runs` (`features/altair/api/altair.runs.server.ts`: only for `kind=coop` with
   no `cursor`, a new optional `coopRecord` field on `getAltairRunsApi`'s response, `null` when there is none and absent
   on solo and later pages), shown by `RunsScreen.tsx`; the two tabs in the menu's leaderboard
   (`features/altair/ui/screens/MenuScreen.tsx`, which calls `getAltairLeaderboardApi`).
5. FR-5 The export property under `// s14-04 altair-coop`.

## Non-functional requirements

- **Board privacy:** a hidden member is in neither co-op board (the board-privacy source scan holds the new reader).
- **Query shapes (verify against the schema):** `AltairCoopProfile.user` is the relation for the username and the
  ban and deletion filters; the class count is `altairMatchPlayer.groupBy({ by: ['classId'], where: { userId },
  _count: { _all: true }, _max: { createdAt: true } })` (`AltairMatchPlayer.createdAt` exists and is required; order
  in code, not with `nulls`).
- **Caching:** the two new board variants use the endpoint's existing public policy (the `type` is in the URL).

## Data model and API

No schema change. `GET /api/altair/leaderboard?type=coop-wins|coop-revives` → `{ username, totalCoopWins,
totalRevivesGiven, totalCoopRuns }[]`; `GET /api/altair/runs` gains `coopRecord: { runs, wins, winRate,
revivesGiven, revivesReceived, kills, favouriteClass } | null`.

## Testing requirements

- Product suite `features/altair/engine/__tests__/coop-record.product.test.ts`: win rate rounding, favourite class
  with ties.
- Main suite `features/altair/engine/__tests__/coop-board.test.ts`: hidden and banned members are excluded (through
  `userNotHiddenWhere`); order by the indexed column with `id` as the tie-break; top 10; the response carries no user
  id.
- `lib/game/__tests__/board-privacy-paths.test.ts`, `lib/account/__tests__/export-sprint-14.test.ts` (key
  `altairCoop`), `lib/__tests__/api-cache-policy.test.ts`.

## Acceptance criteria

- [ ] A member with co-op runs sees their record, with their most-played class, on "Your runs".
- [ ] The leaderboard has "Co-op wins" and "Revives" tabs, and a member who hid themselves from boards (or is banned)
      is on neither.
- [ ] An unknown `type` still falls back to the `time` board (the existing `default:` branch is unchanged).
- [ ] The export carries the member's co-op totals.

## Out of scope

The member's own place on the co-op boards, a co-op board by class, dropping the stored `favoriteClassId` column.

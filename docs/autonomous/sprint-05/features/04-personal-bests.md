# 04 — Personal best history

Surface: the game library page (`components/steam/GamePage.tsx`, loader in
`app/routes/games/_library/$gameId.tsx`), a "Your bests" section for the
signed-in player; written by `submitGameScore` (`lib/game/submit.server.ts`).
Wave 5. Namespace `personal-bests`.

## User story

As a player, I want to see how my best score in a game has improved over time —
each new record, when I set it, and by how much — so that I can tell I am
getting better even when I am nowhere near the top of the board.

## Requirements elicitation

- **What exists (verified):** every game that submits through `submitGameScore`
  (the ids in `scoredGameIds()`, `lib/game/registry.ts`) keeps only its current
  best: the adapters (`lib/game/adapters.server.ts`,
  `generic-adapter.server.ts`) overwrite with `Math.max`. `submitGameScore`
  already reads the previous best before writing and classifies the run
  (`classifyRun`: `'first-score' | 'pb' | null`, honouring `lowerIsBetter`); a
  PB raises `emitPersonalBest`. Nothing records the history, so "my best a month
  ago" is unknowable.
- **Decisions:** append one `GamePersonalBest` row each time `classifyRun`
  returns `first-score` or `pb`. Keep at most 100 rows per (member, game); the
  oldest beyond that are pruned in the same write. Games that submit through
  bespoke paths (the Laundry Sort and Gabriel's Horn socket hubs, Slice It's
  song boards) are out of scope; the section only renders for games in
  `scoredGameIds()`. Private to the member: no other member, no public API.

## Functional requirements

1. FR-1 A new best (or a first score) through `submitGameScore` writes a row:
   score, previous best (null for the first), progress, and time. A failed write
   never fails the submission (best-effort like `recordGamePlay`).
2. FR-2 The game page shows signed-in players with at least one row a "Your
   bests" section: a step line chart of best over time
   (`components/ui/line-chart.tsx`), the current best, the improvement over 30
   days ("+1 240 in 30 days", or "−3.2 s" for lower-is-better games), and the
   last ten records as rows (date, score, change).
3. FR-3 With no rows the section is not shown; signed-out viewers never see it.
4. FR-4 A "Show all" link opens the full history (up to 100) in a dialog with
   the same rows.
5. FR-5 The member can clear one game's history ("Clear history", confirmed)
   from the dialog; the current best on the board is not affected.

## Non-functional requirements

- **Performance:** the write is one insert plus a conditional prune (`DELETE …
  WHERE id IN (SELECT id … ORDER BY createdAt DESC OFFSET 100)`), only on a PB,
  which is rare relative to submissions. The read is
  `@@index([userId, gameId, createdAt])`, at most 100 rows, through a contract
  endpoint fetched by the page after paint (fades in via
  `components/ui/arrive.tsx`).
- **Security/privacy:** `auth: 'required'`; the endpoint only ever reads the
  caller's rows; `gameId` validated against `scoredGameIds()`. Erasure deletes
  the rows; export includes them.
- **i18n:** `personal-bests`; numbers and dates through `Intl` with the active
  locale; time-based games format durations via `formatDurationMs`
  (`lib/core/format.ts`).
- **Steel:** the chart is the shared primitive in ink; rows on rules with
  `t-meta` dates; no medal colours; "Clear history" is a quiet danger button
  inside the dialog.
- **Accessibility:** the chart has a text summary (`aria-describedby`) and the
  rows carry the same data.

## Data model and API

- `GamePersonalBest { id BigInt @id @default(autoincrement()), userId, gameId
  VarChar(60), score Int, previous Int?, progress Int?, createdAt DateTime
  @default(now()) }`, relation to `User` (back-relation under the auth anchor),
  `@@index([userId, gameId, createdAt(sort: Desc)])`,
  `@@map("game_personal_best")` in `prisma/schema/games.prisma`. Migration
  `20261125050000_s05_personal_bests`.
- `lib/game/personal-bests.server.ts`: `recordPersonalBest(tx | prisma, input)`,
  `listPersonalBests(userId, gameId)`, `clearPersonalBests(userId, gameId)`,
  `exportPersonalBests(userId)`; `lib/game/personal-bests.ts` (pure: improvement
  over a window, step series, lower-is-better sign).
- Contract `lib/game/personal-bests.contract.ts`; module
  `lib/game/api/games.$id.personal-bests.server.ts` (GET, DELETE).

## Testing requirements

- Main suite `lib/game/__tests__/personal-bests.test.ts`: a PB and a first score
  write a row; a non-PB does not; a failing insert does not fail
  `submitGameScore`; the prune keeps 100; GET returns only the caller's rows; an
  unknown game id is 400; DELETE clears only that game.
- Main suite `lib/account/__tests__/personal-bests-erasure.test.ts`.
- Product suite `lib/game/__tests__/personal-bests.product.test.ts`: improvement
  windows, lower-is-better signs, step series.

## Acceptance criteria

- [ ] Beating a best adds a point to the chart and a row to the list.
- [ ] A lower-is-better game shows improvements as reductions.
- [ ] Nobody but the player can read the history.
- [ ] Erasure removes it; export includes it.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

History for bespoke-route games, public PB timelines, comparisons with friends
(sprint 04's achievement compare covers achievements only).

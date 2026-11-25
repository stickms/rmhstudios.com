# 13 — Your standing in a ranked season

Surface: `/compete` "Ranked" tab (a "Your season" section above the ladder), each ranked game's row. Wave 6. Namespace
`ranked-standing`. Site tier (Steel).

## User story

As a member who plays ranked challenges, I want to see my own standing this season in each ranked game — my rating and
tier, or how many placement matches I have left, my record, where I sit on the ladder, how much my rating has decayed
and why, and when the season ends — so that I know what my next match is worth without scrolling a ladder I may not be
on.

## Requirements elicitation

- **What exists (verified):**
  - Ranked seasons: `RankedSeasonRating` (`prisma/schema/competitive.prisma`, keyed `userId_game_season`), the rules in
    `lib/ranked/season.ts` (`seasonFor`, `seasonWindow`, `seasonProgress`, `PLACEMENT_MATCHES` 5, `DECAY_AFTER_DAYS` 14,
    `DECAY_PER_DAY` 10, `DECAY_FLOOR` 1200, `applyDecay`, `idleDays`, `displayRating`), tiers in
    `lib/ranked/tiers.ts` (`tierForRating`), games in `RANKED_GAMES` (`lib/ranked/elo.ts`).
  - `getStanding(userId, game)` in `lib/ranked/season.server.ts` returns exactly this — provisional, placements left,
    `shed` ("Points shed to decay, so the UI can say why the number moved"), record and tier — and is **never called**.
    Only the ladder is read (`getLadder` through `GET /api/ranked/$game/leaderboard`,
    `lib/ranked/api/ranked.$game.leaderboard.server.ts`, `lib/ranked/ranked.contract.ts`), shown in
    `components/feed/RankedColumn.tsx` on `/compete` (`app/routes/_site/compete.tsx`, tab `ranked`).
  - The ladder hides members hidden from boards (`leaderboardHiddenUserIds`, `userNotHiddenWhere`;
    `lib/ranked/season.server.ts` is in `BOARD_PRIVACY_READ_PATHS`) and excludes provisional players.
- **Decisions:**
  - **What is shown, per ranked game the member has played this season:** rating and tier, or "Placement: {{count}}
    matches left"; wins, losses and draws; their place on the ladder ("12th of 340") computed as the count of placed,
    visible players with a higher displayed rating plus one (decay applied the same way the ladder applies it), or "Not
    on the ladder" while provisional or hidden by their own board privacy (they still see their own numbers, as with
    every board); "Down {{count}} points: no ranked match in {{days}} days" when `shed > 0`; the season's end date and
    progress. Games not played this season are listed once, collapsed: "Not played this season".
  - **Whose:** only the member's own; the endpoint takes no user id. The place is a count, never another member's name.
  - **Freshness:** read with React Query when the tab opens and after a ranked match is reported (the challenge
    mutation invalidates the query); no polling.
- **Not changed:** the ladder, the rating rules, decay.

## Functional requirements

1. FR-1 `lib/ranked/season.server.ts`: `getStandings(userId, now)` (all games in one query on
   `[userId, game, season]`, mapped through the same `displayRating` as `getStanding`, which it replaces as the one
   caller-facing read), `placeOf(game, displayedRating, now)` and `ladderSize(game, now)`. Decay is computed on read
   and only ever lowers a rating, so `placeOf` reads only the candidates that could be above the member: placed,
   visible rows (`placementsLeft: 0`, `userNotHiddenWhere(hidden)`) of the game and season with stored `rating >
   displayedRating`, through `@@index([game, season, rating(sort: Desc)])`, selecting `rating` and `lastPlayedAt`
   only, at most 5,000 (`PLACE_SCAN_CAP`); it applies `displayRating` to each and counts those still above, plus one.
   When the cap is reached the place is reported as "outside the top 5,000" (`place: null, beyondCap: true`) rather
   than a wrong number. `ladderSize` is a `count` of placed, visible rows. Pure helpers for the decay sentence and the
   place in `lib/ranked/standing.ts` (new).
2. FR-2 Endpoint `GET /api/ranked/standing` (registered module `lib/ranked/api/ranked.standing.server.ts`,
   `rateLimit: 'read'`, signed-in), declared in `lib/ranked/ranked.contract.ts`.
3. FR-3 `components/feed/RankedStanding.tsx` (new) above the ladder in `RankedColumn.tsx`: rows on rules with `t-meta`
   figures, a progress line for the season (a 1px rule filled to the progress, no animation), loading (skeleton),
   empty ("No ranked matches this season") and signed-out states; arrival through `components/ui/arrive.tsx`.

## Non-functional requirements

- **Privacy:** the place count honours board privacy; a hidden member's rating never contributes to another member's
  count (the same `userNotHiddenWhere`), and the file stays in `BOARD_PRIVACY_READ_PATHS`.
- **Performance:** one query for the member's rows, and per placed game one indexed range read (at most 5,000 rows
  of two columns) and one indexed count, on `@@index([game, season, rating(sort: Desc)])` (exists,
  `prisma/schema/competitive.prisma`).
- **Design (Steel):** no tier badges in colour; a tier is a word.

## Data model and API

No schema change. `GET /api/ranked/standing` → `{ season, endsAt, progress, games: { game, name, rating, tier,
provisional, placementsLeft, wins, losses, draws, place, beyondCap, of, shed, idleDays }[] }`.

## Testing requirements

- Main suite `lib/ranked/__tests__/standing.test.ts`: provisional rows have no place; a hidden player is not counted in
  others' places; decay changes the place as the ladder would (a player stored above the member but decayed below is
  not counted); the place equals the member's rank in `getLadder`'s order for the same rows; the cap reports
  `beyondCap`; only the caller's rows; signed-out is 401.
- Product suite `lib/ranked/__tests__/standing.product.test.ts`: the decay sentence, ordinal places in the reader's
  locale.
- `components/feed/__tests__/ranked-standing.test.tsx` (`renderToStaticMarkup`): placed, provisional and decayed rows.
- `lib/__tests__/ranked-season.test.ts` (the existing season tests) stays green. Gates: board privacy read paths, design consistency, Steel flat, arrival coverage, the useEffect-fetch ratchet (the
  new component reads through React Query).

## Acceptance criteria

- [ ] A member who has played three of their five placement matches sees "Placement: 2 matches left" for that game.
- [ ] A placed member sees their rating, tier, record and place on the ladder.
- [ ] After 16 idle days, the row says the rating fell and why.
- [ ] A member hidden from boards sees their numbers and "Not on the ladder".

## Out of scope

Other members' standings, past seasons' history, rating graphs.

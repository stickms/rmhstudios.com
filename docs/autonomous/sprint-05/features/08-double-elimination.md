# 08 — Double-elimination tournaments

Surface: tournament creation
(`components/tournaments/CreateTournamentDialog.tsx`), the bracket
(`components/tournaments/BracketView.tsx`,
`app/routes/_site/tournaments.$id.tsx`), the bracket engine
(`lib/tournaments/bracket.ts`) and match settlement
(`lib/tournaments/tournament.server.ts`). Wave 1. Namespace
`double-elimination`.

## User story

As a tournament organiser, I want a double-elimination format, where a player is
out only after a second loss, so that one bad game does not end a player's night
and the final is played by the two strongest players.

## Requirements elicitation

- **What exists (verified):** `TournamentFormat`
  (`prisma/schema/competitive.prisma`) already contains `DOUBLE_ELIM`, commented
  "reserved — not yet implemented by the bracket engine". The engine
  (`lib/tournaments/bracket.ts`, pure) builds single elimination with standard
  seeding and byes (`generateSingleElim`, `standardSeedPositions`) and round
  robin; Swiss lives in `swiss.ts` / `swiss-flow.ts`. Matches link a winner
  forward through `TournamentMatch.nextMatchId` / `nextSlot`; `advanceIntoNext`
  and `settleMatch` move winners, `maybeCompleteTournament` ranks and pays out
  with `computePayouts`. The create schema
  (`lib/tournaments/tournament-schema.ts`) and dialog offer three formats.
  Pick'em (`lib/competitive/pickem.server.ts`) only supports `SINGLE_ELIM`.
- **Decisions:** a standard double-elimination bracket for 4–64 entrants: a
  winners bracket (as single elimination), a losers bracket fed by
  winners-bracket losers in the conventional crossover order (to avoid immediate
  rematches), and a grand final between the two bracket winners. **Bracket
  reset:** if the losers-bracket champion wins the grand final, a second grand
  final is played (created when needed). Placements: 1 champion, 2 runner-up, 3
  the loser of the losers-bracket final, 4 the loser of the losers-bracket
  semifinal, then groups by the losers-bracket round in which a player fell
  (ties broken by wins, then seed). Byes in round 1 of the winners bracket do
  not send anyone to the losers bracket (a bye has no loser). Pick'em stays
  single-elimination only (the create flow says so).

## Functional requirements

1. FR-1 The create dialog offers "Double elimination" with a help line; minimum
   4 players.
2. FR-2 Starting a double-elimination tournament creates every winners-, losers-
   and grand-final match row up front with both forward links (winner and
   loser); only the bracket-reset match is created lazily.
3. FR-3 Settling a winners-bracket match moves the winner forward and the loser
   into their losers-bracket slot; settling a losers-bracket match eliminates
   the loser (`eliminatedAt`, `losses`). Auto-advance through byes in both
   brackets works as in single elimination.
4. FR-4 Grand final: if the winners-bracket champion wins, the tournament
   completes; if the losers-bracket champion wins, a reset match is created
   between the same two and the tournament completes after it.
5. FR-5 The bracket page shows three sections — Winners, Losers, Final — each
   with its rounds as columns (horizontally scrollable on phones), using the
   existing match cells; a player's path is highlighted on hover/focus as in
   single elimination.
6. FR-6 Placements and payouts follow the rule above through `computePayouts`;
   cancelling refunds exactly as other formats.

## Non-functional requirements

- **Correctness:** the engine is pure and exhaustively tested for every size
  4–64 (each entrant plays until two losses except the champion; no match has
  two feeds into one slot; every non-final match has a winner target; every
  winners-bracket match except a bye has a loser target). Settlement keeps the
  existing transaction and CAS patterns; the reset match is created inside the
  settling transaction under the existing per-tournament lock (read
  `settleMatch` for the lock it takes).
- **Performance:** at most 2n + 1 matches (127 for 64) — the bulk insert path
  already used for round robin (`createMany`) is reused.
- **Security:** no new endpoint; the format joins the zod enum in
  `tournament-schema.ts`. Reporting results keeps its existing authorisation
  (`reportMatch`).
- **i18n:** `double-elimination` for new labels (section titles, "Grand final",
  "Bracket reset", the help line); round labels "Losers round {{n}}".
- **Steel:** sections separated by rules with `t-heading` titles; no
  colour-coding of brackets (text labels only); match cells unchanged.
- **Accessibility:** each section is a labelled region; the bracket remains
  navigable by keyboard as today.

## Data model and API

- `TournamentMatch` gains `bracket String @default("W") @db.VarChar(2)` (`W`,
  `L`, `GF`, `GR`), `loserNextMatchId String?`, `loserNextSlot Int?`. Migration
  `20261125010200_s05_double_elimination` (three `ADD COLUMN`s; the default is
  constant, so it is metadata-only). The `@@unique([tournamentId, round, slot])`
  stays valid by numbering losers-bracket rounds after the winners' (document
  the numbering in `bracket.ts`; `bracket` disambiguates for display).
- `lib/tournaments/bracket.ts`: `generateDoubleElim(orderedIds)` returning
  matches with `bracket`, `nextKey`/`nextSlot` and `loserKey`/`loserSlot`;
  `generateBracket` dispatches it; `resolveBracketRows` resolves loser links
  too.
- `lib/tournaments/tournament.server.ts`: start path accepts the format;
  `advanceIntoNext` handles the loser link; grand-final and reset handling in
  `settleMatch`; ranking branch in `maybeCompleteTournament`; `getTournament`
  DTO gains `bracket` and `loserNextMatchId` per match (additive).

## Testing requirements

- Product suite `lib/tournaments/__tests__/double-elim.product.test.ts`: for
  every n in 4..64 the structural invariants above; known 8-player crossover
  order; byes for 5, 6 and 7 players.
- Main suite `lib/tournaments/__tests__/double-elim-flow.test.ts` (fake tx, like
  `cancel-tournament.test.ts`): a full 4-player run with the winners champion
  winning the grand final; one with a bracket reset; placements and payouts for
  both; a losers-bracket loss eliminates.

## Acceptance criteria

- [ ] An 8-player double-elimination tournament runs to completion with correct
      placements.
- [ ] A bracket reset happens only when the losers-bracket champion wins the
      first grand final.
- [ ] Nobody is eliminated before a second loss.
- [ ] The bracket reads clearly at 390 px and 1280 px, Day and Night, `ar`.

## Out of scope

Pick'em for double elimination, seeding methods (18), losers-bracket byes
optimisation beyond the conventional order.

## As built

- Engine, settlement, DTO, schema (min 4 players via `maxPlayers` refine and
  `minPlayers` on create; pick'em stays `SINGLE_ELIM`-only server-side), dialog,
  and the three-section bracket (labelled sections with a heading, a keyboard
  focusable scroll region per section, round columns with `h3` labels) are
  implemented and tested (`double-elim.product.test.ts`, 4..64;
  `double-elim-flow.test.ts`).
- Byes in round 1 leave no losers-bracket rows: a losers match with one possible
  entrant is a pass-through routed to what it would have fed.
- Concurrent settles that feed the same next match write different slot columns
  of one row; the second writer blocks on the row lock and then sees both slots,
  so the match becomes READY exactly once. The reset is created only by the
  settle that wins the match CAS claim.
- Not built: the FR-5 "path highlight" on hover/focus. Single elimination has no
  such highlight either, so there was nothing to extend.

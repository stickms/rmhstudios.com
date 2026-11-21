# 18 — Tournament seeding

Surface: tournament creation
(`components/tournaments/CreateTournamentDialog.tsx`), the pre-start entrant
list on `/tournaments/$id`, the start path (`startTournament` in
`lib/tournaments/tournament.server.ts`). Wave 3 (after 08). Namespace
`tournament-seeding`.

## User story

As a tournament organiser, I want to seed players by their rating, at random, or
by hand — instead of by the order they signed up — so that the two strongest
players do not meet in the first round and early sign-ups do not get an unfair
path.

## Requirements elicitation

- **What exists (verified):** `startTournament` seeds every format by join
  order: "Seed by join order, then build the bracket over entrant ids" (single
  elimination and round robin) and the same for Swiss (`seed: i + 1` from
  `loadEntrants`). `TournamentEntrant.seed` exists. `EloRating`
  (`prisma/schema/competitive.prisma`, unique `[userId, game]`) holds per-game
  ratings; `Tournament.gameId` names the game. The bracket engine already places
  seeds with `standardSeedPositions`. Sprint 04 added check-in (only checked-in
  entrants start); 08 adds double elimination in wave 1.
- **Decisions:** `Tournament.seeding` with four methods: `join` (today's
  behaviour and the default, so old tournaments are unchanged), `rating` (Elo
  for the tournament's game, descending; members without a rating count as 1000,
  the model default; ties by join order), `random` (cryptographic shuffle at
  start, recorded so it is reproducible from the stored seeds), `manual` (the
  organiser orders entrants before start; anyone not placed is appended in join
  order). The method can be changed until the tournament starts. Seeds are shown
  to everyone once the tournament starts; before start, a manual order is
  visible to the organiser only.

## Functional requirements

1. FR-1 The create dialog gains "Seeding": By sign-up order, By rating, Random,
   Set by hand (`components/ui/select.tsx`), with a one-line explanation each;
   the organiser can change it on the tournament page until start.
2. FR-2 With `manual`, the organiser sees the entrant list with Move up / Move
   down (and keyboard reordering) and a "Seeds" column; saving stores the order.
3. FR-3 With `rating`, the pre-start list shows each entrant's rating in
   `t-meta` and the projected seed.
4. FR-4 Starting applies the method for every format (single and double
   elimination, round robin, Swiss), writing `seed` 1..n, then builds the
   bracket from that order.
5. FR-5 After start, the bracket and standings show seed numbers next to names
   (single and double elimination).

## Non-functional requirements

- **Correctness:** seeding is a pure function
  `orderEntrants(method, entrants, ratings, manualOrder, rng)` in
  `lib/tournaments/seeding.ts`; the start transaction reads ratings and the
  manual order inside the existing start lock (`claimStart`) and applies them
  before generating. Manual order writes are refused once the tournament has
  left `REGISTRATION`, checked by a conditional update on status.
- **Security:** only the creator (or an admin, matching existing tournament
  management rules) changes seeding or the manual order; zod-validated (`method`
  enum; `order` a comma-separated list of entrant ids, each belonging to the
  tournament, no duplicates).
- **Randomness:** `crypto.getRandomValues` (no `Math.random`).
- **i18n:** `tournament-seeding`.
- **Steel:** list rows on rules; mono seed numbers; reordering buttons are icon
  buttons with text labels for screen readers.
- **Accessibility:** reordering by keyboard (buttons, not drag only); the new
  order is announced in a polite live region.

## Data model and API

- `Tournament.seeding String @default("join") @db.VarChar(8)`;
  `TournamentEntrant.manualSeed Int?` (organiser's order before start).
  Migration `20261125030200_s05_tournament_seeding`.
- `lib/tournaments/seeding.ts` (pure), `lib/tournaments/seeding.server.ts`
  (`setSeedingMethod`, `setManualOrder`, `projectedSeeds` for the pre-start
  view); `startTournament` uses `orderEntrants`.
- Contract `lib/tournaments/seeding.contract.ts`; module
  `lib/tournaments/api/tournaments.$id.seeding.server.ts` (GET projected seeds —
  organiser sees manual order; PUT `{ method?, order? }`). The create schema
  (`tournament-schema.ts`) accepts `seeding`.

## Testing requirements

- Product suite `lib/tournaments/__tests__/seeding.product.test.ts`: each
  method's order, ties, unrated entrants, partial manual orders, deterministic
  random with an injected rng.
- Main suite `lib/tournaments/__tests__/seeding.test.ts`: only the organiser can
  change seeding; changes after start refused; start writes seeds per method for
  single elimination, double elimination and Swiss; an unknown entrant id in the
  order is 400.

## Acceptance criteria

- [ ] A rating-seeded 8-player bracket puts the top two ratings in opposite
      halves.
- [ ] A hand-set order is used exactly.
- [ ] Old tournaments (method `join`) start exactly as before.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Seeding by past tournament results, re-seeding between Swiss rounds (Swiss pairs
by standings), drag-and-drop libraries.

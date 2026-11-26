# 14 — Your tournaments, and what each place won

Surface: the Compete hub's Tournaments section (`/compete`, a "Yours" tab), a finished tournament's page
(`/tournaments/$id`, a prize column), the data export. Wave 6. Namespace `tournament-prizes`. Site tier (Steel).

## User story

As a member who plays in tournaments, I want one list of the tournaments I entered or hosted with where I placed and
what I won, and I want a finished tournament's page to say what each place took home, so that I can look back on my
results without remembering every bracket's address, and see that the prize pool went where it should.

## Requirements elicitation

- **What exists (verified):**
  - Settling a tournament (`maybeCompleteTournament` in `lib/tournaments/tournament.server.ts`) writes each entrant's
    `placement` (`TournamentEntrant`, `prisma/schema/competitive.prisma`) and, for every paid place, a
    `TournamentPayout` row (`tournamentId`, `userId` plain, `placement`, `amountCoins`). `getTournament` returns
    `payouts`, but **the tournament page never shows them** (`app/routes/_site/tournaments.$id.tsx` renders
    placements and a winner banner only); no other reader touches `TournamentPayout`.
  - The Compete hub's `components/compete/TournamentsSection.tsx` lists tournaments by status (Open, Live, Finished,
    through `components/ui/tabs.tsx`) from `listTournaments({ status })` (`GET /api/tournaments`,
    `lib/tournaments/api/tournaments.server.ts`, contract `listTournamentsApi`). There is **no list of a member's own
    tournaments on the site**; the developer API has one (`GET /api/v1/me/tournaments`,
    `lib/api/v1/tournaments.server.ts`).
  - Tournament payouts are not in the data export; the erasure registry keeps them (`TournamentPayout: keep`).
- **Decisions:**
  - **"Yours" tab** (signed-in only) beside Open, Live and Finished: every tournament the member entered or hosted,
    not cancelled ones they only entered and withdrew from, newest first, keyset paged on (`createdAt`, `id`), 20 a
    page. Each row: title, game, status, the member's placement ("3rd of 16", or "Host"), and the prize won
    ("Won 120 coins"), with the format's `t-meta`.
  - **Prize column** on a finished tournament's standings: each placement's `amountCoins` from the payouts ("—" for
    an unpaid place), and a line "Prize pool: N coins, rake M%" when the tournament had one. Cancelled tournaments
    show "Cancelled — entry fees were refunded" (the existing refund rule, `cancelTournament`).
  - **A new read** `listMyTournaments(userId, cursor)` (`GET /api/tournaments/mine`, private), reusing the developer
    API's existing query shape (`lib/api/v1/tournaments.server.ts`) where it fits rather than writing a third.
  - **Self-exclusion:** a member's own history stays visible (it is a record, not a way to stake); the "Yours" tab
    offers no entry or join action.
  - **Export:** the member's entries (tournament, game, placement, joined, prize) and their payouts, under the Wave 0
    export anchor.

## Functional requirements

1. FR-1 `lib/tournaments/mine.server.ts` (new): `listMyTournaments`, `exportMyTournaments(userId)`.
2. FR-2 `lib/tournaments/api/tournaments.mine.server.ts` (new, registered module, `auth: 'required'`), contract
   `listMyTournamentsApi` in `lib/tournaments/tournaments.contract.ts`, a query in
   `lib/tournaments/tournaments.queries.ts`.
3. FR-3 `components/compete/TournamentsSection.tsx`: the "Yours" tab (signed in), its rows and "Show more".
4. FR-4 `app/routes/_site/tournaments.$id.tsx`: the prize column and the pool line from `payouts`.
5. FR-5 Export under the anchor.

## Non-functional requirements

- **One query per page:** entries joined to tournaments (`TournamentEntrant` by `userId`, the existing unique on
  (`tournamentId`, `userId`)) unioned with hosted ones (`Tournament.createdById`), merged and cut in the server; payouts
  for the page in one `findMany` by (`tournamentId in`, `userId`).
- **Query shapes (verify against the schema):** `TournamentPayout.userId` is a plain required column (filter by
  value); `placement` on the entrant is optional; `Tournament` has **no index on `createdById`** (its indexes are on `status`, `gameId`): the hosted half filters
  `createdById` together with `createdAt` over a small table; report its plan from the integration Postgres, and do
  not add an index.
- **Steel:** rows on rules, figures in `t-meta`; no new arbitrary utilities; at 390 px the placement and prize must
  not overlap the title (check it).
- **Cache:** `GET /api/tournaments/mine` is private and uncached.
- **Read-only:** nothing in this feature writes `TournamentPayout`, `TournamentEntrant.placement`, coins or the ledger;
  settlement (`maybeCompleteTournament`, idempotency key `tournament:<id>:payout:<userId>`, `@@unique([tournamentId,
  userId])`) is untouched, so no path here can pay twice. The prize column reads the `payouts` `getTournament` already
  returns; the "Yours" prize is that member's one payout row (the unique makes it at most one). A test asserts the new
  module calls no write method on its Prisma fake.

## Testing requirements

- Main suite `lib/tournaments/__tests__/mine.test.ts` (fakes through `shapeChecked`, bodies through `assertJsonSafe`):
  entered, hosted and both; withdrawn left out; placement and prize; paging without duplicates; export.
- Render test `components/compete/__tests__/tournaments-yours.test.tsx` (`renderToStaticMarkup`): the row text.
- The existing tournament suites (`lib/tournaments/__tests__/`), the API cache-policy test.

## Acceptance criteria

- [ ] A signed-in member opens Compete > Tournaments > Yours and sees every tournament they played or hosted, with
      their place and prize.
- [ ] A finished tournament's page shows what each paid place won and the pool.
- [ ] A signed-out visitor sees no "Yours" tab.
- [ ] The data export lists the member's tournament entries and prizes.

## Out of scope

Other members' tournament histories, career statistics across tournaments, prize changes after settlement.

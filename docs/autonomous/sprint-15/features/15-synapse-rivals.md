# 15 — Your head-to-head record in Synapse Storm

Surface: Synapse Storm's multiplayer menu ("Your matches" gains a "Rivals" view), and a rival's row opening the
matches you played together. Wave 3. Namespace `synapse-rivals`. App tier (L8).

## User story

As a Synapse Storm player who keeps meeting the same friends in versus, I want to see my record against each of them —
how often we played and how often I finished ahead — and open the matches we shared, so that a rivalry has a score.

## Requirements elicitation

- **What exists (verified):**
  - `SSPlayerMatch` (`prisma/schema/games/synapse-storm.prisma`: `matchId`, `userId`, `displayName`, `score`,
    `maxCombo`, `puzzlesSolved`, `puzzlesMissed`, `finishedAt`, `lastUpdateAt`; `@@unique([matchId, userId])`,
    `@@index([matchId])`, `@@index([userId, lastUpdateAt(sort: Desc)])`, table `ss_player_match`) holds one row per
    player per versus match. `userId` is an account id, `guest:<socketId>`, or `deleted:<row id>` after an erasure; the
    model has no `User` relation.
  - Sprint 14 03 built "Your matches" (`features/synapse-storm/engine/matches.server.ts`, `matches.ts`,
    `features/synapse-storm/api/games.synapse-storm.matches.server.ts`, `features/synapse-storm/ui/YourMatches.tsx`):
    the member's finished matches, other players by current name with `otherPlayerView` ("A player" for guests, blocks
    either way and bans; "Deleted user" for tombstones), place by score (`placeByScore`), a note that scores are
    reported by each player's game. Its specification listed "head-to-head records" as out of scope.
- **Decisions:**
  - **A rival** is another signed-in account the member finished at least one versus match with. Guests, tombstones,
    blocked members (either way) and banned members are never listed as rivals (they are "A player" in a match, and a
    rivalry with an unnamed opponent says nothing). A member who turned leaderboards off
    (`leaderboardHiddenUserIds()`, `lib/game/leaderboard-privacy.server.ts`) is not listed as anyone's rival either: a
    win and loss record against a named person is a ranking, and they asked not to be ranked (in a single match they
    stay as "Your matches" shows them today).
  - **The record:** matches together, the member's wins (finished ahead of them by score), losses, ties, and the date
    of the last match; sorted by matches together, then the latest. Only matches both finished count (`finishedAt` not
    null on both rows): a player who left early has no score to compare.
  - **One raw query**, a self-join of `ss_player_match` on `matchId` from the member's rows (indexed by `userId`)
    to the others (indexed by `matchId`), grouped by the other `userId`, cut to the top 50 rivals; names in one
    batched `user.findMany` (as `matches.server.ts` already does).
  - **Opening a rival** lists the shared matches through the existing matches endpoint with a new `with=<rivalId>`
    filter (the same keyset paging), so no second list is written.
  - **No account id leaves the server:** the existing match list sends other players as `{ kind, name }` only
    (`OtherPlayerView`, `matches.ts`), and the rivals view keeps that rule. Each rival row carries `key`: the rival's
    `SSPlayerMatch` row id from the latest shared match. The `with=<key>` filter resolves the key to that row's `userId`
    on the server after checking the viewer has a row in the same match (otherwise `404`), so a key cannot be used to
    look up a stranger.
  - **Scores remain client-claimed**; the view repeats the existing note.

## Functional requirements

1. FR-1 `features/synapse-storm/engine/rivals.server.ts` (new): `listRivals(userId)` (the raw query and the name
   read), and the `with` filter in `listMyMatches`.
2. FR-2 `features/synapse-storm/engine/rivals.ts` (new, pure): the win, loss and tie tally from score pairs; the
   rival filtering rules.
3. FR-3 `features/synapse-storm/api/games.synapse-storm.rivals.server.ts` (new, registered module, private) and the
   matches route's `with` query parameter (zod); contracts in `features/synapse-storm/engine/matches.contract.ts`.
4. FR-4 UI: a "Matches" / "Rivals" switch in `YourMatches.tsx` (`components/ui/tabs.tsx` is site tier; in the app tier
   use the game's existing toggle pattern, and check the design-consistency gate's tab-strip rule for `features/`),
   rival rows, and the shared-match list.

## Non-functional requirements

- **Raw SQL names:** the table is `ss_player_match` and the columns are quoted camelCase (`"userId"`, `"matchId"`,
  `"finishedAt"`, `"score"`); a test asserts the SQL text.
- **Bounded:** at most 50 rivals; the query reads only the member's own rows and their matches.
- **Query shapes (verify against the schema):** `finishedAt` is optional (`IS NOT NULL` in SQL); `score` is a required
  `Int`; counts from `COUNT(*)` are `bigint` in Postgres and must be converted with `Number()` before JSON.
- **Island rule:** `features/synapse-storm/feature.ts` declares `delivery: 'island'`; keep the menus' existing practice
  (`api()` from event handlers and local state, no React Query, no router imports).

## Testing requirements

- Main suite `features/synapse-storm/engine/__tests__/rivals.test.ts` (fakes through `shapeChecked`, bodies through
  `assertJsonSafe`): guests, tombstones, blocks, bans and board-hidden members left out; a match where either side left early not counted;
  the top-50 cut; the SQL names; `BigInt` counts converted.
- Product suite `features/synapse-storm/engine/__tests__/rivals.product.test.ts`: tallies with ties.
- Main suite: the matches route's `with` filter pages without duplicates and only within the pair's matches.
- The existing "Your matches" tests.

## Acceptance criteria

- [ ] A member who played eight versus matches with a friend sees "8 matches · 5 wins · 3 losses" for that friend.
- [ ] Opening the friend lists exactly the matches they played together.
- [ ] A member blocked either way, a guest, an erased member or a member hidden from boards never appears as a rival.

## Out of scope

A public versus board, rivals' records visible to anyone else, server verification of versus scores.

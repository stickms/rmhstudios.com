# 03 — Your Synapse Storm matches

Surface: Synapse Storm's multiplayer menu ("Your matches"), the data export, account erasure. Wave 3. Namespace
`synapse-matches`. App tier (L8), inside the game's island.

## User story

As a member who plays Synapse Storm against friends, I want to see my past versus matches — when, against whom, my
place and my score — so that a good night of matches is not gone the moment the lobby closes.

## Requirements elicitation

- **What exists (verified):**
  - The hub writes every versus match: `SSMatch` (on start, `status` `RUNNING` → `FINISHED`, `endAt`) and one
    `SSPlayerMatch` per player (`displayName` snapshot, then `score`, `maxCombo`, `puzzlesSolved`, `puzzlesMissed`,
    `finishedAt` on `ss:finishMatch`) in `features/synapse-storm/server/handlers.ts` (`ssMaybeFinishMatch`, the
    `ss:startMatch` and `ss:finishMatch` handlers), schema `prisma/schema/games/synapse-storm.prisma`. **Nothing reads
    either table**: no endpoint, no screen, no export.
  - `SSPlayerMatch.userId` is the session's user id, or `guest:<socketId>` for an anonymous player; it has no `User`
    relation and indexes only on `matchId` and `lobbyId`, so reading a member's rows needs an index.
  - Scores reaching the hub are client-claimed and bounded by the hub's anti-cheat (never decreasing,
    `SCORE_RATE_LIMIT` per interval); they never reach a board from this path (the solo board is `SynapseStormPlayer`).
  - The manifest says `delivery: 'island'` (`features/synapse-storm/feature.ts`) but the game has no `island.tsx` yet,
    so `lib/__tests__/islands.test.ts` does not cover it (it checks only features with an `island.tsx`). Its UI uses no
    React Query today (`git grep useQuery features/synapse-storm` is empty); this feature keeps it that way, so the
    game stays ready to become a real island: reads with `api()` from event handlers.
  - Altair's "Your runs" (sprint 13 03, `features/altair/api/altair.runs.server.ts`,
    `features/altair/ui/screens/RunsScreen.tsx`) is the model: own rows only, keyset paging on (time, id), other
    players' current names.
- **Decisions:**
  - **Rows shown:** the member's own `SSPlayerMatch` rows whose match is `FINISHED`, newest first by the row's own
    `lastUpdateAt` (required; the hub stamps it on every score update and on `ss:finishMatch`), keyset paged 20 at a
    time on (`lastUpdateAt`, `id`), both descending. Paging cannot use `finishedAt` (optional: a row that left early
    has none, and a keyset over a null column skips or repeats rows) nor `SSMatch.endAt` (another table, so no index
    on the member's rows can serve it). A match the member abandoned (no `finishedAt`) shows as "Left early"; the
    date shown is `SSMatch.endAt`, falling back to `lastUpdateAt`.
  - **Per match:** date and time (reader's locale), the member's place among the match's players by score (ties
    share a place), their score, best combo, solved and missed, and the other players as current names joined now
    (`<bdi>`), "A player" for a guest or across a block either way, "Deleted user" for an erased member. The snapshot
    `displayName` is never shown for a member account.
  - **Honesty:** the list says once "Scores in versus matches are reported by each player's game" (they are not
    server-verified), and no number from it feeds any board, quest or achievement.
  - **Index:** `@@index([userId, lastUpdateAt(sort: Desc)])` on `SSPlayerMatch` (Prisma's default name
    `ss_player_match_userId_lastUpdateAt_idx`), built `CONCURRENTLY` in a migration of its own and followed by an
    `_ensure_valid` migration.
  - **Erasure:** the member's `SSPlayerMatch` and `SSLobbyMember` rows keep their numbers for the other players'
    history but lose the name (`displayName` → "Deleted user") and the id (`userId` → a constant tombstone
    `deleted:<row id>`), so no later read can join them back; `SSLobby.hostUserId` is set to the same tombstone form.
    The operation lives in the feature's module and is listed under its erasure anchor; the models have no `User`
    relation, so its test is the record (feature 18 classifies them in the plain-column registry).
  - **Export:** the member's finished matches (date, place, score, combo, solved, missed, player count), never other
    players' names, as `synapseMatches` under the sprint 14 export anchor.

## Functional requirements

1. FR-1 `features/synapse-storm/engine/matches.ts` (new, pure): place-by-score with shared ties, the row view, the
   cursor encode/decode.
2. FR-2 `features/synapse-storm/engine/matches.server.ts` (new; `features/<id>/server/` holds the hub's socket
   handlers only, `features/CLAUDE.md`): `listMyMatches(userId, cursor)` (own rows joined to
   finished matches, the other players' ids resolved to names with blocks, bans and erasure applied, guests as "A
   player"), `exportSynapseMatches(userId)`, `synapseMatchErasureOps(userId)`.
3. FR-3 `features/synapse-storm/engine/matches.contract.ts` (new) and the endpoint module
   `features/synapse-storm/api/games.synapse-storm.matches.server.ts` (new, `GET /api/games/synapse-storm/matches`,
   `auth: 'required'`, `rateLimit: 'read'`, query `cursor` validated), listed in the feature manifest's `routes`.
4. FR-4 `features/synapse-storm/ui/YourMatches.tsx` (new): opened from `MultiplayerMenu.tsx`; loads with `api()` from
   the open handler and "Show more" (no React Query in the game's UI, as above); loading, empty, error and signed-out states.
5. FR-5 Schema: the index above; migrations `20261228030300_s14_synapse_matches_index` (the `CREATE INDEX
   CONCURRENTLY` alone) and `20261228030301_s14_synapse_matches_index_ensure_valid`.
6. FR-6 The erasure operation under `// s14-03 synapse-matches` in `lib/account/deletion.server.ts`; the export
   property under the same line in `lib/account/export-sprint-14.server.ts`.

## Non-functional requirements

- **Privacy:** only the member's own rows; no response carries another player's user id; blocks either way show "A
  player".
- **Performance:** one indexed read per page plus one batched name read; at most 20 rows a page.
- **Query shapes (verify against the schema):** `SSPlayerMatch` has no relation to `User`, so names are a second
  `user.findMany({ where: { id: { in } } })`, never a nested select; the page is `orderBy: [{ lastUpdateAt: 'desc' }, { id: 'desc' }]`
  with the cursor as an explicit `OR` on (`lastUpdateAt`, `id`) (`lastUpdateAt` is required: no `nulls`); `finishedAt`
  is optional, so reading it as null ("Left early") is valid; the match join is `match: { status: 'FINISHED' }` through
  the `SSMatch` relation (`SSMatch.endAt` is optional).

## Data model and API

Index only (above). `GET /api/games/synapse-storm/matches?cursor=` →
`{ matches: { id, endedAt, place, players, score, maxCombo, solved, missed, finished, others: { name }[] }[],
nextCursor }`.

## Testing requirements

- Product suite `features/synapse-storm/engine/__tests__/matches.product.test.ts`: places with ties, cursor round trip.
  (Main suite: paging over three pages with equal `lastUpdateAt` values and a "Left early" row never skips or repeats a
  row.)
- Main suite `features/synapse-storm/engine/__tests__/matches.test.ts`: own rows only, unfinished matches excluded,
  guests and blocked players as "A player", erased players as "Deleted user", no user ids in the response.
- Main suite `lib/account/__tests__/synapse-erasure.test.ts`: the operations tombstone the member's rows and names and
  touch no other member's.
- `lib/account/__tests__/export-sprint-14.test.ts` (key `synapseMatches`), `lib/__tests__/migration-safety.test.ts`,
  `lib/__tests__/feature-manifests.test.ts`, `lib/__tests__/islands.test.ts`, the route table test.

## Acceptance criteria

- [ ] After a three-player match a member opens "Your matches" and sees the match with their place and the other two
      players' names.
- [ ] A player who blocked the member shows as "A player".
- [ ] After erasure the member's rows show "Deleted user" in the other players' lists, and the member's id is gone
      from every `ss_*` row.
- [ ] The export carries the member's matches and no other player's name.

## Out of scope

Head-to-head records, a versus board, server verification of versus scores, solo-run history.

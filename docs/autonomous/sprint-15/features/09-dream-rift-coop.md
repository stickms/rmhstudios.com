# 09 — Dream Rift co-op runs the hub vouches for, boards that keep names private, and your own co-op runs

Surface: Dream Rift's co-op leaderboard (`features/dream-rift/ui/Leaderboard.tsx`), the results screen, a new "Your
co-op runs" list in the menus, the data export. Wave 4. Namespace `dream-rift-coop`. App tier (L8).

## User story

As a Dream Rift player who clears a stage with friends, I want the co-op board to show only runs that really
happened, with each of us under our current name (or hidden if we asked to be), and I want to see the co-op runs I
was part of, so that the board means something and my name is not frozen into it.

## Requirements elicitation

- **What exists (verified):**
  - `POST /api/dream-rift/coop` (`features/dream-rift/api/dream-rift.coop.server.ts`) takes the host's claim: up to
    four players, each with a `userId` **the host chooses**, and snapshots each claimed account's `id`, `handle`,
    `name` and `image` into `DreamRiftCoopRun.players` (JSON, `prisma/schema/games.prisma`). Nothing checks that those
    members were in the host's lobby, so a host can put anyone's account on the board. The body is hand-validated
    (no zod), and the client posts it from `features/dream-rift/ui/Results.tsx`.
  - `GET /api/dream-rift/coop` returns the top 20 by `combinedScore` or `timeSurvived` with the stored snapshots. It
    applies **no board privacy** (a member who turned boards off, or a banned member, is shown) and the file is not in
    `BOARD_PRIVACY_READ_PATHS` (`lib/game/leaderboard-privacy.ts`). `features/dream-rift/ui/Leaderboard.tsx` fetches it
    from a `useEffect` with a URL string held in a variable (`fetch(url)`), which no fetch ratchet counts. Dream Rift is
    an island (`features/dream-rift/feature.ts`, `delivery: 'island'`): no React Query.
  - Erasure only nulls `hostUserId` (`leaderboardErasureOps`, `lib/game/leaderboard-privacy.server.ts`; registry
    `DreamRiftCoopRun: deidentify`): an erased member's handle, name and avatar stay in every co-op run's JSON.
  - The co-op hub (`features/dream-rift/server/handlers.ts`, registered by `server/socket-server/features.ts`) knows the
    real roster at `C2S.START` (`roster`: slot, `userId` or `'guest'`, name, character, host) and can reach Postgres
    the way other feature hubs do (`getPrismaClient` from `server/socket-server/prisma-client.ts`, as
    `features/balatro/server/queue.ts` does).
- **Decisions:**
  - **The hub starts the run:** each lobby player's account is `socket.data.userId` (set by the socket server's session
    auth in `resolveIdentity`; `'guest'` otherwise), never anything the client sent. At `START` with two or more
    players the hub creates a `DreamRiftCoopRun` row with the
    new columns `startedAt`, `memberIds` (the signed-in members' ids by slot, guests as `''`), `difficulty`, the host,
    and sends its id to the room in the start payload (`runId`). A failed insert logs and the game starts anyway
    (that run simply cannot be posted).
  - **The host finishes it:** the `POST` body gains `runId` (zod schema, contract updated) and the server finishes
    the row with one conditional `updateMany` (`id`, `hostUserId` = caller, `finishedAt: null`, `startedAt` within the
    last 6 hours), writing the scores and the players' names and characters; the accounts come from `memberIds`, never
    from the body. A second post, another member's post, a stale or unknown run is refused (`COOP_RUN_UNKNOWN`).
  - **Names are live:** the board resolves each slot's account at read time (current name and handle, avatar), shows
    a hidden or banned member as "A player", and leaves guests as their typed name. The stored JSON keeps no account
    snapshot on new rows; rows written before the feature keep showing, with their stored `account` objects ignored and
    resolved live by id the same way.
  - **Board privacy:** the read joins `BOARD_PRIVACY_READ_PATHS` under the anchor and uses `leaderboardHiddenUserIds()`.
  - **Only finished runs rank:** the board reads `OR: [{ finishedAt: { not: null } }, { startedAt: null }]` (finished
    hub runs and pre-feature rows), so a started, unposted run (score 0) never takes a board place.
  - **Your co-op runs:** `GET /api/dream-rift/coop/mine` (private) lists finished runs whose `memberIds` include the
    member, newest first, keyset paged on (`finishedAt`, `id`), 20 a page.
  - **Clean-up:** a nightly job deletes rows started more than 24 hours ago and never finished (`s15-09` jobs anchor).
  - **Erasure:** under the Wave 0 anchor, the member's id is removed from `memberIds` and their slot's name becomes
    "Deleted user" in every run they are in, including old rows whose JSON holds their account object
    (`players` `array_contains` `[{ account: { id } }]`); the registry reason is updated.
  - **Export:** the member's co-op runs (difficulty, scores, stage, cleared, player count, time; no other member's id).

## Functional requirements

1. FR-1 Schema: nullable `startedAt`, `finishedAt`, `memberIds String[] @default([])` on `DreamRiftCoopRun`
   (migration `20270105040300_s15_dream_rift_coop`), and `@@index([memberIds], type: Gin)` as an index on an existing
   table: `CREATE INDEX CONCURRENTLY` alone in `20270105040301_s15_dream_rift_coop_members_index`, then
   `20270105040302_s15_dream_rift_coop_members_index_ensure_valid`. **The model has no `@@map`**: the table is
   `"DreamRiftCoopRun"` and Prisma's default index name is `DreamRiftCoopRun_memberIds_idx`; the SQL uses both exactly.
2. FR-2 `features/dream-rift/server/handlers.ts`: create the run at `START`, `runId` in `StartPayload`.
3. FR-3 `features/dream-rift/engine/coop-runs.server.ts` (new): finish, board read with live names and privacy, own
   list, export, erasure ops, the prune.
4. FR-4 `features/dream-rift/api/dream-rift.coop.server.ts` (zod, `runId`, the conditional finish) and
   `dream-rift.coop.mine.server.ts` (new); contracts in `features/dream-rift/engine/dream-rift.contract.ts`
   (`submitDreamRiftCoopApi` gains `runId`; new `listDreamRiftCoopApi`, `listMyDreamRiftCoopApi`). `Leaderboard.tsx` loads the co-op board
   with `api()` from the click that opens the co-op tab or changes difficulty or metric (as Synapse Storm's
   `YourMatches.tsx` does), never from a `useEffect`: an `api(xxxApi` call in a `.tsx` with a `useEffect` raises
   `lib/__tests__/useeffect-fetch-ratchet.test.ts`. The solo board's existing fetch is left as it is.
5. FR-5 UI: "Your co-op runs" in the menus; the results screen posts with `runId`.
6. FR-6 The prune job under the jobs anchor; refusal `COOP_RUN_UNKNOWN` under the anchor.

## Non-functional requirements

- **Hub stays thin:** one insert per started co-op game, no other database work in the relay path.
- **No other player's account id** in any public response; the own list returns other players by current name only.
- **Query shapes (verify against the schema):** `memberIds` is `String[]` (`has`, `hasSome`); `players` is `Json`
  (`array_contains` for the legacy erasure match); `hostUserId` is optional; the new times are optional.
- **Cache:** the board keeps `CACHE_POLICY.leaderboard`; the own list is `private, no-store`.

## Testing requirements

- Main suite `features/dream-rift/api/__tests__/coop-runs.test.ts` (fakes through `shapeChecked`, bodies through
  `assertJsonSafe`): a finish by the host succeeds once; by another member, twice, unknown, stale, refused; accounts
  only from `memberIds`; the board hides hidden and banned members and shows live names; the own list pages without
  duplicates.
- Main suite `features/dream-rift/server/__tests__/coop-start.test.ts`: the hub creates the run with the roster and
  sends `runId`; a failed insert still starts the game.
- Main suite `lib/account/__tests__/dream-rift-coop-erasure.test.ts`: new and legacy rows scrubbed.
- `lib/game/__tests__/board-privacy-paths.test.ts`, `lib/__tests__/raw-api-fetch-ratchet.test.ts` and
  `lib/__tests__/useeffect-fetch-ratchet.test.ts` (both unchanged: neither may rise),
  `lib/account/__tests__/erasure-plain-columns.test.ts`; the board test also holds that a started, unfinished run
  is not listed.

## Acceptance criteria

- [ ] A co-op run posted by the host appears on the board with every member under their current name.
- [ ] A post naming a member who was not in the lobby, or a second post of the same run, is refused.
- [ ] A member who turned leaderboards off appears as "A player" on the co-op board.
- [ ] "Your co-op runs" lists the runs the member played in.
- [ ] After a member's account is deleted, no co-op run shows their name or avatar.

## Out of scope

Verifying scores (the host's game is authoritative, as for every Dream Rift score), a co-op board by character,
removing old rows' JSON in a data migration.

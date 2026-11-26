# 03 — Slice It in the developer API: in the catalogue, a chart's details, a player's stats and your own runs

Surface: `/api/v1/slice-it/*`, `/api/v1/me/slice-it/runs`, the OpenAPI document, the SDK and the API docs. Wave 2. No
UI namespace (the developer API's English JSON and docs). Developer API.

## User story

As a developer building a Slice It stat site or a personal practice tracker, I want the Slice It endpoints the site
already serves to be in the documented catalogue and SDK, and I want a chart's details, a player's public stats and my
own recent runs, so that I can build on documented, typed endpoints instead of guessing at two undocumented ones.

## Requirements elicitation

- **What exists (verified):**
  - Two v1 routes exist and work: `GET /api/v1/slice-it/charts` (`app/routes/api/v1/slice-it/charts.ts`: public,
    not-taken-down songs, `offset` paging, `genre` filter) and `GET /api/v1/slice-it/leaderboard`
    (`app/routes/api/v1/slice-it/leaderboard.ts`: one song's board by difficulty and modifier pool, handles not ids,
    board privacy through `leaderboardHiddenUserIds`). Both use the scope `read:slice-it` (`lib/api/scopes.ts`, "Read
    Slice It! charts, leaderboards and public player stats").
  - **Neither is in `ENDPOINTS`** (`lib/api/registry.ts`). A scripted comparison of every file under
    `app/routes/api/v1/` against the registry's paths finds exactly these two missing: so they are absent from
    `/api/v1/openapi.json`, the SDK (`packages/sdk/**`, `scripts/generate-sdk.ts`) and `docs/developer-api/endpoints/**`,
    and nothing would catch the next undocumented route.
  - The scope promises "public player stats", and no endpoint serves them. The site's player page
    (`app/routes/slice-it/player.$handle.tsx`) reads `playerProfile(handleOrId, viewerId)`
    (`features/slice-it/engine/player.server.ts`): career totals, best rows from `SongLeaderboard`, recent rows, uploads,
    charts and lamps. It applies no board-privacy filter.
  - A member's runs are `SliceRun` rows (`prisma/schema/games/slice-it.prisma`; `id` is a **`BigInt`**, `songId`,
    `chartId`, `score`, `accuracy`, `maxCombo`, `difficulty`, `modPool`, `cleared`, `isFullCombo`, `isPerfect`,
    `createdAt`).
  - Explicit scopes (sprint 13 10) keep a scope out of wildcards and defaults.
- **Decisions:**
  - **Catalogue the two routes as they behave today** (additive only: their fields, `offset`/`limit` and `meta` stay),
    in a new group `Slice It` added to `DOCUMENTED_GROUPS` (`lib/developer/explorer.ts`).
  - **New endpoints, all `read:slice-it` except the last:**
    - `GET /api/v1/slice-it/charts/{id}`: one public chart's metadata (the `charts` list fields plus `charts` (the
      song's published charts: id, difficulty, note count, revision), `reviews` count and averages of `fit`/`fun`).
      A private, taken-down or missing song is `404`.
    - `GET /api/v1/slice-it/players/{handle}`: a member's public career (total score, games played), their best 20
      rows (song id and title, score, accuracy, difficulty, pool, lamp) and their public uploads count. `404` when
      the member is hidden from boards (`leaderboardHiddenUserIds`), banned, or has no handle.
    - `GET /api/v1/me/slice-it/runs`: the key owner's own runs, newest first, keyset paged on (`createdAt`, `id`),
      `songId` filter; `id` serialised as a string. New **explicit** scope `read:slice-it-runs` (a member's own
      activity, like `read:games`), not in any wildcard or default grant.
  - **A registry guard:** a new test fails any file under `app/routes/api/v1/` whose path and methods have no
    `ENDPOINTS` entry, so no route ships undocumented again.
  - **Block checks:** the player endpoint answers `404` when the key owner and the player block each other.
  - **Caching:** the three public reads declare `CACHE_POLICY.leaderboard`-style public caching through the developer
    API wrapper's headers (as the existing two do); the `me` endpoint is `private, no-store`.

## Functional requirements

1. FR-1 `lib/api/registry.ts`: entries for the two existing routes and the three new ones (under the Wave 0 anchor),
   with examples whose `id` and timestamps are strings.
2. FR-2 `lib/api/scopes.ts`: `read:slice-it-runs` (explicit) under the anchor; `READ_SCOPES` and `WILDCARD_SCOPES`
   tests updated.
3. FR-3 `app/routes/api/v1/slice-it/charts/$id.ts`, `app/routes/api/v1/slice-it/players/$handle.ts`,
   `app/routes/api/v1/me/slice-it/runs.ts` (new route files, `withDeveloperApi`), with their reads in
   `lib/api/v1/slice-it.server.ts` (new).
4. FR-4 `lib/api/__tests__/v1-route-registry.test.ts` (new): every v1 route file is catalogued.
5. FR-5 `pnpm sdk:generate` and `pnpm docs:api` output; `docs/developer-api/changelog.md` line under the anchor;
   `docs/developer-api/scopes.md` gains the new scope.
6. FR-6 `BOARD_PRIVACY_READ_PATHS` (`lib/game/leaderboard-privacy.ts`) lists the players module under the anchor.

## Non-functional requirements

- **Additive:** no documented field changes type; `git diff packages/sdk` shows additions only.
- **No internal ids** for other members (handles only, as the leaderboard route's comment demands); the key owner's
  own run ids are theirs.
- **Performance:** the runs read uses the existing `@@index([userId, createdAt(sort: Desc)])` on `SliceRun` (with
  `songId`, the planner may use `[songId, createdAt]`; no new index).
- **Query shapes (verify against the schema):** `SliceRun.id` is `BigInt` (convert with `String()` before JSON);
  `accuracy` is a required `Float` (no `nulls` ordering, no `{ not: null }`); `chartId` is optional; the `Chart`
  relation's fields exist as selected.

## Testing requirements

- Main suite `lib/api/__tests__/v1-slice-it.test.ts` (fakes through `shapeChecked`, bodies through `assertJsonSafe`):
  each endpoint's happy path, private/taken-down/missing song `404`, a hidden or banned player `404`, a block `404`,
  the runs scope required and keyset paging without duplicates.
- Main suite `lib/api/__tests__/v1-route-registry.test.ts`.
- `lib/api/__tests__/scopes-explicit.test.ts` (the new explicit scope), `lib/developer/__tests__/explorer.product.test.ts`, the SDK check.

## Acceptance criteria

- [ ] `/api/v1/openapi.json` and the API docs list five Slice It endpoints.
- [ ] A key with `read:slice-it` reads a chart's details and a player's public stats; a hidden player is a 404.
- [ ] A key with `read:slice-it-runs` lists its owner's runs; a key without it gets 403.
- [ ] Adding a v1 route file without a registry entry fails a test.

## Out of scope

Writes (uploading or rating through the API), the chart blob, other members' runs, webhooks for runs.

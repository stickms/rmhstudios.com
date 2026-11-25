# 13 — Characters and parties in the developer API

Surface: `/api/v1/me/characters`, `/api/v1/me/characters/{id}`, `/api/v1/me/parties`, `/api/v1/me/parties/{id}`, a new
`read:characters` scope, their documentation and the SDK. Wave 4. No interface namespace: the developer settings list a
scope's group and description from `lib/api/scopes.ts`, as for every scope. Developer API.

## User story

As a player who runs an RMHCharacters sheet, I want my own tools — a Discord bot for my table, a stream overlay with my
hit points, a spreadsheet of my party — to read my characters and the party summaries I can already see on the site, so
that I stop copying numbers by hand.

## Requirements elicitation

- **What exists (verified):**
  - Characters (`RmhCharacter`, `prisma/schema/rmhcharacters.prisma`: `id` the client's UUID, `userId`, `system`
    `dnd5e | pf2e`, `name`, `data Json` — the normalised sheet, `createdAt`, `updatedAt`) are read and written through
    `features/rmhcharacters/api/rmhcharacters.characters*.server.ts`, owner only. The rules engines compute everything a
    sheet shows (`engine/dnd5e/rules.ts`, `engine/pf2e/rules.ts`); `engine/party-summary.ts` (`partySummary`) computes
    the summary members see (AC, HP, conditions, Perception or passive Perception, speed, initiative), never the raw
    sheet.
  - Parties (sprint 11 03, `engine/party.server.ts`: `listParties`, `getParty`, `readPartySheet` for the game master
    of a shared sheet only) re-check membership on every read.
  - The developer API has no RMHCharacters scope or endpoint (`lib/api/scopes.ts`, `lib/api/registry.ts`).
- **Decisions:**
  - **Read only.** One new scope, `read:characters` ("Read your characters and the summaries of your parties"), in a new
    scope group RMHCharacters. No write scope: sheets are validated by `normalizeCharacter` on a rich client and
    imports already exist (`ImportDialog.tsx`, D&D Beyond and Foundry formats); writes are left for later.
  - **Characters:** `GET /api/v1/me/characters` (cursor pages of `{ id, system, name, level, summary, updatedAt }`,
    `summary` being `partySummary`'s shape) and `GET /api/v1/me/characters/{id}` (the same plus `sheet`: the stored
    `data`, without the `portrait` image data, which is large; `portrait: boolean` says whether there is one).
  - **Parties:** `GET /api/v1/me/parties` (parties the key owner runs or plays in: name, system, role, member count) and
    `GET /api/v1/me/parties/{id}` (what `getParty` gives the key owner on the site: members' names, their characters'
    summaries, the turn order, never another player's sheet and never their `notes`). A party the key owner is not in is
    `not_found`.
  - **Rolls** (01's table rolls) are not in this feature: reading another player's rolls through a key is a later call.
  - **Caching:** `Cache-Control: private, no-store` on every response (the sprint 11 03 rule for sheets).

## Functional requirements

1. FR-1 `lib/api/v1/characters.server.ts` and `characters-schema.ts`: list, one, parties, one party, built on the
   engine functions (no second summary implementation).
2. FR-2 Route files under `app/routes/api/v1/me/` (`characters.ts`, `characters/$id.ts`, `parties.ts`,
   `parties/$id.ts`) with `withDeveloperApi` and `scope: 'read:characters'`.
3. FR-3 `lib/api/scopes.ts`: the scope under the Wave 0 anchor; `docs/developer-api/scopes.md`.
4. FR-4 `lib/api/registry.ts` entries, `NULLABLE` names in `scripts/generate-sdk.ts` and the changelog bullet, each
   under its Wave 0 anchor; `pnpm sdk:generate`, `pnpm docs:api`; `git diff` of the SDK shows no existing field changed
   type.
5. FR-5 The developer settings' scope picker (`components/developer/KeysManager.tsx`) shows the new group from
   `lib/api/scopes.ts`, as it does every scope; no UI change.

## Non-functional requirements

- **Privacy:** a key reads only its owner's characters and the party views its owner has on the site; a removed party
  member's key gets `not_found` on the next read.
- **Integrity:** summaries are computed by the same functions as the site; a test compares.
- **Compatibility:** additive only.

## Data model and API

No schema change. Response shapes as above; `sheet` is the stored JSON with `portrait` removed.

## Testing requirements

- Main suite `lib/api/v1/__tests__/characters.test.ts`: another member's character and a party the owner left are
  `not_found`; the party view never contains another member's `sheet` or `notes`; `portrait` removed; the scope is
  required; pages and cursors.
- Gates: the API registry and docs tests, SDK generation, the scopes test, the `api-handler-adoption` test.

## Acceptance criteria

- [ ] A key with `read:characters` lists its owner's two characters with their AC and HP.
- [ ] The party endpoint shows each member's summary and never a sheet.
- [ ] A key without the scope is refused.

## Out of scope

Writing characters, table rolls, webhooks for HP changes.

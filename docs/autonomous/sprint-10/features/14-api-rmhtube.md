# 14 — RMHTube in the developer API

Surface: `/api/v1/me/rmhtube/watch-later*`, `/api/v1/me/rmhtube/stats`, `/api/v1/rmhtube/parties*`, scopes
`read:rmhtube` and `write:rmhtube`, the API docs and SDK. Wave 4. No namespace (no UI strings).

## User story

As a developer building a companion app or a browser extension for RMHTube, I want to add a video to my Watch later
list, see upcoming watch parties and say I am going, and read my own watch statistics, through the API, so that I can
save videos from anywhere and plan parties from my own tools.

## Requirements elicitation

- **What exists (verified):**
  - Watch later: `RmhTubeWatchLater (userId, url, title, createdAt)` with `listWatchLater`, `addWatchLater`,
    `deleteWatchLater` (`lib/rmhtube/watch.server.ts`) behind `/api/rmhtube/watch-later`
    (`lib/rmhtube/api/rmhtube.watch-later.server.ts`, `mediaUrlSchema` from `lib/rmhtube/party.ts`), shown in
    `components/rmhtube/party/LaterTab.tsx`.
  - Watch parties (sprint 03 09): `listUpcoming(viewerId)`, `getParty(roomId, viewerId)`, `setGoing(...)`,
    `partyForCalendar` (`lib/rmhtube/parties.server.ts`, with `refusalResponse` for its refusal reasons).
  - Watch statistics (sprint 08 01): `getMyStats(userId)`, `setPaused`, `clearStats` (`lib/rmhtube/stats.server.ts`),
    owner-only.
  - The API has no RMHTube endpoint (`lib/api/scopes.ts`).
- **Decisions:**
  - **Scopes** `read:rmhtube` ("Read your Watch later list and watch statistics, and upcoming watch parties") and
    `write:rmhtube` ("Add to and remove from Watch later, and say whether you are going to a watch party").
  - **Endpoints** (route files, `withDeveloperApi`):
    - `GET /api/v1/me/rmhtube/watch-later?cursor=`, `POST /api/v1/me/rmhtube/watch-later` (`{ url, title? }`, the same
      `mediaUrlSchema`; 200 with the existing item when the URL is already saved),
      `DELETE /api/v1/me/rmhtube/watch-later/{id}`.
    - `GET /api/v1/rmhtube/parties` (upcoming parties the key owner can see, as `listUpcoming`),
      `GET /api/v1/rmhtube/parties/{id}`, `PUT /api/v1/rmhtube/parties/{id}/going` (`{ going: boolean }`, `setGoing`'s
      refusals mapped to v1 codes).
    - `GET /api/v1/me/rmhtube/stats` — `getMyStats` as served to the owner, plus `paused`. Pausing and clearing stay on
      the site.
  - **Caps** are the site's: `addWatchLater` keeps the newest 200 and drops the oldest, so the API says so in the
    endpoint's description ("adding a 201st drops the oldest"), and `listWatchLater` returns at most 200 (the API lists
    the same 200, oldest first, in pages of 50 by a `(createdAt, id)` cursor).
  - **Webhooks:** none.

## Functional requirements

1. FR-1 The handlers, zod-validated (the URL with the site's schema), keyset pagination for Watch later; every new error
   code is added to `ERROR_TYPES` and the status map in `lib/api/errors.ts` (an unknown code falls back to `api_error`).
2. FR-2 `lib/api/v1/rmhtube.server.ts` adapting the site functions; no new business rule.
3. FR-3 Scopes, registry, `NULLABLE`, changelog (anchors), `docs/developer-api/scopes.md`, SDK and docs regenerated.

## Non-functional requirements

- **Security:** every read is the key owner's or a party the key owner can see (`getParty`'s visibility); no other
  member's statistics or list is reachable; a party's attendee list is not exposed (only `going` for the key owner and
  the count the site shows).
- **Correctness:** additive; the SDK diff changes no existing field (check field names you add to `NULLABLE`).

## Data model and API

- No schema change. New `lib/api/v1/rmhtube.server.ts`, `lib/api/v1/rmhtube-schema.ts`, route files
  `app/routes/api/v1/me/rmhtube/watch-later.ts`, `me/rmhtube/watch-later/$id.ts`, `me/rmhtube/stats.ts`,
  `rmhtube/parties.ts`, `rmhtube/parties/$id.ts`, `rmhtube/parties/$id/going.ts`. Edits: `lib/api/scopes.ts`,
  `lib/api/registry.ts`, `scripts/generate-sdk.ts`, `docs/developer-api/{changelog,scopes}.md`; a keyset variant of
  `listWatchLater` in `lib/rmhtube/watch.server.ts` if the site function has no cursor.

## Testing requirements

- Main suite `lib/api/v1/__tests__/rmhtube-api.test.ts`: list, add (duplicate returns the existing item), delete only
  one's own; a private party is 404 for a stranger; going honours the site's refusals; stats are the owner's; scopes
  enforced (`read:rmhtube` cannot add).
- Route table, OpenAPI and SDK generation (no `unknown`), scopes docs.

## Acceptance criteria

- [ ] An extension with `write:rmhtube` saves a video and it appears in Watch later on the site.
- [ ] Upcoming parties list matches `/rmhtube` for the key owner, and "going" through the API shows on the party.
- [ ] Stats through the API equal the site's for the same member.

## Out of scope

Creating or editing parties, room chat, timed comments, commentary tracks, pausing or clearing statistics.

# 02 — Tournaments in the developer API

Surface: `/api/v1/tournaments*`, `/api/v1/me/tournaments`. Wave 2. No
namespace (no UI strings).

## User story

As a member who runs a game server or a community bot, I want to read a
tournament's bracket, check myself in and report a match result from a
script, so that results land in the bracket the moment the game ends instead
of when someone remembers to click.

## Requirements elicitation

- **What exists (verified):**
  - `lib/tournaments/tournament.server.ts` exposes `listTournaments` and
    `getTournament`; `checkin.server.ts` exposes `checkIn`;
    `match-results.server.ts` exposes `claimResult`, `confirmResult`,
    `disputeResult` and `withdrawClaim` (sprint 06 20); `scheduling.server.ts`
    holds agreed match times (sprint 07 06).
  - `Tournament.visibility` is `public` by default; unlisted tournament meta
    is an open owner decision (sprint 03), so its current behaviour is kept.
  - No `/api/v1/tournaments*` route exists (`ls app/routes/api/v1`); sprint 07
    rejected the domain only to keep `lib/tournaments/*` free for its match
    scheduling feature, which has shipped.
  - The v1 pattern: route files under `app/routes/api/v1/` wrapped in
    `withDeveloperApi`, domain code in `lib/api/v1/<domain>.server.ts` and
    `<domain>-schema.ts` (`events.server.ts`, `communities.server.ts`), paths
    in `lib/api/registry.ts`, scopes in `lib/api/scopes.ts`.
- **Decisions:**
  - **Reads (scope `read:tournaments`):** `GET /api/v1/tournaments` (public
    tournaments only, filter `status`, `game`, cursor pagination as the other
    list endpoints), `GET /api/v1/tournaments/{id}` (what the public page
    shows: name, game, format, status, entry fee, prize pool, player caps,
    check-in window, deadlines, start and completion times; an unlisted one
    is returned by id exactly when the site page would show it),
    `GET /api/v1/tournaments/{id}/matches` (rounds, slots, players by public
    handle, scores, winner, status, `scheduledAt`, `deadlineAt`, the open
    claim's state without the claim's free-text note),
    `GET /api/v1/me/tournaments` (the key owner's entries with their next
    match).
  - **Writes (scope `write:tournaments`):** `POST /api/v1/tournaments/{id}/check-in`
    and `POST /api/v1/tournaments/{id}/matches/{matchId}/claim`
    `{ winner: 'me' | 'opponent', score?: string }`, plus
    `POST …/claim/confirm` and `POST …/claim/withdraw`, each calling the
    existing server function, so every rule (who may claim, the 15-minute
    window, prize-deciding claims never settling on their own) stays in one
    place. Disputes stay on the site (they need a reason and a person).
  - **No write through the API moves coins.** Confirming a claim settles the
    match, and settling the match that completes a tournament pays out the
    prize pool (`settleMatch` → `maybeCompleteTournament`). So
    `…/claim/confirm` answers `409 confirm_on_site` ("Confirm this result on
    the site: it decides the prizes.") when `wouldCompleteTournament`
    (`lib/tournaments/match-results.ts`) is true and the tournament's
    `prizePoolCoins` is above 0, checked before calling `confirmResult`; a
    claim (which settles nothing on its own and, for such a match, never
    settles unanswered — `settleUnansweredClaims`) and a withdrawal are
    allowed. A stolen key can therefore never hand a prize to anyone.
  - **Registration, withdrawal and creation are not in the API**: they move
    coins (entry fees, refunds, escrow). A refused write returns the existing
    function's reason as the v1 error envelope (`409 conflict`, `403
    forbidden`, `404 not_found`), never a raw error.
  - Blocks and bans: the existing functions refuse banned members; the reads
    never list a private field (e-mail, coin balance, rating internals).
  - Idempotency: the writes honour `Idempotency-Key` through
    `lib/api/idempotency.server.ts` as `POST /api/v1/posts` does.

## Functional requirements

1. FR-1 The four read endpoints with cursor pagination and `ETag`-style caching
   as the events endpoints use (`lib/api/cache-policies.ts`).
2. FR-2 The four write endpoints, delegating to the existing functions.
3. FR-3 OpenAPI entries in `lib/api/registry.ts`, the two scopes, SDK types
   with no `unknown`, `docs/developer-api/changelog.md` and `scopes.md` lines.
4. FR-4 `test-mode` keys (`lib/api/test-mode.ts`) get canned fixtures for the
   reads and a refused write, as the other domains do.

## Non-functional requirements

- **Correctness:** writes never bypass `claimResult`'s locks; the serialised
  match list is one query with the entrants joined (no N+1).
- **Security:** every input zod-validated (ids as cuid-ish strings, `score`
  ≤ 32 chars); `withDeveloperApi` rate limits; the key owner is the actor.
- **Privacy:** players by public handle and display name only; a player whose
  game activity is private still appears in a bracket (as on the site).
- **Compatibility:** additive only; `pnpm sdk:generate`, `pnpm docs:api`.

## Data model and API

- No schema change.
- `lib/api/v1/tournaments-schema.ts` (zod for query, params and bodies),
  `lib/api/v1/tournaments.server.ts` (serialisers and the eight handlers'
  bodies), route files `app/routes/api/v1/tournaments.ts`,
  `tournaments/$id.ts`, `tournaments/$id/matches.ts`,
  `tournaments/$id/check-in.ts`,
  `tournaments/$id/matches/$matchId/claim.ts`, `…/claim/confirm.ts`,
  `…/claim/withdraw.ts`, `me/tournaments.ts`.
- Registry, scopes and `NULLABLE` under the `s08-02 api-tournaments` anchors.

## Testing requirements

- Main suite `lib/api/__tests__/v1-tournaments.test.ts`: scopes enforced;
  public list excludes non-public; serialiser omits private fields; claim
  delegates and maps each refusal to its status; a prize-deciding confirm is
  refused before `confirmResult` runs (no coin movement can start from a key);
  idempotent retry replays.
- Product suite `lib/api/__tests__/v1-tournaments.product.test.ts` (pure
  serialisers).
- Existing: `lib/api/__tests__/openapi*.test.ts`, the SDK drift test,
  `lib/tournaments/__tests__/match-results*.test.ts`.

## Acceptance criteria

- [ ] A key with `read:tournaments` reads a running bracket; one without gets
      `403 insufficient_scope`.
- [ ] A script checks its owner in and claims a win; the opponent confirms on
      the site and the bracket advances.
- [ ] Registration is not possible through the API, and confirming the
      final of a tournament with a prize pool answers `409 confirm_on_site`.
- [ ] The SDK types every new field; the docs site lists the endpoints.

## Out of scope

Registration, creation, disputes, seeding, payouts and pick'em through the
API; tournament webhooks (12 emits only the key owner's own match result).

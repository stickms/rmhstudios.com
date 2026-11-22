<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Tournaments

8 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/tournaments` | `read:tournaments` | List tournaments |
| `GET /api/v1/tournaments/{id}` | `read:tournaments` | Get a tournament |
| `GET /api/v1/tournaments/{id}/matches` | `read:tournaments` | Read a tournament bracket |
| `GET /api/v1/me/tournaments` | `read:tournaments` | List your tournaments |
| `POST /api/v1/tournaments/{id}/check-in` | `write:tournaments` | Check in to a tournament |
| `POST /api/v1/tournaments/{id}/matches/{matchId}/claim` | `write:tournaments` | Report a match result |
| `POST /api/v1/tournaments/{id}/matches/{matchId}/claim/confirm` | `write:tournaments` | Confirm a reported result |
| `POST /api/v1/tournaments/{id}/matches/{matchId}/claim/withdraw` | `write:tournaments` | Withdraw a reported result |

## Reference

### `GET /api/v1/tournaments`

Public tournaments, newest first (cancelled ones only with `status=CANCELLED`). An unlisted tournament is never listed; its id still opens it. `status` is `REGISTRATION`, `LIVE`, `COMPLETE` or `CANCELLED`, and `game` is a game id. `startsAt`, `checkInMinutes`, `checkInOpensAt`, `matchDeadlineHours`, `swissRounds`, `startedAt`, `completedAt` and `gameTitle` are `null` when the tournament has none. Registering, withdrawing and creating stay on the site: they move coins.

**Scope:** `read:tournaments` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listTournaments`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `status` | query | string | no | Only tournaments in this status. |
| `game` | query | string | no | Only tournaments of this game id. |
| `limit` | query | integer | no | Page size, 1–100 (default 25). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "cltourney1",
      "name": "Friday bracket",
      "gameId": "altair",
      "gameTitle": null,
      "format": "SINGLE_ELIM",
      "status": "REGISTRATION",
      "entryFeeCoins": 100,
      "prizePoolCoins": 300,
      "minPlayers": 2,
      "maxPlayers": 8,
      "playerCount": 3,
      "swissRounds": null,
      "seeding": "join",
      "startsAt": null,
      "checkInMinutes": null,
      "checkInOpensAt": null,
      "matchDeadlineHours": null,
      "startedAt": null,
      "completedAt": null,
      "createdAt": "2026-11-20T18:00:00.000Z",
      "host": {
        "handle": "ada",
        "name": "Ada"
      }
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/tournaments/{id}`

One tournament as its site page shows it: game, format, status, entry fee, prize pool, player caps, check-in window, deadlines and start and completion times. An unlisted tournament is returned by id exactly when the site page shows it. `you` says whether you are entered and checked in. Nothing private is returned: no e-mail, coin balance or rating.

**Scope:** `read:tournaments` · **Success:** `200` · **Operation id:** `getTournament`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The tournament id. |

**Example response** (`200`)

```json
{
  "id": "cltourney1",
  "name": "Friday bracket",
  "gameId": "altair",
  "gameTitle": null,
  "format": "SINGLE_ELIM",
  "status": "REGISTRATION",
  "entryFeeCoins": 100,
  "prizePoolCoins": 300,
  "minPlayers": 2,
  "maxPlayers": 8,
  "playerCount": 3,
  "swissRounds": null,
  "seeding": "join",
  "startsAt": null,
  "checkInMinutes": null,
  "checkInOpensAt": null,
  "matchDeadlineHours": null,
  "startedAt": null,
  "completedAt": null,
  "createdAt": "2026-11-20T18:00:00.000Z",
  "host": {
    "handle": "ada",
    "name": "Ada"
  },
  "you": {
    "entered": true,
    "checkedIn": false
  }
}
```

### `GET /api/v1/tournaments/{id}/matches`

The bracket by round and slot, one page of matches with both players (public handle and display name only). `bracket` is `W` (winners), `L` (losers), `GF` (grand final) or `GR` (bracket reset); `W` for other formats. `state` is `PENDING`, `READY`, `LIVE`, `COMPLETE` or `CANCELLED`. `claim` is the reported result awaiting the opponent (`state: "open"`, answerable until `answerBy`) or `"disputed"`, and `null` when there is none; who reported what is shown only to the two players and the host, and a claim's note is never returned. Sides are `null` until the bracket fills them.

**Scope:** `read:tournaments` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listTournamentMatches`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The tournament id. |
| `limit` | query | integer | no | Page size, 1–200 (default 100). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clmatch1",
      "round": 2,
      "slot": 1,
      "bracket": "W",
      "state": "PENDING",
      "playerA": null,
      "playerB": null,
      "winnerEntrantId": null,
      "resultSource": null,
      "scheduledAt": null,
      "deadlineAt": null,
      "claim": null
    },
    {
      "id": "clmatch2",
      "round": 1,
      "slot": 1,
      "bracket": "W",
      "state": "LIVE",
      "playerA": {
        "entrantId": "clentrant1",
        "seed": 1,
        "handle": "ada",
        "name": "Ada"
      },
      "playerB": {
        "entrantId": "clentrant2",
        "seed": 2,
        "handle": "bob",
        "name": "Bob"
      },
      "winnerEntrantId": null,
      "resultSource": null,
      "scheduledAt": "2026-11-26T19:00:00.000Z",
      "deadlineAt": "2026-11-27T19:00:00.000Z",
      "claim": {
        "state": "open",
        "winnerEntrantId": "clentrant1",
        "claimedByEntrantId": "clentrant1",
        "claimedAt": "2026-11-26T19:20:00.000Z",
        "answerBy": "2026-11-26T19:35:00.000Z"
      }
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/tournaments`

The tournaments you entered, newest entry first, each with your entry and `nextMatch`, the match you are due to play (`null` when there is none).

**Scope:** `read:tournaments` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyTournaments`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `status` | query | string | no | Only tournaments in this status. |
| `limit` | query | integer | no | Page size, 1–100 (default 25). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "tournament": {
        "id": "cltourney1",
        "name": "Friday bracket",
        "gameId": "altair",
        "gameTitle": null,
        "format": "SINGLE_ELIM",
        "status": "REGISTRATION",
        "entryFeeCoins": 100,
        "prizePoolCoins": 300,
        "minPlayers": 2,
        "maxPlayers": 8,
        "playerCount": 3,
        "swissRounds": null,
        "seeding": "join",
        "startsAt": null,
        "checkInMinutes": null,
        "checkInOpensAt": null,
        "matchDeadlineHours": null,
        "startedAt": null,
        "completedAt": null,
        "createdAt": "2026-11-20T18:00:00.000Z",
        "host": {
          "handle": "ada",
          "name": "Ada"
        }
      },
      "entry": {
        "entrantId": "clentrant1",
        "seed": null,
        "placement": null,
        "checkedIn": false,
        "wins": 0,
        "losses": 0
      },
      "nextMatch": null
    }
  ],
  "nextCursor": null
}
```

### `POST /api/v1/tournaments/{id}/check-in`

Check yourself in, through the site's own check-in: it must be open, the tournament still taking registrations and you registered. Repeating it is a no-op. Registering stays on the site.

**Scope:** `write:tournaments` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `checkInToTournament`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The tournament id. |

**Example response** (`200`)

```json
{
  "tournamentId": "cltourney1",
  "checkedIn": true
}
```

### `POST /api/v1/tournaments/{id}/matches/{matchId}/claim`

Report that you (`me`) or your opponent won, through the site's own claim: only the two players, only a live match, and the opponent has 15 minutes to confirm or dispute it. `status` is `claimed`, `confirmed` or `unchanged`. A report that would confirm the opponent's claim of a match that decides the prizes is `409 confirm_on_site`, and a report that would dispute an existing claim is a `409 conflict`: disputing and the prize-deciding confirmation are done on the site.

**Scope:** `write:tournaments` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `claimTournamentMatchResult`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The tournament id. |
| `matchId` | path | string | yes | The match id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `winner` | `string` | yes | `me` or `opponent`. |

```json
{
  "winner": "me"
}
```

**Example response** (`200`)

```json
{
  "status": "claimed",
  "settled": false,
  "tournamentComplete": false
}
```

### `POST /api/v1/tournaments/{id}/matches/{matchId}/claim/confirm`

Confirm the result your opponent reported: the match settles and the bracket advances. If settling it would complete a tournament with a prize pool, it answers `409 confirm_on_site` and changes nothing: no call through a key can pay a prize, confirm that result on the site.

**Scope:** `write:tournaments` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `confirmTournamentMatchResult`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The tournament id. |
| `matchId` | path | string | yes | The match id. |

**Example response** (`200`)

```json
{
  "settled": true,
  "tournamentComplete": false
}
```

### `POST /api/v1/tournaments/{id}/matches/{matchId}/claim/withdraw`

Take back the result you reported, before your opponent answers it.

**Scope:** `write:tournaments` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `withdrawTournamentMatchResult`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The tournament id. |
| `matchId` | path | string | yes | The match id. |

**Example response** (`200`)

```json
{
  "withdrawn": true
}
```

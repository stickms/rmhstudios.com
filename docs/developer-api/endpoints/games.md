<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Games

5 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint                             | Scope        | Summary                             |
| ------------------------------------ | ------------ | ----------------------------------- |
| `GET /api/v1/games`                  | —            | List games                          |
| `GET /api/v1/me/games`               | `read:games` | List your played games              |
| `GET /api/v1/me/games/{gameId}/days` | `read:games` | Get your minutes per day for a game |
| `GET /api/v1/me/achievements`        | `read:games` | List your achievements              |
| `GET /api/v1/users/{handle}/games`   | `read:games` | List a member’s played games        |

## Reference

### `GET /api/v1/games`

The game catalogue: every listed title that lives on this site, in display order. Public data, so any valid key may read
it; no scope is required. Cached for five minutes (`Cache-Control: public, max-age=300`).

**Scope:** none — this endpoint is unauthenticated · **Success:** `200` · **Operation id:** `listGames`

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "altair",
      "title": "Altair",
      "description": "A short description of the game.",
      "href": "https://rmhstudios.com/altair",
      "multiplayer": true,
      "tags": ["Deckbuilder", "Roguelike"]
    }
  ]
}
```

### `GET /api/v1/me/games`

The titles you have played, most recently played first, with total minutes and the minutes in the last 7 and 30 UTC days
(today counts).

**Scope:** `read:games` · **Success:** `200` · **Operation id:** `listMyGames`

**Example response** (`200`)

```json
{
  "data": [
    {
      "gameId": "altair",
      "totalMinutes": 312,
      "lastPlayedAt": "2026-11-20T21:14:00.000Z",
      "minutesLast7Days": 95,
      "minutesLast30Days": 240
    }
  ]
}
```

### `GET /api/v1/me/games/{gameId}/days`

Your minutes played on one title for each UTC day in a range, with 0 for days you did not play. The range may cover at
most 90 days; it defaults to the last 30 days. An unknown title is a 404, a malformed or over-long range a 400.

**Scope:** `read:games` · **Success:** `200` · **Operation id:** `getMyGameDays`

| Parameter | In    | Type   | Required | Description                                                      |
| --------- | ----- | ------ | -------- | ---------------------------------------------------------------- |
| `gameId`  | path  | string | yes      | A game id from `GET /api/v1/games`.                              |
| `from`    | query | string | no       | First day, ISO date `YYYY-MM-DD` (default: 29 days before `to`). |
| `to`      | query | string | no       | Last day, ISO date `YYYY-MM-DD` (default: today, UTC).           |

**Example response** (`200`)

```json
{
  "gameId": "altair",
  "from": "2026-11-19",
  "to": "2026-11-21",
  "data": [
    {
      "date": "2026-11-19",
      "minutes": 0
    },
    {
      "date": "2026-11-20",
      "minutes": 42
    },
    {
      "date": "2026-11-21",
      "minutes": 18
    }
  ]
}
```

### `GET /api/v1/me/achievements`

Achievements you have unlocked, newest first. `rarityPercent` is the share of accounts holding it (null until computed)
and `gameId` is the title it belongs to (null for site-wide ones). Secret achievements are never listed, and other
members’ achievements are not readable.

**Scope:** `read:games` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation
id:** `listMyAchievements`

| Parameter | In    | Type    | Required | Description                                                        |
| --------- | ----- | ------- | -------- | ------------------------------------------------------------------ |
| `gameId`  | query | string  | no       | Only achievements for this game id.                                |
| `limit`   | query | integer | no       | Page size, 1–100 (default 20).                                     |
| `cursor`  | query | string  | no       | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "game.altair.first_run",
      "gameId": "altair",
      "title": "Into the Black",
      "unlockedAt": "2026-11-18T19:02:00.000Z",
      "rarityPercent": 41.5
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/users/{handle}/games`

Another member’s playtime, in the same shape as `GET /api/v1/me/games`, as far as their playtime privacy setting lets
the key owner see it (public: anyone with a key; followers: members who follow them; private: only them). When it is
hidden, or the member does not exist, the answer is the same 404.

**Scope:** `read:games` · **Success:** `200` · **Operation id:** `listUserGames`

| Parameter | In   | Type   | Required | Description                                         |
| --------- | ---- | ------ | -------- | --------------------------------------------------- |
| `handle`  | path | string | yes      | The member’s handle, with or without a leading `@`. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "gameId": "altair",
      "totalMinutes": 312,
      "lastPlayedAt": "2026-11-20T21:14:00.000Z",
      "minutesLast7Days": 95,
      "minutesLast30Days": 240
    }
  ]
}
```

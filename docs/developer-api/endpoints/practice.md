<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Practice

5 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me/typing` | `read:practice` | Your typing summary |
| `GET /api/v1/me/typing/daily` | `read:practice` | Your daily typing entries |
| `GET /api/v1/me/typing/keys` | `read:practice` | Your per-key typing figures |
| `GET /api/v1/me/music/practice` | `read:practice` | Your music practice entries |
| `GET /api/v1/me/focus-sessions` | `read:practice` | Your focus sessions |

## Reference

### `GET /api/v1/me/typing`

Your RMHType profile, one per difficulty that you have played (totals, bests, averages and streaks; `bestWpm` is words per minute, accuracies are percentages, `totalTimeMs` is milliseconds), and your touch-typing lesson progress (best speed and accuracy, stars, attempts, `completedAt`). Only your own. Multiplayer match history and ghost replays are not included.

**Scope:** `read:practice` · **Success:** `200` · **Operation id:** `getMyTyping`

**Example response** (`200`)

```json
{
  "profiles": [
    {
      "difficulty": "medium",
      "totalGamesPlayed": 42,
      "totalWins": 17,
      "bestWpm": 88.5,
      "bestWpmAccuracy": 97.2,
      "avgWpm": 71.3,
      "bestAccuracy": 99.1,
      "avgAccuracy": 95.4,
      "totalCharsTyped": 18250,
      "totalTimeMs": 2640000,
      "currentStreak": 3,
      "bestStreak": 9,
      "updatedAt": "2026-11-20T10:00:00.000Z"
    }
  ],
  "lessons": [
    {
      "lessonId": "home-row-1",
      "bestWpm": 32.5,
      "bestAccuracy": 98,
      "stars": 3,
      "attempts": 4,
      "completedAt": null
    }
  ]
}
```

### `GET /api/v1/me/typing/daily`

Your entries for the daily passage, oldest first, one per day. `day` is the stored UTC day as `YYYYMMDD`. `wpm`, `accuracy` (a percentage) and `timeMs` are `null` for a day started but not finished in time (`finishedAt` is then set, or `null` if it was never closed). `from` and `to` take `YYYYMMDD` or `YYYY-MM-DD`; the range spans at most 366 days and defaults to the last 30.

**Scope:** `read:practice` · **Success:** `200` · **Operation id:** `listMyTypingDaily`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `from` | query | string | no | First day, inclusive. Default: 29 days before `to`. |
| `to` | query | string | no | Last day, inclusive. Default: today (UTC). |

**Example response** (`200`)

```json
{
  "from": "20261120",
  "to": "20261121",
  "data": [
    {
      "day": "20261120",
      "passageId": "p-142",
      "wpm": null,
      "accuracy": null,
      "timeMs": null,
      "finishedAt": null
    },
    {
      "day": "20261121",
      "passageId": "p-143",
      "wpm": 74.2,
      "accuracy": 96.5,
      "timeMs": 38200,
      "finishedAt": "2026-11-21T08:15:00.000Z"
    }
  ]
}
```

### `GET /api/v1/me/typing/keys`

Your per-key counters with derived figures, slowest first (`weakness` is `msPerKey` inflated by `errorRate`; higher is worse). Only keys with at least `minAttempts` attempts are returned. `msPerKey` is the mean time per key in milliseconds and `errorRate` runs from 0 to 1. The list is empty while key statistics are switched off on the site.

**Scope:** `read:practice` · **Success:** `200` · **Operation id:** `listMyTypingKeys`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `layout` | query | string | no | Only this layout: `qwerty`, `azerty`, `dvorak` or `colemak`. Default: every layout you have data for. |

**Example response** (`200`)

```json
{
  "minAttempts": 5,
  "data": [
    {
      "key": "q",
      "layout": "qwerty",
      "attempts": 24,
      "errors": 6,
      "totalMs": 9120,
      "msPerKey": 380,
      "errorRate": 0.25,
      "weakness": 760
    }
  ]
}
```

### `GET /api/v1/me/music/practice`

Your RMH Music practice entries, newest first. `kind` is the activity (`song`, `sprint`, `cards`) and `refId` what was practised. `mode` is the song or sprint mode and `score` the result, both `null` when the activity has none; `durationMs` is `null` when the client did not say.

**Scope:** `read:practice` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyMusicPractice`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `since` | query | string | no | Only entries at or after this ISO 8601 instant. |
| `limit` | query | integer | no | Page size, 1–100 (default 50). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": 1042,
      "kind": "cards",
      "refId": "scales-major",
      "mode": null,
      "score": null,
      "durationMs": null,
      "createdAt": "2026-11-21T18:30:00.000Z"
    },
    {
      "id": 1041,
      "kind": "song",
      "refId": "ode-to-joy",
      "mode": "wait",
      "score": 920,
      "durationMs": 180000,
      "createdAt": "2026-11-20T18:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/focus-sessions`

Your RMHStudy focus sessions, newest first. Times are in milliseconds. `endedAt` is `null` for a session that has not been closed. The first page (no `cursor`) also carries a `summary` with your weekly goal in minutes and your time zone, each `null` when unset.

**Scope:** `read:practice` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyFocusSessions`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `since` | query | string | no | Only sessions started at or after this ISO 8601 instant. |
| `limit` | query | integer | no | Page size, 1–100 (default 50). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "summary": {
    "weeklyGoalMinutes": null,
    "timeZone": null
  },
  "data": [
    {
      "id": "clfocus1",
      "focusTimeMs": 1500000,
      "breakTimeMs": 300000,
      "sessionsInRun": 2,
      "startedAt": "2026-11-21T09:00:00.000Z",
      "endedAt": null
    }
  ],
  "nextCursor": null
}
```

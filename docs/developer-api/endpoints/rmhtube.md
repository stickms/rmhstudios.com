<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# RMHTube

7 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me/rmhtube/watch-later` | `read:rmhtube` | List your Watch later |
| `POST /api/v1/me/rmhtube/watch-later` | `write:rmhtube` | Save a video to Watch later |
| `DELETE /api/v1/me/rmhtube/watch-later/{id}` | `write:rmhtube` | Remove a video from Watch later |
| `GET /api/v1/rmhtube/parties` | `read:rmhtube` | List upcoming watch parties |
| `GET /api/v1/rmhtube/parties/{id}` | `read:rmhtube` | Get a watch party |
| `PUT /api/v1/rmhtube/parties/{id}/going` | `write:rmhtube` | Say whether you are going to a watch party |
| `GET /api/v1/me/rmhtube/stats` | `read:rmhtube` | Your RMHTube watch statistics |

## Reference

### `GET /api/v1/me/rmhtube/watch-later`

Your RMHTube Watch later list, oldest first, in pages of up to 50 by a `(createdAt, id)` cursor. It is the same list as on the site, which keeps at most 200 videos (adding a 201st drops the oldest), so the API never lists more than those 200. Only your own.

**Scope:** `read:rmhtube` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyWatchLater`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 50). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clwl1",
      "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "title": "A video to watch later",
      "createdAt": "2026-11-22T09:30:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `POST /api/v1/me/rmhtube/watch-later`

Saves a video URL to your Watch later, through the site's own function and the same URL rules (a fragment is dropped). Answers `201` with the new item, or `200` with the existing item when the URL is already saved. The list keeps the newest 200: adding a 201st drops the oldest. `title` defaults to the URL's host name.

**Scope:** `write:rmhtube` · **Success:** `201` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `addToWatchLater`

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `url` | `string` | yes | The video URL, up to 2048 characters. |
| `title` | `string` | no | A label, up to 256 characters. |

```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "A video to watch later"
}
```

**Example response** (`201`)

```json
{
  "id": "clwl1",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "A video to watch later",
  "createdAt": "2026-11-22T09:30:00.000Z"
}
```

### `DELETE /api/v1/me/rmhtube/watch-later/{id}`

Removes one of your own saved videos. Answers `204`. `404` for an id that is not yours or is already gone: another member's item is never reachable.

**Scope:** `write:rmhtube` · **Success:** `204` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `removeFromWatchLater`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The Watch later item id. |

### `GET /api/v1/rmhtube/parties`

The upcoming RMHTube watch parties you can see, soonest first, as the site lists them: your own (hosting or going, any visibility) and then public ones. A link-only party is listed only to its host and the people going. `going` is your own answer and `goingCount` the count the site shows; who else is going is not returned. Parties whose host is blocked by you or has blocked you are left out.

**Scope:** `read:rmhtube` · **Success:** `200` · **Operation id:** `listRmhtubeParties`

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "AB12CD",
      "name": "Friday film night",
      "description": "",
      "startsAt": "2026-11-27T19:00:00.000Z",
      "isPublic": true,
      "maxMembers": 20,
      "host": {
        "id": "ck_user123",
        "name": "Ada"
      },
      "goingCount": 4,
      "going": false,
      "isHost": false,
      "closed": false
    }
  ]
}
```

### `GET /api/v1/rmhtube/parties/{id}`

One watch party by its room code. `404` when it does not exist or you cannot see it: a link-only party you neither host nor are going to is the same answer as a missing one, as is one whose host is in a block with you.

**Scope:** `read:rmhtube` · **Success:** `200` · **Operation id:** `getRmhtubeParty`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The party room code. |

**Example response** (`200`)

```json
{
  "id": "AB12CD",
  "name": "Friday film night",
  "description": "",
  "startsAt": "2026-11-27T19:00:00.000Z",
  "isPublic": true,
  "maxMembers": 20,
  "host": {
    "id": "ck_user123",
    "name": "Ada"
  },
  "goingCount": 4,
  "going": false,
  "isHost": false,
  "closed": false
}
```

### `PUT /api/v1/rmhtube/parties/{id}/going`

Sets your answer through the site's own `setGoing`, so the reminders and the going count behave as on the site. `{ "going": false }` takes it back. Answers the party. `404` for a party you cannot see (as in the read), `409 party_closed` when the host cancelled it or it has ended.

**Scope:** `write:rmhtube` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `setRmhtubePartyGoing`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The party room code. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `going` | `boolean` | yes | `true` to go, `false` to take it back. |

```json
{
  "going": true
}
```

**Example response** (`200`)

```json
{
  "id": "AB12CD",
  "name": "Friday film night",
  "description": "",
  "startsAt": "2026-11-27T19:00:00.000Z",
  "isPublic": true,
  "maxMembers": 20,
  "host": {
    "id": "ck_user123",
    "name": "Ada"
  },
  "goingCount": 5,
  "going": true,
  "isHost": false,
  "closed": false
}
```

### `GET /api/v1/me/rmhtube/stats`

Your own watch statistics exactly as the site shows them: the counters (`totalWatchTimeMinutes` in minutes), whether recording is `paused`, and the last 30 UTC days of minutes (zero-filled, oldest first, `day` as `YYYY-MM-DD`). Only yours. Pausing and clearing are done on the site.

**Scope:** `read:rmhtube` · **Success:** `200` · **Operation id:** `getMyRmhtubeStats`

**Example response** (`200`)

```json
{
  "counters": {
    "totalWatchTimeMinutes": 640,
    "videosWatched": 31,
    "roomsCreated": 2,
    "roomsJoined": 14,
    "messagesSent": 120,
    "reactionsUsed": 58
  },
  "paused": false,
  "days": [
    {
      "day": "2026-11-22",
      "minutes": 45
    }
  ]
}
```

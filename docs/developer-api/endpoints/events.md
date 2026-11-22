<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Events

11 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/events` | `read:events` | List events |
| `GET /api/v1/events/{id}` | `read:events` | Get an event |
| `GET /api/v1/events/{id}/attendees` | `read:events` | List attendees |
| `GET /api/v1/me/events` | `read:events` | List your events |
| `PUT /api/v1/events/{id}/rsvp` | `write:events` | RSVP to an event |
| `DELETE /api/v1/events/{id}/rsvp` | `write:events` | Cancel your RSVP |
| `POST /api/v1/events` | `manage:events` | Create an event |
| `PATCH /api/v1/events/{id}` | `manage:events` | Edit an event |
| `POST /api/v1/events/{id}/cancel` | `manage:events` | Cancel an event |
| `GET /api/v1/events/{id}/updates` | `read:events` | List event updates |
| `POST /api/v1/events/{id}/updates` | `manage:events` | Post an event update |

## Reference

### `GET /api/v1/events`

Events you can see on the site (a private event or a private community's events only when the site shows them to you), soonest first. A repeating event appears once per date inside the window, with skipped dates left out and moved dates where they now are; `occurrence` is the date's original start, which RSVPs are keyed by. The window defaults to the next 31 days and may be at most 31 days wide. Times are ISO 8601 UTC with the event's `timeZone` beside them.

**Scope:** `read:events` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listEvents`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `from` | query | string | no | Start of the window, an ISO 8601 date or timestamp (default now). |
| `to` | query | string | no | End of the window (default 31 days after `from`; at most 31 days after it). |
| `community` | query | string | no | Only events of this community (id or slug). |
| `limit` | query | integer | no | Page size, 1–100 (default 25). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clevent1",
      "title": "Game night",
      "description": "Bring a controller.",
      "startsAt": "2026-11-26T19:00:00.000Z",
      "endsAt": null,
      "timeZone": null,
      "occurrence": null,
      "state": "normal",
      "note": null,
      "repeats": false,
      "venueKind": "URL",
      "venue": null,
      "capacity": null,
      "communityId": null,
      "canceled": false,
      "host": {
        "id": "cluser1",
        "handle": "rmh",
        "name": "RMH"
      },
      "cohosts": [
        {
          "id": "cluser1",
          "handle": "rmh",
          "name": "RMH"
        }
      ],
      "counts": {
        "going": 4,
        "maybe": 1,
        "waitlisted": 0
      },
      "yourRsvp": null
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/events/{id}`

One event you can see, with its next dates (up to 10, overrides applied), the going, maybe and waitlisted counts, the host and co-hosts, and the latest five updates. For a repeating event the top-level date is the next one that is on. A guest list is `GET /events/{id}/attendees`, for hosts only. Counts are read from at most 8,000 answers per event, so on an event with more than that they are approximate.

**Scope:** `read:events` · **Success:** `200` · **Operation id:** `getEvent`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The event id. |

**Example response** (`200`)

```json
{
  "id": "clevent1",
  "title": "Game night",
  "description": "Bring a controller.",
  "startsAt": "2026-11-26T19:00:00.000Z",
  "endsAt": null,
  "timeZone": null,
  "occurrence": null,
  "state": "normal",
  "note": null,
  "repeats": false,
  "venueKind": "URL",
  "venue": null,
  "capacity": null,
  "communityId": null,
  "canceled": false,
  "host": {
    "id": "cluser1",
    "handle": "rmh",
    "name": "RMH"
  },
  "cohosts": [
    {
      "id": "cluser1",
      "handle": "rmh",
      "name": "RMH"
    }
  ],
  "counts": {
    "going": 4,
    "maybe": 1,
    "waitlisted": 0
  },
  "yourRsvp": null,
  "nextOccurrences": [
    {
      "occurrence": "2026-11-26T19:00:00.000Z",
      "startsAt": "2026-11-26T19:00:00.000Z",
      "endsAt": "2026-11-26T21:00:00.000Z",
      "state": "normal",
      "note": "Back on."
    }
  ],
  "updates": [
    {
      "id": "clupdate1",
      "body": "Doors at 18:45.",
      "occurrence": null,
      "createdAt": "2026-11-22T10:00:00.000Z"
    }
  ]
}
```

### `GET /api/v1/events/{id}/attendees`

Who is going or maybe for one date, by handle, display name and status. Only the event's host and accepted co-hosts may read it (`403` for anyone else, who can read the counts from the event). On a repeating event `occurrence` picks the date (its original start); without it, the next date that is on.

**Scope:** `read:events` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listEventAttendees`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The event id. |
| `occurrence` | query | string | no | The date's original start, an ISO 8601 timestamp (repeating events). |
| `limit` | query | integer | no | Page size, 1–100 (default 25). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "cluser2",
      "handle": "guest",
      "name": "Guest",
      "status": "going"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/events`

The dates of events you answered going or maybe to, soonest first, in the same shape as `GET /events` with `yourRsvp` set. A date you sat out or that was skipped is not listed. Same window rules as `GET /events`.

**Scope:** `read:events` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyEvents`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `from` | query | string | no | Start of the window, an ISO 8601 date or timestamp (default now). |
| `to` | query | string | no | End of the window (default 31 days after `from`; at most 31 days after it). |
| `limit` | query | integer | no | Page size, 1–100 (default 25). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clevent1",
      "title": "Game night",
      "description": "Bring a controller.",
      "startsAt": "2026-11-26T19:00:00.000Z",
      "endsAt": null,
      "timeZone": null,
      "occurrence": null,
      "state": "normal",
      "note": null,
      "repeats": false,
      "venueKind": "URL",
      "venue": null,
      "capacity": null,
      "communityId": null,
      "canceled": false,
      "host": {
        "id": "cluser1",
        "handle": "rmh",
        "name": "RMH"
      },
      "cohosts": [
        {
          "id": "cluser1",
          "handle": "rmh",
          "name": "RMH"
        }
      ],
      "counts": {
        "going": 4,
        "maybe": 1,
        "waitlisted": 0
      },
      "yourRsvp": null
    }
  ],
  "nextCursor": null
}
```

### `PUT /api/v1/events/{id}/rsvp`

Answer going or maybe, through the site's own RSVP, so capacity, the waitlist, reminders and who may see the event are the site's rules. A full one-off event answers `status: "waitlisted"`; a full repeating event has no waitlist and is a `409`. A member banned or timed out of the event's community is refused with a `403`. On a repeating event the answer is for one date (`occurrence`, the date's original start; default the next one) or, with `everyTime`, every date. The response is the resulting state.

**Scope:** `write:events` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `rsvpToEvent`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The event id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `status` | `string` | yes | `going` or `maybe`. |
| `occurrence` | `string` | no | The date's original start, an ISO 8601 timestamp (repeating events). |
| `everyTime` | `boolean` | no | Answer for every date of a repeating event. |

```json
{
  "status": "going"
}
```

**Example response** (`200`)

```json
{
  "eventId": "clevent1",
  "status": "going",
  "occurrence": null,
  "everyTime": false,
  "counts": {
    "going": 5,
    "maybe": 1,
    "waitlisted": 0
  },
  "waitlistPosition": null
}
```

### `DELETE /api/v1/events/{id}/rsvp`

Take your answer back, through the site's own un-RSVP (a freed seat goes to the waitlist). On a repeating event it sits out one date (`occurrence`, default the next one), or with `everyTime=true` leaves the series. The response is the resulting state, `status: "none"` when you no longer have an answer.

**Scope:** `write:events` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `cancelEventRsvp`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The event id. |
| `occurrence` | query | string | no | The date's original start, an ISO 8601 timestamp (repeating events). |
| `everyTime` | query | string | no | `true` to leave the whole series. |

**Example response** (`200`)

```json
{
  "eventId": "clevent1",
  "status": "none",
  "occurrence": null,
  "everyTime": false,
  "counts": {
    "going": 4,
    "maybe": 1,
    "waitlisted": 0
  },
  "waitlistPosition": null
}
```

### `POST /api/v1/events`

Host a new event as the key owner, through the site's own `createEvent`. `community` is a community slug; a community event needs you to moderate that community (`403 forbidden` otherwise, `404` for an unknown slug). Times are ISO 8601 with an offset, between 2000 and 2099. A `URL` venue needs a public http(s) address. `repeat` repeats it weekly (`W`) or monthly (`M`) in the time zone `repeat_tz`, optionally until `repeat_until`; host rotation and co-host invitations stay on the site. `visibility` is `public` (default) or `private` (only you and the people you let in see it). No field names a host: you are the host. At most 10 events a minute, shared with the site. Answers `201` with the event as `GET /events/{id}` returns it. Errors: `invalid_dates`, `invalid_venue_url`, `invalid_recurrence`.

**Scope:** `manage:events` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `createEvent`

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `title` | `string` | yes | 3–120 characters. |
| `starts_at` | `string` | yes | ISO 8601 timestamp with an offset. |
| `venue_kind` | `string` | yes | `SPACE`, `TOURNAMENT`, `GAME`, `URL` or `IRL`. |
| `description` | `string` | no | Up to 2000 characters. |
| `ends_at` | `string` | no | ISO 8601 timestamp, after `starts_at`. |
| `venue` | `string` | no | The address (`URL` venues, required) or a place name. |
| `capacity` | `integer` | no | Seats, 1–1,000,000. Omit for no limit. |
| `community` | `string` | no | Slug of a community you moderate. |
| `visibility` | `string` | no | `public` (default) or `private`. |
| `repeat` | `string` | no | `W` (weekly) or `M` (monthly). Needs `repeat_tz`. |
| `repeat_tz` | `string` | no | IANA time zone the repeat follows, e.g. `America/New_York`. |
| `repeat_until` | `string` | no | Last date, an ISO 8601 timestamp with an offset. |

```json
{
  "title": "Game night",
  "description": "Bring a controller.",
  "starts_at": "2026-12-03T19:00:00Z",
  "ends_at": "2026-12-03T21:00:00Z",
  "venue_kind": "URL",
  "venue": "https://example.com/room",
  "capacity": 12
}
```

**Example response** (`200`)

```json
{
  "id": "clevent1",
  "title": "Game night",
  "description": "Bring a controller.",
  "startsAt": "2026-12-03T19:00:00.000Z",
  "endsAt": null,
  "timeZone": null,
  "occurrence": null,
  "state": "normal",
  "note": null,
  "repeats": false,
  "venueKind": "URL",
  "venue": null,
  "capacity": null,
  "communityId": null,
  "canceled": false,
  "host": {
    "id": "cluser1",
    "handle": "rmh",
    "name": "RMH"
  },
  "cohosts": [
    {
      "id": "cluser2",
      "handle": "co",
      "name": "Co-host"
    }
  ],
  "counts": {
    "going": 0,
    "maybe": 0,
    "waitlisted": 0
  },
  "yourRsvp": null,
  "nextOccurrences": [
    {
      "occurrence": "2026-12-03T19:00:00.000Z",
      "startsAt": "2026-12-03T19:00:00.000Z",
      "endsAt": null,
      "state": "normal",
      "note": null
    }
  ],
  "updates": [
    {
      "id": "clupdate1",
      "body": "Doors at 18:45.",
      "occurrence": null,
      "createdAt": "2026-11-22T10:00:00.000Z"
    }
  ]
}
```

### `PATCH /api/v1/events/{id}`

Change an event through the site's own `updateEvent`: the host or an accepted co-host (a co-host cannot change `repeat`). Send only the fields to change; `null` clears `ends_at`, `venue`, `capacity` and `repeat`. `404` for an event you cannot see, `403 not_host` for one you see but do not manage. Answers the event as `GET /events/{id}` returns it.

**Scope:** `manage:events` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `updateEvent`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The event id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `title` | `string` | no | 3–120 characters. |
| `description` | `string` | no | Up to 2000 characters. |
| `starts_at` | `string` | no | ISO 8601 timestamp with an offset. |
| `ends_at` | `string` | no | ISO 8601 timestamp, or `null` to clear. |
| `venue_kind` | `string` | no | `SPACE`, `TOURNAMENT`, `GAME`, `URL` or `IRL`. |
| `venue` | `string` | no | The address or place name, or `null` to clear. |
| `capacity` | `integer` | no | Seats, or `null` for no limit. |
| `repeat` | `string` | no | `W` or `M` (needs `repeat_tz`), or `null` to stop repeating. Host only. |
| `repeat_tz` | `string` | no | IANA time zone the repeat follows. |
| `repeat_until` | `string` | no | Last date, an ISO 8601 timestamp with an offset. |

```json
{
  "title": "Game night (moved online)",
  "capacity": 20
}
```

**Example response** (`200`)

```json
{
  "id": "clevent1",
  "title": "Game night",
  "description": "Bring a controller.",
  "startsAt": "2026-12-03T19:00:00.000Z",
  "endsAt": null,
  "timeZone": null,
  "occurrence": null,
  "state": "normal",
  "note": null,
  "repeats": false,
  "venueKind": "URL",
  "venue": null,
  "capacity": null,
  "communityId": null,
  "canceled": false,
  "host": {
    "id": "cluser1",
    "handle": "rmh",
    "name": "RMH"
  },
  "cohosts": [
    {
      "id": "cluser2",
      "handle": "co",
      "name": "Co-host"
    }
  ],
  "counts": {
    "going": 0,
    "maybe": 0,
    "waitlisted": 0
  },
  "yourRsvp": null,
  "nextOccurrences": [
    {
      "occurrence": "2026-12-03T19:00:00.000Z",
      "startsAt": "2026-12-03T19:00:00.000Z",
      "endsAt": null,
      "state": "normal",
      "note": null
    }
  ],
  "updates": [
    {
      "id": "clupdate1",
      "body": "Doors at 18:45.",
      "occurrence": null,
      "createdAt": "2026-11-22T10:00:00.000Z"
    }
  ]
}
```

### `POST /api/v1/events/{id}/cancel`

Cancel an event you host (the host only, as on the site). Everyone who answered is told, as on the site. Canceling again is `409 already_canceled`. Answers the event with `canceled: true`.

**Scope:** `manage:events` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `cancelEvent`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The event id. |

**Example response** (`200`)

```json
{
  "id": "clevent1",
  "title": "Game night",
  "description": "Bring a controller.",
  "startsAt": "2026-12-03T19:00:00.000Z",
  "endsAt": null,
  "timeZone": null,
  "occurrence": null,
  "state": "normal",
  "note": null,
  "repeats": false,
  "venueKind": "URL",
  "venue": null,
  "capacity": null,
  "communityId": null,
  "canceled": true,
  "host": {
    "id": "cluser1",
    "handle": "rmh",
    "name": "RMH"
  },
  "cohosts": [
    {
      "id": "cluser2",
      "handle": "co",
      "name": "Co-host"
    }
  ],
  "counts": {
    "going": 0,
    "maybe": 0,
    "waitlisted": 0
  },
  "yourRsvp": null,
  "nextOccurrences": [
    {
      "occurrence": "2026-12-03T19:00:00.000Z",
      "startsAt": "2026-12-03T19:00:00.000Z",
      "endsAt": null,
      "state": "normal",
      "note": null
    }
  ],
  "updates": [
    {
      "id": "clupdate1",
      "body": "Doors at 18:45.",
      "occurrence": null,
      "createdAt": "2026-11-22T10:00:00.000Z"
    }
  ]
}
```

### `GET /api/v1/events/{id}/updates`

The latest updates the hosts posted to the people coming, newest first (at most five, as the event page shows them), to anyone who can see the event.

**Scope:** `read:events` · **Success:** `200` · **Operation id:** `listEventUpdates`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The event id. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clupdate1",
      "body": "Doors at 18:45.",
      "occurrence": null,
      "createdAt": "2026-11-22T10:00:00.000Z"
    }
  ]
}
```

### `POST /api/v1/events/{id}/updates`

Post an update as the host or a co-host, through the site's own `postUpdate`: the same per-event limit (`429 rate_limited` when you post too fast, `409 canceled` on a canceled event) and the same durable notification to the people coming, minus anyone blocked with you. On a repeating event `occurrence` is the date's original start; omit it for the next date, `null` for the whole series. Answers `201`.

**Scope:** `manage:events` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `postEventUpdate`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The event id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `body` | `string` | yes | 1–500 characters. |
| `occurrence` | `string` | no | The date's original start, an ISO 8601 timestamp (repeating events). |

```json
{
  "body": "Doors at 18:45."
}
```

**Example response** (`200`)

```json
{
  "id": "clupdate1",
  "body": "Doors at 18:45.",
  "occurrence": null,
  "createdAt": "2026-11-22T10:00:00.000Z"
}
```

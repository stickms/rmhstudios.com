<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Events

6 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/events` | `read:events` | List events |
| `GET /api/v1/events/{id}` | `read:events` | Get an event |
| `GET /api/v1/events/{id}/attendees` | `read:events` | List attendees |
| `GET /api/v1/me/events` | `read:events` | List your events |
| `PUT /api/v1/events/{id}/rsvp` | `write:events` | RSVP to an event |
| `DELETE /api/v1/events/{id}/rsvp` | `write:events` | Cancel your RSVP |

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

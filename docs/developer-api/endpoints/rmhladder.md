<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# RMHLadder

4 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me/ladder/applications` | `read:ladder` | List your applications |
| `GET /api/v1/me/ladder/applications/{id}` | `read:ladder` | Get one of your applications |
| `PATCH /api/v1/me/ladder/applications/{id}` | `write:ladder` | Change one of your applications |
| `POST /api/v1/me/ladder/own-jobs` | `write:ladder` | Add a job you found elsewhere |

## Reference

### `GET /api/v1/me/ladder/applications`

Your RMHLadder applications, most recently changed first. Each carries its status, applied and follow-up dates, interview dates, your own notes, and its job: title, company, location, remote status, link and deadline (`own` is true for a job you added yourself). Only your own applications are returned, and never offers, pay, resumes, cover letters, referral names or contact e-mails. Never cached (`Cache-Control: private, no-store`). Needs the explicit `read:ladder` scope, which `*`, `read:*` and a new key’s default grant do not include.

**Scope:** `read:ladder` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyLadderApplications`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 25). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |
| `status` | query | string | no | Only applications in these statuses: one, or several separated by commas (`not_applied`, `planning`, `applied`, `networking`, `interviewing`, `final_round`, `rejected`, `offer`, `withdrawn`). |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "cm4ladderapp0003",
      "status": "networking",
      "appliedDate": null,
      "followUpDate": null,
      "interviewDates": [
        "2026-12-02T15:00:00.000Z"
      ],
      "notes": null,
      "updatedAt": "2026-11-24T19:30:00.000Z",
      "job": {
        "id": "cm4ladderjob0003",
        "title": "Platform Engineer Intern",
        "company": "Initech",
        "location": null,
        "remote": "hybrid",
        "url": null,
        "deadline": null,
        "own": true
      }
    },
    {
      "id": "cm4ladderapp0001",
      "status": "interviewing",
      "appliedDate": "2026-11-18T00:00:00.000Z",
      "followUpDate": "2026-12-03T00:00:00.000Z",
      "interviewDates": [
        "2026-12-02T15:00:00.000Z"
      ],
      "notes": "Phone screen went well.",
      "updatedAt": "2026-11-23T19:30:00.000Z",
      "job": {
        "id": "cm4ladderjob0001",
        "title": "Software Engineer Intern",
        "company": "Acme",
        "location": "Rochester, NY",
        "remote": "hybrid",
        "url": "https://acme.example/careers/intern",
        "deadline": "2026-12-15",
        "own": false
      }
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/ladder/applications/{id}`

One of your applications: the list fields plus `events`, its timeline, newest first (at most 50). An event is `{ id, type, fromStatus, toStatus, fields, createdAt }`: `type` is `status_changed` or `application_updated`, and `fields` names what a change touched, never the values. Another member’s application, or an unknown id, is `404 not_found`. Never cached.

**Scope:** `read:ladder` · **Success:** `200` · **Operation id:** `getMyLadderApplication`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The application id. |

**Example response** (`200`)

```json
{
  "data": {
    "id": "cm4ladderapp0001",
    "status": "networking",
    "appliedDate": null,
    "followUpDate": null,
    "interviewDates": [
      "2026-12-02T15:00:00.000Z"
    ],
    "notes": null,
    "updatedAt": "2026-11-24T19:30:00.000Z",
    "job": {
      "id": "cm4ladderjob0003",
      "title": "Platform Engineer Intern",
      "company": "Initech",
      "location": null,
      "remote": "hybrid",
      "url": null,
      "deadline": null,
      "own": true
    },
    "events": [
      {
        "id": "cm4ladderevt0003",
        "type": "application_updated",
        "fromStatus": null,
        "toStatus": null,
        "fields": [
          "interviewDates"
        ],
        "createdAt": "2026-11-24T19:30:00.000Z"
      },
      {
        "id": "cm4ladderevt0002",
        "type": "status_changed",
        "fromStatus": "applied",
        "toStatus": "networking",
        "fields": [
          "status"
        ],
        "createdAt": "2026-11-22T10:00:00.000Z"
      }
    ]
  }
}
```

### `PATCH /api/v1/me/ladder/applications/{id}`

Change an application’s status, applied date, follow-up date, interview dates or notes, through the site’s own update: the timeline gets one event for the change and your insights match. Send only what changes; a date or `notes` set to `null` is cleared, and `interviewDates` replaces the list (at most 25). Send `Idempotency-Key` so a retry never records twice. Nothing else of an application can be written here: an unknown field is `400 invalid_request`. Answers with the application as `GET` returns it. Another member’s application is `404 not_found`. Needs the explicit `write:ladder` scope, which `*` and `write:*` do not include.

**Scope:** `write:ladder` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `updateMyLadderApplication`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The application id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `status` | `string` | no | `not_applied`, `planning`, `applied`, `networking`, `interviewing`, `final_round`, `rejected`, `offer` or `withdrawn`. |
| `appliedDate` | `string` | no | A day (`2026-11-18`) or an ISO 8601 instant; `null` clears it. |
| `followUpDate` | `string` | no | A day or an instant; `null` clears it. |
| `interviewDates` | `string[]` | no | Up to 25 days or instants. Replaces the list; `[]` clears it. |
| `notes` | `string` | no | Up to 2,000 characters; `null` clears it. |

```json
{
  "status": "interviewing",
  "interviewDates": [
    "2026-12-02T15:00:00.000Z"
  ]
}
```

**Example response** (`200`)

```json
{
  "data": {
    "id": "cm4ladderapp0001",
    "status": "networking",
    "appliedDate": null,
    "followUpDate": null,
    "interviewDates": [
      "2026-12-02T15:00:00.000Z"
    ],
    "notes": null,
    "updatedAt": "2026-11-24T19:30:00.000Z",
    "job": {
      "id": "cm4ladderjob0003",
      "title": "Platform Engineer Intern",
      "company": "Initech",
      "location": null,
      "remote": "hybrid",
      "url": null,
      "deadline": null,
      "own": true
    },
    "events": [
      {
        "id": "cm4ladderevt0003",
        "type": "application_updated",
        "fromStatus": null,
        "toStatus": null,
        "fields": [
          "interviewDates"
        ],
        "createdAt": "2026-11-24T19:30:00.000Z"
      },
      {
        "id": "cm4ladderevt0002",
        "type": "status_changed",
        "fromStatus": "applied",
        "toStatus": "networking",
        "fields": [
          "status"
        ],
        "createdAt": "2026-11-22T10:00:00.000Z"
      }
    ]
  }
}
```

### `POST /api/v1/me/ladder/own-jobs`

Add a job of your own (one you found outside RMHLadder), through the site’s own create: it is visible only to you, and the site’s limit of 300 own jobs applies (`409 conflict` beyond it). The link is stored, never fetched. Pay is not accepted: an unknown field is `400 invalid_request`. Answers `201` with the application the job opens (status `not_applied`), so a following `PATCH` can move it along. Send `Idempotency-Key` so a retry never adds twice. Needs the explicit `write:ladder` scope.

**Scope:** `write:ladder` · **Success:** `201` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `createMyLadderOwnJob`

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `title` | `string` | yes | 1–160 characters. |
| `company` | `string` | yes | 1–120 characters. |
| `link` | `string` | no | An http or https address, up to 2,000 characters. |
| `location` | `string` | no | Up to 160 characters. |
| `remoteStatus` | `string` | no | `onsite` (default), `hybrid` or `remote_us`. |
| `employmentType` | `string` | no | `internship` (default) or `full_time`. |
| `deadline` | `string` | no | A day, `2026-12-15`. |

```json
{
  "title": "Platform Engineer Intern",
  "company": "Initech",
  "remoteStatus": "hybrid"
}
```

**Example response** (`201`)

```json
{
  "data": {
    "id": "cm4ladderapp0009",
    "status": "not_applied",
    "appliedDate": null,
    "followUpDate": null,
    "interviewDates": [],
    "notes": null,
    "updatedAt": "2026-11-25T10:00:00.000Z",
    "job": {
      "id": "cm4ladderjob0009",
      "title": "Platform Engineer Intern",
      "company": "Initech",
      "location": null,
      "remote": "hybrid",
      "url": null,
      "deadline": null,
      "own": true
    },
    "events": [
      {
        "id": "cm4ladderevt0009",
        "type": "application_updated",
        "fromStatus": null,
        "toStatus": null,
        "fields": [
          "created"
        ],
        "createdAt": "2026-11-25T10:00:00.000Z"
      }
    ]
  }
}
```

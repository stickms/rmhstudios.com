<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Reading

7 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint                            | Scope           | Summary                        |
| ----------------------------------- | --------------- | ------------------------------ |
| `GET /api/v1/me/highlights`         | `read:reading`  | List your highlights and notes |
| `PATCH /api/v1/me/highlights/{id}`  | `write:reading` | Edit a highlight               |
| `DELETE /api/v1/me/highlights/{id}` | `write:reading` | Delete a highlight             |
| `GET /api/v1/me/shelves`            | `read:reading`  | List your shelves              |
| `PUT /api/v1/me/shelves/{slug}`     | `write:reading` | Put a book on a shelf          |
| `DELETE /api/v1/me/shelves/{slug}`  | `write:reading` | Take a book off your shelves   |
| `GET /api/v1/me/reading-goal`       | `read:reading`  | Get your reading goal          |

## Reference

### `GET /api/v1/me/highlights`

Your highlights and notes on library books, blog posts and news, newest first. Private notes are returned because they
are yours; a wildcard key (`read:*`, `*`) can read them too. With `since` (ISO 8601) you get the highlights **updated**
after that instant instead, ordered by `updatedAt` then `id` ascending, so a sync can store the last `updatedAt` it saw
and ask again from there; follow `nextCursor` (a cursor from one mode does not work in the other). A highlight whose
document has been removed is returned with `document: null` (as in the example); otherwise `document` is
`{ title, url }`. Deletions are not tombstoned: to learn which highlights were deleted, compare the ids you hold with a
full listing. Highlights cannot be created through the API.

**Scope:** `read:reading` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) ·
**Operation id:** `listMyHighlights`

| Parameter    | In    | Type    | Required | Description                                                               |
| ------------ | ----- | ------- | -------- | ------------------------------------------------------------------------- |
| `limit`      | query | integer | no       | Page size, 1–100 (default 30).                                            |
| `cursor`     | query | string  | no       | Opaque cursor from a previous `nextCursor`.                               |
| `kind`       | query | string  | no       | Only `library`, `blog` or `news` highlights.                              |
| `since`      | query | string  | no       | Only highlights updated after this ISO 8601 instant, oldest update first. |
| `hasNote`    | query | boolean | no       | `true` for highlights with a note, `false` for those without.             |
| `visibility` | query | string  | no       | `public` or `private`.                                                    |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clhl1",
      "kind": "library",
      "key": "meditations",
      "document": null,
      "quote": "You have power over your mind, not outside events.",
      "note": null,
      "isPublic": false,
      "createdAt": "2026-11-01T09:00:00.000Z",
      "updatedAt": "2026-11-20T18:30:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `PATCH /api/v1/me/highlights/{id}`

Change the note and/or visibility of one of your highlights. `note: null` or an empty string clears the note. It runs
the same function as the site, so the public-highlight rules apply; the API cannot supply the passage positions the
reader computes, so a highlight made public here is public but does not count toward "popular passages". A highlight
that is not yours is a 404.

**Scope:** `write:reading` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`updateMyHighlight`

| Parameter | In   | Type   | Required | Description       |
| --------- | ---- | ------ | -------- | ----------------- |
| `id`      | path | string | yes      | The highlight id. |

**Request body** (`application/json`)

| Field      | Type      | Required | Description                               |
| ---------- | --------- | -------- | ----------------------------------------- |
| `note`     | `string   | null`    | no                                        | Up to 2000 characters; null or empty clears it. |
| `isPublic` | `boolean` | no       | Show the highlight and its note publicly. |

```json
{
  "note": "Re-read before the review."
}
```

**Example response** (`200`)

```json
{
  "id": "clhl1",
  "kind": "library",
  "key": "meditations",
  "document": null,
  "quote": "You have power over your mind, not outside events.",
  "note": null,
  "isPublic": false,
  "createdAt": "2026-11-01T09:00:00.000Z",
  "updatedAt": "2026-11-20T18:30:00.000Z"
}
```

### `DELETE /api/v1/me/highlights/{id}`

Permanently delete one of your highlights and its note. Deletions are not tombstoned for `since` syncs.

**Scope:** `write:reading` · **Success:** `204` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`deleteMyHighlight`

| Parameter | In   | Type   | Required | Description       |
| --------- | ---- | ------ | -------- | ----------------- |
| `id`      | path | string | yes      | The highlight id. |

### `GET /api/v1/me/shelves`

Your shelf entries (`want`, `reading`, `read`), most recently changed first, up to 500. Optionally only one shelf.

**Scope:** `read:reading` · **Success:** `200` · **Operation id:** `listMyShelves`

| Parameter | In    | Type   | Required | Description                  |
| --------- | ----- | ------ | -------- | ---------------------------- |
| `shelf`   | query | string | no       | `want`, `reading` or `read`. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "slug": "meditations",
      "title": "Meditations",
      "shelf": "want",
      "pages": 254,
      "finishedAt": null,
      "updatedAt": "2026-11-10T08:00:00.000Z"
    }
  ]
}
```

### `PUT /api/v1/me/shelves/{slug}`

Shelve a library book, moving it if it is already shelved. Marking it `read` stamps `finishedAt` (now, or the date
already there, or the one you send) and it counts toward that year's reading goal. A slug that is not a library book is
a 404.

**Scope:** `write:reading` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`setMyShelf`

| Parameter | In   | Type   | Required | Description            |
| --------- | ---- | ------ | -------- | ---------------------- |
| `slug`    | path | string | yes      | The library book slug. |

**Request body** (`application/json`)

| Field        | Type      | Required | Description                                              |
| ------------ | --------- | -------- | -------------------------------------------------------- |
| `shelf`      | `string`  | yes      | `want`, `reading` or `read`.                             |
| `pages`      | `integer` | no       | Page count, used only when the book has none of its own. |
| `finishedAt` | `string   | null`    | no                                                       | ISO 8601 finish date; only with `read`, not in the future. |

```json
{
  "shelf": "read",
  "finishedAt": "2026-11-10T00:00:00.000Z"
}
```

**Example response** (`200`)

```json
{
  "slug": "meditations",
  "title": "Meditations",
  "shelf": "want",
  "pages": 254,
  "finishedAt": null,
  "updatedAt": "2026-11-10T08:00:00.000Z"
}
```

### `DELETE /api/v1/me/shelves/{slug}`

Remove the shelf entry. A book that is not on your shelves is a 404.

**Scope:** `write:reading` · **Success:** `204` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`removeMyShelf`

| Parameter | In   | Type   | Required | Description            |
| --------- | ---- | ------ | -------- | ---------------------- |
| `slug`    | path | string | yes      | The library book slug. |

### `GET /api/v1/me/reading-goal`

Your goal for a year and how far along you are: books and pages finished that year and `done` in the goal's unit. `goal`
is `null` when you set none, otherwise `{ unit, target, books, pages, done }`. Setting the goal stays on the site.

**Scope:** `read:reading` · **Success:** `200` · **Operation id:** `getMyReadingGoal`

| Parameter | In    | Type    | Required | Description                                         |
| --------- | ----- | ------- | -------- | --------------------------------------------------- |
| `year`    | query | integer | no       | The year, 2000–2200 (default the current UTC year). |

**Example response** (`200`)

```json
{
  "year": 2026,
  "goal": null
}
```

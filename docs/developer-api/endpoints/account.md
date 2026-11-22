<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Account

6 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me` | `read:profile` | Get your account |
| `GET /api/v1/me/notifications` | `read:notifications` | List your notifications |
| `GET /api/v1/me/bookmarks` | `read:bookmarks` | List your bookmarks |
| `GET /api/v1/me/following` | `read:profile` | List who you follow |
| `GET /api/v1/me/followers` | `read:profile` | List your followers |
| `GET /api/v1/me/deleted` | `read:reading` | List what you deleted |

## Reference

### `GET /api/v1/me`

The authenticated key owner’s account summary, tier, and stats.

**Scope:** `read:profile` · **Success:** `200` · **Operation id:** `getMe`

**Example response** (`200`)

```json
{
  "id": "ck_user123",
  "name": "Ada",
  "handle": "ada",
  "image": "https://…",
  "createdAt": "2026-01-02T03:04:05.000Z",
  "tier": "pro",
  "stats": {
    "coins": 1234,
    "xp": 5200,
    "level": 7,
    "followers": 12,
    "following": 30,
    "posts": 88
  }
}
```

### `GET /api/v1/me/notifications`

Your notifications, newest first.

**Scope:** `read:notifications` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyNotifications`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "ck_n1",
      "type": "FOLLOW",
      "actor": {
        "id": "ck_user123",
        "name": "Ada",
        "handle": "ada",
        "image": "https://…"
      },
      "preview": null,
      "link": "/u/ada",
      "read": false,
      "createdAt": "2026-06-30T09:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/bookmarks`

Posts you have bookmarked, newest first. With `since` you get only the bookmarks made after that instant; a post you un-bookmarked is reported by `GET /api/v1/me/deleted?kind=bookmark`. `metrics` fields are `null` on a post whose author hides the counts on their posts from other accounts (your own posts always carry them); see the `PostMetrics` schema.

**Scope:** `read:bookmarks` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyBookmarks`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |
| `since` | query | string | no | Only bookmarks made after this ISO 8601 instant. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "ck_post123",
      "content": "hello world",
      "audience": "PUBLIC",
      "sensitive": false,
      "contentWarning": null,
      "createdAt": "2026-06-30T10:00:00.000Z",
      "metrics": {
        "likes": 3,
        "comments": 1,
        "reposts": 0,
        "views": 42
      },
      "author": {
        "id": "ck_user123",
        "name": "Ada",
        "handle": "ada",
        "image": "https://…"
      },
      "bookmarkedAt": "2026-06-29T12:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/following`

Users the authenticated account follows.

**Scope:** `read:profile` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyFollowing`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "ck_user123",
      "name": "Ada",
      "handle": "ada",
      "image": "https://…"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/followers`

Users who follow the authenticated account.

**Scope:** `read:profile` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyFollowers`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "ck_user123",
      "name": "Ada",
      "handle": "ada",
      "image": "https://…"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/deleted`

Deletions of one `kind` after `since`, oldest first, so an app keeping a copy of your highlights, decks, cards, bookmarks or shelf entries can drop what you removed on the site. `kind` is `highlight`, `deck`, `card`, `bookmark` or `shelf_entry`. Each item is `{ id, kind, deletedAt }` and carries no content. `id` is the highlight, deck or card id, the bookmarked post's id, or the book's slug. The scope is the read scope of the kind: `read:reading` for `highlight` and `shelf_entry`, `read:study` for `deck` and `card`, `read:bookmarks` for `bookmark` (the scope listed here is the first; the others are checked per kind). Deletions are kept 90 days: a `since` older than that is `410 sync_window_expired` and the client must resync in full. Without `since` you get every deletion still kept. Deleting a deck is one `deck` item and none for its cards. A bookmark or shelf entry you add again after deleting it has a later time than its tombstone: apply a deletion only when its `deletedAt` is later than the item you hold.

**Scope:** `read:reading` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyDeleted`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `kind` | query | string | yes | `highlight`, `deck`, `card`, `bookmark` or `shelf_entry`. |
| `since` | query | string | no | Only deletions after this ISO 8601 instant. At most 90 days ago, or `410 sync_window_expired`. |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor`. |
| `limit` | query | integer | no | Page size, 1–500 (default 100). |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clhl1",
      "kind": "highlight",
      "deletedAt": "2026-11-22T12:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Account

5 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me` | `read:profile` | Get your account |
| `GET /api/v1/me/notifications` | `read:notifications` | List your notifications |
| `GET /api/v1/me/bookmarks` | `read:bookmarks` | List your bookmarks |
| `GET /api/v1/me/following` | `read:profile` | List who you follow |
| `GET /api/v1/me/followers` | `read:profile` | List your followers |

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

Posts you have bookmarked, newest first.

**Scope:** `read:bookmarks` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyBookmarks`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "ck_post123",
      "content": "hello world",
      "audience": "PUBLIC",
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

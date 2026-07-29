<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Users

6 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/users/{handle}` | `read:users` | Get a public profile |
| `GET /api/v1/users/{handle}/posts` | `read:users` | List a user’s public posts |
| `GET /api/v1/users/{handle}/followers` | `read:users` | List a user’s followers |
| `GET /api/v1/users/{handle}/following` | `read:users` | List who a user follows |
| `POST /api/v1/users/{handle}/follow` | `write:follows` | Follow a user |
| `DELETE /api/v1/users/{handle}/follow` | `write:follows` | Unfollow a user |

## Reference

### `GET /api/v1/users/{handle}`

A public user profile by handle.

**Scope:** `read:users` · **Success:** `200` · **Operation id:** `getUser`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `handle` | path | string | yes | The user’s handle (without @). |

**Example response** (`200`)

```json
{
  "id": "ck_user123",
  "name": "Ada",
  "handle": "ada",
  "image": "https://…",
  "bio": "builder",
  "createdAt": "2026-01-02T03:04:05.000Z",
  "stats": {
    "followers": 12,
    "following": 30,
    "posts": 88,
    "level": 7
  }
}
```

### `GET /api/v1/users/{handle}/posts`

A user’s public posts, newest first.

**Scope:** `read:users` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listUserPosts`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `handle` | path | string | yes | The user’s handle. |
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
      }
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/users/{handle}/followers`

Users who follow this user.

**Scope:** `read:users` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listUserFollowers`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `handle` | path | string | yes | The user’s handle. |
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

### `GET /api/v1/users/{handle}/following`

Users this user follows.

**Scope:** `read:users` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listUserFollowing`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `handle` | path | string | yes | The user’s handle. |
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

### `POST /api/v1/users/{handle}/follow`

Follow a user. Idempotent.

**Scope:** `write:follows` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `followUser`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `handle` | path | string | yes | The user’s handle. |

**Example response** (`200`)

```json
{
  "following": true
}
```

### `DELETE /api/v1/users/{handle}/follow`

Stop following a user.

**Scope:** `write:follows` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `unfollowUser`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `handle` | path | string | yes | The user’s handle. |

**Example response** (`200`)

```json
{
  "following": false
}
```

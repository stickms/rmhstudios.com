<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Engagement

6 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `POST /api/v1/posts/{id}/like` | `write:likes` | Like a post |
| `DELETE /api/v1/posts/{id}/like` | `write:likes` | Unlike a post |
| `GET /api/v1/posts/{id}/comments` | `read:feed` | List a post’s comments |
| `POST /api/v1/posts/{id}/comments` | `write:comments` | Comment on a post |
| `POST /api/v1/posts/{id}/bookmark` | `write:bookmarks` | Bookmark a post |
| `DELETE /api/v1/posts/{id}/bookmark` | `write:bookmarks` | Remove a bookmark |

## Reference

### `POST /api/v1/posts/{id}/like`

Like a post. Idempotent — liking an already-liked post is a no-op.

**Scope:** `write:likes` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `likePost`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The post id. |

**Example response** (`200`)

```json
{
  "liked": true,
  "likeCount": 4
}
```

### `DELETE /api/v1/posts/{id}/like`

Remove your like from a post.

**Scope:** `write:likes` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `unlikePost`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The post id. |

**Example response** (`200`)

```json
{
  "liked": false,
  "likeCount": 3
}
```

### `GET /api/v1/posts/{id}/comments`

Top-level comments on a post, newest first.

**Scope:** `read:feed` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listComments`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The post id. |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "ck_c1",
      "content": "nice",
      "createdAt": "2026-06-30T10:01:00.000Z",
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

### `POST /api/v1/posts/{id}/comments`

Add a comment (or threaded reply) to a post.

**Scope:** `write:comments` · **Success:** `201` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `createComment`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The post id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `content` | `string` | yes | 1–280 characters. |
| `parent_id` | `string` | no | Comment id to reply to (optional). |

```json
{
  "content": "Great post!"
}
```

**Example response** (`201`)

```json
{
  "id": "ck_c1",
  "content": "Great post!",
  "createdAt": "2026-06-30T10:01:00.000Z",
  "author": {
    "id": "ck_user123",
    "name": "Ada",
    "handle": "ada",
    "image": "https://…"
  }
}
```

### `POST /api/v1/posts/{id}/bookmark`

Add a post to your bookmarks.

**Scope:** `write:bookmarks` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `bookmarkPost`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The post id. |

**Example response** (`200`)

```json
{
  "bookmarked": true
}
```

### `DELETE /api/v1/posts/{id}/bookmark`

Remove a post from your bookmarks.

**Scope:** `write:bookmarks` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `unbookmarkPost`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The post id. |

**Example response** (`200`)

```json
{
  "bookmarked": false
}
```

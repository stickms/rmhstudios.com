<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Posts

4 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/posts` | `read:posts` | List your posts |
| `POST /api/v1/posts` | `write:posts` | Create a post |
| `GET /api/v1/posts/{id}` | `read:posts` | Get a post |
| `DELETE /api/v1/posts/{id}` | `write:posts` | Delete a post |

## Reference

### `GET /api/v1/posts`

Your recent posts, newest first.

**Scope:** `read:posts` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyPosts`

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
      }
    }
  ],
  "nextCursor": "2026-06-20T10:00:00.000Z"
}
```

### `POST /api/v1/posts`

Create a post on your account. Awards XP and progresses quests exactly like the in-app composer.

**Scope:** `write:posts` · **Success:** `201` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `createPost`

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `content` | `string` | no | 1–280 characters. Optional if at least one `media_ids` entry is supplied. |
| `media_ids` | `string[]` | no | Up to 4 media ids from POST /api/v1/images. |
| `audience` | `string` | no | `PUBLIC` (default), `FOLLOWERS`, or `PRIVATE`. |

```json
{
  "content": "Posted via the API!",
  "audience": "PUBLIC"
}
```

**Example response** (`201`)

```json
{
  "id": "ck_post123",
  "content": "Posted via the API!",
  "audience": "PUBLIC",
  "createdAt": "2026-06-30T10:00:00.000Z"
}
```

### `GET /api/v1/posts/{id}`

Fetch a single post by id. Returns public posts and your own posts; otherwise 404.

**Scope:** `read:posts` · **Success:** `200` · **Operation id:** `getPost`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The post id. |

**Example response** (`200`)

```json
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
```

### `DELETE /api/v1/posts/{id}`

Soft-delete one of your own posts. Returns 204 on success.

**Scope:** `write:posts` · **Success:** `204` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `deletePost`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The post id. |

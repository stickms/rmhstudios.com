<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Feed

1 endpoint. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/feed` | `read:feed` | Get the public feed |

## Reference

### `GET /api/v1/feed`

The public global feed. Only public, free, non-community posts are returned.

**Scope:** `read:feed` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `getFeed`

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
      }
    }
  ],
  "nextCursor": "2026-06-20T09:59:00.000Z"
}
```

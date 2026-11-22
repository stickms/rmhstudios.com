<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Search

2 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/search/posts` | `read:search` | Search public posts |
| `GET /api/v1/search/people` | `read:search` | Search people |

## Reference

### `GET /api/v1/search/posts`

Keyword search over public, free posts with the site's operators. Posts in private communities, posts by members who blocked you or whom you blocked or muted, and posts by banned or deleted members never appear. Semantic search is not available. Each call counts as 3 requests against the daily quota. `metrics` fields are `null` on a post whose author hides the counts on their posts from other accounts (your own posts always carry them); see the `PostMetrics` schema.

**Scope:** `read:search` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `searchPosts`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `q` | query | string | yes | The query, 1–200 characters. Free text plus the site's operators: `from:@handle`, `in:community-slug`, `has:media`, `before:YYYY-MM-DD`, `after:YYYY-MM-DD`. Operators alone return matching posts newest first. |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. Ranked results page through the best 120 matches. |

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
      }
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/search/people`

Find members by name, handle or display name. Only public profile fields are returned. Members who blocked you or whom you blocked, and banned, deleted or deletion-scheduled accounts, never appear. Each call counts as 3 requests against the daily quota. There is one page: `nextCursor` is always `null`.

**Scope:** `read:search` · **Success:** `200` · **Operation id:** `searchPeople`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `q` | query | string | yes | A name, handle or display name, 1–100 characters. |
| `limit` | query | integer | no | Page size, 1–25 (default 10). |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "ck_user123",
      "name": "Ada",
      "handle": "ada",
      "image": "https://…",
      "bio": null,
      "location": null,
      "website": null,
      "createdAt": "2026-01-05T10:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

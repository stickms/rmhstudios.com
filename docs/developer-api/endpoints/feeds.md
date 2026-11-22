<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Feeds

4 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me/feeds` | `read:feeds` | List your feeds |
| `GET /api/v1/me/feeds/{id}` | `read:feeds` | Get one of your feeds |
| `GET /api/v1/feeds/{id}/posts` | `read:feeds` | Read a feed's posts |
| `PUT /api/v1/me/feeds/{id}/members` | `write:feeds` | Replace a list's members |

## Reference

### `GET /api/v1/me/feeds`

Your feeds, lists, saved searches and keyword alerts, newest first. `kind` is `feed`, `list`, `search` or `alert`; `query` and `types` describe a saved search or alert, `tags` and `keywords` a feed. Only your own are listed.

**Scope:** `read:feeds` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyFeeds`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `kind` | query | string | no | Only this kind: `feed`, `list`, `search` or `alert`. |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clfeed1",
      "kind": "feed",
      "name": "Rust news",
      "description": null,
      "visibility": "PRIVATE",
      "pinned": false,
      "tags": [
        "rust"
      ],
      "keywords": [
        "release"
      ],
      "query": null,
      "types": [
        "post"
      ],
      "notify": false,
      "subscribers": 0,
      "createdAt": "2026-11-19T09:00:00.000Z",
      "updatedAt": "2026-11-20T21:14:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/feeds/{id}`

One of your feeds with `members`, the handles of its people (a list, or a feed with people). Another member's feed is a `404`, private or not.

**Scope:** `read:feeds` · **Success:** `200` · **Operation id:** `getMyFeed`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The feed id. |

**Example response** (`200`)

```json
{
  "id": "clfeed1",
  "kind": "feed",
  "name": "Rust news",
  "description": null,
  "visibility": "PRIVATE",
  "pinned": false,
  "tags": [
    "rust"
  ],
  "keywords": [
    "release"
  ],
  "query": null,
  "types": [
    "post"
  ],
  "notify": false,
  "subscribers": 0,
  "createdAt": "2026-11-19T09:00:00.000Z",
  "updatedAt": "2026-11-20T21:14:00.000Z",
  "members": [
    "ada"
  ]
}
```

### `GET /api/v1/feeds/{id}/posts`

The posts of a feed or list as the site pages them for you, newest first: your own feed, or one its owner published or shared by link. Needs `read:posts` as well as `read:feeds`. Authors you blocked or muted, who blocked you, or who are banned or deleted never appear. A saved search or keyword alert is `409 not_a_timeline`; another member's private feed is a `404`. `metrics` fields are `null` on a post whose author hides the counts on their posts from other accounts (your own posts always carry them); see the `PostMetrics` schema.

**Scope:** `read:feeds` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listFeedPosts`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The feed id. |
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

### `PUT /api/v1/me/feeds/{id}/members`

Make the list's members exactly these handles (case-insensitive, at most 500; an empty array clears the list). Handles that match no account, a deleted or banned account, or a member blocked in either direction are not added and come back in `skipped` with the reason `not_found` or `blocked`. Only your own lists: a feed that is not a list, or another member's, is a `404`.

**Scope:** `write:feeds` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `replaceListMembers`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The list id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `handles` | `string[]` | yes | The handles of the members, with or without a leading `@`. At most 500. |

```json
{
  "handles": [
    "ada",
    "grace"
  ]
}
```

**Example response** (`200`)

```json
{
  "id": "clfeed1",
  "memberCount": 1,
  "members": [
    "ada"
  ],
  "skipped": [
    {
      "handle": "grace",
      "reason": "blocked"
    }
  ]
}
```

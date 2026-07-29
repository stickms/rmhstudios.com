<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Content

7 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/builds` | `read:builds` | List public builds |
| `GET /api/v1/builds/{slug}` | `read:builds` | Get a build |
| `GET /api/v1/blog` | `read:content` | List blog posts |
| `GET /api/v1/blog/{slug}` | `read:content` | Get a blog post |
| `GET /api/v1/news` | `read:content` | List news articles |
| `GET /api/v1/news/{slug}` | `read:content` | Get a news article |
| `GET /api/v1/leaderboards/{game}` | `read:leaderboards` | Get a game leaderboard |

## Reference

### `GET /api/v1/builds`

The public builds marketplace, newest first.

**Scope:** `read:builds` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listBuilds`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `category` | query | string | no | Filter by category slug. |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "slug": "my-build",
      "title": "My Build",
      "description": "…",
      "author": {
        "id": "ck_user123",
        "name": "Ada",
        "handle": "ada",
        "image": "https://…"
      },
      "technologies": [
        "react"
      ],
      "price": null,
      "metrics": {
        "likes": 4,
        "comments": 1,
        "views": 90
      },
      "publishedAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/builds/{slug}`

A single public build, including its readme.

**Scope:** `read:builds` · **Success:** `200` · **Operation id:** `getBuild`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The build slug. |

**Example response** (`200`)

```json
{
  "slug": "my-build",
  "title": "My Build",
  "description": "…",
  "readme": "# My Build",
  "repoUrl": null,
  "demoUrl": null,
  "author": {
    "id": "ck_user123",
    "name": "Ada",
    "handle": "ada",
    "image": "https://…"
  },
  "technologies": [
    "react"
  ],
  "metrics": {
    "likes": 4,
    "comments": 1,
    "views": 90
  }
}
```

### `GET /api/v1/blog`

RMH Studios devlog posts, newest first.

**Scope:** `read:content` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listBlog`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "slug": "hello",
      "title": "Hello",
      "description": "…",
      "date": "2026-06-01",
      "tags": [
        "news"
      ]
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/blog/{slug}`

A single blog post, including markdown content.

**Scope:** `read:content` · **Success:** `200` · **Operation id:** `getBlogPost`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The post slug. |

**Example response** (`200`)

```json
{
  "slug": "hello",
  "title": "Hello",
  "description": "…",
  "date": "2026-06-01",
  "tags": [
    "news"
  ],
  "content": "# Hello"
}
```

### `GET /api/v1/news`

Published news articles, newest first.

**Scope:** `read:content` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listNews`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `category` | query | string | no | Filter by category. |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "slug": "big-news",
      "title": "Big News",
      "description": "…",
      "date": "2026-06-01",
      "category": "updates",
      "featured": false
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/news/{slug}`

A single published news article.

**Scope:** `read:content` · **Success:** `200` · **Operation id:** `getNewsArticle`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The article slug. |

**Example response** (`200`)

```json
{
  "slug": "big-news",
  "title": "Big News",
  "description": "…",
  "date": "2026-06-01",
  "category": "updates",
  "content": "…",
  "source": {
    "title": "…",
    "url": "https://…",
    "publisher": "…"
  }
}
```

### `GET /api/v1/leaderboards/{game}`

Top scores for a game. Supported games are listed in the response of an unknown game (400).

**Scope:** `read:leaderboards` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `getLeaderboard`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `game` | path | string | yes | Game key, e.g. `vega`, `void-breaker`, `signal-forge`, `neon-driftway`, `laundry`, `synapse-storm`. |
| `limit` | query | integer | no | Page size, 1–100 (default 25). |

**Example response** (`200`)

```json
{
  "game": "vega",
  "metric": "highScore",
  "data": [
    {
      "rank": 1,
      "username": "ada",
      "score": 99999,
      "gamesPlayed": 12
    }
  ]
}
```

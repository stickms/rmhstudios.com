<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Communities

4 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me/communities` | `read:communities` | List your communities |
| `GET /api/v1/communities/{slug}` | `read:communities` | Get a community |
| `GET /api/v1/communities/{slug}/rules` | `read:communities` | Get a community's rules |
| `GET /api/v1/communities/{slug}/posts` | `read:communities` | List a community's posts |

## Reference

### `GET /api/v1/me/communities`

The communities you belong to, newest membership first, with your role and the day you joined. Joining and leaving stay on the site.

**Scope:** `read:communities` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyCommunities`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clcommunity1",
      "slug": "retro-gamers",
      "name": "Retro Gamers",
      "icon": "🎮",
      "isPrivate": false,
      "memberCount": 128,
      "role": "MEMBER",
      "joinedAt": "2026-10-01T12:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/communities/{slug}`

A community you can see: its description, member count, privacy, posting requirements, flairs and whether you are a member (`role` is `null` when you are not). A private community you are not a member of is a 404. Member lists are not exposed.

**Scope:** `read:communities` · **Success:** `200` · **Operation id:** `getCommunity`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The community slug. |

**Example response** (`200`)

```json
{
  "id": "clcommunity1",
  "slug": "retro-gamers",
  "name": "Retro Gamers",
  "description": "Talk about the old ones.",
  "icon": "🎮",
  "color": "#4455aa",
  "isPrivate": false,
  "memberCount": 128,
  "createdAt": "2026-09-01T12:00:00.000Z",
  "isMember": true,
  "role": "MEMBER",
  "posting": {
    "verification": {
      "level": "none",
      "value": 0
    },
    "flairRequired": false,
    "requireImageAlt": false
  },
  "flairs": [
    {
      "id": "clflair1",
      "name": "Discussion",
      "color": "accent"
    }
  ]
}
```

### `GET /api/v1/communities/{slug}/rules`

The rules as the site shows them, in order (`position` starts at 1). Same visibility as `GET /communities/{slug}`.

**Scope:** `read:communities` · **Success:** `200` · **Operation id:** `getCommunityRules`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The community slug. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clrule1",
      "position": 1,
      "title": "Be kind",
      "description": "No harassment."
    }
  ]
}
```

### `GET /api/v1/communities/{slug}/posts`

The community feed as the site returns it to you, newest first: the same visibility, removed and held posts left out, and quiet counts. Paginate with the opaque `nextCursor`. `metrics` fields are `null` on a post whose author hides the counts on their posts from other accounts (your own posts always carry them); see the `PostMetrics` schema.

**Scope:** `read:communities` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listCommunityPosts`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The community slug. |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |
| `flair` | query | string | no | Only posts with this flair id. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "ck_post123",
      "content": "What is everyone playing this week?",
      "imageUrls": [],
      "imageAlts": [],
      "gifUrl": null,
      "gifAlt": null,
      "sensitive": false,
      "contentWarning": null,
      "pinnedReplyId": null,
      "createdAt": "2026-11-20T10:00:00.000Z",
      "author": {
        "id": "ck_user123",
        "name": "Ada",
        "handle": "ada",
        "image": "https://…"
      },
      "metrics": {
        "likes": 3,
        "comments": 1,
        "reposts": 0,
        "views": 42
      },
      "flair": {
        "id": "clflair1",
        "name": "Discussion",
        "color": "accent"
      }
    }
  ],
  "nextCursor": null
}
```

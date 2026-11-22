<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Scheduled

6 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me/scheduled` | `read:scheduled` | List your drafts and scheduled posts |
| `POST /api/v1/me/scheduled` | `write:scheduled` | Save a draft or schedule a post |
| `GET /api/v1/me/scheduled/{id}` | `read:scheduled` | Get a draft or scheduled post |
| `PATCH /api/v1/me/scheduled/{id}` | `write:scheduled` | Change a draft or scheduled post |
| `DELETE /api/v1/me/scheduled/{id}` | `write:scheduled` | Discard a draft or scheduled post |
| `POST /api/v1/me/scheduled/{id}/publish` | `write:scheduled` | Publish a draft or scheduled post now |

## Reference

### `GET /api/v1/me/scheduled`

Your unpublished drafts, scheduled posts and time capsules (capsules are read-only), newest first. Anything now due is published first, as on the site. `held` says why a row would not go out now (`community_sanction` or `image_descriptions`); it is read from the publish checks and never stored. Only your own rows are listed.

**Scope:** `read:scheduled` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyScheduled`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `kind` | query | string | no | Filter: `draft`, `scheduled` or `capsule`. |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clsched1",
      "kind": "scheduled",
      "content": "Weekly digest: three things I read this week.",
      "audience": "PUBLIC",
      "replyControl": "EVERYONE",
      "contentWarning": null,
      "communityId": null,
      "poll": null,
      "imageUrls": [
        "/api/media/med_example.png"
      ],
      "imageAlts": [
        "A cat on a keyboard"
      ],
      "gifUrl": null,
      "gifAlt": null,
      "scheduledAt": "2026-11-23T09:00:00.000Z",
      "held": null,
      "postId": null,
      "createdAt": "2026-11-22T10:15:00.000Z",
      "updatedAt": "2026-11-22T10:15:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `POST /api/v1/me/scheduled`

Save a draft, or schedule a post with `scheduledAt`. At most 50 drafts and scheduled posts at once (`409 conflict` beyond that). The body is the post body of `POST /api/v1/posts`. A body with `communityId` also needs `write:communities`; a post AutoMod would hold or flag is refused with `422 automod_held`, because a scheduled post is published without a hold. Time capsules are created on the site.

**Scope:** `write:scheduled` · **Success:** `201` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `createMyScheduled`

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `content` | `string` | no | The post text, up to 1,000 characters. A post needs text, a poll or an image. |
| `scheduledAt` | `string` | no | ISO 8601 time to publish, UTC. 2 minutes to 365 days ahead. Absent or null saves a draft. |
| `audience` | `string` | no | `PUBLIC` (default), `FOLLOWERS` or `PRIVATE`. |
| `replyControl` | `string` | no | `EVERYONE` (default), `FOLLOWING` or `MENTIONED`. |
| `contentWarning` | `string` | no | A reason for a content warning, 1–80 characters on one line; null removes it. |
| `media_ids` | `string[]` | no | Up to 4 ids from `POST /api/v1/images`, your own uploads. |
| `media_alts` | `string[]` | no | A description per image, in the same order, up to 1,000 characters each. |
| `poll` | `object` | no | A poll (`question`, `options`, optionally `multiSelect`, `ranked`, `durationHours`, or a quiz). Cannot be combined with `communityId`. |
| `communityId` | `string` | no | Post into a community you belong to. Needs `write:communities` too, and the community gate (membership, bans, flair, descriptions, AutoMod) runs when you save. |

```json
{
  "content": "Weekly digest: three things I read this week.",
  "scheduledAt": "2026-11-23T09:00:00.000Z"
}
```

**Example response** (`201`)

```json
{
  "id": "clsched1",
  "kind": "scheduled",
  "content": "Weekly digest: three things I read this week.",
  "audience": "PUBLIC",
  "replyControl": "EVERYONE",
  "contentWarning": null,
  "communityId": null,
  "poll": null,
  "imageUrls": [
    "/api/media/med_example.png"
  ],
  "imageAlts": [
    "A cat on a keyboard"
  ],
  "gifUrl": null,
  "gifAlt": null,
  "scheduledAt": "2026-11-23T09:00:00.000Z",
  "held": null,
  "postId": null,
  "createdAt": "2026-11-22T10:15:00.000Z",
  "updatedAt": "2026-11-22T10:15:00.000Z"
}
```

### `GET /api/v1/me/scheduled/{id}`

One of your drafts, scheduled posts or capsules. Once published, `postId` is the post it became.

**Scope:** `read:scheduled` · **Success:** `200` · **Operation id:** `getMyScheduled`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The draft or scheduled post id. |

**Example response** (`200`)

```json
{
  "id": "clsched1",
  "kind": "scheduled",
  "content": "Weekly digest: three things I read this week.",
  "audience": "PUBLIC",
  "replyControl": "EVERYONE",
  "contentWarning": null,
  "communityId": null,
  "poll": null,
  "imageUrls": [
    "/api/media/med_example.png"
  ],
  "imageAlts": [
    "A cat on a keyboard"
  ],
  "gifUrl": null,
  "gifAlt": null,
  "scheduledAt": "2026-11-23T09:00:00.000Z",
  "held": null,
  "postId": null,
  "createdAt": "2026-11-22T10:15:00.000Z",
  "updatedAt": "2026-11-22T10:15:00.000Z"
}
```

### `PATCH /api/v1/me/scheduled/{id}`

Change any of the creation fields; `scheduledAt: null` turns a scheduled post back into a draft. A published post or a time capsule is `409 conflict`. Changing a community post needs `write:communities` and runs the community gate again.

**Scope:** `write:scheduled` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `updateMyScheduled`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The draft or scheduled post id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `content` | `string` | no | The post text, up to 1,000 characters. A post needs text, a poll or an image. |
| `scheduledAt` | `string` | no | ISO 8601 time to publish, UTC. 2 minutes to 365 days ahead. Absent or null saves a draft. |
| `audience` | `string` | no | `PUBLIC` (default), `FOLLOWERS` or `PRIVATE`. |
| `replyControl` | `string` | no | `EVERYONE` (default), `FOLLOWING` or `MENTIONED`. |
| `contentWarning` | `string` | no | A reason for a content warning, 1–80 characters on one line; null removes it. |
| `media_ids` | `string[]` | no | Up to 4 ids from `POST /api/v1/images`, your own uploads. |
| `media_alts` | `string[]` | no | A description per image, in the same order, up to 1,000 characters each. |
| `poll` | `object` | no | A poll (`question`, `options`, optionally `multiSelect`, `ranked`, `durationHours`, or a quiz). Cannot be combined with `communityId`. |
| `communityId` | `string` | no | Post into a community you belong to. Needs `write:communities` too, and the community gate (membership, bans, flair, descriptions, AutoMod) runs when you save. |

```json
{
  "scheduledAt": "2026-11-24T09:00:00.000Z"
}
```

**Example response** (`200`)

```json
{
  "id": "clsched1",
  "kind": "scheduled",
  "content": "Weekly digest: three things I read this week.",
  "audience": "PUBLIC",
  "replyControl": "EVERYONE",
  "contentWarning": null,
  "communityId": null,
  "poll": null,
  "imageUrls": [
    "/api/media/med_example.png"
  ],
  "imageAlts": [
    "A cat on a keyboard"
  ],
  "gifUrl": null,
  "gifAlt": null,
  "scheduledAt": "2026-11-23T09:00:00.000Z",
  "held": null,
  "postId": null,
  "createdAt": "2026-11-22T10:15:00.000Z",
  "updatedAt": "2026-11-22T10:15:00.000Z"
}
```

### `DELETE /api/v1/me/scheduled/{id}`

Discard a draft or scheduled post. A published post or a time capsule is `409 conflict`; capsules are cancelled on the site.

**Scope:** `write:scheduled` · **Success:** `204` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `deleteMyScheduled`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The draft or scheduled post id. |

### `POST /api/v1/me/scheduled/{id}/publish`

Publish now, through the same checks as the scheduled sweep. If a check holds it (a community ban or timeout, a missing image description) it stays a draft and the answer is `409 conflict`. A community post needs `write:communities`.

**Scope:** `write:scheduled` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `publishMyScheduled`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The draft or scheduled post id. |

**Example response** (`200`)

```json
{
  "published": true,
  "postId": "clpost1"
}
```

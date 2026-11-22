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

Your recent posts, newest first. `pinnedOrder` is the post’s place among its author’s pinned profile posts (1 is the top, at most 3), or `null` when it is not pinned.

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
      "sensitive": false,
      "contentWarning": null,
      "createdAt": "2026-06-30T10:00:00.000Z",
      "metrics": {
        "likes": 3,
        "comments": 1,
        "reposts": 0,
        "views": 42
      },
      "pinnedOrder": null
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
| `communityId` | `string` | no | Post into this community instead of only your timeline. Needs the `write:communities` scope as well as `write:posts`, and you must be a member. The community's own rules apply (flair, verification, AutoMod, image descriptions, bans and timeouts): a held post answers `202` with `{ "status": "held", "id": … }`, an AutoMod removal `422` with the rule name, and a refusal the gate's `code` (a ban or timeout also carries `endsAt`). |
| `flairId` | `string` | no | A flair of that community (needs `communityId`); required when the community requires one. |
| `media_alts` | `string[]` | no | With `communityId`: a description for each `media_ids` image, in order. A community can require one on every image. |
| `poll` | `object` | no | A poll on the post (not with `communityId`): `question`, 2 to 4 `options` (strings), optional `multiSelect` and `durationHours` (1 to 720). A quiz adds `quiz: true`, `correctIndex` (the zero-based position of the one correct option) and an optional `explanation` of at most 280 characters; a quiz is single choice, so it cannot also set `multiSelect`. A post may carry just a poll, with no `content`. |

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

Fetch a single post by id. Returns public posts and your own posts; otherwise 404. `metrics` fields are `null` on a post whose author hides the counts on their posts from other accounts (your own posts always carry them); see the `PostMetrics` schema. `pinnedOrder` is the post’s place among its author’s pinned profile posts (1 is the top, at most 3), or `null` when it is not pinned. `poll` is `null` unless the post carries a poll. A ranked-choice poll has `ranked: true`; once it has ended, `poll.result` holds `winnerOptionId` (null when nobody ranked an option) and the instant-runoff `rounds` (each round's option tallies and the option eliminated at its end, null on the deciding round). When the author hides counts from you, tallies are whole percents and `percentOnly` is `true`. A quiz poll has `quiz: true`; its `correctOptionId` and `explanation` are `null` until you may know them: you wrote the post, you voted on the poll, or it has ended. A poll that is not a quiz has `quiz: false` and both `null`.

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
  "sensitive": false,
  "contentWarning": null,
  "createdAt": "2026-06-30T10:00:00.000Z",
  "metrics": {
    "likes": 3,
    "comments": 1,
    "reposts": 0,
    "views": 42
  },
  "pinnedOrder": null,
  "poll": null,
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

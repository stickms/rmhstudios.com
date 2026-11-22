<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Moderation

5 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/communities/{slug}/modqueue` | `manage:moderation` | List a community's mod queue |
| `POST /api/v1/communities/{slug}/modqueue/{itemId}` | `manage:moderation` | Approve or remove a queued item |
| `GET /api/v1/communities/{slug}/sanctions` | `manage:moderation` | List a community's timeouts and bans |
| `POST /api/v1/communities/{slug}/sanctions` | `manage:moderation` | Time out or ban a member |
| `DELETE /api/v1/communities/{slug}/sanctions/{id}` | `manage:moderation` | Lift a timeout or ban |

## Reference

### `GET /api/v1/communities/{slug}/modqueue`

Held and flagged posts and comments, newest first, for a community you moderate. `view=pending` (default) is what still needs a decision; `view=log` is what was already decided. A held post's text comes back in `post`, serialised like every other post the API returns (content warnings, GIF descriptions and quiet counts apply); a held comment has no `post`. `text` is the held text either way, which is what the queue is for. `403 not_moderator` when you are not a moderator of the community now (checked on every call, never cached on the key), `404` for a community you cannot see. Needs the `manage:moderation` scope, which `*` and `manage:*` do not grant: a key must list it. Each call counts as 2 requests against the daily quota.

**Scope:** `manage:moderation` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listModQueue`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The community slug. |
| `view` | query | string | no | `pending` (default) or `log`. |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clmodq1",
      "type": "comment",
      "action": "hold",
      "status": "PENDING",
      "ruleName": "New account links",
      "snapshot": "Check out my new site",
      "text": "Check out my new site",
      "reporters": null,
      "citedRule": null,
      "createdAt": "2026-11-22T09:30:00.000Z",
      "author": {
        "id": "ck_user123",
        "name": "Ada",
        "handle": "ada",
        "image": "https://…"
      },
      "post": null
    }
  ],
  "nextCursor": null
}
```

### `POST /api/v1/communities/{slug}/modqueue/{itemId}`

Decide one item as the key owner, through the same code the site's queue uses: approving a held post publishes it and queues its alerts; removing with a `rule_id` records the citation and tells the author which rule it broke, with your `message` if you send one. The decision is in the community's moderator log as yours, marked as made through the API (the public log does not show the marker). `409 item_resolved` when someone already decided it, `400 rule_not_found` for a rule of another community. At most 120 decisions a key an hour, on top of the write limit.

**Scope:** `manage:moderation` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `decideModItem`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The community slug. |
| `itemId` | path | string | yes | The queue item id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `decision` | `string` | yes | `approve` or `remove`. |
| `rule_id` | `string` | no | The community rule a removal cites (`GET /communities/{slug}/rules`). |
| `message` | `string` | no | A note sent to the author with a removal, up to 1000 characters. |

```json
{
  "decision": "remove",
  "rule_id": "clrule1",
  "message": "Please keep promotion to the weekly thread."
}
```

**Example response** (`200`)

```json
{
  "id": "clmodq1",
  "status": "REMOVED"
}
```

### `GET /api/v1/communities/{slug}/sanctions`

Current timeouts and bans (`active=true`, the default), or the lifted and ended ones (`active=false`), newest first. `reason` is the private note moderators wrote (an empty string when there is none); it is never shown to the member. `endsAt` is `null` for a ban with no end; `moderator` is `null` when that moderator's account was erased. `403 not_moderator` when you are not a moderator of the community now.

**Scope:** `manage:moderation` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listSanctions`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The community slug. |
| `active` | query | string | no | `true` (default) or `false`. |
| `limit` | query | integer | no | Page size, 1–50 (default 20). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clsanction1",
      "kind": "ban",
      "member": {
        "id": "ck_user456",
        "name": "Grace",
        "handle": "grace"
      },
      "moderator": null,
      "endsAt": null,
      "createdAt": "2026-11-22T09:30:00.000Z",
      "liftedAt": null,
      "rule": null,
      "reason": "Second warning today."
    }
  ],
  "nextCursor": null
}
```

### `POST /api/v1/communities/{slug}/sanctions`

Sanction a member as the key owner, by `handle`, through the site's own rules: a moderator can act on members, only the owner can sanction a moderator, and nobody can sanction the owner or themselves (`409 sanction_refused`, with the site's reason). A timeout lasts `1h`, `1d` (default), `3d` or `7d`; a ban `1d`, `7d` (default), `30d` or `forever`. A new sanction replaces the member's active one. The member is told the kind, the end and the rule's title, never the `reason`. `404` for a handle that is not a member (a timeout needs a member), `400 rule_not_found` for a rule of another community. At most 30 sanctions a key an hour, on top of the write limit. Answers `201`.

**Scope:** `manage:moderation` · **Success:** `201` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `createSanction`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The community slug. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `handle` | `string` | yes | The member, with or without a leading `@`. |
| `kind` | `string` | yes | `timeout` or `ban`. |
| `duration` | `string` | no | `1h`, `1d`, `3d`, `7d`, `30d` or `forever`; which are allowed depends on `kind`. |
| `rule_id` | `string` | no | The community rule the sanction cites. |
| `reason` | `string` | no | A private note for moderators, up to 300 characters. |

```json
{
  "handle": "grace",
  "kind": "timeout",
  "duration": "1d",
  "rule_id": "clrule1",
  "reason": "Second warning today."
}
```

**Example response** (`201`)

```json
{
  "id": "clsanction1",
  "kind": "ban",
  "endsAt": null
}
```

### `DELETE /api/v1/communities/{slug}/sanctions/{id}`

Lift a still-active sanction early, through the site's `lift`; the member is told. Answers `204`. `404` for an unknown sanction or one that already ended. Counts against the 30 sanctions a key an hour.

**Scope:** `manage:moderation` · **Success:** `204` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `liftSanction`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `slug` | path | string | yes | The community slug. |
| `id` | path | string | yes | The sanction id. |

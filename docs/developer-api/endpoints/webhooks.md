<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Webhooks

5 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/webhooks` | `manage:webhooks` | List webhook endpoints |
| `POST /api/v1/webhooks` | `manage:webhooks` | Create a webhook endpoint |
| `GET /api/v1/webhooks/{id}` | `manage:webhooks` | Get a webhook endpoint |
| `PATCH /api/v1/webhooks/{id}` | `manage:webhooks` | Update a webhook endpoint |
| `DELETE /api/v1/webhooks/{id}` | `manage:webhooks` | Delete a webhook endpoint |

## Reference

### `GET /api/v1/webhooks`

Your registered webhook endpoints.

**Scope:** `manage:webhooks` · **Success:** `200` · **Operation id:** `listWebhooks`

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "wh_1",
      "url": "https://example.com/hook",
      "events": [
        "post.created"
      ],
      "enabled": true,
      "createdAt": "2026-06-01T00:00:00.000Z"
    }
  ]
}
```

### `POST /api/v1/webhooks`

Register a URL to receive HMAC-signed event deliveries. The signing `secret` is returned once.

**Scope:** `manage:webhooks` · **Success:** `201` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `createWebhook`

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `url` | `string` | yes | HTTPS URL to deliver events to. |
| `events` | `string[]` | yes | Event names to subscribe to, or `["*"]` for all. See the Webhooks guide. |
| `description` | `string` | no | Optional label. |

```json
{
  "url": "https://example.com/hook",
  "events": [
    "post.created",
    "follow.created"
  ]
}
```

**Example response** (`201`)

```json
{
  "id": "wh_1",
  "url": "https://example.com/hook",
  "events": [
    "post.created",
    "follow.created"
  ],
  "enabled": true,
  "secret": "whsec_…",
  "createdAt": "2026-06-01T00:00:00.000Z"
}
```

### `GET /api/v1/webhooks/{id}`

One webhook endpoint with recent delivery attempts.

**Scope:** `manage:webhooks` · **Success:** `200` · **Operation id:** `getWebhook`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The webhook id. |

**Example response** (`200`)

```json
{
  "id": "wh_1",
  "url": "https://example.com/hook",
  "events": [
    "post.created"
  ],
  "enabled": true,
  "failureCount": 0,
  "recentDeliveries": []
}
```

### `PATCH /api/v1/webhooks/{id}`

Update the URL, subscribed events, description, or enabled state.

**Scope:** `manage:webhooks` · **Success:** `200` · **Operation id:** `updateWebhook`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The webhook id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `url` | `string` | no | New HTTPS URL. |
| `events` | `string[]` | no | New event subscription list. |
| `description` | `string` | no | New label. |
| `enabled` | `boolean` | no | Enable or disable deliveries. |

```json
{
  "enabled": false
}
```

**Example response** (`200`)

```json
{
  "id": "wh_1",
  "url": "https://example.com/hook",
  "events": [
    "post.created"
  ],
  "enabled": false
}
```

### `DELETE /api/v1/webhooks/{id}`

Permanently remove a webhook endpoint.

**Scope:** `manage:webhooks` · **Success:** `204` · **Operation id:** `deleteWebhook`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The webhook id. |

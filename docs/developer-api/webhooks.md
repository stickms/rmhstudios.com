# Webhooks

Subscribe a URL to receive HMAC-signed event deliveries when things happen on your account. Manage subscriptions with the `manage:webhooks` scope via `/api/v1/webhooks`.

```bash
curl -X POST https://rmhstudios.com/api/v1/webhooks \
  -H "Authorization: Bearer $RMH_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/hook","events":["post.created","follow.created"]}'
# → 201 { "id": "wh_…", "secret": "whsec_…", ... }   (secret shown once)
```

Subscribe to `["*"]` to receive every event.

## Events

<!-- BEGIN GENERATED: events -->

| Event | Fires when |
| ----- | ---------- |
| `post.created` | You created a post (via the API or in-app). |
| `post.deleted` | One of your posts was deleted. |
| `follow.created` | You followed another user. |
| `follow.deleted` | You unfollowed a user. |
| `like.created` | You liked a post. |
| `comment.created` | You commented on a post. |
| `bookmark.created` | You bookmarked a post. |

<!-- END GENERATED: events -->

## Delivery

Each event is delivered as a `POST` with a JSON body:

```json
{
  "id": "<deliveryId>",
  "event": "post.created",
  "created": "2026-06-30T10:00:00.000Z",
  "data": { "postId": "ck_…" }
}
```

and these headers:

| Header | Meaning |
| ------ | ------- |
| `X-RMH-Event` | The event name. |
| `X-RMH-Delivery` | Unique delivery id. |
| `X-RMH-Timestamp` | Unix seconds when the request was signed. |
| `X-RMH-Signature` | `t=<ts>,v1=<hmac>` — see below. |

A delivery succeeds on any `2xx`. Failures retry with exponential backoff (up to 6 attempts); an endpoint that keeps failing is auto-disabled. Inspect recent attempts with `GET /api/v1/webhooks/{id}`.

Deliveries are at-least-once: a timeout on our side after your handler committed will be retried. Use the `id` field to de-duplicate.

## Verifying signatures

The signature is `HMAC-SHA256` of `${timestamp}.${rawBody}` keyed by your endpoint `secret`, hex-encoded:

```js
import { createHmac, timingSafeEqual } from 'crypto';

function verify(secret, header, rawBody, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  const t = Number(parts.t);
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false; // replay guard
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected),
    b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

```{warning}
Verify the signature **and** the timestamp tolerance before trusting a payload,
and compute the HMAC over the **raw** request body — not over a re-serialised
parsed object, whose byte-for-byte output will differ and fail to match.
```

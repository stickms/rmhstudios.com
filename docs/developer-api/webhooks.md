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
| `personal_best.created` | You set a new personal best in a game. The payload carries the game, the new score and the previous one, never a rank. |
| `achievement.unlocked` | You unlocked an achievement. |
| `build.released` | You published a release of one of your builds. The payload carries the build slug, the version, the title and the release time. |
| `event.rsvp_changed` | You changed your own answer to an event. The payload carries the event, the date for a repeating event and your answer, never other guests. |
| `reading.finished` | You finished a book (shelved it as read for the first time). |
| `highlight.created` | You saved a highlight. The payload names the document and the highlight, never the highlighted text or your note. |
| `tournament.match_settled` | A tournament match you played was settled. You get won or lost, never your opponent. |

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

## Activity event payloads

Five events describe your own activity. Each is sent only to your own endpoints, is
emitted after the action has committed, and names no other member: no guest list, no
opponent, no highlighted text or note. A failed delivery queue never fails the action.
Endpoints subscribed to `["*"]` receive them too (from 2026-11-22).

The `data` object of each event:

| Event | `data` |
| ----- | ------ |
| `build.released` | `{ "buildSlug": "my-build", "version": "1.2.0", "title": "My build", "releasedAt": "2026-11-22T10:00:00.000Z" }` |
| `event.rsvp_changed` | `{ "eventId": "evt_…", "occurrenceAt": null, "status": "going" }`. `status` is `going`, `maybe`, `not_going` or `waitlisted`; `occurrenceAt` is the date for a repeating event, otherwise `null`. Sent only when your answer changes. |
| `reading.finished` | `{ "docKind": "library", "docKey": "the-book-slug", "title": "The Book", "finishedAt": "2026-11-22T10:00:00.000Z" }`. Sent the first time you shelve a book as read. |
| `highlight.created` | `{ "highlightId": "…", "docKind": "library", "docKey": "the-book-slug", "createdAt": "2026-11-22T10:00:00.000Z" }`. To read the text or note, call `GET /api/v1/me/highlights/{id}` with the `read:reading` scope. |
| `tournament.match_settled` | `{ "tournamentId": "…", "matchId": "…", "round": 2, "result": "won", "settledAt": "2026-11-22T10:00:00.000Z" }`. One event per player, each with their own `result` (`won` or `lost`). Byes send nothing. |

# RMH Studios Developer API

The RMH Studios REST API lets you build on the platform programmatically —
read your account, fetch the public feed, and post on your own behalf.

- **Availability:** the API requires an active **Starter** subscription or
  higher. Entitlement is re-checked on every request, so access tracks your
  subscription in real time.
- **Base URL:** `https://rmhstudios.com`
- **Format:** JSON request/response bodies; UTF-8.
- **Stability:** the current version is `v1`. Breaking changes ship under a new
  version prefix.

Manage keys and see a live reference in-app at **`/developer`**.

---

## Authentication

Every request must include an API key. Two equivalent options:

```http
Authorization: Bearer rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

```http
X-API-Key: rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

API keys authenticate as **your user account**. Writes are scoped to your own
account; you cannot act on behalf of others.

### Key security

- Keys are random 256-bit secrets formatted `rmh_live_<base62>`.
- The server stores **only a SHA-256 hash** of each key — the plaintext is
  shown **once** at creation and can never be retrieved again.
- Treat a key like a password. Keep it server-side; never embed it in a public
  client, repo, or browser bundle you don't control.
- Revoke a key any time from `/developer`; revocation takes effect immediately.
- If a subscription lapses or the account is suspended, all of that account's
  keys stop working until the subscription is restored.

---

## Rate limits

Limits are enforced **per key**, per minute:

| Tier          | Requests / minute |
| ------------- | ----------------- |
| Starter       | 120               |
| Pro / higher  | 600               |

Exceeding the limit returns `429 Too Many Requests` with a `Retry-After`
header (seconds) and `X-RateLimit-Limit`.

---

## Errors

Non-2xx responses use a stable envelope:

```json
{ "error": { "code": "subscription_required", "message": "The developer API requires an active Starter subscription or higher." } }
```

| Status | `code`                  | Meaning                                            |
| ------ | ----------------------- | -------------------------------------------------- |
| 400    | `invalid_request`       | Malformed body or parameters                       |
| 401    | `missing_key`           | No API key was provided                            |
| 401    | `invalid_key`           | Key is malformed, unknown, or revoked              |
| 403    | `subscription_required` | The owner has no active qualifying subscription    |
| 403    | `account_suspended`     | The owner's account is suspended                   |
| 429    | `rate_limited`          | Too many requests — back off and retry             |
| 500    | `internal_error`        | Unexpected server error                            |

---

## Endpoints

### `GET /api/v1/me`

Your account summary.

```bash
curl https://rmhstudios.com/api/v1/me \
  -H "Authorization: Bearer rmh_live_..."
```

```json
{
  "id": "ck...",
  "name": "Ada",
  "handle": "ada",
  "image": "https://...",
  "createdAt": "2026-01-02T03:04:05.000Z",
  "tier": "pro",
  "stats": { "coins": 1234, "xp": 5200, "level": 7, "followers": 12, "following": 30, "posts": 88 }
}
```

### `GET /api/v1/posts`

Your recent posts, newest first.

Query params: `limit` (1–50, default 20), `cursor` (ISO `createdAt` from a
previous `nextCursor`).

```bash
curl "https://rmhstudios.com/api/v1/posts?limit=20" \
  -H "Authorization: Bearer rmh_live_..."
```

```json
{
  "data": [
    { "id": "ck...", "content": "hello", "audience": "PUBLIC", "createdAt": "...",
      "metrics": { "likes": 3, "comments": 1, "reposts": 0, "views": 42 } }
  ],
  "nextCursor": "2026-06-20T10:00:00.000Z"
}
```

Paginate by passing the returned `nextCursor` as `cursor` on the next call;
`nextCursor` is `null` on the last page.

### `POST /api/v1/posts`

Create a text post on your account.

Body:

| Field      | Type     | Required | Notes                                   |
| ---------- | -------- | -------- | --------------------------------------- |
| `content`  | string   | yes      | 1–280 characters                        |
| `audience` | string   | no       | `PUBLIC` (default), `FOLLOWERS`, `PRIVATE` |

```bash
curl -X POST https://rmhstudios.com/api/v1/posts \
  -H "Authorization: Bearer rmh_live_..." \
  -H "Content-Type: application/json" \
  -d '{"content":"Posted via the API!"}'
```

```json
{ "id": "ck...", "content": "Posted via the API!", "audience": "PUBLIC", "createdAt": "..." }
```

Returns `201 Created`. Posting awards XP and progresses quests exactly like the
in-app composer. Suspended accounts receive `403 account_suspended`.

### `GET /api/v1/feed`

The public global feed. Only public, free, non-community posts are returned.

Query params: `limit` (1–50, default 20), `cursor` (ISO `createdAt`).

```bash
curl "https://rmhstudios.com/api/v1/feed?limit=20" \
  -H "Authorization: Bearer rmh_live_..."
```

```json
{
  "data": [
    { "id": "ck...", "content": "gm", "createdAt": "...",
      "author": { "id": "ck...", "name": "Ada", "handle": "ada", "image": "https://..." },
      "metrics": { "likes": 9, "comments": 2, "reposts": 1, "views": 120 } }
  ],
  "nextCursor": "2026-06-20T09:59:00.000Z"
}
```

---

## CORS

The `v1` endpoints send permissive CORS headers and answer `OPTIONS`
preflights, so they can be called from a browser. Because authentication is via
the bearer key (never cookies), this is not a CSRF surface — but it also means
**you must not ship a secret key in a public browser app**.

---

## Changelog

- **v1 (2026-06)** — initial release: `me`, `posts` (list + create), `feed`.

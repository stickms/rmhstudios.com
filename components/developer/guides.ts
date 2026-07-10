/**
 * Long-form wiki guide content for the developer API, as markdown strings.
 * Pure + client-safe (imported by the docs wiki). Reference/scope/error/event
 * tables are rendered dynamically from the registry instead of hard-coded here.
 */

export const GUIDES: Record<string, string> = {
  overview: `# RMH Studios Developer API

Build on RMH Studios programmatically — read your account and the public feed,
post on your own behalf, manage social actions, browse builds, blog, news and
leaderboards, and subscribe to real-time webhooks.

- **Base URL:** \`https://rmhstudios.com\`
- **Format:** JSON request/response bodies, UTF-8. Writes accept \`application/json\`.
- **Version:** the current version is \`v1\`. Breaking changes ship under a new version prefix.
- **Availability:** requires an active **Starter** subscription or higher. Entitlement is
  re-checked on **every** request, so access tracks your subscription in real time.
- **OpenAPI:** a machine-readable spec lives at
  [\`/api/v1/openapi.json\`](/api/v1/openapi.json) — point your codegen at it.

## Quickstart

\`\`\`bash
# 1. Create a key at /developer and copy it (shown once).
export RMH_KEY=rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx

# 2. Call the API.
curl https://rmhstudios.com/api/v1/me \\
  -H "Authorization: Bearer $RMH_KEY"
\`\`\`

Every response includes an \`X-Request-Id\` header — include it when contacting
support. Read on for authentication, scopes, rate limits, errors, pagination,
idempotency, and webhooks.
`,

  authentication: `# Authentication

Every request must include an API key. Two equivalent options:

\`\`\`http
Authorization: Bearer rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
\`\`\`

\`\`\`http
X-API-Key: rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
\`\`\`

API keys authenticate as **your user account**. Writes are scoped to your own
account; you cannot act on behalf of others.

## Key security

- Keys are random 256-bit secrets formatted \`rmh_live_<base62>\`.
- The server stores **only a SHA-256 hash** — the plaintext is shown **once** at
  creation and can never be retrieved again. The dashboard shows a non-secret
  4-character suffix so you can tell keys apart.
- Treat a key like a password. Keep it server-side; never embed it in a public
  client, repo, or browser bundle you don't control.
- **Scopes:** each key carries granular permissions — see *Scopes*. Grant the
  least privilege a given integration needs.
- **Expiry:** a key may be created with an expiry date; expired keys are rejected
  exactly like revoked ones.
- **Rotation:** rotate a key from \`/developer\` to issue a new secret while keeping
  the same key record — the old secret stops working immediately.
- **Revocation:** revoke a key any time from \`/developer\`; it takes effect at once.
- If a subscription lapses or the account is suspended, all of that account's keys
  stop working until the subscription is restored.
`,

  'rate-limits': `# Rate limits

Limits are enforced **per key**, per minute:

| Tier          | Requests / minute |
| ------------- | ----------------- |
| Starter       | 120               |
| Pro / higher  | 600               |

Image uploads have a tighter dedicated budget (15/min) and a tier-scaled daily
quota on top of the per-minute limit.

**Every** response carries rate-limit headers (not just \`429\`s):

| Header                  | Meaning                                              |
| ----------------------- | ---------------------------------------------------- |
| \`X-RateLimit-Limit\`     | Your per-minute ceiling.                             |
| \`X-RateLimit-Remaining\` | Requests left in the current window.                 |
| \`X-RateLimit-Reset\`     | Unix time (seconds) when the window resets.          |

A \`429 Too Many Requests\` also includes \`Retry-After\` (seconds). Back off and
retry after that delay.
`,

  pagination: `# Pagination

List endpoints are **keyset-paginated** for stable, efficient paging:

- Pass \`?limit=\` (1–50, default 20) to size a page.
- Each response is \`{ "data": [...], "nextCursor": "<opaque>" | null }\`.
- To fetch the next page, pass the returned \`nextCursor\` as \`?cursor=\`.
- \`nextCursor\` is \`null\` on the last page.

\`\`\`bash
# First page
curl "https://rmhstudios.com/api/v1/feed?limit=20" -H "Authorization: Bearer $RMH_KEY"

# Next page
curl "https://rmhstudios.com/api/v1/feed?limit=20&cursor=2026-06-20T09:59:00.000Z" \\
  -H "Authorization: Bearer $RMH_KEY"
\`\`\`

Treat the cursor as opaque — its format may change.
`,

  idempotency: `# Idempotency

Write requests (\`POST\`, \`PATCH\`, \`DELETE\`) accept an **\`Idempotency-Key\`** header
so a retry — after a network blip or timeout — never applies the action twice.

\`\`\`bash
curl -X POST https://rmhstudios.com/api/v1/posts \\
  -H "Authorization: Bearer $RMH_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: 5f3a9c2e-1b7d-4e2a-9c8b-2f1a0d6e4b3c" \\
  -d '{"content":"Posted exactly once"}'
\`\`\`

- The **first** request for a given key is processed and its response stored.
- A **retry with the same key and body** replays the stored response and adds
  \`Idempotency-Replayed: true\`. No second action occurs.
- Reusing a key with a **different body** returns \`409 idempotency_conflict\`.
- Stored responses expire after ~24 hours.

Generate a unique key (e.g. a UUID v4) per logical operation.
`,

  webhooks: `# Webhooks

Subscribe a URL to receive HMAC-signed event deliveries when things happen on
your account. Manage subscriptions with the \`manage:webhooks\` scope via
\`/api/v1/webhooks\`.

\`\`\`bash
curl -X POST https://rmhstudios.com/api/v1/webhooks \\
  -H "Authorization: Bearer $RMH_KEY" -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/hook","events":["post.created","follow.created"]}'
# → 201 { "id": "wh_…", "secret": "whsec_…", ... }   (secret shown once)
\`\`\`

Subscribe to \`["*"]\` to receive every event.

## Delivery

Each event is delivered as a \`POST\` with a JSON body:

\`\`\`json
{ "id": "<deliveryId>", "event": "post.created", "created": "2026-06-30T10:00:00.000Z", "data": { "postId": "ck_…" } }
\`\`\`

and these headers:

| Header             | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| \`X-RMH-Event\`      | The event name.                                      |
| \`X-RMH-Delivery\`   | Unique delivery id.                                  |
| \`X-RMH-Timestamp\`  | Unix seconds when the request was signed.            |
| \`X-RMH-Signature\`  | \`t=<ts>,v1=<hmac>\` — see below.                      |

A delivery succeeds on any \`2xx\`. Failures retry with exponential backoff
(up to 6 attempts); an endpoint that keeps failing is auto-disabled. Inspect
recent attempts with \`GET /api/v1/webhooks/{id}\`.

## Verifying signatures

The signature is \`HMAC-SHA256\` of \`\${timestamp}.\${rawBody}\` keyed by your
endpoint \`secret\`, hex-encoded:

\`\`\`js
import { createHmac, timingSafeEqual } from 'crypto';

function verify(secret, header, rawBody, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')));
  const t = Number(parts.t);
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false; // replay guard
  const expected = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
\`\`\`

Always verify the signature (and the timestamp tolerance) before trusting a payload.
`,

  changelog: `# Changelog

- **v1.2 (2026-06)** — Major overhaul:
  - Scoped + expiring API keys, key rotation, and a 4-char display suffix.
  - Standardized errors with \`type\` + \`request_id\`; \`X-RateLimit-*\` headers on every response.
  - \`Idempotency-Key\` support on all writes.
  - Outbound webhooks with HMAC-signed delivery + retries.
  - New endpoints: single post read/delete, like/unlike, comments, bookmarks,
    public user profiles + social graph, your followers/following/notifications/bookmarks,
    builds, blog, news, and game leaderboards.
  - Machine-readable OpenAPI 3.1 at \`/api/v1/openapi.json\`.
- **v1.1 (2026-06)** — Image upload: \`POST /api/v1/images\`; \`media_ids\` on \`POST /api/v1/posts\`.
- **v1 (2026-06)** — Initial release: \`me\`, \`posts\` (list + create), \`feed\`.
`,
};

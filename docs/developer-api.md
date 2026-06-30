# RMH Studios Developer API

The canonical, always-current documentation is the in-app **wiki** at
[`/developer/docs`](https://rmhstudios.com/developer/docs), generated from the
same endpoint registry that powers the API. A machine-readable **OpenAPI 3.1**
spec is served at [`/api/v1/openapi.json`](https://rmhstudios.com/api/v1/openapi.json)
— point your codegen at it. This file is a high-level summary for contributors.

- **Base URL:** `https://rmhstudios.com`
- **Version:** `v1` (breaking changes ship under a new prefix).
- **Availability:** an active **Starter** subscription or higher; entitlement is
  re-checked on every request.

## Authentication, scopes & keys

Send the key on every request, either way:

```http
Authorization: Bearer rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
X-API-Key: rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are random 256-bit secrets; only a SHA-256 hash is stored (plaintext shown
once, plus a 4-char display suffix). Keys carry **granular scopes**
(`read:profile`, `write:posts`, `manage:webhooks`, …; `*` / `read:*` / `write:*`
wildcards accepted), an optional **expiry**, and support **rotation** and
**revocation** from `/developer`. The scope catalog lives in
`lib/api/scopes.ts`.

## Conventions

- **Errors:** `{ "error": { "type", "code", "message", "request_id" } }`. Catalog
  in `lib/api/errors.ts`.
- **Request IDs:** every response carries `X-Request-Id` (echoed as `request_id`).
- **Rate limits:** per-key, per-minute (Starter 120, Pro+ 600). `X-RateLimit-Limit`,
  `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response; `Retry-After` on 429.
- **Pagination:** keyset — `?limit=&cursor=` → `{ data, nextCursor }`.
- **Idempotency:** writes honor the `Idempotency-Key` header (24h replay window).
- **CORS:** permissive; auth is via bearer key (never cookies), so it is not a
  CSRF surface — never ship a secret key in a public browser bundle.

## Endpoint groups

Account, Posts, Engagement (likes/comments/bookmarks), Feed, Users (profiles +
social graph), Media, Content (builds / blog / news), Leaderboards, Webhooks,
and Meta (`openapi.json`). The exhaustive, example-rich reference is in the wiki
and the OpenAPI document.

## Webhooks

Register endpoints with the `manage:webhooks` scope. Events
(`post.created`, `follow.created`, `like.created`, `comment.created`,
`bookmark.created`, plus deletions) are delivered as HMAC-signed `POST`s:

```
X-RMH-Signature: t=<unix-seconds>,v1=<hex hmac-sha256 of `${t}.${rawBody}`>
```

Failures retry with exponential backoff (up to 6 attempts); persistent failures
auto-disable the endpoint. The retry queue is drained by `POST /api/cron/webhooks`
(guarded by `INTERNAL_API_SECRET`).

## Architecture (for contributors)

- `lib/api/scopes.ts`, `lib/api/errors.ts` — pure catalogs (scopes, error taxonomy).
- `lib/api/developer-auth.server.ts` — key generation + authentication (scopes, expiry).
- `lib/api/with-developer-api.server.ts` — the wrapper: IP gate, auth, per-key
  rate limiting + headers, scope enforcement, idempotency replay, request IDs,
  and the bound `json`/`error`/`noContent` response helpers.
- `lib/api/registry.ts` — the single source of truth for endpoints; drives both
  the OpenAPI generator (`lib/api/openapi.ts`) and the wiki (`components/developer/wiki.tsx`).
- `lib/api/serializers.server.ts` — shared shaping + pagination.
- `lib/social/engagement.server.ts` — canonical like/comment/bookmark/follow/post
  mutations (counters, SSE, notifications, XP, quests, achievements, webhooks),
  shared by both the in-app routes and the API so they never drift.
- `lib/webhooks/` — `signature.ts` (pure HMAC + SSRF guard), `events.ts` (catalog),
  `emit.server.ts` (delivery + retry drain).
- Routes under `app/routes/api/v1/`; key management under `app/routes/api/developer/keys/`.

## Changelog

- **v1.2 (2026-06)** — Scoped/expiring keys + rotation; standardized errors with
  `type` + `request_id`; `X-RateLimit-*` on every response; idempotency keys;
  outbound webhooks; new endpoints (single post read/delete, like/comment/bookmark,
  public profiles + social graph, your followers/following/notifications/bookmarks,
  builds, blog, news, leaderboards); OpenAPI 3.1 at `/api/v1/openapi.json`; the
  single-page reference became the `/developer/docs` wiki.
- **v1.1 (2026-06)** — Image upload: `POST /api/v1/images`; `media_ids` on `POST /api/v1/posts`.
- **v1 (2026-06)** — Initial release: `me`, `posts` (list + create), `feed`.

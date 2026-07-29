# Changelog

## v1.2 — 2026-06

Major overhaul:

- Scoped + expiring API keys, key rotation, and a 4-char display suffix.
- Standardized errors with `type` + `request_id`; `X-RateLimit-*` headers on every response.
- `Idempotency-Key` support on all writes.
- Outbound webhooks with HMAC-signed delivery + retries.
- New endpoints: single post read/delete, like/unlike, comments, bookmarks, public user profiles + social graph, your followers/following/notifications/bookmarks, builds, blog, news, and game leaderboards.
- Machine-readable OpenAPI 3.1 at `/api/v1/openapi.json`.

## v1.1 — 2026-06

- Image upload: `POST /api/v1/images`; `media_ids` on `POST /api/v1/posts`.

## v1 — 2026-06

- Initial release: `me`, `posts` (list + create), `feed`.

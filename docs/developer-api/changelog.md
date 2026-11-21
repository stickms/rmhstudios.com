# Changelog

## Build releases — 2026-11

- `GET /api/v1/builds/{slug}` adds `releases` (up to 20, newest first; each has `version`, `changelog`, `commitHash`, `createdAt`).
- `versions` on the same response is deprecated. It still carries the same releases in its old shape (no `commitHash`); move to `releases`.

## Games — 2026-11

- New scope `read:games` (group Games).
- New endpoints: `GET /api/v1/games` (the catalogue; any valid key, no scope), `GET /api/v1/me/games`, `GET /api/v1/me/games/{gameId}/days`, `GET /api/v1/me/achievements` and `GET /api/v1/users/{handle}/games`. A member's playtime is shown to a key only as their playtime privacy setting allows, and is a `404` when hidden. Secret achievements are never listed.

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

# Changelog

## Reading — 2026-11

- New scopes `read:reading` and `write:reading` (group Reading). Keys with `read:*`, `write:*` or `*` already satisfy them, and `read:reading` returns your private notes, which are among the most personal data the API serves: give a script the narrowest scope it needs.
- New endpoints: `GET /api/v1/me/highlights` (newest first; `since` returns what was updated after an instant, oldest update first, for syncing), `PATCH` and `DELETE /api/v1/me/highlights/{id}`, `GET /api/v1/me/shelves`, `PUT` and `DELETE /api/v1/me/shelves/{slug}`, and `GET /api/v1/me/reading-goal`. Edits run the site's own functions. A highlight whose document was removed is returned with `document: null`. Deletions are not tombstoned: compare ids to find them. Highlights cannot be created through the API, and the goal is set on the site.

## Communities — 2026-11

- New scopes `read:communities` and `write:communities` (group Communities). Keys with `read:*`, `write:*` or `*` already satisfy them; a key that only holds `write:posts` does not gain community posting.
- New endpoints: `GET /api/v1/me/communities`, `GET /api/v1/communities/{slug}`, `GET /api/v1/communities/{slug}/rules` and `GET /api/v1/communities/{slug}/posts`. Visibility is the site's: a private community you are not in is a `404`, held and removed posts are not listed, and member lists are not exposed.
- `POST /api/v1/posts` accepts optional `communityId`, `flairId` and `media_alts`. With `communityId` it needs `write:posts` and `write:communities` (a key without the second gets `403 insufficient_scope` before anything runs) and runs the same checks as the site: membership, bans and timeouts (`endsAt` in the error), flair, image descriptions, verification and AutoMod. A held post answers `202` with `{ "status": "held", "id": … }`; an AutoMod removal answers `422`. A request without `communityId` is unchanged. Joining, leaving and moderation stay on the site.

## Events — 2026-11

- New scopes `read:events` and `write:events` (group Events). Keys with `read:*`, `write:*` or `*` already satisfy them.
- New endpoints: `GET /api/v1/events`, `GET /api/v1/events/{id}`, `GET /api/v1/events/{id}/attendees` (the host and co-hosts only), `GET /api/v1/me/events`, and `PUT` / `DELETE /api/v1/events/{id}/rsvp`. Visibility, capacity and the waitlist are the site's rules; repeating events are expanded into dates inside a window of at most 31 days, with skipped and moved dates applied. Creating and editing events stays in the site; there are no event webhooks.

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

## Build screenshots — 2026-11

- `GET /api/v1/builds/{slug}` adds `screenshots` (up to 8, in the order the creator set; each has `url`, `width`, `height`, `description`) and `thumbnailAlt` (the description of the cover, or `null`). Existing fields are unchanged. List endpoints carry the cover only.

## Quiz polls — 2026-11

- `poll` on `GET /api/v1/posts/{id}` adds `quiz` (boolean), `correctOptionId` and `explanation` (both `null` unless you may know the answer). A quiz's answer is secret until earned: you see it when you wrote the post, when you have voted on it, or once the poll has ended; the same rule as the site. A poll that is not a quiz has `quiz: false`.
- `POST /api/v1/posts` accepts an optional `poll` (`question`, `options`, `multiSelect`, `durationHours`) and, for a quiz, `quiz: true`, `correctIndex` (the zero-based position of the correct option) and an optional `explanation` (280 characters at most). A quiz is single choice with 2 to 4 options. A post may carry a poll and no text. A poll cannot be combined with `communityId`. Requests without `poll` are unchanged.

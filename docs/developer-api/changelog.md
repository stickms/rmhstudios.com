# Changelog

## Sprint 08 — 2026-11

<!-- s08-08 admin-api-oversight -->
- New error `key_suspended` (`403`, `authorization_error`): an admin suspended the key. The body carries a fixed message and never the reason, which only the key's owner sees on the developer keys page. Lifting the suspension restores the same key. Admins can also cap a key's per-minute limit; the lowest of the tier's, the key's own and the admin's limit applies.

<!-- s08-15 card-images -->
- Flashcards can carry a picture on each side. Cards in `GET`, `POST`, `PATCH` and `PUT /api/v1/me/decks/{id}/cards…` responses gain `frontImage` and `backImage`, each `{ url, alt }` or `null`.
- Set a picture with `frontImage` or `backImage` as `{ media_id, alt }` in a card body (`null` removes it). `alt` is required. A cloze card takes a back picture only, and a member can have pictures on at most 500 cards.
- `POST /api/v1/images` accepts an optional `surface=flashcard` field: the picture is stored for a flashcard (JPEG, PNG or WebP, up to 5 MB) and its `media_id` is what a card body takes. An unknown `media_id` is `invalid_media`.

<!-- s08-02 api-tournaments -->
- New scopes `read:tournaments` and `write:tournaments` (group Tournaments). Keys with `read:*`, `write:*` or `*` already satisfy them.
- New read endpoints: `GET /api/v1/tournaments` (public tournaments, filter `status` and `game`, cursor pagination), `GET /api/v1/tournaments/{id}` (an unlisted tournament is returned by id exactly when its site page shows it), `GET /api/v1/tournaments/{id}/matches` (the bracket by round and slot, players by public handle and display name, `scheduledAt`, `deadlineAt` and the open claim's state, never a claim's note) and `GET /api/v1/me/tournaments` (your entries with the match you are due to play).
- New write endpoints, each running the site's own function so every rule stays the site's: `POST /api/v1/tournaments/{id}/check-in`, `POST …/matches/{matchId}/claim` (`{ "winner": "me" | "opponent" }`), `POST …/claim/confirm` and `POST …/claim/withdraw`. They honour `Idempotency-Key`. Registration, withdrawal, creation and disputes are not in the API.
- New error `confirm_on_site` (`409`, `conflict_error`): no call through a key moves coins. Confirming a result that would complete a tournament with a prize pool (and a report that would confirm one) is refused by the site's own claim logic under its match lock, before anything settles; confirm it on the site. A report that would dispute an existing claim is a `409 conflict`. Test keys see the refusal by confirming match `match_test_final`.

<!-- s08-03 api-scheduled -->
- New scopes `read:scheduled` and `write:scheduled` (group Scheduled). Keys with `read:*`, `write:*` or `*` already satisfy them. A post into a community also needs `write:communities`.
- New endpoints: `GET /api/v1/me/scheduled` (your drafts, scheduled posts and time capsules, filter `kind`, cursor pagination), `GET`, `PATCH` and `DELETE /api/v1/me/scheduled/{id}`, `POST /api/v1/me/scheduled` and `POST /api/v1/me/scheduled/{id}/publish`. The body is the `POST /api/v1/posts` body (`media_ids` from `POST /api/v1/images`) plus `scheduledAt` (absent saves a draft; 2 minutes to 365 days ahead). The writes honour `Idempotency-Key`. Each row carries `held` (`community_sanction` or `image_descriptions`) when the publish checks would keep it back. Time capsules are listed but never created, changed, published or discarded through the API.
- New error `automod_held` (`422`, `invalid_request_error`): a post into a community that AutoMod would hold or flag for review is refused when you save or publish it, because a scheduled post is published without a hold. Post it directly so moderators can review it. At most 50 drafts and scheduled posts at once; the 51st is a `409 conflict`.

<!-- s08-12 webhook-activity -->
- New webhook events about your own activity: `build.released`, `event.rsvp_changed`, `reading.finished`, `highlight.created` and `tournament.match_settled`. Payloads carry only your own data (no other member, no highlighted text or note, no opponent); see the payload reference in the webhooks guide.
- Behaviour change, 2026-11-22: endpoints subscribed to `*` now receive these five events too. Subscribe to the named events instead if you want to keep the earlier set.

<!-- s08-14 api-search -->
- New scope `read:search` (group Search). Keys with `read:*` or `*` already satisfy it.
- New endpoints: `GET /api/v1/search/posts` (`q` 1–200 characters with the site's operators `from:@handle`, `in:community-slug`, `has:media`, `before:` and `after:`; `limit` 1–50; opaque `cursor`) and `GET /api/v1/search/people` (`q` 1–100, `limit` 1–25). Posts are the feed's shape, public and free only: never a private community's, never a member's who blocked you or whom you blocked or muted. People carry public profile fields only; banned, deleted and deletion-scheduled accounts are left out.
- Keyword search only. Each search counts as 3 requests against the daily quota, and the per-minute limit applies. Ranked results page through the best 120 matches; operators alone page newest first.

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

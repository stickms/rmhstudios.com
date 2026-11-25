# Changelog

## Sprint 14 — 2027-01

<!-- s14-15 homes-api -->
- New scopes `read:homes` and `write:homes` (group RMH Homes), both **explicit**: `*`, `read:*` and `write:*` do not grant them, and neither is part of a new key's default grant, because a house hunt is private. A key must list `read:homes` or `write:homes` itself; the key-creation pickers leave them unticked under "All".
- New endpoints, all answered with `Cache-Control: private, no-store`: `GET /api/v1/me/homes/saved?limit=&cursor=` (`read:homes`; your saved homes, newest saved first, 1 to 50, default 25; each with your `note`, `priceAlerts`, the listing's `title`, `listingType`, `propertyType`, `priceCents`, `beds`, `baths`, `sqft`, `city`, `state`, `status`, `url` and `available`, and the newest 10 `priceChanges`), `PUT /api/v1/me/homes/saved/{listingId}` (`write:homes`, honours `Idempotency-Key`; saves the home, idempotent, and sets `note` (up to 1,000 characters, `null` clears it) and `priceAlerts` through the site's own functions; a listing that is gone, removed by a moderator or posted by someone blocked either way is `404 not_found`), `DELETE /api/v1/me/homes/saved/{listingId}` (`write:homes`, `204`, idempotent) and `GET /api/v1/me/homes/searches` (`read:homes`; your saved searches with their criteria and no coordinates).
- A listing a moderator removed, or one by an author blocked either way, reads `available: false` with its listing fields `null` and no price changes; the saved row and your note are kept. An address, a search's `lat` and `lng`, and the internal price-notice time are never in the API.

<!-- s14-17 timeouts-everywhere -->
- `POST /api/v1/posts` and `POST /api/v1/posts/{id}/comments` now honour a moderator's timeouts, as the site does: a key whose owner is timed out of posting (or of replying) is refused with `403 feature_restricted` (`authorization_error`) before anything is written, and the message says when the timeout ends. `POST /api/v1/me/scheduled/{id}/publish` answers the same while the owner is timed out of posting, and a draft that falls due during a timeout stays a draft and publishes on the first pass after it ends. No field changed.

## Sprint 13 — 2026-12

<!-- s13-10 api-ladder -->
- New scopes `read:ladder` and `write:ladder` (group RMHLadder), both **explicit**: `*`, `read:*` and `write:*` do not grant them, and neither is part of a new key's default grant, because a job search is private: the default grant (`READ_SCOPES`) now leaves out every explicit scope, and the scopes it held before are unchanged. A key must list `read:ladder` or `write:ladder` itself; the key-creation pickers leave them unticked under "All".
- New endpoints, all answered with `Cache-Control: private, no-store`: `GET /api/v1/me/ladder/applications?limit=&cursor=&status=` (`read:ladder`; your applications, most recently changed first, 1 to 50, default 25; `status` is one status or several separated by commas), `GET /api/v1/me/ladder/applications/{id}` (`read:ladder`; the same plus `events`, the newest 50 timeline events), `PATCH /api/v1/me/ladder/applications/{id}` (`write:ladder`, honours `Idempotency-Key`; `status`, `appliedDate`, `followUpDate`, `interviewDates` and `notes`, through the site's own update, so the timeline gets one event per change) and `POST /api/v1/me/ladder/own-jobs` (`write:ladder`, `201`, honours `Idempotency-Key`; `title`, `company`, `link`, `location`, `remoteStatus`, `employmentType` and `deadline`, with the site's limit of 300 own jobs: `409 conflict` beyond it).
- An application is `{ id, status, appliedDate, followUpDate, interviewDates, notes, updatedAt, job }` where `job` is `{ id, title, company, location, remote, url, deadline, own }`. Offers and pay figures, resumes, the answer bank, referral names and contact e-mails are not in the API; a field outside the lists above is `400 invalid_request`. Another member's application is `404 not_found`.

<!-- s13-11 lists-on -->
- `PUT /api/v1/me/feeds/{id}/members` now also skips a member who left the list (they chose to be off it, and the owner cannot add them back): the handle comes back in `skipped` with the new reason `left`, beside `not_found` and `blocked`. Nothing else changes.

## Sprint 12 — 2026-11

<!-- s12-12 api-reviews -->
- New scope `write:study-reviews` (group Study): grade your flashcard reviews from your own tools. It is **explicit**: `*` and `write:*` do not grant it, and `write:study` keeps its meaning (decks and cards), so no existing key gains the power to change your review schedule; a key must list `write:study-reviews` itself. The key-creation pickers leave it unticked under "All".
- New endpoints, both acting as the key owner on the site's own review functions: `GET /api/v1/me/decks/{id}/review?limit=` (`read:study`; 1 to 50 cards, default 20) returns `{ data: [...] }`, the cards the site's review queue would show now for that deck, in its order and within its daily pace: id, kind, front, back, `clozeIndex`, `externalId`, pictures with their descriptions, occlusion masks and the `schedule` (`state` `new` or `review`, `dueAt`, `intervalDays`). Card sounds are never returned. `POST /api/v1/me/decks/{id}/cards/{cardId}/review` (`write:study-reviews`, honours `Idempotency-Key`) takes `{ "grade": "again" | "hard" | "good" | "easy" }` and answers `{ data: { dueAt, intervalDays, leech } }`. A grade is the same review as one in the browser (same schedule, history and leech rule) but earns no quest progress or XP. At most 120 grades a minute per account, as on the site.
- A card that is not in the deck, or not one you may read, is `404 not_found`; a suspended card is `409 conflict`.

<!-- s12-13 api-characters -->
- New scope `read:characters` (group RMHCharacters): read your RMHCharacters sheets and the party views you already have on the site. Read only; no write scope. It is an ordinary scope, so `*` and `read:*` include it.
- New endpoints, all `read:characters` and all answered with `Cache-Control: private, no-store`: `GET /api/v1/me/characters?limit=&cursor=` (your characters, newest edit first, each `{ id, system, name, level, summary, updatedAt }` where `summary` is the site's party summary: AC, hit points, conditions, Perception, speed and initiative; cursor pages, 1 to 50, default 25), `GET /api/v1/me/characters/{id}` (the same plus `sheet`, the stored sheet without its `portrait` image, and `portrait`, a boolean saying whether it had one), `GET /api/v1/me/parties` (the parties you run or play in) and `GET /api/v1/me/parties/{id}` (members' names, each member's character summary, the turn order and the current turn; never another player's sheet or notes, and never the invite code).
- Another member's character, a party you are not in (or have left, or were removed from) and an unknown id are all `404 not_found`.

## Sprint 10 — 2026-11

<!-- s10-12 api-events -->
- New scope `manage:events` (group Events): create, edit and cancel events you host, and post updates to the people coming. `write:events` keeps its meaning (RSVPs only), so an existing key gains no hosting power; keys with `manage:*` or `*` already satisfy the new scope, as for every `manage` scope.
- New endpoints, each acting as the key owner through the site's own event functions: `POST /api/v1/events` (`201`; `community` is a slug, the owner is always the host, a community event needs a moderator; at most 10 a minute, shared with the site), `PATCH /api/v1/events/{id}` (host or co-host), `POST /api/v1/events/{id}/cancel` (host only), `GET /api/v1/events/{id}/updates` (`read:events`) and `POST /api/v1/events/{id}/updates` (`201`, notifies the people coming exactly as on the site). Request fields are snake_case (`starts_at`, `venue_kind`, `repeat`, `repeat_tz`, ...).
- New error codes: `not_host` (`403`), `invalid_dates`, `invalid_venue_url` and `invalid_recurrence` (`400`), `canceled` and `already_canceled` (`409`). Occurrence overrides, co-host invitations and host rotation stay on the site.

<!-- s10-02 card-sound -->
- Flashcards can carry a recorded sound on each side, added on the site. Cards in `GET`, `POST`, `PATCH` and `PUT /api/v1/me/decks/{id}/cards…` responses gain `frontSound` and `backSound`, each `{ url, transcript, durationMs }` or `null`. Read-only: sounds are private to the member who recorded them, so they appear only on your own decks and are never written through the API.

<!-- s10-13 api-moderation -->
- New scope `manage:moderation` (group Moderation): moderate communities where you are a moderator, through the mod queue and timeouts and bans. It is the first **explicit** scope: `*` and `manage:*` do not grant it, so no existing key gains the power to ban members; a key must list `manage:moderation` itself. The key-creation pickers leave it unticked under "All".
- New endpoints, each acting as the key owner through the site's own moderation code, with the site's role checks and a row in the moderators' log (marked as made through the API; the public log does not show the marker): `GET /api/v1/communities/{slug}/modqueue` (`?view=pending|log`), `POST /api/v1/communities/{slug}/modqueue/{itemId}` (`decision` `approve` or `remove`, optional `rule_id` and `message`), `GET /api/v1/communities/{slug}/sanctions` (`?active=true|false`), `POST /api/v1/communities/{slug}/sanctions` (`201`; `handle`, `kind` `timeout` or `ban`, optional `duration`, `rule_id`, `reason`) and `DELETE /api/v1/communities/{slug}/sanctions/{id}` (`204`). The key owner must be a moderator of the community at the time of each call. At most 120 decisions and 30 sanctions per key per hour.
- New error codes: `not_moderator` (`403`), `rule_not_found` (`400`), `item_resolved` and `sanction_refused` (`409`).

<!-- s10-14 api-rmhtube -->
- New scopes `read:rmhtube` and `write:rmhtube` (group RMHTube), and seven endpoints: `GET /api/v1/me/rmhtube/watch-later` (oldest first, pages of up to 50 by `cursor`), `POST /api/v1/me/rmhtube/watch-later` (`url`, optional `title`; `201`, or `200` with the existing item when the URL is already saved), `DELETE /api/v1/me/rmhtube/watch-later/{id}` (`204`), `GET /api/v1/rmhtube/parties` (the upcoming watch parties you can see, as the site lists them), `GET /api/v1/rmhtube/parties/{id}`, `PUT /api/v1/rmhtube/parties/{id}/going` (`{ "going": true|false }`) and `GET /api/v1/me/rmhtube/stats` (your own watch statistics). Watch later keeps the newest 200 as on the site, so adding a 201st drops the oldest. A party that is link-only is visible only to its host and the people going; an attendee list is never returned. Pausing or clearing statistics and creating parties stay on the site.
- New error code: `party_closed` (`409`).

<!-- s10-18 race-fixes -->
- `held` on the `/api/v1/me/scheduled*` rows gains the value `automod`: the community's AutoMod rules would hold, flag or remove the draft (moderators are exempt, as in the post gate). The rule's name and text are never returned. Existing values are unchanged.

## Sprint 09 — 2026-11

<!-- s09-03 occlusion-cards -->
- Picture-occlusion flashcards. `kind` may be `occlusion`: a card with a front picture and `occlusion: { mode, masks }`, where `mode` is `hide-all` or `hide-one` and `masks` is 1 to 20 rectangles `{ id?, x, y, w, h, label }` in picture-relative units (0 to 1, at least 0.02 wide and tall, inside the picture). Each mask becomes one card; `front` is an optional prompt and `back` an optional note. Cards in `GET`, `POST`, `PATCH` and `PUT /api/v1/me/decks/{id}/cards…` responses gain `occlusion`, the masks of an occlusion card and `null` on every other kind. Send back the mask `id`s a read returned to keep each card's review history.
- `front` is optional when `kind` is `occlusion`; it stays required for every other kind. A picture a card claims must be a still image: an animated WebP is refused.

<!-- s09-08 api-feeds -->
- New scopes `read:feeds` and `write:feeds` (group Feeds). Keys with `read:*`, `write:*` or `*` already satisfy them.
- New read endpoints: `GET /api/v1/me/feeds` (your feeds, lists, saved searches and keyword alerts, filter `kind`, cursor pagination), `GET /api/v1/me/feeds/{id}` (one of yours, with the handles of its members) and `GET /api/v1/feeds/{id}/posts` (the posts of a feed or list you own or that is shared, as the site pages them for you, so blocks, mutes and quiet counts apply; needs `read:posts` as well). A saved search or keyword alert is `409 not_a_timeline`. Another member's private feed is `404`.
- New write endpoint: `PUT /api/v1/me/feeds/{id}/members` replaces a list's members by handle (at most 500). Handles that match no account, a deleted or banned account, or a member blocked in either direction are not added and come back in `skipped` with the reason `not_found` or `blocked`. It honours `Idempotency-Key`. Creating, renaming and deleting feeds stay on the site.
- New error `not_a_timeline` (`409`, `conflict_error`).

<!-- s09-06 community-pins -->
- `GET /api/v1/communities/{slug}/posts` posts gain `pinned` (boolean): `true` when a moderator pinned the post to the top of the community. The list itself is unchanged and still in newest-first order.

<!-- s09-09 api-practice -->
- New scope `read:practice` (group Practice). Keys with `read:*` or `*` already satisfy it. It is read-only: practice cannot be written through the API.
- New read endpoints, all for the key owner's own data: `GET /api/v1/me/typing` (RMHType profile per difficulty and lesson progress), `GET /api/v1/me/typing/daily` (daily-passage entries, `from` and `to` as `YYYYMMDD` or `YYYY-MM-DD`, at most 366 days, default the last 30), `GET /api/v1/me/typing/keys` (per-key counters with `msPerKey`, `errorRate` and `weakness`, only keys with at least 5 attempts, slowest first, optional `layout`), `GET /api/v1/me/music/practice` and `GET /api/v1/me/focus-sessions` (newest first, `since` as an ISO instant, cursor pagination, page size at most 100). The first page of focus sessions carries a `summary` with `weeklyGoalMinutes` and `timeZone`.
- Multiplayer match history, ghost replays and anything kept only in the browser are not in the API. Per-key figures stay empty while key statistics are switched off on the site.

<!-- s09-10 api-sync-deletions -->
- New `GET /api/v1/me/deleted?kind=&since=&cursor=&limit=`: your deletions of one kind (`highlight`, `deck`, `card`, `bookmark`, `shelf_entry`) after an instant, oldest first, as `{ id, kind, deletedAt }` with no content, at most 500 to a page. The scope is the read scope of the kind (`read:reading`, `read:study`, `read:bookmarks`). Deletions are kept 90 days; an older `since` is the new error `sync_window_expired` (`410`). A deck deletion is one item and none for its cards. See the new Syncing guide.
- `GET /api/v1/me/bookmarks` and `GET /api/v1/me/decks/{id}/cards` accept `since` (an ISO 8601 instant): bookmarks made, and cards created, after it. Without it they behave as before. Highlight and shelf-entry deletions are now reported too, where they were documented as not tombstoned.

<!-- s09-14 deletion-pause -->
- A key answers `403 key_suspended` while its owner's account is set to be deleted, and its owner's webhooks are disabled; signing back in cancels the deletion and restores both. No field or code changed.

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

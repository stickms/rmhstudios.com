# 17 — A timeout that holds on every reply and every chat

Surface: every place a member writes text other members read (comments, reviews, guides, threads, tips, guestbooks,
feedback, room and party chats, the developer API's posts and replies), Settings > Account status (unchanged list,
new sentence), the refusal shown when a timed-out member tries. Wave 6. No namespace of its own (the refusals
in `errors`, the restriction label in `c-moderation`). Site tier for the refusal copy; each surface keeps its look.

## User story

As a moderator who times a member out of replying for a week after harassment, I want the timeout to hold wherever
that member can write to others, so that they cannot carry on in a build's comments, a song's comments or a watch
party's chat instead.

## Requirements elicitation

- **What exists (verified):**
  - Per-feature timeouts: `FeatureRestriction` rows, `RESTRICTABLE_FEATURES = ['post', 'comment', 'message',
    'community', 'space', 'vibe', 'persona']` with English `FEATURE_LABELS` (`lib/moderation/restrictions.ts`), and
    `restrictionResponse(userId, feature)` / `isRestricted` (`lib/moderation/restrictions.server.ts`), which answers 403
    with an English `error`, a non-taxonomy `code: 'feature_restricted'`, `feature` and `until`.
  - **Where `comment` is checked:** two paths only — RMHark replies (`lib/feed/api/rmharks.$id.comment.server.ts`) and
    blog comments (`lib/blog/blog-comments.server.ts`). **`message`** is checked for direct messages
    (`lib/messages/api/messages.server.ts`, `lib/messages/send.server.ts`, voice, scheduled). `isRestricted` ("for
    socket hubs, workers") has **no caller**, so no hub checks anything.
  - Unchecked writers of text others read: build comments (`lib/api/routes/user-builds.$id.comments.server.ts`), build
    issues (`lib/builds/api/builds.$id.issues.server.ts`), Slice It song comments
    (`features/slice-it/api/slice-it.songs.$id.comments.server.ts`) and chart reviews
    (`features/slice-it/api/slice-it.charts.$id.reviews.server.ts`), game reviews
    (`lib/games/api/games.$id.review.server.ts`), guides (`lib/games/api/guides.server.ts`,
    `lib/games/api/guides.$id.server.ts`), game threads and posts (`lib/cards/api/games.hub.thread.server.ts`,
    `lib/games/api/games.hub.post.server.ts`), achievement tips (`lib/arcade/api/arcade.tips.server.ts`), guestbook
    entries (`lib/guestbook/api/profile.$id.guestbook.server.ts`), jam feedback
    (`lib/competitive/api/jams.$slug.entries.$entryId.feedback.server.ts`), prediction comments
    (`lib/predictions/api/predictions.$id.comments.server.ts`), RMHTube timed comments and commentary
    (`lib/rmhtube/api/rmhtube.timed-comments.server.ts`, `lib/rmhtube/api/rmhtube.commentary.server.ts`), deck
    suggestions (`lib/study/api/study.decks.$id.suggestions.server.ts`); chats: group chats
    (`lib/group-chat/api/group-chats.$id.messages.server.ts`), ride chat
    (`lib/rideshare/api/rideshare.rides.$id.messages.server.ts`), and in the hubs RMHTube room chat
    (`server/rmhtube/chat-handler.ts`, `C2S.ROOM_CHAT`), RMHBox lobby chat (`server/rmhbox/chat.ts`) and RMHStudy room
    chat (`server/socket-server/handlers/rmhstudy.ts`, `rmhstudy:room:chat`).
  - **The developer API bypasses timeouts:** `POST /api/v1/posts` (`app/routes/api/v1/posts.ts`) and `POST
    /api/v1/posts/{id}/comments` (`app/routes/api/v1/posts/$id/comments.ts`) call `createPost` / `createComment`
    (`lib/social/engagement.server.ts`) with no restriction check.
  - **Scheduled posts bypass a `post` timeout:** the site's "Publish now" checks `post`
    (`lib/scheduled/api/scheduled.$id.publish.server.ts`), but `publishScheduledPost`
    (`lib/scheduled/publish.server.ts`) does not, and it is what the due-post pass, `POST
    /api/v1/me/scheduled/{id}/publish` (`publishScheduledForKey` in `lib/api/v1/scheduled.server.ts`), recurring
    community posts (`lib/communities/recurring.server.ts`), read-alongs (`lib/communities/read-along.server.ts`) and
    time capsules (`lib/posts-plus/capsules.server.ts`) all call. A member timed out of posting still publishes every
    post they queued before the timeout.
  - **RMHBox minigame text:** feature 01 (wave 1) adds Identity Crisis, whose `ask` input is free text every player
    in the lobby reads (`server/rmhbox/minigames/identity-crisis/handler.ts`); like lobby chat it is a `message`
    surface.
- **Decisions:**
  - **Which feature gates what:** every reply-like or public text write above checks `comment` ("Replying"); every chat
    above checks `message` ("Direct messages" is relabelled "Messages and chats" in English with a **new** key, since
    the shipped wording changes); `POST /api/v1/posts` checks `post` and its comments `comment`;
    `publishScheduledPost` checks `post` for the draft's author before it publishes, and a restricted author's due
    draft is left unpublished and retried on a later pass, exactly as its community gate already leaves a draft whose
    author is under a community timeout (its own comment: "a ban or timeout lifts on its own and the next pass
    publishes"); the developer API's publish answers 403 `feature_restricted`. Identity Crisis's `ask` from a member
    timed out of `message` is ignored as a timed-out ask (the turn passes), with the hub's error event telling only
    that player. No new restrictable
    feature (ids are stored; the list only grows when a moderator needs a new one).
  - **One registry:** `RESTRICTION_ENFORCEMENT_PATHS` (new, `lib/moderation/restriction-paths.ts`): each file and the
    feature it must check, held by a source scan that requires a real `restrictionResponse(` / `isRestrictedIn(` call
    naming that feature, and a second scan that fails any file creating a member-text row through the models above
    (`buildComment`, `songComment`, `gameReview`, …) that is not listed.
  - **Hubs:** a hub-safe reader `isRestrictedIn(db, userId, feature, now)` in `lib/moderation/restrictions-core.ts`
    (new, taking the hub's own Prisma client, the `activeRestrictionWhere` rule moved there and re-exported), with a
    30-second per-process cache; a refused chat line gets the hub's existing error event with the new code.
  - **Refusals with codes:** `FEATURE_RESTRICTED` ("This is restricted on your account. See Settings, Account status")
    and `FEATURE_RESTRICTED_UNTIL` ("This is restricted on your account until {{endsAt}}. See Settings, Account
    status") through `refusalBody`; the body keeps `feature` and `until` for existing clients; the developer API answers
    in its own envelope with `error.code: 'feature_restricted'`.
  - **What is not gated:** writes only the writer reads (notes, drafts), votes and reactions, reports.

## Functional requirements

1. FR-1 `lib/moderation/restrictions-core.ts` (new) and `lib/moderation/restriction-paths.ts` (new);
   `restrictions.server.ts` uses the core rule and returns `refusalBody(...)`.
2. FR-2 The `comment` / `message` / `post` checks in every file listed above, before any write and after
   authentication; the three hubs through `isRestrictedIn`.
3. FR-3 The two developer API routes, refusing with the developer envelope; `publishScheduledPost`'s `post` check
   (one place covers the due-post pass, `/api/v1/me/scheduled/{id}/publish`, recurring posts, read-alongs and
   capsules); the Identity Crisis `ask` check in the RMHBox hub through `isRestrictedIn`.
4. FR-4 `FEATURE_LABELS` / the account-status label for `message`: a new key `restriction-feature-message-chats`
   (the old key stays for one release, unused).
5. FR-5 Refusal codes under `// s14-17 timeouts-everywhere`; their `errors.json` keys.

## Non-functional requirements

- **Order:** the check runs after the session and before validation-heavy work, never after a write.
- **Performance:** one cached read per request (the existing 30 s cache); hubs cache per process for 30 s.
- **Hubs never import the web tier:** `restrictions-core.ts` imports only Prisma types and plain code
  (`lib/__tests__/server-bundle-copies.test.ts` passes).
- **Query shapes (verify against the schema):** `FeatureRestriction.expiresAt` and `liftedAt` are optional;
  `activeRestrictionWhere`'s `OR` of `expiresAt: null` / `gt: now` is valid; reuse it, do not rewrite it.

## Data model and API

No schema change. Refusals gain `code` values; `/api/v1` answers 403 `feature_restricted` where it did not before.

## Testing requirements

- Main suite `lib/moderation/__tests__/restriction-paths.test.ts`: both source scans.
- Main suite `lib/moderation/__tests__/restrictions-core.test.ts`: active, expired, lifted and permanent rows; the cache.
- Main suite `lib/moderation/__tests__/restriction-refusals.test.ts`: the body carries the code, `endsAt` and the old
  `feature` / `until` fields.
- One test per hub (`server/rmhtube/__tests__/`, `server/rmhbox/__tests__/`, `server/socket-server/handlers/__tests__/`)
  that a restricted member's chat line is refused and not broadcast.
- `lib/__tests__/developer-api.test.ts` (or the v1 posts tests) for the 403; the error-code catalogue and the
  `serverError` ratchet.
- `lib/scheduled/__tests__/` (the existing publish tests, extended): a restricted author's due draft stays a draft and
  is not counted as published; it publishes after the restriction ends.

## Acceptance criteria

- [ ] A member timed out of replying cannot comment on a build, a song, a review, a guide, a thread, a tip or a
      guestbook, and sees "This is restricted on your account until …".
- [ ] A member timed out of messages cannot chat in an RMHTube room, an RMHBox lobby, a study room, a group chat or a
      trip.
- [ ] The developer API refuses a timed-out member's post or reply.
- [ ] A post a member scheduled before a `post` timeout is not published while the timeout lasts, and is published by
      the first pass after it ends.
- [ ] A new writer of comment text that skips the check fails the source scan.

## Out of scope

New restrictable features, restricting reactions or votes, community-level timeouts (their own system).

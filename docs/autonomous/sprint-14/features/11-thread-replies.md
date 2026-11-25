# 11 — Hear about replies to your game threads and comments on your songs

Surface: the inbox (two new notices), a game discussion thread ("Mute this thread"), Settings > Notifications (the
existing Replies category governs both). Wave 5. Namespace `thread-replies`. The inbox and settings on the site tier;
the thread page in the games library's own look.

## User story

As a member who started a discussion about a game, or uploaded a song to Slice It, I want to be told when someone
replies to my thread or comments on my song, so that a conversation I started does not go unanswered because I never
went back to look.

## Requirements elicitation

- **What exists (verified):**
  - Game discussion threads: `createThread` and `createPost` in `lib/games/hub.server.ts` (posts through
    `lib/games/api/games.hub.post.server.ts`, threads through `lib/cards/api/games.hub.thread.server.ts`), shown by
    `components/steam/HubPage.tsx` and `components/steam/ThreadPage.tsx`. **Only the thread's author is told**, and
    badly: `createPost` calls `notifyHubReply` (`lib/cards/notify.server.ts`, after the transaction), a `REPLY` row
    with `entityType: 'hub-thread'`, `dedupeUnread`, and a hard-coded English preview (`` `replied to “${title}”` ``)
    that is not a `notice()` key, so it is English in every locale; it checks no block, mute or thread mute. Members
    who posted earlier in the thread are never told. (The design pass's "no notification of any kind" was wrong: the
    call lives in `lib/cards/`, not `lib/games/`.)
  - Slice It song comments: `POST /api/slice-it/songs/$id/comments`
    (`features/slice-it/api/slice-it.songs.$id.comments.server.ts`) writes a `SongComment`; the uploader is never told.
  - `createNotification` (`lib/notifications.server.ts`) takes a `category` (here `replies`, so Settings >
    Notifications > Replies governs both), `dedupeUnread`, and a `conversationKey` checked against
    `ConversationPref` before anything is written (`getConversationPref`, `shouldDeliver`,
    `lib/notify/conversation-prefs.server.ts`, scopes `CONVERSATION_SCOPES = ['dm', 'group', 'space', 'post']`).
  - Notices are keys (`notice()`, `NOTICE_TEMPLATES` in `lib/notifications/notice-keys.ts`, a preview case in
    `components/feed/notice-previews.ts`, a system label in `components/feed/notification-labels.ts`).
  - Blocks: `getBlockedAuthorIds` and the mute readers (`MUTE_READ_PATHS`) are how other notices skip members.
- **Decisions:**
  - **Game thread replies:** `notifyHubReply` is replaced (not added to: one notice per recipient, never two) by
    `notifyThreadReply`. When a post is added, the thread's author and the authors of the thread's earlier posts
    (distinct, the 50 most recent) are told `game-thread-reply`: "{{name}} replied in {{title}}", linked to the thread
    page at the new post, type `REPLY` (so its category is `replies`), keeping `entityType: 'hub-thread'` and
    `entityId: threadId` so an unread row the old code wrote is refreshed by `dedupeUnread`, not duplicated (a burst
    from one poster refreshes one row). `notifyHubReply` is deleted with its test case moved to the new module; the
    other exports of `lib/cards/notify.server.ts` are untouched. Skipped: the
    poster, members blocked either way with the poster, members who muted the poster, banned or pending-deletion
    members, and members who muted the thread.
  - **Mute this thread:** a new conversation scope `game-thread` (`game-thread:<threadId>`) in `CONVERSATION_SCOPES`
    and its key pattern; the thread page gets "Mute this thread" / "Unmute this thread" through the existing
    conversation-preference contract (`lib/preferences/conversation.contract.ts`). Starting a thread or posting in it
    does not mute or unmute anything.
  - **Song comments:** the uploader is told `song-comment`: "{{name}} commented on {{title}}", linked to Slice It with the
    song open, category `replies`, `dedupeUnread`, skipped for the uploader's own comment, a block either way, a mute,
    a taken-down or private song.
  - **Volume:** at most 50 recipients per post, written in the request after the post commits (no fan-out job is
    needed at that bound); failures are logged and never fail the post.
  - **Text:** the thread title and song title are params (member text, never translated); the post's text is not in
    the notice.

## Functional requirements

1. FR-1 `lib/games/thread-notices.server.ts` (new): `threadReplyRecipients(threadId, posterId)` and
   `notifyThreadReply(post)`; called by `createPost` after its transaction in place of `notifyHubReply`, which is
   removed from `lib/cards/notify.server.ts` (and from `lib/games/__tests__/hub.server.test.ts`'s mock).
2. FR-2 `features/slice-it/engine/comment-notices.server.ts` (new): `notifySongComment(comment)`; called by the
   comments `POST` after the create.
3. FR-3 `lib/notify/conversation-prefs.server.ts`: `'game-thread'` in `CONVERSATION_SCOPES` and
   `CONVERSATION_SCOPE_KEY`; `createNotification` calls pass `conversationKey: 'game-thread:<id>'`.
4. FR-4 Notices under `// s14-11 thread-replies` in `notice-keys.ts` (templates and param types),
   `notice-previews.ts`, `notification-labels.ts` (labels `game_thread`, `song`) and its test.
5. FR-5 `components/steam/ThreadPage.tsx`: the mute control (`components/steam/ThreadMuteButton.tsx`, new).

## Non-functional requirements

- **Notifications** go through `createNotification` with `notice()`, so preferences, quiet hours and push apply.
- **Blocks and mutes** are honoured both ways for every recipient (a test per rule).
- **Performance:** one read of recipient ids (`gameThreadPost.findMany({ where: { threadId }, distinct: ['authorId'],
  orderBy: { createdAt: 'desc' }, take: 50 })` plus the thread's author), one block read, one mute read.
- **Query shapes (verify against the schema):** `GameThreadPost.authorId` and `GameThread.authorId` (not `userId`);
  `Song.uploadedBy` (not `userId`); `distinct` with `orderBy` on `createdAt`, which is required.

## Data model and API

No schema change. Mute through the existing `PUT /api/preferences/conversation` (scope `game-thread:<id>`).

## Testing requirements

- Main suite `lib/games/__tests__/thread-notices.test.ts`: recipients (author and earlier posters, capped at 50,
  poster excluded), blocks either way, mutes, a muted thread, banned and pending-deletion members.
- Main suite `features/slice-it/engine/__tests__/comment-notices.test.ts`: the uploader is told; own comment, block,
  mute and taken-down song are not.
- `lib/notify/__tests__/post-conversation-mute.test.ts` (the model for the new scope), `lib/moderation/__tests__/mute-read-paths.test.ts`, `lib/notifications/__tests__/notice-keys.test.ts`,
  `lib/__tests__/notice-preview-ratchet.test.ts`, `components/feed/__tests__/notification-labels.test.ts`.

## Acceptance criteria

- [ ] A reply in a member's game thread puts "Dana replied in Best build for act 2" in their inbox, linked to the
      reply, in the reader's language, as exactly one row (not the old English row as well).
- [ ] Members who posted earlier in the thread are told too, unless they muted the thread.
- [ ] A comment on a member's song tells them; their own comment does not.
- [ ] Turning off Replies in Settings > Notifications stops both.

## Out of scope

Mentions in game threads, e-mail digests, notices for guide comments (guides have none), notices to song
commenters about later comments.

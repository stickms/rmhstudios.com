# 03 — Mute a conversation and pin a reply

Surface: the post menu (`RMHarkOverflowMenu.tsx`, `FeedRowMenu.tsx`), the
reply list on a post (`/u/$userid/post/$postid`, `/thread/$rootId`) and
`/settings/notifications`. Wave 5. Namespace `conversation-controls`.

## User story

As a member whose post took off, or who replied once in a busy thread, I want
to stop notifications from that one conversation without muting people or
turning off reply notifications everywhere — and, as the author, to pin the one
reply that answers the question to the top — so that a single popular post
does not bury my inbox and readers find the best answer first.

## Requirements elicitation

- **What exists (verified):** per-conversation notification control (B14)
  exists for chats only: `ConversationPref` with scope keys `dm:`, `group:`,
  `space:` (`lib/notify/conversation-prefs.server.ts`; All / Mentions / None
  with `muteUntil`), consulted by `lib/notify/dispatch.server.ts` when a caller
  passes `scopeKey`. Feed notifications (replies, likes, reposts, mentions on a
  post) go through `createNotification` in `lib/notifications.server.ts`,
  which checks only the global category preferences. The post menu offers
  "Mute" for the **author** (`toggleMuteApi`), which hides all their posts —
  the wrong size for "stop telling me about this thread". Authors can hide a
  reply (`rmharks.$id.comment.$commentId.hide.server.ts`, `HiddenReplies`), but
  cannot pin one: `RMHark.pinnedAt` pins a post to a profile, not a reply to a
  post.
- **Decisions:** reuse `ConversationPref` with a new scope `post:<rootId>`
  (the thread root, so one choice covers every reply in it), rather than a new
  table. The three-way choice is kept: All, Mentions only (only replies and
  mentions that address you), None. Muting is open to anyone (author or
  participant); a mute lasts until turned off, or 24 hours / 7 days. Pinning
  is for the post's author only, one pinned reply per post, a column on
  `RMHark`.

## Functional requirements

1. FR-1 "Mute this conversation" in the post menu (on the post detail and on
   feed rows) opens a small menu: Mentions only, Mute for 24 hours, Mute for 7
   days, Mute until I turn it back on. A muted conversation shows "Unmute
   conversation" instead.
2. FR-2 While muted (`None`), no notification of kind reply, like, repost,
   quote or comment-like is created for the member about any post or reply in
   that thread; with Mentions only, replies addressed to the member (a direct
   reply to their reply, or an @mention) still arrive. Push follows the same
   rule because it is sent from the notification.
3. FR-3 The scope is the thread root (`threadRootId ?? id`); muting from any
   reply mutes the whole conversation.
4. FR-4 `/settings/notifications` gains a "Muted conversations" section: each
   muted post (first line of its text, author, until when) with Unmute; at
   most 50 shown, newest first, with "Load more".
5. FR-5 The post author sees "Pin reply" in a reply's menu; the pinned reply
   is shown first under the post with a "Pinned by the author" label;
   pinning another replaces it; "Unpin" removes it. Hidden or deleted replies
   cannot be pinned, and hiding or deleting the pinned reply unpins it.
6. FR-6 The developer API's post serializer and the post detail loader expose
   `pinnedReplyId`, so other clients can show it.

## Non-functional requirements

- **Performance:** the mute check adds one indexed read per notification
  (`ConversationPref` by primary key `(userId, scopeKey)`), cached for the
  request the same way `loadPrefs` is; fan-out paths that notify many members
  at once (a popular post's likes) look up all recipients' prefs in one
  `findMany` (`getConversationPrefs` already takes many keys).
- **Security:** mute endpoints are session-only and only write the caller's own
  row; the scope key is built server-side from a post the caller can see
  (`viewerVisiblePostWhere` in `lib/feed/audience.server.ts`), never accepted
  raw. Pin is author-only (checked on the server against `RMHark.userId`),
  rate-limited `write`, and the reply must belong to the post.
- **Accessibility:** the mute choices are menu items with clear names ("Mute
  this conversation for 7 days"); the pinned label is text, not only an icon.
- **i18n:** strings in `conversation-controls`; until-dates through
  `Intl.DateTimeFormat`.
- **Steel:** menus are overlays (the only raised surface); the pinned reply is
  a row on the rule like the others, with a `t-meta` label — no box, no tint.

## Data model and API

- `ConversationScope` gains `post` in `lib/notify/conversation-prefs.server.ts`
  (and its key regex); no migration for the mute.
- `prisma/schema/social.prisma`: `RMHark.pinnedCommentId String?
  @db.VarChar(64)` (no foreign key, like `communityFlair` ids elsewhere;
  cleared in the hide and delete handlers). Migration
  `20261123050000_s03_pinned_reply`.
- `createNotification` input gains optional `conversationKey`; when present it
  runs the same All/Mentions/None gate as `dispatch.server.ts`
  (`shouldDeliver`). Callers that notify about a post pass
  `scopeKeyFor('post', rootId)` and say whether the recipient was addressed:
  `lib/feed/api/rmharks.$id.comment.server.ts`, the like, repost and quote
  handlers, the comment-like handler and `lib/feed/notify-mentions.server.ts`.
- Contract `lib/feed/conversation-controls.contract.ts`; modules
  `lib/feed/api/rmharks.$id.mute.server.ts` (GET state, PUT choice, DELETE),
  `lib/feed/api/rmharks.$id.pin-reply.server.ts` (PUT `{ commentId }`,
  DELETE), `lib/notify/api/settings.muted-conversations.server.ts` (GET list).

## Testing requirements

- Main suite `lib/notify/__tests__/post-conversation-mute.test.ts`: muted
  (None) member gets no reply/like notification; Mentions only still gets a
  direct reply and a mention; muting from a reply mutes the root; expired
  `muteUntil` delivers again; a member cannot mute a post they cannot see.
- Main suite `lib/feed/__tests__/pin-reply.test.ts`: only the author can pin;
  a reply from another post is refused; hiding or deleting the pinned reply
  clears it.
- Product suite `lib/feed/__tests__/reply-order.product.test.ts`: the pinned
  reply sorts first, hidden replies still go to the disclosure.

## Acceptance criteria

- [ ] Muting a post for 7 days stops its reply and like notifications, and
      they resume after unmuting.
- [ ] With Mentions only, a direct reply still notifies.
- [ ] The muted conversation appears in settings and can be unmuted there.
- [ ] A pinned reply shows first with its label; hiding it unpins it.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Muting by keyword (muted words exist), pinning more than one reply, pinning in
chats (chat pins exist).

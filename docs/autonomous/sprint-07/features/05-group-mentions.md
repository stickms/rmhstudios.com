# 05 — Mentions in group chats

Surface: the group composer, group message rows, the group info dialog and
notifications. Wave 4. Namespace `group-mentions`.

## User story

As a member of a busy group chat that I keep on "Mentions only", I want to be
told when someone writes `@me`, and to find the messages that mention me, so
that I can keep the group quiet without missing the one question meant for me.

As someone writing in a group, I want to pick a member from a list as I type
`@`, so that I spell their handle right.

## Requirements elicitation

- **What exists (verified):**
  - Every conversation has a three-way notification mode — All, Mentions only,
    None — stored in `ConversationPref` (`mentionsOnly`, `muteUntil`,
    `prisma/schema/messaging.prisma`) with `scopeKey` `group:<id>`, decided by
    `shouldDeliver(pref, isMention)` (`lib/notify/conversation-prefs.server.ts`:
    mute outranks mentions; no row means deliver).
  - **Nothing detects a mention in a group message.** `sendGroupMessage`
    (`lib/messages/send.server.ts`) creates the message, publishes it and bumps
    unread counts (`notifyUser`, `lib/message-events`); it creates no
    notification for anyone, so "Mentions only" in a group is a mode with no
    source. `grep "group:" lib --include=*.ts` finds no caller passing a group
    `scopeKey` to `createNotification` or `dispatch`.
  - The feed's mention machinery: `parseHandles` (`lib/feed/mentions.ts`),
    `searchMentionUsers` (`lib/feed/mention-search.server.ts`), the feed
    mention notifier (`lib/feed/notify-mentions.server.ts`, which already gates
    on `shouldDeliver`), and the composer's mention picker
    (`components/feed/compose/*`).
  - `createNotification` (`lib/notifications.server.ts`) accepts `scopeKey` and
    `addressed` and applies conversation prefs, preferences, quiet hours and
    push.
  - The group composer is `components/feed/group-chat/GroupComposerBar.tsx`
    (with `useGroupComposer.ts`); rows are `GroupMessageRow.tsx`.
- **Decisions:**
  - A mention is `@handle` of a **current member** of the group, parsed with
    `parseHandles` from the message `content` at send time. Group messages
    cannot be edited today (`lib/messages/mutations.server.ts` covers direct
    messages only and says a group route would reuse it), so there is no edit
    path to handle; `recordMentions` documents that a future group edit must
    call it with the previous content and notify only newly mentioned members.
  - Mentions are stored in a new `ChatMention` table (message, chat, mentioned
    member) so "Your mentions" is one indexed read.
  - **Notification:** one `SYSTEM` notification per mentioned member, label
    `group-mention` ("{{name}} mentioned you in {{group}}"), created with
    `createNotification({ scopeKey: 'group:<id>', addressed: true, … })`, so All
    and Mentions-only deliver and None stays silent (mute outranks mentions). A
    member is never notified of their own mention, nor of a mention by someone
    they blocked or who blocked them (`UserBlock`, either direction), nor while
    banned.
  - At most **10 members** notified per message (the first ten distinct
    handles); more mentions still highlight but do not notify — a cap against
    spam, with the cap in the pure module.
  - No `@everyone`/`@here` (a broadcast is a moderation question for the
    group-admin model; out of scope).
  - **Picker:** typing `@` in the group composer offers the group's members
    (filtered client-side from the member list the group view already has;
    no server search), keyboard-operable listbox with `aria-activedescendant`
    (the sprint 05 13 pattern).
  - **Rendering:** a mention of a member renders as a link to their profile;
    a mention of the viewer is marked (weight 600, not a colour fill — R1);
    handles of non-members render as plain text.
  - **"Your mentions"** in the group info dialog lists the latest 50 messages
    that mention the viewer, each opening the thread at that message.
  - A deleted message's mention rows go with it (`onDelete: Cascade`); a
    notification pointing at a missing message renders as feed mentions of a
    deleted post do.

## Functional requirements

1. FR-1 Mention parsing and storage on send, for group messages only.
2. FR-2 Notifications as decided, respecting the conversation mode,
   preferences, quiet hours, blocks and bans.
3. FR-3 The `@` picker in `GroupComposerBar`.
4. FR-4 Mention rendering in `GroupMessageRow`.
5. FR-5 "Your mentions" in the group info dialog (React Query, paged by
   cursor).
6. FR-6 The conversation options sheet's "Mentions only" choice, which exists,
   now describes what counts as a mention in a group ("When someone writes
   your @handle").

## Non-functional requirements

- **Correctness:** parsing is pure; the notifier
  runs after the message transaction commits, never inside it; a failure to
  notify never fails the send.
- **Performance:** at most one membership read and one `createMany` per send;
  notifications created with bounded concurrency (`lib/async-pool.ts`).
- **Security:** a mention never reveals membership to a non-member (the
  notification is only for members); the mentions list is the viewer's own.
- **Privacy:** erasure deletes `ChatMention` rows that name the member; rows
  where the deleted member wrote the message stay with the message (it is kept
  as "Deleted user").
- **Steel:** the marked mention is text weight, never a tinted pill.
- **i18n:** `group-mentions`; the label in `feed.json` under the anchor.

## Data model and API

- `ChatMention { messageId, chatId, userId, createdAt @default(now()) }`,
  `@@id([messageId, userId])`, `@@index([userId, chatId, createdAt(sort:
  Desc)])`, relations to `ChatMessage` (cascade) and `User` (cascade),
  `@@map("chat_mention")`; `User` back-relation under the auth anchor.
  Migration `20261127040000_s07_group_mentions`.
- `lib/group-chat/mentions.ts` (pure: `mentionTargets(content, members,
  senderId)`, `MAX_NOTIFIED_MENTIONS = 10`), `mentions.server.ts`
  (`recordMentions`, `notifyMentions`, `listMyMentions`,
  `groupMentionErasureOps`), `mentions.contract.ts`.
- `send.server.ts`: one call after a successful group send.
- Module `lib/group-chat/api/group-chats.$id.mentions.server.ts` (GET).

## Testing requirements

- Main suite `lib/group-chat/__tests__/group-mentions.test.ts`: send with two
  mentions notifies two; non-member handle ignored; self-mention ignored;
  blocked pair skipped both ways; banned recipient skipped; muted group silent;
  mentions-only group delivers; duplicate handles notify once; the 10-cap.
- Main suite `lib/account/__tests__/group-mentions-erasure.test.ts`.
- Product suite `lib/group-chat/__tests__/mentions.product.test.ts` for the
  parser (punctuation, duplicates, case, handles inside URLs not matched).
- Component test for the picker's keyboard behaviour.
- Gate tests: notification labels (literal label and its test line),
  computed-key ratchet, `useeffect-fetch-ratchet`.

## Acceptance criteria

- [ ] In a group set to "Mentions only", a message with `@me` notifies me and
      an ordinary message does not.
- [ ] A muted group never notifies, mention or not.
- [ ] Someone I blocked mentioning me in a shared group does not notify me.
- [ ] "Your mentions" lists the message and opens it.
- [ ] Typing `@` offers members, operable by keyboard.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Mentions in DMs (both people already get every message), `@everyone`,
mentions in RMHTube or Space chat, notifying on every group message.

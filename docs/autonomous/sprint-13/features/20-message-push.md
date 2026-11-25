# 20 — A push when someone messages you, and a mute for each conversation

Surface: a push notification for a new direct message, Settings > Notifications ("Messages"), a direct conversation's
menu ("Mute notifications" for an hour, eight hours, a week or until turned back on). Wave 5. Namespace `message-push`.
Site tier (Steel).

## User story

As a member who uses the site on my phone, I want a push when someone sends me a direct message, so that I do not find
it a day later — and I want to mute one noisy conversation without turning messages off everywhere.

## Requirements elicitation

- **What exists (verified):**
  - A direct message is written by `sendDirectMessage` in `lib/messages/send.server.ts`, which bumps the unread counter
    (`adjustDmUnread`) and sends a server-sent event to an **open** tab (`notifyUser`, `lib/message-events.ts`), and
    nothing else: **no push and no notification is ever sent for a direct message**, so a member whose tab is closed
    learns of it only the next time they open the site. (Group @mentions do notify, `lib/group-chat/mentions.server.ts`;
    a held message request deliberately touches no push, `sendRequestMessage`.)
  - The delivery path is ready: `dispatch()` in `lib/notify/dispatch.server.ts` runs the per-conversation gate first
    (`scopeKey` `dm:<id>`, `getConversationPref`, `shouldDeliver`), then the member's category channels
    (`resolveChannels`), quiet hours with a hold-and-replay (`lib/notify/held.server.ts`), and a **push-only** branch
    when the category's in-app channel is off. Categories are `NOTIFY_CATEGORIES` (`lib/notify/categories.ts`: social,
    replies, follows, economy, events, system; defaults in `CATEGORY_DEFAULTS`; `lib/notify/categories-schema.ts`),
    shown by `components/settings/NotificationSettings.tsx`.
  - Per-conversation preferences exist for every scope (`lib/notify/conversation-prefs.server.ts`: `dm`, `group`,
    `space`, `post`; `muteUntil`, `mentionsOnly`, `pinned`) behind `GET|PUT /api/preferences/conversation`
    (`lib/preferences/api/preferences.conversation.server.ts`, `lib/preferences/conversation.contract.ts`), but only a
    post's thread (`components/feed/MuteConversationMenu.tsx`) and a group (`components/feed/group-chat/
    GroupNotificationSetting.tsx`) have a control. A direct conversation (`components/feed/ConversationView.tsx`) has
    none.
- **Decisions:**
  - **A new category `messages`** (defaults: in-app off, push on, e-mail off): a direct message never makes an inbox row
    (the conversation list is the inbox), only a push, through `dispatch()`'s push-only branch, with `scopeKey:
    dm:<conversationId>`.
  - **What the push says:** title "RMH Studios" (`pushTitleFor('SYSTEM')`, unchanged), body "{{name}} sent you a
    message" (`notice('dm-received', { name })`, whose English fallback is the body), and the link to the conversation;
    **never the message's text, an attachment's name or alt text, or the conversation's name** (a lock screen is not
    private; a member who wants the text opens the app). The dispatch is `type: 'SYSTEM'`, `entityType: 'dm'`,
    `entityId: <conversationId>`, so no `NotificationType` enum value is added (no schema change). Saved-messages
    chats, held requests, the away auto-reply (`afterDirectMessage`, `lib/messages/away.server.ts`, which writes its
    own message and is not a person writing), and a sender the recipient blocks either way (already refused by the
    gate) get none. Whether a tab is open is not guessed on the server: the push carries the tag `dm:<conversationId>`,
    so a newer one replaces the older on the device. **Found in validation:** `dispatch()`'s push-only branch sends no
    `tag` today (only the quiet-hours hold does), so this feature passes the same `${entityType}:${entityId}` tag
    there too (`lib/notify/dispatch.server.ts`); every existing caller's push gains the tag its hold already used,
    which only lets a device coalesce a repeat.
  - **Coalescing:** at most one push per conversation per two minutes while it stays unread (a Redis key with a TTL,
    falling back to in-process), so a burst of ten messages is one push; quiet hours hold and replay one push per
    conversation (the hold's `dedupeKey`).
  - **Mute a conversation:** the direct conversation's menu gains "Mute notifications" with four choices (1 hour,
    8 hours, 1 week, until I turn it back on), written as `muteUntil` (a far-future date for "until I turn it back on")
    through the existing preference endpoint; the header shows "Muted until {{time}}" in `t-meta`. "Mentions only" is
    not offered for a direct conversation (every message addresses the member).
  - **Settings:** "Messages" appears in Settings > Notifications with push and in-app switches like the other
    categories; the e-mail switch is not offered for it (the digest has no message section).

## Functional requirements

1. FR-1 `lib/notify/categories.ts` and `categories-schema.ts`: `messages` in `NOTIFY_CATEGORIES` and
   `CATEGORY_DEFAULTS`; `NotificationSettings.tsx` renders it (no e-mail switch).
2. FR-2 `lib/messages/message-push.server.ts` (new): `afterDirectMessagePush({ senderId, recipientId, conversationId })`
   (the skips, the coalescing key, `dispatch()` with `category: 'messages'`, `scopeKey`, `notice('dm-received',
   { name })`); called from `sendDirectMessage` after the message is written (best-effort, never throws), and so from
   the scheduled-message cron that delivers through it.
3. FR-3 Notice `dm-received` (template, params, preview case, system label) under the Wave 0 notice anchors.
4. FR-4 `components/messages/MuteConversationControl.tsx` (new) in the direct conversation's menu in
   `ConversationView.tsx`, through `setConversationPrefApi`; the header's "Muted until" line.
5. FR-5 `lib/notify/dispatch.server.ts`: the push-only branch passes `tag: '<entityType>:<entityId>'` when both are
   set (as the hold's payload already does), so the push carries `dm:<conversationId>`. `lib/push/send.server.ts` is
   not changed (the title stays `pushTitleFor('SYSTEM')`).

## Non-functional requirements

- **Privacy:** no message text in any push or held payload (a test sends a message whose text is a unique marker,
  with an attachment alt text that is another, and asserts neither marker appears in the `sendPushToUser` payload, the
  `holdNotification` payload or the dispatch input).
- **Volume:** a burst of messages in one conversation produces at most one push per two minutes (a test with a fake
  clock).
- **Correctness:** a muted conversation produces nothing, including after quiet hours end (the gate runs before the
  hold).

## Data model and API

No schema change (`ConversationPref` exists; categories are a JSON matrix on `NotificationPreference`). Notice key
`dm-received`; push tag `dm:<conversationId>`.

## Testing requirements

- Main suite `lib/messages/__tests__/message-push.test.ts`: a message dispatches one push to the recipient with no text
  (the marker test above); none for saved chats, held requests, the away auto-reply or a muted conversation;
  coalescing within two minutes; the scheduled path pushes too; a failure inside the push never fails the send.
- Main suite `lib/notify/__tests__/messages-category.test.ts`: the defaults (push on, in-app off), the push-only branch
  with its new `tag`, the hold's dedupe key, and an existing category's push-only send unchanged except for the tag.
- `components/messages/__tests__/mute-conversation.test.tsx` (`renderToStaticMarkup`): the four choices and the "Muted
  until" line.
- The notice-key catalogue and preview ratchet, notification labels, field names.

## Acceptance criteria

- [ ] With the app closed, a member gets "Sam sent you a message" on their phone and opening it shows the conversation.
- [ ] Ten messages in a minute make one push.
- [ ] Muting a conversation for eight hours stops its pushes until then.
- [ ] Turning "Messages" push off in Settings stops all message pushes.

## Out of scope

Pushes for every group message (groups keep their mention notices), message text in pushes, e-mail for messages.

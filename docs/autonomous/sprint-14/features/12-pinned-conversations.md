# 12 — Pin conversations to the top, and see which you muted

Surface: Messages (`/messages`): pinned conversations above the rest, a "Muted" mark on muted rows, "Pin to top" /
"Unpin" in a conversation's header, beside its mute control. Wave 2. Namespace `pinned-conversations`. Site tier (Steel).

## User story

As a member with many direct conversations, I want to pin the few I return to every day so they stay at the top, and
to see at a glance which conversations I muted, so that I neither scroll for my closest friends nor wonder why one
went quiet.

## Requirements elicitation

- **What exists (verified):**
  - `ConversationPref` (`prisma/schema/messaging.prisma`: `userId`, `scopeKey` `dm:<id>`,
    `muteUntil`, `mentionsOnly`, **`pinned`**, `hideReceipts`, `hideTyping`, index `[userId, pinned]`) has a `pinned`
    column that is accepted by the preference schema (`conversationPrefSchema` in
    `lib/notify/conversation-prefs.server.ts`) and **read by nothing**: no screen sets it, and the list ignores it.
  - `listConversationPrefs(userId, scopeKeys)` exists for exactly this ("the conversation list needs pins + mutes per
    row and must not issue one query per thread") and has **no caller**.
  - The list: `listConversations(userId, { cursor, folderId, unreadOnly })` in `lib/messages.server.ts` (newest
    `lastMessageAt` first, cursor on the chat id, Saved Messages pinned separately), served by `GET /api/messages`
    (`lib/messages/api/messages.server.ts`), rendered by `components/feed/MessagesColumn.tsx`.
  - Mute per conversation (sprint 13 20): `components/messages/MuteConversationControl.tsx` in
    `components/feed/conversation/ConversationHeader.tsx`, through `getConversationPrefApi` / `setConversationPrefApi`
    (`lib/preferences/conversation.contract.ts`).
- **Decisions:**
  - **Pins:** up to 5 pinned direct conversations (`CONVERSATION_PIN_LIMIT`), checked under `lockKey(tx,
    'conversation-pins:<userId>')`; a sixth is refused with `CONVERSATION_PIN_LIMIT` ("You can pin up to {{max}}
    conversations. Unpin one first").
  - **Order:** in the default view (no folder, not "Unread") the first page (no cursor) starts with the pinned
    conversations the member is still in and can see (`dmsOf` and `inboxVisibleTo`, Saved Messages excluded), by
    their own `lastMessageAt`, then the unpinned list as today. The paged query of the default view adds
    `id: { notIn: pinnedIds }` on **every** page, so the cursor (a chat id) always walks the same set and a pinned
    conversation never appears twice; pins do not count toward the page's `limit`. The folder and "Unread" views are
    unchanged: pinned rows appear in their place there, with the mark. A pinned conversation the member left, deleted
    or can no longer see is simply not shown; its pin is cleared on the next pin write (not on a read, so a `GET`
    never writes).
  - **Marks:** each row gets `pinned` and `muted` (a `muteUntil` in the future, or `mentionsOnly`) from one
    `listConversationPrefs` call per page; a pinned row shows a pin icon with "Pinned" as its accessible name, a muted
    row shows "Muted" in `t-meta` (no colour-only meaning).
  - **The control:** "Pin to top" / "Unpin" beside `MuteConversationControl` in
    `components/feed/conversation/ConversationHeader.tsx` (the header has no menu of its own; the control is a button
    with `aria-pressed`), through the existing preference contract (the `PUT` body gains nothing: `pinned` is already
    in the schema; the server adds the limit check). `pinned: true` is accepted only for a `dm:` scope whose chat the
    caller is a member of (`INVALID_INPUT` otherwise), so a fabricated key cannot use up the five slots.
  - **Groups** keep their own list; this feature is direct conversations only (the `dm:` scope).
  - **Export:** `ConversationPref` rows are already exported (`conversationPrefs`); nothing new.

## Functional requirements

1. FR-1 `lib/messages/pins.ts` (new, pure: the limit, the merge of pinned and paged rows) and
   `lib/messages/pins.server.ts` (new: `pinnedChatIds(userId)`, `setPinned(userId, chatId, pinned)` under the lock).
2. FR-2 `lib/messages.server.ts` `listConversations`: the first-page merge, the exclusion on later pages, the two flags
   from `listConversationPrefs`; `ConversationListItem` gains `pinned` and `muted`.
3. FR-3 The preference `PUT` route (`lib/preferences/api/preferences.conversation.server.ts`) sends `pinned`
   writes through `setPinned` for `dm:` scopes and refuses other scopes' pins (`INVALID_INPUT`).
4. FR-4 UI: `components/feed/MessagesColumn.tsx` row marks; `components/messages/PinConversationItem.tsx` (new) in
   `ConversationHeader.tsx`, beside `MuteConversationControl`; the list query is invalidated after a pin change.
5. FR-5 Refusal code `CONVERSATION_PIN_LIMIT` (param `max`) under the Wave 0 anchor.

## Non-functional requirements

- **Paging is correct:** no conversation appears twice or is skipped across pages with pins present (a test walks
  three pages, pinning a conversation between page one and page two).
- **The cap holds under concurrency:** the count and the upsert run in one transaction after `lockKey(tx,
  'conversation-pins:<userId>')`, so two concurrent sixth pins leave five; unpinning never takes the cap check.
- **Performance:** one extra indexed read for pins (`[userId, pinned]`) and one batched preference read per page.
- **Query shapes (verify against the schema):** `ConversationPref` has a composite id (`userId`, `scopeKey`), so the
  write is an `upsert` on `userId_scopeKey`; `pinned` is required (`Boolean @default(false)`), filter
  `pinned: true`, never `{ not: null }`.

## Data model and API

No schema change. `GET /api/messages` rows gain `pinned`, `muted`; `PUT /api/preferences/conversation` honours
`pinned` with the limit.

## Testing requirements

- Main suite `lib/messages/__tests__/conversation-pins.test.ts`: the limit under the lock, a sixth pin refused,
  unpinning, pins of a left conversation dropped.
- Main suite `lib/messages/__tests__/conversation-list-pins.test.ts`: first-page order, no duplicates or gaps over three
  pages, folder and unread views unaffected, the two flags.
- Product suite `lib/messages/__tests__/pins.product.test.ts`: the merge.
- `components/feed/__tests__/` Messages column characterization (update its snapshot with the marks), the error-code
  catalogue.

## Acceptance criteria

- [ ] A member pins two conversations; they stay at the top of Messages even when other conversations get newer
      messages.
- [ ] A sixth pin is refused with the limit sentence.
- [ ] A muted conversation shows "Muted" in the list.
- [ ] Scrolling the list never shows a pinned conversation a second time.

## Out of scope

Pinning group chats, reordering pins by hand, pins in the developer API.

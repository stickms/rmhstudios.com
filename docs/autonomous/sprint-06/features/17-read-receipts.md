# 17 — Read receipts and typing off for every conversation

Surface: Settings > Privacy (`app/routes/_site/settings/privacy.tsx`), the
existing per-conversation switches in the chat options sheet
(`components/chat-plus/ChatOptionsSheet.tsx`), and the direct-message read
paths. Wave 5. Namespace `read-receipts`.

> **Validator note (2026-11-21).** The first draft of this specification said
> members "cannot turn off" read receipts. That is false: M8 already ships a
> reciprocal **per-conversation** switch for read receipts and for typing
> (`ConversationPref.hideReceipts` / `hideTyping`,
> `prisma/schema/messaging.prisma`; `lib/chat-plus/receipts.server.ts`;
> `lib/chat-plus/settings.server.ts`; the "privacy-receipts" switch in
> `ChatOptionsSheet.tsx`). The feature is rescoped to what is actually missing:
> one account-wide default, and one read path that ignores the switch. If the
> sprint owner judges this too small, cut it (see `README.md`).

## User story

As a member who reads messages when I can but answers later, I want to turn off
"Seen" and the typing indicator once, for every conversation I have and will
have, instead of opening each conversation's options, so that opening a message
never feels like a promise to reply at once.

## Requirements elicitation

- **What exists (verified):**
  - Per conversation, each participant can hide receipts and typing
    (`ConversationPref`, scope `dm:<id>`, `hideReceipts`, `hideTyping`), set
    through `lib/chat-plus/settings.server.ts` and the switch in
    `ChatOptionsSheet.tsx`. Both are reciprocal: if either side has one off,
    neither sees it (`getPairPrivacy`, `receiptsHiddenFor`).
  - Applied at the source: `lib/messages/api/messages.$conversationId.server.ts`
    (conversation GET, `maskReceipts`), `lib/messages/mutations.server.ts`
    (catch-up), `lib/messages.server.ts` (inbox last message),
    `lib/messages/api/messages.$conversationId.read.server.ts` (the `op: 'read'`
    ping is not published), `messages.$conversationId.typing.server.ts` (the
    typing event is not published).
  - **Gap:** `lib/messages/api/messages.search.server.ts` returns each
    conversation's last message with `read: lastMessage.read && !(… requestOut
    …)` (line 138 on `main`) and never consults `hideReceipts`, so the sender
    learns "read" from search even when receipts are hidden for the pair.
  - There is no account-wide default: a member who wants receipts off
    everywhere must switch it in every conversation, including new ones.
  - The recipient's unread counts depend on `ChatMessage.read`, so the flag
    itself keeps being written.
- **Decisions:**
  - Two account-wide switches in Settings > Privacy, "Show when I have read
    direct messages" and "Show when I am typing", both default on.
  - The effective value for a member in a conversation is **off if either the
    account switch or that conversation's switch is off**; the pair rule stays
    reciprocal. There is no per-conversation "on" that overrides an account
    "off" (it would need a three-state switch; out of scope).
  - The conversation options sheet shows the account setting: when the account
    switch is off, the conversation's switch is shown off and disabled with one
    line "Off for all conversations in Settings > Privacy" and a link.
  - Turning the account switch back on restores each conversation's own value
    (the per-conversation rows are never rewritten).
  - Group chats are unaffected (they show no per-person "Seen").
  - Saved Messages (a conversation with yourself) are unaffected, as today.

## Functional requirements

1. FR-1 Settings > Privacy gains a "Messages" section with the two switches and
   one sentence explaining reciprocity.
2. FR-2 `getPairPrivacy` and `receiptsHiddenFor` (`lib/chat-plus/receipts.server.ts`)
   also read both participants' account switches, in the same query round
   (one `UserProfile` read for the pair, or for the page of conversations), so
   every existing caller applies the account default without change.
3. FR-3 `messages.search.server.ts` masks the last message's `read` with
   `receiptsHiddenFor`, as the inbox does.
4. FR-4 Every server path that returns a DM's `read` flag to its sender or
   publishes a read or typing event is listed in `READ_RECEIPT_READ_PATHS`
   (`lib/chat-plus/receipts.ts`, a new pure module) and a gate test holds that
   each listed file imports from `@/lib/chat-plus/receipts.server`, and that
   every file under `lib/` and `app/routes/` that selects `read` on
   `chatMessage` for a conversation list or message page is in the list.
5. FR-5 The options sheet reflects the account switch per Decisions (its
   settings read returns the account values with the conversation's).

## Non-functional requirements

- **Security:** masking stays on the server. `auth: 'required'`;
  `rateLimit: 'write'` on the PUT; zod booleans.
- **Performance:** FR-2 adds one `userProfile.findMany` for the participants
  (two ids, or the page's ids), run in parallel with the existing
  `conversationPref` query.
- **Correctness:** the recipient's unread counts and "mark all read" are
  unchanged; per-conversation rows are never written by the account switch.
- **Privacy:** the two preferences are on the profile row; integration adds
  them to the export if it lists profile fields explicitly; nothing to erase.
- **i18n:** `read-receipts`.
- **Steel:** settings rows with `Switch`; no new styling.
- **Accessibility:** each switch has a label and a description
  (`aria-describedby`); the disabled conversation switch's reason is its
  description.

## Data model and API

- `UserProfile.readReceipts Boolean @default(true)` and
  `UserProfile.typingIndicators Boolean @default(true)`
  (`prisma/schema/profile.prisma`). Migration
  `20261126050100_s06_read_receipts`.
- `lib/chat-plus/receipts.ts` (pure: `effectiveHidden`, `READ_RECEIPT_READ_PATHS`);
  changes to `lib/chat-plus/receipts.server.ts` (FR-2) and
  `lib/chat-plus/settings.server.ts` (return the account values);
  `lib/messages/read-receipts.contract.ts`.
- Module `lib/messages/api/settings.read-receipts.server.ts` (GET, PUT
  `{ readReceipts?, typingIndicators? }`).
- Changes: `lib/messages/api/messages.search.server.ts` (FR-3);
  `components/chat-plus/ChatOptionsSheet.tsx` (FR-5); `privacy.tsx` (one
  section). `ConversationView.tsx` needs no change (it already follows the
  masked payload).

## Testing requirements

- Main suite `lib/chat-plus/__tests__/account-receipts.test.ts`: with either
  participant's account switch off, the conversation GET, catch-up, inbox and
  search all return `read: false` on the sender's own messages, and no read or
  typing event is published; with both on, per-conversation switches behave as
  before; turning the account switch on restores the conversation's own value;
  the recipient's unread count is unaffected; Saved Messages unaffected.
- Main suite `lib/chat-plus/__tests__/read-receipt-read-paths.test.ts` (source
  scan), which fails on today's `messages.search.server.ts`.
- Product suite `lib/chat-plus/__tests__/receipts.product.test.ts`: the truth
  table of `effectiveHidden` (two people × account × conversation).
- `ConversationView.characterization.test.tsx` and the existing receipt tests
  stay green.

## Acceptance criteria

- [ ] A turns "Show when I have read direct messages" off in Settings; B's
      messages to A never show "Seen" in any conversation, new or old, and A's
      messages to B do not either.
- [ ] Searching messages does not reveal "read" for a pair with receipts off.
- [ ] A's conversation options show the receipt switch off and explain why.
- [ ] Turning the account switch back on restores each conversation's own
      choice.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Group chat read state, a per-conversation "on" that overrides the account
setting, email or push read state.

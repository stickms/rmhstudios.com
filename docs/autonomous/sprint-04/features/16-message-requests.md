# 16 — Message requests

Surface: DM privacy in profile settings
(`components/feed/profile-edit/PrivacySection.tsx`), a "Requests" view at
`/messages/requests` with an entry in the messages list
(`components/feed/MessagesColumn.tsx`), and the DM conversation view. Wave 3.
Namespace `message-requests`.

## User story

As a member who limits DMs to people I follow, I want strangers to be able to
send me one message that waits in a Requests folder — which I can accept,
decline or block from — instead of being refused outright, so that I can be
reachable without opening my inbox to everyone.

## Requirements elicitation

- **What exists (verified):** `UserProfile.dmPrivacy` (`EVERYONE`,
  `FOLLOWERS`, `NONE`; `prisma/schema/profile.prisma`) is enforced when a DM
  starts (`lib/messages/api/messages.server.ts`), when one is sent
  (`messages.$conversationId.server.ts`, and sprint 03's extracted
  `lib/messages/send.server.ts`), for voice notes
  (`lib/messages/voice.server.ts`)
  and forwards (`canDirectMessage`, `lib/chat-plus/dm-privacy.server.ts`). A
  refused sender sees an error and that is all; the recipient never learns
  someone tried. There is no request state anywhere (`grep` for message
  requests finds nothing). Hiding a conversation exists (`DirectMessageHide`),
  as do blocks (`UserBlock`, `isBlockedPair` in `send.server.ts`).
- **Decisions:** a new switch "Let others send message requests", available
  when DM privacy is `FOLLOWERS` or `NONE`, default **off** (no change for
  anyone who does not opt in). With it on, a sender the privacy rule refuses
  may start **one** conversation with **one text message** (no images, GIFs,
  voice, polls or scheduled sends); it waits as a request. The recipient gets
  no push and no unread badge — the messages list shows "Requests (2)". Accept
  turns it into a normal conversation (both may write freely, privacy no longer
  applies to this pair). Decline hides it and stops the sender from
  requesting again for 30 days; the sender is not told which happened (their
  view stays "Request sent"). Block uses the existing block. Blocked pairs and
  banned senders cannot request. At most 20 new requests per sender per day.

## Functional requirements

1. FR-1 The privacy section shows the switch under DM privacy, enabled only
   for `FOLLOWERS` and `NONE`, with a line explaining what a request is.
2. FR-2 Starting a DM with someone who allows requests but not direct DMs
   shows "Send a request" in the composer; the first text message creates the
   request; the composer then reads "Request sent. You can write again if
   they accept."
3. FR-3 The messages list shows "Requests (n)" when the viewer has pending
   requests; `/messages/requests` lists them (sender, first line, time) with
   Accept, Decline and Block on each; opening one shows the message without
   marking anything as read for the sender.
4. FR-4 Accept moves the conversation to the main list and notifies the
   sender ("Alex accepted your message request"); from then on both write
   normally.
5. FR-5 Decline removes it from Requests; the sender's further requests to
   that person are refused for 30 days with the same generic refusal the
   privacy rule gives today.
6. FR-6 Every DM write path — start, send, voice, forward, scheduled send —
   applies the request rule through one function, so none can send a second
   message or an attachment into a pending request.

## Non-functional requirements

- **Security:** `requestGate(senderId, recipientId)` in
  `lib/messages/requests.server.ts` returns `allowed | request | refused`;
  every path above calls it. Creating a request runs in a transaction under
  `pg_advisory_xact_lock(hashtext('dm-request:' || senderId))` for the
  daily cap and the one-request rule. Accept and decline are recipient-only;
  the request id never grants access to the chat by itself.
- **Privacy:** a declined or pending request's sender learns nothing new
  (same refusal text, no read receipts, typing or presence while pending).
  Requests are erased under `s04-16` in both directions;
  `exportMessageRequests(userId)` (who, when, status — the message itself is
  already in the conversation export).
- **Performance:** `@@index([recipientId, status, createdAt(sort: Desc)])`
  for the folder and its count; the count rides on the existing messages
  sidebar payload (`/api/messages/sidebar`) rather than a new request.
- **Accessibility:** Accept/Decline/Block are labelled with the sender's name;
  the folder count is text in the link name.
- **i18n:** strings in `message-requests`.
- **Steel:** the Requests entry is a row in the list, not a banner; actions
  are quiet buttons with Accept the view's ink primary.

## Data model and API

- `UserProfile` gains `dmRequests Boolean @default(false)`. New model in
  `prisma/schema/messaging.prisma`: `MessageRequest { id String @id
  @default(cuid()), chatId String @unique, senderId String, recipientId
  String, status String @default("pending") @db.VarChar(10), createdAt
  DateTime @default(now()), decidedAt DateTime? }`, relations (Cascade) to
  the chat and both users (back-relations under `s04-16`),
  `@@index([recipientId, status, createdAt(sort: Desc)])`,
  `@@index([senderId, recipientId, decidedAt])`,
  `@@map("message_request")`. Migration
  `20261124030000_s04_message_requests`.
- `lib/messages/requests.ts` (pure: gate decision table, cooldown, cap),
  `requests-schema.ts`, `requests.contract.ts`, `requests.server.ts`.
- Modules `lib/messages/api/messages.requests.server.ts` (`GET` list) and
  `messages.requests.$id.server.ts` (`POST` with `action: accept | decline`).
- The conversation list query excludes chats with a pending request for the
  recipient; the sender sees theirs with the "Request sent" state.
- Route `app/routes/_site/messages/requests.tsx` (`EXCLUDED_ROUTES` under
  `s04-16`).

## Testing requirements

- Main suite `lib/messages/__tests__/message-requests.test.ts`: the gate
  table for every privacy × follow × switch × block case; a second message,
  an image or a voice note into a pending request is refused on every path;
  only the recipient can accept or decline; decline's 30-day cooldown; the
  daily cap under the lock.
- Main suite `lib/account/__tests__/message-requests-erasure.test.ts`.
- Product suite `lib/messages/__tests__/requests.product.test.ts`.
- The conversation characterization tests stay green.

## Acceptance criteria

- [ ] With FOLLOWERS + requests on, a stranger's first message lands in
      Requests with no push; accepting opens a normal conversation.
- [ ] A declined sender cannot send another request for 30 days and sees the
      usual refusal.
- [ ] With the switch off, behaviour is exactly today's.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Requests for group chats, filtering requests by spam score, auto-accepting
mutual follows of friends.

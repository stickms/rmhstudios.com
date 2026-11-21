# 12 — Send a message later

Surface: the direct-message and group-chat composers
(`components/feed/conversation/ComposerBar.tsx`,
`components/feed/group-chat/GroupComposerBar.tsx`) and a "Scheduled" strip in
each conversation. Wave 2. Namespace `send-later`.

## User story

As a member who messages friends in other time zones, or who thinks of
something at midnight, I want to write a message now and have it sent at a
time I choose — and to see, edit or cancel it until then — so that I do not
wake people up or forget to send it.

## Requirements elicitation

- **What exists (verified):** posts can be scheduled (`ScheduledPost`,
  `lib/scheduled/`, published by a jobs cron, `server/jobs/index.ts`
  "posts-plus"), but **messages cannot**: DMs are sent by
  `POST /api/messages/$conversationId`
  (`lib/messages/api/messages.$conversationId.server.ts`: restriction check,
  block check, image ownership, then `chatMessage.create`), group messages by
  `lib/group-chat/api/group-chats.$id.messages.server.ts`. No model, job or
  UI holds a message for later (no `scheduledMessage`, `sendLater` or
  `send_at` anywhere). Reminders exist (`Reminder`) but remind the sender, not
  the recipient.
- **Decisions:** a `ScheduledChatMessage` row holds text, GIF and images (the
  same fields the composer sends; no voice notes, polls or checklists). A
  pg-boss cron every minute delivers due rows by calling the **same send
  function** the endpoints use, extracted so that every check (restriction,
  block, membership, image ownership, length, slow mode if any) runs at send
  time, not only at scheduling time. If a check fails at send time the row is
  marked `failed` with a reason code and stays visible to the sender in the
  conversation's Scheduled strip (no notification). At most 20 pending per
  member, 1 minute to 30 days ahead. The recipient never sees a scheduled
  message before it is sent.

## Functional requirements

1. FR-1 The send button gains a "Send later" option (a menu next to Send, also
   reachable with the keyboard): presets "Tomorrow 9:00", "Monday 9:00" and a
   custom date and time in the sender's zone.
2. FR-2 Scheduling stores the message; the composer clears and the
   conversation shows a "1 scheduled message" strip above the composer; the
   strip expands to the list (time, first line, Edit, Send now, Cancel).
3. FR-3 Edit changes the text or the time (not images); Send now sends
   immediately through the normal path; Cancel deletes it (confirm).
4. FR-4 The cron sends due messages in `sendAt` order; a sent message is an
   ordinary message (same realtime event, push and unread count as one sent
   by hand) and the scheduled row is deleted.
5. FR-5 A failed delivery shows in the strip as "Not sent: you can no longer
   message this person" (or the reason for that code) with Delete.
6. FR-6 Leaving a group or being blocked cancels the member's pending
   messages to that conversation at the next delivery attempt (they fail with
   the reason).
7. FR-7 `/messages` shows a clock icon with an accessible label on
   conversations that hold the member's scheduled messages.

## Non-functional requirements

- **Security:** scheduling endpoints are session-only and only touch the
  caller's rows; the conversation must be one the caller can send to at
  scheduling time **and** at delivery time; rate limit `write`; content
  zod-bounded exactly as the send schema (reuse it).
- **Reliability:** the cron claims rows with `updateMany … where status =
  'pending' and sendAt <= now` → `status = 'sending'`, so two workers cannot
  send twice; a row stuck in `sending` for 10 minutes is retried once, then
  failed.
- **Performance:** `@@index([status, sendAt])` for the cron, `@@index([senderId,
  chatId])` for the strip; at most 500 rows per run.
- **Privacy:** pending rows are deleted with the account (`anonymizeAccount`)
  and included in the export.
- **Accessibility:** the Send-later menu is a Radix menu (`components/ui/menu`)
  with a labelled date/time dialog; the strip is a disclosure button with
  `aria-expanded`.
- **i18n:** strings in `send-later`; preset times computed in the sender's
  zone and shown with `Intl.DateTimeFormat`.
- **Steel:** Send stays the composer's one primary; the strip is a row on a
  rule with `t-meta` text, not a box; the dialog is an overlay.

## Data model and API

- New model in `prisma/schema/messaging.prisma`: `ScheduledChatMessage { id
  String @id @default(cuid()), chatId, senderId, content @db.VarChar(2000),
  gifUrl String?, imageUrls String[] @default([]), sendAt DateTime, status
  String @default("pending") @db.VarChar(10), failCode String?
  @db.VarChar(24), attempts Int @default(0), createdAt, updatedAt }`, cascades
  to the chat and the sender, the two indexes above,
  `@@map("scheduled_chat_message")`.
- Migration `20261123020200_s03_scheduled_messages`.
- Extract `sendDirectMessage(...)` and `sendGroupMessage(...)` from the two
  endpoints into `lib/messages/send.server.ts` (the endpoints call them; the
  behaviour of the endpoints does not change — their characterization tests
  in `components/feed/__tests__/*characterization*` must still pass).
- `lib/messages/scheduled.ts` (pure: window, presets, fail codes),
  `lib/messages/scheduled.server.ts`, `lib/messages/scheduled-schema.ts`,
  `lib/messages/scheduled.contract.ts`, `lib/messages/scheduled-jobs.server.ts`
  (registered in `server/jobs/index.ts`, `messages.send-scheduled`, every
  minute).
- Modules: `lib/messages/api/messages.scheduled.server.ts` (GET mine, query
  `chatId`; POST), `messages.scheduled.$id.server.ts` (PATCH, DELETE),
  `messages.scheduled.$id.send-now.server.ts` (POST).

## Testing requirements

- Main suite `lib/messages/__tests__/scheduled-messages.test.ts`: a member
  cannot schedule to a chat they are not in; delivery re-checks blocks and
  membership and fails with the right code; the cron run twice sends once;
  another member cannot read, edit or cancel the row; the 21st pending is
  refused.
- Main suite `lib/account/__tests__/scheduled-messages-erasure.test.ts`.
- Product suite `lib/messages/__tests__/scheduled.product.test.ts`: presets
  across DST and week boundaries, window validation.

## Acceptance criteria

- [ ] A message scheduled for 9:00 arrives at 9:00 (within a minute) as an
      ordinary message with push.
- [ ] Blocking the sender before 9:00 means it is not delivered and the sender
      sees why.
- [ ] Edit and Cancel work until delivery.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Recurring messages, scheduling voice notes, polls or checklists, scheduling in
community or Space chats.

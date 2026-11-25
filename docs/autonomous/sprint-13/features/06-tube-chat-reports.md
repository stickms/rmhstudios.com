# 06 — Report a message in an RMHTube room, and the chat a deleted member leaves

Surface: an RMHTube room's chat (a "Report" item on another member's message), `/admin/reports` (the message's text),
"Your reports", account deletion, a nightly prune. Wave 1. Namespace `tube-chat-reports`. App tier (L8) in the room; site
tier on the admin and settings pages.

## User story

As a member in an RMHTube watch room, I want to report a message that harasses someone, so that a moderator can remove
it — from the room as it runs and from the history the room shows to everyone who joins later. As a member who deletes
their account, I want my name gone from the chat history of every room I talked in.

## Requirements elicitation

- **What exists (verified):**
  - Room chat is persisted: `server/rmhtube/chat-handler.ts` batches each message (`id: nanoid(12)`, `roomId`,
    `userId`, a copied `userName`, `content`) into `RmhTubeChatMessage` (`prisma/schema/rmhtube.prisma`,
    `@@index([roomId, createdAt])`, `@@map("rmhtube_chat_message")`), keeps a ring buffer of
    `CHAT_HISTORY_LENGTH` (200, `server/rmhtube/config.ts`), and `server/rmhtube/room-manager.ts` (`hydrateRoom`, the
    `messages` include, `take: config.CHAT_HISTORY_LENGTH`) restores the newest 200 into a room after a restart, with
    their copied names, for everyone who joins.
  - **A chat message cannot be reported.** `REPORT_ENTITY_TYPES` (`lib/moderation/report-constants.ts`) has no type for
    it; the room's chat UI (`components/rmhtube/ChatPanel.tsx`) has reactions, replies and pins but no report item.
    Hosts can slow the room and ban members (`RoomSlowMode`), but nothing reaches a site moderator.
  - **Account deletion leaves the chat untouched.** `RmhTubeChatMessage` has a plain `userId` column and no `User`
    relation, so the erasure coverage test (`lib/account/__tests__/erasure-coverage.test.ts`, which walks `User`
    relations) never asked about it, and `lib/account/deletion.server.ts` has no operation on it: an erased member's
    messages keep their old name and reappear in every room history.
  - **The table is never pruned:** every message ever sent stays, though only a room's newest 200 are ever read.
  - The report path to copy: `lib/moderation/api/moderation.report.server.ts` (`resolveTargetUser`, the eligibility
    block), `lib/moderation/triage.server.ts` (`takedownReportedContent`, `previewsFor`),
    `lib/moderation/my-reports.server.ts`, `components/moderation/MyReportsPanel.tsx`,
    `components/moderation/ReportDialog.tsx` — each with a Wave 0 anchor for this feature.
- **Decisions:**
  - **Report type `tube-chat`**, entity id the message id. Only a member of the room (an `RmhTubeRoomMember` row,
    present or past) may report a message in it, and never their own; a message older than the kept history (not in
    the table) is "not found". The reported author is the message's `userId`. Removable.
  - **The moderator sees** the message's text, its room's name and its time (`previewsFor`, a moderation read path),
    not the rest of the conversation.
  - **Takedown** deletes the row and tells the hub: the web tier publishes `{ roomId, messageId }` on the Redis channel
    `rmhtube:chat:removed` (`redisPublish` in `lib/redis.server.ts`); the hub subscribes once at start, drops the
    message from that room's ring buffer and emits a new `S2C` event `rmhtube:chat:removed`, on which every client
    removes it (a reply that quoted it shows "Message removed"). Without Redis the row is gone and the next restore no
    longer has it; the decision's audit line says the live room was not reached.
  - **Erasure:** the member's rows are **deidentified** (rule 3, as `ChatMessage` is kept under "Deleted user"):
    `userName` becomes "Deleted user"; the text stays, as their posts' does. The ring buffers of rooms running at that
    moment are not reached (they refresh on the next restart; recorded as a residual).
  - **Retention:** a nightly job deletes messages older than 90 days that are not among their room's newest 200 and
    that no `PENDING` `ContentReport` of type `tube-chat` names (`NOT EXISTS` on `"content_report"` by `"entityType"`,
    `"entityId"`, `"status"`, which `@@index([entityType, entityId])` serves), so evidence waiting for a moderator is
    never pruned; in batches of 1,000 (raw SQL on `"rmhtube_chat_message"` with `ROW_NUMBER() OVER (PARTITION BY
    "roomId" ORDER BY "createdAt" DESC)`). Deleting a message a reply points at sets the reply's `replyToId` null (the
    existing `onDelete: SetNull`).
  - **No registry entry:** the model has no `User` relation; the erasure operation and its test are the record, and the
    README names the coverage test's blind spot (plain `userId` columns) as a follow-up.

## Functional requirements

1. FR-1 `lib/moderation/report-constants.ts`: `'tube-chat'` in `REPORT_ENTITY_TYPES` and
   `REMOVABLE_REPORT_ENTITY_TYPES` (under `// s13-06 tube-chat-reports`).
2. FR-2 `lib/rmhtube/chat-reports.server.ts` (new): `chatReportAuthor(messageId, reporterId)` (membership check, not
   own), `chatPreviews(ids)`, `takeDownChatMessage(id)` (delete + publish), `chatMessageErasureOps(userId)`,
   `pruneRoomChat(now)`.
3. FR-3 The report route (`resolveTargetUser` and eligibility), triage (`takedownReportedContent` and `previewsFor`),
   "Your reports" (`my-reports.server.ts` kind and gone text; `MyReportsPanel.tsx` labels) — each under its anchor.
4. FR-4 Hub: `server/rmhtube/chat-handler.ts` subscribes to `rmhtube:chat:removed` and removes the message;
   `lib/rmhtube/events.ts` gains `S2C.CHAT_REMOVED`; `components/rmhtube/ChatPanel.tsx` drops it and shows the
   "Report" item (opening `ReportDialog`) on other members' messages.
5. FR-5 Erasure: `chatMessageErasureOps` under `// s13-06 tube-chat-reports` in `anonymizeAccount`, with
   `lib/account/__tests__/tube-chat-erasure.test.ts`. The prune job registered under the Wave 0 jobs anchor
   (`server/jobs/index.ts`, daily at 04:17 UTC).

## Non-functional requirements

- **Safety:** a non-member cannot report into a room they never joined (no probing of message ids).
- **Privacy:** the moderator reads one message, not the room; the erased member's name never returns.
- **Raw SQL** uses the real table and quoted columns (`"roomId"`, `"createdAt"`), asserted in a test, and runs outside
  any transaction.

## Data model and API

No schema change. Report type `tube-chat`; Redis channel `rmhtube:chat:removed`; socket event `rmhtube:chat:removed`
(server to client only, so no rate-limit entry).

## Testing requirements

- Main suite `lib/rmhtube/__tests__/chat-reports.test.ts`: a member can report another's message; a non-member, the
  author and an unknown id are refused; the preview is the message text; the takedown deletes and publishes.
- Main suite `server/rmhtube/__tests__/chat-removed.test.ts`: the hub drops the message from the buffer and emits the
  event; an unknown room is a no-op.
- Main suite `lib/account/__tests__/tube-chat-erasure.test.ts`: the member's rows are deidentified, others' untouched.
- Main suite `lib/rmhtube/__tests__/chat-prune.test.ts`: the SQL's table and columns (`"rmhtube_chat_message"`,
  `"content_report"`, `"roomId"`, `"createdAt"`, `"entityType"`, `"entityId"`); a room's newest 200 survive; a message
  with a pending report survives.
- `lib/moderation/__tests__/music-reports.test.ts` (every removable type has a takedown branch), the user-text gate,
  `server-bundle-copies`.

## Acceptance criteria

- [ ] A member reports another member's message from the room chat and sees it under "Your reports".
- [ ] An admin removing it makes it disappear from the running room and from the history a new joiner sees.
- [ ] After an account is erased, its messages in a room's history read "Deleted user".
- [ ] Messages older than 90 days beyond a room's newest 200 are gone after the nightly job, except one a pending
      report names.

## Out of scope

Reporting a whole room, host-side message deletion, chat in RMHStudy rooms, live rooms' buffers at erasure.

# 17 — Report a message, and let the moderator see what it said

Surface: a direct or group conversation (a "Report" item on another member's message), `/admin/reports` (the message
and, if it was edited, what it said before), "Your reports", a nightly prune. Wave 4. Namespace `dm-reports`. Site tier
(Steel).

## User story

As a member who receives a threatening or abusive message, I want to report that message from the conversation, so
that a moderator reads exactly what was sent — even if the sender edits it afterwards to hide what it said.

## Requirements elicitation

- **What exists (verified):**
  - `'dm'` is a report type (`REPORT_ENTITY_TYPES` in `lib/moderation/report-constants.ts`), and its entity id is a
    `ChatMessage` id: the disappearing-message sweep keeps a message alive while a `PENDING` report of type `dm` names
    it (`lib/chat-plus/expiry.server.ts`). But **nothing files one**: the message menu
    (`components/messages/MessageActions.tsx`, used by `components/feed/ConversationView.tsx` and the group chat) has no
    report item; `resolveTargetUser` in `lib/moderation/api/moderation.report.server.ts` has no `dm` case (the target
    is `null`); and the admin triage shows no text for it (`previewsFor` in `lib/moderation/triage.server.ts` reads posts,
    replies, jam feedback, build comments and issues only).
  - Edits keep the prior text only in Redis or a per-process map (`lib/messages/edit-history.server.ts`:
    `recordPriorRevision` before `editMessage` in `lib/messages/mutations.server.ts` overwrites `ChatMessage.content`;
    `readPriorRevisions` "Moderation paths only", **never called**). The file names its own follow-up: "a
    `DirectMessageEdit` table shaped exactly like `RMHarkEdit`; when it lands, `recordPriorRevision` becomes an insert
    and this file goes away". `RMHarkEdit` (`prisma/schema/social.prisma`, `@@map("rmheet_edit")`) is the shape.
  - Access to a conversation is `getChatAccess` (`lib/messages/alt-edit.server.ts` shows its use); `ChatMessage` is
    `keep` in the erasure registry (shared content under "Deleted user").
- **Decisions:**
  - **Report a message:** any member of the conversation (direct or group, `getChatAccess`) may report another
    member's message (never their own, never a system message), type `dm`, removable. `resolveTargetUser` returns the
    sender.
  - **What the moderator sees:** that one message's current text, its time, whether it was edited, and **its prior
    versions** (newest first, up to 10), plus the conversation kind (direct or group). Not the rest of the conversation,
    not attachments' files (their alt text and a "has image" mark only). A moderation read path, admin only.
  - **The edit table:** `ChatMessageEdit(id, messageId, content, replacedAt)` (it serves group messages too, so the
    name is not "Direct"); `recordPriorRevision` becomes an insert in the edit's own write; `readPriorRevisions` reads
    the table; the Redis and in-process stores are deleted (the file's own plan).
  - **Retention:** edits are kept 30 days (`EDIT_HISTORY_TTL_MS`, unchanged) **unless** a `PENDING` report names the
    message, in which case they stay until the report is decided; a nightly job deletes the rest in batches of 1,000.
  - **Takedown:** "Remove" deletes the message as a moderator (`deletedAt`, `deletedBy: 'moderator'`, as
    `takedownReportedContent` does for a reply); both sides see the existing deleted-message row.
  - **Erasure:** edits of messages the member sent are erased with the account (the messages stay under "Deleted
    user"); the model has no `User` relation, so the operation and its test are the record.

## Functional requirements

1. FR-1 Migration `20261220040100_s13_dm_reports`: `CREATE TABLE "chat_message_edit"` (`"id"`, `"messageId"`,
   `"content"` `VARCHAR(2000)`, `"replacedAt"`, index on `("messageId", "replacedAt")`, foreign key cascading from
   `"chat_message"`).
2. FR-2 `lib/messages/edit-history.server.ts` rewritten on the table (`recordPriorRevision(tx, …)` inside the edit's
   transaction in `mutations.server.ts`; `readPriorRevisions`; `pruneMessageEdits(now)`; `messageEditErasureOps`).
3. FR-3 Report path under the Wave 0 anchors: `moderation.report.server.ts` (`dm`: membership check, not own,
   `resolveTargetUser` → sender), `triage.server.ts` (takedown branch, `previewsFor` with prior versions),
   `report-constants.ts` (`dm` in `REMOVABLE_REPORT_ENTITY_TYPES`), `my-reports.server.ts`, `MyReportsPanel.tsx`.
4. FR-4 UI: a "Report" row in `MessageActions.tsx` for another member's message, opening
   `components/moderation/ReportDialog.tsx`; the admin report row shows "Edited — earlier versions" with each version's
   time (`components/admin/reports/ReportList.tsx`).
5. FR-5 The prune job under the Wave 0 jobs anchor (daily at 04:43 UTC); the erasure op under
   `// s13-17 dm-reports`.

## Non-functional requirements

- **Privacy:** a non-member cannot report a message (no probing ids); the moderator reads one message and its versions;
  no participant ever sees prior versions (the edit marker stays "edited").
- **Integrity:** the snapshot is written in the same transaction as the overwrite, so an edit can never lose its
  prior text (the Redis version could).
- **Raw SQL** in the prune uses `"chat_message_edit"` and quoted columns, asserted in a test.

## Data model and API

`ChatMessageEdit { id, messageId, content, replacedAt }` (`@@index([messageId, replacedAt])`,
`@@map("chat_message_edit")`), relation to `ChatMessage` with `onDelete: Cascade`. Report type `dm` (existing).

## Testing requirements

- Main suite `lib/messages/__tests__/edit-history.test.ts`: an edit writes a version in its transaction; up to 10 read
  back newest first; the prune keeps versions of a message with a pending report.
- Main suite `lib/moderation/__tests__/dm-reports.test.ts`: a member reports another's message; a non-member, the sender
  and a system message are refused; the target is the sender; the preview carries the versions; remove deletes as a
  moderator.
- Main suite `lib/account/__tests__/message-edits-erasure.test.ts`.
- `components/messages/__tests__/message-actions-report.test.tsx` (`renderToStaticMarkup`): the row on others' messages
  only. The removable-type takedown test, user-text direction (message text in the admin row).

## Acceptance criteria

- [ ] A member reports a message from a direct conversation and sees it under "Your reports".
- [ ] The sender edits the message; the admin still sees the original text as an earlier version.
- [ ] An admin removes the message; both members see it as deleted.
- [ ] Versions older than 30 days are pruned unless a report is pending.

## Out of scope

Reporting a whole conversation, showing edit history to participants, voice message transcripts.

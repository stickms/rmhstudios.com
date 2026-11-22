# 02 — Moderator notes in communities

Surface: the community member list (`components/feed/CommunityColumn.tsx`), the
mod queue (`components/communities/ModQueue.tsx`) and the Bans tab and dialog
from 01. Wave 4. Namespace `community-notes`.

## User story

As one of several moderators of a community, I want to leave short private notes
on a member — "warned about spoilers on 3 Nov", "asked to use flair" — that the
other moderators see when they next deal with that person, so that we act
consistently and nobody has to remember the history.

## Requirements elicitation

- **What exists (verified):** site admins have `ModeratorNote`
  (`prisma/schema/moderation.prisma`, sprint 03 04,
  `components/admin/ModeratorNotes.tsx`), scoped to the whole site and to admins.
  Community moderators have nothing: the community mod log
  (`CommunityModAction`) records actions, not notes. Erasure of site notes
  deletes notes *about* the member and nulls the author
  (`lib/account/deletion.server.ts`, the sprint 03 block).
- **Decisions:**
  - Notes belong to one community and are visible to that community's
    moderators and owner only. A member never sees notes about themselves, in
    the UI or in the export: the same default as site moderator notes, which is
    still an open owner decision ("moderator notes in the data export"); this
    feature follows it and decides nothing new.
  - Each note is plain text ≤ 500 characters. At most 50 live notes per member
    per community; the 51st is refused with a message.
  - Authors may edit their note within 15 minutes; after that, notes are
    append-only. Any moderator may delete a note (soft delete, `deletedAt`,
    `deletedById`), and the deletion is logged in the community mod log
    (`note_deleted`, members group).
  - Notes survive the member leaving or being removed or banned, so the history
    is there if they come back.
  - A note can optionally be linked to the sanction (01) or mod-queue item it
    was written with.

## Functional requirements

1. FR-1 In the member list, a moderator sees a "Notes (n)" control on each
   member row with notes; it opens a side dialog listing notes newest first
   (author, `t-meta` date, text, "Edited" marker), with an "Add note" field and
   one ink primary "Save note".
2. FR-2 The mod queue item and 01's sanction dialog show the latest two notes
   about the author inline (text on rules) with "All notes" opening FR-1's
   dialog. The sanction dialog gains "Also save the reason as a note" (off by
   default).
3. FR-3 A moderator can look up a former member's notes from the Bans tab
   (lifted and active rows link to the notes dialog).
4. FR-4 Edit (author, ≤ 15 minutes) and Delete (any moderator, `useConfirm`) on
   each note.
5. FR-5 Counts in FR-1 come from one grouped query for the visible page of
   members, never one query per row.

## Non-functional requirements

- **Correctness:** the cap check and insert run in a transaction after
  `lockKey(tx, 'community-note:' + communityId + ':' + subjectId)`. The edit
  window is checked with the database clock.
- **Security:** `auth: 'required'`; `rateLimit: 'write'` on writes; zod for text
  and ids; every endpoint checks `canModerate` for the community; a note id is
  always looked up with its `communityId` in the `where`, so a moderator of
  community A cannot read or delete notes of community B. Notes are never
  included in any member-facing payload, the public mod log, OG images or
  `/api/v1/**`.
- **Privacy:** erasure deletes notes whose subject is the member and nulls
  `authorId` and `deletedById` where they were the moderator; no export (see
  Decisions).
- **i18n:** `community-notes`.
- **Steel:** the dialog is an overlay with notes as rows on rules; dates `t-meta`;
  one ink primary.
- **Accessibility:** the notes control's accessible name includes the member and
  the count; the textarea has a visible label and a character counter announced
  politely.

## Data model and API

- `CommunityMemberNote { id String @id @default(cuid()), communityId,
  subjectId, authorId String?, body VarChar(500), banId String?, modItemId
  String?, createdAt @default(now()), editedAt DateTime?, deletedAt DateTime?,
  deletedById String? }`, relation to `Community` (cascade),
  `@@index([communityId, subjectId, createdAt(sort: Desc)])`,
  `@@map("community_member_note")` in `prisma/schema/communities.prisma`
  (new table, so plain indexes). `Community` back-relation `memberNotes`; no
  `User` relation (the ids are plain columns, like `CommunityModAction`), so
  `auth.prisma` is untouched. Migration `20261126040000_s06_community_notes`.
- `lib/communities/member-notes.ts` (pure: limits, edit window),
  `member-notes-schema.ts`, `member-notes.server.ts` (`listNotes`, `countNotes`,
  `addNote`, `editNote`, `deleteNote`, `communityNoteErasureOps`),
  `member-notes.contract.ts`.
- Modules `lib/communities/api/communities.$slug.notes.$userId.server.ts` (GET,
  POST), `communities.$slug.notes.$userId.$noteId.server.ts` (PATCH, DELETE),
  `communities.$slug.notes.counts.server.ts` (GET `?userIds=a,b,c`, at most 50).
- `components/communities/MemberNotesDialog.tsx`, `MemberNotesPreview.tsx`.
- `MOD_ACTIONS_BY_GROUP.members` gains `note_deleted`.

## Testing requirements

- Main suite `lib/communities/__tests__/community-notes.test.ts`: non-moderators
  get 403 on every endpoint; a moderator of another community gets 404 for a
  note id; cap of 50 under the lock; edit after 15 minutes refused; edit by
  another moderator refused; delete logs `note_deleted`; counts endpoint caps
  `userIds` at 50 and returns zero for members without notes.
- Main suite `lib/account/__tests__/community-notes-erasure.test.ts`.
- Product suite `lib/communities/__tests__/member-notes.product.test.ts`: edit
  window boundary, preview selection (latest two, deleted excluded).

## Acceptance criteria

- [ ] Moderator A writes a note on a member; moderator B sees "Notes (1)" on the
      row and in the mod queue next to that member's held post.
- [ ] The member sees nothing, anywhere, and the note is not in their export.
- [ ] A moderator of another community cannot read the note by id.
- [ ] Banning with "Also save the reason as a note" creates a note linked to the
      ban.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Notes shared across sister communities, notes visible to site admins in the
admin drawer (the site has its own notes), attachments.

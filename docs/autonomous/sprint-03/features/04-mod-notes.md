# 04 — Moderator notes on member accounts

Surface: `/admin/users` (the user moderation panel) and `/admin/reports` (a
note count on the reported member). Wave 7. Namespace `mod-notes`.

## User story

As a site moderator handling a report, I want to read and leave short internal
notes on a member's account — "warned in DMs about spam links, 14 Nov",
"identity confirmed for handle change" — so that the next moderator has the
context, decisions stay consistent, and nobody has to reconstruct history from
the audit log.

## Requirements elicitation

- **What exists (verified):** `components/admin/UserModerationPanel.tsx` (964
  lines) shows a member's strikes, restrictions, ban state and actions;
  `ContentReport.moderatorNote` is a note on **one report**; `UserStrike` has
  a reason; `AdminAuditLog` records admin actions (`/admin/audit`). There is
  **no place for a free-text note about the member** that persists across
  reports (no model or code for one: no `ModeratorNote`, `UserNote` or
  `modNote` anywhere).
- **Decisions:** notes are admin-only (the same `auth: 'admin'` gate as the
  rest of `/admin`), never shown to the member, never in the member's account
  export (they are the site's records, not the member's data — the same as
  `AdminAuditLog`), but **deleted when the member's account is deleted**
  (`anonymizeAccount`) so nothing about a deleted person survives. Notes are
  append-only with soft edit: an edit keeps the previous text in an
  `editedFrom` field so a note cannot be silently rewritten; deleting is a
  soft delete visible to admins as "Deleted by …". Each create, edit and
  delete writes `AdminAuditLog`. A note can be pinned (at most three pinned
  per member) for the standing context ("Known ban evader — see report …").

## Functional requirements

1. FR-1 The moderation panel gains a Notes section: pinned notes first, then
   newest first; each shows author, time, text (plain text, links detected
   but not followed automatically), and "edited" when edited.
2. FR-2 Add a note (1–2,000 characters) with an optional link to a report or
   strike of that member (picked from the member's own reports/strikes).
3. FR-3 Edit within 24 hours by the author only; any admin may pin, unpin or
   delete; deleted notes collapse to a "Deleted by … on …" line.
4. FR-4 `/admin/reports` rows show "N notes" on the reported member, linking
   to the panel's Notes section.
5. FR-5 A note's edit history (previous text) is visible on expand.
6. FR-6 `GET` notes are paginated (50 per page) and searchable by text within
   the member.

## Non-functional requirements

- **Security:** every endpoint is `auth: 'admin'`; rate limit `write` on
  mutations; text is zod-bounded and rendered as text (never HTML or
  Markdown); the member id is validated to exist; notes never appear in any
  non-admin serializer (a test asserts the member-facing standing endpoint and
  account export do not include them).
- **Privacy:** deleted with the member (`anonymizeAccount`); a note author who
  is deleted becomes "Deleted user" (`authorId` set null).
- **Performance:** `(subjectId, pinned, createdAt)` index; the reports page
  fetches counts for its visible members in one `groupBy`.
- **Accessibility:** the notes list is a list; the add form has a labelled
  textarea and a character counter announced politely.
- **i18n:** strings in `mod-notes`.
- **Steel:** rows on rules in the panel; "Add note" is the panel section's
  only primary button; destructive actions confirm through
  `components/ui/confirm-dialog`.

## Data model and API

- New model in `prisma/schema/moderation.prisma`:
  `ModeratorNote { id String @id @default(cuid()), subjectId String,
  authorId String?, body String @db.VarChar(2000), editedFrom String[]
  @default([]), reportId String?, strikeId String?, pinned Boolean
  @default(false), deletedAt DateTime?, deletedById String?, createdAt,
  updatedAt }`; relations: subject → `User` cascade, author → `User`
  `SetNull`; `@@index([subjectId, pinned, createdAt(sort: Desc)])`;
  `@@map("moderator_note")`.
- Migration `20261123070000_s03_moderator_notes`.
- `lib/moderation/notes.server.ts`, `lib/moderation/notes-schema.ts`,
  `lib/moderation/notes.contract.ts`; pure `lib/moderation/notes.ts` (edit
  window, pin limit). Modules
  `lib/moderation/api/admin.users.$id.notes.server.ts` (GET, POST),
  `lib/moderation/api/admin.users.$id.notes.$noteId.server.ts` (PATCH,
  DELETE), and a counts field added to the admin reports list response
  (`lib/admin/api/admin.reports.server.ts`).
- `anonymizeAccount` deletes notes whose `subjectId` is the member.

## Testing requirements

- Main suite `lib/moderation/__tests__/moderator-notes.test.ts`: non-admins get
  403 on every endpoint; edit after 24 h or by another admin is refused; the
  fourth pin is refused; edits keep the previous text; audit rows are written.
- Main suite `lib/account/__tests__/moderator-notes-erasure.test.ts`:
  `anonymizeAccount` deletes notes about the member; the standing endpoint and
  the export do not contain notes.
- Product suite `lib/moderation/__tests__/notes.product.test.ts`: edit window
  and pin rules.

## Acceptance criteria

- [ ] A note added from the panel appears for another admin with its author.
- [ ] The member's own standing page and export show nothing of it.
- [ ] Editing keeps the previous text visible on expand.
- [ ] Deleting the member's account removes the notes.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Community moderators' notes (community tools are separate), notes on content
rather than members, sharing notes with the member.

## As built

Implemented as specified: admin-only endpoints (`auth: 'admin'`, `write` rate limit on mutations), 24 h author-only edit window, at most 20 edits (`editedFrom` history), at most 3 pins, soft delete keeping `deletedAt`/`deletedById` (text withheld from the API), audit rows for create/edit/pin/unpin/delete, one `groupBy` for note counts on both queue endpoints, erasure in `anonymizeAccount` (notes about the member deleted; authored and deleted-by ids nulled). `/admin/users` accepts `?q=&open=` (length-capped in `validateSearch`).

Owner decision needed: notes are excluded from the member's data export, as the spec decided (site records, like `AdminAuditLog`). A formal data-access request (GDPR/CCPA subject access) may still oblige the site to disclose notes about the requester; handle that request manually through the owner until a policy is set.

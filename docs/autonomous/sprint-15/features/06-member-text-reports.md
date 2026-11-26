# 06 — Report a guestbook entry or an announcement comment, and blocks that hide them

Surface: a profile's guestbook (`components/profile/GuestbookPanel.tsx`), an announcement's discussion
(`components/announcements/AnnouncementDiscussion.tsx`), the moderation queue, Your reports, the data export. Wave 3.
Namespace `member-text-reports`. Site tier (Steel).

## User story

As a member visiting a profile or reading an announcement's discussion, I want to report a guestbook entry or a comment
that is abusive, and I want comments from people I blocked or muted to stay out of an announcement's discussion, so that
the two places members write publicly on the site tier with no report path finally have one.

## Requirements elicitation

- **What exists (verified):**
  - **Guestbook** (`GuestbookEntry`, `prisma/schema/profile.prisma`: `ownerId`, `authorId`, `body` 280, `hiddenAt`):
    `readGuestbook` / `signGuestbook` (`lib/guestbook/guestbook.server.ts`), served by
    `lib/guestbook/api/profile.$id.guestbook.server.ts`. Blocks run both ways and the owner's mutes hide entries; the
    owner can hide any entry, the author can delete their own. Visitors see every entry the owner has not hidden, and
    **cannot report one** (`guestbook-entry` is not a report type). The sign refusals are English strings returned as
    `{ error }` ("This guestbook is not open to you", "You can sign this guestbook once a day"), not coded refusals.
  - **Announcement comments** (`BlogComment`, `prisma/schema/library.prisma`: `postId`, `userId`, `content` 2000,
    `deletedAt`): listed by `GET /api/blog/$slug/comments` (`lib/blog/api/blog.$slug.comments.server.ts`) with **no
    block, mute or ban filter**, written by its `POST` (which runs `screenNewContent` and the `comment` timeout),
    soft-deleted by the author or an admin (`lib/blog/api/blog.comments.$id.server.ts`), rendered by
    `components/announcements/AnnouncementDiscussion.tsx`. No report path.
  - Neither is in the data export.
  - The member-item report path as in feature 04 (the six report files, the takedown test).
- **Decisions:**
  - **Two report types:** `guestbook-entry` (the `GuestbookEntry` id) and `blog-comment` (the `BlogComment` id), member
    items, removable. Eligibility: the reporter can read it (the guestbook's own `readGuestbook` rules; an announcement
    that is published), it is not their own, not already hidden or deleted. A guestbook's owner reporting an entry in
    their own guestbook is allowed (they can hide it themselves too; the report adds the moderator).
  - **Takedown:** a guestbook entry is deleted (the owner's hide is a different, reversible act); an announcement
    comment is soft-deleted (`deletedAt`), as the admin delete does.
  - **Blocks, mutes and bans in announcement comments:** the list leaves out hidden authors for a signed-in viewer and
    banned authors for everyone; `total` counts what the viewer can see.
  - **Coded guestbook refusals:** `GUESTBOOK_CLOSED` ("This guestbook is not open to you") and `GUESTBOOK_DAILY_LIMIT`
    ("You can sign this guestbook once a day"), so the panel shows them in the reader's language.
  - **Export:** entries the member wrote (owner's handle, body, time, hidden or not) and announcement comments (post
    title, content, time), under the Wave 0 export anchor.
  - **Entry points:** "Report" in each guestbook entry's actions and each comment's menu, never on one's own.

## Functional requirements

1. FR-1 Report path: both types under the Wave 0 anchors in the six report files (eligibility, takedown, preview: the
   body, the profile or announcement it is on, the author).
2. FR-2 `lib/blog/api/blog.$slug.comments.server.ts`: the hidden and banned filter; `lib/blog/blog-comments.server.ts`
   gains the shared where-builder.
3. FR-3 `lib/guestbook/guestbook.server.ts` returns codes; the route answers `refusalBody(code)`; the two codes under
   the Wave 0 anchor in `lib/errors/codes.ts` and `components/errors/refusal-sentence.ts`.
4. FR-4 UI: report items in `GuestbookPanel.tsx` and `AnnouncementDiscussion.tsx` (lazy `ReportDialog`); the panel's
   refusal through `useRefusalText`.
5. FR-5 Export: `exportGuestbookAndComments(userId)` (new, `lib/guestbook/export.server.ts`) under the anchor.
6. FR-6 `MUTE_READ_PATHS` gains the announcement comment read under the anchor.

## Non-functional requirements

- **Query shapes (verify against the schema):** `BlogComment.deletedAt` and `GuestbookEntry.hiddenAt` are optional
  (`null` filters allowed); `userId` and `authorId` are required (`notIn`, never `null`).
- **The announcement comments GET** keeps its current headers: `HEADERS` is already `Cache-Control: private, no-store`
  (checked at validation), which the per-viewer filter needs; a test pins it.
- **Steel:** entries and comments stay rows on rules; the report item lives in the existing action row or menu.

## Testing requirements

- Main suite `lib/moderation/__tests__/member-text-reports.test.ts` (fakes through `shapeChecked`): eligibility for
  each type (own, hidden, deleted, unreadable guestbook refused), takedowns, previews.
- Main suite `lib/blog/__tests__/blog-comment-hidden.test.ts`: blocked, blocking, muted and banned authors left out;
  `total` matches.
- Main suite `lib/guestbook/__tests__/guestbook-refusals.test.ts`: both codes, `refusalBody` shape.
- `lib/moderation/__tests__/music-reports.test.ts`, the error-code catalogue, the export test.

## Acceptance criteria

- [ ] A visitor reports a guestbook entry; "Resolve and remove" deletes it.
- [ ] A reader reports an announcement comment; "Resolve and remove" removes it.
- [ ] A blocked member's announcement comments are not shown to the blocker.
- [ ] Signing a guestbook twice in a day shows the refusal in the reader's language.
- [ ] The data export lists the member's guestbook entries and announcement comments.

## Out of scope

Chart reviews (`ChartReview` has a composite key and would need a key encoding of its own; recorded), replies to
announcement comments, editing an entry.

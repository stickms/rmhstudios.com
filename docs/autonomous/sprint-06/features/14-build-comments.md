# 14 — Build comments: edit, delete, hide, lock, report

Surface: the comments on a User Build's page (`/builds/$slug`,
`components/user-builds/BuildComments.tsx`). Wave 4. Namespace `build-comments`.

## User story

As a member who commented on a build, I want to fix a typo or take a comment
back. As the build's creator, I want to hide an abusive comment, close comments
on an old build, and report someone, and I want people I blocked kept out of my
comments, so that my build page is a place I am glad to send players to.

## Requirements elicitation

- **What exists (verified):**
  - `BuildComment` (`prisma/schema/builds.prisma`): `content` ≤ 2 000,
    `parentId`, timestamps; `UserBuild.commentCount` is maintained on create.
  - `lib/api/routes/user-builds.$id.comments.server.ts` has GET (list) and POST
    (create) only. POST is declared `auth: 'none'` and checks the session by
    hand, rate-limits by IP, refuses `PRIVATE` builds, and does **not** check
    blocks or bans. GET (also `auth: 'none'`) selects the build's `visibility`
    but never checks it (`lib/api/routes/user-builds.$id.comments.server.ts`
    lines 26-61), so anyone with a `PRIVATE` build's id can read its comments. There is no edit, delete, creator moderation, lock or
    report path; `ContentReport.entityType` does not include build comments
    (`REPORT_ENTITY_TYPES`, `lib/moderation/report-constants.ts`).
  - Creators are told about comments through `watchBuildComment`
    (`lib/discovery/watch.server.ts`).
  - Post comments already have the patterns to copy: hidden replies
    (`hiddenAt` on `RMHarkComment`), conversation controls (sprint 03 03).
- **Decisions:**
  - **Author:** edit within 30 minutes of posting (shows "Edited"; no history
    kept, as the post comment edit window does not either — check
    `lib/feed/api/rmharks.$id.comment*.server.ts` and match it); delete at any
    time (soft: `deletedAt`, content replaced by "Comment deleted" when it has
    replies, removed from the list when it has none).
  - **Creator** of the build: hide any comment (`hiddenAt`, `hiddenById`): the
    comment collapses to "Hidden by the creator" with "Show" for everyone except
    its author, who sees it normally with a note; unhide; lock comments
    (`UserBuild.commentsLocked`): existing comments stay, new ones and replies
    are refused with "Comments are closed".
  - **Admin:** delete any comment (as moderation, `deletedBy: 'moderator'`).
  - **Blocks and bans:** a member blocked by the creator, or who blocked the
    creator, cannot comment or reply (refused like any other interaction); a
    banned member cannot comment. A reply to a member who blocked you is
    refused.
  - **Reports:** anyone signed in can report a comment (entity type
    `build-comment`); the admin report view shows its text and build.
  - `commentCount` counts visible, non-deleted comments: decremented on delete,
    unchanged on hide (hidden comments are still visible behind "Show").
  - The list refuses a `PRIVATE` build to everyone but its creator and admins
    (404, the same answer as a missing build), closing the gap above.
  - The POST handler moves to the standard `implement()` options
    (`auth: 'required'`, `rateLimit: 'write'`, `body`) — a change of
    mechanism, not of behaviour.

## Functional requirements

1. FR-1 Each comment has a menu (`components/ui/menu.tsx`): Edit (author, within
   30 minutes), Delete (author; admin), Hide / Unhide (creator), Report (others).
2. FR-2 Edit is inline with Save (ink primary) and Cancel; Delete is confirmed
   with `useConfirm`.
3. FR-3 The creator sees "Close comments" / "Open comments" above the list.
4. FR-4 Hidden comments render collapsed per Decisions; the author sees
   "The creator hid this comment from others".
5. FR-5 Blocked and banned members see no composer, with one line saying they
   cannot comment here (no reason given).
6. FR-6 The list endpoint returns per comment `canEdit`, `canDelete`, `canHide`
   for the viewer so the client never computes rights.
7. FR-7 Every read path of build comments (the list endpoint, any build page
   loader that prefetches comments, the build insights comment count, and any
   `/api/v1/builds*` field that includes comments or counts) is listed in
   `BUILD_COMMENT_READ_PATHS` (`lib/builds/comments.ts`) and applies
   `visibleComment()`; a gate test holds the list against the source.

## Non-functional requirements

- **Correctness:** delete and its `commentCount` decrement are one transaction;
  edit checks the window with the database clock; hide is a conditional
  `updateMany` scoped to the build's creator.
- **Security:** zod for content (1–2 000), ids; every mutation looks the
  comment up with its `buildId` in the `where`; creator rights come from
  `UserBuild.userId`, admin rights from the session; text rendered as text.
- **Performance:** block checks use `isBlockedPair` once per request; the list
  query adds no N+1 (rights computed from the row and the build).
- **Privacy:** erasure matches post comments: `anonymizeAccount` keeps a deleted
  member's published comments (`RMHarkComment`) under the anonymised
  "Deleted user" row and does not scrub them, so build comments stay too
  (deleting them is the deletion policy's call, which sprint 05 left to the
  owner). Under its anchor 14 only nulls `hiddenById` where the member was the
  creator who hid. The account export lists post comments but not build
  comments (`lib/account/api/account.export.server.ts`), so 14 adds
  `exportBuildComments(userId)` (build title and slug, content, dates,
  `editedAt`, `deletedAt`; not `hiddenById`) under its own anchor in
  `lib/account/export-sprint-06.server.ts`.
- **i18n:** `build-comments`.
- **Steel:** comments stay rows on rules; the menu is an overlay; one ink
  primary in the edit form.
- **Accessibility:** the collapsed "Show" is a button with `aria-expanded`; the
  menu trigger's accessible name includes the commenter.

## Data model and API

- `BuildComment` gains `editedAt DateTime?`, `deletedAt DateTime?`, `deletedBy
  VarChar(12)?` (`'author' | 'moderator'`), `hiddenAt DateTime?`, `hiddenById
  String?`; `UserBuild` gains `commentsLocked Boolean @default(false)`.
  Migration `20261126040200_s06_build_comments`.
- `lib/builds/comments.ts` (pure: windows, rights, `visibleComment`,
  `BUILD_COMMENT_READ_PATHS`), `comments-schema.ts`, `comments.server.ts`
  (`editComment`, `deleteComment`, `hideComment`, `setCommentsLocked`,
  `buildCommentErasureOps`, `exportBuildComments`), `comments.contract.ts`.
- `lib/api/routes/user-builds.$id.comments.server.ts`: list applies
  `visibleComment` and rights; POST uses the standard options and checks lock,
  blocks and bans. New modules
  `lib/builds/api/user-builds.$id.comments.$commentId.server.ts` (PATCH,
  DELETE), `user-builds.$id.comments.$commentId.hide.server.ts` (POST, DELETE),
  `user-builds.$id.comments-lock.server.ts` (PUT).
- `REPORT_ENTITY_TYPES` gains `build-comment`, and `REMOVABLE_REPORT_ENTITY_TYPES` with it (a `takedownReportedContent` branch in `lib/moderation/triage.server.ts` that soft-deletes with `deletedBy: 'moderator'`); the admin report resolver shows
  its snapshot and offers "Delete comment".
- `components/user-builds/BuildComments.tsx` (menu, edit, hidden state, lock
  control), new `components/user-builds/BuildCommentMenu.tsx`.

## Testing requirements

- Main suite `lib/builds/__tests__/build-comments.test.ts`: edit after 30 minutes
  refused; another member's edit and delete refused; creator hides and unhides;
  a non-creator cannot hide; locked build refuses new comments and replies;
  blocked either way refused; banned refused; delete decrements the count once;
  admin delete marks `deletedBy: 'moderator'`; the list never returns a
  deleted comment's content; the list of a `PRIVATE` build is 404 for anyone
  but its creator and admins.
- Main suite `lib/builds/__tests__/build-comment-read-paths.test.ts` (source
  scan).
- Main suite `lib/account/__tests__/build-comments-erasure.test.ts`.
- Product suite `lib/builds/__tests__/comments.product.test.ts`: rights matrix,
  `visibleComment` for each state.

## Acceptance criteria

- [ ] A commenter fixes a typo within 30 minutes; the comment shows "Edited".
- [ ] The creator hides an insulting comment; others see it collapsed; the
      creator closes comments and new ones are refused.
- [ ] Someone the creator blocked cannot comment.
- [ ] A reported comment appears in `/admin/reports` with its text, and an admin
      can delete it.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Comment history, pinned build comments, comment votes, moderation by
teammates.

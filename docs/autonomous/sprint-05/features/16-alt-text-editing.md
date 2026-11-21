# 16 — Describe images after posting

Surface: the post overflow menu (`components/feed/RMHarkOverflowMenu.tsx`) on
the member's own posts, a new "Images without descriptions" section in Settings
> Content (`app/routes/_site/settings/content.tsx`), and a registered endpoint.
Wave 4. Namespace `alt-text-editing`.

## User story

As a member who posted a picture without a description, I want to add or fix the
description afterwards — and to find all my posts whose images still lack one —
so that people using screen readers can follow my posts without me deleting and
reposting them.

## Requirements elicitation

- **What exists (verified):** `RMHark.imageAlts` (`prisma/schema/social.prisma`)
  holds per-image descriptions aligned with `imageUrls`, set only at creation
  (`createRMHarkSchema.imageAlts`, `MAX_IMAGE_ALT_LENGTH`, `MAX_RMHARK_IMAGES`
  in `lib/rmhark-schema.ts`; trimmed in `lib/feed/api/rmharks.server.ts`). The
  post `PATCH` (`lib/feed/api/rmharks.$id.server.ts`) edits text and records
  edit history (`RMHarkEdit`); it does not touch descriptions. Require-alt-text
  mode (X12, `lib/feed/alt-text.server.ts`, `missingAltIndexes` in
  `lib/feed/alt-text.ts`) only checks new posts. Sprint 03 added descriptions to
  message images (`message-alt-text`), not posts.
- **Decisions:** descriptions are accessibility metadata, so editing them is not
  a content edit: it does not create an `RMHarkEdit` row, does not show
  "edited", and is allowed on posts of any age, but not on deleted posts, on
  posts locked by moderation (the same `locked` rule the GET uses), or by anyone
  but the author. The image list itself cannot change. The settings section
  lists the member's own posts with at least one image without a description,
  newest first.

## Functional requirements

1. FR-1 The overflow menu on one's own post with images gains "Edit image
   descriptions", opening a dialog with each image (thumbnail with its current
   description as alt) and a text area per image with a live character count
   (`MAX_IMAGE_ALT_LENGTH`).
2. FR-2 Saving updates the post's descriptions; the post updates in place in the
   feed, the post page and the thread (refetch or cache update through the
   existing query keys).
3. FR-3 Settings > Content gains "Images without descriptions": the count, then
   rows (thumbnail, post's first line, date, "Describe") that open the same
   dialog; 20 per page.
4. FR-4 A post fully described leaves the list at once.
5. FR-5 The section is hidden when the member has no such posts; it explains why
   descriptions matter in one sentence.

## Non-functional requirements

- **Security:** module with `implement()`, `auth: 'required'`,
  `rateLimit: 'write'`, body `{ alts: string[] }` zod-validated (`length`
  exactly the post's image count, each ≤ `MAX_IMAGE_ALT_LENGTH`, trimmed,
  control characters stripped as at creation). Author-only (403 otherwise; 404
  for deleted).
- **Read paths:** the new descriptions must appear everywhere the post's images
  render: feed (`lib/feed/map-feed-item.server.ts`), post page and thread,
  embeds (`app/routes/embed.post.$id.tsx`), RSS if it includes images
  (`lib/feed/rss.server.ts`), `/api/v1/posts*` (`imageAlts` is additive if
  absent), and any server-side cache of a post (search the code for caches keyed
  by post id, e.g. `post-detail-prefetch`); bust or update each.
- **Performance:** the missing-descriptions list uses
  `@@index([userId, createdAt])` on `rmhark` (check the existing index name in
  the schema) and filters `imageUrls` not empty in SQL, then `missingAltIndexes`
  in JS over the page (no full scan of the member's posts per request: keyset
  pages of 100 candidates, return the first 20 that qualify, plus a "load more"
  cursor). The count is capped at "99+".
- **i18n:** `alt-text-editing`.
- **Steel:** dialog is an overlay; rows on rules with `t-meta` dates; thumbnails
  are pictures (`bg-site-bg-subtle`, 1px border, 8px radius); one ink primary
  (Save) in the dialog.
- **Accessibility:** each text area is labelled "Description of image {{n}} of
  {{total}}"; the thumbnail uses the current description (or empty `alt=""` with
  a visible "No description" label); focus returns to the menu trigger on close
  via `onCloseAutoFocus`.

## Data model and API

No schema change. `lib/feed/alt-text-edit.server.ts` (`updatePostAlts`,
`listPostsMissingAlts`), contract `lib/feed/alt-text-edit.contract.ts`, modules
`lib/feed/api/rmharks.$id.alt-text.server.ts` (PUT) and
`lib/feed/api/settings.missing-alt-text.server.ts` (GET `?after=`). Check
`lib/api/__tests__/route-table.test.ts`'s rule about a static path beside a
`$param` sibling (`/api/rmharks/$id` is a route file today):
`/api/rmharks/$id/alt-text` is a deeper path and does not collide, but confirm
the dispatcher serves it.

## Testing requirements

- Main suite `lib/feed/__tests__/alt-text-edit.test.ts`: author can edit; others
  403; deleted 404; locked refused; wrong array length 400; no `RMHarkEdit` row
  is written; the list returns only the caller's posts with a missing
  description and pages.
- Product suite `lib/feed/__tests__/alt-text-edit.product.test.ts`: sanitising,
  count capping.

## Acceptance criteria

- [ ] A member adds a description to an old post's image and a screen reader
      reads it in the feed, on the post page and in an embed.
- [ ] The post does not show "edited".
- [ ] The settings list shows exactly the member's posts with undescribed
      images.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Descriptions for comment images, changing images after posting, automatic (AI)
descriptions (sprint 03 rejected them as a cost decision).

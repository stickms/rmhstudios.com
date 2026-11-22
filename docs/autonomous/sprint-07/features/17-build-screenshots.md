# 17 — Screenshots on build pages, with descriptions

Surface: the build form (`components/user-builds/BuildForm.tsx`), the build
page (`/builds/$slug`, `components/user-builds/BuildDetail.tsx`), build cards.
Wave 4. Namespace `build-screenshots`.

## User story

As a creator publishing a game I built, I want to upload a cover and up to
eight screenshots, each with a description, and put them in order, so that
people can see what my build is before they unlock or play it — and so that
people using a screen reader can too.

As a visitor, I want to look through the screenshots on the build page at a
readable size.

## Requirements elicitation

- **What exists (verified):**
  - `UserBuild` (`prisma/schema/builds.prisma`) has one `thumbnailUrl`, a pasted
    URL ("Thumbnail URL" in `BuildForm.tsx`, saved by
    `lib/api/routes/user-builds.$id.server.ts`); no gallery and no description
    for the cover.
  - The upload pipeline `lib/media/ingest.server.ts` declares a **`build`
    surface** ("User Build cover art": 5 MB, still images, one 1280 px variant,
    all metadata stripped, no quota) that **no route uses** (`grep -rn
    "'build'" lib/media lib/api` finds only the policy and its test); its own
    comment says build covers are uploaded through `/api/rmharks/image` (the
    `post` policy, which strips only GPS). `lib/media/api/rmharks.image.server.ts`
    is the pattern for an upload module.
  - Builds already have releases (sprint 04 04), insights (sprint 04 05),
    comments with moderation (sprint 06 14) and reports.
- **Decisions:**
  - **Upload through the `build` surface** with a new module
    `POST /api/user-builds/$id/images` (the build's owner only; multipart, one
    image per request), so build images get the stricter `strip: 'all'`
    policy. The cover can be uploaded (it sets `thumbnailUrl`) or still pasted
    as a URL, as today.
  - **Gallery:** up to **8 screenshots** per build (`BuildScreenshot`: url,
    width, height, description ≤ 500 characters, position). A description is
    **required to publish** a screenshot (the form will not save a screenshot
    without one; a draft upload is held in the form until described). The
    cover gets an optional description too (`UserBuild.thumbnailAlt`), used
    wherever the cover renders (cards, the page, OG card alt).
  - Reorder with Move up / Move down (keyboard accessible); delete with
    `useConfirm`. **Storage (decided in validation):** the upload module calls
    `ingest(file, 'build', { userId, record: true })`, so every upload gets a
    `Media` row with status `PENDING`; the existing sweep
    (`lib/media/sweep.server.ts`, `sweepUnreferencedMedia`, PENDING past the
    orphan TTL) reclaims uploads that were never saved. Saving a screenshot
    or an uploaded cover sets its `Media` row to `ATTACHED` with no `postId`
    and no `attachedAt` (the emoji-pack shape the sweep deliberately skips).
    Deleting a screenshot, replacing an uploaded cover, or deleting the build
    removes the row and the object (`deleteObject` from
    `lib/storage/s3.server.ts`) and the `Media` row.
  - **Build page:** a strip of screenshots under the description (images on
    `--site-bg-subtle` with a 1px border and 8px radius, S4), each a button that
    opens a viewer dialog (the overlay surface) showing the image at up to 1280
    px with its description as visible text below it, Previous/Next buttons and
    arrow keys, Escape closes, focus returns to the thumbnail.
  - Visibility follows the build: a private or unlisted build's screenshots are
    served only where the build is served (the build page and the owner's
    tools); public listings never list them.
  - Screenshots appear in the build's existing payloads where the cover does
    (build page loader, `/api/v1/builds/$slug` as an additive `screenshots`
    array), never in list endpoints (cards keep the cover only).
  - A reported build that is taken down hides its screenshots with it (same
    row state).

## Functional requirements

1. FR-1 The upload module and the gallery editor in `BuildForm.tsx` (upload,
   describe, reorder, delete, cover upload and cover description).
2. FR-2 The screenshot strip and viewer on the build page.
3. FR-3 `thumbnailAlt` used on build cards (`BuildCard.tsx`), the build page and
   the build OG card.
4. FR-4 `/api/v1/builds/$slug` gains `screenshots: { url, width, height,
   description }[]` and `thumbnailAlt` (additive; registry and `NULLABLE`
   updated in place, SDK and docs regenerated).
5. FR-5 Saving a build with an undescribed screenshot is refused (400
   `DESCRIPTION_REQUIRED` with the index) on the server, not only in the form.

## Non-functional requirements

- **Security:** owner-only writes (`auth: 'required'`, ownership checked in the
  query), `rateLimit: { limit: 20, windowMs: 60_000, prefix: 'build-image' }`,
  the 8-screenshot cap checked under `lockKey(tx, 'build-screenshots:' +
  buildId)`; zod for every field; the `build` surface's MIME and size limits.
- **Privacy:** `strip: 'all'` (no EXIF of any kind survives).
- **Performance:** images carry width and height so the page reserves space
  (no layout shift); thumbnails load lazily; the viewer loads one image at a
  time; no preloading at rest.
- **Steel:** pictures are the one boxed thing (S4); the viewer is the overlay
  surface with the overlay shadow, no blur; opening fades 160 ms opacity only.
- **Accessibility:** every screenshot has its description as `alt`; the viewer
  is a dialog with a label, arrow-key navigation and a visible description.
- **Export:** the member's builds' screenshots (url, description) are in the
  export through the sprint export file.
- **i18n:** `build-screenshots`.

## Data model and API

- `BuildScreenshot { id String @id @default(cuid()), buildId, url VarChar(500),
  width Int, height Int, description VarChar(500), position Int, createdAt
  @default(now()) }`, `@@index([buildId, position])`, relation to `UserBuild`
  (cascade), `@@map("build_screenshot")`; `UserBuild.thumbnailAlt String?
  @db.VarChar(500)`. Migration `20261127040200_s07_build_screenshots`.
- `lib/builds/screenshots.ts` (pure: `MAX_SCREENSHOTS = 8`, validation,
  reorder), `screenshots-schema.ts`, `screenshots.contract.ts`,
  `screenshots.server.ts` (`uploadBuildImage`, `saveScreenshots`,
  `listScreenshots`, `exportBuildScreenshots`).
- Modules `lib/builds/api/user-builds.$id.images.server.ts` (POST upload) and
  `user-builds.$id.screenshots.server.ts` (GET, PUT the ordered list with
  descriptions).
- UI: `components/user-builds/ScreenshotEditor.tsx`, `ScreenshotStrip.tsx`,
  `ScreenshotViewer.tsx` (lazy-loaded dialog); edits to `BuildForm.tsx`,
  `BuildDetail.tsx`, `BuildCard.tsx`, the build OG card in `lib/og/`.

## Testing requirements

- Main suite `lib/builds/__tests__/build-screenshots.test.ts`: owner-only
  upload and save; the 8 cap under two concurrent saves; undescribed screenshot
  refused; reorder persisted; a private build's screenshots absent from public
  payloads; takedown hides them; the upload uses the `build` surface (spy on
  `ingest`).
- Product suite `lib/builds/__tests__/screenshots.product.test.ts`.
- Component test for the viewer: arrow keys, Escape, focus return, description
  visible.
- Gate tests: zod-off-hot-routes (the viewer and editor dialogs lazy-loaded),
  OG coverage, design consistency, Steel flat, arrival coverage.

## Acceptance criteria

- [ ] A creator uploads a cover and five screenshots, describes each, reorders
      them, and the build page shows them in that order.
- [ ] A screen reader reads each screenshot's description; the viewer works
      with the keyboard alone.
- [ ] A photo with GPS and camera EXIF is stored with none.
- [ ] A ninth screenshot is refused.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Video clips, animated images, screenshots per release, image moderation
beyond the existing report flow.

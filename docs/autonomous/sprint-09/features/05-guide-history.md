# 05 — A game guide's history

Surface: the guide page (`/games/$gameId/guides/$guideId`), a new history page
(`/games/$gameId/guides/$guideId/history`), the guide editor. Wave 3. Namespace `guide-history`.

## User story

As the author of a game guide, I want to see what I changed and when, compare two versions, and put back an earlier one,
so that a careless rewrite of a guide people rely on is never permanent.

## Requirements elicitation

- **What exists (verified):**
  - `updateGuide` (`lib/games/meta.server.ts`) snapshots the previous body as a `GameGuideRevision`
    (`prisma/schema/games.prisma`: `body`, `note`, `createdAt`) whenever the body changes, keeping at most
    `MAX_REVISIONS = 50` (oldest dropped in the same transaction). **Nothing reads them**: no endpoint returns revisions
    and `components/games/GuideView.tsx` (557 lines, its own inline editor) never shows one. The editor never sends a
    `note`. A revision row is the body **before** an edit, carrying the note of the edit that replaced it (the current
    body lives on the guide).
  - Guides have one author (`GameGuide.authorId`; `updateGuide` refuses anyone else); contracts are in
    `lib/games/guides.contract.ts` (`createGuideApi`, `updateGuideApi`, `deleteGuideApi`, `publishGuideApi`), handlers
    in `lib/games/api/guides.$id.server.ts`.
  - `components/communities/DocEditor.tsx` (live since 04) was written for "community wiki pages (F21) and game guides",
    prop-driven, with a summary field.
  - `lib/toolbox/diff.ts` (sprint 01 04, the text diff tool) computes a line diff in pure code.
  - The guide route `app/routes/games/_library/$gameId_.guides.$guideId.tsx` has a loader; a child file would nest under
    it.
  - `GameGuide` is `owner` in the erasure registry (a deleted member's guides are an open owner decision); revisions
    cascade with the guide.
- **Decisions:**
  - **Author only.** History is shown to the guide's author (and admins); readers see "Updated <date>" as today. Earlier
    versions can hold material the author removed on purpose; publishing them is not this feature's call.
  - **Route:** `app/routes/games/_library/$gameId_.guides.$guideId_.history.tsx` (the `_` after `$guideId` un-nests it
    from the guide route), `noindex`, its loader's server function guards with `requireSessionServerFn` and returns 404
    unless the viewer is the author or an admin.
  - **Endpoints:** `listGuideRevisionsApi` (`GET /api/guides/$id/revisions`: id, note, created at, length; newest first)
    and `getGuideRevisionApi` (`GET /api/guides/$id/revisions/$revisionId`: the body), and `restoreGuideRevisionApi`
    (`POST …/$revisionId/restore`): restoring calls `updateGuide` with the revision's body and the note "Restored the
    version of <date>", so the current body becomes a revision first and history is never rewritten. Same rate limits as
    `updateGuideApi`. **Restore is the author's alone**: `updateGuide` refuses anyone but the author, and an admin
    restoring someone's guide would be an edit in their name; admins can read the history (moderation), not restore it.
  - **Compare:** the history page lists edits as rows on rules (date, the edit's note, size change in `t-meta`), each
    opening the version before that edit; choosing one shows a line diff against the current text (or against the
    next-newer revision, a toggle), added lines marked with a `+` gutter and removed with `−` (text, not only colour;
    `--site-success` and `--site-danger` text on the plain page, no tinted boxes, D8 stays open).
  - **Editor:** `GuideView`'s inline editor is replaced by `DocEditor` (title, body, the summary field as the revision
    note); behaviour of save, publish and delete is unchanged.
  - **Export:** `exportGuideRevisions(userId)` (guide id, game, note, created at, body) for the member's own guides
    under the `s09-05` anchor. Guides are single-author, so every revision body is the member's own text. Guides
    themselves are **not** in the data export today (no guide section in `account.export.server.ts` or
    `export-sprint-0*.server.ts`); this feature also adds `guides` (id, game, title, body, published, created and
    updated) to the same section, since a history without the current text is half an export.

## Functional requirements

1. FR-1 The three endpoints (contract + `implement()`): the two reads for the author or an admin, restore for the author
   only; checks inside each handler.
2. FR-2 The history route with list, diff, restore (through `useConfirm`).
3. FR-3 `GuideView` on `DocEditor`, sending the note.
4. FR-4 A "History" link on the guide page for the author.
5. FR-5 The export section; the sitemap anchor line (private `$param` route).

## Non-functional requirements

- **Correctness:** restore goes through `updateGuide`, inheriting its transaction and the 50-revision bound; a revision
  id from another guide is a 404.
- **Performance:** the list query selects no bodies; the diff is computed in the browser from two bodies fetched on
  demand; bodies over 200 000 characters show "Too long to compare" instead of diffing.
- **Design:** Steel site tier (the guide page is under the library layout); rows on rules; one ink primary per view
  ("Restore this version").
- **Accessibility:** the diff is a list whose items say "Added line" / "Removed line" to assistive technology.

## Data model and API

- No schema change. New `lib/games/guide-history.server.ts`, `lib/games/guide-history.contract.ts`,
  `lib/games/api/guides.$id.revisions.server.ts`, `lib/games/api/guides.$id.revisions.$revisionId.server.ts`,
  `components/games/GuideHistory.tsx`, the route file. Edits: `components/games/GuideView.tsx`,
  `lib/games/meta.server.ts` (export helper), `lib/sitemap.ts` (anchor), `lib/account/export-sprint-09.server.ts`
  (anchor). `components/communities/DocEditor.tsx` only if a prop is missing (additive, keeping 04's callers working).

## Testing requirements

- Main suite `lib/games/__tests__/guide-history.test.ts` (mock Prisma): author sees revisions, another member and a
  signed-out viewer get 404, admin sees them but cannot restore (403), restore by the author writes the current body as
  a revision with the note, a revision of another guide is 404.
- Product suite `components/games/__tests__/guide-diff.product.test.ts` (pure diff adapter over `lib/toolbox/diff.ts`):
  added, removed, unchanged lines; the too-long cut-off.
- `lib/__tests__/server-fn-guard-ratchet.test.ts`, `lib/__tests__/sitemap-coverage.test.ts`, the route table test.

## Acceptance criteria

- [ ] An author edits a guide twice with notes; the history lists both with their notes and the size change.
- [ ] Comparing shows the removed paragraph with a `−` gutter.
- [ ] Restoring the first version makes it current and adds a revision; the replaced text is still in history.
- [ ] Another member opening the history URL gets "Not found".

## Out of scope

Co-authors, public history, revisions of the title, a diff view for community wiki pages (04 has history without diff; a
follow-up can reuse `GuideHistory`'s diff list).

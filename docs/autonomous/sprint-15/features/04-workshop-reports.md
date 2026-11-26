# 04 — Report a TF2 HUD, a TF2 loadout or a Versecraft story, and take your own story down

Surface: the TF2 workshop (`/tf2/workshop`, `/tf2/hud-editor/h/$slug`, `/tf2/loadout/l/$slug`), Versecraft's seed
gallery, the moderation queue (`/admin/reports`), Your reports. Wave 1. Namespace `workshop-reports`. App tier (L8) in
the workshop and Versecraft; site tier (Steel) in the queue and Your reports.

## User story

As a member browsing the TF2 workshop or Versecraft's shared stories, I want to report a HUD, a loadout or a story
whose name or description is abusive, and as the author of a Versecraft story, I want to take it down myself, so that
the public shelves members fill have the same safety path as every other member-made item.

## Requirements elicitation

- **What exists (verified):**
  - **TF2 HUDs** (`Tf2Hud`, `prisma/schema/games/tf2.prisma`: `title` 80, `description` 2000, `tags`, `visibility`
    `PRIVATE` / `UNLISTED` / `PUBLIC`) and **loadouts** (`Tf2Loadout`: the same text fields and visibility) are
    member-written and listed publicly in the workshop. Their readers are centralised: `listHuds`, `getHud`,
    `getHudByShare`, `readFile`, `readSharedFile`, `countDownload`, `forkHud` (`lib/tf2-hud/hud.server.ts`) and
    `listLoadouts`, `getLoadout`, `forkLoadout` (`lib/tf2-loadout/loadout.server.ts`); the shop also reads loadouts
    (`lib/shop/loadouts.server.ts`).
  - **Versecraft seed listings** (`VersecraftSeedListing`, `prisma/schema/games/versecraft.prisma`: a member-written
    `title` 80 on a shared world) are listed by `GET /api/versecraft/seeds` (`lib/versecraft/api/versecraft.seeds.server.ts`,
    rendered by `components/versecraft/SeedGallery.tsx`). The list applies **no block or ban filter**, an author
    **cannot unpublish** a listing (the route has `GET` and `POST` only), and the per-author cap
    (`MAX_LISTINGS_PER_AUTHOR`) therefore fills for good.
  - None of the three is a report type (`REPORT_ENTITY_TYPES`, `lib/moderation/report-constants.ts`). Sprint 14's
    design recorded both as follow-ups ("TF2 HUDs and Versecraft seed listings have public member-written names and no
    report path").
  - The member-item report path (sprint 12 16, sprint 14 07–10): `MEMBER_ITEM_REPORT_TYPES` (public, not the
    reporter's own, not already removed), `REMOVABLE_REPORT_ENTITY_TYPES` with a branch in
    `takedownReportedContent` (`lib/moderation/triage.server.ts`, held by
    `lib/moderation/__tests__/music-reports.test.ts`), eligibility in `lib/moderation/api/moderation.report.server.ts`,
    the queue preview in `triage.server.ts`, Your reports in `lib/moderation/my-reports.server.ts` and
    `components/moderation/MyReportsPanel.tsx`, the label in `components/feed/report-kind-label.ts`, and the dialog
    `components/moderation/ReportDialog.tsx`.
- **Decisions:**
  - **Three types:** `tf2-hud` (the `Tf2Hud` id), `tf2-loadout` (the `Tf2Loadout` id), `versecraft-seed` (the
    `VersecraftSeedListing` id); member items, removable.
  - **Removal stamps `moderatedAt`** (new nullable column on each model) and, for a HUD or a loadout, sets
    `visibility: 'PRIVATE'` in the same `updateMany` (as `moderateDeck` sets `isPublic: false`), so a later restore by
    feature 16 clears the stamp without publishing on the owner's behalf: a removed HUD or loadout leaves every list,
    detail, fork, share, file and download path for everyone but its owner, who sees it marked "Removed by a
    moderator" and cannot make it public, rename it or fork it; a removed seed listing leaves the gallery (its world
    stays: other players' saves may be on it). Private HUDs and loadouts cannot be reported (only `PUBLIC` and
    `UNLISTED` ones a reporter can open).
  - **A read-path registry**, `WORKSHOP_READ_PATHS` (`lib/moderation/workshop-moderation.ts`, new), lists every reader
    above with a source scan, as `GAME_CONTENT_READ_PATHS` does.
  - **Take your own story down:** `DELETE /api/versecraft/seeds/$id` for the author (the world and its ratings are
    kept; the listing row and its ratings go). A moderated listing cannot be deleted by its author either (it keeps the
    record), but stops counting toward the cap.
  - **Blocks and bans:** the seed gallery leaves out listings by banned authors and by members blocked either way
    (`getHiddenAuthorIds`), as the HUD and loadout lists will (the same helper, added in their `where`).
  - **Entry points:** "Report" in the HUD and loadout detail menus and on each seed card (not on one's own); "Take
    down" on the author's own seed card, with a confirm.

## Functional requirements

1. FR-1 Schema: nullable `moderatedAt` on `Tf2Hud`, `Tf2Loadout`, `VersecraftSeedListing`; migration
   `20270105010200_s15_workshop_reports`.
2. FR-2 Report path: the three types under the Wave 0 anchors in the six report files; eligibility (public or
   unlisted, not own, not removed); takedown branches stamping `moderatedAt`; queue previews (title, owner, kind);
   Your reports rows.
3. FR-3 Readers: every path in `WORKSHOP_READ_PATHS` filters `moderatedAt: null` for non-owners; owner views mark it.
4. FR-4 `lib/versecraft/api/versecraft.seeds.$id.server.ts` (new) `DELETE`; the gallery's own-card control.
5. FR-5 Blocks and bans in the three lists.
6. FR-6 UI: the report items (lazy `ReportDialog`), the owner's "Removed by a moderator" line, the seed card controls.

## Non-functional requirements

- **Takedowns stick:** a removed item cannot be made public again by its owner (the update functions refuse with
  `GAME_CONTENT_REMOVED_BY_MODERATOR`, the sprint 14 code, reused).
- **Content-addressed blobs** are not deleted on a takedown (other HUDs may share them).
- **Query shapes (verify against the schema):** `moderatedAt` is optional (`null` filters allowed); `Tf2Hud.tags` is
  `String[]` (`has`, not `contains`); the seed list's `include` keeps `ratings` filtered by `userId`.
- **App tier:** the workshop and Versecraft keep their own look (L8); the queue and Your reports are Steel.
- **The engine project (CLAUDE.md §12):** `lib/tf2-hud/**` and `lib/tf2-loadout/**` outside `*.server.ts` are
  `tsconfig.engine.json` files and may import only themselves and `lib/core`: the `moderatedAt` / removed flag may join
  the engine's response types (`lib/tf2-hud/api-types.ts`, `lib/tf2-loadout/api-types.ts`), but `ReportDialog`, `t()`
  and every other site import stay in the site-tier UI (`app/routes/tf2/**`, `components/tf2-hud/**`). A new test beside
  `hud.server.ts` that imports it is named `*.server.test.ts` (or listed in `tsconfig.site.json`'s `files` and the
  engine `exclude`); the HUD and loadout engine suites run with `pnpm test:tf2`, not `pnpm test`.
- **Routing:** `DELETE /api/versecraft/seeds/$id` sits beside the static `seeds/rate` and `seeds/fork`; the dispatcher
  prefers a static segment (`lib/api/route-match.ts`), and `lib/api/__tests__/route-table.test.ts` must stay green.

## Testing requirements

- Main suite `lib/moderation/__tests__/workshop-reports.test.ts` (fakes through `shapeChecked`): eligibility per type
  (private, own, removed refused), takedown stamps, the queue preview.
- Main suite `lib/moderation/__tests__/workshop-read-paths.test.ts`: the source scan.
- Main suite `lib/versecraft/__tests__/seed-delete.test.ts`: only the author; a moderated listing refused; ratings go.
- `lib/moderation/__tests__/music-reports.test.ts` (every removable type has a takedown branch), the TF2 HUD and loadout
  suites (`lib/tf2-hud/__tests__/`), `lib/__tests__/migration-safety.test.ts`.

## Acceptance criteria

- [ ] A member reports a public HUD, a loadout and a story; each appears in the queue with its title and author.
- [ ] "Resolve and remove" takes each off the workshop or gallery for everyone but its owner.
- [ ] The owner sees "Removed by a moderator" and cannot publish it again.
- [ ] A story's author can take it down from the gallery, and publish another in its place.
- [ ] A blocked member's stories and HUDs do not appear in the lists.

## Out of scope

Reporting a HUD's files or a story's generated prose, HUD comments, the TF2 game's own servers.

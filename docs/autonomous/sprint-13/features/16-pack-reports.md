# 16 — RMHBox packs in the report queue

Surface: `/rmhbox-packs` ("Report" opens the site's report dialog), `/admin/reports` (pack reports with the pack's name
and prompts; remove or dismiss and restore), "Your reports", the RMHBox lobby's pack loader. Wave 3. Namespace
`pack-reports`. Site tier (Steel).

## User story

As a member who finds an abusive RMHBox prompt pack, I want my report to reach a moderator who reads it, and to see what
was decided. As a pack's author whose pack was hidden by a few reports, I want a moderator to look and restore it if the
reports were wrong, instead of it staying hidden for ever.

## Requirements elicitation

- **What exists (verified):**
  - Packs: `RmhboxPack` (`prisma/schema/games/rmhbox.prisma`: `name`, `prompts` JSON, `featured`, `hidden`,
    `reportCount`) and `RmhboxPackReport` (`packId`, `reporterId`, free-text `reason` up to 200, `@@unique([packId,
    reporterId])`). `reportPack` in `lib/party/packs.server.ts` stores a report, increments `reportCount`, and hides the
    pack at `PACK_AUTOHIDE_REPORTS` (3, `lib/party/packs.ts`). The route is
    `lib/rmhbox/api/rmhbox.packs.$id.report.server.ts`; admins feature, hide and delete packs through
    `rmhbox.packs.$id.server.ts` (`adminSetPack`) from the packs page `components/party/PacksPage.tsx`.
  - **Nothing reads `RmhboxPackReport`** (written only; the registry keeps it as "a moderation record"). The page's
    confirmation says "Packs with several reports are hidden until a moderator reviews them", but no moderator page
    lists pack reports, so three accounts can hide any pack indefinitely and no reporter hears an outcome.
  - The site's report system (`ContentReport`, `lib/moderation/api/moderation.report.server.ts`, the triage in
    `lib/moderation/triage.server.ts`, "Your reports" in `lib/moderation/my-reports.server.ts` and
    `components/moderation/MyReportsPanel.tsx`, the dialog `components/moderation/ReportDialog.tsx`) covers 20 types; a
    hidden pack is already refused by the game's loader (`server/rmhbox/pack-loader.ts`, `hidden: false`).
- **Decisions:**
  - **One report system:** report type `rmhbox-pack` (entity id the pack id), removable. The pack page's "Report" opens
    `ReportDialog`; `POST /api/rmhbox/packs/$id/report` stays for old clients and files the same `ContentReport` (the
    route's body reason becomes the report's `details` with reason `OTHER`), so there is one queue.
  - **Auto-hide stays** (three distinct open reports hide the pack, as now), but is now counted from open
    `ContentReport` rows, inside one transaction under `lockKey(tx, 'pack-report:<packId>')` (the duplicate check, the
    insert, the count and the hide), so two reports racing at the threshold hide once and a reporter cannot file twice.
    An auto-hide stamps a new `RmhboxPack.autoHiddenAt`, so the system can tell a pack the reports hid from one an
    admin hid by hand (`adminSetPack({ hidden: true })` clears `autoHiddenAt`: an admin's hide is a decision, not a
    waiting state). A pack with `autoHiddenAt` set is shown in triage as "Hidden by reports — waiting for review".
  - **Decisions:** "Remove" sets `RmhboxPack.moderatedAt` and `hidden` (the owner sees "Removed by a moderator" on their
    own pack and cannot unhide or feature it; an admin's `adminSetPack` refuses to unhide a moderated pack unless the
    report is reopened); "Dismiss" on the last open report of a pack with `autoHiddenAt` set (and no `moderatedAt`)
    **restores** it (`hidden` false, `autoHiddenAt` null) and resets `reportCount`; a pack an admin hid by hand stays
    hidden whatever is dismissed. The reporter and the author hear the outcome through the existing report-decision notices
    (sprint 12 19's keys).
  - **History:** a migration copies every existing `RmhboxPackReport` into `content_report` (reason `OTHER`, details the
    old text, status `PENDING` when the pack is still hidden and not deleted, `DISMISSED` otherwise), so the reports
    already filed are finally read. `RmhboxPackReport` stays (no longer written; its registry entry is unchanged).
  - **The moderator sees** the pack's name, game, prompt count and its first 20 prompts (a moderation read path).

## Functional requirements

1. FR-1 Migration `20261220030100_s13_pack_reports`: `ALTER TABLE "rmhbox_pack" ADD COLUMN "moderatedAt" TIMESTAMP(3)`,
   `ALTER TABLE "rmhbox_pack" ADD COLUMN "autoHiddenAt" TIMESTAMP(3)`, one `UPDATE "rmhbox_pack" SET "autoHiddenAt" =
   now() WHERE "hidden" AND "reportCount" >= 3` (today every hidden pack with three reports was hidden by them), and one
   `INSERT INTO "content_report" (…) SELECT … FROM "rmhbox_pack_report" …` (data, one statement, ids from
   `gen_random_uuid()::text`, `"targetUserId"` the pack's owner, idempotent with `WHERE NOT EXISTS` on
   `("reporterId", "entityType", "entityId")`).
2. FR-2 `lib/party/packs.server.ts`: `reportPack` files a `ContentReport` (the existing dedupe on `[entityType,
   entityId]` and reporter), auto-hides from open reports; `adminSetPack` refuses to unhide a moderated pack;
   `takeDownPack`, `restoreReportedPack`, `packPreviews` (new, `lib/party/pack-moderation.server.ts`).
3. FR-3 Report type under the Wave 0 anchors: `report-constants.ts` (both lists), `moderation.report.server.ts`
   (`resolveTargetUser` → the owner; refuse own pack and a deleted pack), `triage.server.ts` (takedown, dismiss-restore,
   previews), `my-reports.server.ts`, `MyReportsPanel.tsx`.
4. FR-4 UI: `PacksPage.tsx` opens `ReportDialog` (its own report confirmation and toast are removed; the dialog's
   are used); the owner's "Removed by a moderator" line on their own moderated pack. The existing sentence "Packs with
   several reports are hidden until a moderator reviews them" becomes true and keeps its key.
5. FR-5 The lobby loader already ignores hidden packs; `listPacks` excludes moderated packs from every shelf except
   the owner's own (marked).

## Non-functional requirements

- **Moderation reach:** a removed pack is in no shelf, search or lobby (`pack-loader.ts`, `listPacks`), and its owner's
  own toggle cannot bring it back (a test for each reader).
- **Abuse:** reports by the owner and repeat reports are refused as today; three reports still hide quickly.
- **Design (Steel):** no change to the packs page's layout beyond the dialog and one line of text.

## Data model and API

`RmhboxPack.moderatedAt DateTime?`, `RmhboxPack.autoHiddenAt DateTime?`. Report type `rmhbox-pack`.

## Testing requirements

- Main suite `lib/party/__tests__/pack-reports.test.ts`: a report files a `ContentReport`; three distinct reporters
  hide and stamp `autoHiddenAt`; two reports racing at the threshold hide once (mocked lock order); a manual admin hide
  is not restored by a dismissal; remove sets `moderatedAt` and sticks against `adminSetPack` and the owner; dismissing the last open report of
  an auto-hidden pack restores it; the old route files the same report.
- The same file reads the migration `20261220030100_s13_pack_reports` and asserts the copy's table and quoted column
  names (`"rmhbox_pack_report"`, `"content_report"`, `"entityType"`, `"entityId"`).
- `lib/moderation/__tests__/music-reports.test.ts` (every removable type has a takedown branch), `my-reports` tests,
  user-text direction (pack names in the admin preview).

## Acceptance criteria

- [ ] A member reports a pack and sees the report under "Your reports".
- [ ] An admin sees the pack's prompts in `/admin/reports` and removes it; it is gone from every shelf and lobby.
- [ ] A pack hidden by three wrong reports is restored when an admin dismisses them.
- [ ] Reports filed before this feature appear in the queue.

## Out of scope

Editing a pack's prompts as a moderator, appeals, per-prompt reports.

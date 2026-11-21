# 20 — Moderation queue triage: grouping, filters and bulk decisions

Surface: `/admin/reports`. Wave 3. Namespace `report-triage`. Depends on 16
(bulk decisions must notify every reporter through its function).

## User story

As a site moderator facing a queue where one viral post has forty reports and
a spam wave has a hundred, I want reports about the same thing grouped into one
row, to filter by reason and kind, to see how reliable a reporter's past
reports were, and to resolve or dismiss many at once — so that I clear the
queue in minutes and the worst content gets seen first.

## Requirements elicitation

- **What exists (verified):** `/admin/reports`
  (`app/routes/_site/admin/reports.tsx`, 249 lines) lists reports one by one,
  newest first, filtered by status only
  (`lib/admin/api/admin.reports.server.ts`: `?status=`, cursor, counts per
  status); each is decided alone through `admin.reports.$id.server.ts`
  (resolve or dismiss, optional takedown, macro message to the author, audit
  log). Forty reports on one post are forty rows and forty decisions. There is
  no filter by reason or entity type, no ordering by volume, and no signal of
  reporter reliability. `components/ui/selection-bar.tsx` exists for bulk
  selection UIs; macros exist (`components/safety/MacroField.tsx`).
- **Decisions:** the queue's default view groups open reports by target
  `(entityType, entityId)`: one row with the report count, the distinct
  reasons with counts, first and last report times, the content preview and
  the target member. Ordering: "Most reported" (default), "Oldest first",
  "Newest". A group decision applies to every open report in it, in one
  transaction, with the same takedown, macro and audit behaviour as a single
  decision (the single-report path is refactored into a function both use).
  Reporter reliability is the share of the reporter's decided reports in the
  last 180 days that were `RESOLVED` (shown only with at least 5 decided
  reports, as "Reports by this member were upheld 8 of 10 times"); it orders
  nothing automatically — it is information. Bulk selection across groups
  (up to 50 groups) with the selection bar: Resolve, Dismiss. The ungrouped
  list stays available as a toggle.

## Functional requirements

1. FR-1 Grouped view: one row per target with count, reasons, times, preview,
   target member, and the reliability of its reporters (the share of
   reporters with an upheld rate ≥ 70 %, as a sentence).
2. FR-2 Filters: reason (multi-select, sent as a comma list), entity type,
   "only with at least N reports"; sort as above; all in the URL search
   params so a view can be linked.
3. FR-3 Expanding a group shows its individual reports (reporter, reason,
   details, time, reporter reliability).
4. FR-4 Deciding a group (Resolve with optional takedown and macro, or
   Dismiss) decides all its open reports; the response says how many.
5. FR-5 Bulk: select groups, Resolve or Dismiss from the selection bar
   (takedown is per group only, never bulk — a bulk takedown is too easy to
   get wrong); a confirm dialog states the count.
6. FR-6 Every reporter of every decided report is notified once through 16's
   `notifyReportersOfOutcome`.
7. FR-7 The status tabs and counts stay; counts are of reports, and the
   grouped view also shows the number of groups.

## Non-functional requirements

- **Security:** `auth: 'admin'` on every endpoint; group decisions re-check
  each report's status inside the transaction (compare-and-set, as the single
  path does) and skip reports another moderator decided meanwhile; bulk is
  capped at 50 groups / 1,000 reports per request; every decided report is
  audit-logged (one audit row per group with the report count, plus the
  existing per-report row if the single path writes one — keep it
  consistent).
- **Performance:** grouping in SQL (`groupBy` on `entityType, entityId` with
  `_count` and `_min/_max(createdAt)`), using a new
  `@@index([status, entityType, entityId])`; reporter reliability for the
  reporters on the page in one `groupBy` over `(reporterId, status)` (the
  index from 16); page size 25 groups.
- **Accessibility:** group rows are a list with a checkbox each (labelled with
  the target), the selection bar announces the count, decisions confirm with
  a dialog that names the count.
- **i18n:** strings in `report-triage`; reason names reuse the report
  dialog's keys.
- **Steel:** rows on rules; the selection bar primitive; Resolve is the
  view's one primary only inside the selection bar or an expanded group, not
  on every row.

## Data model and API

- `ContentReport` gains `@@index([status, entityType, entityId])`. Migration
  `20261123030100_s03_report_triage_index`.
- `lib/moderation/triage.ts` (pure: group shaping, reliability, filters),
  `lib/moderation/triage.server.ts` (`listReportGroups`, `decideReports`),
  `triage-schema.ts` (query: `status`, `reasons` comma list, `entityType`,
  `min`, `sort`, `cursor`), `triage.contract.ts`.
- Refactor: `admin.reports.$id.server.ts`'s decision body moves into
  `decideReports([id], decision)` in `triage.server.ts`; the single endpoint
  calls it (its behaviour and tests unchanged).
- Modules `lib/admin/api/admin.reports.groups.server.ts` (GET),
  `admin.reports.groups.decide.server.ts` (POST `{ targets: [{entityType,
  entityId}], action, deleteContent?, message? }`).
- `app/routes/_site/admin/reports.tsx` gains the grouped view and filters
  (move the list into `components/admin/reports/` files to keep the route
  thin).

## Testing requirements

- Main suite `lib/moderation/__tests__/report-triage.test.ts`: non-admins get
  403; a group decision decides only open reports and skips one decided
  concurrently; bulk over the cap is refused; every reporter is notified once;
  takedown is refused in bulk; the single-report endpoint still behaves as
  before (existing tests pass).
- Product suite `lib/moderation/__tests__/triage.product.test.ts`: grouping,
  reliability threshold, filter parsing.

## Acceptance criteria

- [ ] Forty reports on one post show as one row with "40 reports".
- [ ] Resolving that row decides all forty and notifies all forty reporters.
- [ ] Filtering by Spam and sorting by most reported is linkable.
- [ ] Bulk dismissing ten groups confirms with the count and audit-logs them.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Automatic prioritisation by reliability, assigning reports to moderators,
moderator performance statistics.

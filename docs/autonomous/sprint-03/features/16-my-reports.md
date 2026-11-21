# 16 — Your reports: status and outcome for the reporter

Surface: `/settings/security` (a "Your reports" panel under Account standing)
and the notifications inbox. Wave 2. Namespace `my-reports`.

## User story

As a member who reported a post or a user, I want to see the reports I made,
whether a moderator has looked at them and what the outcome was, and be told
when one is decided — so that I know reporting is worth doing, and I do not
report the same thing again and again.

## Requirements elicitation

- **What exists (verified):** reports are created by
  `lib/moderation/api/moderation.report.server.ts` (`ContentReport`, statuses
  `PENDING`, `REVIEWING`, `RESOLVED`, `DISMISSED`). Moderators act in
  `/admin/reports` through `lib/admin/api/admin.reports.$id.server.ts`, which
  can notify **the reported author** (a macro message) but **never the
  reporter**. Members have an account standing page about reports against
  them (`AccountStandingPanel.tsx`, `lib/moderation/standing.server.ts`), and
  nothing about reports they made. The report dialog says "Thanks" and the
  report disappears from the member's view.
- **Decisions:** the reporter sees their own reports for 180 days: what they
  reported (a short label and a link if the content still exists and they can
  still see it), the reason they gave, the date, the status, and — once
  decided — an outcome in two words: "Action taken" (`RESOLVED`) or "No
  violation found" (`DISMISSED`). They never see the moderator's identity,
  note, the macro text sent to the author, or what action was taken (removal,
  strike, ban) — that is the reported member's business. When a report reaches
  a terminal state the reporter gets one in-site notification (respecting the
  "system" preference); bulk actions (20) use the same function. Members may
  withdraw a pending report.

## Functional requirements

1. FR-1 "Your reports" panel on `/settings/security`: rows of reports, newest
   first, 20 per page with "Load more": what, reason, date, status
   ("Waiting for review", "Being reviewed", "Action taken", "No violation
   found", "Withdrawn"), filterable by open and closed (`Tabs`).
2. FR-2 A pending report has "Withdraw" (confirm); a withdrawn report is kept
   for the reporter's history and leaves the admin queue (status `DISMISSED`
   with `withdrawnAt`, so moderators can still see that it was withdrawn).
3. FR-3 Deciding a report notifies its reporter once: "Your report was
   reviewed: action taken" or "…: no violation found", linking to the panel;
   the inbox labels it "Safety" (`systemIdentity`).
4. FR-4 The report dialog's success state links to "Your reports", and when
   the member already has an open report on the same content it says so
   instead of creating a duplicate (the server already deduplicates; the
   dialog shows its answer).
5. FR-5 Several reporters of the same content each get their own
   notification when the content's reports are decided together.

## Non-functional requirements

- **Security:** the list endpoint returns only the caller's reports and only
  allow-listed fields (no `moderatorNote`, `resolvedById`, `targetUserId` of a
  user report beyond the handle shown in the label); the content label is
  built with the viewer's visibility (a post now hidden from the reporter shows
  "A post that is no longer available").
- **Reliability:** the notification is sent once per report: claimed by
  setting `reporterNotifiedAt` in the same `updateMany` that moves the status,
  or in a follow-up `updateMany … where reporterNotifiedAt is null`.
- **Performance:** `@@index([reporterId, createdAt(sort: Desc)])` (the
  existing `reporterId` index is extended by a new composite one).
- **Accessibility:** status is text; Withdraw names the report in its label.
- **i18n:** strings in `my-reports`; reason labels reuse the report dialog's
  keys where they exist (read them, do not duplicate English).
- **Steel:** rows on rules inside the settings page, like Account standing.

## Data model and API

- `ContentReport` gains `reporterNotifiedAt DateTime?` and `withdrawnAt
  DateTime?`, and `@@index([reporterId, createdAt(sort: Desc)])`.
- Migration `20261123020100_s03_report_outcomes`.
- `lib/moderation/my-reports.ts` (pure: status → outcome, label kinds),
  `lib/moderation/my-reports.server.ts` (`listMyReports`, `withdrawReport`,
  `notifyReportersOfOutcome(reportIds)`), `my-reports-schema.ts`,
  `my-reports.contract.ts`.
- Modules `lib/moderation/api/account.reports.server.ts` (GET),
  `account.reports.$id.withdraw.server.ts` (POST).
- `lib/admin/api/admin.reports.$id.server.ts` calls
  `notifyReportersOfOutcome` after a terminal transition;
  `admin.reports.server.ts` excludes withdrawn reports from the pending queue.
- `components/moderation/MyReportsPanel.tsx` mounted in
  `app/routes/_site/settings/security.tsx`; `ReportDialog.tsx` success link.
- `exportMyReports(userId)` for the account export (integration wires it).

## Testing requirements

- Main suite `lib/moderation/__tests__/my-reports.test.ts`: the list returns
  only the caller's reports without moderator fields; withdrawing another
  member's report is 404; resolving notifies the reporter once even when
  called twice; dismissing notifies with the other outcome; the reported
  member's macro is not in the reporter's notification.
- Product suite `lib/moderation/__tests__/my-reports.product.test.ts`: status
  mapping and labels.

## Acceptance criteria

- [ ] After reporting a post, it shows as "Waiting for review" in Your
      reports.
- [ ] When a moderator resolves it, I get one notification and the row shows
      "Action taken".
- [ ] Withdrawing a pending report removes it from the admin queue.
- [ ] Nothing about the moderator or the action is shown to me.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Appeals by the reporter, email notifications, reports to community moderators
(13 handles those inside the community).

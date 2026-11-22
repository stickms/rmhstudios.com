# 09 — Bug reports on user builds

Surface: `/builds/$slug/issues` (new), the build page's Issues link and count, the creator's build management,
notifications. Wave 5. Namespace `build-issues`. Site tier (Steel).

## User story

As a player of a member's build, I want to report a bug with the steps that cause it and see whether the creator has
seen it and fixed it, and as the creator, I want those reports in one list I can mark "Confirmed", "Fixed in 1.2" or
"Won't fix", so that bugs stop getting lost in the comment thread.

## Requirements elicitation

- **What exists (verified):**
  - Builds: `UserBuild` (`prisma/schema/builds.prisma`), releases (`BuildVersion`, sprint 04 04,
    `lib/builds/releases.server.ts`), screenshots (sprint 07 17), comments with edit, delete, hide, lock and report
    (`BuildComment`, sprint 06 14, `lib/builds/comments.server.ts`), insights, RSS (sprint 08 17). The page is
    `app/routes/_site/builds/$slug.tsx` (a loader, so a child route nests unless it carries the `_` suffix) rendering
    `components/user-builds/BuildDetail.tsx`.
  - Reports: `ContentReport.entityType` with `build-comment` handled in `lib/moderation/api/moderation.report.server.ts`
    and `lib/moderation/triage.server.ts`.
  - No issue tracking: bug reports today are comments, with no status, no steps and no link to a release.
- **Decisions:**
  - **An issue** is a title (up to 120 characters), "What happened" (up to 4,000), optional "Steps to reproduce" (up to
    2,000), optional "Version" (one of the build's releases, defaulting to the latest), and the reporter's platform line
    chosen from a short list (desktop browser, phone browser, tablet) — no free-form device data is collected.
  - **Visibility:** issues of a public build are public (anyone who can see the build sees its issues); an unlisted
    build's issues follow the build's link-only visibility; a private or removed build's issues are 404. The creator can
    hide an issue (it then shows only to the creator and the reporter, as "Hidden by the creator").
  - **Statuses:** `open`, `confirmed`, `fixed` (with the release it was fixed in, chosen from the build's releases),
    `wont_fix` (with an optional reason up to 200 characters), `duplicate` (pointing at another issue of the same
    build). Only the creator changes status; the reporter may close their own open issue.
  - **"Me too".** Signed-in members can add "I see this too" once per issue (a count, shown as a `t-meta` figure; this
    is a count of people, so it goes through quiet counts only if a scan says it is a post count — it is not; it is
    classified in the quiet-count `EXEMPT` map with that reason only if the scan flags the field name).
  - **Notices:** the reporter is told when the status changes (`notice()` keys); the creator gets one "New issues on
    <build>" notice while an earlier one for that build is unread (`createNotification`'s `dedupeUnread` on the build;
    `lib/notifications/group.ts` groups on display only). Each "me too" member is told when it is fixed.
  - **Gates:** blocked in either direction cannot report or "me too"; site-banned cannot; at most 10 issues per member
    per build per day; locked comments do not lock issues (separate).
  - **Reports:** an issue can be reported to the site's moderators through the existing report flow as entity type
    `build-issue` (triage renders it like a build comment).
  - **Erasure:** a deleted reporter's issues stay as published content under "Deleted user" (as build comments do);
    their "me too" marks are erased with the count corrected.
  - **Export:** the member's issues (build, title, text, status) and "me too" marks.
  - **SEO:** `/builds/$slug/issues` is about one build: it unfurls with the build's own card (`ogCardPath('build', id)`)
    and is listed in `DYNAMIC_ROUTES` as content for public builds.

## Functional requirements

1. FR-1 Models `BuildIssue` and `BuildIssueVote`.
2. FR-2 `lib/builds/issues.server.ts`: list (filter by status, newest or most "me too"), read, create (gates, cap under
   `lockKey`), edit by the reporter while open, status change by the creator (compare-and-set on the previous status),
   hide and unhide, close by the reporter, me-too toggle.
3. FR-3 Registered endpoints with contracts under `/api/builds/$id/issues…`.
4. FR-4 `app/routes/_site/builds/$slug_.issues.tsx` (list with status filter through `components/ui/tabs.tsx`, the
   report form in a dialog), an issue's detail as an expanding row with the creator's status line; the build page shows
   "Issues (N open)" beside comments.
5. FR-5 The `build-issue` report entity in the report route and triage.
6. FR-6 Notices, labels, registry entries, the deletion operation, the export section.

## Non-functional requirements

- **Security:** status and hide checks are the creator's, inside the handler; the reporter sees their hidden issue,
  nobody else does; every read checks the build's own visibility first.
- **Moderation:** text renders as plain text with links not made live; `dir="auto"`.
- **Performance:** keyset pagination, 30 per page; one count query for the build page; the "fixed" notice to "me too"
  members goes through `lib/async-pool.ts`, capped at 500 recipients per issue (the reporter first).

## Data model and API

- `BuildIssue` (`@@map("build_issue")`): `id`, `buildId` → `UserBuild` (cascade), `reporterId` → `User` (relation
  `BuildIssuesReported`), `title`, `body`, `steps String?`, `versionId String?`, `platform`, `status`,
  `fixedInId String?`, `wontFixReason String?`, `duplicateOfId String?`, `hiddenAt DateTime?`,
  `voteCount Int @default(0)`, `createdAt`, `updatedAt`, `statusChangedAt DateTime?`;
  `@@index([buildId, status, createdAt])`, `@@index([reporterId, createdAt])`. `versionId`, `fixedInId` → `BuildVersion`
  and `duplicateOfId` → `BuildIssue` are relations with `onDelete: SetNull` (a deleted release or issue never leaves a
  dangling id); `reporterId` stays pointing at the anonymised `User` row at erasure (`anonymizeAccount` never deletes
  the row), which is how build comments show "Deleted user". `BuildIssueVote` (`@@map("build_issue_vote")`): `issueId` →
  `BuildIssue` (cascade), `userId` → `User` (relation `BuildIssueVotes`), `createdAt`, `@@id([issueId, userId])`,
  `@@index([userId])`. Migration `20261130050200_s10_build_issues`.
- New `lib/builds/issues.ts` (pure: statuses, transitions, limits), `issues-schema.ts`, `issues.contract.ts`,
  `issues.server.ts`, endpoint modules under `lib/builds/api/`, the route, `components/user-builds/BuildIssues.tsx`,
  `BuildIssueForm.tsx`.
- Edits: `components/user-builds/BuildDetail.tsx` (link and count), `lib/moderation/api/moderation.report.server.ts`,
  `lib/moderation/triage.server.ts`, and the anchored files (`auth.prisma`, `deletion.server.ts`,
  `export-sprint-10.server.ts`, `sitemap.ts`, notice keys and previews, notification labels and test, `user-text.ts`),
  `lib/account/erasure-registry.ts` (two entries).

## Testing requirements

- Main suite `lib/builds/__tests__/build-issues.test.ts`: a private build's issues 404; only the creator changes status;
  a stale status change (compare-and-set) does nothing; a hidden issue is visible to its reporter and creator only;
  blocked and banned refused; the daily cap; "me too" once, count kept right on toggle; duplicate must point at the same
  build.
- Main suite `lib/account/__tests__/build-issues-erasure.test.ts`: issues kept and their reporter shown as "Deleted
  user"; votes erased with the count decremented.
- Product suite `lib/builds/__tests__/issue-transitions.product.test.ts`.
- Report route and triage tests for `build-issue`; sitemap and OG coverage; route nesting (the file carries `$slug_`);
  notice-key, labels, erasure coverage, user-text direction.

## Acceptance criteria

- [ ] A player reports a bug on a public build; the creator marks it "Fixed in 1.3" and the player is told.
- [ ] Another player adds "I see this too" and is told when it is fixed.
- [ ] A hidden issue disappears for everyone except the creator and its reporter.
- [ ] Issues of a private build are not reachable.

## Out of scope

Attachments or screenshots on issues, comment threads on an issue, labels or assignees, issues through the developer
API, `rmhcode` CLI support.

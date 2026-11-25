# 09 — Mute, block or report from a profile, and report an impersonator

Surface: a member's profile (a menu beside Follow: Mute, Block, Report, "Pretending to be someone"), the admin report
queue (an impersonation report's side-by-side and the other accounts that claim the same website), Your reports. Wave
3. Namespace `profile-reports`. Site tier (Steel).

## User story

As a member who finds an account harassing me or pretending to be a friend of mine, I want to mute, block or report
it from its profile, and say who it is pretending to be, so that I do not have to find one of its posts first; and as
a moderator I want to see both accounts side by side and who else claims the same website.

## Requirements elicitation

- **What exists (verified):**
  - A profile has **no** mute, block or report control: `components/profile/ProfileHero.tsx` and
    `components/feed/ProfileColumn.tsx` open no `ReportDialog` and call neither `toggleBlockApi` nor `toggleMuteApi`
    (`lib/moderation/moderation.contract.ts`). A member can do all three only from a post's menu
    (`components/feed/RMHarkOverflowMenu.tsx`, with `MuteDurationChoices` from `components/feed/MuteDurationMenu.tsx`).
    `user` is a report type (`REPORT_ENTITY_TYPES`) the route resolves (`case 'user'`), and nothing files it.
  - Impersonation reports (J2) are built and unreachable: `POST /api/handles/impersonation` and the admin-only
    `GET /api/handles/impersonation?reportId=` (`lib/api/routes/handles.impersonation.server.ts`, bare
    `defineHandler`, no contract) over `fileImpersonationReport` and `getImpersonationComparison`
    (`lib/handles/impersonation.server.ts`: creation dates, former handles, claimed hosts, `contestedHosts`, name
    similarity), storing `entityType: 'impersonation'` with a structured header in `details`
    (`lib/handles/impersonation.ts`). **No screen calls either**, and `'impersonation'` is not in
    `REPORT_ENTITY_TYPES`, so the queue, Your reports and the kind labels show it as a raw string.
  - `accountsClaimingHost(host)` (`lib/profile-links/links.server.ts`, "the query a J2 impersonation investigation
    runs") has no caller. It claims "verified claims first" but orders `{ verifiedAt: 'desc' }`, and Postgres sorts
    `NULL`s **first** in a descending order, so unverified claims come first today; this feature fixes it with
    `{ verifiedAt: { sort: 'desc', nulls: 'last' } }` (`ProfileLink.verifiedAt` is optional, so `nulls` is valid).
  - `fileImpersonationReport` refuses with three reasons (`same-account`, `self-report`, `unknown-account`), answered
    today as `{ error, reason }` with 400 or 404 — no client reads them, so they can become coded refusals.
  - Mention search (`GET /api/feed/mention-search`, `lib/feed/feed-reads.contract.ts`) resolves a typed handle to an
    account for the composer.
- **Decisions:**
  - **The menu** (`components/profile/ProfileMenu.tsx`, new): on someone else's profile only, for a signed-in member, a
    "More" button opening `components/ui/menu.tsx` with "Mute" (the existing durations), "Block" (through `useConfirm`,
    the existing block semantics), "Report" (`ReportDialog`, `entityType: 'user'`) and "Pretending to be someone". The
    profile loader adds `viewerHasMuted` and `viewerHasBlocked` so the items read "Unmute" / "Unblock" when they apply.
  - **The impersonation form** (`components/profile/ImpersonationReportDialog.tsx`, new): "Who are they pretending to
    be?" as a handle field with mention search (or "Me"), and an optional note (700 characters); it posts through a
    new contract for the existing endpoint. The endpoint gains an optional `impersonatedHandle` (resolved on the server,
    the same "Account not found" refusal) beside `impersonatedUserId`; its refusals get codes: `unknown-account` →
    `IMPERSONATION_UNKNOWN` (404, "We could not find that account"), `self-report` and `same-account` →
    `IMPERSONATION_SELF` (400, "Choose a different account: an account cannot be reported for being itself, and you
    cannot report your own"). "Me" sends the reporter's own id as `impersonatedUserId`.
  - **The queue:** `'impersonation'` joins `REPORT_ENTITY_TYPES` (not removable, like `ride`: the decision acts on the
    account through the existing account tools). Because `reportSchema`'s `entityType` is `z.enum(REPORT_ENTITY_TYPES)`
    (`lib/moderation/report-schema.ts`), joining the list would let `POST /api/moderation/report` file an impersonation
    report without J2's structured header; the generic route therefore refuses `entityType: 'impersonation'` (as
    `INVALID_INPUT`, before any read), and the only way to file one stays `POST /api/handles/impersonation`, with its
    own rate limit and dedupe. A test holds that. An impersonation group in `components/admin/reports/ReportGroups.tsx`
    opens `components/admin/reports/ImpersonationComparison.tsx` (new): the two accounts side by side from the existing
    comparison, and for each host the accused claims, the other accounts claiming it (`accountsClaimingHost`, at most
    10, verified first, served by a new admin endpoint).
  - **Labels:** `kind-impersonation` / `gone-impersonation` in `MyReportsPanel.tsx` and `report-kind-label.ts`; the
    reporter's Your reports never shows the comparison.
  - **No new reason value:** the J2 design keeps `reason: 'OTHER'` with the entity type as the category; this feature
    keeps it (no enum change).

## Functional requirements

1. FR-1 `components/profile/ProfileMenu.tsx` and `components/profile/ImpersonationReportDialog.tsx` (new), mounted by
   `ProfileHero.tsx`; the profile read (`lib/profile.server.ts`) returns `viewerHasMuted` and `viewerHasBlocked` for a
   signed-in viewer.
2. FR-2 `lib/handles/impersonation.contract.ts` (new) for the POST and the admin GET; the route module moves under the
   contract through `implement()` (`lib/api/routes/handles.impersonation.server.ts`) with coded refusals; the schema in
   `lib/handles/impersonation.ts` accepts `impersonatedHandle` (exactly one of the two ids).
3. FR-3 `lib/admin/api/admin.reports.claims.server.ts` (new, `GET /api/admin/reports/claims?userId=`, `auth: 'admin'`,
   `rateLimit: 'read'`, no `cache:`): the accused's claimed hosts (at most 10), each with `accountsClaimingHost(host,
   11)` minus the accused (so at most 10 others), verified first after the `nulls: 'last'` fix in
   `lib/profile-links/links.server.ts`.
4. FR-4 Report path under `s14-09 profile-reports`: `'impersonation'` in `REPORT_ENTITY_TYPES`; the `case` in
   `resolveTargetUser` (the accused); the preview (the impersonated handle from the header, never the note's first
   line twice); the my-reports and label entries.
5. FR-5 Refusal codes under `// s14-09 profile-reports`.

## Non-functional requirements

- **Privacy:** the claims endpoint and the comparison are admin only; a reporter sees only their own report's status.
- **Abuse:** the endpoint's rate limit stays (5 an hour per member) and its one-open-report-per-pair dedupe stays.
- **Accessibility:** the menu button has a name ("More options for {{name}}"); every item is a menu item; the handle
  field is labelled.
- **Query shapes (verify against the schema):** `viewerHasMuted` reads the mute rows with their expiry rule
  (`MUTE_READ_PATHS`, `lib/moderation/mute-expiry.ts`: add the profile reader there); `ProfileLink.host` is optional,
  so filter `host: { not: null }` (valid: optional column).

## Data model and API

No schema change. `POST /api/handles/impersonation` accepts `impersonatedHandle`; `GET /api/admin/reports/claims`
→ `{ hosts: { host, verified, others: { userId, handle, name, verified }[] }[] }`.

## Testing requirements

- Main suite `lib/handles/__tests__/impersonation-handle.test.ts`: a handle resolves, an unknown handle and reporting
  oneself are refused with codes, the dedupe still holds.
- Main suite `lib/admin/__tests__/report-claims.test.ts`: admin only, the accused left out, verified first (the
  `orderBy` asserted as `{ verifiedAt: { sort: 'desc', nulls: 'last' } }`), capped.
- The report route's tests: `entityType: 'impersonation'` through `POST /api/moderation/report` is refused and writes
  nothing.
- `components/profile/__tests__/profile-menu.test.tsx` (`renderToStaticMarkup`): no menu on one's own profile or
  signed out; item labels follow the mute and block state.
- `lib/moderation/__tests__/member-reports.test.ts` and `report-triage.test.ts` (the report route and the queue), `lib/__tests__/field-names.test.ts`, `lib/moderation/__tests__/mute-read-paths.test.ts`,
  `lib/errors/__tests__/error-codes-catalogue.test.ts`.

## Acceptance criteria

- [ ] From another member's profile a member mutes them for a week, blocks them, or reports the profile.
- [ ] "Pretending to be someone" with a handle files an impersonation report, and the queue shows it as
      "Impersonation" with both accounts side by side.
- [ ] The moderator sees which other accounts claim the accused's website, verified ones first.
- [ ] None of the menu appears on one's own profile.

## Out of scope

A new report reason, automatic action on impersonation, reports of a profile's individual modules.

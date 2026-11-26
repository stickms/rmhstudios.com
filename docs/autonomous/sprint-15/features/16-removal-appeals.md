# 16 — Hear when a report takes something of yours down, and ask for a second look

Surface: the inbox (a notice when a report removes a member's item), the Account status section of
`/settings/security` (`#account-status`, where every "Account status" link already lands) gaining a "Removed after a
report" list and "Ask for a second look", the admins' appeals page (`/admin/appeals`, a "Removal reviews" tab). Wave 4.
Namespace `removal-appeals`. Site tier (Steel).

## User story

As a member whose public deck, guide, pack or HUD was taken down after a report, I want to be told what was removed,
and to ask a moderator to look again when I think it was a mistake, so that a removal is neither silent nor final by
default.

## Requirements elicitation

- **What exists (verified):**
  - The report queue's "Resolve and remove" runs `decideReports` → `takedownReportedContent`
    (`lib/moderation/triage.server.ts`). The item's author (`ContentReport.targetUserId`) is told **only when the
    moderator types a message** (`notice('report-decision', { message })`); otherwise the takedown is silent. Reporters
    always hear the outcome (`notifyReportersOfOutcome`).
  - Many member-item takedowns only stamp `moderatedAt` and could be undone: study decks (`moderateDeck`), personas
    (`moderatePersona`), home listings (`moderateListing`), RMHBox packs (`takeDownPack`), game reviews, guides and
    achievement tips (sprint 14 08), and this sprint's TF2 HUDs, loadouts and Versecraft stories (04). Others delete
    (posts' admin delete, comments, DMs, song audio) and cannot be undone. Nothing lets an author contest either.
  - Strikes have an appeal flow (`/admin/appeals`, `app/routes/_site/admin/appeals.tsx`, contracts in
    `lib/admin/admin-ops.contract.ts`) shown to the member in `components/moderation/AccountStandingPanel.tsx`, which is
    rendered inside `/settings/security`.
  - **`/settings/account-status` is a redirect, not a page** (corrected at validation; the design pass said every link
    opened a missing page). `ACCOUNT_STATUS_LINK` (`lib/moderation/restrictions.server.ts`) is that path, strike and
    moderation notices link to it (`lib/moderation/strikes.server.ts`, `lib/moderation/content.server.ts`), and
    `components/feed/NotificationsColumn.tsx` maps `moderation` and `strike` notices to it; `LEGACY_REDIRECTS`
    (`lib/route/legacy-redirects.ts`, "Settings that became a section of another settings page", the 2026-11-19
    consolidation) forwards it to `/settings/security#account-status`, the `SettingsSection id="account-status"` that
    `AccountStandingPanel` renders, and the site search (`lib/search/catalog.ts`) points there too. The links work; what
    is missing is any record of a removal on that section.
- **Decisions:**
  - **A removal record:** a new table `ContentRemoval` (`reportId` unique, `entityType`, `entityId`, `authorId`,
    `removedAt`, `reversible`, `reviewRequestedAt`, `reviewNote` 500, `reviewDecidedAt`, `reviewOutcome`
    `upheld` | `restored`, `reviewedById`; `authorId` is a `User` relation with `onDelete: Cascade`, `reviewedById` a
    plain optional column that erasure nulls; no reporter column). `decideReports` writes one per removed target with
    an author, in the same
    pass that runs the takedown (after it succeeds), idempotent on `reportId`.
  - **The author is told** with a keyed notice: `content-removed-after-report` ("Your {{kind}} was removed after a
    report.") or, when the moderator wrote a message, `content-removed-after-report-message` (with `{{message}}`), which
    replaces the `report-decision` notice for a takedown (never two notices). `kind` is the entity type; the preview
    renders it through `reportKindLabel` (`components/feed/report-kind-label.ts`) so it reads in the reader's language.
  - **A second look**, only for reversible types (`REVERSIBLE_REMOVAL_TYPES`, new, `lib/moderation/removal-reviews.ts`),
    exactly: `study-deck`, `persona`, `home-listing`, `rmhbox-pack`, `game-review`, `game-guide`, `achievement-tip`,
    `tf2-hud`, `tf2-loadout`, `versecraft-seed`. Not `tube-room` (the room was closed and its members told; clearing
    the stamp would not reopen it) and not the hiding types (`lights-out-board`, `connections-grid`, `studio-share`,
    `webring`, `stamp`), whose takedowns are not a `moderatedAt` stamp. Once per removal (the `ContentRemoval` row), within
    14 days of `removedAt`, with an optional note: "Ask for a second look". The request is a conditional `updateMany`
    (`id`, `authorId` = caller, `reversible: true`, `reviewRequestedAt: null`, `removedAt` within 14 days), so a double
    click asks once. A deleted item says "This was deleted and cannot be restored" instead.
  - **The admin decides** on the appeals page's new "Removal reviews" tab: Uphold or Restore. Restore clears the item's
    `moderatedAt` through a per-type `restoreRemovedItem` branch (`lib/moderation/removal-restore.server.ts`, new; a
    test holds that every reversible type has one), never making it public on the owner's behalf where the owner holds
    a visibility switch: the takedown already set it off (`moderateDeck` and `moderatePersona` set `isPublic: false`,
    `takeDownPack` sets `hidden: true`, `moderateListing` sets `status: 'REMOVED'`, and 04's HUD and loadout takedowns
    set `visibility: 'PRIVATE'`), and the restore leaves it off, so the owner republishes, unhides or relists. Items
    with no visibility switch (game reviews, guides, achievement tips and Versecraft seed listings) come back where they
    were: putting them back is exactly the decision being made. Each decision is claimed with one
    conditional `updateMany` (`reviewDecidedAt: null`), audited with `recordAdminActionIn`, and tells the author
    (`removal-review-restored` or `removal-review-upheld`, with `{{kind}}`). Reporters are not told.
  - **The removals list lives in the Account status section** of `/settings/security`: `RemovalsPanel` renders directly
    after `AccountStandingPanel` (before `MyReportsPanel`), so every existing "Account status" link, through the
    redirect, lands on it. No new route, no settings-nav entry and no `EXCLUDED_ROUTES` line: the 2026-11-19
    consolidation folded a separate account-status page into the security page on purpose, and this feature does not
    undo it (`LEGACY_REDIRECTS` keeps its entry).
  - **What the author sees, and nothing more:** each row is the item's kind (through `reportKindLabel`), the item's own
    title or name when it still exists (resolved for its author only), the removal date, and the review state. Never
    the report's id, reason, note or count, the reporter, or the moderator (the record does not even store a reporter);
    the notices carry the kind and, for the message variant, only the moderator's typed message.
  - **Erasure and export:** the member's removal records are deleted at erasure (registry `erase`; `reviewedById` of
    an erased admin nulled) and exported (kind, removed, review asked, outcome; no reporter, no moderator).

## Functional requirements

1. FR-1 Schema: `ContentRemoval` with `@@index([authorId, removedAt(sort: Desc)])`, `@@index([reviewDecidedAt,
   reviewRequestedAt])`; `User` back-relations under the anchor; migration `20270105040100_s15_removal_appeals`.
2. FR-2 `lib/moderation/triage.server.ts` `decideReports`: the record and the notice for each removed target.
3. FR-3 `lib/moderation/removal-reviews.server.ts` (new): the member's list, request a review, the admin list, decide;
   contracts `lib/moderation/removal-reviews.contract.ts`; modules `lib/moderation/api/moderation.removals.server.ts`,
   `moderation.removals.$id.review.server.ts`, `lib/admin/api/admin.removal-reviews.server.ts`,
   `admin.removal-reviews.$id.server.ts` (new).
4. FR-4 `lib/moderation/removal-restore.server.ts` (new): one branch per reversible type.
5. FR-5 UI: `components/moderation/RemovalsPanel.tsx` (new), rendered in `app/routes/_site/settings/security.tsx`
   directly after `AccountStandingPanel`; the appeals page tab (`components/ui/tabs.tsx`).
6. FR-6 Notices (three keys) and refusals `REMOVAL_REVIEW_CLOSED`, `REMOVAL_REVIEW_ALREADY_ASKED` under the anchors.

## Non-functional requirements

- **The takedown stays the authority:** a failed record or notice is logged and never undoes or blocks the takedown.
- **Once only:** a repeated decision on the same reports writes no second record (unique `reportId`) and no second
  notice; two admins deciding one review: one wins.
- **Query shapes (verify against the schema):** every review column is optional; `reversible` is required; filter the
  admin list with `reviewRequestedAt: { not: null }, reviewDecidedAt: null` (both optional, so `null` filters are
  allowed).
- **Steel:** rows on rules; the review note is a `Textarea` with a label; one primary per view.

## Testing requirements

- Main suite `lib/moderation/__tests__/removal-records.test.ts` (fakes through `shapeChecked`): a takedown writes one
  record and one notice (the message variant when a message is given, never both); a repeated decision writes nothing.
- Main suite `lib/moderation/__tests__/removal-reviews.test.ts`: request once, within 14 days, reversible only; decide
  once; restore clears `moderatedAt` and does not publish; the audit row; the author's notice.
- Main suite `lib/moderation/__tests__/removal-restore-coverage.test.ts`: every `REVERSIBLE_REMOVAL_TYPES` entry has a
  restore branch and is in `REMOVABLE_REPORT_ENTITY_TYPES`.
- `lib/moderation/__tests__/music-reports.test.ts`, the notice-key catalogue, the preview ratchet, the erasure coverage,
  plain-column (`lib/account/__tests__/erasure-plain-columns.test.ts`) and export tests, a render test of
  `RemovalsPanel` (`renderToStaticMarkup`) showing no reporter or report reason, and
  `lib/search/__tests__/catalog.test.ts` (the account-status entry unchanged).

## Acceptance criteria

- [ ] A member's public deck is removed after a report; they get a notice naming it as a deck.
- [ ] The Account status section of `/settings/security` lists it with "Ask for a second look"; asking twice is refused.
- [ ] An admin restores it from "Removal reviews"; the member is told, and can publish it again.
- [ ] A removed comment shows "This was deleted and cannot be restored" and no request button.
- [ ] A notice's "Account status" link (`/settings/account-status`, through the redirect) opens the section with the
      removals list.

## Out of scope

Appeals of account bans (their own flow), automatic restores, telling reporters about a restore.

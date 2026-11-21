# 13 — Community rules, and reporting to a community's moderators

Surface: a community page (`/c/$slug`), its mod tools tab
(`components/communities/ModPanel.tsx`), the report dialog on a community post
and the community mod queue. Wave 1. Namespace `community-rules`.

## User story

As a community moderator, I want to write my community's rules, have new
members see them when they join, and let members report a post to me for
breaking a specific rule — and as a member, I want to know the rules and see
which one a removed post broke — so that moderation is predictable and
members can help keep the community on topic.

## Requirements elicitation

- **What exists (verified):** communities have flairs, onboarding questions,
  AutoMod rules (`ModAutomod.tsx`, `lib/communities/automod.server.ts`), a mod
  queue with a log of decisions (`ModQueue.tsx`,
  `communities.$slug.modqueue*.server.ts`, `CommunityModItem` with
  `ruleName` filled by AutoMod), posting requirements ("posting rules" in
  `CommunityComposer.tsx` means flair and verification requirements), wiki
  pages (`CommunityPage`) and announcements. **There is no list of community
  rules** (no model or field), and a member's report on a community post goes
  only to the site moderators (`lib/moderation/api/moderation.report.server.ts`
  → `ContentReport`); community moderators never see member reports.
- **Decisions:** up to 15 ordered rules per community (title ≤ 60, description
  ≤ 500). Shown in the community's sidebar rail and in the onboarding sheet on
  join (an "I have read the rules" acknowledgement only when the community
  turns on "Require agreement"). The report dialog on a community post offers
  "Breaks a rule of <community>" with a rule picker, in addition to the site
  reasons: choosing it creates a `CommunityModItem` with `action = 'report'`,
  `ruleName` = the rule title and `payload.ruleId`, `entityType = 'rmhark'` (the existing queue vocabulary for a post), in
  that community's queue. Site-level reasons still go to `ContentReport`
  (illegal or harmful content must reach site moderators). A mod removing a
  post from the queue may cite a rule; the author's removal notice names it.

## Functional requirements

1. FR-1 Mod tools gain a "Rules" tab: add, edit, delete and reorder rules
   (`components/ui/sortable-list.tsx`), and a "Require agreement on join"
   switch.
2. FR-2 The community page shows the rules in its side rail (numbered titles,
   description on expand) and a "Rules" link on narrow screens that opens them
   in a dialog.
3. FR-3 Joining a community with rules shows them in the onboarding sheet;
   with "Require agreement" the Join completes only after the member ticks
   the agreement (recorded as `CommunityMember.rulesAcceptedAt`).
4. FR-4 The report dialog for a post in a community with rules adds the
   option and rule picker; the report lands in the community's mod queue as
   "Reported: <rule title>" with the reporter count when several members
   report the same post for the same rule (one item, `payload.reporters`).
5. FR-5 Removing a post from the queue (or from the post's mod menu) offers
   "Cite a rule" (optional); the author's removal notification says "Removed
   from <community> for breaking rule 3: <title>".
6. FR-6 Deleting a rule keeps the text on past queue items (`ruleName` is a
   copy).

## Non-functional requirements

- **Security:** rule writes require the community moderator role (the same
  check the other `Mod*` endpoints use, `lib/communities/guard.server.ts`);
  reports to mods require membership (or visibility for public communities),
  are rate-limited (10 an hour per member) and deduplicated per (member,
  post, rule). A reporter's identity is visible to the community's mods only
  as a count, never by name (mods are members, not staff).
- **Performance:** rules come with the existing `/extras` request (one more
  small query), not a new request on first paint.
- **Accessibility:** the rules list is an ordered list; the agreement is a
  real checkbox with a label; the reorder list keeps its keyboard support.
- **i18n:** strings in `community-rules`; rule text is member-written.
- **Steel:** rules on the page are rows on rules (numbered `t-body`), no boxes;
  the mod tab follows the other mod tabs.

## Data model and API

- New model in `prisma/schema/communities.prisma`: `CommunityRule { id String
  @id @default(cuid()), communityId, position Int, title String
  @db.VarChar(60), description String? @db.VarChar(500), createdAt,
  updatedAt, @@index([communityId, position]), @@map("community_rule") }`,
  cascade to the community; `Community.rulesRequireAgreement Boolean
  @default(false)`; `CommunityMember.rulesAcceptedAt DateTime?`.
- Migration `20261123010100_s03_community_rules`.
- `lib/communities/rules.ts` (pure: limits, reorder, report dedupe key),
  `lib/communities/rules.server.ts`, `lib/communities/rules-schema.ts`,
  `lib/communities/rules.contract.ts`.
- Modules: `lib/communities/api/communities.$slug.rules.server.ts` (GET, PUT
  the whole ordered list), `communities.$slug.report.server.ts` (POST a
  report to mods); `extras.server.ts` adds rules; the join endpoint
  (`communities.$slug.join.server.ts`) enforces agreement;
  `communities.$slug.modqueue.$itemId.server.ts` accepts an optional cited
  `ruleId` on removal.
- `components/moderation/ReportDialog.tsx`: the community option, shown only
  when the caller passes the community's rules.

## Testing requirements

- Main suite `lib/communities/__tests__/community-rules.test.ts`: non-mods
  cannot write rules; 16th rule refused; join refused without agreement when
  required; a report creates one queue item and a second reporter increments
  it; reports are rate-limited; a site reason still creates a
  `ContentReport`.
- Product suite `lib/communities/__tests__/rules.product.test.ts`: reorder and
  dedupe.

## Acceptance criteria

- [ ] Rules written in Mod tools show on the community page in order.
- [ ] Reporting a post for rule 2 puts it in the community's queue labelled
      with the rule.
- [ ] Removing it while citing rule 2 tells the author which rule.
- [ ] With "Require agreement", joining needs the tick.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## As built (review notes)

- The post's own menu has no community-mod remove action, so citing a rule on
  removal is offered in the mod queue only (FR-5's "from the post's mod menu"
  has nothing to attach to).
- A private community's invite join does not show the rules first, so it is not
  gated by "Require agreement".
- `FeedItem.communitySlug` is set by the community feed only; the report dialog
  offers the community option where it is set.
- Reporter keys in `payload.keys` are HMACs (server secret, scoped per community),
  never exposed by any API; mods see only `reporters`.

## Out of scope

Rules for group chats or Spaces, appeals to community mods (site appeals
exist), translating rules.

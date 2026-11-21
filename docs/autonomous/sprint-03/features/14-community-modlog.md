# 14 — Community moderation log

Surface: the community mod tools tab (`ModPanel.tsx`, a new "Log" tab) and an
optional public log on the community page. Wave 2. Namespace
`community-modlog`. Depends on 13 (rule citations are logged).

## User story

As a moderator of a community with several moderators, I want one log of every
moderation action — who removed which post and why, who banned or promoted
whom, who changed a setting, a rule or AutoMod — so that we can coordinate and
review each other's decisions; and as a member, I want to see the public part
of that log so that I can trust the moderation is fair.

## Requirements elicitation

- **What exists (verified):** the mod queue's "log" view
  (`communities.$slug.modqueue.server.ts?view=log`, `ModQueue.tsx`) lists
  **resolved queue items only** (AutoMod holds and, after 13, member reports).
  Member actions (remove, ban, role change in
  `communities.$slug.members.$userId.server.ts`), join-request and invite
  decisions, settings (`communities.$slug.settings.server.ts`), flairs,
  AutoMod rules, announcements, onboarding, sister links and (13) rules are
  changed with **no record of who did it** (no community-level action log;
  `AdminAuditLog` is site-admin only).
- **Decisions:** one append-only `CommunityModAction` table written by a single
  helper, `logModAction(tx, …)`, called inside the same transaction as each
  action, so a logged action always happened and an action is never
  unlogged. Each row has an action code from a closed list, the actor, an
  optional target member and target content, an optional cited rule (13) and
  a short reason. Mods see everything; a community can turn on a **public
  log**, which shows members the content actions (removals, approvals,
  locks) with rule and reason, but never bans, role changes or the target
  member's name (removals show "a post" with the rule). Kept 365 days; a
  monthly job prunes older rows.

## Functional requirements

1. FR-1 Every moderation endpoint listed above writes one log row per action
   (bulk queue actions write one per item).
2. FR-2 The "Log" tab lists actions newest first: time, moderator, action in
   words ("removed a post", "banned @name for 7 days", "changed the join
   setting"), target link, rule and reason; filters by moderator and by action
   group (content, members, settings) with `Tabs`; 50 per page with "Load
   more".
3. FR-3 The existing queue "log" view stays (it is the queue's history) and
   links to the full log.
4. FR-4 A "Public moderation log" switch in the community's settings; when on,
   the community page has a "Moderation log" link listing the public subset.
5. FR-5 Export the log as CSV (mods only), up to 365 days.
6. FR-6 The community owner can see actions by every moderator; moderators can
   see each other's actions (there is no private action).

## Non-functional requirements

- **Security:** the full log and export require the mod role; the public log
  exposes only the allow-listed fields of content actions; reasons are text
  (≤ 300) rendered as text; actor names are shown to mods only (public log
  says "a moderator").
- **Integrity:** logging inside the action's transaction (endpoints that do not
  use a transaction today get one for the action and its log row).
- **Performance:** `@@index([communityId, createdAt(sort: Desc)])` and
  `@@index([communityId, actorId, createdAt])`; prune job deletes in batches.
- **Privacy:** on account deletion the member's actor and target ids are set
  to null (the action stays, as "a deleted member"), and their reasons are
  kept (moderator-written).
- **Accessibility:** the log is a list of rows with full sentences, not icon
  codes; filters are labelled.
- **i18n:** action sentences are built in components from the action code
  (strings in `community-modlog`), never stored as English.
- **Steel:** rows on rules; the CSV export is a secondary button.

## Data model and API

- New model in `prisma/schema/communities.prisma`: `CommunityModAction { id
  BigInt @id @default(autoincrement()), communityId, actorId String?, action
  String @db.VarChar(32), targetUserId String?, targetType String?
  @db.VarChar(16), targetId String? @db.VarChar(64), ruleId String?, ruleTitle
  String? @db.VarChar(60), reason String? @db.VarChar(300), detail Json?,
  createdAt }`, cascade to the community, the two indexes,
  `@@map("community_mod_action")`; `Community.publicModLog Boolean
  @default(false)`.
- Migration `20261123020000_s03_community_mod_log`.
- `lib/communities/modlog.ts` (pure: action codes, groups, public filter, CSV),
  `lib/communities/modlog.server.ts` (`logModAction`, list, export, prune),
  `lib/communities/modlog-schema.ts`, `lib/communities/modlog.contract.ts`,
  prune job registered in the communities jobs module
  (`lib/communities/jobs.server.ts`, which `server/jobs/index.ts` already
  registers — no edit to the jobs index).
- Modules: `communities.$slug.modlog.server.ts` (GET; `scope=public|full`),
  `communities.$slug.modlog.export.server.ts` (GET CSV, mods).
- Writers: every file under `lib/communities/api/` that performs a mod action
  (list them in the brief's report); `anonymizeAccount` nulls actor/target.

## Testing requirements

- Main suite `lib/communities/__tests__/mod-log.test.ts`: each mod endpoint
  writes exactly one row (table-driven over the endpoints); a failed action
  writes no row; non-mods get 403 on the full log; the public log omits bans,
  role changes, actor and target names; the export is mods-only.
- Main suite `lib/account/__tests__/community-modlog-erasure.test.ts`.
- Product suite `lib/communities/__tests__/modlog.product.test.ts`: public
  filter and CSV escaping.

## Acceptance criteria

- [ ] Banning a member, changing a setting and removing a post each appear in
      the log with the moderator's name.
- [ ] With the public log on, members see the removal and its rule but not
      who did it.
- [ ] The CSV opens with one row per action.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Site-admin actions on communities (in `AdminAuditLog`), undo from the log,
notifications to mods for each other's actions.

# 17 — Community post alerts

Surface: the community page (`components/feed/CommunityColumn.tsx`) for members,
post creation (`lib/feed/api/rmharks.server.ts` with `communityId`), the
community mod queue approval path, a pg-boss work queue, notifications. Wave 6.
Namespace `community-alerts`.

## User story

As a member of a small community I care about, I want to be told when someone
posts in it — and only for the communities I choose — so that I do not miss a
post in a quiet group I only visit now and then.

## Requirements elicitation

- **What exists (verified):** `CommunityMember`
  (`prisma/schema/communities.prisma`) holds role, followed flairs (feed
  priority) and role tags; there is no notification choice
  (`grep -ri "notifyLevel\|notificationLevel"` finds nothing). Community posts
  are `RMHark` rows with `communityId`, created through
  `lib/feed/api/rmharks.server.ts`; held posts pass through the mod queue
  (`lib/communities/api/communities.$slug.modqueue.$itemId.server.ts`). Game
  updates already fan out to followers through a pg-boss work queue
  (`GAME_UPDATE_FANOUT_QUEUE`, `lib/arcade/updates-jobs.server.ts`), the pattern
  to copy.
- **Decisions:** a per-membership setting `postAlerts`: `off` (default) or
  `all`. When a post becomes visible in the community (created unheld, or
  approved from the queue), a job notifies members with `all`, except the
  author, members who block or are blocked by the author, members who muted the
  author, and banned members. Notifications collapse: if the member has an
  unread `community_post` notification for the same community from the last 30
  minutes, no new one is created (the existing one's text says "New posts in
  {{community}}"). At most 5 000 recipients per post (larger communities are
  what the feed is for; the setting says so when the community has more than 5
  000 members). Replies are not alerted.

## Functional requirements

1. FR-1 Members see a bell control on the community page: "Post alerts: Off /
   All new posts" (`components/ui/menu.tsx`); non-members do not.
2. FR-2 A new visible post enqueues one fan-out job keyed by post id
   (idempotent: `singletonKey`).
3. FR-3 Recipients get a `SYSTEM` notification, `entityType: 'community_post'`,
   "{{name}} posted in {{community}}" linking to the post, subject to their
   notification preferences and quiet hours as every notification is
   (`createNotification`).
4. FR-4 Leaving the community, being removed, or the community becoming
   inaccessible to the member stops alerts (checked at fan-out time against
   membership).
5. FR-5 A post deleted or removed before the job runs alerts no one.
6. FR-6 Collapsing as described above.

## Non-functional requirements

- **Correctness:** the job claims the post with a conditional update (CAS) on a
  new `RMHark`-independent table row
  (`CommunityPostAlertRun { postId @id, claimedAt }` — insert with
  `ON CONFLICT DO NOTHING` semantics via `createMany({ skipDuplicates: true })`,
  proceed only if inserted), so a retried job never double-notifies.
- **Security/privacy:** recipients are re-read at run time from
  `community_member` with `postAlerts = 'all'`; private communities only ever
  alert their members; blocks either way, mutes and bans excluded in the query.
  The setting endpoint requires membership.
- **Performance:** `community_member` may be large: index
  `(communityId, postAlerts)` created `CONCURRENTLY` in its own migration with
  an `_ensure_valid` repair. Recipients are processed in batches of 500 with
  `createMany` for notifications where `createNotification` allows batching
  (check `lib/notify/dispatch.server.ts`; otherwise sequential with the push
  fan-out it already does). The post request only enqueues (no fan-out in the
  request).
- **Counts:** notifications respect quiet counts (sprint 04): the notification
  text never includes like or reply counts.
- **i18n:** `community-alerts`; label `community_post` → "Communities" in
  `components/feed/notification-labels.ts` under the anchor (with its test
  line).
- **Steel:** the bell is an icon button (lucide `Bell` / `BellOff`) with a text
  label in the menu; no badge colours.
- **Accessibility:** the control's accessible name states the current setting.

## Data model and API

- `CommunityMember.postAlerts String @default("off") @db.VarChar(4)`;
  `CommunityPostAlertRun { postId String @id, claimedAt DateTime @default(now())
  }` `@@map("community_post_alert_run")` in `prisma/schema/communities.prisma`.
  Migrations `20261125060200_s05_community_post_alerts` (column + table),
  `20261125060201_s05_community_member_alerts_index`
  (`CREATE INDEX CONCURRENTLY … ("communityId", "postAlerts")`),
  `20261125060202_s05_community_member_alerts_index_ensure_valid` (copy
  `prisma/migrations/20261124040103_s04_build_insights_indexes_ensure_valid`).
- `lib/communities/post-alerts.server.ts`: `setPostAlerts`,
  `enqueuePostAlert(postId)`, `runPostAlertFanout(postId)`,
  `registerCommunityPostAlertWorker(boss)`; `lib/communities/post-alerts.ts`
  (pure: recipient filtering given sets, collapse decision).
- Contract `lib/communities/post-alerts.contract.ts`; module
  `lib/communities/api/communities.$slug.alerts.server.ts` (GET, PUT
  `{ level: 'off'|'all' }`).
- `server/jobs/index.ts`: register the worker under the anchor. Erasure: the
  column lives on the membership row, which the existing erasure handles (check:
  if `anonymizeAccount` keeps memberships, also reset `postAlerts` to `off`
  under the anchor so a deleted account never receives alerts).

## Testing requirements

- Main suite `lib/communities/__tests__/post-alerts.test.ts`: a post enqueues
  once; the job notifies only `all` members, never the author, blocked either
  way, muted or banned members; a deleted post alerts nobody; a re-run alerts
  nobody (CAS); collapse within 30 minutes; the setting requires membership;
  held posts alert on approval, not creation.
- Product suite `lib/communities/__tests__/post-alerts.product.test.ts`.
- A raw-SQL test if the recipient query is raw (real `@@map` names and quoted
  columns).

## Acceptance criteria

- [ ] A member with alerts on gets a notification for a new post in that
      community, and not for their own.
- [ ] Blocked, muted and banned relationships never produce an alert.
- [ ] A burst of five posts in ten minutes produces one unread alert.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Alerts for replies, e-mail alerts, per-flair alerts (followed flairs exist for
the feed), digests.

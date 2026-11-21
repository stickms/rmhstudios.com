# 15 — Audience insights

Surface: Creator analytics (`/analytics`). Wave 3. Namespace `audience`. Reuses
`components/ui/line-chart.tsx` (08) and `components/ui/bar-chart.tsx` (05).

## User story

As a member who posts regularly, I want to see how my follower count has changed
day by day, how many people I gained and lost, and at what hours my audience
actually engages with my posts, so that I know whether what I post is landing
and when to post it.

## Requirements elicitation

- **What exists (verified):** `/analytics`
  (`components/create/AnalyticsDashboard.tsx`) shows the current follower count,
  posts per day for 30 days and post engagement. `Follow` stores only current
  follows with `createdAt`; an unfollow deletes the row
  (`lib/social/engagement.server.ts#unfollowUser`), as do blocks
  (`lib/moderation/api/moderation.block.server.ts`) — **so follower history
  cannot be computed today**, and no audience-timing view exists.
- **Decisions:** add an append-only `FollowEvent` log written beside every
  follow and unfollow. Growth before the log starts is reconstructed for gains
  only (from `Follow.createdAt`); the chart marks the date the log began and
  labels earlier days "gains only". Unfollows are shown as **counts, never
  names** — naming who unfollowed you invites harassment and adds nothing a
  creator can act on. The engagement-hours view counts likes, comments and
  reposts on the member's own posts over the last 90 days in the viewer's time
  zone.

## Functional requirements

1. FR-1 Every follow, unfollow, block-removal and (from feature 16) remove-
   follower writes a `FollowEvent` in the same transaction as the `Follow`
   change.
2. FR-2 An Audience section on `/analytics`: range (30, 90, 365 days); a line
   chart of follower count per day; gained, lost and net in range; a bar chart
   of net change per week.
3. FR-3 New followers in range: up to 20, newest first, with whether you follow
   them back (names of new followers are already visible to the member in their
   notifications).
4. FR-4 "When your audience engages": a 7 × 24 grid (day of week × hour) of
   engagement on your posts, with the three busiest slots spelled out ("Tuesdays
   at 18:00").
5. FR-5 Mutuals: the share of followers you follow back.

## Non-functional requirements

- **Privacy:** owner-only; unfollowers are never named; the engagement grid
  counts are totals, never per person.
- **Performance:** aggregates in SQL over indexed ranges
  (`FollowEvent (followingId, createdAt)`; engagement through existing post
  indexes, bounded to 90 days); cached per user for 5 minutes with `cached()`
  and a per-user tag.
- **Integrity:** writing the event must not be able to fail the follow (it is in
  the same transaction, and the insert has no constraint that a valid follow
  could violate).
- **Accessibility:** charts and the grid have tables and a text summary.
- **i18n:** strings in `audience`; weekday and hour labels from `Intl`.
- **Steel:** the grid is flat stepped fills of `--site-text`, no gradient; rows
  on rules for the follower list.

## Data model and API

- New model `FollowEvent` in `prisma/schema/social.prisma`:
  `id BigInt @id @default(autoincrement())`, `followerId`, `followingId`,
  `kind String @db.VarChar(8)` (`follow`, `unfollow`, `blocked`, `removed`),
  `createdAt DateTime @default(now())`; no foreign keys to `user` (events
  outlive a deleted follower; ids are opaque) but rows are deleted with the
  account through the account-deletion path;
  `@@index([followingId, createdAt])`; `@@map("follow_event")`.
- Migration `20261122030200_s02_follow_events`.
- Writers: `followUser` / `unfollowUser` in `lib/social/engagement.server.ts`;
  the block route. A helper `recordFollowEvent(tx, …)` in
  `lib/social/follow-events.server.ts`.
- Pure `lib/social/audience.ts` (reconstruct daily counts from current count and
  events, weekly net, busiest slots).
- Server `lib/social/audience.server.ts`; contract
  `lib/social/audience.contract.ts`; endpoint
  `GET /api/analytics/audience?range=&tz=`.
- `deleteFollowEventsFor(userId)` called from the account deletion path
  (`lib/account/deletion.server.ts#anonymizeAccount`). **Review decision:** events where the
  deleted member was the *followed* one (their own audience history) are deleted; events where they
  were the *follower* are de-identified (`followerId` set to `DELETED_USER_ID`) and kept, so other
  creators' history charts do not change retroactively and nothing in the row identifies the person.
- Review notes: the block route logs and decrements the follower counters only for edges it really
  deleted (no double event under a concurrent unfollow, and history stays consistent with
  `followerCount`); `BarChart` now draws signed values around a zero rule and `WeeklyNetBars` uses it.

## Testing requirements

- Product suite `lib/social/__tests__/audience.product.test.ts`: reconstruction
  backwards from the current count; days before the log are gains-only; busiest
  slots in a non-UTC zone; weekly net sums to range net.
- Main suite `lib/social/__tests__/follow-events.test.ts`: follow and unfollow
  each write one event in the same transaction; a failure rolls both back; the
  audience endpoint never returns unfollower ids.

## Acceptance criteria

- [ ] Following and unfollowing a test account moves today's point up and back,
      and Lost shows 1 with no name.
- [ ] The grid's busiest slot matches the hour most likes arrived in the
      viewer's zone.
- [ ] Days before the log began are labelled.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Demographics, follower location, comparisons with other creators.

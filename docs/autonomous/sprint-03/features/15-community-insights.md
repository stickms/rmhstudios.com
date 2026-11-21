# 15 — Community insights for moderators

Surface: the community mod tools tab (`ModPanel.tsx`, a new "Insights" tab).
Wave 3. Namespace `community-insights`. Depends on 14 (shares the members
endpoint it edits; insights count kicks and bans from the members path).
Reuses sprint 02's `bar-chart.tsx` and `line-chart.tsx`.

## User story

As the owner of a community, I want to see how it is doing — members gained and
lost over time, how many people post and react each week, which posts did best,
what times people are active, which flairs are used — so that I can tell
whether a change I made (a challenge, a new rule, an announcement) helped.

## Requirements elicitation

- **What exists (verified):** `Community.memberCount` and `postCount` are
  running totals; `CommunityMember.joinedAt` gives join dates of **current**
  members only — a member who leaves or is removed deletes the row, so losses
  and history cannot be computed. Top contributors exist
  (`lib/communities/contributors.server.ts`, `TopContributorsPanel.tsx`) as a
  public leaderboard; the census is a poll. Posts are `RMHark` rows with
  `communityId`, reactions and likes are counted on the post. **No insights
  view exists for a community** (sprint 02's `/analytics` is per member).
- **Decisions:** a `CommunityMemberEvent` table (join, leave, removed, banned)
  written by the join, leave and member-removal paths from this release;
  member history before the release is reconstructed from `joinedAt` only
  (joins, no losses), and the page says from which date losses are known.
  Everything else is computed from existing tables at read time over a
  selectable range (28, 90 or 365 days), cached per community for 10 minutes.
  Insights are for moderators only; no member-identifying data beyond what
  mods already see (top posts and their authors are public anyway).

## Functional requirements

1. FR-1 Header figures for the range: members now, net change, joins, leaves
   (with removals and bans separate), posts, active posters, active
   reactors, and the change against the previous range of equal length.
2. FR-2 Members over time: a line of total members per day (reconstructed:
   current total minus later joins plus later leaves).
3. FR-3 Weekly activity: bars of posts, active posters and reactions per week.
4. FR-4 Top posts in the range by likes + reactions + replies (10), linking to
   the post.
5. FR-5 Activity by hour of day and weekday (a 7 × 24 grid) in the moderator's
   time zone, shown as a table with shading and the number in each cell.
6. FR-6 Flair usage: posts per flair in the range.
7. FR-7 Each chart has a text table alternative; the range is a `Select`.

## Non-functional requirements

- **Performance:** aggregates in SQL with `date_trunc` over `RMHark` filtered
  by `communityId` and `createdAt` (check the existing index on
  `(communityId, createdAt)`; add one in the migration if missing), the event
  table indexed `(communityId, createdAt)`; one endpoint returns all panels;
  p95 under 400 ms on a 10,000-post community; cached 10 minutes.
- **Security:** mod role required (`requireMod`); counts only, no list of who
  joined or left (that is the members list and, after 14, the mod log).
- **Privacy:** on account deletion the member's events are kept but
  de-identified (`userId` set to null in `anonymizeAccount`), so the totals
  stay correct and nothing links them to the person.
- **Accessibility:** every chart has a table; the hour grid's cells carry their
  number as text.
- **i18n:** strings in `community-insights`; numbers, weekdays and hours
  through `Intl`.
- **Steel:** charts use the shared primitives with translated labels passed as
  props; no colour coding beyond the ink and muted tokens; rows on rules for
  the top posts.

## Data model and API

- New model in `prisma/schema/communities.prisma`: `CommunityMemberEvent { id
  BigInt @id @default(autoincrement()), communityId, userId String?, kind
  String @db.VarChar(8) (join|leave|removed|banned), createdAt,
  @@index([communityId, createdAt]), @@map("community_member_event") }`,
  cascade to the community; `userId` is a plain column with no relation to
  `User` (so `prisma/schema/auth.prisma` is untouched), set to null by
  `anonymizeAccount`.
- Migration `20261123030000_s03_community_member_events` (and the post index if
  missing).
- `lib/communities/insights.ts` (pure: reconstruction of the member line,
  range comparison, hour grid in a time zone), `lib/communities/
  insights.server.ts` (SQL aggregates, cache), `insights-schema.ts`,
  `insights.contract.ts`.
- Module `lib/communities/api/communities.$slug.insights.server.ts` (GET;
  query `range`, `tz`).
- Writers: `communities.$slug.join.server.ts` (join and leave),
  `communities.$slug.members.$userId.server.ts` (removed, banned), the
  join-request approval path (join).

## Testing requirements

- Main suite `lib/communities/__tests__/community-insights.test.ts`: non-mods
  get 403; join, leave, removal and ban each write one event; raw SQL is
  checked against the real `@@map` table and column names (a test asserts the
  query string names `rmhark`'s real table — check its `@@map` — and
  `community_member_event`).
- Main suite `lib/account/__tests__/community-member-events-erasure.test.ts`.
- Product suite `lib/communities/__tests__/insights.product.test.ts`: member
  line reconstruction, previous-range comparison, hour grid across DST.
- Integration must smoke-test the SQL against Postgres (sprint 02 lesson).

## Acceptance criteria

- [ ] A moderator sees joins and leaves for the last 28 days, with leaves
      known from the release date.
- [ ] Top posts match the posts with most interaction in the range.
- [ ] The hour grid is in the moderator's time zone.
- [ ] Members who are not mods cannot open Insights.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Per-member analytics, exporting insights, comparing communities.

## As built

- No community ban path exists, so there is no `banned` event kind or figure; kicks are `removed`.
- Member, join/leave and weekly buckets are UTC days; only the hour grid uses the moderator's zone (FR-5).
- "Leaves known from" is the first event recorded in any community (a global first row), stated in the tab's copy.
- The hour grid counts posts, replies, reactions and likes, binned per 15 minutes in UTC and placed in the zone in code.

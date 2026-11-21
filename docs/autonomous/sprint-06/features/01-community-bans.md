# 01 — Community bans and timeouts

Surface: the community mod tools (`components/communities/ModPanel.tsx`), the
member list in `components/feed/CommunityColumn.tsx`, and the community page for
the banned member. Wave 1. Namespace `community-bans`.

## User story

As a moderator of a public community, I want to ban a member who keeps breaking
the rules — for good or for a set time — or to time them out for a few hours so
they can read but not post, so that removing someone actually keeps them out and
a heated thread can cool down without losing a member for good.

As a member who was banned or timed out, I want to be told plainly for how long
and for which rule, so that I know what happened and when I can come back.

## Requirements elicitation

- **What exists (verified):**
  - `DELETE /api/communities/$slug/members/$userId`
    (`lib/communities/api/communities.$slug.members.$userId.server.ts`) deletes
    the membership and calls `markRemoved` (`lib/communities/join-requests.server.ts`),
    which only blocks a *private* community's invite and join-request paths
    (`lib/communities/invites.server.ts`, `join-requests.server.ts`). For a
    public community `POST /api/communities/$slug/join`
    (`lib/communities/api/communities.$slug.join.server.ts`) re-adds the member
    at once.
  - Every in-app community post and comment create passes one gate,
    `gateCommunityContent` (`lib/communities/gate.server.ts`): flair,
    verification, AutoMod. It has no ban or timeout outcome. Its only callers
    are `lib/feed/api/rmharks.server.ts` and `rmharks.$id.comment.server.ts`;
    the developer API's `POST /api/v1/posts/{id}/comments`
    (`app/routes/api/v1/posts/$id/comments.ts`, `createComment` in
    `lib/social/engagement.server.ts`) can comment on a community post and
    skips the gate entirely, so a ban there would be bypassed with an API key.
    (`POST /api/v1/posts` cannot target a community.)
  - Moderation actions are logged with `logModAction`
    (`lib/communities/modlog.server.ts`) using codes from `MOD_ACTIONS`
    (`lib/communities/modlog.ts`); member events with `recordMemberEvent`.
  - Removal can cite a rule (`getRule`, `removalNoticeText` in
    `lib/communities/rules.ts`, used by the mod queue).
  - Role checks: `getRole`, `canModerate` (`lib/communities/access.server.ts`).
    Mods may act on members only; only the owner (ADMIN) acts on mods; the
    creator is immune (same rules as removal).
- **Decisions:**
  - Two kinds of sanction, one table: **ban** (not a member; cannot join, request
    to join, accept an invite, post or comment; optional end date) and
    **timeout** (stays a member and can read; cannot post or comment until it
    ends). Reactions, challenge entries and census answers go through other
    paths and are not covered by this feature. A timeout lasts 1 hour,
    1 day, 3 days or 7 days; a ban lasts 1 day, 7 days, 30 days or until lifted.
  - Banning removes the membership in the same transaction (reusing the removal
    path's member count decrement, `markRemoved`, member event `removed`).
  - At most one active sanction per member per community: a new one replaces
    the old (the old row gets `liftedAt` and `liftedById`).
  - Expiry is evaluated at read time (`endsAt <= now()` is inactive); no job.
  - The member is told by a `SYSTEM` notification (label `community_ban`) with
    the kind, the end (or "until a moderator lifts it") and the cited rule's
    title if any. Lifting early also notifies.
  - Bans and timeouts are recorded in the moderators' log (`member_banned`,
    `member_timed_out`, `ban_lifted`). Whether member actions appear in the
    **public** mod log stays as it is today: the public log shows content actions
    only (`components/communities/PublicModLog.tsx`), so these do not appear
    there. This decides nothing new about the public log.
  - A ban does not touch the member's existing posts; removing them stays the
    queue's job.

## Functional requirements

1. FR-1 In the member list (`CommunityColumn.tsx`), a moderator's row menu for a
   member gains "Time out…" and "Ban…". Each opens a dialog
   (`components/ui/dialog.tsx`) with a duration `Select`, an optional rule
   (`Select` of the community's rules), an optional private reason (≤ 300
   characters, moderators only) and one ink primary button.
2. FR-2 A "Bans" tab in mod tools lists active sanctions (member, kind, ends,
   rule, moderator, date) as rows on rules, with "Lift" (confirmed with
   `useConfirm`), and a second segment (`components/ui/tabs.tsx`) for the last
   100 lifted or expired ones.
3. FR-3 Join (`lib/communities/api/communities.$slug.join.server.ts`), invite
   accept (`acceptInvite`, `lib/communities/invites.server.ts`), and join
   request (`lib/communities/api/communities.$slug.join-request.server.ts`)
   refuse a banned member with code `community_banned` and the end date.
4. FR-4 `gateCommunityContent` gains a first check: an active ban or timeout
   returns `{ kind: 'deny', status: 403, code: 'community_banned' |
   'community_timed_out', … }` with the end date; mods and admins are never
   sanctioned (the API refuses to sanction them, see NFR). The developer API's
   comment create (`app/routes/api/v1/posts/$id/comments.ts`) applies the same
   check when the parent post has a `communityId` (refusing with its own
   error envelope, `error('forbidden', …, 403)`), and is listed in
   `BAN_ENFORCEMENT_PATHS`.
5. FR-5 The community page shows a banned or timed-out member a one-line notice
   on a rule above the composer area (text, no tinted box — D8 is open): "You
   are timed out until 14:30. You can read but not post." / "You are banned
   from this community until 3 December." The composer is replaced by that line
   for a timeout; for a ban the Join button is replaced by it.
6. FR-6 The member list marks timed-out members with a `t-meta` "Timed out
   until …" after their name (moderators only).
7. FR-7 Every check reads one helper, `activeSanction(communityId, userId)`, and
   every path that enforces it is listed in `BAN_ENFORCEMENT_PATHS`
   (`lib/communities/bans.ts`), which a gate test holds against the source.

## Non-functional requirements

- **Correctness:** create, replace and lift run in one transaction that first
  takes `lockKey(tx, 'community-ban:' + communityId + ':' + userId)`; the
  replace marks the old row lifted before inserting. Time comparisons use the
  database clock (`now()`) in the query, not the app clock.
- **Security:** `auth: 'required'`; `rateLimit: 'write'`; zod for kind,
  duration (an enum, never free minutes), rule id, reason. The actor must be a
  moderator (`canModerate`); a mod cannot sanction a mod or admin; nobody can
  sanction the creator or themselves (400). The private reason is never sent to
  the sanctioned member or non-moderators.
- **Performance:** `activeSanction` is one indexed lookup
  (`@@index([communityId, userId, liftedAt])`); the gate adds one query in
  parallel with its existing `Promise.all`.
- **Privacy:** erasure deletes sanctions about the member and nulls
  `createdById` / `liftedById` where the member was the moderator. The member's
  export includes sanctions about them without the private reason (the reason is
  the moderators' record, the same default sprint 03 kept for site moderator
  notes, which remains an open owner decision).
- **i18n:** `community-bans`; the notification label in `feed`.
- **Steel:** dialogs are overlays; the Bans tab is rows on rules with `t-meta`
  dates (D10 default); one ink primary per dialog; the notice is a line of text.
- **Accessibility:** dialog fields labelled; the notice is `role="status"`; the
  "Lift" button names the member (`aria-label`).

## Data model and API

- `CommunityBan { id String @id @default(cuid()), communityId, userId, kind
  VarChar(8) ('ban' | 'timeout'), endsAt DateTime?, ruleId String?, reason
  VarChar(300)?, createdById String?, createdAt @default(now()), liftedAt
  DateTime?, liftedById String? }`, relations to `Community` (cascade) and
  `User` (subject, cascade), `@@index([communityId, userId, liftedAt])`,
  `@@index([communityId, createdAt(sort: Desc)])`, `@@map("community_ban")` in
  `prisma/schema/communities.prisma`; `Community` back-relation `bans`; `User`
  back-relation under the auth anchor. Migration
  `20261126010000_s06_community_bans`.
- `lib/communities/bans.ts` (pure: durations, `isActive`, `endsAtFor`,
  `BAN_ENFORCEMENT_PATHS`), `bans-schema.ts`, `bans.server.ts`
  (`activeSanction`, `sanction`, `lift`, `listSanctions`,
  `communityBanErasureOps`, `exportCommunitySanctions`), `bans.contract.ts`.
- Modules: `lib/communities/api/communities.$slug.bans.server.ts` (GET list,
  POST create), `communities.$slug.bans.$banId.server.ts` (DELETE = lift),
  `communities.$slug.my-standing.server.ts` (GET: the caller's own active
  sanction for the page notice, without the reason).
- `components/communities/ModBans.tsx`, `SanctionDialog.tsx`,
  `CommunityStandingNotice.tsx`.
- `MOD_ACTIONS_BY_GROUP.members` (`lib/communities/modlog.ts`) gains
  `member_banned`, `member_timed_out`, `ban_lifted` (with their labels in
  `ModLog.tsx` as literal `t()` calls); the public subset is unchanged.

## Testing requirements

- Main suite `lib/communities/__tests__/community-bans.test.ts`: a banned member
  cannot join a public community, accept an invite or request to join; a
  timed-out member's post and comment are refused by the gate; an expired
  sanction no longer applies; replace lifts the old row; a mod cannot ban a mod;
  nobody bans the creator; the private reason is absent from
  `my-standing` and from the notification; the lock is taken before the insert.
- Main suite `lib/communities/__tests__/ban-enforcement-paths.test.ts`: every
  file in `BAN_ENFORCEMENT_PATHS` imports `activeSanction` (source scan), and
  the join, invite, request, gate and v1 comment files are in the list; a
  timed-out member's v1 comment on a community post is refused.
- Main suite `lib/account/__tests__/community-bans-erasure.test.ts`.
- Product suite `lib/communities/__tests__/bans.product.test.ts`: `endsAtFor`
  per duration, `isActive` at the boundary, notice text selection.
- `components/feed/__tests__/notification-labels.test.ts` pins
  `community_ban`.

## Acceptance criteria

- [ ] A moderator bans a member of a public community for 7 days; the member
      is removed, sees the notice, and Join is refused until the date passes.
- [ ] A 1-hour timeout lets the member read and refuses their post and comment
      with the end time; after an hour they can post.
- [ ] Lifting early notifies the member and takes effect at once.
- [ ] A moderator cannot sanction another moderator; the owner can.
- [ ] The private reason is never visible to the member.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Site-wide bans (exist: `admin.users.$id.ban`) and site-wide feature timeouts
(exist: `FeatureRestriction`, `lib/moderation/restrictions.server.ts`), IP or
device bans, bans across sister communities, appeals inside a community.

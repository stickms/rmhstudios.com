# 17 — Hand over a community

Surface: the community moderator tools (`components/communities/ModPanel.tsx`,
settings), a banner and notification for the member offered ownership on
`/c/$slug`, and a site-admin action for communities whose owner is gone.
Wave 5. Namespace `community-handover`.

## User story

As the member who created a community, I want to hand it to one of my
moderators — and then be free to step back or leave — so that a community
can outlive my interest in running it; and as a site admin, I want to give an
abandoned community to its moderators when its owner's account is gone.

## Requirements elicitation

- **What exists (verified):** ownership is `Community.createdById`
  (`prisma/schema/communities.prisma`) plus that member's `ADMIN` role. The
  role endpoint
  (`lib/communities/api/communities.$slug.members.$userId.server.ts`)
  refuses any change to the creator ("The owner's role can't be changed"),
  removal refuses the creator, and leaving refuses the creator ("The creator
  cannot leave the community", `communities.$slug.join.server.ts`). **There
  is no way to transfer ownership** (`grep` for transfer finds nothing in
  communities), so an owner who loses interest cannot step away, and a
  community whose owner deleted their account (anonymised in place) or was
  banned keeps a tombstone or banned owner forever. Sprint 03 added the
  moderation log (`logModAction`, `lib/communities/modlog.server.ts`; actions
  in `lib/communities/modlog.ts`) and member events
  (`recordMemberEvent`, `member-events.server.ts`).
- **Decisions:** the owner offers ownership to one current **moderator**;
  the moderator must accept (no one becomes an owner by surprise); one pending
  offer per community, expiring after 7 days (checked on read, no job). On
  accept, in one transaction: `createdById` becomes the new owner, the new
  owner's role becomes `ADMIN`, the previous owner's becomes `MOD` (they can
  then step down or leave like anyone), the action is logged as
  `ownership_transferred` in the mod log. Blocked pairs and banned members
  cannot be offered. A site admin may assign ownership directly to a
  moderator only when the owner is the tombstone, banned, or the
  `DELETED_ACCOUNT_BAN_REASON` account — recorded in the admin audit log and
  the community's mod log.

## Functional requirements

1. FR-1 The owner's moderator tools gain "Ownership": a select of current
   moderators and "Offer ownership" (confirm: "You will become a moderator").
2. FR-2 A pending offer shows to the owner ("Offered to Alex, expires in 6
   days · Cancel") and to the moderator as a notification and a banner on the
   community page ("Sam offered you ownership of {{name}}" · Accept ·
   Decline).
3. FR-3 Accept transfers as above and notifies the previous owner; Decline
   and Cancel end the offer and notify the other side; an expired offer reads
   "Expired" and can be replaced.
4. FR-4 After the transfer the previous owner can leave (the leave refusal now
   applies to whoever `createdById` names).
5. FR-5 The site admin page for communities (or `/admin/users` if there is no
   community admin page — check `app/routes/_site/admin/`) offers "Assign
   owner" for an orphaned community, choosing among its moderators.
6. FR-6 The community's public mod log (sprint 03) shows "Ownership passed to
   Alex".

## Non-functional requirements

- **Security:** offer and cancel require the current owner; accept and
  decline require the offered member, who must still be a moderator when
  accepting (re-checked in the transaction); the transfer transaction claims
  the offer with a conditional `updateMany` (`status: 'pending'` → accepted)
  and re-reads `createdById`, so a racing cancel or second accept cannot
  produce two owners. Admin assignment is `auth: 'admin'` and refuses when the
  owner is a normal, active account.
- **Privacy:** pending offers involving the member are deleted under
  `s04-17`; offers are community records otherwise (not exported).
- **Accessibility:** the banner's actions are buttons with the community name
  in their accessible names; the select is labelled.
- **i18n:** strings in `community-handover`; the mod-log action label is added
  where sprint 03 keeps the others.
- **Steel:** the banner is a row on a rule above the community content, not a
  coloured box; Accept is the view's ink primary.

## Data model and API

- New model in `prisma/schema/communities.prisma`: `CommunityHandover { id
  String @id @default(cuid()), communityId String, fromId String, toId
  String, status String @default("pending") @db.VarChar(10), createdAt
  DateTime @default(now()), expiresAt DateTime, decidedAt DateTime? }`,
  relations to the community (Cascade) and both users (back-relations under
  `s04-17`), `@@index([communityId, status])`, `@@index([toId, status])`,
  `@@map("community_handover")`. One pending per community is enforced in
  the offer transaction under
  `pg_advisory_xact_lock(hashtext('community-handover:' || communityId))`.
  Migration `20261124050200_s04_community_handover`.
- `lib/communities/handover.ts` (pure: who may act, expiry, the state of an
  offer), `handover-schema.ts`, `handover.contract.ts`, `handover.server.ts`.
- Modules `lib/communities/api/communities.$slug.handover.server.ts` (`GET`
  pending, `POST` offer, `DELETE` cancel),
  `communities.$slug.handover.respond.server.ts` (`POST accept | decline`),
  `lib/admin/api/admin.communities.$slug.owner.server.ts` (`PUT`).
- `lib/communities/modlog.ts`: action `ownership_transferred`.
- `components/communities/HandoverPanel.tsx`, `HandoverBanner.tsx`;
  `components/feed/NotificationsColumn.tsx` label under `s04-17`.

## Testing requirements

- Main suite `lib/communities/__tests__/community-handover.test.ts`: only the
  owner offers; only a moderator can be offered; accept by someone else is
  refused; a racing cancel and accept leave one owner; a demoted moderator
  cannot accept; the previous owner can leave afterwards; admin assignment is
  refused for an active owner.
- Main suite `lib/account/__tests__/community-handover-erasure.test.ts`.
- Product suite `lib/communities/__tests__/handover.product.test.ts`.

## Acceptance criteria

- [ ] An owner offers ownership to a moderator, who accepts; roles swap and the
      mod log records it; the previous owner can leave.
- [ ] An offer expires after 7 days.
- [ ] A site admin can assign an owner for a community whose owner was
      deleted.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Co-owners, transferring to a member who is not a moderator, transferring
Spaces or group chats (10 covers group chats).

## As built

- FR-6 (owner decision): the transfer appears in the moderators' log only ("Ownership passed to {{target}}",
  or "A site admin gave ownership to {{target}}"). Sprint 03's public allowlist (`PUBLIC_MOD_ACTIONS`)
  deliberately hides actors, so `ownership_transferred` is not public; members of a community with a public
  log do not see it.
- Offers are expired by time on every read and on accept (`expiresAt > now` in the claiming `updateMany`);
  no job closes them. An expired offer is closed when the owner makes a new one.

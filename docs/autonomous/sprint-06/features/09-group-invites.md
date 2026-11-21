# 09 — Invite links for group chats

Surface: the group chat header's manage menu
(`components/feed/group-chat/*`, `/groups/$id`) and a new join page
`/groups/join/$code`. Wave 1. Namespace `group-invites`.

## User story

As the owner of a group chat for my study group or my game night, I want a link
I can post in a community or an event so that people can join themselves,
with a limit on how many and for how long, and the power to turn it off, so
that I do not have to add thirty people one by one.

As someone who opens the link, I want to see which group it is and who is in it
before I join, so that I know what I am walking into.

## Requirements elicitation

- **What exists (verified):**
  - Groups grow only through `addMembers` (`lib/group-chat/manage.server.ts`),
    which filters through `refusedForGroup` (no block with the adder, no ban, no
    tombstone) and caps membership at `GROUP_MEMBER_CAP` = 51
    (`lib/group-chat/manage.ts`), under a `lockKey` advisory lock. Sprint 04 10
    added owner management (rename, remove, transfer, leave).
  - Communities have invite links (`CommunityInvite`,
    `lib/communities/invites.server.ts`, page
    `app/routes/_site/c.$slug_.invite.$code.tsx`: a loader server function,
    `noindex, nofollow`, a preview before accepting). That is the pattern to
    copy; `lib/sitemap.ts` lists `/c/$slug/invite/$code` in `DYNAMIC_ROUTES`
    with `null`.
  - `Chat` has no invite model (`grep -i "invite" lib/group-chat` finds
    nothing).
- **Decisions:**
  - Only the owner creates, lists and revokes links. Each link: expiry (1 day,
    7 days, 30 days, never), maximum uses (1, 5, 10, 25, unlimited), and a
    random 10-character code (`crypto.randomBytes`, base58). At most 5 live
    links per group.
  - Joining through a link applies **every rule `addMembers` applies**, with the
    link's creator as the adder: not blocked by or blocking any current member
    (stricter than `addMembers`, because the joiner chose this, not the owner:
    a block with *any* member refuses), not banned, not a tombstone, the 51 cap.
    The refusal is one generic message ("This invite can't be used") so a link
    never reveals who blocked whom.
  - The preview shows the group name, member count and up to five member names
    (from members whose follow-list and profile privacy allow being shown — use
    the existing display rules, `lib/user-display.server.ts`), never the
    message history.
  - Joining posts the existing system line for a member joining (the same as
    `addMembers` posts) and counts a use; history before joining is visible or
    not exactly as for a member added by the owner today.
  - Revoking a link stops new joins; it never removes people who joined.
  - **A removed member cannot walk back in.** `removeMember`
    (`lib/group-chat/manage.server.ts`) deletes the `ChatMember` row and keeps
    no record, so without one a member the owner removed could rejoin at once
    through any live link (the same hole 01 closes for communities). Removal
    now writes a `ChatRemoval` row (chat, member, when) in its transaction;
    `joinByInvite` refuses anyone with a row for that chat (the same generic
    message); the owner adding them back through `addMembers` deletes the row.
    Leaving voluntarily writes nothing.
  - When the group is deleted or ownership is transferred, the old owner's
    links are revoked (the new owner makes their own).

## Functional requirements

1. FR-1 The owner's manage menu gains "Invite links": a dialog listing live
   links (code masked to its last 4 characters, uses / max, expires, Copy,
   Revoke with `useConfirm`) and "Create link" (expiry and uses `Select`s).
2. FR-2 `/groups/join/$code`: signed-out visitors see the group name and "Sign
   in to join"; signed-in visitors see the preview and "Join group" (ink
   primary); members see "You are already in this group" with a link to it;
   expired, used-up, revoked or refused links all show "This invite can't be
   used".
3. FR-3 Joining navigates to `/groups/$id`.
4. FR-4 The owner sees in each link's row the number of people who joined
   through it.

## Non-functional requirements

- **Correctness:** join runs in a transaction that takes
  `lockKey(tx, 'group-members:' + chatId)` (reuse the key `addMembers` uses, so
  the two paths share one cap) and re-checks the link's `revokedAt`,
  `expiresAt` and `uses < maxUses` before incrementing `uses` with a
  conditional `updateMany`.
- **Security:** `auth: 'required'` for create, list, revoke and join;
  `rateLimit: 'write'` on create and revoke;
  `rateLimit: { limit: 20, windowMs: 60_000, prefix: 'group-invite-join' }` on
  join and preview (codes are guessable only by brute force; 58^10 plus the
  limit makes that impractical). The preview's server function checks the code
  and returns nothing about the group for an invalid one. The page is `noindex,
  nofollow`, carries `Referrer-Policy: no-referrer` through the route's head
  meta, and its OG card is the generic groups section card (never the group's
  name, so a pasted link does not leak it).
- **Performance:** `code` is unique-indexed; the preview is one query plus the
  five names.
- **Privacy:** erasure deletes links the member created and `ChatRemoval` rows
  about the member; a deleted member's joins
  are already handled by `leaveAllGroups` (sprint 04). Export includes links the
  member created (group name, created, uses).
- **i18n:** `group-invites`.
- **Steel:** dialog overlay, rows on rules; the join page is a plain titled page
  with one ink primary.
- **Accessibility:** Copy announces "Link copied" politely; the masked code has
  an accessible name.

## Data model and API

- `ChatInvite { id String @id @default(cuid()), chatId, createdById, code
  VarChar(16) @unique, maxUses Int?, uses Int @default(0), expiresAt DateTime?,
  revokedAt DateTime?, createdAt @default(now()) }`, relation to `Chat`
  (cascade), `@@index([chatId, revokedAt])`, `@@map("chat_invite")` in
  `prisma/schema/messaging.prisma`; `User` back-relation under the auth anchor;
  `ChatMember.joinedViaInviteId String?` for FR-4; `ChatRemoval { chatId,
  userId, removedAt @default(now()) }` with `@@id([chatId, userId])`, relation
  to `Chat` (cascade), `@@map("chat_removal")`, written by `removeMember` and
  cleared by `addMembers`. Migration
  `20261126010200_s06_group_invites`.
- `lib/group-chat/invites.ts` (pure: code alphabet, expiry and use options,
  validity), `invites-schema.ts`, `invites.server.ts` (`createInvite`,
  `listInvites`, `revokeInvite`, `previewInvite`, `joinByInvite`,
  `revokeInvitesOf`, `groupInviteErasureOps`, `exportGroupInvites`),
  `invites.contract.ts`.
- Modules `lib/group-chat/api/group-chats.$id.invites.server.ts` (GET, POST),
  `group-chats.$id.invites.$inviteId.server.ts` (DELETE),
  `group-invites.$code.join.server.ts` (POST).
- `transferOwnership` calls `revokeInvitesOf(chatId, oldOwnerId)` inside its
  transaction.
- Page `app/routes/_site/groups/join.$code.tsx` (loader server function for the
  preview); `components/feed/group-chat/InviteLinksDialog.tsx`,
  `GroupInvitePage.tsx`.
- `lib/sitemap.ts` `DYNAMIC_ROUTES`: `'/groups/join/$code': null` under the
  Wave 0 anchor.

## Testing requirements

- Main suite `lib/group-chat/__tests__/group-invites.test.ts`: only the owner
  creates, lists and revokes; 5-link cap; join refused for expired, revoked,
  used-up, full (51) and blocked-with-any-member, all with the same message;
  `uses` never exceeds `maxUses` under two concurrent joins (the lock is taken
  first); already-a-member join is a no-op; transfer revokes the old owner's
  links; the preview of an invalid code returns no group data; a member the
  owner removed is refused through a live link, and can join again after the
  owner re-adds them; a member who left can rejoin through the link.
- Main suite `lib/account/__tests__/group-invites-erasure.test.ts`.
- Product suite `lib/group-chat/__tests__/invites.product.test.ts`: code
  alphabet and length, validity at boundaries, masking.
- Gate tests: sitemap coverage (the `$param` entry), OG page coverage.

## Acceptance criteria

- [ ] An owner creates a 7-day, 10-use link, posts it in a community, and ten
      people join; the eleventh sees "This invite can't be used".
- [ ] Someone who blocked a member of the group cannot join through the link and
      learns nothing about why.
- [ ] Revoking the link stops joins and removes nobody.
- [ ] A member the owner removed cannot rejoin through a link that is still live.
- [ ] A signed-out visitor sees the group name and a sign-in button; the page is
      not indexed.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Links for direct messages, join approval queues, links that grant moderator
rights, QR codes.

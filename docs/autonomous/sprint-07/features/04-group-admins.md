# 04 — Group chat admins

Surface: the group chat's info dialog and manage menu
(`components/feed/group-chat/*`, `/groups/$id`). Wave 1. Namespace
`group-admins`.

## User story

As the owner of a fifty-person group chat, I want to make two or three trusted
members admins who can add and remove people, rename the group and manage its
invite links, so that the group keeps running when I am asleep or away, and so
that it does not fall to whoever joined first when I leave.

As a member, I want to see who the admins are, so that I know whom to ask.

## Requirements elicitation

- **What exists (verified):**
  - A group has exactly one manager, `Chat.ownerId`. Every management action in
    `lib/group-chat/manage.server.ts` — `renameGroup`, `addMembers`,
    `removeMember`, `transferOwnership` — and every invite-link action in
    `lib/group-chat/invites.server.ts` (`createInvite`, `listInvites`,
    `revokeInvite`, sprint 06 09) calls `refuseUnlessOwner` under the
    `lockedGroup` advisory lock (`lockKey`, the group key the cap shares).
  - `ChatMember` (`prisma/schema/messaging.prisma`) has no role.
  - When the owner leaves, `leaveGroup` hands the group to the earliest-joined
    remaining member, whoever that is.
  - System lines for management (`SystemAction`, `lib/chat-plus/types.ts`,
    the s04-10 block) are posted with `announce`.
- **Decisions:**
  - **One role, admin**, stored as `ChatMember.role` (`member` | `admin`,
    default `member`). At most **5 admins** per group, counted under the group
    lock.
  - **What an admin can do:** add members (`addMembers`, every existing refusal
    rule unchanged), remove **members** (never the owner or another admin),
    rename the group, and create, list and revoke invite links. **Any admin or
    the owner may revoke any link** (a link is a group resource, and the 5-link
    cap is per group), and the list shows who created each.
  - **What only the owner can do:** make and unmake admins, transfer ownership,
    remove an admin, delete the group (where that exists). Transfer to an admin
    keeps the old owner as an admin; transfer to a member makes them owner and
    leaves the admin list unchanged.
  - The check replaces `refuseUnlessOwner` with `refuseUnlessManager(group,
    userId, need: 'owner' | 'admin')`, which reads the role **inside the lock**
    (from the same `chatMember` row the lock protects), so a demoted admin's
    in-flight request is refused.
  - **Succession:** when the owner leaves, the earliest-joined **admin**
    becomes owner; with no admins, the earliest-joined member, as today. The
    choice is made inside `leaveGroup`'s existing `lockedGroup` transaction
    (line ~1040), reading roles there, so an admin leaving or being demoted at
    the same moment cannot be picked after they are gone. Account deletion
    reaches it unchanged: `leaveAllGroups` (`manage.server.ts:1266`, called
    by `anonymizeAccount`) loops over `leaveGroup`, so a deleted owner's
    group also passes to an admin first. The new owner's `role` is reset to
    `member` (an owner is not also an admin row; `canManage` treats the owner
    as above every admin).
  - **Links follow their creator's standing (reasonable default, recorded):**
    when an admin is demoted, removed or leaves, the live invite links they
    created are revoked in the same transaction (`revokedAt`, sprint 06 09),
    so a demoted admin cannot keep a door open; the system line says how many
    were revoked. Links the owner created are untouched by transfers.
  - **No self-escalation:** the role endpoint requires `need: 'owner'`; an
    admin cannot change any role, including their own, and a target who is
    not a current member is 404. Transfer of ownership stays owner-only and
    re-checks, under the lock, that the target is still a member.
  - **Removal of an admin** by the owner, or an admin leaving, clears the role
    with the membership row (the row is deleted); sprint 06's `ChatRemoval`
    record applies to admins removed by the owner as to anyone.
  - System lines: "X made Y an admin", "X removed Y as an admin" (two new
    `SystemAction` variants with the target's name stored beside the id, the
    s04-10 convention).
  - An admin removing a member uses the same path and the same `ChatRemoval`
    row as the owner (sprint 06 09), so the removed member cannot rejoin through
    a live link.
  - DMs are unaffected (`role` is only meaningful for groups).

## Functional requirements

1. FR-1 The group info dialog lists members with "Owner" and "Admin" markers
   (`t-meta`), and the owner's per-member menu gains "Make admin" / "Remove as
   admin" (`useConfirm` for removal).
2. FR-2 Admins see the manage actions they are allowed (Add people, Remove from
   group on members, Rename, Invite links); members see none, as today.
3. FR-3 The server refuses an admin action on the owner or another admin with
   the existing generic "You can't do that" response (403), and a sixth admin
   with 409 `ADMIN_LIMIT`.
4. FR-4 System lines for promotion and demotion render through the existing
   system-line component with literal labels.
5. FR-5 Succession prefers admins.
6. FR-6 The group API payload (`lib/group-chat/serialize.server.ts`) includes
   each member's `role` (additive); the client derives "can manage" from it.

## Non-functional requirements

- **Correctness:** every role check happens inside `lockedGroup`'s
  transaction; the 5-admin cap is checked under the same lock. Tests cover a
  demotion racing an admin's remove.
- **Security:** `auth: 'required'`, `rateLimit: 'write'` on the new endpoints;
  a non-member gets 404 as today.
- **Performance:** no extra query on send; the role comes with the membership
  read the guards already make.
- **Steel:** markers are text, not chips; menus are the existing overlay.
- **Privacy:** no new personal table; the role is deleted with the membership.
- **i18n:** `group-admins`.

## Data model and API

- `ChatMember.role String @default("member") @db.VarChar(8)`; migration
  `20261127010200_s07_group_admins` (one `ADD COLUMN` with a default; no index:
  the admin count is read under the lock from the group's ≤ 51 rows).
- `lib/group-chat/roles.ts` (pure: `canManage`, `MAX_GROUP_ADMINS = 5`,
  `isManagerAction`), `roles-schema.ts`, `roles.contract.ts`,
  `roles.server.ts` (`setAdmin(chatId, actorId, targetId, admin)`).
- `manage.server.ts`: `refuseUnlessManager` replacing `refuseUnlessOwner` at
  the call sites listed above (keep `refuseUnlessOwner` for owner-only actions),
  succession in `leaveGroup`.
- `invites.server.ts`: the three link actions accept admins.
- Module `lib/group-chat/api/group-chats.$id.members.$userId.role.server.ts`
  (PUT `{ admin: boolean }`).
- `lib/chat-plus/types.ts` `SystemAction` gains `admin-added`, `admin-removed`.
- UI: `GroupInfoDialog.tsx`, `GroupManageLine.tsx`, `GroupHeader.tsx`.

## Testing requirements

- Main suite `lib/group-chat/__tests__/group-admins.test.ts`: owner makes and
  unmakes admins; the cap; an admin adds and removes a member, renames, creates
  and revokes a link; an admin cannot remove the owner or another admin, make
  admins or transfer; a demoted admin is refused under the lock; succession
  prefers the earliest admin, including through `leaveAllGroups`; succession
  racing an admin's leave (the leaver is never chosen); an admin's links are
  revoked on demotion, removal and leave; an admin cannot set any role, their
  own included; an admin-removed member is refused by a live invite link
  (sprint 06 09 `ChatRemoval`).
- Extend `lib/group-chat/__tests__/group-invites.test.ts` cases that assert
  "only the owner" so they now assert "owner or admin".
- Product suite `lib/group-chat/__tests__/roles.product.test.ts` for the pure
  rules.
- Existing tests that must stay green: the sprint 04 group admin tests and
  `lib/account/__tests__/group-chat-erasure.test.ts`.

## Acceptance criteria

- [ ] The owner makes two members admins; one of them adds three people and
      removes one while the owner is offline; the system lines say so.
- [ ] An admin cannot remove the owner or the other admin.
- [ ] When the owner leaves, the earlier admin becomes owner.
- [ ] A sixth admin is refused.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Custom roles or permissions, admin-only messages, moderation of message
content by admins (deleting others' messages), roles in DMs.

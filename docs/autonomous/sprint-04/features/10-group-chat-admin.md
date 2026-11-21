# 10 — Manage a group chat

Surface: a "Group info" dialog opened from the group chat header
(`components/feed/group-chat/GroupHeader.tsx`, in `GroupChatView.tsx`),
system lines in the chat, and notifications. Wave 4. Namespace
`group-chat-admin`.

## User story

As the member who started a group chat, I want to rename it, add someone I
forgot, remove someone, and hand the group to another member — and as any
member, I want to see who is in it — so that a group can change after the
moment it was created.

## Requirements elicitation

- **What exists (verified):** groups are `Chat { kind: 'group', name, ownerId
  }` with `ChatMember` rows (`prisma/schema/messaging.prisma`). The group API
  (`lib/group-chat/api/`) can **create** a group (`POST /api/group-chats`,
  up to 50 others), read it, send, react, vote and **leave** (the owner
  leaving passes ownership to the oldest member; the last one out deletes the
  group). There is **no endpoint to rename, add or remove members, or
  transfer ownership**; nothing in the codebase creates a `ChatMember` for an
  existing group. Creation resolves members by id or handle and adds them
  **without any block check**, so a member can be put in a group with someone
  who blocked them. In-chat system lines exist (`postSystemLine` and
  `SystemAction` in `lib/chat-plus/post.server.ts`, used for timer, theme and
  pin). Account erasure leaves the anonymised owner owning their groups.
- **Decisions:** the owner renames, adds, removes and transfers; any member
  sees the member list and can leave (as today). Adding refuses a person who
  has blocked the adder or whom the adder blocked, banned accounts, and the
  tombstone — and the same check now applies at creation (the "refuse blocked
  users wherever members interact" rule); refused people are reported back as
  "1 person could not be added" without saying why. A group holds at most 51
  members. Every change posts a system line ("Sam added Alex", "Sam renamed
  the group to Raid night", "Sam removed Alex", "Alex is now the owner"). An
  added member is notified; a removed member is not (they see the group gone).
  Erasure makes the member leave every group through the same leave function,
  so ownership passes on.

## Functional requirements

1. FR-1 The header's group name opens "Group info": the name (editable by the
   owner, 1–60 characters), the member list with "Owner" marked, and Leave.
2. FR-2 The owner sees "Add people": a user search (the existing
   `searchUsersApi`), up to 10 at a time, with chips; Add reports added and
   refused counts.
3. FR-3 The owner sees "Remove" and "Make owner" on each other member (both
   confirm); "Make owner" makes the owner an ordinary member.
4. FR-4 Each change posts its system line and reaches open clients through
   the existing group realtime publish; a removed member's client drops the
   chat and shows "You were removed from {{name}}" once.
5. FR-5 Added members get a notification "Sam added you to {{name}}" linking
   to the chat.
6. FR-6 Creating a group with a person in a blocked pair leaves them out and
   reports it the same way.

## Non-functional requirements

- **Security:** every endpoint is session-only; owner actions check
  `Chat.ownerId` inside a transaction that re-reads it (a transfer racing a
  removal cannot leave two owners or none); rate limit `write`; zod for the
  name and member lists (ids or handles, comma lists in queries). A removed
  member loses read access immediately (membership is the access check).
  Scheduled messages (sprint 03) from a removed member fail at delivery,
  which re-checks membership.
- **Concurrency:** adding checks the 51 cap in a transaction under
  `pg_advisory_xact_lock(hashtext('group-members:' || chatId))`.
- **Privacy:** the pre-transaction erasure step (anchor `s04-10`) calls the
  shared `leaveGroup` for each of the member's groups.
- **Accessibility:** the dialog is `components/ui/dialog.tsx`; the member list
  is a list with labelled buttons ("Remove Alex"); results of Add are
  announced in a polite live region.
- **i18n:** strings in `group-chat-admin`; system lines store an action in
  `meta` and render translated on the client (as the existing system actions
  do), with the English fallback in `content`.
- **Steel:** members are rows on rules; the owner mark is `t-meta` text; the
  dialog is the standard overlay with one ink primary (Save or Add).

## Data model and API

- No migration.
- `lib/group-chat/manage.ts` (pure: cap, who may do what, refusal summary),
  `manage-schema.ts`, `manage.contract.ts`, `manage.server.ts`
  (`renameGroup`, `addMembers`, `removeMember`, `transferOwnership`,
  `leaveGroup` extracted from `group-chats.$id.leave.server.ts`,
  `leaveAllGroups(userId)` for erasure, `refusedForGroup(adderId, ids)` used
  at creation too).
- Modules `lib/group-chat/api/group-chats.$id.manage.server.ts` (`PATCH`
  name), `group-chats.$id.members.server.ts` (`POST` add),
  `group-chats.$id.members.$userId.server.ts` (`DELETE` remove),
  `group-chats.$id.owner.server.ts` (`PUT` transfer).
- `lib/chat-plus/post.server.ts`: `SystemAction` gains `rename`, `add`,
  `remove`, `owner`; `systemFallback` covers them; the group message row
  renders them.
- `components/feed/group-chat/GroupInfoDialog.tsx`; `GroupHeader.tsx` opens it.
- `components/feed/NotificationsColumn.tsx`: a `group_chat` label under
  `s04-10`.

## Testing requirements

- Main suite `lib/group-chat/__tests__/group-manage.test.ts`: only the owner
  can rename, add, remove, transfer; blocked pairs and banned accounts are
  refused at add and at create; the cap holds under the lock; a removed
  member cannot read the group; transfer leaves exactly one owner.
- Main suite `lib/account/__tests__/group-chat-erasure.test.ts`: erasure
  leaves every group and passes ownership.
- Product suite `lib/group-chat/__tests__/manage.product.test.ts`.
- `components/feed/__tests__/GroupChatView.characterization.test.tsx` stays
  green (update its snapshot only for the header's new button, and say so).

## Acceptance criteria

- [ ] The owner renames the group and adds a member; both show as system
      lines and the new member is notified.
- [ ] Someone who blocked the owner cannot be added.
- [ ] Making another member owner moves the owner controls to them.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Co-admins, invite links for groups, members adding others, group avatars.

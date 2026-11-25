# 11 — The lists you are on

Surface: `/settings/lists` (new: the public and unlisted lists that include you, "Leave this list"), the list page and
"Add to list" sheet (a refusal for someone who left or is blocked), blocking. Wave 2. Namespace `lists-on`. Site tier
(Steel).

## User story

As a member, I want to see the lists other members have put me on that anyone can see, and to take myself off one and
stay off, so that I am not featured on a list I do not want to be on — and blocking someone should take me off their
lists as it takes me out of their follows.

## Requirements elicitation

- **What exists (verified):**
  - Lists are `CustomFeed` rows with `kind: 'list'` and `visibility` `PRIVATE | UNLISTED | PUBLIC` (`ListVisibility`,
    `prisma/schema/communities.prisma`); members are `CustomFeedMember` (`@@id([feedId, userId])`,
    `@@index([userId]) // "lists you're on"`, `prisma/schema/social.prisma`).
  - `listsUserIsOn(userId)` in `lib/lists/lists.server.ts` is written and **never called**, and it would list private
    lists too (it filters on `kind` only). `removeMember` already lets a member remove themselves
    (`DELETE /api/lists/$id/members`, `lib/lists/api/lists.$id.members.server.ts`, "owner, or self 'remove me'"), but no
    screen offers it and nothing stops the owner adding them straight back.
  - `addMember` (the site's `PUT`) checks no block, ban or deleted account, and counts the cap outside any lock
    (`count` then `upsert`); the developer API's `replaceListMembers` caller (`lib/api/v1/feeds.server.ts`) skips
    blocked members ("skipped and reported, never added").
  - Blocking removes follows in both directions (`lib/moderation/api/moderation.block.server.ts`) but leaves list
    memberships.
  - Settings pages are listed in `lib/settings-nav.ts` with labels in `components/settings/settings-nav-labels.ts`.
- **Decisions:**
  - **What is shown:** lists that include the member and are `PUBLIC` or `UNLISTED` (a private list is its owner's own
    note and stays invisible, as on other networks), with the list's name (`dir="auto"`), its owner (`<bdi>`) and when
    the member was added; newest first, 50 a page. A list whose owner the member blocks, or who blocks them, is not
    listed (blocking already took them off; see below).
  - **Leave:** "Leave this list" removes the membership and records a `ListLeave(feedId, userId, at)` row; the owner
    can never add them again to that list (`LIST_MEMBER_REFUSED`), through the site or the developer API. The owner is
    not told. The list is gone from the page at once.
  - **Blocks:** blocking deletes memberships in both directions (the blocker from the blocked member's lists and the
    blocked member from the blocker's), inside the block's own write; `addMember` refuses a pair blocked either way, a
    banned, pending-deletion or erased member (`LIST_MEMBER_REFUSED`, one sentence for all, so a refusal reveals
    nothing). The API's `replaceListMembers` caller (`lib/api/v1/feeds.server.ts`) also skips members who left, reported in
    `skipped` with a new reason `left` (the SDK types `reason` as `string`, so no generated type changes; the endpoint's
    description in `lib/api/registry.ts`, `pnpm docs:api` and one changelog line under `<!-- s13-11 lists-on -->`
    record it). Banned and deleted members are already skipped there as `not_found`, unchanged.
  - **The cap:** `addMember`'s count and insert move into a transaction under `lockKey(tx, 'list-members:<listId>')`.
  - **Erasure:** a member's leave rows are erased with the account; the rows on lists they own cascade with the list's
    own erasure (`CustomFeed` is already handled). Registry entry `ListLeave` (`erase`).
  - **Export:** the lists the member left (list name, owner, when), as `listsLeft` under the sprint 13 anchor.

## Functional requirements

1. FR-1 Migration `20261220020200_s13_lists_on`: `CREATE TABLE "custom_feed_leave"` (`"feedId"`, `"userId"`,
   `"at"`, primary key `("feedId", "userId")`, index on `"userId"`, foreign keys cascading from `"custom_feed"` and
   `"user"`).
2. FR-2 `lib/lists/lists-on.server.ts` (new): `listsIAmOn(userId, cursor)`, `leaveList(userId, listId)`,
   `exportListsLeft`, `listLeaveErasureOps`; `listsUserIsOn` is replaced by it (removed, it had no caller).
3. FR-3 `lib/lists/lists.server.ts` `addMember` under the lock with the refusals (the leave, block, ban and deletion
   checks run inside the locked transaction, so a block or a leave committed first always wins);
   `replaceListMembers` drops left members under the same lock; `lib/api/v1/feeds.server.ts` reports them as `left`;
   `moderation.block.server.ts` deletes the memberships both ways inside the block's transaction (`customFeedMember`
   rows of lists of `kind: 'list'` owned by either member that name the other).
4. FR-4 Endpoints (registered modules, contract `lib/lists/lists-on.contract.ts`): `GET /api/lists/on` and
   `POST /api/lists/$id/leave` (`rateLimit: 'write'`).
5. FR-5 Page `app/routes/_site/settings/lists.tsx` (`PageLayout`, rows on rules, one confirm via `useConfirm`, loading,
   empty "You are not on any public lists", error and signed-out states), its `lib/settings-nav.ts` row and label,
   `EXCLUDED_ROUTES` `personal` under the Wave 0 sitemap anchor.

## Non-functional requirements

- **Privacy:** private lists never appear; the owner learns nothing from a leave beyond the member being absent.
- **Design (Steel):** rows on `border-b border-site-border`; the only action per row is a text button; no primary.
- **Accessibility:** each row's action names the list ("Leave {{name}}").

## Data model and API

`ListLeave { feedId, userId, at }` (`@@id([feedId, userId])`, `@@index([userId])`, `@@map("custom_feed_leave")`).
`GET /api/lists/on?cursor=` → `{ lists: { id, name, owner, addedAt }[], nextCursor }`.

## Testing requirements

- Main suite `lib/lists/__tests__/lists-on.test.ts`: private lists excluded; blocked owners excluded; leaving removes
  and records; the owner's re-add is refused (site and API); a blocked, banned or erased member cannot be added; the
  cap under the lock.
- Main suite `lib/moderation/__tests__/block-lists.test.ts`: blocking removes memberships both ways, and only on lists
  the two own (a third member's list naming both is untouched).
- `lib/api/v1/__tests__/feeds-api.test.ts` (extended): a left member comes back in `skipped` as `left`.
- Main suite `lib/account/__tests__/lists-on-erasure.test.ts`; the export test (key `listsLeft`).
- `components/settings/__tests__/lists-on.test.tsx` (`renderToStaticMarkup`), the sitemap and settings-nav label tests,
  user-text direction, design consistency, Steel flat.

## Acceptance criteria

- [ ] A member sees a public list that includes them on `/settings/lists`.
- [ ] After "Leave this list", the owner cannot add them back.
- [ ] Blocking the owner of a list removes the member from it.
- [ ] A private list that includes the member is never shown.

## Out of scope

A global "nobody may add me to lists" setting, telling the owner, lists of communities.

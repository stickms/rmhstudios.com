# 14 — Blocked and muted accounts

Surface: a new settings destination `/settings/blocked` ("Blocked and muted") in
the settings hub (`lib/settings-nav.ts`), and account erasure. Wave 6. Namespace
`blocked-muted`.

## User story

As a member who has blocked or muted people over time, I want one place listing
everyone I have blocked or muted, with the date, where I can unblock or unmute
them — so that I can review those decisions without hunting for one of their
posts.

## Requirements elicitation

- **What exists (verified):** blocks (`UserBlock`) and mutes (`UserMute`) live
  in `prisma/schema/moderation.prisma` and are toggled by
  `lib/moderation/api/moderation.block.server.ts` and
  `moderation.mute.server.ts`. The only member-facing control is the post
  overflow menu (`components/feed/RMHarkOverflowMenu.tsx`, `handleBlock` /
  `handleMute`), which needs a post by that person in front of you.
  `GET /api/moderation/block` returns bare ids and no screen uses it; the only
  list UI is the admin "view as" panel (`components/safety/ViewAsAdmin.tsx`).
  There is no settings page for blocks or mutes. `anonymizeAccount`
  (`lib/account/deletion.server.ts`) erases neither table, so a deleted member's
  block and mute lists persist.
- **Decisions:** one page with two tabs (`components/ui/tabs.tsx`): Blocked and
  Muted. Each lists people with avatar, name, handle and since-date, newest
  first, 50 per page with "Load more", a filter by name or handle, and Unblock /
  Unmute (no confirmation for unmute; unblock confirms because it allows contact
  again — `useConfirm`). People whose accounts were deleted show as "Deleted
  account" with the action still available. A count appears beside each tab.
  Blocking from this page is out of scope (it needs a person in front of you).
  Erasure deletes rows where the member is the blocker or muter (not the rows
  where others blocked them — those are the other members' safety decisions and
  stay).

## Functional requirements

1. FR-1 `/settings/blocked` lists blocked accounts (default tab) and muted
   accounts, with counts.
2. FR-2 Unblock asks "Unblock {{name}}? They will be able to follow and message
   you again." and then removes the block; Unmute removes the mute at once with
   an Undo toast.
3. FR-3 The filter narrows by name or handle server-side (prefix,
   case-insensitive), so long lists stay paged.
4. FR-4 Empty states explain how to block or mute (from a post's menu).
5. FR-5 Signed-out visitors see the signed-out prompt.
6. FR-6 Account erasure deletes the member's own blocks and mutes.

## Non-functional requirements

- **Security:** endpoints `auth: 'required'`, list `rateLimit: 'read'`, the
  toggles keep their existing endpoints (reuse `toggleBlockApi` /
  `toggleMuteApi` with explicit intent: add an optional `{ block: boolean }` /
  `{ mute: boolean }` to their schemas so the page never toggles the wrong way
  after a stale list — additive). The list returns only the caller's rows and
  display fields (`userDisplaySelect`, `lib/user-display.ts`).
- **Performance:** keyset on `(createdAt, id)` with `@@index([blockerId])` /
  `@@index([muterId])` (existing); the filter joins `user` by handle/name with
  `startsWith` and `mode: 'insensitive'` on at most the member's own rows.
- **Privacy:** no counts are shown to anyone else; the page is `noindex`
  (personal route in the sitemap's `EXCLUDED_ROUTES`).
- **i18n:** `blocked-muted`; settings-nav label as a literal key in
  `components/settings/settings-nav-labels.ts` (with its test).
- **Steel:** rows on rules (`border-b border-site-border`), `t-meta`
  since-dates, secondary buttons for actions; one view, no ink primary needed.
- **Accessibility:** each action button's accessible name includes the person
  ("Unblock Ada"); tab counts are part of the tab's name.

## Data model and API

No schema change. `lib/moderation/blocked-muted.server.ts` (`listBlocked`,
`listMuted`, `blockMuteErasureOps`), contract
`lib/moderation/blocked-muted.contract.ts`, module
`lib/moderation/api/settings.blocked.server.ts` (GET
`?tab=blocked|muted&q=&after=`). Route `app/routes/_site/settings/blocked.tsx`,
component `components/settings/BlockedMutedPage.tsx`.

## Testing requirements

- Main suite `lib/moderation/__tests__/blocked-muted.test.ts`: lists only the
  caller's rows; keyset paging; filter; the explicit `block: false` never
  creates a block; deleted accounts are labelled.
- Main suite `lib/account/__tests__/blocks-mutes-erasure.test.ts`: the member's
  blocks and mutes are deleted; rows where others blocked the member are kept.
- Product suite
  `components/settings/__tests__/settings-nav-labels.product.test.ts` gains the
  new destination.

## Acceptance criteria

- [ ] Every block and mute the member made is listed, with dates.
- [ ] Unblocking from the page lets that person follow again; unmuting shows
      their posts again.
- [ ] After erasure the member's block and mute rows are gone.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Importing or exporting block lists, shared block lists, the reposts-off list (07
keeps its own in Settings > Content).

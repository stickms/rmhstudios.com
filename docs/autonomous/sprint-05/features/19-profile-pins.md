# 19 — Pin up to three posts

Surface: the post overflow menu (`components/feed/RMHarkOverflowMenu.tsx`), the
pin endpoint (`lib/feed/api/rmharks.$id.pin.server.ts`), the profile's posts tab
(`lib/profile/api/profile.$id.rmharks.server.ts`,
`components/feed/ProfileColumn.tsx` / `components/feed/profile-column/`), and
the developer API's post fields. Wave 6. Namespace `profile-pins`.

## User story

As a member whose profile is how people get to know them, I want to pin up to
three posts — my introduction, my best work, my current project — in the order I
choose, so that a visitor sees more than one thing before the timeline.

## Requirements elicitation

- **What exists (verified):** `RMHark.pinnedAt` with
  `@@index([userId, pinnedAt])` (`prisma/schema/social.prisma`, "one per user,
  enforced in code"). `POST /api/rmharks/$id/pin` toggles and, when pinning,
  clears any other pinned post in the same transaction. The profile's posts list
  reads the pinned post first.
- **Decisions:** up to 3 pinned posts per member; order is explicit (first
  pinned shows first) and can be changed with Move up / Move down from each
  pinned post's menu. Pinning a fourth is refused with "You can pin up to 3
  posts. Unpin one first." (never silently unpins). Order is stored in
  `pinnedAt` itself (earlier = higher), so no migration is needed: reordering
  swaps the two posts' `pinnedAt` values. A pinned post that is deleted or
  hidden by moderation stops counting toward the limit (the count query excludes
  `deletedAt` and moderation-hidden posts — use the same filters as the profile
  read). Only top-level posts by the member on their own profile can be pinned
  (not community posts, not replies), as today.

## Functional requirements

1. FR-1 The pin toggle keeps its endpoint; the response gains `pinnedCount` and
   `limit` (additive).
2. FR-2 The menu shows "Pin to profile (2 of 3)" when pins remain, "Unpin from
   profile" on a pinned post, and on pinned posts "Move up" / "Move down" where
   possible.
3. FR-3 The profile shows the pinned posts in order at the top, each with a
   "Pinned" `t-meta` line; the rest of the timeline follows without duplicates.
4. FR-4 The fourth pin is refused with a toast naming the limit.
5. FR-5 `/api/v1/posts*` and the profile JSON expose `pinned: boolean`
   (existing, if present) and add `pinnedOrder: number | null` (additive; never
   remove documented fields).

## Non-functional requirements

- **Correctness:** pinning runs in a transaction after
  `lockKey(tx, 'profile-pins:' + userId)`: count current pins, refuse at 3, then
  set `pinnedAt = now()` (it becomes the last). Reorder
  (`POST /api/rmharks/$id/pin/move { direction: 'up'|'down' }`) swaps `pinnedAt`
  with the neighbour under the same lock.
- **Security:** author-only (403), zod-validated body; deleted posts 404.
- **Read paths:** every place that reads `pinnedAt` must handle several: profile
  posts list (first page renders all pins, later pages exclude them), the
  profile header or modules if they show "the pinned post" (search `pinnedAt`
  across `lib/` and `components/`), the developer API, the RSS of a profile if
  any, OG cards if any.
- **Performance:** the existing index serves
  `userId = ? AND pinnedAt IS NOT NULL ORDER BY pinnedAt`.
- **i18n:** `profile-pins`.
- **Steel:** "Pinned" is `t-meta` muted text with the lucide `Pin` icon; pinned
  posts sit in the same rows-on-rules list, no boxes or backgrounds.
- **Accessibility:** menu item names include the position ("Move up, pinned 2 of
  3").

## Data model and API

No schema change. `lib/feed/profile-pins.server.ts` (`pinPost`, `unpinPost`,
`movePin`, `listPinned`); `lib/feed/profile-pins.ts` (pure: neighbour swap,
limit messaging). The existing `rmharks.$id.pin.server.ts` delegates to it; new
module `lib/feed/api/rmharks.$id.pin.move.server.ts` with a contract in
`lib/feed/profile-pins.contract.ts`.

## Testing requirements

- Main suite `lib/feed/__tests__/profile-pins.test.ts`: pin three, the fourth
  refused; unpinning frees a slot; a deleted pinned post frees a slot; move
  up/down swaps; author-only; the lock is taken before the count; the profile
  read returns all pins in order and no duplicates on the next page.
- Product suite `lib/feed/__tests__/profile-pins.product.test.ts`.

## Acceptance criteria

- [ ] A member pins three posts and they show in the chosen order on their
      profile.
- [ ] A fourth pin is refused, and nothing is unpinned silently.
- [ ] Reordering persists after reload.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Pinning in communities (moderator pins exist separately), pinning replies, more
than three.

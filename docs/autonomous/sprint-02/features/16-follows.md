# 16 — Followers and following manager

Surface: new page `/follows`. Wave 5. Namespace `follows`. Depends on 15
(`FollowEvent`, `recordFollowEvent`).

## User story

As a member who has followed hundreds of accounts over the years, I want one
page where I can see who I follow and who follows me, filter to people who do
not follow back or have gone quiet, unfollow several at once, and remove a
follower without blocking them, so that my feed and my audience are the ones I
choose.

## Requirements elicitation

- **What exists (verified):** a followers/following modal on profiles
  (`components/feed/profile-column/ProfileDialogs.tsx`, opened from
  `components/profile/ProfileHero.tsx`; data from
  `lib/profile/api/profile.$id.followers.server.ts`) — a plain list with follow
  buttons. Bulk unfollow by age exists in `/trash` (`lib/bulk/`, filter
  `olderThanDays` only). **There is no remove-follower action** (no code removes
  a `Follow` row where the member is the one followed, except a block), and no
  filters by mutual, inactivity or follow-back.
- **Decisions:** "Remove follower" deletes their follow of you, sends them
  nothing, and lets them follow again; the page says that clearly and points to
  Block for anything stronger. All unfollows go through `unfollowUser` so
  counters, caches and notifications stay consistent (the reason `lib/bulk`
  gives). Bulk actions are capped at 200 per request. "Inactive" means no post
  or comment in 90 days.

## Functional requirements

1. FR-1 `/follows` with two tabs, Following and Followers (shared `Tabs`
   primitive), counts in the tab labels.
2. FR-2 Search by name or handle; filters: Following — all, not following you
   back, inactive 90 days; Followers — all, you don't follow back, inactive 90
   days. Sort: most recent, name, last active.
3. FR-3 Each row: avatar, name, handle, "Follows you" / "You follow" markers,
   last active (relative), and actions — Unfollow / Follow back / Remove
   follower.
4. FR-4 Select rows (checkboxes, select all on the page) and unfollow or remove
   in bulk, with a confirmation naming the count.
5. FR-5 Single unfollow shows an Undo toast for 8 seconds; undo re-follows
   without a new follow notification to the other person.
6. FR-6 Remove follower writes a `FollowEvent` of kind `removed`.
7. FR-7 The profile's followers/following modal, on the member's own profile,
   gains a "Manage" link to `/follows`.

## Non-functional requirements

- **Security:** session-only; remove-follower can only delete follows whose
  `followingId` is the session user; bulk endpoints accept at most 200 ids and
  ignore ids that are not current follows; `rateLimit: 'write'`.
- **Performance:** keyset pagination by `(createdAt, id)`; "last active" from
  one grouped query per page; "inactive" filter in SQL with a `NOT EXISTS` over
  indexed post and comment tables, bounded to the page.
- **Accessibility:** checkboxes labelled with the person's name; bulk bar
  announces the selection count; undo reachable by keyboard before the toast
  closes (sonner toasts with action).
- **i18n:** strings in `follows`; relative times via the site helper.
- **Steel:** rows on rules; the bulk bar uses `components/ui/selection-bar.tsx`;
  one ink primary (the bulk action when a selection exists).

## Data model and API

No schema change (uses 15's `FollowEvent`).

- Server `lib/social/follow-manager.server.ts` (`listFollows`, `removeFollower`,
  `bulkUnfollow`, `bulkRemoveFollowers`); `followUser` gains an optional
  `notify?: boolean` (default true) used by undo.
- Contract `lib/social/follow-manager.contract.ts`; endpoints
  `GET /api/follows?tab=&filter=&q=&sort=&cursor=`, `POST /api/follows/remove`,
  `POST /api/follows/bulk-unfollow`.
- Route `app/routes/_site/follows.tsx`, `EXCLUDED_ROUTES` `'personal'`.

## Testing requirements

- Main suite `lib/social/__tests__/follow-manager.test.ts`: remove-follower
  cannot touch someone else's follows; it decrements both counters and records
  `removed`; bulk caps at 200 and skips non-follows; undo with `notify: false`
  creates no notification.
- Product suite `lib/social/__tests__/follow-filters.product.test.ts` for the
  pure filter and sort helpers.

## Acceptance criteria

- [ ] "Not following you back" lists exactly the people you follow who do not
      follow you.
- [ ] Removing a follower drops your follower count by one and they receive no
      notification; they can follow again.
- [ ] Bulk-unfollowing 30 people leaves counts consistent on both sides.
- [ ] Undo restores the follow and the other person sees no second notification.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Follow requests for private accounts, lists, importing follows from elsewhere.

# 07 — Turn off reposts

Surface: the post overflow menu (`components/feed/RMHarkOverflowMenu.tsx`) on a
repost and on a member's own posts, the home timeline (`lib/feed/timeline.ts`),
Settings > Content. Wave 2. Namespace `repost-mutes`.

## User story

As a member who follows someone for what they write, I want to stop seeing what
they repost without unfollowing or muting them — so that my timeline stays
theirs, not everyone they amplify.

## Requirements elicitation

- **What exists (verified):** the timeline merges posts and `RMHarkRepost`
  records (`lib/feed/timeline.ts`: the Following query at the
  `prisma.rMHarkRepost.findMany` near line 577 and the For You one near line
  703), rendering a repost with `repostedBy`. The only per-person controls are
  mute (`UserMute`, hides everything) and block. Nothing hides only reposts
  (`grep -ri "hideReposts\|repostsHidden"` finds nothing).
- **Decisions:** a per-viewer list of people whose reposts are hidden
  (`RepostMute`), at most 1 000 entries. It hides their reposts from the
  viewer's Following and For You timelines and from the live "new posts" signal;
  their own posts, quote posts and replies are unaffected, and the reposts stay
  visible on their profile's Reposts tab (an explicit visit). Turning reposts
  off does not notify the other person and is not visible to them.

## Functional requirements

1. FR-1 On a repost in the timeline, the overflow menu offers "Turn off reposts
   from {{name}}". On any post by someone else it offers the same (or "Turn on
   reposts from {{name}}" when already off).
2. FR-2 Choosing it removes that person's reposts from the current timeline list
   immediately and from later pages; a toast offers Undo.
3. FR-3 Settings > Content gains "Reposts turned off": the list of people
   (avatar, name, handle, since), each with "Turn on", searchable when longer
   than 20, empty state when none.
4. FR-4 The 1 001st entry is refused with a message naming the limit.
5. FR-5 Blocking someone removes any `RepostMute` row the blocker had for them
   (blocking already hides everything; the row would be dead weight).

## Non-functional requirements

- **Performance:** the viewer's repost-muted ids are read once per timeline
  request with the other viewer lists (the same place `hiddenIds` is assembled),
  cached per viewer for 30 s with explicit invalidation on toggle; the repost
  queries gain `userId: { notIn: mutedRepostIds }` (only when non-empty). No
  extra query when the list is empty (cache the empty result too).
- **Correctness:** the cap is checked inside a transaction after
  `lockKey(tx, 'repost-mutes:' + userId)`.
- **Security:** `auth: 'required'`, `rateLimit: 'write'`, zod-validated
  `{ targetUserId }`; toggling yourself is 400; an unknown user 404. The list
  endpoint only returns the caller's rows and respects blocks (a person who
  blocked the viewer shows as unavailable without profile details, matching the
  follows manager's rule — read `lib/social/follow-manager.server.ts` for the
  existing treatment).
- **Privacy:** erasure deletes rows where the member is either side; export
  includes the member's own list.
- **i18n:** `repost-mutes`.
- **Steel:** settings list as rows on rules with `t-meta` dates; menu items are
  the existing overflow-menu items with lucide icons (`Repeat2`).
- **Accessibility:** the menu item's text states the action and the person; the
  Undo toast is reachable by keyboard (sonner default).

## Data model and API

- `RepostMute { id String @id @default(cuid()), userId, targetId, createdAt }`,
  `@@unique([userId, targetId])`, `@@index([userId, createdAt(sort: Desc)])`,
  relations to `User` both ways (back-relations under the auth anchor),
  `@@map("repost_mute")` in `prisma/schema/social.prisma`. Migration
  `20261125020000_s05_repost_mutes`.
- `lib/feed/repost-mutes.server.ts`: `getRepostMutedIds(userId)` (cached),
  `toggleRepostMute`, `listRepostMutes(userId, cursor)`,
  `repostMuteErasureOps(userId)`, `exportRepostMutes(userId)`.
- Contract `lib/feed/repost-mutes.contract.ts`; modules
  `lib/feed/api/repost-mutes.server.ts` (GET list, POST toggle
  `{ targetUserId, off: boolean }`).
- `lib/feed/timeline.ts`: both repost queries exclude the ids;
  `lib/moderation/api/moderation.block.server.ts`: delete the blocker's row on
  block.

## Testing requirements

- Main suite `lib/feed/__tests__/repost-mutes.test.ts`: toggling adds and
  removes; cap of 1 000 under the lock; the Following and For You repost queries
  receive `notIn` with the id (mock Prisma, assert the where); the person's own
  posts are still queried; blocking deletes the row; self-toggle 400.
- Main suite `lib/account/__tests__/repost-mutes-erasure.test.ts`.
- Product suite `lib/feed/__tests__/repost-mutes.product.test.ts`: the
  optimistic list removal used by the timeline (remove items whose
  `repostedBy.id` matches).

## Acceptance criteria

- [ ] After turning reposts off for A, A's reposts vanish from both timelines;
      A's posts remain.
- [ ] A's Reposts tab on their profile still shows them.
- [ ] The setting list shows A and "Turn on" restores the reposts.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Hiding quote posts, hiding reposts of a particular post, per-community controls.

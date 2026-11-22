# 06 — Pinned posts in communities

Surface: the community page (`/c/$slug`), the post's overflow menu inside a community, the mod log, the community feed
API. Wave 3. Namespace `community-pins`.

## User story

As a moderator of a community, I want to keep up to three members' posts at the top of the community — the welcome
thread, this week's challenge, the rules discussion — so that newcomers see them first, and as their author I want to
know when my post is pinned.

## Requirements elicitation

- **What exists (verified):**
  - Communities have announcements (`CommunityAnnouncement`, mod-log actions `announcement_posted` /
    `announcement_removed`) — a moderator's own short notice, not a member's post with its replies.
  - `RMHark.pinnedAt` is a profile pin (sprint 05 19, up to three on a profile); nothing pins a post inside a community.
    Sprint 08 rejected community pins only as needing "its own design: how many, who pins and what it does to the feed".
  - The community feed is read by `getCommunityFeed` (`lib/communities/detail.server.ts`) behind
    `lib/communities/api/communities.$slug.feed.server.ts`, and server-side by the `c.$slug.tsx` loader. Moderator roles
    come from `lib/communities/guard.server.ts` / `page-policy.ts` `isModerator`; the mod log is
    `lib/communities/modlog.ts` (actions listed by group) with the public log
    (`components/communities/PublicModLog.tsx`).
  - Every reader of posts is classified in the post read-path registries: `CONTENT_WARNING_READ_PATHS`
    (`lib/feed/content-warning.ts`), `QUIET_COUNT_READ_PATHS` (`lib/feed/quiet-counts.ts`, with the ratchet
    `lib/feed/__tests__/quiet-counts.test.ts`), `GIF_ALT_READ_PATHS` (`lib/feed/gif-alt.ts`), `QUIZ_READ_PATHS`
    (`lib/feed/quiz-poll.ts`).
- **Decisions (the design sprint 08 asked for):**
  - **How many:** at most three per community, ordered by the moderator (move up / move down). The cap is a
    check-then-insert under `lockKey(tx, 'community-pins:<communityId>')`.
  - **Who pins:** moderators and the owner (the existing `isModerator`). Any top-level post (`threadRootId` null, not a
    comment or reply) in the community that is live, not held by AutoMod, not removed and not locked-private; a pinned
    post that is later deleted, removed or held drops out of the pinned block on read (and its pin row is deleted by the
    removal path or, failing that, ignored).
  - **What it does to the feed:** pinned posts appear in a "Pinned" block of rows above the community's own feed, each
    once; the feed below excludes them. Nothing changes in Home, Explore, search, profiles or the API's
    `/api/v1/communities/{slug}/posts` (a `pinned: true` field is added to each post there instead, additive). A reader
    who blocks the author, or is blocked by them, does not see that pinned row (the same filter the feed applies). Quiet
    counts, content warnings, GIF descriptions and quiz reveals apply exactly as in the feed, because the block reads
    through the same serialiser.
  - **The author is told** once: a `SYSTEM` notification "Moderators of <community> pinned your post" (`entityType`
    `community-pin`, deduplicated on the post id so unpin and re-pin do not repeat it), with its label under the
    `s09-06` anchor; never sent when the moderator pins their own post; unpinning is silent.
  - **The mod log:** `post_pinned`, `post_unpinned`, `pins_reordered` in the content group, shown in the public log like
    `content_removed` is (the post is public in the community; no moderator name in the public log, as today).
  - **Storage:** new `CommunityPinnedPost (communityId, postId, position, pinnedById, pinnedAt)`,
    `@@id([communityId, postId])`, `@@index([communityId, position])`, cascade with the community and the post;
    `pinnedBy` relation to `User` (`onDelete: Cascade`) under the `s09-06` anchor in `auth.prisma`. Registry: `keep` —
    "Rule 2: a community's arrangement of its own content; it never shows who pinned". Not exported (a moderator
    record).

## Functional requirements

1. FR-1 The model, migration and registry entry.
2. FR-2 `pinPost`, `unpinPost`, `reorderPins` (contract + `implement()`, `rateLimit: 'write'`), moderator-only, capped
   under the lock, each writing its mod-log row in the same transaction.
3. FR-3 `getCommunityFeed` gains an option `{ withPins: true }`, used by the `c.$slug.tsx` loader and the site feed
   endpoint only: it returns `pinned` (first page only) and excludes pinned ids from the page. Without the option (the
   developer API's `/api/v1/communities/{slug}/posts`, which calls the same function) the page is unchanged and each
   post carries `pinned: boolean`, additive.
4. FR-4 The "Pinned" block on `/c/$slug`, the "Pin to community" / "Unpin" / "Move up" / "Move down" items in the post's
   overflow menu for moderators, and a "Pinned" `t-meta` marker on a pinned row.
5. FR-5 The author's notification and its label.
6. FR-6 The four read-path registries gain the new reader file.

## Non-functional requirements

- **Correctness:** the fourth pin is refused with "A community can pin three posts. Unpin one first."; a pin of a post
  in another community is a 404; two moderators pinning at once cannot exceed three.
- **Performance:** one extra indexed query on the first page; the pinned posts are serialised with the page's batch (no
  N+1).
- **Design:** rows on rules, not cards; the block is introduced by a `t-label` "Pinned"; no colour, no badge box (R3).
- **Accessibility:** the block is a labelled list; the menu items are the existing menu primitive.

## Data model and API

- `CommunityPinnedPost` in `prisma/schema/communities.prisma` (`@@map("community_pinned_post")`); migration
  `20261129030200_s09_community_pins`.
- New `lib/communities/pins.server.ts`, `lib/communities/pins.contract.ts`,
  `lib/communities/api/communities.$slug.pins*.server.ts`, `components/communities/PinnedPosts.tsx`. Edits:
  `lib/communities/detail.server.ts`, `app/routes/_site/c.$slug.tsx`, the post overflow menu,
  `lib/communities/modlog.ts` + `ModLog.tsx` + `PublicModLog.tsx` labels, `components/feed/notification-labels.ts` and
  its test (anchor), `lib/api/v1/communities.server.ts` (the `pinned` field), `lib/api/registry.ts` (that field, in
  place), `docs/developer-api/changelog.md` (anchor `<!-- s09-06 community-pins -->`), the SDK and API docs regenerated
  (`pnpm sdk:generate`, `pnpm docs:api`), the four registries, `lib/account/erasure-registry.ts`,
  `docs/account-deletion.md`.

## Testing requirements

- Main suite `lib/communities/__tests__/pins.test.ts` (mock Prisma): moderator pins, member refused, fourth refused
  under the lock, reorder, unpin, other community 404, mod-log rows in the transaction, the notification once and never
  to a moderator pinning their own post; a comment cannot be pinned.
- Main suite `lib/communities/__tests__/pins-feed.test.ts`: pinned first, excluded below, blocked author hidden in both
  directions, a removed or held post dropped, quiet counts applied to a pinned row; without `withPins` (the API path)
  the page is unchanged and carries `pinned`; a private community's pins are not readable by a non-member (the feed's
  own 404 holds).
- The four read-path registry tests, `components/feed/__tests__/notification-labels.test.ts`,
  `lib/account/__tests__/erasure-coverage.test.ts`, `lib/__tests__/migration-safety.test.ts`.

## Acceptance criteria

- [ ] A moderator pins two posts; they appear in order above the feed and not again below it.
- [ ] The authors each get one notification.
- [ ] A fourth pin is refused with the cap message.
- [ ] A reader who blocked one author sees only the other pinned post.
- [ ] The public mod log shows "Post pinned".

## Out of scope

Pinning in Home or on the profile (exists), pin expiry, pinning comments, pinned posts in the developer API's feed
endpoints beyond the `pinned` field.

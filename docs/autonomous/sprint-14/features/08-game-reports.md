# 08 — Report a game review, a guide, a discussion or an achievement tip

Surface: a game's page in the games library (reviews, guides, the discussion hub and its threads), achievement tips,
the admin report queue, Your reports. Wave 2. Namespace `game-reports`. The games library keeps its own look; the queue
and Your reports are on the site tier.

## User story

As a player reading a game's reviews, guides, discussions and achievement tips, I want to report one that is abusive,
spam or a spoiler trap, so that a moderator removes it; and as a moderator I want to remove it from the queue so it
does not come back.

## Requirements elicitation

- **What exists (verified):**
  - Five kinds of public member text on the games library, none with a report path:
    `GameReview` (`stars`, `body`), `GameGuide` (`title`, `body`, `published`, revisions), `GameThread` (`title`,
    `body`, `locked`, `pinned`) and `GameThreadPost` (`body`) in `prisma/schema/games.prisma`, and `AchievementTip`
    (`body`, `votes`) in `prisma/schema/economy.prisma`. Writers and readers: `lib/games/meta.server.ts`
    (`listReviews`, `upsertReview`, `deleteReview`, `listGuides`, `getGuide`, `createGuide`, `updateGuide`,
    `deleteGuide`, `publishGuide`), `lib/games/hub.server.ts` (`createThread`, `createPost`, `deleteThread`,
    `deletePost`, `moderateThread`, `getHub`, `getThreadPage`), `lib/arcade/api/arcade.tips.server.ts`; further readers
    `lib/games/profile.server.ts`, `lib/games/activity.server.ts`, `lib/awards/awards.server.ts`,
    `lib/arcade/updates.server.ts`, `lib/games/guide-history.server.ts`, `lib/sitemap.server.ts`.
  - Admins can delete a thread or post from the hub (`deleteThread` / `deletePost` with `isAdmin`); nothing hides a
    review, guide or tip, and members cannot ask for it.
  - UI: `components/steam/SteamReviews.tsx`, `components/steam/SteamGuides.tsx`, `components/steam/HubPage.tsx`,
    `components/steam/ThreadPage.tsx`, `components/arcade/AchievementTips.tsx`.
  - Sprint 12 16's member-item pattern: `MEMBER_ITEM_REPORT_TYPES` (refuse a missing, private, taken-down or own item)
    and `moderatedAt` (a takedown the owner cannot undo, `CONTENT_REMOVED_BY_MODERATOR`), held per type by a takedown
    branch in `lib/moderation/triage.server.ts` and `lib/moderation/__tests__/music-reports.test.ts`.
- **Decisions:**
  - **Types:** `game-review` (the `GameReview` id), `game-guide` (a published `GameGuide`), `game-thread`,
    `game-thread-post`, `achievement-tip`; all removable and all in `MEMBER_ITEM_REPORT_TYPES`; the owner is the
    author.
  - **Takedown:** reviews, guides and tips gain `moderatedAt DateTime?`; a takedown stamps it, and every reader shows
    only `moderatedAt: null` rows to others (the author sees their own with "Removed by a moderator"). Editing or
    deleting a moderated review, guide or tip is refused with `CONTENT_REMOVED_BY_MODERATOR` (so deleting and writing
    again cannot bring a removed review back); the rating aggregate leaves moderated reviews out. A thread or post is
    deleted by the takedown (`deleteThread` / `deletePost` with the admin path, which already decrements counts), as
    the hub's own admin delete does.
  - **A read-path registry:** `GAME_CONTENT_READ_PATHS` (new, `lib/games/moderation.ts`) lists every server file that
    reads `gameReview`, `gameGuide` or `achievementTip` to show it, held by a source scan that fails a new reader
    without `moderatedAt: null` (the sprint 13 08 pattern).
  - **Previews:** the queue shows the game's title, the item's kind and its text cut to 280 characters (a guide's
    title and first paragraph).
  - **Entry points:** a "Report" item on each review, guide, thread, post and tip by someone else, opening
    `ReportDialog` lazily.

## Functional requirements

1. FR-1 Schema: `moderatedAt DateTime?` on `GameReview`, `GameGuide`, `AchievementTip`; migration
   `20261228020100_s14_game_reports` (three `ALTER TABLE … ADD COLUMN`, nullable, no index).
2. FR-2 `lib/games/moderation.ts` (new: `GAME_CONTENT_READ_PATHS`, the type list) and `lib/games/moderation.server.ts`
   (new: owner lookup, eligibility, takedown, previews per type).
3. FR-3 The readers above filter `moderatedAt: null` for other viewers; `upsertReview`, `deleteReview`, `updateGuide`,
   `deleteGuide`, `publishGuide` and the tip writes refuse a moderated row; `getRatingAgg(s)` excludes moderated
   reviews.
4. FR-4 Report path under `s14-08 game-reports` in every anchored report file (types, removable types, member-item
   types, `resolveTargetUser`, eligibility, takedown branches, previews, my-reports, the panel and the kind labels).
5. FR-5 UI: "Report" items in the five components above; the author's own removed item shows "Removed by a moderator"
   with no edit or delete.

## Non-functional requirements

- **Every read path:** the registry scan covers the sitemap reader, profile, activity, awards and updates readers, so
  a removed guide leaves the sitemap and every list.
- **Query shapes (verify against the schema):** `moderatedAt` is optional, so `{ moderatedAt: null }` is right; the
  rating aggregate is an `aggregate` or `groupBy` with `where: { gameId, moderatedAt: null }`; never select a
  `moderatedAt` on `GameThread` or `GameThreadPost` (they have none).
- **Migration:** additive, nullable columns only (`.github/scripts/check-migrations-additive.mjs`).

## Data model and API

Three nullable columns. Reports through `POST /api/moderation/report`.

## Testing requirements

- Main suite `lib/games/__tests__/game-reports.test.ts`: eligibility per type (own, unpublished guide, missing,
  already removed), owner lookup, takedown per type, a moderated review cannot be edited or deleted, the aggregate
  leaves it out.
- Main suite `lib/games/__tests__/game-content-read-paths.test.ts`: the source scan over the three models.
- `lib/moderation/__tests__/music-reports.test.ts`, `lib/__tests__/migration-safety.test.ts`, the i18n gates,
  `lib/__tests__/user-text-direction.test.ts`.

## Acceptance criteria

- [ ] A player reports another player's review; after "Resolve & remove" it is gone from the game page, the profile
      and the rating, and its author sees "Removed by a moderator" and cannot edit it.
- [ ] A removed guide leaves the game's guide list and the sitemap.
- [ ] A reported thread post removed from the queue is deleted and the thread's reply count falls by one.
- [ ] No "Report" item appears on the player's own review, guide, thread, post or tip.

## Out of scope

Guide revisions as their own reports, community-moderator handling of game hubs, an appeal path.

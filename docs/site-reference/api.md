<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/games.ts, lib/apps.ts.
  Regenerate with `pnpm docs:site`.
-->

# API routes

Every server route in the app tier — 472 files across 120 groups. This is the whole internal surface, not just the public developer API: the public, versioned, key-authenticated subset is `/api/v1/*`, documented in [the developer API reference](../developer-api/endpoints/index.md). Everything else is session-authenticated and internal — treat it as unstable.

Methods are read from each file's `server.handlers` block. A route with no methods listed exports a handler built by a wrapper (for example the developer API `withDeveloperApi`).

## `/api/account`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/account/delete` | `POST` | `app/routes/api/account/delete.ts` |
| `/api/account/export` | `GET` | `app/routes/api/account/export.ts` |
| `/api/account/standing` | `GET` | `app/routes/api/account/standing.ts` |
| `/api/account/strikes/:id/appeal` | `POST` | `app/routes/api/account/strikes/$id/appeal.ts` |

## `/api/achievements`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/achievements/:userId` | `GET` | `app/routes/api/achievements/$userId.ts` |

## `/api/admin`

40 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/admin/albums` | `GET` `POST` | `app/routes/api/admin/albums/index.ts` |
| `/api/admin/albums/:id` | `DELETE` `PATCH` | `app/routes/api/admin/albums/$id.ts` |
| `/api/admin/albums/:id/reorder` | `POST` | `app/routes/api/admin/albums/$id/reorder.ts` |
| `/api/admin/albums/:id/slides` | `POST` | `app/routes/api/admin/albums/$id/slides.ts` |
| `/api/admin/albums/:id/slides/:slideId` | `DELETE` | `app/routes/api/admin/albums/$id/slides/$slideId.ts` |
| `/api/admin/albums/reorder` | `POST` | `app/routes/api/admin/albums/reorder.ts` |
| `/api/admin/analytics` | `GET` | `app/routes/api/admin/analytics.ts` |
| `/api/admin/announcements` | `GET` `POST` | `app/routes/api/admin/announcements.ts` |
| `/api/admin/announcements/:id` | `DELETE` `POST` | `app/routes/api/admin/announcements/$id.ts` |
| `/api/admin/appeals` | `GET` | `app/routes/api/admin/appeals.ts` |
| `/api/admin/appeals/:id` | `POST` | `app/routes/api/admin/appeals/$id.ts` |
| `/api/admin/audit-log` | `GET` | `app/routes/api/admin/audit-log.ts` |
| `/api/admin/blog` | `DELETE` `POST` | `app/routes/api/admin/blog.ts` |
| `/api/admin/curated-builds/image` | `POST` | `app/routes/api/admin/curated-builds/image.ts` |
| `/api/admin/curated-builds/image/:filename` | `GET` | `app/routes/api/admin/curated-builds/image/$filename.ts` |
| `/api/admin/curated-builds/image/proxy` | `GET` | `app/routes/api/admin/curated-builds/image/proxy.ts` |
| `/api/admin/economy` | `GET` | `app/routes/api/admin/economy.ts` |
| `/api/admin/library` | `GET` | `app/routes/api/admin/library/index.ts` |
| `/api/admin/library/:id` | `DELETE` `PATCH` | `app/routes/api/admin/library/$id.ts` |
| `/api/admin/library/migrate` | `POST` | `app/routes/api/admin/library/migrate.ts` |
| `/api/admin/library/quota-requests` | `GET` `POST` | `app/routes/api/admin/library/quota-requests.ts` |
| `/api/admin/library/reorder` | `POST` | `app/routes/api/admin/library/reorder.ts` |
| `/api/admin/library/storage-health` | `GET` | `app/routes/api/admin/library/storage-health.ts` |
| `/api/admin/predictions` | `GET` | `app/routes/api/admin/predictions/index.ts` |
| `/api/admin/predictions/:id/moderate` | `POST` | `app/routes/api/admin/predictions/$id/moderate.ts` |
| `/api/admin/predictions/:id/resolve` | `POST` | `app/routes/api/admin/predictions/$id/resolve.ts` |
| `/api/admin/redemptions` | `GET` | `app/routes/api/admin/redemptions/index.ts` |
| `/api/admin/redemptions/:id` | `POST` | `app/routes/api/admin/redemptions/$id.ts` |
| `/api/admin/reports` | `GET` | `app/routes/api/admin/reports.ts` |
| `/api/admin/reports/:id` | `POST` | `app/routes/api/admin/reports/$id.ts` |
| `/api/admin/review-counts` | `GET` | `app/routes/api/admin/review-counts.ts` |
| `/api/admin/rideshare/applications` | `GET` `PATCH` | `app/routes/api/admin/rideshare/applications.ts` |
| `/api/admin/rideshare/rides` | `GET` | `app/routes/api/admin/rideshare/rides.ts` |
| `/api/admin/users` | `GET` `PATCH` | `app/routes/api/admin/users.ts` |
| `/api/admin/users/:id/ban` | `POST` | `app/routes/api/admin/users/$id/ban.ts` |
| `/api/admin/users/:id/grant-membership` | `POST` | `app/routes/api/admin/users/$id/grant-membership.ts` |
| `/api/admin/users/:id/set-coins` | `POST` | `app/routes/api/admin/users/$id/set-coins.ts` |
| `/api/admin/users/:id/strike` | `POST` | `app/routes/api/admin/users/$id/strike.ts` |
| `/api/admin/vibe/backfill-thumbs` | `POST` | `app/routes/api/admin/vibe/backfill-thumbs.ts` |
| `/api/admin/wager/:id/resolve` | `POST` | `app/routes/api/admin/wager/$id/resolve.ts` |

## `/api/ai`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/ai/ask-feed` | `POST` | `app/routes/api/ai/ask-feed.ts` |
| `/api/ai/message-suggest` | `POST` | `app/routes/api/ai/message-suggest.ts` |
| `/api/ai/search` | `POST` | `app/routes/api/ai/search.ts` |
| `/api/ai/transform` | `POST` | `app/routes/api/ai/transform.ts` |

## `/api/albums`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/albums/asset/*` | `GET` | `app/routes/api/albums/asset/$.ts` |

## `/api/altair`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/altair/leaderboard` | `GET` | `app/routes/api/altair/leaderboard.ts` |
| `/api/altair/match` | `POST` | `app/routes/api/altair/match.ts` |
| `/api/altair/meta` | `GET` `POST` | `app/routes/api/altair/meta.ts` |
| `/api/altair/score` | `POST` | `app/routes/api/altair/score.ts` |

## `/api/announcements`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/announcements` | `GET` | `app/routes/api/announcements.ts` |
| `/api/announcements/:id/vote` | `POST` | `app/routes/api/announcements/$id/vote.ts` |

## `/api/arcade`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/arcade` | `GET` | `app/routes/api/arcade/index.ts` |
| `/api/arcade/claim` | `POST` | `app/routes/api/arcade/claim.ts` |

## `/api/assistant`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/assistant` | `POST` | `app/routes/api/assistant.ts` |

## `/api/auth`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/auth/*` | `GET` `OPTIONS` `POST` | `app/routes/api/auth/$.ts` |

## `/api/awards`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/awards` | `GET` `POST` | `app/routes/api/awards/index.ts` |
| `/api/awards/:id/hide` | `POST` | `app/routes/api/awards/$id.hide.ts` |

## `/api/battlepass`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/battlepass` | `GET` | `app/routes/api/battlepass/index.ts` |
| `/api/battlepass/claim` | `POST` | `app/routes/api/battlepass/claim.ts` |
| `/api/battlepass/unlock` | `POST` | `app/routes/api/battlepass/unlock.ts` |

## `/api/bookmarks`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/bookmarks` | `GET` | `app/routes/api/bookmarks.ts` |

## `/api/builds`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/builds/cover/:file` | `GET` | `app/routes/api/builds/cover/$file.ts` |

## `/api/circle`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/circle` | `GET` `PUT` | `app/routes/api/circle.ts` |

## `/api/client-error`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/client-error` | `POST` | `app/routes/api/client-error.ts` |

## `/api/coins`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/coins` | `GET` | `app/routes/api/coins/index.ts` |
| `/api/coins/bet` | `POST` | `app/routes/api/coins/bet.ts` |
| `/api/coins/claim` | `POST` | `app/routes/api/coins/claim.ts` |
| `/api/coins/gift` | `POST` | `app/routes/api/coins/gift.ts` |
| `/api/coins/purchase` | `POST` | `app/routes/api/coins/purchase.ts` |
| `/api/coins/tip` | `POST` | `app/routes/api/coins/tip.ts` |

## `/api/comments`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/comments/:commentId/react` | `POST` | `app/routes/api/comments/$commentId/react.ts` |
| `/api/comments/:commentId/translate` | `GET` | `app/routes/api/comments/$commentId/translate.ts` |

## `/api/communities`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/communities` | `GET` `POST` | `app/routes/api/communities/index.ts` |
| `/api/communities/:slug` | `GET` | `app/routes/api/communities/$slug/index.ts` |
| `/api/communities/:slug/announcements` | `GET` `POST` | `app/routes/api/communities/$slug/announcements.ts` |
| `/api/communities/:slug/announcements/:id` | `DELETE` | `app/routes/api/communities/$slug/announcements/$id.ts` |
| `/api/communities/:slug/feed` | `GET` | `app/routes/api/communities/$slug/feed.ts` |
| `/api/communities/:slug/join` | `POST` | `app/routes/api/communities/$slug/join.ts` |
| `/api/communities/:slug/members` | `GET` | `app/routes/api/communities/$slug/members.ts` |
| `/api/communities/:slug/members/:userId` | `DELETE` `PATCH` | `app/routes/api/communities/$slug/members/$userId.ts` |

## `/api/creator`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/creator/redeem` | `GET` `POST` | `app/routes/api/creator/redeem/index.ts` |
| `/api/creator/studio-overview` | `GET` | `app/routes/api/creator/studio-overview.ts` |

## `/api/creators`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/creators/:id/join` | `POST` | `app/routes/api/creators/$id/join.ts` |

## `/api/cron`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/cron/webhooks` | `POST` | `app/routes/api/cron/webhooks.ts` |

## `/api/daily-puzzles`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/daily-puzzles/leaderboard` | `GET` | `app/routes/api/daily-puzzles/leaderboard.ts` |
| `/api/daily-puzzles/puzzle` | `GET` | `app/routes/api/daily-puzzles/puzzle.ts` |
| `/api/daily-puzzles/results` | `GET` | `app/routes/api/daily-puzzles/results.ts` |
| `/api/daily-puzzles/score` | `POST` | `app/routes/api/daily-puzzles/score.ts` |

## `/api/developer`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/developer/keys` | `GET` `POST` | `app/routes/api/developer/keys/index.ts` |
| `/api/developer/keys/:id` | `DELETE` `PATCH` | `app/routes/api/developer/keys/$id.ts` |
| `/api/developer/keys/:id/usage` | `GET` | `app/routes/api/developer/keys/$id/usage.ts` |

## `/api/discord`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/discord/activity-image` | `GET` | `app/routes/api/discord/activity-image.ts` |
| `/api/discord/daily-progress` | `GET` `POST` | `app/routes/api/discord/daily-progress.ts` |
| `/api/discord/embed` | `GET` `POST` | `app/routes/api/discord/embed.ts` |
| `/api/discord/race` | `GET` `POST` | `app/routes/api/discord/race.ts` |
| `/api/discord/sync-score` | `POST` | `app/routes/api/discord/sync-score.ts` |
| `/api/discord/token` | `POST` | `app/routes/api/discord/token.ts` |

## `/api/doctrine`

17 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/doctrine/admin/disclosures` | `PATCH` `POST` | `app/routes/api/doctrine/admin/disclosures.ts` |
| `/api/doctrine/admin/incidents` | `PATCH` | `app/routes/api/doctrine/admin/incidents.ts` |
| `/api/doctrine/admin/tiers` | `POST` | `app/routes/api/doctrine/admin/tiers.ts` |
| `/api/doctrine/incidents` | `GET` `POST` | `app/routes/api/doctrine/incidents/index.ts` |
| `/api/doctrine/incidents/:id` | `GET` | `app/routes/api/doctrine/incidents/$id.ts` |
| `/api/doctrine/puzzles/leaderboard` | `GET` | `app/routes/api/doctrine/puzzles/leaderboard.ts` |
| `/api/doctrine/puzzles/replay` | `GET` `POST` | `app/routes/api/doctrine/puzzles/replay.ts` |
| `/api/doctrine/puzzles/submit` | `POST` | `app/routes/api/doctrine/puzzles/submit.ts` |
| `/api/doctrine/puzzles/today` | `GET` | `app/routes/api/doctrine/puzzles/today.ts` |
| `/api/doctrine/reactions` | `POST` | `app/routes/api/doctrine/reactions.ts` |
| `/api/doctrine/recruitment/create` | `POST` | `app/routes/api/doctrine/recruitment/create.ts` |
| `/api/doctrine/recruitment/redeem` | `POST` | `app/routes/api/doctrine/recruitment/redeem.ts` |
| `/api/doctrine/reputation` | `GET` | `app/routes/api/doctrine/reputation/index.ts` |
| `/api/doctrine/reputation/leaderboard` | `GET` | `app/routes/api/doctrine/reputation/leaderboard.ts` |
| `/api/doctrine/safehouse/content` | `GET` | `app/routes/api/doctrine/safehouse/content.ts` |
| `/api/doctrine/safehouse/disclosures` | `GET` | `app/routes/api/doctrine/safehouse/disclosures.ts` |
| `/api/doctrine/sahur/status` | `GET` | `app/routes/api/doctrine/sahur/status.ts` |

## `/api/dream-rift`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/dream-rift/coop` | `GET` `POST` | `app/routes/api/dream-rift/coop.ts` |
| `/api/dream-rift/leaderboard` | `GET` | `app/routes/api/dream-rift/leaderboard.ts` |
| `/api/dream-rift/score` | `POST` | `app/routes/api/dream-rift/score.ts` |

## `/api/email`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/email/unsubscribe` | `GET` | `app/routes/api/email/unsubscribe.ts` |

## `/api/embed`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/embed/oembed` | `GET` | `app/routes/api/embed/oembed.ts` |

## `/api/events`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/events` | `GET` `POST` | `app/routes/api/events/index.ts` |
| `/api/events/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/events/$id/index.ts` |
| `/api/events/:id/ics` | `GET` | `app/routes/api/events/$id/ics.ts` |
| `/api/events/:id/rsvp` | `DELETE` `POST` | `app/routes/api/events/$id/rsvp.ts` |

## `/api/explore`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/explore` | `GET` | `app/routes/api/explore.ts` |

## `/api/feed`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feed/hashtag-search` | `GET` | `app/routes/api/feed/hashtag-search.ts` |
| `/api/feed/image/:filename` | `GET` | `app/routes/api/feed/image/$filename.ts` |
| `/api/feed/mention-search` | `GET` | `app/routes/api/feed/mention-search.ts` |
| `/api/feed/signal` | `DELETE` `GET` `POST` | `app/routes/api/feed/signal.ts` |
| `/api/feed/stream` | `GET` | `app/routes/api/feed/stream.ts` |

## `/api/feedback`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feedback` | `GET` `POST` | `app/routes/api/feedback.ts` |

## `/api/forest-explorer`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/forest-explorer/save` | `GET` `POST` | `app/routes/api/forest-explorer/save.ts` |

## `/api/friends`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/friends/active` | `GET` | `app/routes/api/friends/active.ts` |

## `/api/gabriels-horn`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gabriels-horn/house-rule` | `POST` | `app/routes/api/gabriels-horn/house-rule.ts` |
| `/api/gabriels-horn/leaderboard` | `GET` | `app/routes/api/gabriels-horn/leaderboard.ts` |

## `/api/game-saves`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/game-saves/:gameId` | `DELETE` `GET` `POST` | `app/routes/api/game-saves/$gameId.ts` |

## `/api/games`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/games/:id/guides` | `GET` | `app/routes/api/games/$id.guides.ts` |
| `/api/games/:id/leaderboard` | `GET` | `app/routes/api/games/$id/leaderboard.ts` |
| `/api/games/:id/review` | `DELETE` `PUT` | `app/routes/api/games/$id.review.ts` |
| `/api/games/:id/reviews` | `GET` | `app/routes/api/games/$id.reviews.ts` |
| `/api/games/:id/score` | `POST` | `app/routes/api/games/$id/score.ts` |
| `/api/games/synapse-storm/leaderboard` | `GET` | `app/routes/api/games/synapse-storm/leaderboard.ts` |
| `/api/games/synapse-storm/save` | `GET` | `app/routes/api/games/synapse-storm/save.ts` |
| `/api/games/synapse-storm/score` | `POST` | `app/routes/api/games/synapse-storm/score.ts` |

## `/api/gif`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gif/search` | `GET` | `app/routes/api/gif/search.ts` |

## `/api/gift-sub`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gift-sub` | `GET` `POST` | `app/routes/api/gift-sub.ts` |

## `/api/group-chats`

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/group-chats` | `GET` `POST` | `app/routes/api/group-chats/index.ts` |
| `/api/group-chats/:id` | `GET` | `app/routes/api/group-chats/$id/index.ts` |
| `/api/group-chats/:id/leave` | `POST` | `app/routes/api/group-chats/$id/leave.ts` |
| `/api/group-chats/:id/messages` | `GET` `POST` | `app/routes/api/group-chats/$id/messages.ts` |
| `/api/group-chats/:id/messages/:messageId/vote` | `POST` | `app/routes/api/group-chats/$id/messages/$messageId/vote.ts` |
| `/api/group-chats/:id/react` | `POST` | `app/routes/api/group-chats/$id/react.ts` |
| `/api/group-chats/:id/stream` | `GET` | `app/routes/api/group-chats/$id/stream.ts` |

## `/api/guides`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/guides` | `POST` | `app/routes/api/guides/index.ts` |
| `/api/guides/:id` | `DELETE` `GET` `PUT` | `app/routes/api/guides/$id.ts` |
| `/api/guides/:id/publish` | `POST` | `app/routes/api/guides/$id.publish.ts` |

## `/api/handle`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/handle/check` | `GET` | `app/routes/api/handle/check.ts` |

## `/api/health`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/health` | `GET` | `app/routes/api/health.ts` |

## `/api/history`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/history` | `DELETE` `GET` `PUT` | `app/routes/api/history/index.ts` |
| `/api/history/:id` | `DELETE` | `app/routes/api/history/$id.ts` |
| `/api/history/beat` | `POST` | `app/routes/api/history/beat.ts` |

## `/api/homes`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/homes/ai-image` | `GET` `POST` | `app/routes/api/homes/ai-image.ts` |
| `/api/homes/geocode` | `GET` | `app/routes/api/homes/geocode.ts` |
| `/api/homes/listings` | `GET` `POST` | `app/routes/api/homes/listings.ts` |
| `/api/homes/listings/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/homes/listings.$id.ts` |
| `/api/homes/listings/:id/favorite` | `DELETE` `POST` | `app/routes/api/homes/listings.$id.favorite.ts` |
| `/api/homes/watches` | `DELETE` `GET` `PATCH` `POST` | `app/routes/api/homes/watches.ts` |

## `/api/image-proxy`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/image-proxy` | `GET` | `app/routes/api/image-proxy.ts` |

## `/api/internal`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/internal/match-result` | `POST` | `app/routes/api/internal/match-result.ts` |
| `/api/internal/notify-message` | `POST` | `app/routes/api/internal/notify-message.ts` |
| `/api/internal/notify-typing` | `POST` | `app/routes/api/internal/notify-typing.ts` |
| `/api/internal/predictions-tick` | `POST` | `app/routes/api/internal/predictions-tick.ts` |
| `/api/internal/streak-push` | `POST` | `app/routes/api/internal/streak-push.ts` |

## `/api/laundry-sort`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/laundry-sort/leaderboard` | `GET` | `app/routes/api/laundry-sort/leaderboard.ts` |
| `/api/laundry-sort/score` | `POST` | `app/routes/api/laundry-sort/score.ts` |

## `/api/leaderboards`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/leaderboards/players` | `GET` | `app/routes/api/leaderboards/players.ts` |

## `/api/library`

10 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/library/:slug` | `DELETE` `POST` | `app/routes/api/library/$slug.ts` |
| `/api/library/collection/:id` | `DELETE` `PATCH` | `app/routes/api/library/collection/$id.ts` |
| `/api/library/collection/:id/cover` | `POST` | `app/routes/api/library/collection/$id/cover.ts` |
| `/api/library/collection/:id/items` | `DELETE` `PATCH` `POST` | `app/routes/api/library/collection/$id/items.ts` |
| `/api/library/collections` | `GET` `POST` | `app/routes/api/library/collections.ts` |
| `/api/library/cover/:id` | `GET` | `app/routes/api/library/cover/$id.ts` |
| `/api/library/draft` | `POST` | `app/routes/api/library/draft.ts` |
| `/api/library/file/:id` | `GET` | `app/routes/api/library/file/$id.ts` |
| `/api/library/quota` | `GET` `POST` | `app/routes/api/library/quota.ts` |
| `/api/library/upload` | `POST` | `app/routes/api/library/upload.ts` |

## `/api/lists`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/lists` | `GET` `POST` | `app/routes/api/lists/index.ts` |
| `/api/lists/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/lists/$id.ts` |
| `/api/lists/:id/feed` | `GET` | `app/routes/api/lists/$id.feed.ts` |
| `/api/lists/:id/members` | `DELETE` `PUT` | `app/routes/api/lists/$id.members.ts` |

## `/api/market`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/market/listings` | `GET` `POST` | `app/routes/api/market/listings/index.ts` |
| `/api/market/listings/:id` | `DELETE` | `app/routes/api/market/listings/$id/index.ts` |
| `/api/market/listings/:id/buy` | `POST` | `app/routes/api/market/listings/$id/buy.ts` |

## `/api/massive-march`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/massive-march/campaigns` | `DELETE` `GET` | `app/routes/api/massive-march/campaigns.ts` |

## `/api/messages`

10 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/messages` | `GET` `POST` | `app/routes/api/messages.ts` |
| `/api/messages/:conversationId` | `GET` `POST` | `app/routes/api/messages/$conversationId.ts` |
| `/api/messages/:conversationId/react` | `POST` | `app/routes/api/messages/$conversationId/react.ts` |
| `/api/messages/:conversationId/read` | `POST` | `app/routes/api/messages/$conversationId/read.ts` |
| `/api/messages/:conversationId/typing` | `POST` | `app/routes/api/messages/$conversationId/typing.ts` |
| `/api/messages/read-all` | `POST` | `app/routes/api/messages/read-all.ts` |
| `/api/messages/search` | `GET` | `app/routes/api/messages/search.ts` |
| `/api/messages/sidebar` | `GET` | `app/routes/api/messages/sidebar.ts` |
| `/api/messages/stream` | `GET` | `app/routes/api/messages/stream.ts` |
| `/api/messages/unread-count` | `GET` | `app/routes/api/messages/unread-count.ts` |

## `/api/moderation`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/moderation/block` | `GET` `POST` | `app/routes/api/moderation/block.ts` |
| `/api/moderation/mute` | `GET` `POST` | `app/routes/api/moderation/mute.ts` |
| `/api/moderation/report` | `POST` | `app/routes/api/moderation/report.ts` |

## `/api/moments`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/moments` | `POST` | `app/routes/api/moments/index.ts` |

## `/api/neon-driftway`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/neon-driftway/leaderboard` | `GET` | `app/routes/api/neon-driftway/leaderboard.ts` |
| `/api/neon-driftway/score` | `POST` | `app/routes/api/neon-driftway/score.ts` |

## `/api/news`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/news/approve` | `GET` `POST` | `app/routes/api/news/approve.ts` |
| `/api/news/reject` | `GET` `POST` | `app/routes/api/news/reject.ts` |

## `/api/notifications`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/notifications` | `GET` | `app/routes/api/notifications/index.ts` |
| `/api/notifications/preferences` | `GET` `PUT` | `app/routes/api/notifications/preferences.ts` |
| `/api/notifications/read` | `POST` | `app/routes/api/notifications/read.ts` |
| `/api/notifications/unread-count` | `GET` | `app/routes/api/notifications/unread-count.ts` |

## `/api/oembed`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/oembed` | `GET` | `app/routes/api/oembed.ts` |

## `/api/og`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/og/blog/:slug` | `GET` | `app/routes/api/og/blog/$slug.ts` |
| `/api/og/game/:gameId` | `GET` | `app/routes/api/og/game/$gameId.ts` |
| `/api/og/job/:jobId` | `GET` | `app/routes/api/og/job/$jobId.ts` |
| `/api/og/moment/:id` | `GET` | `app/routes/api/og/moment/$id.ts` |
| `/api/og/post/:id` | `GET` | `app/routes/api/og/post/$id.ts` |
| `/api/og/post/:id/story` | `GET` | `app/routes/api/og/post/$id/story.ts` |
| `/api/og/profile/:id` | `GET` | `app/routes/api/og/profile/$id.ts` |
| `/api/og/replay/:id` | `GET` | `app/routes/api/og/replay/$id.ts` |

## `/api/onboarding`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/onboarding` | `GET` `POST` | `app/routes/api/onboarding/index.ts` |
| `/api/onboarding/first-week` | `GET` `POST` | `app/routes/api/onboarding/first-week.ts` |

## `/api/personas`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/personas` | `GET` `POST` | `app/routes/api/personas/index.ts` |
| `/api/personas/:id` | `DELETE` `GET` | `app/routes/api/personas/$id/index.ts` |
| `/api/personas/:id/chat` | `POST` | `app/routes/api/personas/$id/chat.ts` |
| `/api/personas/avatar/:filename` | `GET` | `app/routes/api/personas/avatar/$filename.ts` |

## `/api/playlists`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/playlists` | `GET` `POST` | `app/routes/api/playlists/index.ts` |
| `/api/playlists/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/playlists/$id/index.ts` |
| `/api/playlists/:id/items` | `POST` | `app/routes/api/playlists/$id/items/index.ts` |
| `/api/playlists/:id/items/:itemId` | `DELETE` | `app/routes/api/playlists/$id/items/$itemId.ts` |

## `/api/predictions`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/predictions` | `GET` `POST` | `app/routes/api/predictions/index.ts` |
| `/api/predictions/:id` | `GET` | `app/routes/api/predictions/$id.ts` |
| `/api/predictions/:id/trade` | `POST` | `app/routes/api/predictions/$id/trade.ts` |

## `/api/preferences`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/preferences/appearance` | `GET` `PUT` | `app/routes/api/preferences/appearance.ts` |
| `/api/preferences/layout` | `GET` `PUT` | `app/routes/api/preferences/layout.ts` |
| `/api/preferences/muted-words` | `GET` `PUT` | `app/routes/api/preferences/muted-words.ts` |
| `/api/preferences/notifications` | `GET` `PUT` | `app/routes/api/preferences/notifications.ts` |
| `/api/preferences/presence` | `GET` `PUT` | `app/routes/api/preferences/presence.ts` |

## `/api/presence`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/presence/friends` | `GET` | `app/routes/api/presence/friends.ts` |
| `/api/presence/heartbeat` | `POST` | `app/routes/api/presence/heartbeat.ts` |
| `/api/presence/online-count` | `GET` | `app/routes/api/presence/online-count.ts` |

## `/api/profile`

16 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/profile` | `PATCH` | `app/routes/api/profile.ts` |
| `/api/profile/:id` | `GET` | `app/routes/api/profile/$id.ts` |
| `/api/profile/:id/follow` | `POST` | `app/routes/api/profile/$id/follow.ts` |
| `/api/profile/:id/followers` | `GET` | `app/routes/api/profile/$id/followers.ts` |
| `/api/profile/:id/following` | `GET` | `app/routes/api/profile/$id/following.ts` |
| `/api/profile/:id/likes` | `GET` | `app/routes/api/profile/$id/likes.ts` |
| `/api/profile/:id/membership` | `DELETE` `POST` | `app/routes/api/profile/$id/membership.ts` |
| `/api/profile/:id/rmharks` | `GET` | `app/routes/api/profile/$id/rmharks.ts` |
| `/api/profile/analytics` | `GET` | `app/routes/api/profile/analytics.ts` |
| `/api/profile/avatar` | `DELETE` `POST` | `app/routes/api/profile/avatar.ts` |
| `/api/profile/avatar/:filename` | `GET` | `app/routes/api/profile/avatar/$filename.ts` |
| `/api/profile/banner` | `DELETE` `POST` | `app/routes/api/profile/banner.ts` |
| `/api/profile/banner/:filename` | `GET` | `app/routes/api/profile/banner/$filename.ts` |
| `/api/profile/layout` | `GET` `PUT` | `app/routes/api/profile/layout.ts` |
| `/api/profile/me` | `GET` | `app/routes/api/profile/me.ts` |
| `/api/profile/status` | `DELETE` `PUT` | `app/routes/api/profile/status.ts` |

## `/api/progress`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/progress` | `GET` | `app/routes/api/progress.ts` |

## `/api/promo`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/promo/free-month` | `GET` `POST` | `app/routes/api/promo/free-month.ts` |

## `/api/pulse`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/pulse` | `POST` | `app/routes/api/pulse.ts` |

## `/api/push`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/push/public-key` | `GET` | `app/routes/api/push/public-key.ts` |
| `/api/push/subscribe` | `DELETE` `POST` | `app/routes/api/push/subscribe.ts` |

## `/api/quests`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/quests/:id/claim` | `POST` | `app/routes/api/quests/$id/claim.ts` |

## `/api/ranked`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/ranked` | `GET` `POST` | `app/routes/api/ranked/index.ts` |
| `/api/ranked/:game/leaderboard` | `GET` | `app/routes/api/ranked/$game/leaderboard.ts` |
| `/api/ranked/challenge/:id` | `POST` | `app/routes/api/ranked/challenge/$id.ts` |

## `/api/ready`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/ready` | `GET` | `app/routes/api/ready.ts` |

## `/api/recap`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/recap` | `GET` | `app/routes/api/recap.ts` |

## `/api/referrals`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/referrals/claim` | `POST` | `app/routes/api/referrals/claim.ts` |
| `/api/referrals/me` | `GET` | `app/routes/api/referrals/me.ts` |

## `/api/replays`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/replays` | `POST` | `app/routes/api/replays/index.ts` |
| `/api/replays/:id` | `DELETE` `GET` | `app/routes/api/replays/$id.ts` |

## `/api/reviews`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reviews/:id/vote` | `DELETE` `POST` | `app/routes/api/reviews/$id.vote.ts` |

## `/api/rideshare`

13 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rideshare/directions` | `GET` | `app/routes/api/rideshare/directions.ts` |
| `/api/rideshare/driver` | `GET` `PATCH` `POST` | `app/routes/api/rideshare/driver.ts` |
| `/api/rideshare/earnings` | `GET` | `app/routes/api/rideshare/earnings.ts` |
| `/api/rideshare/geocode` | `GET` | `app/routes/api/rideshare/geocode.ts` |
| `/api/rideshare/location` | `POST` | `app/routes/api/rideshare/location.ts` |
| `/api/rideshare/places` | `GET` `POST` | `app/routes/api/rideshare/places.ts` |
| `/api/rideshare/places/:id` | `DELETE` | `app/routes/api/rideshare/places/$id.ts` |
| `/api/rideshare/reverse` | `GET` | `app/routes/api/rideshare/reverse.ts` |
| `/api/rideshare/rides` | `GET` `POST` | `app/routes/api/rideshare/rides.ts` |
| `/api/rideshare/rides/:id` | `POST` | `app/routes/api/rideshare/rides/$id.ts` |
| `/api/rideshare/rides/:id/messages` | `POST` | `app/routes/api/rideshare/rides/$id/messages.ts` |
| `/api/rideshare/rides/:id/rate` | `POST` | `app/routes/api/rideshare/rides/$id/rate.ts` |
| `/api/rideshare/rides/:id/sync` | `GET` | `app/routes/api/rideshare/rides/$id/sync.ts` |

## `/api/rmharks`

23 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmharks` | `GET` `POST` | `app/routes/api/rmharks.ts` |
| `/api/rmharks/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/rmharks/$id.ts` |
| `/api/rmharks/:id/bookmark` | `POST` | `app/routes/api/rmharks/$id/bookmark.ts` |
| `/api/rmharks/:id/comment` | `GET` `POST` | `app/routes/api/rmharks/$id/comment.ts` |
| `/api/rmharks/:id/comment/:commentId` | `DELETE` | `app/routes/api/rmharks/$id/comment/$commentId.ts` |
| `/api/rmharks/:id/comment/:commentId/like` | `GET` `POST` | `app/routes/api/rmharks/$id/comment/$commentId/like.ts` |
| `/api/rmharks/:id/comment/:commentId/repost` | `GET` `POST` | `app/routes/api/rmharks/$id/comment/$commentId/repost.ts` |
| `/api/rmharks/:id/comment/:commentId/view` | `POST` | `app/routes/api/rmharks/$id/comment/$commentId/view.ts` |
| `/api/rmharks/:id/insights` | `GET` | `app/routes/api/rmharks/$id/insights.ts` |
| `/api/rmharks/:id/like` | `GET` `POST` | `app/routes/api/rmharks/$id/like.ts` |
| `/api/rmharks/:id/pin` | `POST` | `app/routes/api/rmharks/$id/pin.ts` |
| `/api/rmharks/:id/react` | `POST` | `app/routes/api/rmharks/$id/react.ts` |
| `/api/rmharks/:id/repost` | `GET` `POST` | `app/routes/api/rmharks/$id/repost.ts` |
| `/api/rmharks/:id/similar` | `GET` | `app/routes/api/rmharks/$id/similar.ts` |
| `/api/rmharks/:id/summary` | `GET` | `app/routes/api/rmharks/$id/summary.ts` |
| `/api/rmharks/:id/translate` | `GET` | `app/routes/api/rmharks/$id/translate.ts` |
| `/api/rmharks/:id/unlock` | `POST` | `app/routes/api/rmharks/$id/unlock.ts` |
| `/api/rmharks/:id/view` | `POST` | `app/routes/api/rmharks/$id/view.ts` |
| `/api/rmharks/:id/vote` | `POST` | `app/routes/api/rmharks/$id/vote.ts` |
| `/api/rmharks/ai-generate` | `POST` | `app/routes/api/rmharks/ai-generate.ts` |
| `/api/rmharks/ai-image` | `POST` | `app/routes/api/rmharks/ai-image.ts` |
| `/api/rmharks/image` | `POST` | `app/routes/api/rmharks/image.ts` |
| `/api/rmharks/thread` | `POST` | `app/routes/api/rmharks/thread.ts` |

## `/api/rmhbox`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhbox/history` | `GET` | `app/routes/api/rmhbox/history.ts` |
| `/api/rmhbox/leaderboard` | `GET` | `app/routes/api/rmhbox/leaderboard.ts` |
| `/api/rmhbox/stats` | `GET` | `app/routes/api/rmhbox/stats.ts` |

## `/api/rmhcalculator`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhcalculator/compute` | `POST` | `app/routes/api/rmhcalculator/compute.ts` |
| `/api/rmhcalculator/graph` | `POST` | `app/routes/api/rmhcalculator/graph.ts` |

## `/api/rmhcode`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhcode/auth/generate` | `POST` | `app/routes/api/rmhcode/auth/generate.ts` |
| `/api/rmhcode/auth/initiate` | `POST` | `app/routes/api/rmhcode/auth/initiate.ts` |
| `/api/rmhcode/auth/list` | `GET` | `app/routes/api/rmhcode/auth/list.ts` |
| `/api/rmhcode/auth/revoke` | `POST` | `app/routes/api/rmhcode/auth/revoke.ts` |
| `/api/rmhcode/auth/validate` | `POST` | `app/routes/api/rmhcode/auth/validate.ts` |

## `/api/rmhladder`

9 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhladder/calendar` | `GET` | `app/routes/api/rmhladder/calendar.ts` |
| `/api/rmhladder/events` | `POST` | `app/routes/api/rmhladder/events.ts` |
| `/api/rmhladder/export` | `GET` | `app/routes/api/rmhladder/export.ts` |
| `/api/rmhladder/import` | `POST` | `app/routes/api/rmhladder/import.ts` |
| `/api/rmhladder/resume` | `GET` `POST` | `app/routes/api/rmhladder/resume/index.ts` |
| `/api/rmhladder/resume/:id` | `DELETE` `GET` | `app/routes/api/rmhladder/resume/$id.ts` |
| `/api/rmhladder/resume/:id/analyze` | `POST` | `app/routes/api/rmhladder/resume/$id/analyze.ts` |
| `/api/rmhladder/resume/:id/confirm` | `POST` | `app/routes/api/rmhladder/resume/$id/confirm.ts` |
| `/api/rmhladder/searches` | `DELETE` `GET` `POST` | `app/routes/api/rmhladder/searches.ts` |

## `/api/rmhmusic`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhmusic/guess` | `GET` `POST` | `app/routes/api/rmhmusic/guess/index.ts` |
| `/api/rmhmusic/guess/:id` | `GET` | `app/routes/api/rmhmusic/guess/$id/index.ts` |
| `/api/rmhmusic/guess/:id/attempt` | `POST` | `app/routes/api/rmhmusic/guess/$id/attempt.ts` |
| `/api/rmhmusic/spotify/search` | `GET` | `app/routes/api/rmhmusic/spotify/search.ts` |

## `/api/rmhtube`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhtube/oembed` | `GET` | `app/routes/api/rmhtube/oembed.ts` |
| `/api/rmhtube/subscribe/:channelId` | `POST` | `app/routes/api/rmhtube/subscribe/$channelId.ts` |

## `/api/rum`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rum` | `POST` | `app/routes/api/rum.ts` |

## `/api/saves`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/saves` | `DELETE` `GET` `POST` | `app/routes/api/saves/index.ts` |
| `/api/saves/folders` | `GET` `POST` | `app/routes/api/saves/folders.ts` |
| `/api/saves/folders/:id` | `DELETE` `PATCH` | `app/routes/api/saves/folders.$id.ts` |

## `/api/scheduled`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/scheduled` | `GET` `POST` | `app/routes/api/scheduled/index.ts` |
| `/api/scheduled/:id` | `DELETE` `PATCH` | `app/routes/api/scheduled/$id.ts` |
| `/api/scheduled/:id/publish` | `POST` | `app/routes/api/scheduled/$id/publish.ts` |

## `/api/search`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/search` | `GET` | `app/routes/api/search.ts` |
| `/api/search/saved` | `GET` `POST` | `app/routes/api/search/saved.ts` |
| `/api/search/saved/:id` | `DELETE` `PATCH` | `app/routes/api/search/saved.$id.ts` |

## `/api/settings`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/settings/email-digest` | `POST` | `app/routes/api/settings/email-digest.ts` |

## `/api/shop`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/shop` | `GET` | `app/routes/api/shop/index.ts` |
| `/api/shop/equip` | `POST` | `app/routes/api/shop/equip.ts` |
| `/api/shop/purchase` | `POST` | `app/routes/api/shop/purchase.ts` |

## `/api/signal-forge`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/signal-forge/abandon` | `POST` | `app/routes/api/signal-forge/abandon.ts` |
| `/api/signal-forge/leaderboard` | `GET` | `app/routes/api/signal-forge/leaderboard.ts` |
| `/api/signal-forge/load` | `GET` | `app/routes/api/signal-forge/load.ts` |
| `/api/signal-forge/save` | `POST` | `app/routes/api/signal-forge/save.ts` |
| `/api/signal-forge/score` | `POST` | `app/routes/api/signal-forge/score.ts` |

## `/api/slice-it`

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/slice-it/leaderboard` | `GET` | `app/routes/api/slice-it/leaderboard.ts` |
| `/api/slice-it/score` | `POST` | `app/routes/api/slice-it/score.ts` |
| `/api/slice-it/songs` | `GET` | `app/routes/api/slice-it/songs.ts` |
| `/api/slice-it/songs/:id` | `DELETE` `PATCH` | `app/routes/api/slice-it/songs/$id.ts` |
| `/api/slice-it/songs/:id/comments` | `GET` `POST` | `app/routes/api/slice-it/songs/$id/comments.ts` |
| `/api/slice-it/songs/:id/like` | `POST` | `app/routes/api/slice-it/songs/$id/like.ts` |
| `/api/slice-it/songs/:id/patch-analysis` | `POST` | `app/routes/api/slice-it/songs/$id/patch-analysis.ts` |
| `/api/slice-it/songs/:id/play` | `POST` | `app/routes/api/slice-it/songs/$id/play.ts` |
| `/api/slice-it/songs/cover/:filename` | `GET` | `app/routes/api/slice-it/songs/cover/$filename.ts` |
| `/api/slice-it/songs/stream/:id` | `GET` | `app/routes/api/slice-it/songs/stream/$id.ts` |
| `/api/slice-it/songs/upload` | `POST` | `app/routes/api/slice-it/songs/upload.ts` |

## `/api/spaces`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/spaces` | `GET` `POST` | `app/routes/api/spaces/index.ts` |
| `/api/spaces/:id` | `GET` | `app/routes/api/spaces/$id/index.ts` |
| `/api/spaces/:id/end` | `POST` | `app/routes/api/spaces/$id/end.ts` |
| `/api/spaces/:id/start` | `POST` | `app/routes/api/spaces/$id/start.ts` |
| `/api/spaces/live` | `GET` | `app/routes/api/spaces/live.ts` |

## `/api/spotify`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/spotify/search` | `GET` | `app/routes/api/spotify/search.ts` |

## `/api/staking`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/staking` | `GET` | `app/routes/api/staking/index.ts` |
| `/api/staking/deposit` | `POST` | `app/routes/api/staking/deposit.ts` |
| `/api/staking/withdraw` | `POST` | `app/routes/api/staking/withdraw.ts` |

## `/api/storefront`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/storefront/creator/:userid` | `GET` | `app/routes/api/storefront/creator/$userid.ts` |
| `/api/storefront/products` | `POST` | `app/routes/api/storefront/products/index.ts` |
| `/api/storefront/products/:id` | `DELETE` `PATCH` | `app/routes/api/storefront/products/$id/index.ts` |
| `/api/storefront/products/:id/buy` | `POST` | `app/routes/api/storefront/products/$id/buy.ts` |

## `/api/streak`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/streak` | `GET` `POST` | `app/routes/api/streak.ts` |
| `/api/streak/freeze` | `POST` | `app/routes/api/streak.freeze.ts` |

## `/api/studio`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/studio/overview` | `GET` | `app/routes/api/studio/overview.ts` |
| `/api/studio/tiers` | `GET` `PUT` | `app/routes/api/studio/tiers.ts` |

## `/api/study`

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/study/cards/:id/review` | `POST` | `app/routes/api/study/cards/$id/review.ts` |
| `/api/study/decks` | `GET` `POST` | `app/routes/api/study/decks/index.ts` |
| `/api/study/decks/:id` | `DELETE` `GET` `POST` | `app/routes/api/study/decks/$id/index.ts` |
| `/api/study/decks/:id/clone` | `POST` | `app/routes/api/study/decks/$id/clone.ts` |
| `/api/study/decks/:id/review` | `GET` | `app/routes/api/study/decks/$id/review.ts` |
| `/api/study/marketplace` | `GET` | `app/routes/api/study/marketplace.ts` |
| `/api/study/tutor` | `POST` | `app/routes/api/study/tutor.ts` |

## `/api/tags`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tags/:tag` | `GET` | `app/routes/api/tags/$tag.ts` |

## `/api/temple-of-joy`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/temple-of-joy/save` | `DELETE` `GET` `POST` | `app/routes/api/temple-of-joy/save.ts` |

## `/api/themes`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/themes` | `GET` `POST` | `app/routes/api/themes/index.ts` |
| `/api/themes/:id` | `DELETE` `GET` `PUT` | `app/routes/api/themes/$id.ts` |
| `/api/themes/:id/buy` | `POST` | `app/routes/api/themes/$id.buy.ts` |
| `/api/themes/:id/publish` | `POST` | `app/routes/api/themes/$id.publish.ts` |
| `/api/themes/shop` | `GET` | `app/routes/api/themes/shop.ts` |

## `/api/tips`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tips/leaderboard` | `GET` | `app/routes/api/tips/leaderboard.ts` |

## `/api/today`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/today` | `GET` | `app/routes/api/today.ts` |

## `/api/tournaments`

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tournaments` | `GET` `POST` | `app/routes/api/tournaments/index.ts` |
| `/api/tournaments/:id` | `GET` | `app/routes/api/tournaments/$id.ts` |
| `/api/tournaments/:id/cancel` | `POST` | `app/routes/api/tournaments/$id/cancel.ts` |
| `/api/tournaments/:id/matches/:matchId/report` | `POST` | `app/routes/api/tournaments/$id/matches/$matchId/report.ts` |
| `/api/tournaments/:id/register` | `POST` | `app/routes/api/tournaments/$id/register.ts` |
| `/api/tournaments/:id/start` | `POST` | `app/routes/api/tournaments/$id/start.ts` |
| `/api/tournaments/:id/withdraw` | `POST` | `app/routes/api/tournaments/$id/withdraw.ts` |

## `/api/user-builds`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/user-builds` | `GET` `POST` | `app/routes/api/user-builds.ts` |
| `/api/user-builds/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/user-builds/$id.ts` |
| `/api/user-builds/:id/comments` | `GET` `POST` | `app/routes/api/user-builds/$id/comments.ts` |
| `/api/user-builds/:id/like` | `POST` | `app/routes/api/user-builds/$id/like.ts` |
| `/api/user-builds/:id/unlock` | `POST` | `app/routes/api/user-builds/$id/unlock.ts` |
| `/api/user-builds/:id/view` | `POST` | `app/routes/api/user-builds/$id/view.ts` |
| `/api/user-builds/categories` | `GET` | `app/routes/api/user-builds/categories.ts` |
| `/api/user-builds/featured` | `GET` | `app/routes/api/user-builds/featured.ts` |

## `/api/users`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/users/:id/wishlist` | `GET` | `app/routes/api/users/$id.wishlist.ts` |
| `/api/users/search` | `GET` | `app/routes/api/users/search.ts` |

## `/api/v1`

27 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/v1/blog` | `GET` `OPTIONS` | `app/routes/api/v1/blog.ts` |
| `/api/v1/blog/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/blog/$slug.ts` |
| `/api/v1/builds` | `GET` `OPTIONS` | `app/routes/api/v1/builds.ts` |
| `/api/v1/builds/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/builds/$slug.ts` |
| `/api/v1/feed` | `GET` `OPTIONS` | `app/routes/api/v1/feed.ts` |
| `/api/v1/images` | `OPTIONS` `POST` | `app/routes/api/v1/images.ts` |
| `/api/v1/leaderboards/:game` | `GET` `OPTIONS` | `app/routes/api/v1/leaderboards/$game.ts` |
| `/api/v1/me` | `GET` `OPTIONS` | `app/routes/api/v1/me.ts` |
| `/api/v1/me/bookmarks` | `GET` `OPTIONS` | `app/routes/api/v1/me/bookmarks.ts` |
| `/api/v1/me/followers` | `GET` `OPTIONS` | `app/routes/api/v1/me/followers.ts` |
| `/api/v1/me/following` | `GET` `OPTIONS` | `app/routes/api/v1/me/following.ts` |
| `/api/v1/me/notifications` | `GET` `OPTIONS` | `app/routes/api/v1/me/notifications.ts` |
| `/api/v1/news` | `GET` `OPTIONS` | `app/routes/api/v1/news.ts` |
| `/api/v1/news/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/news/$slug.ts` |
| `/api/v1/openapi.json` | `GET` `OPTIONS` | `app/routes/api/v1/openapi[.]json.ts` |
| `/api/v1/posts` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/posts.ts` |
| `/api/v1/posts/:id` | `DELETE` `GET` `OPTIONS` | `app/routes/api/v1/posts/$id.ts` |
| `/api/v1/posts/:id/bookmark` | `DELETE` `OPTIONS` `POST` | `app/routes/api/v1/posts/$id/bookmark.ts` |
| `/api/v1/posts/:id/comments` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/posts/$id/comments.ts` |
| `/api/v1/posts/:id/like` | `DELETE` `OPTIONS` `POST` | `app/routes/api/v1/posts/$id/like.ts` |
| `/api/v1/users/:handle` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle.ts` |
| `/api/v1/users/:handle/follow` | `DELETE` `OPTIONS` `POST` | `app/routes/api/v1/users/$handle/follow.ts` |
| `/api/v1/users/:handle/followers` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/followers.ts` |
| `/api/v1/users/:handle/following` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/following.ts` |
| `/api/v1/users/:handle/posts` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/posts.ts` |
| `/api/v1/webhooks` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/webhooks.ts` |
| `/api/v1/webhooks/:id` | `DELETE` `GET` `OPTIONS` `PATCH` | `app/routes/api/v1/webhooks/$id.ts` |

## `/api/vega`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/vega/leaderboard` | `GET` | `app/routes/api/vega/leaderboard.ts` |
| `/api/vega/score` | `POST` | `app/routes/api/vega/score.ts` |

## `/api/versecraft`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/versecraft/chapter` | `POST` | `app/routes/api/versecraft/chapter.ts` |
| `/api/versecraft/outline` | `POST` | `app/routes/api/versecraft/outline.ts` |
| `/api/versecraft/progress` | `GET` | `app/routes/api/versecraft/progress.ts` |
| `/api/versecraft/save` | `GET` `POST` | `app/routes/api/versecraft/save.ts` |
| `/api/versecraft/world` | `GET` `POST` | `app/routes/api/versecraft/world.ts` |

## `/api/vibe`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/vibe/ai` | `OPTIONS` `POST` | `app/routes/api/vibe/ai.ts` |
| `/api/vibe/pkg/:file` | `GET` | `app/routes/api/vibe/pkg/$file.ts` |
| `/api/vibe/stream` | `POST` | `app/routes/api/vibe/stream.ts` |
| `/api/vibe/thumb/:slug` | `GET` | `app/routes/api/vibe/thumb/$slug.ts` |

## `/api/void-breaker`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/void-breaker/leaderboard` | `GET` | `app/routes/api/void-breaker/leaderboard.ts` |
| `/api/void-breaker/score` | `POST` | `app/routes/api/void-breaker/score.ts` |

## `/api/wager`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wager` | `GET` `POST` | `app/routes/api/wager/index.ts` |
| `/api/wager/:id` | `GET` | `app/routes/api/wager/$id.ts` |
| `/api/wager/:id/accept` | `POST` | `app/routes/api/wager/$id/accept.ts` |
| `/api/wager/:id/cancel` | `POST` | `app/routes/api/wager/$id/cancel.ts` |
| `/api/wager/:id/report` | `POST` | `app/routes/api/wager/$id/report.ts` |

## `/api/wheel`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wheel` | `GET` | `app/routes/api/wheel/index.ts` |
| `/api/wheel/spin` | `POST` | `app/routes/api/wheel/spin.ts` |

## `/api/wishlist`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wishlist` | `DELETE` `GET` `POST` | `app/routes/api/wishlist/index.ts` |

## `/api/wrapped`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wrapped` | `GET` | `app/routes/api/wrapped.ts` |

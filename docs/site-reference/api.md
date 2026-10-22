<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/games.ts, lib/apps.ts.
  Regenerate with `pnpm docs:site`.
-->

# API routes

Every server route in the app tier — 891 files across 192 groups. This is the whole internal surface, not just the public developer API: the public, versioned, key-authenticated subset is `/api/v1/*`, documented in [the developer API reference](../developer-api/endpoints/index.md). Everything else is session-authenticated and internal — treat it as unstable.

Methods are read from each file's `server.handlers` block. A route with no methods listed exports a handler built by a wrapper (for example the developer API `withDeveloperApi`).

## `/api/account`

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/account/delete` | `POST` | `app/routes/api/account/delete.ts` |
| `/api/account/export` | `GET` | `app/routes/api/account/export.ts` |
| `/api/account/recovery/codes` | `GET` `POST` | `app/routes/api/account/recovery/codes.ts` |
| `/api/account/recovery/complete` | `POST` | `app/routes/api/account/recovery/complete.ts` |
| `/api/account/recovery/contacts` | `GET` `POST` | `app/routes/api/account/recovery/contacts.ts` |
| `/api/account/recovery/contacts/:id` | `DELETE` `POST` | `app/routes/api/account/recovery/contacts/$id.ts` |
| `/api/account/recovery/hold` | `GET` | `app/routes/api/account/recovery/hold.ts` |
| `/api/account/recovery/requests` | `GET` `POST` | `app/routes/api/account/recovery/requests.ts` |
| `/api/account/recovery/requests/:id` | `DELETE` `POST` | `app/routes/api/account/recovery/requests/$id.ts` |
| `/api/account/standing` | `GET` | `app/routes/api/account/standing.ts` |
| `/api/account/strikes/:id/appeal` | `POST` | `app/routes/api/account/strikes/$id/appeal.ts` |

## `/api/achievements`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/achievements/:userId` | `GET` | `app/routes/api/achievements/$userId.ts` |

## `/api/activity`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/activity` | `GET` `POST` | `app/routes/api/activity/index.ts` |

## `/api/admin`

85 routes.

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
| `/api/admin/bots` | `GET` `PUT` | `app/routes/api/admin/bots/index.ts` |
| `/api/admin/canvas` | `GET` `POST` | `app/routes/api/admin/canvas/index.ts` |
| `/api/admin/canvas/:id` | `DELETE` | `app/routes/api/admin/canvas/$id.ts` |
| `/api/admin/context-notes` | `GET` | `app/routes/api/admin/context-notes/index.ts` |
| `/api/admin/context-notes/:id` | `PATCH` | `app/routes/api/admin/context-notes/$id.ts` |
| `/api/admin/curated-builds/image` | `POST` | `app/routes/api/admin/curated-builds/image.ts` |
| `/api/admin/curated-builds/image/:filename` | `GET` | `app/routes/api/admin/curated-builds/image/$filename.ts` |
| `/api/admin/curated-builds/image/proxy` | `GET` | `app/routes/api/admin/curated-builds/image/proxy.ts` |
| `/api/admin/deepseek/balance` | `GET` | `app/routes/api/admin/deepseek/balance.ts` |
| `/api/admin/deepseek/history` | `GET` | `app/routes/api/admin/deepseek/history.ts` |
| `/api/admin/deepseek/refresh` | `POST` | `app/routes/api/admin/deepseek/refresh.ts` |
| `/api/admin/delight/fools` | `GET` `POST` | `app/routes/api/admin/delight/fools/index.ts` |
| `/api/admin/delight/fortunes` | `GET` | `app/routes/api/admin/delight/fortunes/index.ts` |
| `/api/admin/delight/fortunes/:id` | `POST` | `app/routes/api/admin/delight/fortunes/$id/index.ts` |
| `/api/admin/delight/hunts` | `GET` `POST` | `app/routes/api/admin/delight/hunts/index.ts` |
| `/api/admin/delight/hunts/:id` | `DELETE` `PATCH` | `app/routes/api/admin/delight/hunts/$id/index.ts` |
| `/api/admin/delight/museum` | `POST` | `app/routes/api/admin/delight/museum/index.ts` |
| `/api/admin/delight/museum/:id` | `DELETE` `PUT` | `app/routes/api/admin/delight/museum/$id/index.ts` |
| `/api/admin/delight/translations` | `GET` | `app/routes/api/admin/delight/translations/index.ts` |
| `/api/admin/delight/translations/:id` | `POST` | `app/routes/api/admin/delight/translations/$id/index.ts` |
| `/api/admin/delight/translations/export` | `GET` | `app/routes/api/admin/delight/translations/export/index.ts` |
| `/api/admin/economy` | `GET` | `app/routes/api/admin/economy.ts` |
| `/api/admin/forecasting/seasons` | `POST` | `app/routes/api/admin/forecasting/seasons.ts` |
| `/api/admin/gift-exchanges/:id/verify` | `GET` | `app/routes/api/admin/gift-exchanges/$id/verify.ts` |
| `/api/admin/insights/cohorts` | `GET` `POST` | `app/routes/api/admin/insights/cohorts.ts` |
| `/api/admin/insights/errors` | `GET` `PATCH` | `app/routes/api/admin/insights/errors.ts` |
| `/api/admin/insights/experiments` | `GET` `PATCH` `POST` | `app/routes/api/admin/insights/experiments.ts` |
| `/api/admin/insights/notices` | `DELETE` `GET` `POST` | `app/routes/api/admin/insights/notices.ts` |
| `/api/admin/insights/routes` | `GET` | `app/routes/api/admin/insights/routes.ts` |
| `/api/admin/library` | `GET` | `app/routes/api/admin/library/index.ts` |
| `/api/admin/library/:id` | `DELETE` `PATCH` | `app/routes/api/admin/library/$id.ts` |
| `/api/admin/library/migrate` | `POST` | `app/routes/api/admin/library/migrate.ts` |
| `/api/admin/library/quota-requests` | `GET` `POST` | `app/routes/api/admin/library/quota-requests.ts` |
| `/api/admin/library/reorder` | `POST` | `app/routes/api/admin/library/reorder.ts` |
| `/api/admin/library/storage-health` | `GET` | `app/routes/api/admin/library/storage-health.ts` |
| `/api/admin/link-rules` | `DELETE` `GET` `POST` | `app/routes/api/admin/link-rules.ts` |
| `/api/admin/mod-macros` | `DELETE` `GET` `POST` | `app/routes/api/admin/mod-macros.ts` |
| `/api/admin/perf` | `GET` | `app/routes/api/admin/perf/index.ts` |
| `/api/admin/perf/db` | `GET` | `app/routes/api/admin/perf/db.ts` |
| `/api/admin/perf/heap` | `GET` | `app/routes/api/admin/perf/heap.ts` |
| `/api/admin/perf/profile` | `POST` | `app/routes/api/admin/perf/profile.ts` |
| `/api/admin/predictions` | `GET` | `app/routes/api/admin/predictions/index.ts` |
| `/api/admin/predictions/:id/moderate` | `POST` | `app/routes/api/admin/predictions/$id/moderate.ts` |
| `/api/admin/predictions/:id/resolve` | `POST` | `app/routes/api/admin/predictions/$id/resolve.ts` |
| `/api/admin/qotd` | `GET` `POST` | `app/routes/api/admin/qotd/index.ts` |
| `/api/admin/qotd/:id` | `DELETE` | `app/routes/api/admin/qotd/$id.ts` |
| `/api/admin/reading/glossary` | `GET` `POST` | `app/routes/api/admin/reading/glossary/index.ts` |
| `/api/admin/reading/glossary/:id` | `DELETE` `PATCH` | `app/routes/api/admin/reading/glossary/$id.ts` |
| `/api/admin/reading/stories` | `GET` `POST` | `app/routes/api/admin/reading/stories/index.ts` |
| `/api/admin/reading/stories/:id` | `DELETE` `PATCH` | `app/routes/api/admin/reading/stories/$id/index.ts` |
| `/api/admin/reading/stories/:id/articles` | `DELETE` `POST` | `app/routes/api/admin/reading/stories/$id/articles.ts` |
| `/api/admin/reading/stories/:id/suggest` | `GET` | `app/routes/api/admin/reading/stories/$id/suggest.ts` |
| `/api/admin/redemptions` | `GET` | `app/routes/api/admin/redemptions/index.ts` |
| `/api/admin/redemptions/:id` | `POST` | `app/routes/api/admin/redemptions/$id.ts` |
| `/api/admin/release-notes` | `GET` `POST` | `app/routes/api/admin/release-notes/index.ts` |
| `/api/admin/release-notes/:id` | `DELETE` `PATCH` | `app/routes/api/admin/release-notes/$id.ts` |
| `/api/admin/release-notes/draft` | `POST` | `app/routes/api/admin/release-notes/draft.ts` |
| `/api/admin/reports` | `GET` | `app/routes/api/admin/reports.ts` |
| `/api/admin/reports/:id` | `POST` | `app/routes/api/admin/reports/$id.ts` |
| `/api/admin/review-counts` | `GET` | `app/routes/api/admin/review-counts.ts` |
| `/api/admin/rideshare/applications` | `GET` `PATCH` | `app/routes/api/admin/rideshare/applications.ts` |
| `/api/admin/rideshare/rides` | `GET` | `app/routes/api/admin/rideshare/rides.ts` |
| `/api/admin/studio-challenges` | `POST` | `app/routes/api/admin/studio-challenges/index.ts` |
| `/api/admin/studio-challenges/upload` | `POST` | `app/routes/api/admin/studio-challenges/upload.ts` |
| `/api/admin/users` | `GET` `PATCH` | `app/routes/api/admin/users.ts` |
| `/api/admin/users/:id/ban` | `POST` | `app/routes/api/admin/users/$id/ban.ts` |
| `/api/admin/users/:id/grant-membership` | `POST` | `app/routes/api/admin/users/$id/grant-membership.ts` |
| `/api/admin/users/:id/set-coins` | `POST` | `app/routes/api/admin/users/$id/set-coins.ts` |
| `/api/admin/users/:id/strike` | `POST` | `app/routes/api/admin/users/$id/strike.ts` |
| `/api/admin/vibe/backfill-thumbs` | `POST` | `app/routes/api/admin/vibe/backfill-thumbs.ts` |
| `/api/admin/view-as` | `GET` | `app/routes/api/admin/view-as.ts` |
| `/api/admin/wager/:id/resolve` | `POST` | `app/routes/api/admin/wager/$id/resolve.ts` |

## `/api/advent`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/advent` | `GET` `POST` | `app/routes/api/advent/index.ts` |

## `/api/ai`

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/ai/ask-feed` | `POST` | `app/routes/api/ai/ask-feed.ts` |
| `/api/ai/bio` | `POST` | `app/routes/api/ai/bio.ts` |
| `/api/ai/catch-up` | `POST` | `app/routes/api/ai/catch-up.ts` |
| `/api/ai/explain-metric` | `POST` | `app/routes/api/ai/explain-metric.ts` |
| `/api/ai/message-suggest` | `POST` | `app/routes/api/ai/message-suggest.ts` |
| `/api/ai/nl-query` | `POST` | `app/routes/api/ai/nl-query.ts` |
| `/api/ai/search` | `POST` | `app/routes/api/ai/search.ts` |
| `/api/ai/smart-replies` | `POST` | `app/routes/api/ai/smart-replies.ts` |
| `/api/ai/suggest-tags` | `POST` | `app/routes/api/ai/suggest-tags.ts` |
| `/api/ai/takeaways` | `GET` | `app/routes/api/ai/takeaways.ts` |
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

12 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/arcade` | `GET` | `app/routes/api/arcade/index.ts` |
| `/api/arcade/backlog` | `DELETE` `GET` `PUT` | `app/routes/api/arcade/backlog/index.ts` |
| `/api/arcade/basket` | `GET` | `app/routes/api/arcade/basket/index.ts` |
| `/api/arcade/basket/finish` | `POST` | `app/routes/api/arcade/basket/finish.ts` |
| `/api/arcade/basket/start` | `POST` | `app/routes/api/arcade/basket/start.ts` |
| `/api/arcade/claim` | `POST` | `app/routes/api/arcade/claim.ts` |
| `/api/arcade/daily` | `GET` | `app/routes/api/arcade/daily/index.ts` |
| `/api/arcade/daily/start` | `POST` | `app/routes/api/arcade/daily/start.ts` |
| `/api/arcade/patch-notes` | `GET` `POST` | `app/routes/api/arcade/patch-notes/index.ts` |
| `/api/arcade/rival` | `GET` | `app/routes/api/arcade/rival/index.ts` |
| `/api/arcade/runs` | `GET` `POST` | `app/routes/api/arcade/runs.ts` |
| `/api/arcade/tips` | `GET` `POST` `PUT` | `app/routes/api/arcade/tips/index.ts` |

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

## `/api/badge`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/badge/:userId/:gameId` | `GET` | `app/routes/api/badge/$userId/$gameId.ts` |

## `/api/battlepass`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/battlepass` | `GET` | `app/routes/api/battlepass/index.ts` |
| `/api/battlepass/claim` | `POST` | `app/routes/api/battlepass/claim.ts` |
| `/api/battlepass/unlock` | `POST` | `app/routes/api/battlepass/unlock.ts` |

## `/api/birthday`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/birthday` | `DELETE` `GET` `PUT` | `app/routes/api/birthday/index.ts` |
| `/api/birthday/next` | `GET` | `app/routes/api/birthday/next.ts` |

## `/api/bookmarks`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/bookmarks` | `GET` | `app/routes/api/bookmarks.ts` |

## `/api/builds`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/builds/consent` | `DELETE` `GET` `POST` | `app/routes/api/builds/consent.ts` |
| `/api/builds/cover/:file` | `GET` | `app/routes/api/builds/cover/$file.ts` |
| `/api/builds/review` | `POST` | `app/routes/api/builds/review.ts` |

## `/api/bulk`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/bulk` | `GET` `POST` | `app/routes/api/bulk/index.ts` |
| `/api/bulk/:id` | `DELETE` `GET` | `app/routes/api/bulk/$id.ts` |
| `/api/bulk/preview` | `POST` | `app/routes/api/bulk/preview.ts` |

## `/api/bums-rush`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/bums-rush/clear` | `POST` | `app/routes/api/bums-rush/clear.ts` |
| `/api/bums-rush/leaderboard` | `GET` | `app/routes/api/bums-rush/leaderboard.ts` |
| `/api/bums-rush/profile` | `GET` `PUT` | `app/routes/api/bums-rush/profile.ts` |
| `/api/bums-rush/showdown` | `POST` | `app/routes/api/bums-rush/showdown.ts` |

## `/api/calc-notebooks`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calc-notebooks` | `GET` `POST` | `app/routes/api/calc-notebooks/index.ts` |
| `/api/calc-notebooks/:id` | `DELETE` `PUT` | `app/routes/api/calc-notebooks/$id.ts` |

## `/api/calendar`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calendar/:token` | `GET` | `app/routes/api/calendar/$token.ts` |

## `/api/calendar-feed`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calendar-feed` | `GET` `PATCH` | `app/routes/api/calendar-feed/index.ts` |

## `/api/calls`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calls/history` | `GET` | `app/routes/api/calls/history.ts` |
| `/api/calls/ice` | `GET` | `app/routes/api/calls/ice.ts` |
| `/api/calls/privacy` | `GET` `PUT` | `app/routes/api/calls/privacy.ts` |

## `/api/canvas`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/canvas` | `GET` | `app/routes/api/canvas/index.ts` |
| `/api/canvas/log` | `GET` | `app/routes/api/canvas/log.ts` |
| `/api/canvas/place` | `POST` | `app/routes/api/canvas/place.ts` |
| `/api/canvas/state` | `GET` | `app/routes/api/canvas/state.ts` |
| `/api/canvas/stream` | `GET` | `app/routes/api/canvas/stream.ts` |

## `/api/casino`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/casino/rooms` | `GET` | `app/routes/api/casino/rooms.ts` |

## `/api/chat-folders`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/chat-folders` | `GET` `POST` | `app/routes/api/chat-folders/index.ts` |
| `/api/chat-folders/:id` | `DELETE` `PATCH` | `app/routes/api/chat-folders/$id.ts` |
| `/api/chat-folders/:id/items` | `PUT` | `app/routes/api/chat-folders/$id/items.ts` |

## `/api/chats`

9 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/chats/:kind/:id/checklist` | `POST` `PUT` | `app/routes/api/chats/$kind/$id/checklist.ts` |
| `/api/chats/:kind/:id/command` | `POST` | `app/routes/api/chats/$kind/$id/command.ts` |
| `/api/chats/:kind/:id/media` | `GET` | `app/routes/api/chats/$kind/$id/media.ts` |
| `/api/chats/:kind/:id/meta` | `GET` | `app/routes/api/chats/$kind/$id/meta.ts` |
| `/api/chats/:kind/:id/pin` | `POST` | `app/routes/api/chats/$kind/$id/pin.ts` |
| `/api/chats/:kind/:id/settings` | `PATCH` `PUT` | `app/routes/api/chats/$kind/$id/settings.ts` |
| `/api/chats/:kind/:id/thread/:messageId` | `GET` `POST` | `app/routes/api/chats/$kind/$id/thread/$messageId.ts` |
| `/api/chats/:kind/:id/vote` | `POST` | `app/routes/api/chats/$kind/$id/vote.ts` |
| `/api/chats/forward` | `POST` | `app/routes/api/chats/forward.ts` |

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

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/coins` | `GET` | `app/routes/api/coins/index.ts` |
| `/api/coins/bet` | `POST` | `app/routes/api/coins/bet.ts` |
| `/api/coins/claim` | `POST` | `app/routes/api/coins/claim.ts` |
| `/api/coins/gift` | `POST` | `app/routes/api/coins/gift.ts` |
| `/api/coins/purchase` | `POST` | `app/routes/api/coins/purchase.ts` |
| `/api/coins/statement` | `GET` | `app/routes/api/coins/statement.ts` |
| `/api/coins/tip` | `POST` | `app/routes/api/coins/tip.ts` |

## `/api/comments`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/comments/:commentId/react` | `POST` | `app/routes/api/comments/$commentId/react.ts` |
| `/api/comments/:commentId/translate` | `GET` | `app/routes/api/comments/$commentId/translate.ts` |

## `/api/communities`

28 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/communities` | `GET` `POST` | `app/routes/api/communities/index.ts` |
| `/api/communities/:slug` | `GET` | `app/routes/api/communities/$slug/index.ts` |
| `/api/communities/:slug/announcements` | `GET` `POST` | `app/routes/api/communities/$slug/announcements.ts` |
| `/api/communities/:slug/announcements/:id` | `DELETE` | `app/routes/api/communities/$slug/announcements/$id.ts` |
| `/api/communities/:slug/automod` | `GET` `POST` | `app/routes/api/communities/$slug/automod.ts` |
| `/api/communities/:slug/automod/:ruleId` | `DELETE` `PATCH` | `app/routes/api/communities/$slug/automod/$ruleId.ts` |
| `/api/communities/:slug/census` | `GET` `POST` | `app/routes/api/communities/$slug/census.ts` |
| `/api/communities/:slug/census/:id/answer` | `POST` | `app/routes/api/communities/$slug/census/$id/answer.ts` |
| `/api/communities/:slug/census/:id/close` | `POST` | `app/routes/api/communities/$slug/census/$id/close.ts` |
| `/api/communities/:slug/challenge` | `GET` `POST` | `app/routes/api/communities/$slug/challenge.ts` |
| `/api/communities/:slug/challenge/:id` | `DELETE` | `app/routes/api/communities/$slug/challenge/$id.ts` |
| `/api/communities/:slug/challenge/vote` | `POST` | `app/routes/api/communities/$slug/challenge/vote.ts` |
| `/api/communities/:slug/contributors` | `GET` | `app/routes/api/communities/$slug/contributors.ts` |
| `/api/communities/:slug/extras` | `GET` | `app/routes/api/communities/$slug/extras.ts` |
| `/api/communities/:slug/feed` | `GET` | `app/routes/api/communities/$slug/feed.ts` |
| `/api/communities/:slug/flair-follows` | `PUT` | `app/routes/api/communities/$slug/flair-follows.ts` |
| `/api/communities/:slug/flairs` | `POST` | `app/routes/api/communities/$slug/flairs.ts` |
| `/api/communities/:slug/flairs/:flairId` | `DELETE` `PATCH` | `app/routes/api/communities/$slug/flairs/$flairId.ts` |
| `/api/communities/:slug/join` | `POST` | `app/routes/api/communities/$slug/join.ts` |
| `/api/communities/:slug/macros` | `DELETE` `GET` `POST` | `app/routes/api/communities/$slug/macros.ts` |
| `/api/communities/:slug/members` | `GET` | `app/routes/api/communities/$slug/members.ts` |
| `/api/communities/:slug/members/:userId` | `DELETE` `PATCH` | `app/routes/api/communities/$slug/members/$userId.ts` |
| `/api/communities/:slug/modqueue` | `GET` | `app/routes/api/communities/$slug/modqueue.ts` |
| `/api/communities/:slug/modqueue/:itemId` | `POST` | `app/routes/api/communities/$slug/modqueue/$itemId.ts` |
| `/api/communities/:slug/onboarding` | `GET` `POST` `PUT` | `app/routes/api/communities/$slug/onboarding.ts` |
| `/api/communities/:slug/settings` | `PATCH` | `app/routes/api/communities/$slug/settings.ts` |
| `/api/communities/:slug/sisters` | `PUT` | `app/routes/api/communities/$slug/sisters.ts` |
| `/api/communities/:slug/starboard` | `GET` | `app/routes/api/communities/$slug/starboard.ts` |

## `/api/community-goals`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/community-goals` | `GET` `POST` | `app/routes/api/community-goals/index.ts` |
| `/api/community-goals/:id/admin` | `POST` | `app/routes/api/community-goals/$id/admin.ts` |
| `/api/community-goals/:id/pledge` | `POST` | `app/routes/api/community-goals/$id/pledge.ts` |

## `/api/community-pages`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/community-pages` | `GET` `POST` | `app/routes/api/community-pages/index.ts` |
| `/api/community-pages/:id` | `DELETE` `PATCH` | `app/routes/api/community-pages/$id.ts` |
| `/api/community-pages/:id/revisions` | `GET` `POST` | `app/routes/api/community-pages/$id.revisions.ts` |

## `/api/connections`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/connections/grids` | `GET` `POST` | `app/routes/api/connections/grids/index.ts` |
| `/api/connections/grids/:id` | `DELETE` `GET` | `app/routes/api/connections/grids/$id.ts` |
| `/api/connections/grids/:id/guess` | `POST` | `app/routes/api/connections/grids/$id.guess.ts` |
| `/api/connections/grids/:id/rate` | `POST` | `app/routes/api/connections/grids/$id.rate.ts` |
| `/api/connections/grids/:id/schedule` | `POST` | `app/routes/api/connections/grids/$id.schedule.ts` |

## `/api/context-notes`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/context-notes` | `GET` `POST` | `app/routes/api/context-notes/index.ts` |
| `/api/context-notes/:id` | `DELETE` | `app/routes/api/context-notes/$id/index.ts` |
| `/api/context-notes/:id/rate` | `POST` | `app/routes/api/context-notes/$id/rate.ts` |

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

## `/api/datacenter`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/datacenter/compute` | `GET` `POST` | `app/routes/api/datacenter/compute.ts` |

## `/api/delight`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/delight/config` | `GET` | `app/routes/api/delight/config.ts` |

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

## `/api/discovery`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/discovery/alerts` | `DELETE` `GET` `POST` | `app/routes/api/discovery/alerts.ts` |
| `/api/discovery/memories` | `GET` `PUT` | `app/routes/api/discovery/memories.ts` |
| `/api/discovery/surprise` | `GET` | `app/routes/api/discovery/surprise.ts` |
| `/api/discovery/today` | `GET` | `app/routes/api/discovery/today.ts` |
| `/api/discovery/trending/:tag` | `GET` | `app/routes/api/discovery/trending/$tag.ts` |
| `/api/discovery/watch` | `GET` `PUT` | `app/routes/api/discovery/watch.ts` |

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

## `/api/dunesday`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/dunesday/ask` | `POST` | `app/routes/api/dunesday/ask.ts` |
| `/api/dunesday/feeds/:feedId/calendar.ics` | `GET` | `app/routes/api/dunesday/feeds.$feedId.calendar[.]ics.ts` |
| `/api/dunesday/feeds/:feedId/rss.xml` | `GET` | `app/routes/api/dunesday/feeds.$feedId.rss[.]xml.ts` |
| `/api/dunesday/sync` | `POST` | `app/routes/api/dunesday/sync.ts` |
| `/api/dunesday/sync/:feedId` | `DELETE` `GET` `PUT` | `app/routes/api/dunesday/sync.$feedId.ts` |
| `/api/dunesday/sync/:feedId/discord` | `POST` `PUT` | `app/routes/api/dunesday/sync.$feedId.discord.ts` |

## `/api/economy`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/economy/savings-goals` | `GET` `POST` | `app/routes/api/economy/savings-goals/index.ts` |
| `/api/economy/savings-goals/:id` | `DELETE` | `app/routes/api/economy/savings-goals/$id.ts` |

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

## `/api/emoji-packs`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/emoji-packs` | `GET` `POST` | `app/routes/api/emoji-packs/index.ts` |
| `/api/emoji-packs/:slug` | `GET` | `app/routes/api/emoji-packs/$slug/index.ts` |
| `/api/emoji-packs/:slug/items` | `DELETE` `POST` | `app/routes/api/emoji-packs/$slug/items.ts` |
| `/api/emoji-packs/:slug/subscribe` | `DELETE` `POST` | `app/routes/api/emoji-packs/$slug/subscribe.ts` |
| `/api/emoji-packs/:slug/upload` | `POST` | `app/routes/api/emoji-packs/$slug/upload.ts` |
| `/api/emoji-packs/installed` | `GET` | `app/routes/api/emoji-packs/installed.ts` |

## `/api/events`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/events` | `GET` `POST` | `app/routes/api/events/index.ts` |
| `/api/events/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/events/$id/index.ts` |
| `/api/events/:id/ics` | `GET` | `app/routes/api/events/$id/ics.ts` |
| `/api/events/:id/rsvp` | `DELETE` `POST` | `app/routes/api/events/$id/rsvp.ts` |

## `/api/experiments`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/experiments` | `GET` `POST` | `app/routes/api/experiments/index.ts` |

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

## `/api/feeds`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feeds` | `GET` `POST` | `app/routes/api/feeds/index.ts` |
| `/api/feeds/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/feeds/$id.ts` |
| `/api/feeds/:id/subscribe` | `DELETE` `POST` | `app/routes/api/feeds/$id/subscribe.ts` |

## `/api/forecasting`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/forecasting/calibration` | `GET` | `app/routes/api/forecasting/calibration.ts` |
| `/api/forecasting/seasons` | `GET` | `app/routes/api/forecasting/seasons.ts` |

## `/api/forest-explorer`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/forest-explorer/save` | `GET` `POST` | `app/routes/api/forest-explorer/save.ts` |

## `/api/fortune`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/fortune` | `POST` | `app/routes/api/fortune/index.ts` |
| `/api/fortune/today` | `GET` | `app/routes/api/fortune/today/index.ts` |

## `/api/friendly`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/friendly` | `GET` `POST` | `app/routes/api/friendly/index.ts` |
| `/api/friendly/:id` | `POST` | `app/routes/api/friendly/$id.ts` |

## `/api/gabriels-horn`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gabriels-horn/house-rule` | `POST` | `app/routes/api/gabriels-horn/house-rule.ts` |
| `/api/gabriels-horn/leaderboard` | `GET` | `app/routes/api/gabriels-horn/leaderboard.ts` |
| `/api/gabriels-horn/table-read` | `GET` | `app/routes/api/gabriels-horn/table-read.ts` |

## `/api/game-night`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/game-night` | `GET` `PATCH` `POST` | `app/routes/api/game-night/index.ts` |

## `/api/game-saves`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/game-saves/:gameId` | `DELETE` `GET` `POST` | `app/routes/api/game-saves/$gameId.ts` |

## `/api/games`

9 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/games/:id/guides` | `GET` | `app/routes/api/games/$id.guides.ts` |
| `/api/games/:id/leaderboard` | `GET` | `app/routes/api/games/$id/leaderboard.ts` |
| `/api/games/:id/review` | `DELETE` `PUT` | `app/routes/api/games/$id.review.ts` |
| `/api/games/:id/reviews` | `GET` | `app/routes/api/games/$id.reviews.ts` |
| `/api/games/:id/score` | `POST` | `app/routes/api/games/$id/score.ts` |
| `/api/games/how-to-play` | `POST` | `app/routes/api/games/how-to-play.ts` |
| `/api/games/synapse-storm/leaderboard` | `GET` | `app/routes/api/games/synapse-storm/leaderboard.ts` |
| `/api/games/synapse-storm/save` | `GET` | `app/routes/api/games/synapse-storm/save.ts` |
| `/api/games/synapse-storm/score` | `POST` | `app/routes/api/games/synapse-storm/score.ts` |

## `/api/gif`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gif/search` | `GET` | `app/routes/api/gif/search.ts` |

## `/api/gift-exchanges`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gift-exchanges` | `GET` `POST` | `app/routes/api/gift-exchanges/index.ts` |
| `/api/gift-exchanges/:id` | `DELETE` `GET` | `app/routes/api/gift-exchanges/$id/index.ts` |
| `/api/gift-exchanges/:id/draw` | `POST` | `app/routes/api/gift-exchanges/$id/draw.ts` |
| `/api/gift-exchanges/:id/gift` | `POST` | `app/routes/api/gift-exchanges/$id/gift.ts` |
| `/api/gift-exchanges/:id/join` | `DELETE` `POST` | `app/routes/api/gift-exchanges/$id/join.ts` |
| `/api/gift-exchanges/:id/me` | `PUT` | `app/routes/api/gift-exchanges/$id/me.ts` |

## `/api/gift-sub`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gift-sub` | `GET` `POST` | `app/routes/api/gift-sub.ts` |

## `/api/gifts`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gifts/scheduled` | `GET` `POST` | `app/routes/api/gifts/scheduled/index.ts` |
| `/api/gifts/scheduled/:id` | `DELETE` | `app/routes/api/gifts/scheduled/$id/index.ts` |
| `/api/gifts/scheduled/:id/unwrap` | `POST` | `app/routes/api/gifts/scheduled/$id/unwrap.ts` |

## `/api/globeset`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/globeset/record` | `GET` | `app/routes/api/globeset/record.ts` |

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

## `/api/handles`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/handles/change` | `GET` `POST` | `app/routes/api/handles/change.ts` |
| `/api/handles/history` | `GET` | `app/routes/api/handles/history.ts` |
| `/api/handles/impersonation` | `GET` `POST` | `app/routes/api/handles/impersonation.ts` |

## `/api/health`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/health` | `GET` | `app/routes/api/health.ts` |

## `/api/history`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/history` | `DELETE` `GET` `PUT` | `app/routes/api/history/index.ts` |
| `/api/history/:id` | `DELETE` | `app/routes/api/history/$id.ts` |
| `/api/history/beat` | `POST` | `app/routes/api/history/beat.ts` |
| `/api/history/position` | `GET` `POST` | `app/routes/api/history/position.ts` |
| `/api/history/resume` | `GET` | `app/routes/api/history/resume.ts` |

## `/api/homes`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/homes/ai-image` | `GET` `POST` | `app/routes/api/homes/ai-image.ts` |
| `/api/homes/geocode` | `GET` | `app/routes/api/homes/geocode.ts` |
| `/api/homes/listings` | `GET` `POST` | `app/routes/api/homes/listings.ts` |
| `/api/homes/listings/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/homes/listings.$id.ts` |
| `/api/homes/listings/:id/favorite` | `DELETE` `POST` | `app/routes/api/homes/listings.$id.favorite.ts` |
| `/api/homes/listings/:id/roommate` | `GET` | `app/routes/api/homes/listings.$id.roommate.ts` |
| `/api/homes/roommate` | `GET` `PUT` | `app/routes/api/homes/roommate.ts` |
| `/api/homes/watches` | `DELETE` `GET` `PATCH` `POST` | `app/routes/api/homes/watches.ts` |

## `/api/hunt`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/hunt` | `GET` | `app/routes/api/hunt/index.ts` |
| `/api/hunt/answer` | `POST` | `app/routes/api/hunt/answer/index.ts` |
| `/api/hunt/marker` | `GET` | `app/routes/api/hunt/marker/index.ts` |

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

## `/api/jams`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/jams` | `GET` `POST` | `app/routes/api/jams/index.ts` |
| `/api/jams/:slug` | `GET` | `app/routes/api/jams/$slug.ts` |
| `/api/jams/:slug/entry` | `POST` | `app/routes/api/jams/$slug/entry.ts` |
| `/api/jams/:slug/rate` | `POST` | `app/routes/api/jams/$slug/rate.ts` |

## `/api/kaikai-debt`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/kaikai-debt` | `GET` | `app/routes/api/kaikai-debt/index.ts` |
| `/api/kaikai-debt/ask` | `POST` | `app/routes/api/kaikai-debt/ask.ts` |
| `/api/kaikai-debt/entries` | `POST` | `app/routes/api/kaikai-debt/entries.ts` |
| `/api/kaikai-debt/ledger` | `GET` | `app/routes/api/kaikai-debt/ledger.ts` |
| `/api/kaikai-debt/stats` | `GET` | `app/routes/api/kaikai-debt/stats.ts` |
| `/api/kaikai-debt/stream` | `GET` | `app/routes/api/kaikai-debt/stream.ts` |

## `/api/kudos`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/kudos/:id` | `DELETE` | `app/routes/api/kudos/$id.ts` |

## `/api/laundry-sort`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/laundry-sort/leaderboard` | `GET` | `app/routes/api/laundry-sort/leaderboard.ts` |
| `/api/laundry-sort/score` | `POST` | `app/routes/api/laundry-sort/score.ts` |

## `/api/leaderboards`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/leaderboards/:gameId` | `GET` | `app/routes/api/leaderboards/$gameId.ts` |
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

## `/api/links`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/links/check` | `POST` | `app/routes/api/links/check.ts` |

## `/api/lists`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/lists` | `GET` `POST` | `app/routes/api/lists/index.ts` |
| `/api/lists/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/lists/$id.ts` |
| `/api/lists/:id/feed` | `GET` | `app/routes/api/lists/$id.feed.ts` |
| `/api/lists/:id/members` | `DELETE` `PUT` | `app/routes/api/lists/$id.members.ts` |

## `/api/marathon-lists`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/marathon-lists` | `GET` `POST` | `app/routes/api/marathon-lists/index.ts` |
| `/api/marathon-lists/:id` | `DELETE` `PUT` | `app/routes/api/marathon-lists/$id.ts` |
| `/api/marathon-lists/shared/:shareId` | `GET` | `app/routes/api/marathon-lists/shared/$shareId.ts` |

## `/api/market`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/market/listings` | `GET` `POST` | `app/routes/api/market/listings/index.ts` |
| `/api/market/listings/:id` | `DELETE` | `app/routes/api/market/listings/$id/index.ts` |
| `/api/market/listings/:id/buy` | `POST` | `app/routes/api/market/listings/$id/buy.ts` |

## `/api/massive-march`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/massive-march/campaigns` | `DELETE` `GET` | `app/routes/api/massive-march/campaigns.ts` |
| `/api/massive-march/signals` | `GET` `POST` | `app/routes/api/massive-march/signals/index.ts` |
| `/api/massive-march/signals/vote` | `POST` | `app/routes/api/massive-march/signals/vote.ts` |

## `/api/memory`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/memory` | `DELETE` `GET` `POST` | `app/routes/api/memory/index.ts` |

## `/api/messages`

18 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/messages` | `GET` `POST` | `app/routes/api/messages.ts` |
| `/api/messages/:conversationId` | `GET` `POST` | `app/routes/api/messages/$conversationId.ts` |
| `/api/messages/:conversationId/edit` | `POST` | `app/routes/api/messages/$conversationId/edit.ts` |
| `/api/messages/:conversationId/hide` | `POST` | `app/routes/api/messages/$conversationId/hide.ts` |
| `/api/messages/:conversationId/mutations` | `GET` | `app/routes/api/messages/$conversationId/mutations.ts` |
| `/api/messages/:conversationId/react` | `POST` | `app/routes/api/messages/$conversationId/react.ts` |
| `/api/messages/:conversationId/read` | `POST` | `app/routes/api/messages/$conversationId/read.ts` |
| `/api/messages/:conversationId/thread` | `GET` | `app/routes/api/messages/$conversationId/thread.ts` |
| `/api/messages/:conversationId/typing` | `POST` | `app/routes/api/messages/$conversationId/typing.ts` |
| `/api/messages/:conversationId/unsend` | `POST` | `app/routes/api/messages/$conversationId/unsend.ts` |
| `/api/messages/:conversationId/voice` | `POST` | `app/routes/api/messages/$conversationId/voice.ts` |
| `/api/messages/read-all` | `POST` | `app/routes/api/messages/read-all.ts` |
| `/api/messages/saved` | `GET` `POST` | `app/routes/api/messages/saved.ts` |
| `/api/messages/search` | `GET` | `app/routes/api/messages/search.ts` |
| `/api/messages/sidebar` | `GET` | `app/routes/api/messages/sidebar.ts` |
| `/api/messages/stream` | `GET` | `app/routes/api/messages/stream.ts` |
| `/api/messages/unread-count` | `GET` | `app/routes/api/messages/unread-count.ts` |
| `/api/messages/voice/:filename` | `GET` | `app/routes/api/messages/voice/$filename.ts` |

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

## `/api/museum`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/museum` | `GET` | `app/routes/api/museum/index.ts` |

## `/api/neon-driftway`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/neon-driftway/leaderboard` | `GET` | `app/routes/api/neon-driftway/leaderboard.ts` |
| `/api/neon-driftway/livery` | `GET` `PUT` | `app/routes/api/neon-driftway/livery.ts` |
| `/api/neon-driftway/score` | `POST` | `app/routes/api/neon-driftway/score.ts` |

## `/api/news`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/news/approve` | `GET` `POST` | `app/routes/api/news/approve.ts` |
| `/api/news/reject` | `GET` `POST` | `app/routes/api/news/reject.ts` |

## `/api/nightrail`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/nightrail/tricks` | `GET` `POST` | `app/routes/api/nightrail/tricks/index.ts` |
| `/api/nightrail/tricks/vote` | `POST` | `app/routes/api/nightrail/tricks/vote.ts` |

## `/api/notices`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/notices/active` | `GET` | `app/routes/api/notices/active.ts` |
| `/api/notices/dismiss` | `POST` | `app/routes/api/notices/dismiss.ts` |

## `/api/notifications`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/notifications` | `GET` | `app/routes/api/notifications/index.ts` |
| `/api/notifications/preferences` | `GET` `PUT` | `app/routes/api/notifications/preferences.ts` |
| `/api/notifications/read` | `POST` | `app/routes/api/notifications/read.ts` |

## `/api/oembed`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/oembed` | `GET` | `app/routes/api/oembed.ts` |

## `/api/office-hours`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/office-hours` | `GET` `PUT` | `app/routes/api/office-hours/index.ts` |
| `/api/office-hours/bookings/:id` | `DELETE` | `app/routes/api/office-hours/bookings/$id/index.ts` |
| `/api/office-hours/bookings/:id/ics` | `GET` | `app/routes/api/office-hours/bookings/$id/ics.ts` |
| `/api/office-hours/host/:id` | `GET` `POST` | `app/routes/api/office-hours/host/$id/index.ts` |
| `/api/office-hours/host/:id/summary` | `GET` | `app/routes/api/office-hours/host/$id/summary.ts` |

## `/api/og`

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/og/app/:appId` | `GET` | `app/routes/api/og/app/$appId.ts` |
| `/api/og/blog/:slug` | `GET` | `app/routes/api/og/blog/$slug.ts` |
| `/api/og/game/:gameId` | `GET` | `app/routes/api/og/game/$gameId.ts` |
| `/api/og/job/:jobId` | `GET` | `app/routes/api/og/job/$jobId.ts` |
| `/api/og/moment/:id` | `GET` | `app/routes/api/og/moment/$id.ts` |
| `/api/og/pf2ecal` | `GET` | `app/routes/api/og/pf2ecal.ts` |
| `/api/og/post/:id` | `GET` | `app/routes/api/og/post/$id.ts` |
| `/api/og/post/:id/story` | `GET` | `app/routes/api/og/post/$id/story.ts` |
| `/api/og/profile/:id` | `GET` | `app/routes/api/og/profile/$id.ts` |
| `/api/og/replay/:id` | `GET` | `app/routes/api/og/replay/$id.ts` |
| `/api/og/sohumtracker` | `GET` | `app/routes/api/og/sohumtracker.ts` |

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

## `/api/pf2ecal`

13 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/pf2ecal` | `GET` | `app/routes/api/pf2ecal/index.ts` |
| `/api/pf2ecal/announcements` | `POST` | `app/routes/api/pf2ecal/announcements.ts` |
| `/api/pf2ecal/announcements/:id` | `DELETE` `PATCH` | `app/routes/api/pf2ecal/announcements.$id.ts` |
| `/api/pf2ecal/ask` | `POST` | `app/routes/api/pf2ecal/ask.ts` |
| `/api/pf2ecal/calendar.ics` | `GET` | `app/routes/api/pf2ecal/calendar[.]ics.ts` |
| `/api/pf2ecal/sessions` | `POST` | `app/routes/api/pf2ecal/sessions.ts` |
| `/api/pf2ecal/sessions/:id` | `DELETE` `PATCH` | `app/routes/api/pf2ecal/sessions.$id.ts` |
| `/api/pf2ecal/sessions/:id/recap` | `GET` `POST` | `app/routes/api/pf2ecal/sessions.$id.recap.ts` |
| `/api/pf2ecal/sessions/:id/response` | `DELETE` `PUT` | `app/routes/api/pf2ecal/sessions.$id.response.ts` |
| `/api/pf2ecal/sessions/archive` | `GET` | `app/routes/api/pf2ecal/sessions.archive.ts` |
| `/api/pf2ecal/sessions/blurbs` | `POST` | `app/routes/api/pf2ecal/sessions.blurbs.ts` |
| `/api/pf2ecal/settings` | `GET` `PUT` | `app/routes/api/pf2ecal/settings.ts` |
| `/api/pf2ecal/settings/test-webhook` | `POST` | `app/routes/api/pf2ecal/settings.test-webhook.ts` |

## `/api/photo-of-the-day`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/photo-of-the-day` | `GET` `POST` | `app/routes/api/photo-of-the-day/index.ts` |
| `/api/photo-of-the-day/:id` | `DELETE` | `app/routes/api/photo-of-the-day/$id/index.ts` |
| `/api/photo-of-the-day/vote` | `POST` | `app/routes/api/photo-of-the-day/vote/index.ts` |

## `/api/playlists`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/playlists` | `GET` `POST` | `app/routes/api/playlists/index.ts` |
| `/api/playlists/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/playlists/$id/index.ts` |
| `/api/playlists/:id/items` | `POST` | `app/routes/api/playlists/$id/items/index.ts` |
| `/api/playlists/:id/items/:itemId` | `DELETE` | `app/routes/api/playlists/$id/items/$itemId.ts` |

## `/api/pools`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/pools` | `GET` `POST` | `app/routes/api/pools/index.ts` |
| `/api/pools/:id` | `GET` | `app/routes/api/pools/$id/index.ts` |
| `/api/pools/:id/contribute` | `POST` | `app/routes/api/pools/$id/contribute.ts` |

## `/api/predictions`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/predictions` | `GET` `POST` | `app/routes/api/predictions/index.ts` |
| `/api/predictions/:id` | `GET` | `app/routes/api/predictions/$id.ts` |
| `/api/predictions/:id/comments` | `GET` `POST` | `app/routes/api/predictions/$id/comments.ts` |
| `/api/predictions/:id/devils-advocate` | `POST` | `app/routes/api/predictions/$id/devils-advocate.ts` |
| `/api/predictions/:id/trade` | `POST` | `app/routes/api/predictions/$id/trade.ts` |

## `/api/preferences`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/preferences/appearance` | `GET` `PUT` | `app/routes/api/preferences/appearance.ts` |
| `/api/preferences/conversation` | `GET` `PUT` | `app/routes/api/preferences/conversation.ts` |
| `/api/preferences/layout` | `GET` `PUT` | `app/routes/api/preferences/layout.ts` |
| `/api/preferences/muted-words` | `GET` `PUT` | `app/routes/api/preferences/muted-words.ts` |
| `/api/preferences/notifications` | `GET` `PUT` | `app/routes/api/preferences/notifications.ts` |
| `/api/preferences/presence` | `GET` `PUT` | `app/routes/api/preferences/presence.ts` |

## `/api/presence`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/presence/online-count` | `GET` | `app/routes/api/presence/online-count.ts` |

## `/api/profile`

30 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/profile` | `PATCH` | `app/routes/api/profile.ts` |
| `/api/profile/:id` | `GET` | `app/routes/api/profile/$id.ts` |
| `/api/profile/:id/card` | `GET` | `app/routes/api/profile/$id/card.ts` |
| `/api/profile/:id/endorsements` | `GET` `PUT` | `app/routes/api/profile/$id/endorsements.ts` |
| `/api/profile/:id/follow` | `POST` | `app/routes/api/profile/$id/follow.ts` |
| `/api/profile/:id/followers` | `GET` | `app/routes/api/profile/$id/followers.ts` |
| `/api/profile/:id/following` | `GET` | `app/routes/api/profile/$id/following.ts` |
| `/api/profile/:id/guestbook` | `GET` `PATCH` `POST` | `app/routes/api/profile/$id/guestbook.ts` |
| `/api/profile/:id/guestbook/:entryId` | `DELETE` `PATCH` | `app/routes/api/profile/$id/guestbook.$entryId.ts` |
| `/api/profile/:id/kudos` | `GET` `POST` | `app/routes/api/profile/$id/kudos.ts` |
| `/api/profile/:id/likes` | `GET` | `app/routes/api/profile/$id/likes.ts` |
| `/api/profile/:id/membership` | `DELETE` `POST` | `app/routes/api/profile/$id/membership.ts` |
| `/api/profile/:id/plus` | `GET` | `app/routes/api/profile/$id/plus.ts` |
| `/api/profile/:id/pronunciation` | `GET` | `app/routes/api/profile/$id/pronunciation.ts` |
| `/api/profile/:id/rmharks` | `GET` | `app/routes/api/profile/$id/rmharks.ts` |
| `/api/profile/:id/shelves` | `GET` | `app/routes/api/profile/$id/shelves.ts` |
| `/api/profile/:id/stamps` | `GET` | `app/routes/api/profile/$id/stamps.ts` |
| `/api/profile/:id/visit` | `POST` | `app/routes/api/profile/$id/visit.ts` |
| `/api/profile/:id/webrings` | `GET` | `app/routes/api/profile/$id/webrings.ts` |
| `/api/profile/analytics` | `GET` | `app/routes/api/profile/analytics.ts` |
| `/api/profile/avatar` | `DELETE` `POST` | `app/routes/api/profile/avatar.ts` |
| `/api/profile/avatar/:filename` | `GET` | `app/routes/api/profile/avatar/$filename.ts` |
| `/api/profile/banner` | `DELETE` `POST` | `app/routes/api/profile/banner.ts` |
| `/api/profile/banner/:filename` | `GET` | `app/routes/api/profile/banner/$filename.ts` |
| `/api/profile/layout` | `GET` `PUT` | `app/routes/api/profile/layout.ts` |
| `/api/profile/me` | `GET` | `app/routes/api/profile/me.ts` |
| `/api/profile/plus` | `GET` `PUT` | `app/routes/api/profile/plus.ts` |
| `/api/profile/pronunciation` | `DELETE` `POST` | `app/routes/api/profile/pronunciation.ts` |
| `/api/profile/status` | `DELETE` `PUT` | `app/routes/api/profile/status.ts` |
| `/api/profile/top-four` | `GET` `PUT` | `app/routes/api/profile/top-four.ts` |

## `/api/profile-links`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/profile-links` | `GET` `POST` | `app/routes/api/profile-links/index.ts` |
| `/api/profile-links/:id` | `DELETE` `PATCH` | `app/routes/api/profile-links/$id/index.ts` |
| `/api/profile-links/:id/verify` | `POST` | `app/routes/api/profile-links/$id/verify.ts` |
| `/api/profile-links/reverify` | `POST` | `app/routes/api/profile-links/reverify.ts` |

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

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/push/action` | `POST` | `app/routes/api/push/action.ts` |
| `/api/push/public-key` | `GET` | `app/routes/api/push/public-key.ts` |
| `/api/push/subscribe` | `DELETE` `POST` | `app/routes/api/push/subscribe.ts` |

## `/api/qotd`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/qotd/answers` | `GET` | `app/routes/api/qotd/answers.ts` |
| `/api/qotd/archive` | `GET` | `app/routes/api/qotd/archive.ts` |
| `/api/qotd/today` | `GET` | `app/routes/api/qotd/today.ts` |

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

## `/api/reading`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reading/doc` | `GET` | `app/routes/api/reading/doc.ts` |
| `/api/reading/goal` | `DELETE` `GET` `PUT` | `app/routes/api/reading/goal.ts` |
| `/api/reading/highlights` | `GET` `POST` | `app/routes/api/reading/highlights/index.ts` |
| `/api/reading/highlights/:id` | `DELETE` `PATCH` | `app/routes/api/reading/highlights/$id.ts` |
| `/api/reading/shelves` | `DELETE` `GET` `PUT` | `app/routes/api/reading/shelves/index.ts` |
| `/api/reading/shelves/prefs` | `PUT` | `app/routes/api/reading/shelves/prefs.ts` |

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

## `/api/recipes`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/recipes` | `GET` `POST` | `app/routes/api/recipes/index.ts` |
| `/api/recipes/:id` | `DELETE` `PATCH` | `app/routes/api/recipes/$id.ts` |

## `/api/recommend`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/recommend` | `GET` | `app/routes/api/recommend/index.ts` |
| `/api/recommend/feedback` | `POST` | `app/routes/api/recommend/feedback.ts` |

## `/api/referrals`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/referrals/claim` | `POST` | `app/routes/api/referrals/claim.ts` |
| `/api/referrals/me` | `GET` | `app/routes/api/referrals/me.ts` |

## `/api/release-notes`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/release-notes` | `GET` | `app/routes/api/release-notes.ts` |

## `/api/reminders`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reminders` | `GET` `POST` | `app/routes/api/reminders/index.ts` |
| `/api/reminders/:id` | `DELETE` | `app/routes/api/reminders/$id.ts` |

## `/api/replays`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/replays` | `POST` | `app/routes/api/replays/index.ts` |
| `/api/replays/:id` | `DELETE` `GET` | `app/routes/api/replays/$id.ts` |
| `/api/replays/ghost` | `GET` `POST` | `app/routes/api/replays/ghost.ts` |

## `/api/requests`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/requests` | `GET` `POST` | `app/routes/api/requests/index.ts` |
| `/api/requests/:id` | `GET` `PATCH` | `app/routes/api/requests/$id.ts` |
| `/api/requests/:id/vote` | `POST` | `app/routes/api/requests/$id.vote.ts` |

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

28 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmharks` | `GET` `POST` | `app/routes/api/rmharks.ts` |
| `/api/rmharks/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/rmharks/$id.ts` |
| `/api/rmharks/:id/bookmark` | `POST` | `app/routes/api/rmharks/$id/bookmark.ts` |
| `/api/rmharks/:id/comment` | `GET` `POST` | `app/routes/api/rmharks/$id/comment.ts` |
| `/api/rmharks/:id/comment/:commentId` | `DELETE` | `app/routes/api/rmharks/$id/comment/$commentId.ts` |
| `/api/rmharks/:id/comment/:commentId/hide` | `POST` | `app/routes/api/rmharks/$id/comment/$commentId/hide.ts` |
| `/api/rmharks/:id/comment/:commentId/like` | `GET` `POST` | `app/routes/api/rmharks/$id/comment/$commentId/like.ts` |
| `/api/rmharks/:id/comment/:commentId/repost` | `GET` `POST` | `app/routes/api/rmharks/$id/comment/$commentId/repost.ts` |
| `/api/rmharks/:id/comment/:commentId/view` | `POST` | `app/routes/api/rmharks/$id/comment/$commentId/view.ts` |
| `/api/rmharks/:id/embed` | `GET` | `app/routes/api/rmharks/$id/embed.ts` |
| `/api/rmharks/:id/history` | `GET` | `app/routes/api/rmharks/$id/history.ts` |
| `/api/rmharks/:id/insights` | `GET` | `app/routes/api/rmharks/$id/insights.ts` |
| `/api/rmharks/:id/like` | `GET` `POST` | `app/routes/api/rmharks/$id/like.ts` |
| `/api/rmharks/:id/pin` | `POST` | `app/routes/api/rmharks/$id/pin.ts` |
| `/api/rmharks/:id/quotes` | `GET` | `app/routes/api/rmharks/$id/quotes.ts` |
| `/api/rmharks/:id/react` | `POST` | `app/routes/api/rmharks/$id/react.ts` |
| `/api/rmharks/:id/repost` | `GET` `POST` | `app/routes/api/rmharks/$id/repost.ts` |
| `/api/rmharks/:id/similar` | `GET` | `app/routes/api/rmharks/$id/similar.ts` |
| `/api/rmharks/:id/summary` | `GET` | `app/routes/api/rmharks/$id/summary.ts` |
| `/api/rmharks/:id/take` | `GET` `POST` | `app/routes/api/rmharks/$id/take.ts` |
| `/api/rmharks/:id/translate` | `GET` | `app/routes/api/rmharks/$id/translate.ts` |
| `/api/rmharks/:id/unlock` | `POST` | `app/routes/api/rmharks/$id/unlock.ts` |
| `/api/rmharks/:id/view` | `POST` | `app/routes/api/rmharks/$id/view.ts` |
| `/api/rmharks/:id/vote` | `POST` | `app/routes/api/rmharks/$id/vote.ts` |
| `/api/rmharks/ai-generate` | `POST` | `app/routes/api/rmharks/ai-generate.ts` |
| `/api/rmharks/ai-image` | `POST` | `app/routes/api/rmharks/ai-image.ts` |
| `/api/rmharks/image` | `POST` | `app/routes/api/rmharks/image.ts` |
| `/api/rmharks/thread` | `POST` | `app/routes/api/rmharks/thread.ts` |

## `/api/rmhbox`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhbox/history` | `GET` | `app/routes/api/rmhbox/history.ts` |
| `/api/rmhbox/leaderboard` | `GET` | `app/routes/api/rmhbox/leaderboard.ts` |
| `/api/rmhbox/packs` | `GET` `POST` | `app/routes/api/rmhbox/packs/index.ts` |
| `/api/rmhbox/packs/:id` | `DELETE` `PATCH` | `app/routes/api/rmhbox/packs/$id.ts` |
| `/api/rmhbox/packs/:id/report` | `POST` | `app/routes/api/rmhbox/packs/$id.report.ts` |
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

16 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhladder/answers` | `DELETE` `GET` `PUT` | `app/routes/api/rmhladder/answers.ts` |
| `/api/rmhladder/calendar` | `GET` | `app/routes/api/rmhladder/calendar.ts` |
| `/api/rmhladder/events` | `POST` | `app/routes/api/rmhladder/events.ts` |
| `/api/rmhladder/export` | `GET` | `app/routes/api/rmhladder/export.ts` |
| `/api/rmhladder/import` | `POST` | `app/routes/api/rmhladder/import.ts` |
| `/api/rmhladder/interview-reports` | `GET` `POST` | `app/routes/api/rmhladder/interview-reports.ts` |
| `/api/rmhladder/prep` | `POST` | `app/routes/api/rmhladder/prep.ts` |
| `/api/rmhladder/referral-requests/:id` | `PATCH` | `app/routes/api/rmhladder/referral-requests.$id.ts` |
| `/api/rmhladder/referrals` | `GET` `POST` | `app/routes/api/rmhladder/referrals.ts` |
| `/api/rmhladder/referrals/:id` | `DELETE` | `app/routes/api/rmhladder/referrals.$id.ts` |
| `/api/rmhladder/referrals/:id/request` | `POST` | `app/routes/api/rmhladder/referrals.$id.request.ts` |
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

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhtube/commentary` | `GET` `POST` | `app/routes/api/rmhtube/commentary.ts` |
| `/api/rmhtube/heat` | `GET` | `app/routes/api/rmhtube/heat.ts` |
| `/api/rmhtube/oembed` | `GET` | `app/routes/api/rmhtube/oembed.ts` |
| `/api/rmhtube/subscribe/:channelId` | `POST` | `app/routes/api/rmhtube/subscribe/$channelId.ts` |
| `/api/rmhtube/timed-comments` | `DELETE` `GET` `POST` | `app/routes/api/rmhtube/timed-comments.ts` |
| `/api/rmhtube/watch-later` | `DELETE` `GET` `POST` | `app/routes/api/rmhtube/watch-later.ts` |

## `/api/rmhtype`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhtype/keystats` | `DELETE` `GET` `POST` | `app/routes/api/rmhtype/keystats.ts` |
| `/api/rmhtype/practice-test` | `POST` | `app/routes/api/rmhtype/practice-test.ts` |

## `/api/rum`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rum` | `POST` | `app/routes/api/rum.ts` |

## `/api/safety`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/safety/pile-on` | `GET` `POST` | `app/routes/api/safety/pile-on.ts` |

## `/api/saves`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/saves` | `DELETE` `GET` `POST` | `app/routes/api/saves/index.ts` |
| `/api/saves/folders` | `GET` `POST` | `app/routes/api/saves/folders.ts` |
| `/api/saves/folders/:id` | `DELETE` `PATCH` | `app/routes/api/saves/folders.$id.ts` |
| `/api/saves/note` | `PUT` | `app/routes/api/saves/note.ts` |

## `/api/schedule`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/schedule` | `GET` | `app/routes/api/schedule/index.ts` |
| `/api/schedule/admin` | `DELETE` `GET` `POST` | `app/routes/api/schedule/admin.ts` |

## `/api/scheduled`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/scheduled` | `GET` `POST` | `app/routes/api/scheduled/index.ts` |
| `/api/scheduled/:id` | `DELETE` `PATCH` | `app/routes/api/scheduled/$id.ts` |
| `/api/scheduled/:id/publish` | `POST` | `app/routes/api/scheduled/$id/publish.ts` |
| `/api/scheduled/capsules` | `GET` | `app/routes/api/scheduled/capsules.ts` |

## `/api/search`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/search` | `GET` | `app/routes/api/search.ts` |
| `/api/search/saved` | `GET` `POST` | `app/routes/api/search/saved.ts` |
| `/api/search/saved/:id` | `DELETE` `PATCH` | `app/routes/api/search/saved.$id.ts` |

## `/api/series`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/series` | `GET` `POST` | `app/routes/api/series/index.ts` |
| `/api/series/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/series/$id.ts` |
| `/api/series/:id/follow` | `DELETE` `PUT` | `app/routes/api/series/$id/follow.ts` |
| `/api/series/:id/posts` | `POST` | `app/routes/api/series/$id/posts.ts` |
| `/api/series/:id/posts/:postId` | `DELETE` `PATCH` | `app/routes/api/series/$id/posts/$postId.ts` |
| `/api/series/post/:postId` | `GET` | `app/routes/api/series/post/$postId.ts` |

## `/api/services`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/services/rebar-reservations` | `DELETE` `GET` `POST` | `app/routes/api/services/rebar-reservations.ts` |

## `/api/settings`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/settings/alt-text` | `GET` `POST` | `app/routes/api/settings/alt-text.ts` |
| `/api/settings/auto-delete` | `GET` `PUT` | `app/routes/api/settings/auto-delete.ts` |
| `/api/settings/email-digest` | `POST` | `app/routes/api/settings/email-digest.ts` |
| `/api/settings/game-assists` | `GET` `POST` | `app/routes/api/settings/game-assists.ts` |
| `/api/settings/play-limits` | `GET` `POST` | `app/routes/api/settings/play-limits.ts` |

## `/api/shop`

9 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/shop` | `GET` | `app/routes/api/shop/index.ts` |
| `/api/shop/bundle` | `POST` | `app/routes/api/shop/bundle.ts` |
| `/api/shop/daily` | `GET` | `app/routes/api/shop/daily.ts` |
| `/api/shop/equip` | `POST` | `app/routes/api/shop/equip.ts` |
| `/api/shop/loadouts` | `GET` `POST` | `app/routes/api/shop/loadouts/index.ts` |
| `/api/shop/loadouts/:id` | `DELETE` | `app/routes/api/shop/loadouts/$id/index.ts` |
| `/api/shop/loadouts/:id/apply` | `POST` | `app/routes/api/shop/loadouts/$id/apply.ts` |
| `/api/shop/purchase` | `POST` | `app/routes/api/shop/purchase.ts` |
| `/api/shop/search` | `GET` | `app/routes/api/shop/search.ts` |

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

36 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/slice-it/admin/content` | `GET` | `app/routes/api/slice-it/admin/content.ts` |
| `/api/slice-it/admin/review` | `GET` | `app/routes/api/slice-it/admin/review.ts` |
| `/api/slice-it/admin/takedown` | `GET` `POST` | `app/routes/api/slice-it/admin/takedown.ts` |
| `/api/slice-it/charts` | `GET` `POST` | `app/routes/api/slice-it/charts.ts` |
| `/api/slice-it/charts/:id` | `DELETE` `GET` `PATCH` `POST` | `app/routes/api/slice-it/charts/$id.ts` |
| `/api/slice-it/charts/:id/reviews` | `DELETE` `GET` `PUT` | `app/routes/api/slice-it/charts/$id/reviews.ts` |
| `/api/slice-it/charts/:id/revisions` | `GET` | `app/routes/api/slice-it/charts/$id/revisions.ts` |
| `/api/slice-it/charts/ranking` | `GET` `POST` | `app/routes/api/slice-it/charts/ranking.ts` |
| `/api/slice-it/daily` | `GET` | `app/routes/api/slice-it/daily/index.ts` |
| `/api/slice-it/daily/submit` | `POST` | `app/routes/api/slice-it/daily/submit.ts` |
| `/api/slice-it/leaderboard` | `GET` | `app/routes/api/slice-it/leaderboard.ts` |
| `/api/slice-it/packs` | `GET` `POST` | `app/routes/api/slice-it/packs/index.ts` |
| `/api/slice-it/packs/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/slice-it/packs/$id.ts` |
| `/api/slice-it/packs/:id/items` | `PATCH` | `app/routes/api/slice-it/packs/$id/items.ts` |
| `/api/slice-it/replay` | `GET` `POST` | `app/routes/api/slice-it/replay.ts` |
| `/api/slice-it/replay/:id` | `GET` | `app/routes/api/slice-it/replay/$id.ts` |
| `/api/slice-it/score` | `POST` | `app/routes/api/slice-it/score.ts` |
| `/api/slice-it/setlists` | `GET` `POST` | `app/routes/api/slice-it/setlists/index.ts` |
| `/api/slice-it/setlists/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/slice-it/setlists/$id.ts` |
| `/api/slice-it/shelves` | `GET` | `app/routes/api/slice-it/shelves.ts` |
| `/api/slice-it/showcase` | `GET` | `app/routes/api/slice-it/showcase.ts` |
| `/api/slice-it/songs` | `GET` | `app/routes/api/slice-it/songs.ts` |
| `/api/slice-it/songs/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/slice-it/songs/$id.ts` |
| `/api/slice-it/songs/:id/charts` | `GET` | `app/routes/api/slice-it/songs/$id/charts.ts` |
| `/api/slice-it/songs/:id/comments` | `DELETE` `GET` `POST` | `app/routes/api/slice-it/songs/$id/comments.ts` |
| `/api/slice-it/songs/:id/cover` | `GET` | `app/routes/api/slice-it/songs/$id/cover.ts` |
| `/api/slice-it/songs/:id/import-chart` | `POST` | `app/routes/api/slice-it/songs/$id/import-chart.ts` |
| `/api/slice-it/songs/:id/like` | `POST` | `app/routes/api/slice-it/songs/$id/like.ts` |
| `/api/slice-it/songs/:id/patch-analysis` | `POST` | `app/routes/api/slice-it/songs/$id/patch-analysis.ts` |
| `/api/slice-it/songs/:id/play` | `POST` | `app/routes/api/slice-it/songs/$id/play.ts` |
| `/api/slice-it/songs/:id/regenerate` | `POST` | `app/routes/api/slice-it/songs/$id/regenerate.ts` |
| `/api/slice-it/songs/artist/:key` | `GET` | `app/routes/api/slice-it/songs/artist.$key.ts` |
| `/api/slice-it/songs/artists` | `GET` | `app/routes/api/slice-it/songs/artists.ts` |
| `/api/slice-it/songs/stream/:id` | `GET` | `app/routes/api/slice-it/songs/stream/$id.ts` |
| `/api/slice-it/songs/upload` | `POST` | `app/routes/api/slice-it/songs/upload.ts` |
| `/api/slice-it/uploader-stats` | `GET` | `app/routes/api/slice-it/uploader-stats.ts` |

## `/api/sohumtracker`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/sohumtracker/activity` | `GET` | `app/routes/api/sohumtracker/activity.ts` |
| `/api/sohumtracker/alert` | `GET` `POST` | `app/routes/api/sohumtracker/alert.ts` |
| `/api/sohumtracker/export` | `GET` | `app/routes/api/sohumtracker/export.ts` |
| `/api/sohumtracker/stream` | `GET` | `app/routes/api/sohumtracker/stream.ts` |

## `/api/spaces`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/spaces` | `GET` `POST` | `app/routes/api/spaces/index.ts` |
| `/api/spaces/:id` | `GET` | `app/routes/api/spaces/$id/index.ts` |
| `/api/spaces/:id/end` | `POST` | `app/routes/api/spaces/$id/end.ts` |
| `/api/spaces/:id/start` | `POST` | `app/routes/api/spaces/$id/start.ts` |
| `/api/spaces/live` | `GET` | `app/routes/api/spaces/live.ts` |

## `/api/speedrun`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/speedrun/categories` | `GET` `POST` | `app/routes/api/speedrun/categories.ts` |
| `/api/speedrun/leaderboard` | `GET` | `app/routes/api/speedrun/leaderboard.ts` |
| `/api/speedrun/replays` | `GET` | `app/routes/api/speedrun/replays.ts` |
| `/api/speedrun/runs` | `GET` `POST` | `app/routes/api/speedrun/runs.ts` |
| `/api/speedrun/verify` | `GET` `POST` | `app/routes/api/speedrun/verify.ts` |

## `/api/spotify`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/spotify/search` | `GET` | `app/routes/api/spotify/search.ts` |

## `/api/staking`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/staking` | `GET` | `app/routes/api/staking/index.ts` |
| `/api/staking/deposit` | `POST` | `app/routes/api/staking/deposit.ts` |
| `/api/staking/settings` | `POST` | `app/routes/api/staking/settings.ts` |
| `/api/staking/withdraw` | `POST` | `app/routes/api/staking/withdraw.ts` |

## `/api/stamps`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/stamps` | `GET` `POST` | `app/routes/api/stamps/index.ts` |
| `/api/stamps/:id` | `DELETE` | `app/routes/api/stamps/$id.ts` |
| `/api/stamps/:id/wall` | `DELETE` `POST` | `app/routes/api/stamps/$id/wall.ts` |
| `/api/stamps/image/:filename` | `GET` | `app/routes/api/stamps/image/$filename.ts` |
| `/api/stamps/mine` | `GET` | `app/routes/api/stamps/mine.ts` |

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

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/studio/challenges` | `GET` | `app/routes/api/studio/challenges/index.ts` |
| `/api/studio/challenges/:id` | `GET` | `app/routes/api/studio/challenges/$id/index.ts` |
| `/api/studio/challenges/:id/entry` | `POST` | `app/routes/api/studio/challenges/$id/entry.ts` |
| `/api/studio/challenges/:id/vote` | `POST` | `app/routes/api/studio/challenges/$id/vote.ts` |
| `/api/studio/challenges/audio` | `POST` | `app/routes/api/studio/challenges/audio/index.ts` |
| `/api/studio/challenges/audio/:filename` | `GET` | `app/routes/api/studio/challenges/audio/$filename.ts` |
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

## `/api/study-buddy`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/study-buddy` | `DELETE` `GET` `POST` | `app/routes/api/study-buddy/index.ts` |

## `/api/study-plans`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/study-plans` | `GET` `POST` | `app/routes/api/study-plans/index.ts` |
| `/api/study-plans/:id` | `DELETE` `PUT` | `app/routes/api/study-plans/$id.ts` |

## `/api/tags`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tags/:tag` | `GET` | `app/routes/api/tags/$tag.ts` |

## `/api/temple-of-joy`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/temple-of-joy/efficiency` | `GET` `POST` | `app/routes/api/temple-of-joy/efficiency.ts` |
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

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tournaments` | `GET` `POST` | `app/routes/api/tournaments/index.ts` |
| `/api/tournaments/:id` | `GET` | `app/routes/api/tournaments/$id.ts` |
| `/api/tournaments/:id/cancel` | `POST` | `app/routes/api/tournaments/$id/cancel.ts` |
| `/api/tournaments/:id/matches/:matchId/report` | `POST` | `app/routes/api/tournaments/$id/matches/$matchId/report.ts` |
| `/api/tournaments/:id/pickem` | `GET` `PUT` | `app/routes/api/tournaments/$id/pickem.ts` |
| `/api/tournaments/:id/register` | `POST` | `app/routes/api/tournaments/$id/register.ts` |
| `/api/tournaments/:id/start` | `POST` | `app/routes/api/tournaments/$id/start.ts` |
| `/api/tournaments/:id/withdraw` | `POST` | `app/routes/api/tournaments/$id/withdraw.ts` |

## `/api/translate`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/translate` | `GET` | `app/routes/api/translate/index.ts` |
| `/api/translate/suggest` | `POST` | `app/routes/api/translate/suggest/index.ts` |
| `/api/translate/vote` | `POST` | `app/routes/api/translate/vote/index.ts` |

## `/api/trash`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/trash` | `GET` | `app/routes/api/trash/index.ts` |
| `/api/trash/:kind/:id` | `DELETE` | `app/routes/api/trash/$kind/$id.ts` |
| `/api/trash/restore` | `POST` | `app/routes/api/trash/restore.ts` |

## `/api/unfurl`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/unfurl` | `GET` | `app/routes/api/unfurl.ts` |

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

29 routes.

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
| `/api/v1/slice-it/charts` | `GET` `OPTIONS` | `app/routes/api/v1/slice-it/charts.ts` |
| `/api/v1/slice-it/leaderboard` | `GET` `OPTIONS` | `app/routes/api/v1/slice-it/leaderboard.ts` |
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

## `/api/velum2099`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/velum2099/contracts` | `GET` `POST` | `app/routes/api/velum2099/contracts.ts` |

## `/api/versecraft`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/versecraft/chapter` | `POST` | `app/routes/api/versecraft/chapter.ts` |
| `/api/versecraft/outline` | `POST` | `app/routes/api/versecraft/outline.ts` |
| `/api/versecraft/progress` | `GET` | `app/routes/api/versecraft/progress.ts` |
| `/api/versecraft/save` | `GET` `POST` | `app/routes/api/versecraft/save.ts` |
| `/api/versecraft/seeds` | `GET` `POST` | `app/routes/api/versecraft/seeds/index.ts` |
| `/api/versecraft/seeds/fork` | `POST` | `app/routes/api/versecraft/seeds/fork.ts` |
| `/api/versecraft/seeds/rate` | `POST` | `app/routes/api/versecraft/seeds/rate.ts` |
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

## `/api/webrings`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/webrings` | `GET` `POST` | `app/routes/api/webrings/index.ts` |
| `/api/webrings/:slug` | `DELETE` `GET` | `app/routes/api/webrings/$slug.ts` |
| `/api/webrings/:slug/hop` | `GET` | `app/routes/api/webrings/$slug/hop.ts` |
| `/api/webrings/:slug/membership` | `DELETE` `POST` | `app/routes/api/webrings/$slug/membership.ts` |

## `/api/wheel`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wheel` | `GET` | `app/routes/api/wheel/index.ts` |
| `/api/wheel/spin` | `POST` | `app/routes/api/wheel/spin.ts` |

## `/api/when`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/when` | `GET` `POST` | `app/routes/api/when/index.ts` |
| `/api/when/:id` | `DELETE` `GET` | `app/routes/api/when/$id/index.ts` |
| `/api/when/:id/ics` | `GET` | `app/routes/api/when/$id/ics.ts` |
| `/api/when/:id/lock` | `POST` | `app/routes/api/when/$id/lock.ts` |
| `/api/when/:id/respond` | `PUT` | `app/routes/api/when/$id/respond.ts` |

## `/api/wishlist`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wishlist` | `DELETE` `GET` `POST` | `app/routes/api/wishlist/index.ts` |

## `/api/worlds`

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/worlds/festival` | `GET` | `app/routes/api/worlds/festival.ts` |
| `/api/worlds/garden-claim` | `POST` | `app/routes/api/worlds/garden-claim.ts` |
| `/api/worlds/postcards` | `POST` | `app/routes/api/worlds/postcards.ts` |
| `/api/worlds/snapshots` | `DELETE` `GET` `POST` | `app/routes/api/worlds/snapshots.ts` |
| `/api/worlds/visit/:code` | `GET` | `app/routes/api/worlds/visit.$code.ts` |
| `/api/worlds/visit/:code/postcard` | `POST` | `app/routes/api/worlds/visit.$code.postcard.ts` |
| `/api/worlds/visit/:code/water` | `POST` | `app/routes/api/worlds/visit.$code.water.ts` |

## `/api/wrapped`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wrapped` | `GET` | `app/routes/api/wrapped.ts` |

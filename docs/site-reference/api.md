<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes

Every server route in the app tier — 987 endpoints across 197 groups: 705 route files under `app/routes/api` and 282 registered modules that the one dispatcher route `app/routes/api/$.ts` serves (the Source column says which). This is the whole internal surface, not just the public developer API: the public, versioned, key-authenticated subset is `/api/v1/*`, documented in [the developer API reference](../developer-api/endpoints/index.md). Everything else is session-authenticated and internal — treat it as unstable.

Methods are read from each file's `server.handlers` block, or from the handlers a registered module passes to `apiRoute`. A route with no methods listed exports a handler built by a wrapper (for example the developer API `withDeveloperApi`).

## `/api/account`

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/account/delete` | `POST` | `app/routes/api/account/delete.ts` |
| `/api/account/export` | `GET` | `app/routes/api/account/export.ts` |
| `/api/account/recovery/codes` | `GET` `POST` | `lib/recovery/api/account.recovery.codes.server.ts` |
| `/api/account/recovery/complete` | `POST` | `lib/recovery/api/account.recovery.complete.server.ts` |
| `/api/account/recovery/contacts` | `GET` `POST` | `lib/recovery/api/account.recovery.contacts.server.ts` |
| `/api/account/recovery/contacts/:id` | `DELETE` `POST` | `lib/recovery/api/account.recovery.contacts.$id.server.ts` |
| `/api/account/recovery/hold` | `GET` | `lib/recovery/api/account.recovery.hold.server.ts` |
| `/api/account/recovery/requests` | `GET` `POST` | `lib/recovery/api/account.recovery.requests.server.ts` |
| `/api/account/recovery/requests/:id` | `DELETE` `POST` | `lib/recovery/api/account.recovery.requests.$id.server.ts` |
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

94 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/admin/albums` | `GET` `POST` | `lib/admin/api/admin.albums.server.ts` |
| `/api/admin/albums/:id` | `DELETE` `PATCH` | `lib/admin/api/admin.albums.$id.server.ts` |
| `/api/admin/albums/:id/reorder` | `POST` | `lib/admin/api/admin.albums.$id.reorder.server.ts` |
| `/api/admin/albums/:id/slides` | `POST` | `app/routes/api/admin/albums/$id/slides.ts` |
| `/api/admin/albums/:id/slides/:slideId` | `DELETE` | `lib/admin/api/admin.albums.$id.slides.$slideId.server.ts` |
| `/api/admin/albums/reorder` | `POST` | `app/routes/api/admin/albums/reorder.ts` |
| `/api/admin/analytics` | `GET` | `lib/admin/api/admin.analytics.server.ts` |
| `/api/admin/announcements` | `GET` `POST` | `lib/admin/api/admin.announcements.server.ts` |
| `/api/admin/announcements/:id` | `DELETE` `POST` | `lib/admin/api/admin.announcements.$id.server.ts` |
| `/api/admin/appeals` | `GET` | `lib/admin/api/admin.appeals.server.ts` |
| `/api/admin/appeals/:id` | `POST` | `lib/admin/api/admin.appeals.$id.server.ts` |
| `/api/admin/audit-log` | `GET` | `app/routes/api/admin/audit-log.ts` |
| `/api/admin/blog` | `DELETE` `POST` | `app/routes/api/admin/blog.ts` |
| `/api/admin/bots` | `GET` `PUT` | `lib/admin/api/admin.bots.server.ts` |
| `/api/admin/canvas` | `GET` `POST` | `app/routes/api/admin/canvas/index.ts` |
| `/api/admin/canvas/:id` | `DELETE` | `app/routes/api/admin/canvas/$id.ts` |
| `/api/admin/census` | `GET` `POST` | `lib/admin/api/admin.census.server.ts` |
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
| `/api/admin/economy` | `GET` | `lib/admin/api/admin.economy.server.ts` |
| `/api/admin/emoji-packs` | `GET` | `lib/admin/api/admin.emoji-packs.server.ts` |
| `/api/admin/emoji-packs/:id` | `POST` | `lib/admin/api/admin.emoji-packs.$id.server.ts` |
| `/api/admin/flags` | `DELETE` `GET` `PUT` | `lib/admin/api/admin.flags.server.ts` |
| `/api/admin/forecasting/seasons` | `POST` | `lib/admin/api/admin.forecasting.seasons.server.ts` |
| `/api/admin/gift-exchanges/:id/verify` | `GET` | `app/routes/api/admin/gift-exchanges/$id/verify.ts` |
| `/api/admin/insights/cohorts` | `GET` `POST` | `app/routes/api/admin/insights/cohorts.ts` |
| `/api/admin/insights/errors` | `GET` `PATCH` | `app/routes/api/admin/insights/errors.ts` |
| `/api/admin/insights/experiments` | `GET` `PATCH` `POST` | `app/routes/api/admin/insights/experiments.ts` |
| `/api/admin/insights/notices` | `DELETE` `GET` `POST` | `app/routes/api/admin/insights/notices.ts` |
| `/api/admin/insights/routes` | `GET` | `app/routes/api/admin/insights/routes.ts` |
| `/api/admin/library` | `GET` | `lib/library/api/admin.library.server.ts` |
| `/api/admin/library/:id` | `DELETE` `PATCH` | `lib/library/api/admin.library.$id.server.ts` |
| `/api/admin/library/migrate` | `POST` | `lib/library/api/admin.library.migrate.server.ts` |
| `/api/admin/library/quota-requests` | `GET` `POST` | `lib/library/api/admin.library.quota-requests.server.ts` |
| `/api/admin/library/reorder` | `POST` | `lib/library/api/admin.library.reorder.server.ts` |
| `/api/admin/library/storage-health` | `GET` | `lib/library/api/admin.library.storage-health.server.ts` |
| `/api/admin/link-rules` | `DELETE` `GET` `POST` | `lib/admin/api/admin.link-rules.server.ts` |
| `/api/admin/market` | `GET` | `lib/admin/api/admin.market.server.ts` |
| `/api/admin/market/:id` | `POST` | `lib/admin/api/admin.market.$id.server.ts` |
| `/api/admin/mod-macros` | `DELETE` `GET` `POST` | `app/routes/api/admin/mod-macros.ts` |
| `/api/admin/oncall` | `GET` | `lib/admin/api/admin.oncall.server.ts` |
| `/api/admin/oncall-rules` | `GET` `PATCH` | `lib/admin/api/admin.oncall-rules.server.ts` |
| `/api/admin/oncall-series` | `GET` | `lib/admin/api/admin.oncall-series.server.ts` |
| `/api/admin/perf` | `GET` | `app/routes/api/admin/perf/index.ts` |
| `/api/admin/perf/db` | `GET` | `app/routes/api/admin/perf/db.ts` |
| `/api/admin/perf/heap` | `GET` | `app/routes/api/admin/perf/heap.ts` |
| `/api/admin/perf/profile` | `POST` | `app/routes/api/admin/perf/profile.ts` |
| `/api/admin/predictions` | `GET` | `lib/predictions/api/admin.predictions.server.ts` |
| `/api/admin/predictions/:id/moderate` | `POST` | `lib/predictions/api/admin.predictions.$id.moderate.server.ts` |
| `/api/admin/predictions/:id/resolve` | `POST` | `lib/predictions/api/admin.predictions.$id.resolve.server.ts` |
| `/api/admin/qotd` | `GET` `POST` | `lib/admin/api/admin.qotd.server.ts` |
| `/api/admin/qotd/:id` | `DELETE` | `lib/admin/api/admin.qotd.$id.server.ts` |
| `/api/admin/reading/glossary` | `GET` `POST` | `app/routes/api/admin/reading/glossary/index.ts` |
| `/api/admin/reading/glossary/:id` | `DELETE` `PATCH` | `app/routes/api/admin/reading/glossary/$id.ts` |
| `/api/admin/reading/stories` | `GET` `POST` | `app/routes/api/admin/reading/stories/index.ts` |
| `/api/admin/reading/stories/:id` | `DELETE` `PATCH` | `app/routes/api/admin/reading/stories/$id/index.ts` |
| `/api/admin/reading/stories/:id/articles` | `DELETE` `POST` | `app/routes/api/admin/reading/stories/$id/articles.ts` |
| `/api/admin/reading/stories/:id/suggest` | `GET` | `app/routes/api/admin/reading/stories/$id/suggest.ts` |
| `/api/admin/redemptions` | `GET` | `lib/admin/api/admin.redemptions.server.ts` |
| `/api/admin/redemptions/:id` | `POST` | `lib/admin/api/admin.redemptions.$id.server.ts` |
| `/api/admin/release-notes` | `GET` `POST` | `app/routes/api/admin/release-notes/index.ts` |
| `/api/admin/release-notes/:id` | `DELETE` `PATCH` | `app/routes/api/admin/release-notes/$id.ts` |
| `/api/admin/release-notes/draft` | `POST` | `app/routes/api/admin/release-notes/draft.ts` |
| `/api/admin/reports` | `GET` | `lib/admin/api/admin.reports.server.ts` |
| `/api/admin/reports/:id` | `POST` | `lib/admin/api/admin.reports.$id.server.ts` |
| `/api/admin/review-counts` | `GET` | `lib/admin/api/admin.review-counts.server.ts` |
| `/api/admin/rideshare/applications` | `GET` `PATCH` | `lib/rideshare/api/admin.rideshare.applications.server.ts` |
| `/api/admin/rideshare/rides` | `GET` | `lib/rideshare/api/admin.rideshare.rides.server.ts` |
| `/api/admin/studio-challenges` | `POST` | `app/routes/api/admin/studio-challenges/index.ts` |
| `/api/admin/studio-challenges/upload` | `POST` | `lib/creator/api/admin.studio-challenges.upload.server.ts` |
| `/api/admin/users` | `GET` `PATCH` | `app/routes/api/admin/users.ts` |
| `/api/admin/users/:id/ban` | `POST` | `lib/admin/api/admin.users.$id.ban.server.ts` |
| `/api/admin/users/:id/grant-membership` | `POST` | `lib/admin/api/admin.users.$id.grant-membership.server.ts` |
| `/api/admin/users/:id/set-coins` | `POST` | `lib/admin/api/admin.users.$id.set-coins.server.ts` |
| `/api/admin/users/:id/strike` | `POST` | `lib/admin/api/admin.users.$id.strike.server.ts` |
| `/api/admin/vibe/backfill-thumbs` | `POST` | `lib/rmhvibe/api/admin.vibe.backfill-thumbs.server.ts` |
| `/api/admin/view-as` | `GET` | `lib/admin/api/admin.view-as.server.ts` |
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
| `/api/ai/ask-feed` | `POST` | `lib/feed/api/ai.ask-feed.server.ts` |
| `/api/ai/bio` | `POST` | `app/routes/api/ai/bio.ts` |
| `/api/ai/catch-up` | `POST` | `app/routes/api/ai/catch-up.ts` |
| `/api/ai/explain-metric` | `POST` | `app/routes/api/ai/explain-metric.ts` |
| `/api/ai/message-suggest` | `POST` | `app/routes/api/ai/message-suggest.ts` |
| `/api/ai/nl-query` | `POST` | `app/routes/api/ai/nl-query.ts` |
| `/api/ai/search` | `POST` | `lib/feed/api/ai.search.server.ts` |
| `/api/ai/smart-replies` | `POST` | `app/routes/api/ai/smart-replies.ts` |
| `/api/ai/suggest-tags` | `POST` | `app/routes/api/ai/suggest-tags.ts` |
| `/api/ai/takeaways` | `GET` | `lib/ai/api/ai.takeaways.server.ts` |
| `/api/ai/transform` | `POST` | `app/routes/api/ai/transform.ts` |

## `/api/albums`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/albums/asset/*` | `GET` | `app/routes/api/albums/asset/$.ts` |

## `/api/altair`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/altair/heat` | `GET` | `features/altair/api/altair.heat.server.ts` |
| `/api/altair/leaderboard` | `GET` | `features/altair/api/altair.leaderboard.server.ts` |
| `/api/altair/match` | `POST` | `app/routes/api/altair/match.ts` |
| `/api/altair/meta` | `GET` `POST` | `app/routes/api/altair/meta.ts` |
| `/api/altair/run/finish` | `POST` | `app/routes/api/altair/run/finish.ts` |
| `/api/altair/run/start` | `POST` | `features/altair/api/altair.run.start.server.ts` |
| `/api/altair/run/status` | `GET` | `features/altair/api/altair.run.status.server.ts` |
| `/api/altair/score` | `POST` | `app/routes/api/altair/score.ts` |

## `/api/announcements`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/announcements` | `GET` | `lib/api/routes/announcements.server.ts` |
| `/api/announcements/:id/vote` | `POST` | `app/routes/api/announcements/$id/vote.ts` |

## `/api/arcade`

12 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/arcade` | `GET` | `app/routes/api/arcade/index.ts` |
| `/api/arcade/backlog` | `DELETE` `GET` `PUT` | `lib/arcade/api/arcade.backlog.server.ts` |
| `/api/arcade/basket` | `GET` | `app/routes/api/arcade/basket/index.ts` |
| `/api/arcade/basket/finish` | `POST` | `app/routes/api/arcade/basket/finish.ts` |
| `/api/arcade/basket/start` | `POST` | `app/routes/api/arcade/basket/start.ts` |
| `/api/arcade/claim` | `POST` | `app/routes/api/arcade/claim.ts` |
| `/api/arcade/daily` | `GET` | `lib/arcade/api/arcade.daily.server.ts` |
| `/api/arcade/daily/start` | `POST` | `app/routes/api/arcade/daily/start.ts` |
| `/api/arcade/patch-notes` | `GET` `POST` | `lib/arcade/api/arcade.patch-notes.server.ts` |
| `/api/arcade/rival` | `GET` | `lib/arcade/api/arcade.rival.server.ts` |
| `/api/arcade/runs` | `GET` `POST` | `app/routes/api/arcade/runs.ts` |
| `/api/arcade/tips` | `GET` `POST` `PUT` | `lib/arcade/api/arcade.tips.server.ts` |

## `/api/assistant`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/assistant` | `POST` | `lib/assistant/api/assistant.server.ts` |

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
| `/api/battlepass/claim` | `POST` | `lib/battlepass/api/battlepass.claim.server.ts` |
| `/api/battlepass/unlock` | `POST` | `lib/battlepass/api/battlepass.unlock.server.ts` |

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

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calls/answer` | `GET` `PUT` | `lib/call/api/calls.answer.server.ts` |
| `/api/calls/history` | `GET` | `app/routes/api/calls/history.ts` |
| `/api/calls/ice` | `GET` | `lib/call/api/calls.ice.server.ts` |
| `/api/calls/mute` | `DELETE` `GET` `POST` | `app/routes/api/calls/mute.ts` |
| `/api/calls/privacy` | `GET` `PUT` | `lib/call/api/calls.privacy.server.ts` |

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
| `/api/casino/rooms` | `GET` | `lib/api/routes/casino.rooms.server.ts` |

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
| `/api/chats/:kind/:id/checklist` | `POST` `PUT` | `lib/chat-plus/api/chats.$kind.$id.checklist.server.ts` |
| `/api/chats/:kind/:id/command` | `POST` | `lib/chat-plus/api/chats.$kind.$id.command.server.ts` |
| `/api/chats/:kind/:id/media` | `GET` | `app/routes/api/chats/$kind/$id/media.ts` |
| `/api/chats/:kind/:id/meta` | `GET` | `lib/chat-plus/api/chats.$kind.$id.meta.server.ts` |
| `/api/chats/:kind/:id/pin` | `POST` | `lib/chat-plus/api/chats.$kind.$id.pin.server.ts` |
| `/api/chats/:kind/:id/settings` | `PATCH` `PUT` | `app/routes/api/chats/$kind/$id/settings.ts` |
| `/api/chats/:kind/:id/thread/:messageId` | `GET` `POST` | `app/routes/api/chats/$kind/$id/thread/$messageId.ts` |
| `/api/chats/:kind/:id/vote` | `POST` | `lib/chat-plus/api/chats.$kind.$id.vote.server.ts` |
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
| `/api/coins/bet` | `POST` | `lib/api/routes/coins.bet.server.ts` |
| `/api/coins/claim` | `POST` | `lib/api/routes/coins.claim.server.ts` |
| `/api/coins/gift` | `POST` | `lib/gifting/api/coins.gift.server.ts` |
| `/api/coins/purchase` | `POST` | `app/routes/api/coins/purchase.ts` |
| `/api/coins/statement` | `GET` | `app/routes/api/coins/statement.ts` |
| `/api/coins/tip` | `POST` | `lib/economy/api/coins.tip.server.ts` |

## `/api/comments`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/comments/:commentId/react` | `POST` | `lib/social/api/comments.$commentId.react.server.ts` |
| `/api/comments/:commentId/translate` | `GET` | `app/routes/api/comments/$commentId/translate.ts` |

## `/api/communities`

33 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/communities` | `GET` `POST` | `lib/communities/api/communities.server.ts` |
| `/api/communities/:slug` | `GET` | `lib/communities/api/communities.$slug.server.ts` |
| `/api/communities/:slug/announcements` | `GET` `POST` | `lib/communities/api/communities.$slug.announcements.server.ts` |
| `/api/communities/:slug/announcements/:id` | `DELETE` | `lib/communities/api/communities.$slug.announcements.$id.server.ts` |
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
| `/api/communities/:slug/feed` | `GET` | `lib/communities/api/communities.$slug.feed.server.ts` |
| `/api/communities/:slug/flair-follows` | `PUT` | `app/routes/api/communities/$slug/flair-follows.ts` |
| `/api/communities/:slug/flairs` | `POST` | `app/routes/api/communities/$slug/flairs.ts` |
| `/api/communities/:slug/flairs/:flairId` | `DELETE` `PATCH` | `app/routes/api/communities/$slug/flairs/$flairId.ts` |
| `/api/communities/:slug/invites` | `GET` `POST` | `app/routes/api/communities/$slug/invites.ts` |
| `/api/communities/:slug/invites/:id` | `DELETE` | `app/routes/api/communities/$slug/invites/$id.ts` |
| `/api/communities/:slug/join` | `POST` | `lib/communities/api/communities.$slug.join.server.ts` |
| `/api/communities/:slug/join-request` | `DELETE` `POST` | `app/routes/api/communities/$slug/join-request.ts` |
| `/api/communities/:slug/join-requests` | `GET` | `app/routes/api/communities/$slug/join-requests.ts` |
| `/api/communities/:slug/join-requests/:id` | `POST` | `app/routes/api/communities/$slug/join-requests/$id.ts` |
| `/api/communities/:slug/macros` | `DELETE` `GET` `POST` | `app/routes/api/communities/$slug/macros.ts` |
| `/api/communities/:slug/members` | `GET` | `lib/communities/api/communities.$slug.members.server.ts` |
| `/api/communities/:slug/members/:userId` | `DELETE` `PATCH` | `lib/communities/api/communities.$slug.members.$userId.server.ts` |
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
| `/api/connections/grids` | `GET` `POST` | `lib/party/api/connections.grids.server.ts` |
| `/api/connections/grids/:id` | `DELETE` `GET` | `lib/party/api/connections.grids.$id.server.ts` |
| `/api/connections/grids/:id/guess` | `POST` | `lib/party/api/connections.grids.$id.guess.server.ts` |
| `/api/connections/grids/:id/rate` | `POST` | `lib/party/api/connections.grids.$id.rate.server.ts` |
| `/api/connections/grids/:id/schedule` | `POST` | `lib/party/api/connections.grids.$id.schedule.server.ts` |

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
| `/api/creators/:id/join` | `POST` | `lib/creator/api/creators.$id.join.server.ts` |

## `/api/csgo-game`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/csgo-game/assets/*` | `GET` | `app/routes/api/csgo-game/assets/$.ts` |

## `/api/csp-report`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/csp-report` | `POST` | `app/routes/api/csp-report.ts` |

## `/api/daily-puzzles`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/daily-puzzles/leaderboard` | `GET` | `lib/daily-puzzles/api/daily-puzzles.leaderboard.server.ts` |
| `/api/daily-puzzles/puzzle` | `GET` | `lib/daily-puzzles/api/daily-puzzles.puzzle.server.ts` |
| `/api/daily-puzzles/results` | `GET` | `app/routes/api/daily-puzzles/results.ts` |
| `/api/daily-puzzles/score` | `POST` | `lib/daily-puzzles/api/daily-puzzles.score.server.ts` |

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
| `/api/developer/keys` | `GET` `POST` | `lib/devplatform/api/developer.keys.server.ts` |
| `/api/developer/keys/:id` | `DELETE` `PATCH` | `lib/devplatform/api/developer.keys.$id.server.ts` |
| `/api/developer/keys/:id/usage` | `GET` | `lib/devplatform/api/developer.keys.$id.usage.server.ts` |

## `/api/discord`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/discord/activity-image` | `GET` | `app/routes/api/discord/activity-image.ts` |
| `/api/discord/daily-progress` | `GET` `POST` | `app/routes/api/discord/daily-progress.ts` |
| `/api/discord/embed` | `GET` `POST` | `app/routes/api/discord/embed.ts` |
| `/api/discord/race` | `GET` `POST` | `app/routes/api/discord/race.ts` |
| `/api/discord/sync-score` | `POST` | `app/routes/api/discord/sync-score.ts` |
| `/api/discord/token` | `POST` | `lib/api/routes/discord.token.server.ts` |

## `/api/discovery`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/discovery/alerts` | `DELETE` `GET` `POST` | `lib/discovery/api/discovery.alerts.server.ts` |
| `/api/discovery/memories` | `GET` `PUT` | `lib/discovery/api/discovery.memories.server.ts` |
| `/api/discovery/surprise` | `GET` | `lib/discovery/api/discovery.surprise.server.ts` |
| `/api/discovery/today` | `GET` | `app/routes/api/discovery/today.ts` |
| `/api/discovery/trending/:tag` | `GET` | `app/routes/api/discovery/trending/$tag.ts` |
| `/api/discovery/watch` | `GET` `PUT` | `lib/discovery/api/discovery.watch.server.ts` |

## `/api/doctrine`

17 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/doctrine/admin/disclosures` | `PATCH` `POST` | `app/routes/api/doctrine/admin/disclosures.ts` |
| `/api/doctrine/admin/incidents` | `PATCH` | `app/routes/api/doctrine/admin/incidents.ts` |
| `/api/doctrine/admin/tiers` | `POST` | `app/routes/api/doctrine/admin/tiers.ts` |
| `/api/doctrine/incidents` | `GET` `POST` | `app/routes/api/doctrine/incidents/index.ts` |
| `/api/doctrine/incidents/:id` | `GET` | `app/routes/api/doctrine/incidents/$id.ts` |
| `/api/doctrine/puzzles/leaderboard` | `GET` | `features/doctrine/api/doctrine.puzzles.leaderboard.server.ts` |
| `/api/doctrine/puzzles/replay` | `GET` `POST` | `app/routes/api/doctrine/puzzles/replay.ts` |
| `/api/doctrine/puzzles/submit` | `POST` | `app/routes/api/doctrine/puzzles/submit.ts` |
| `/api/doctrine/puzzles/today` | `GET` | `features/doctrine/api/doctrine.puzzles.today.server.ts` |
| `/api/doctrine/reactions` | `POST` | `app/routes/api/doctrine/reactions.ts` |
| `/api/doctrine/recruitment/create` | `POST` | `app/routes/api/doctrine/recruitment/create.ts` |
| `/api/doctrine/recruitment/redeem` | `POST` | `app/routes/api/doctrine/recruitment/redeem.ts` |
| `/api/doctrine/reputation` | `GET` | `features/doctrine/api/doctrine.reputation.server.ts` |
| `/api/doctrine/reputation/leaderboard` | `GET` | `features/doctrine/api/doctrine.reputation.leaderboard.server.ts` |
| `/api/doctrine/safehouse/content` | `GET` | `features/doctrine/api/doctrine.safehouse.content.server.ts` |
| `/api/doctrine/safehouse/disclosures` | `GET` | `features/doctrine/api/doctrine.safehouse.disclosures.server.ts` |
| `/api/doctrine/sahur/status` | `GET` | `features/doctrine/api/doctrine.sahur.status.server.ts` |

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
| `/api/dunesday/ask` | `POST` | `lib/dunesday/api/dunesday.ask.server.ts` |
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

## `/api/elections`

23 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/elections` | `GET` | `lib/elections/api/elections.server.ts` |
| `/api/elections/ask` | `POST` | `lib/elections/api/elections.ask.server.ts` |
| `/api/elections/calendar` | `GET` | `lib/elections/api/elections.calendar.server.ts` |
| `/api/elections/chat` | `DELETE` `POST` | `lib/elections/api/elections.chat.server.ts` |
| `/api/elections/chat/react` | `POST` | `lib/elections/api/elections.chat.react.server.ts` |
| `/api/elections/chat/stream` | `GET` | `app/routes/api/elections/chat/stream.ts` |
| `/api/elections/events` | `GET` | `app/routes/api/elections/events/index.ts` |
| `/api/elections/events/stream` | `GET` | `app/routes/api/elections/events/stream.ts` |
| `/api/elections/history` | `GET` | `lib/elections/api/elections.history.server.ts` |
| `/api/elections/leagues` | `GET` `POST` | `app/routes/api/elections/leagues/index.ts` |
| `/api/elections/leagues/:code` | `DELETE` `GET` `POST` | `app/routes/api/elections/leagues/$code.ts` |
| `/api/elections/leagues/:code/picks` | `PUT` | `app/routes/api/elections/leagues/$code.picks.ts` |
| `/api/elections/markets` | `GET` | `lib/elections/api/elections.markets.server.ts` |
| `/api/elections/measures` | `GET` | `lib/elections/api/elections.measures.server.ts` |
| `/api/elections/news` | `GET` | `lib/elections/api/elections.news.server.ts` |
| `/api/elections/offices` | `GET` | `lib/elections/api/elections.offices.server.ts` |
| `/api/elections/public` | `GET` | `app/routes/api/elections/public.ts` |
| `/api/elections/races.csv` | `GET` | `app/routes/api/elections/races[.]csv.ts` |
| `/api/elections/rooms` | `GET` `POST` | `lib/elections/api/elections.rooms.server.ts` |
| `/api/elections/rooms/:code` | `DELETE` `GET` `PATCH` | `lib/elections/api/elections.rooms.$code.server.ts` |
| `/api/elections/streams` | `GET` | `lib/elections/api/elections.streams.server.ts` |
| `/api/elections/summary` | `GET` | `lib/elections/api/elections.summary.server.ts` |
| `/api/elections/swing` | `GET` | `lib/elections/api/elections.swing.server.ts` |

## `/api/email`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/email/unsubscribe` | `GET` `POST` | `app/routes/api/email/unsubscribe.ts` |

## `/api/embed`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/embed/oembed` | `GET` | `app/routes/api/embed/oembed.ts` |

## `/api/emoji-packs`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/emoji-packs` | `GET` `POST` | `lib/emoji/api/emoji-packs.server.ts` |
| `/api/emoji-packs/:slug` | `GET` | `app/routes/api/emoji-packs/$slug/index.ts` |
| `/api/emoji-packs/:slug/items` | `DELETE` `POST` | `app/routes/api/emoji-packs/$slug/items.ts` |
| `/api/emoji-packs/:slug/subscribe` | `DELETE` `POST` | `lib/emoji/api/emoji-packs.$slug.subscribe.server.ts` |
| `/api/emoji-packs/:slug/upload` | `POST` | `lib/emoji/api/emoji-packs.$slug.upload.server.ts` |
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
| `/api/explore` | `GET` | `lib/discovery/api/explore.server.ts` |

## `/api/feed`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feed/hashtag-search` | `GET` | `app/routes/api/feed/hashtag-search.ts` |
| `/api/feed/image/:filename` | `GET` | `app/routes/api/feed/image/$filename.ts` |
| `/api/feed/mention-search` | `GET` | `lib/feed/api/feed.mention-search.server.ts` |
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

## `/api/flags`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/flags` | `GET` | `app/routes/api/flags.ts` |

## `/api/forecasting`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/forecasting/calibration` | `GET` | `app/routes/api/forecasting/calibration.ts` |
| `/api/forecasting/seasons` | `GET` | `app/routes/api/forecasting/seasons.ts` |

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
| `/api/game-night` | `GET` `PATCH` `POST` | `lib/competitive/api/game-night.server.ts` |

## `/api/game-saves`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/game-saves/:gameId` | `DELETE` `GET` `POST` | `app/routes/api/game-saves/$gameId.ts` |

## `/api/games`

33 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/games/:id/guides` | `GET` | `app/routes/api/games/$id.guides.ts` |
| `/api/games/:id/leaderboard` | `GET` | `lib/game/api/games.$id.leaderboard.server.ts` |
| `/api/games/:id/review` | `DELETE` `PUT` | `app/routes/api/games/$id.review.ts` |
| `/api/games/:id/reviews` | `GET` | `app/routes/api/games/$id.reviews.ts` |
| `/api/games/:id/score` | `POST` | `lib/game/api/games.$id.score.server.ts` |
| `/api/games/cards/craft` | `POST` | `lib/cards/api/games.cards.craft.server.ts` |
| `/api/games/collections/delete` | `POST` | `app/routes/api/games/collections/delete.ts` |
| `/api/games/collections/import` | `POST` | `app/routes/api/games/collections/import.ts` |
| `/api/games/collections/item` | `POST` | `app/routes/api/games/collections/item.ts` |
| `/api/games/collections/rename` | `POST` | `app/routes/api/games/collections/rename.ts` |
| `/api/games/customize` | `POST` | `lib/cards/api/games.customize.server.ts` |
| `/api/games/gems/buy` | `POST` | `app/routes/api/games/gems/buy.ts` |
| `/api/games/gems/pack` | `POST` | `app/routes/api/games/gems/pack.ts` |
| `/api/games/gems/unpack` | `POST` | `lib/cards/api/games.gems.unpack.server.ts` |
| `/api/games/how-to-play` | `POST` | `lib/devplatform/api/games.how-to-play.server.ts` |
| `/api/games/hub/delete` | `POST` | `app/routes/api/games/hub/delete.ts` |
| `/api/games/hub/moderate` | `POST` | `app/routes/api/games/hub/moderate.ts` |
| `/api/games/hub/post` | `POST` | `app/routes/api/games/hub/post.ts` |
| `/api/games/hub/thread` | `POST` | `lib/cards/api/games.hub.thread.server.ts` |
| `/api/games/market/buy` | `POST` | `app/routes/api/games/market/buy.ts` |
| `/api/games/market/cancel` | `POST` | `app/routes/api/games/market/cancel.ts` |
| `/api/games/market/list` | `POST` | `lib/cards/api/games.market.list.server.ts` |
| `/api/games/market/order` | `POST` | `app/routes/api/games/market/order.ts` |
| `/api/games/market/order-cancel` | `POST` | `app/routes/api/games/market/order-cancel.ts` |
| `/api/games/playtime` | `POST` | `lib/playtime/api/games.playtime.server.ts` |
| `/api/games/showcase` | `POST` | `lib/cards/api/games.showcase.server.ts` |
| `/api/games/synapse-storm/leaderboard` | `GET` | `app/routes/api/games/synapse-storm/leaderboard.ts` |
| `/api/games/synapse-storm/save` | `GET` | `features/synapse-storm/api/games.synapse-storm.save.server.ts` |
| `/api/games/synapse-storm/score` | `POST` | `lib/game/api/games.synapse-storm.score.server.ts` |
| `/api/games/trades/accept` | `POST` | `lib/cards/api/games.trades.accept.server.ts` |
| `/api/games/trades/cancel` | `POST` | `lib/cards/api/games.trades.cancel.server.ts` |
| `/api/games/trades/decline` | `POST` | `lib/cards/api/games.trades.decline.server.ts` |
| `/api/games/trades/propose` | `POST` | `lib/cards/api/games.trades.propose.server.ts` |

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
| `/api/gift-sub` | `GET` `POST` | `lib/gifting/api/gift-sub.server.ts` |

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
| `/api/group-chats/:id` | `GET` | `lib/group-chat/api/group-chats.$id.server.ts` |
| `/api/group-chats/:id/leave` | `POST` | `app/routes/api/group-chats/$id/leave.ts` |
| `/api/group-chats/:id/messages` | `GET` `POST` | `lib/group-chat/api/group-chats.$id.messages.server.ts` |
| `/api/group-chats/:id/messages/:messageId/vote` | `POST` | `app/routes/api/group-chats/$id/messages/$messageId/vote.ts` |
| `/api/group-chats/:id/react` | `POST` | `app/routes/api/group-chats/$id/react.ts` |
| `/api/group-chats/:id/stream` | `GET` | `app/routes/api/group-chats/$id/stream.ts` |

## `/api/groupcalls`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/groupcalls/active` | `GET` | `app/routes/api/groupcalls/active.ts` |
| `/api/groupcalls/history` | `GET` | `app/routes/api/groupcalls/history.ts` |
| `/api/groupcalls/invitable` | `GET` | `app/routes/api/groupcalls/invitable.ts` |

## `/api/guides`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/guides` | `POST` | `lib/games/api/guides.server.ts` |
| `/api/guides/:id` | `DELETE` `GET` `PUT` | `app/routes/api/guides/$id.ts` |
| `/api/guides/:id/publish` | `POST` | `lib/games/api/guides.$id.publish.server.ts` |

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
| `/api/history` | `DELETE` `GET` `PUT` | `lib/shop/api/history.server.ts` |
| `/api/history/:id` | `DELETE` | `lib/shop/api/history.$id.server.ts` |
| `/api/history/beat` | `POST` | `lib/history/api/history.beat.server.ts` |
| `/api/history/position` | `GET` `POST` | `app/routes/api/history/position.ts` |
| `/api/history/resume` | `GET` | `app/routes/api/history/resume.ts` |

## `/api/hl2-game`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/hl2-game/assets/*` | `GET` | `app/routes/api/hl2-game/assets/$.ts` |

## `/api/homes`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/homes/ai-image` | `GET` `POST` | `lib/homes/api/homes.ai-image.server.ts` |
| `/api/homes/geocode` | `GET` | `lib/homes/api/homes.geocode.server.ts` |
| `/api/homes/listings` | `GET` `POST` | `app/routes/api/homes/listings.ts` |
| `/api/homes/listings/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/homes/listings.$id.ts` |
| `/api/homes/listings/:id/favorite` | `DELETE` `POST` | `lib/homes/api/homes.listings.$id.favorite.server.ts` |
| `/api/homes/listings/:id/roommate` | `GET` | `app/routes/api/homes/listings.$id.roommate.ts` |
| `/api/homes/roommate` | `GET` `PUT` | `app/routes/api/homes/roommate.ts` |
| `/api/homes/watches` | `DELETE` `GET` `PATCH` `POST` | `lib/homes/api/homes.watches.server.ts` |

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

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/internal/call-auto-reply` | `POST` | `app/routes/api/internal/call-auto-reply.ts` |
| `/api/internal/match-result` | `POST` | `app/routes/api/internal/match-result.ts` |
| `/api/internal/notify-message` | `POST` | `app/routes/api/internal/notify-message.ts` |
| `/api/internal/notify-typing` | `POST` | `app/routes/api/internal/notify-typing.ts` |
| `/api/internal/ops/deploy-event` | `POST` | `app/routes/api/internal/ops/deploy-event.ts` |
| `/api/internal/ops/post-deploy-health` | `GET` | `app/routes/api/internal/ops/post-deploy-health.ts` |
| `/api/internal/predictions-tick` | `POST` | `app/routes/api/internal/predictions-tick.ts` |
| `/api/internal/streak-push` | `POST` | `app/routes/api/internal/streak-push.ts` |

## `/api/jams`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/jams` | `GET` `POST` | `lib/competitive/api/jams.server.ts` |
| `/api/jams/:slug` | `GET` | `lib/competitive/api/jams.$slug.server.ts` |
| `/api/jams/:slug/entry` | `POST` | `lib/competitive/api/jams.$slug.entry.server.ts` |
| `/api/jams/:slug/rate` | `POST` | `lib/competitive/api/jams.$slug.rate.server.ts` |

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
| `/api/laundry-sort/score` | `POST` | `features/laundry-sort/api/laundry-sort.score.server.ts` |

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
| `/api/library/collection/:id/cover` | `POST` | `lib/library/api/library.collection.$id.cover.server.ts` |
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
| `/api/lists` | `GET` `POST` | `lib/lists/api/lists.server.ts` |
| `/api/lists/:id` | `DELETE` `GET` `PATCH` | `lib/lists/api/lists.$id.server.ts` |
| `/api/lists/:id/feed` | `GET` | `lib/lists/api/lists.$id.feed.server.ts` |
| `/api/lists/:id/members` | `DELETE` `PUT` | `lib/lists/api/lists.$id.members.server.ts` |

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
| `/api/market/listings/:id` | `DELETE` | `lib/market/api/market.listings.$id.server.ts` |
| `/api/market/listings/:id/buy` | `POST` | `lib/market/api/market.listings.$id.buy.server.ts` |

## `/api/memory`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/memory` | `DELETE` `GET` `POST` | `app/routes/api/memory/index.ts` |

## `/api/messages`

18 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/messages` | `GET` `POST` | `lib/messages/api/messages.server.ts` |
| `/api/messages/:conversationId` | `GET` `POST` | `app/routes/api/messages/$conversationId.ts` |
| `/api/messages/:conversationId/edit` | `POST` | `lib/messages/api/messages.$conversationId.edit.server.ts` |
| `/api/messages/:conversationId/hide` | `POST` | `lib/messages/api/messages.$conversationId.hide.server.ts` |
| `/api/messages/:conversationId/mutations` | `GET` | `lib/messages/api/messages.$conversationId.mutations.server.ts` |
| `/api/messages/:conversationId/react` | `POST` | `lib/messages/api/messages.$conversationId.react.server.ts` |
| `/api/messages/:conversationId/read` | `POST` | `lib/messages/api/messages.$conversationId.read.server.ts` |
| `/api/messages/:conversationId/thread` | `GET` | `lib/messages/api/messages.$conversationId.thread.server.ts` |
| `/api/messages/:conversationId/typing` | `POST` | `lib/messages/api/messages.$conversationId.typing.server.ts` |
| `/api/messages/:conversationId/unsend` | `POST` | `lib/messages/api/messages.$conversationId.unsend.server.ts` |
| `/api/messages/:conversationId/voice` | `POST` | `lib/messages/api/messages.$conversationId.voice.server.ts` |
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
| `/api/moderation/block` | `GET` `POST` | `lib/moderation/api/moderation.block.server.ts` |
| `/api/moderation/mute` | `GET` `POST` | `app/routes/api/moderation/mute.ts` |
| `/api/moderation/report` | `POST` | `app/routes/api/moderation/report.ts` |

## `/api/moments`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/moments` | `POST` | `lib/api/routes/moments.server.ts` |

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
| `/api/neon-driftway/score` | `POST` | `lib/game/api/neon-driftway.score.server.ts` |

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
| `/api/nightrail/tricks` | `GET` `POST` | `lib/trick-week/api/nightrail.tricks.server.ts` |
| `/api/nightrail/tricks/vote` | `POST` | `lib/trick-week/api/nightrail.tricks.vote.server.ts` |

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
| `/api/notifications` | `GET` | `lib/preferences/api/notifications.server.ts` |
| `/api/notifications/preferences` | `GET` `PUT` | `lib/preferences/api/notifications.preferences.server.ts` |
| `/api/notifications/read` | `POST` | `lib/preferences/api/notifications.read.server.ts` |

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

16 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/og/album/:albumId` | `GET` | `app/routes/api/og/album/$albumId.ts` |
| `/api/og/app/:appId` | `GET` | `app/routes/api/og/app/$appId.ts` |
| `/api/og/blog/:slug` | `GET` | `app/routes/api/og/blog/$slug.ts` |
| `/api/og/build/:slug` | `GET` | `app/routes/api/og/build/$slug.ts` |
| `/api/og/elections` | `GET` | `app/routes/api/og/elections.ts` |
| `/api/og/game/:gameId` | `GET` | `app/routes/api/og/game/$gameId.ts` |
| `/api/og/job/:jobId` | `GET` | `app/routes/api/og/job/$jobId.ts` |
| `/api/og/moment/:id` | `GET` | `app/routes/api/og/moment/$id.ts` |
| `/api/og/pf2ecal` | `GET` | `app/routes/api/og/pf2ecal.ts` |
| `/api/og/post/:id` | `GET` | `app/routes/api/og/post/$id.ts` |
| `/api/og/post/:id/story` | `GET` | `app/routes/api/og/post/$id/story.ts` |
| `/api/og/profile/:id` | `GET` | `app/routes/api/og/profile/$id.ts` |
| `/api/og/replay/:id` | `GET` | `app/routes/api/og/replay/$id.ts` |
| `/api/og/section/:file` | `GET` | `app/routes/api/og/section/$file.ts` |
| `/api/og/sohumtracker` | `GET` | `app/routes/api/og/sohumtracker.ts` |
| `/api/og/story/:slug` | `GET` | `app/routes/api/og/story/$slug.ts` |

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
| `/api/personas` | `GET` `POST` | `lib/personas/api/personas.server.ts` |
| `/api/personas/:id` | `DELETE` `GET` | `lib/personas/api/personas.$id.server.ts` |
| `/api/personas/:id/chat` | `POST` | `app/routes/api/personas/$id/chat.ts` |
| `/api/personas/avatar/:filename` | `GET` | `app/routes/api/personas/avatar/$filename.ts` |

## `/api/pf2ecal`

13 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/pf2ecal` | `GET` | `app/routes/api/pf2ecal/index.ts` |
| `/api/pf2ecal/announcements` | `POST` | `app/routes/api/pf2ecal/announcements.ts` |
| `/api/pf2ecal/announcements/:id` | `DELETE` `PATCH` | `app/routes/api/pf2ecal/announcements.$id.ts` |
| `/api/pf2ecal/ask` | `POST` | `lib/pf2ecal/api/pf2ecal.ask.server.ts` |
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

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/playlists` | `GET` `POST` | `lib/playlists/api/playlists.server.ts` |
| `/api/playlists/:id` | `DELETE` `GET` `PATCH` | `lib/playlists/api/playlists.$id.server.ts` |
| `/api/playlists/:id/collaborators` | `GET` `POST` | `lib/playlists/api/playlists.$id.collaborators.server.ts` |
| `/api/playlists/:id/collaborators/:userId` | `DELETE` | `lib/playlists/api/playlists.$id.collaborators.$userId.server.ts` |
| `/api/playlists/:id/items` | `POST` | `lib/playlists/api/playlists.$id.items.server.ts` |
| `/api/playlists/:id/items/:itemId` | `DELETE` | `lib/playlists/api/playlists.$id.items.$itemId.server.ts` |

## `/api/pools`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/pools` | `GET` `POST` | `app/routes/api/pools/index.ts` |
| `/api/pools/:id` | `GET` | `app/routes/api/pools/$id/index.ts` |
| `/api/pools/:id/contribute` | `POST` | `app/routes/api/pools/$id/contribute.ts` |

## `/api/portal-game`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/portal-game/assets/*` | `GET` | `app/routes/api/portal-game/assets/$.ts` |

## `/api/predictions`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/predictions` | `GET` `POST` | `lib/predictions/api/predictions.server.ts` |
| `/api/predictions/:id` | `GET` | `app/routes/api/predictions/$id.ts` |
| `/api/predictions/:id/comments` | `GET` `POST` | `lib/predictions/api/predictions.$id.comments.server.ts` |
| `/api/predictions/:id/devils-advocate` | `POST` | `lib/predictions/api/predictions.$id.devils-advocate.server.ts` |
| `/api/predictions/:id/trade` | `POST` | `lib/predictions/api/predictions.$id.trade.server.ts` |

## `/api/preferences`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/preferences/appearance` | `GET` `PUT` | `lib/preferences/api/preferences.appearance.server.ts` |
| `/api/preferences/conversation` | `GET` `PUT` | `app/routes/api/preferences/conversation.ts` |
| `/api/preferences/layout` | `GET` `PUT` | `lib/preferences/api/preferences.layout.server.ts` |
| `/api/preferences/muted-words` | `GET` `PUT` | `lib/preferences/api/preferences.muted-words.server.ts` |
| `/api/preferences/notifications` | `GET` `PUT` | `lib/preferences/api/preferences.notifications.server.ts` |
| `/api/preferences/presence` | `GET` `PUT` | `lib/preferences/api/preferences.presence.server.ts` |

## `/api/presence`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/presence/online-count` | `GET` | `lib/presence/api/presence.online-count.server.ts` |

## `/api/profile`

31 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/profile` | `PATCH` | `lib/api/routes/profile.server.ts` |
| `/api/profile/:id` | `GET` | `lib/profile/api/profile.$id.server.ts` |
| `/api/profile/:id/activity` | `GET` | `lib/profile/api/profile.$id.activity.server.ts` |
| `/api/profile/:id/card` | `GET` | `app/routes/api/profile/$id/card.ts` |
| `/api/profile/:id/endorsements` | `GET` `PUT` | `app/routes/api/profile/$id/endorsements.ts` |
| `/api/profile/:id/follow` | `POST` | `lib/profile/api/profile.$id.follow.server.ts` |
| `/api/profile/:id/followers` | `GET` | `app/routes/api/profile/$id/followers.ts` |
| `/api/profile/:id/following` | `GET` | `app/routes/api/profile/$id/following.ts` |
| `/api/profile/:id/guestbook` | `GET` `PATCH` `POST` | `app/routes/api/profile/$id/guestbook.ts` |
| `/api/profile/:id/guestbook/:entryId` | `DELETE` `PATCH` | `app/routes/api/profile/$id/guestbook.$entryId.ts` |
| `/api/profile/:id/kudos` | `GET` `POST` | `app/routes/api/profile/$id/kudos.ts` |
| `/api/profile/:id/likes` | `GET` | `app/routes/api/profile/$id/likes.ts` |
| `/api/profile/:id/membership` | `DELETE` `POST` | `app/routes/api/profile/$id/membership.ts` |
| `/api/profile/:id/plus` | `GET` | `lib/profile/api/profile.$id.plus.server.ts` |
| `/api/profile/:id/pronunciation` | `GET` | `app/routes/api/profile/$id/pronunciation.ts` |
| `/api/profile/:id/rmharks` | `GET` | `app/routes/api/profile/$id/rmharks.ts` |
| `/api/profile/:id/shelves` | `GET` | `app/routes/api/profile/$id/shelves.ts` |
| `/api/profile/:id/stamps` | `GET` | `lib/profile/api/profile.$id.stamps.server.ts` |
| `/api/profile/:id/visit` | `POST` | `lib/profile/api/profile.$id.visit.server.ts` |
| `/api/profile/:id/webrings` | `GET` | `app/routes/api/profile/$id/webrings.ts` |
| `/api/profile/analytics` | `GET` | `lib/profile/api/profile.analytics.server.ts` |
| `/api/profile/avatar` | `DELETE` `POST` | `lib/api/routes/profile.avatar.server.ts` |
| `/api/profile/avatar/:filename` | `GET` | `app/routes/api/profile/avatar/$filename.ts` |
| `/api/profile/banner` | `DELETE` `POST` | `app/routes/api/profile/banner.ts` |
| `/api/profile/banner/:filename` | `GET` | `app/routes/api/profile/banner/$filename.ts` |
| `/api/profile/layout` | `GET` `PUT` | `app/routes/api/profile/layout.ts` |
| `/api/profile/me` | `GET` | `lib/profile/api/profile.me.server.ts` |
| `/api/profile/plus` | `GET` `PUT` | `lib/profile/api/profile.plus.server.ts` |
| `/api/profile/pronunciation` | `DELETE` `POST` | `app/routes/api/profile/pronunciation.ts` |
| `/api/profile/status` | `DELETE` `PUT` | `lib/profile/api/profile.status.server.ts` |
| `/api/profile/top-four` | `GET` `PUT` | `lib/profile/api/profile.top-four.server.ts` |

## `/api/profile-links`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/profile-links` | `GET` `POST` | `lib/profile-links/api/profile-links.server.ts` |
| `/api/profile-links/:id` | `DELETE` `PATCH` | `lib/profile-links/api/profile-links.$id.server.ts` |
| `/api/profile-links/:id/verify` | `POST` | `lib/profile-links/api/profile-links.$id.verify.server.ts` |

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
| `/api/push/public-key` | `GET` | `lib/push/api/push.public-key.server.ts` |
| `/api/push/subscribe` | `DELETE` `POST` | `lib/push/api/push.subscribe.server.ts` |

## `/api/qotd`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/qotd/answers` | `GET` | `lib/posts-plus/api/qotd.answers.server.ts` |
| `/api/qotd/archive` | `GET` | `lib/posts-plus/api/qotd.archive.server.ts` |
| `/api/qotd/today` | `GET` | `lib/posts-plus/api/qotd.today.server.ts` |

## `/api/quests`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/quests/:id/claim` | `POST` | `lib/battlepass/api/quests.$id.claim.server.ts` |

## `/api/ranked`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/ranked` | `GET` `POST` | `lib/ranked/api/ranked.server.ts` |
| `/api/ranked/:game/leaderboard` | `GET` | `lib/ranked/api/ranked.$game.leaderboard.server.ts` |
| `/api/ranked/challenge/:id` | `POST` | `lib/ranked/api/ranked.challenge.$id.server.ts` |

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
| `/api/recipes` | `GET` `POST` | `lib/devplatform/api/recipes.server.ts` |
| `/api/recipes/:id` | `DELETE` `PATCH` | `lib/devplatform/api/recipes.$id.server.ts` |

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
| `/api/referrals/claim` | `POST` | `lib/api/routes/referrals.claim.server.ts` |
| `/api/referrals/me` | `GET` | `lib/api/routes/referrals.me.server.ts` |

## `/api/release-notes`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/release-notes` | `GET` | `app/routes/api/release-notes.ts` |

## `/api/reminders`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reminders` | `GET` `POST` | `lib/reminders/api/reminders.server.ts` |
| `/api/reminders/:id` | `DELETE` | `lib/reminders/api/reminders.$id.server.ts` |

## `/api/replays`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/replays` | `POST` | `lib/game/api/replays.server.ts` |
| `/api/replays/:id` | `DELETE` `GET` | `app/routes/api/replays/$id.ts` |
| `/api/replays/ghost` | `GET` `POST` | `app/routes/api/replays/ghost.ts` |

## `/api/requests`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/requests` | `GET` `POST` | `lib/requests/api/requests.server.ts` |
| `/api/requests/:id` | `GET` `PATCH` | `lib/requests/api/requests.$id.server.ts` |
| `/api/requests/:id/vote` | `POST` | `lib/requests/api/requests.$id.vote.server.ts` |

## `/api/reviews`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reviews/:id/vote` | `DELETE` `POST` | `app/routes/api/reviews/$id.vote.ts` |

## `/api/rideshare`

13 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rideshare/directions` | `GET` | `lib/rideshare/api/rideshare.directions.server.ts` |
| `/api/rideshare/driver` | `GET` `PATCH` `POST` | `app/routes/api/rideshare/driver.ts` |
| `/api/rideshare/earnings` | `GET` | `lib/rideshare/api/rideshare.earnings.server.ts` |
| `/api/rideshare/geocode` | `GET` | `lib/rideshare/api/rideshare.geocode.server.ts` |
| `/api/rideshare/location` | `POST` | `lib/rideshare/api/rideshare.location.server.ts` |
| `/api/rideshare/places` | `GET` `POST` | `lib/rideshare/api/rideshare.places.server.ts` |
| `/api/rideshare/places/:id` | `DELETE` | `lib/rideshare/api/rideshare.places.$id.server.ts` |
| `/api/rideshare/reverse` | `GET` | `lib/rideshare/api/rideshare.reverse.server.ts` |
| `/api/rideshare/rides` | `GET` `POST` | `lib/rideshare/api/rideshare.rides.server.ts` |
| `/api/rideshare/rides/:id` | `POST` | `lib/rideshare/api/rideshare.rides.$id.server.ts` |
| `/api/rideshare/rides/:id/messages` | `POST` | `lib/rideshare/api/rideshare.rides.$id.messages.server.ts` |
| `/api/rideshare/rides/:id/rate` | `POST` | `lib/rideshare/api/rideshare.rides.$id.rate.server.ts` |
| `/api/rideshare/rides/:id/sync` | `GET` | `lib/rideshare/api/rideshare.rides.$id.sync.server.ts` |

## `/api/rmharks`

28 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmharks` | `GET` `POST` | `lib/feed/api/rmharks.server.ts` |
| `/api/rmharks/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/rmharks/$id.ts` |
| `/api/rmharks/:id/bookmark` | `POST` | `lib/feed/api/rmharks.$id.bookmark.server.ts` |
| `/api/rmharks/:id/comment` | `GET` `POST` | `app/routes/api/rmharks/$id/comment.ts` |
| `/api/rmharks/:id/comment/:commentId` | `DELETE` | `lib/feed/api/rmharks.$id.comment.$commentId.server.ts` |
| `/api/rmharks/:id/comment/:commentId/hide` | `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.hide.server.ts` |
| `/api/rmharks/:id/comment/:commentId/like` | `GET` `POST` | `app/routes/api/rmharks/$id/comment/$commentId/like.ts` |
| `/api/rmharks/:id/comment/:commentId/repost` | `GET` `POST` | `app/routes/api/rmharks/$id/comment/$commentId/repost.ts` |
| `/api/rmharks/:id/comment/:commentId/view` | `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.view.server.ts` |
| `/api/rmharks/:id/embed` | `GET` | `lib/feed/api/rmharks.$id.embed.server.ts` |
| `/api/rmharks/:id/history` | `GET` | `lib/feed/api/rmharks.$id.history.server.ts` |
| `/api/rmharks/:id/insights` | `GET` | `lib/feed/api/rmharks.$id.insights.server.ts` |
| `/api/rmharks/:id/like` | `GET` `POST` | `app/routes/api/rmharks/$id/like.ts` |
| `/api/rmharks/:id/pin` | `POST` | `lib/feed/api/rmharks.$id.pin.server.ts` |
| `/api/rmharks/:id/quotes` | `GET` | `lib/feed/api/rmharks.$id.quotes.server.ts` |
| `/api/rmharks/:id/react` | `POST` | `lib/feed/api/rmharks.$id.react.server.ts` |
| `/api/rmharks/:id/repost` | `GET` `POST` | `app/routes/api/rmharks/$id/repost.ts` |
| `/api/rmharks/:id/similar` | `GET` | `app/routes/api/rmharks/$id/similar.ts` |
| `/api/rmharks/:id/summary` | `GET` | `lib/feed/api/rmharks.$id.summary.server.ts` |
| `/api/rmharks/:id/take` | `GET` `POST` | `lib/feed/api/rmharks.$id.take.server.ts` |
| `/api/rmharks/:id/translate` | `GET` | `lib/ai/api/rmharks.$id.translate.server.ts` |
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
| `/api/rmhcode/auth/generate` | `POST` | `lib/rmhcode/api/rmhcode.auth.generate.server.ts` |
| `/api/rmhcode/auth/initiate` | `POST` | `lib/rmhcode/api/rmhcode.auth.initiate.server.ts` |
| `/api/rmhcode/auth/list` | `GET` | `lib/rmhcode/api/rmhcode.auth.list.server.ts` |
| `/api/rmhcode/auth/revoke` | `POST` | `lib/rmhcode/api/rmhcode.auth.revoke.server.ts` |
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
| `/api/rmhladder/searches` | `DELETE` `GET` `POST` | `lib/rmhladder/api/rmhladder.searches.server.ts` |

## `/api/rmhmusic`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhmusic/learn/cards` | `GET` `POST` | `app/routes/api/rmhmusic/learn/cards.ts` |
| `/api/rmhmusic/learn/lesson-complete` | `POST` | `app/routes/api/rmhmusic/learn/lesson-complete.ts` |
| `/api/rmhmusic/learn/profile` | `GET` `PUT` | `app/routes/api/rmhmusic/learn/profile.ts` |

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
| `/api/rmhtype/practice-test` | `POST` | `lib/rmhtype/api/rmhtype.practice-test.server.ts` |

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

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/settings/alt-text` | `GET` `POST` | `app/routes/api/settings/alt-text.ts` |
| `/api/settings/auto-delete` | `GET` `PUT` | `app/routes/api/settings/auto-delete.ts` |
| `/api/settings/email-digest` | `POST` | `app/routes/api/settings/email-digest.ts` |
| `/api/settings/game-assists` | `GET` `POST` | `app/routes/api/settings/game-assists.ts` |
| `/api/settings/play-limits` | `GET` `POST` | `app/routes/api/settings/play-limits.ts` |
| `/api/settings/playtime-privacy` | `GET` `POST` `PUT` | `app/routes/api/settings/playtime-privacy.ts` |

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

## `/api/tf2-game`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tf2-game/assets/*` | `GET` | `app/routes/api/tf2-game/assets/$.ts` |

## `/api/tf2-hud`

15 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tf2-hud/ai` | `POST` | `app/routes/api/tf2-hud/ai.ts` |
| `/api/tf2-hud/base/*` | `GET` | `app/routes/api/tf2-hud/base/$.ts` |
| `/api/tf2-hud/blobs/:sha1` | `PUT` | `app/routes/api/tf2-hud/blobs/$sha1.ts` |
| `/api/tf2-hud/blobs/check` | `POST` | `app/routes/api/tf2-hud/blobs/check.ts` |
| `/api/tf2-hud/huds` | `GET` `POST` | `app/routes/api/tf2-hud/huds/index.ts` |
| `/api/tf2-hud/huds/:id` | `DELETE` `GET` `PUT` | `app/routes/api/tf2-hud/huds/$id.ts` |
| `/api/tf2-hud/huds/:id/download` | `POST` | `app/routes/api/tf2-hud/huds/$id.download.ts` |
| `/api/tf2-hud/huds/:id/file` | `GET` | `app/routes/api/tf2-hud/huds/$id.file.ts` |
| `/api/tf2-hud/huds/:id/fork` | `POST` | `app/routes/api/tf2-hud/huds/$id.fork.ts` |
| `/api/tf2-hud/huds/:id/like` | `POST` | `app/routes/api/tf2-hud/huds/$id.like.ts` |
| `/api/tf2-hud/huds/:id/share` | `DELETE` `POST` | `app/routes/api/tf2-hud/huds/$id.share.ts` |
| `/api/tf2-hud/huds/:id/versions` | `GET` | `app/routes/api/tf2-hud/huds/$id.versions.ts` |
| `/api/tf2-hud/huds/:id/versions/:n` | `POST` | `app/routes/api/tf2-hud/huds/$id.versions.$n.ts` |
| `/api/tf2-hud/share/:token` | `GET` | `app/routes/api/tf2-hud/share/$token.ts` |
| `/api/tf2-hud/share/:token/file` | `GET` | `app/routes/api/tf2-hud/share/$token.file.ts` |

## `/api/tf2-loadout`

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tf2-loadout/ai` | `POST` | `app/routes/api/tf2-loadout/ai.ts` |
| `/api/tf2-loadout/catalog` | `GET` | `app/routes/api/tf2-loadout/catalog.ts` |
| `/api/tf2-loadout/icons/:id` | `GET` | `app/routes/api/tf2-loadout/icons/$id.ts` |
| `/api/tf2-loadout/loadouts` | `GET` `POST` | `app/routes/api/tf2-loadout/loadouts/index.ts` |
| `/api/tf2-loadout/loadouts/:id` | `DELETE` `GET` `PUT` | `app/routes/api/tf2-loadout/loadouts/$id.ts` |
| `/api/tf2-loadout/loadouts/:id/fork` | `POST` | `app/routes/api/tf2-loadout/loadouts/$id.fork.ts` |
| `/api/tf2-loadout/loadouts/:id/like` | `POST` | `app/routes/api/tf2-loadout/loadouts/$id.like.ts` |
| `/api/tf2-loadout/models` | `GET` | `app/routes/api/tf2-loadout/models/index.ts` |
| `/api/tf2-loadout/models/:id` | `GET` | `app/routes/api/tf2-loadout/models/$id.ts` |
| `/api/tf2-loadout/paintkits/*` | `GET` | `app/routes/api/tf2-loadout/paintkits/$.ts` |
| `/api/tf2-loadout/particles/*` | `GET` | `app/routes/api/tf2-loadout/particles/$.ts` |

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

## `/api/wrapped`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wrapped` | `GET` | `app/routes/api/wrapped.ts` |

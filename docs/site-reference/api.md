<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes

Every server route in the app tier — 987 endpoints across 197 groups: 370 route files under `app/routes/api` and 617 registered modules that the one dispatcher route `app/routes/api/$.ts` serves (the Source column says which). This is the whole internal surface, not just the public developer API: the public, versioned, key-authenticated subset is `/api/v1/*`, documented in [the developer API reference](../developer-api/endpoints/index.md). Everything else is session-authenticated and internal — treat it as unstable.

Methods are read from each file's `server.handlers` block, or from the handlers a registered module passes to `apiRoute`. A route with no methods listed exports a handler built by a wrapper (for example the developer API `withDeveloperApi`).

## `/api/account`

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/account/delete` | `POST` | `lib/account/api/account.delete.server.ts` |
| `/api/account/export` | `GET` | `lib/account/api/account.export.server.ts` |
| `/api/account/recovery/codes` | `GET` `POST` | `lib/recovery/api/account.recovery.codes.server.ts` |
| `/api/account/recovery/complete` | `POST` | `lib/recovery/api/account.recovery.complete.server.ts` |
| `/api/account/recovery/contacts` | `GET` `POST` | `lib/recovery/api/account.recovery.contacts.server.ts` |
| `/api/account/recovery/contacts/:id` | `DELETE` `POST` | `lib/recovery/api/account.recovery.contacts.$id.server.ts` |
| `/api/account/recovery/hold` | `GET` | `lib/recovery/api/account.recovery.hold.server.ts` |
| `/api/account/recovery/requests` | `GET` `POST` | `lib/recovery/api/account.recovery.requests.server.ts` |
| `/api/account/recovery/requests/:id` | `DELETE` `POST` | `lib/recovery/api/account.recovery.requests.$id.server.ts` |
| `/api/account/standing` | `GET` | `lib/account/api/account.standing.server.ts` |
| `/api/account/strikes/:id/appeal` | `POST` | `lib/account/api/account.strikes.$id.appeal.server.ts` |

## `/api/achievements`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/achievements/:userId` | `GET` | `lib/achievements/api/achievements.$userId.server.ts` |

## `/api/activity`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/activity` | `GET` `POST` | `lib/activity/api/activity.server.ts` |

## `/api/admin`

94 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/admin/albums` | `GET` `POST` | `lib/admin/api/admin.albums.server.ts` |
| `/api/admin/albums/:id` | `DELETE` `PATCH` | `lib/admin/api/admin.albums.$id.server.ts` |
| `/api/admin/albums/:id/reorder` | `POST` | `lib/admin/api/admin.albums.$id.reorder.server.ts` |
| `/api/admin/albums/:id/slides` | `POST` | `lib/admin/api/admin.albums.$id.slides.server.ts` |
| `/api/admin/albums/:id/slides/:slideId` | `DELETE` | `lib/admin/api/admin.albums.$id.slides.$slideId.server.ts` |
| `/api/admin/albums/reorder` | `POST` | `lib/admin/api/admin.albums.reorder.server.ts` |
| `/api/admin/analytics` | `GET` | `lib/admin/api/admin.analytics.server.ts` |
| `/api/admin/announcements` | `GET` `POST` | `lib/admin/api/admin.announcements.server.ts` |
| `/api/admin/announcements/:id` | `DELETE` `POST` | `lib/admin/api/admin.announcements.$id.server.ts` |
| `/api/admin/appeals` | `GET` | `lib/admin/api/admin.appeals.server.ts` |
| `/api/admin/appeals/:id` | `POST` | `lib/admin/api/admin.appeals.$id.server.ts` |
| `/api/admin/audit-log` | `GET` | `lib/admin/api/admin.audit-log.server.ts` |
| `/api/admin/blog` | `DELETE` `POST` | `lib/admin/api/admin.blog.server.ts` |
| `/api/admin/bots` | `GET` `PUT` | `lib/admin/api/admin.bots.server.ts` |
| `/api/admin/canvas` | `GET` `POST` | `lib/canvas/api/admin.canvas.server.ts` |
| `/api/admin/canvas/:id` | `DELETE` | `lib/canvas/api/admin.canvas.$id.server.ts` |
| `/api/admin/census` | `GET` `POST` | `lib/admin/api/admin.census.server.ts` |
| `/api/admin/context-notes` | `GET` | `lib/context-notes/api/admin.context-notes.server.ts` |
| `/api/admin/context-notes/:id` | `PATCH` | `lib/context-notes/api/admin.context-notes.$id.server.ts` |
| `/api/admin/curated-builds/image` | `POST` | `lib/admin/api/admin.curated-builds.image.server.ts` |
| `/api/admin/curated-builds/image/:filename` | `GET` | `lib/admin/api/admin.curated-builds.image.$filename.server.ts` |
| `/api/admin/curated-builds/image/proxy` | `GET` | `lib/admin/api/admin.curated-builds.image.proxy.server.ts` |
| `/api/admin/deepseek/balance` | `GET` | `lib/deepseek/api/admin.deepseek.balance.server.ts` |
| `/api/admin/deepseek/history` | `GET` | `lib/deepseek/api/admin.deepseek.history.server.ts` |
| `/api/admin/deepseek/refresh` | `POST` | `lib/deepseek/api/admin.deepseek.refresh.server.ts` |
| `/api/admin/delight/fools` | `GET` `POST` | `lib/delight/api/admin.delight.fools.server.ts` |
| `/api/admin/delight/fortunes` | `GET` | `lib/delight/api/admin.delight.fortunes.server.ts` |
| `/api/admin/delight/fortunes/:id` | `POST` | `lib/delight/api/admin.delight.fortunes.$id.server.ts` |
| `/api/admin/delight/hunts` | `GET` `POST` | `lib/delight/api/admin.delight.hunts.server.ts` |
| `/api/admin/delight/hunts/:id` | `DELETE` `PATCH` | `lib/delight/api/admin.delight.hunts.$id.server.ts` |
| `/api/admin/delight/museum` | `POST` | `lib/delight/api/admin.delight.museum.server.ts` |
| `/api/admin/delight/museum/:id` | `DELETE` `PUT` | `lib/delight/api/admin.delight.museum.$id.server.ts` |
| `/api/admin/delight/translations` | `GET` | `lib/delight/api/admin.delight.translations.server.ts` |
| `/api/admin/delight/translations/:id` | `POST` | `lib/delight/api/admin.delight.translations.$id.server.ts` |
| `/api/admin/delight/translations/export` | `GET` | `lib/delight/api/admin.delight.translations.export.server.ts` |
| `/api/admin/economy` | `GET` | `lib/admin/api/admin.economy.server.ts` |
| `/api/admin/emoji-packs` | `GET` | `lib/admin/api/admin.emoji-packs.server.ts` |
| `/api/admin/emoji-packs/:id` | `POST` | `lib/admin/api/admin.emoji-packs.$id.server.ts` |
| `/api/admin/flags` | `DELETE` `GET` `PUT` | `lib/admin/api/admin.flags.server.ts` |
| `/api/admin/forecasting/seasons` | `POST` | `lib/admin/api/admin.forecasting.seasons.server.ts` |
| `/api/admin/gift-exchanges/:id/verify` | `GET` | `lib/gifting/api/admin.gift-exchanges.$id.verify.server.ts` |
| `/api/admin/insights/cohorts` | `GET` `POST` | `lib/ops/api/admin.insights.cohorts.server.ts` |
| `/api/admin/insights/errors` | `GET` `PATCH` | `lib/ops/api/admin.insights.errors.server.ts` |
| `/api/admin/insights/experiments` | `GET` `PATCH` `POST` | `lib/ops/api/admin.insights.experiments.server.ts` |
| `/api/admin/insights/notices` | `DELETE` `GET` `POST` | `lib/ops/api/admin.insights.notices.server.ts` |
| `/api/admin/insights/routes` | `GET` | `lib/ops/api/admin.insights.routes.server.ts` |
| `/api/admin/library` | `GET` | `lib/library/api/admin.library.server.ts` |
| `/api/admin/library/:id` | `DELETE` `PATCH` | `lib/library/api/admin.library.$id.server.ts` |
| `/api/admin/library/migrate` | `POST` | `lib/library/api/admin.library.migrate.server.ts` |
| `/api/admin/library/quota-requests` | `GET` `POST` | `lib/library/api/admin.library.quota-requests.server.ts` |
| `/api/admin/library/reorder` | `POST` | `lib/library/api/admin.library.reorder.server.ts` |
| `/api/admin/library/storage-health` | `GET` | `lib/library/api/admin.library.storage-health.server.ts` |
| `/api/admin/link-rules` | `DELETE` `GET` `POST` | `lib/admin/api/admin.link-rules.server.ts` |
| `/api/admin/market` | `GET` | `lib/admin/api/admin.market.server.ts` |
| `/api/admin/market/:id` | `POST` | `lib/admin/api/admin.market.$id.server.ts` |
| `/api/admin/mod-macros` | `DELETE` `GET` `POST` | `lib/admin/api/admin.mod-macros.server.ts` |
| `/api/admin/oncall` | `GET` | `lib/admin/api/admin.oncall.server.ts` |
| `/api/admin/oncall-rules` | `GET` `PATCH` | `lib/admin/api/admin.oncall-rules.server.ts` |
| `/api/admin/oncall-series` | `GET` | `lib/admin/api/admin.oncall-series.server.ts` |
| `/api/admin/perf` | `GET` | `lib/admin/api/admin.perf.server.ts` |
| `/api/admin/perf/db` | `GET` | `lib/admin/api/admin.perf.db.server.ts` |
| `/api/admin/perf/heap` | `GET` | `lib/admin/api/admin.perf.heap.server.ts` |
| `/api/admin/perf/profile` | `POST` | `lib/admin/api/admin.perf.profile.server.ts` |
| `/api/admin/predictions` | `GET` | `lib/predictions/api/admin.predictions.server.ts` |
| `/api/admin/predictions/:id/moderate` | `POST` | `lib/predictions/api/admin.predictions.$id.moderate.server.ts` |
| `/api/admin/predictions/:id/resolve` | `POST` | `lib/predictions/api/admin.predictions.$id.resolve.server.ts` |
| `/api/admin/qotd` | `GET` `POST` | `lib/admin/api/admin.qotd.server.ts` |
| `/api/admin/qotd/:id` | `DELETE` | `lib/admin/api/admin.qotd.$id.server.ts` |
| `/api/admin/reading/glossary` | `GET` `POST` | `lib/reading/api/admin.reading.glossary.server.ts` |
| `/api/admin/reading/glossary/:id` | `DELETE` `PATCH` | `lib/reading/api/admin.reading.glossary.$id.server.ts` |
| `/api/admin/reading/stories` | `GET` `POST` | `lib/reading/api/admin.reading.stories.server.ts` |
| `/api/admin/reading/stories/:id` | `DELETE` `PATCH` | `lib/reading/api/admin.reading.stories.$id.server.ts` |
| `/api/admin/reading/stories/:id/articles` | `DELETE` `POST` | `lib/reading/api/admin.reading.stories.$id.articles.server.ts` |
| `/api/admin/reading/stories/:id/suggest` | `GET` | `lib/reading/api/admin.reading.stories.$id.suggest.server.ts` |
| `/api/admin/redemptions` | `GET` | `lib/admin/api/admin.redemptions.server.ts` |
| `/api/admin/redemptions/:id` | `POST` | `lib/admin/api/admin.redemptions.$id.server.ts` |
| `/api/admin/release-notes` | `GET` `POST` | `lib/devplatform/api/admin.release-notes.server.ts` |
| `/api/admin/release-notes/:id` | `DELETE` `PATCH` | `lib/devplatform/api/admin.release-notes.$id.server.ts` |
| `/api/admin/release-notes/draft` | `POST` | `lib/devplatform/api/admin.release-notes.draft.server.ts` |
| `/api/admin/reports` | `GET` | `lib/admin/api/admin.reports.server.ts` |
| `/api/admin/reports/:id` | `POST` | `lib/admin/api/admin.reports.$id.server.ts` |
| `/api/admin/review-counts` | `GET` | `lib/admin/api/admin.review-counts.server.ts` |
| `/api/admin/rideshare/applications` | `GET` `PATCH` | `lib/rideshare/api/admin.rideshare.applications.server.ts` |
| `/api/admin/rideshare/rides` | `GET` | `lib/rideshare/api/admin.rideshare.rides.server.ts` |
| `/api/admin/studio-challenges` | `POST` | `lib/creator/api/admin.studio-challenges.server.ts` |
| `/api/admin/studio-challenges/upload` | `POST` | `lib/creator/api/admin.studio-challenges.upload.server.ts` |
| `/api/admin/users` | `GET` `PATCH` | `lib/admin/api/admin.users.server.ts` |
| `/api/admin/users/:id/ban` | `POST` | `lib/admin/api/admin.users.$id.ban.server.ts` |
| `/api/admin/users/:id/grant-membership` | `POST` | `lib/admin/api/admin.users.$id.grant-membership.server.ts` |
| `/api/admin/users/:id/set-coins` | `POST` | `lib/admin/api/admin.users.$id.set-coins.server.ts` |
| `/api/admin/users/:id/strike` | `POST` | `lib/admin/api/admin.users.$id.strike.server.ts` |
| `/api/admin/vibe/backfill-thumbs` | `POST` | `lib/rmhvibe/api/admin.vibe.backfill-thumbs.server.ts` |
| `/api/admin/view-as` | `GET` | `lib/admin/api/admin.view-as.server.ts` |
| `/api/admin/wager/:id/resolve` | `POST` | `lib/wager/api/admin.wager.$id.resolve.server.ts` |

## `/api/advent`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/advent` | `GET` `POST` | `lib/gifting/api/advent.server.ts` |

## `/api/ai`

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/ai/ask-feed` | `POST` | `lib/feed/api/ai.ask-feed.server.ts` |
| `/api/ai/bio` | `POST` | `lib/ai/api/ai.bio.server.ts` |
| `/api/ai/catch-up` | `POST` | `lib/ai/api/ai.catch-up.server.ts` |
| `/api/ai/explain-metric` | `POST` | `lib/ai/api/ai.explain-metric.server.ts` |
| `/api/ai/message-suggest` | `POST` | `app/routes/api/ai/message-suggest.ts` |
| `/api/ai/nl-query` | `POST` | `lib/ai/api/ai.nl-query.server.ts` |
| `/api/ai/search` | `POST` | `lib/feed/api/ai.search.server.ts` |
| `/api/ai/smart-replies` | `POST` | `lib/ai/api/ai.smart-replies.server.ts` |
| `/api/ai/suggest-tags` | `POST` | `lib/ai/api/ai.suggest-tags.server.ts` |
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
| `/api/altair/match` | `POST` | `features/altair/api/altair.match.server.ts` |
| `/api/altair/meta` | `GET` `POST` | `features/altair/api/altair.meta.server.ts` |
| `/api/altair/run/finish` | `POST` | `features/altair/api/altair.run.finish.server.ts` |
| `/api/altair/run/start` | `POST` | `features/altair/api/altair.run.start.server.ts` |
| `/api/altair/run/status` | `GET` | `features/altair/api/altair.run.status.server.ts` |
| `/api/altair/score` | `POST` | `features/altair/api/altair.score.server.ts` |

## `/api/announcements`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/announcements` | `GET` | `lib/api/routes/announcements.server.ts` |
| `/api/announcements/:id/vote` | `POST` | `lib/api/routes/announcements.$id.vote.server.ts` |

## `/api/arcade`

12 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/arcade` | `GET` | `lib/arcade/api/arcade.server.ts` |
| `/api/arcade/backlog` | `DELETE` `GET` `PUT` | `lib/arcade/api/arcade.backlog.server.ts` |
| `/api/arcade/basket` | `GET` | `lib/arcade/api/arcade.basket.server.ts` |
| `/api/arcade/basket/finish` | `POST` | `lib/arcade/api/arcade.basket.finish.server.ts` |
| `/api/arcade/basket/start` | `POST` | `lib/arcade/api/arcade.basket.start.server.ts` |
| `/api/arcade/claim` | `POST` | `lib/arcade/api/arcade.claim.server.ts` |
| `/api/arcade/daily` | `GET` | `lib/arcade/api/arcade.daily.server.ts` |
| `/api/arcade/daily/start` | `POST` | `lib/arcade/api/arcade.daily.start.server.ts` |
| `/api/arcade/patch-notes` | `GET` `POST` | `lib/arcade/api/arcade.patch-notes.server.ts` |
| `/api/arcade/rival` | `GET` | `lib/arcade/api/arcade.rival.server.ts` |
| `/api/arcade/runs` | `GET` `POST` | `lib/arcade/api/arcade.runs.server.ts` |
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
| `/api/awards` | `GET` `POST` | `lib/awards/api/awards.server.ts` |
| `/api/awards/:id/hide` | `POST` | `lib/awards/api/awards.$id.hide.server.ts` |

## `/api/badge`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/badge/:userId/:gameId` | `GET` | `lib/api/routes/badge.$userId.$gameId.server.ts` |

## `/api/battlepass`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/battlepass` | `GET` | `lib/battlepass/api/battlepass.server.ts` |
| `/api/battlepass/claim` | `POST` | `lib/battlepass/api/battlepass.claim.server.ts` |
| `/api/battlepass/unlock` | `POST` | `lib/battlepass/api/battlepass.unlock.server.ts` |

## `/api/birthday`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/birthday` | `DELETE` `GET` `PUT` | `lib/gifting/api/birthday.server.ts` |
| `/api/birthday/next` | `GET` | `lib/gifting/api/birthday.next.server.ts` |

## `/api/bookmarks`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/bookmarks` | `GET` | `lib/api/routes/bookmarks.server.ts` |

## `/api/builds`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/builds/consent` | `DELETE` `GET` `POST` | `lib/builds/api/builds.consent.server.ts` |
| `/api/builds/cover/:file` | `GET` | `app/routes/api/builds/cover/$file.ts` |
| `/api/builds/review` | `POST` | `lib/builds/api/builds.review.server.ts` |

## `/api/bulk`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/bulk` | `GET` `POST` | `lib/bulk/api/bulk.server.ts` |
| `/api/bulk/:id` | `DELETE` `GET` | `lib/bulk/api/bulk.$id.server.ts` |
| `/api/bulk/preview` | `POST` | `lib/bulk/api/bulk.preview.server.ts` |

## `/api/calc-notebooks`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calc-notebooks` | `GET` `POST` | `lib/tools/api/calc-notebooks.server.ts` |
| `/api/calc-notebooks/:id` | `DELETE` `PUT` | `lib/tools/api/calc-notebooks.$id.server.ts` |

## `/api/calendar`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calendar/:token` | `GET` | `lib/calendar/api/calendar.$token.server.ts` |

## `/api/calendar-feed`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calendar-feed` | `GET` `PATCH` | `lib/calendar/api/calendar-feed.server.ts` |

## `/api/calls`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calls/answer` | `GET` `PUT` | `lib/call/api/calls.answer.server.ts` |
| `/api/calls/history` | `GET` | `lib/call/api/calls.history.server.ts` |
| `/api/calls/ice` | `GET` | `lib/call/api/calls.ice.server.ts` |
| `/api/calls/mute` | `DELETE` `GET` `POST` | `lib/call/api/calls.mute.server.ts` |
| `/api/calls/privacy` | `GET` `PUT` | `lib/call/api/calls.privacy.server.ts` |

## `/api/canvas`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/canvas` | `GET` | `lib/canvas/api/canvas.server.ts` |
| `/api/canvas/log` | `GET` | `lib/canvas/api/canvas.log.server.ts` |
| `/api/canvas/place` | `POST` | `lib/canvas/api/canvas.place.server.ts` |
| `/api/canvas/state` | `GET` | `lib/canvas/api/canvas.state.server.ts` |
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
| `/api/chat-folders` | `GET` `POST` | `lib/chat-plus/api/chat-folders.server.ts` |
| `/api/chat-folders/:id` | `DELETE` `PATCH` | `lib/chat-plus/api/chat-folders.$id.server.ts` |
| `/api/chat-folders/:id/items` | `PUT` | `lib/chat-plus/api/chat-folders.$id.items.server.ts` |

## `/api/chats`

9 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/chats/:kind/:id/checklist` | `POST` `PUT` | `lib/chat-plus/api/chats.$kind.$id.checklist.server.ts` |
| `/api/chats/:kind/:id/command` | `POST` | `lib/chat-plus/api/chats.$kind.$id.command.server.ts` |
| `/api/chats/:kind/:id/media` | `GET` | `lib/chat-plus/api/chats.$kind.$id.media.server.ts` |
| `/api/chats/:kind/:id/meta` | `GET` | `lib/chat-plus/api/chats.$kind.$id.meta.server.ts` |
| `/api/chats/:kind/:id/pin` | `POST` | `lib/chat-plus/api/chats.$kind.$id.pin.server.ts` |
| `/api/chats/:kind/:id/settings` | `PATCH` `PUT` | `lib/chat-plus/api/chats.$kind.$id.settings.server.ts` |
| `/api/chats/:kind/:id/thread/:messageId` | `GET` `POST` | `lib/chat-plus/api/chats.$kind.$id.thread.$messageId.server.ts` |
| `/api/chats/:kind/:id/vote` | `POST` | `lib/chat-plus/api/chats.$kind.$id.vote.server.ts` |
| `/api/chats/forward` | `POST` | `lib/chat-plus/api/chats.forward.server.ts` |

## `/api/circle`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/circle` | `GET` `PUT` | `lib/api/routes/circle.server.ts` |

## `/api/client-error`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/client-error` | `POST` | `app/routes/api/client-error.ts` |

## `/api/coins`

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/coins` | `GET` | `lib/api/routes/coins.server.ts` |
| `/api/coins/bet` | `POST` | `lib/api/routes/coins.bet.server.ts` |
| `/api/coins/claim` | `POST` | `lib/api/routes/coins.claim.server.ts` |
| `/api/coins/gift` | `POST` | `lib/gifting/api/coins.gift.server.ts` |
| `/api/coins/purchase` | `POST` | `lib/economy/api/coins.purchase.server.ts` |
| `/api/coins/statement` | `GET` | `lib/economy/api/coins.statement.server.ts` |
| `/api/coins/tip` | `POST` | `lib/economy/api/coins.tip.server.ts` |

## `/api/comments`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/comments/:commentId/react` | `POST` | `lib/social/api/comments.$commentId.react.server.ts` |
| `/api/comments/:commentId/translate` | `GET` | `lib/ai/api/comments.$commentId.translate.server.ts` |

## `/api/communities`

33 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/communities` | `GET` `POST` | `lib/communities/api/communities.server.ts` |
| `/api/communities/:slug` | `GET` | `lib/communities/api/communities.$slug.server.ts` |
| `/api/communities/:slug/announcements` | `GET` `POST` | `lib/communities/api/communities.$slug.announcements.server.ts` |
| `/api/communities/:slug/announcements/:id` | `DELETE` | `lib/communities/api/communities.$slug.announcements.$id.server.ts` |
| `/api/communities/:slug/automod` | `GET` `POST` | `lib/communities/api/communities.$slug.automod.server.ts` |
| `/api/communities/:slug/automod/:ruleId` | `DELETE` `PATCH` | `lib/communities/api/communities.$slug.automod.$ruleId.server.ts` |
| `/api/communities/:slug/census` | `GET` `POST` | `lib/communities/api/communities.$slug.census.server.ts` |
| `/api/communities/:slug/census/:id/answer` | `POST` | `lib/communities/api/communities.$slug.census.$id.answer.server.ts` |
| `/api/communities/:slug/census/:id/close` | `POST` | `lib/communities/api/communities.$slug.census.$id.close.server.ts` |
| `/api/communities/:slug/challenge` | `GET` `POST` | `lib/communities/api/communities.$slug.challenge.server.ts` |
| `/api/communities/:slug/challenge/:id` | `DELETE` | `lib/communities/api/communities.$slug.challenge.$id.server.ts` |
| `/api/communities/:slug/challenge/vote` | `POST` | `lib/communities/api/communities.$slug.challenge.vote.server.ts` |
| `/api/communities/:slug/contributors` | `GET` | `lib/communities/api/communities.$slug.contributors.server.ts` |
| `/api/communities/:slug/extras` | `GET` | `lib/communities/api/communities.$slug.extras.server.ts` |
| `/api/communities/:slug/feed` | `GET` | `lib/communities/api/communities.$slug.feed.server.ts` |
| `/api/communities/:slug/flair-follows` | `PUT` | `lib/communities/api/communities.$slug.flair-follows.server.ts` |
| `/api/communities/:slug/flairs` | `POST` | `lib/communities/api/communities.$slug.flairs.server.ts` |
| `/api/communities/:slug/flairs/:flairId` | `DELETE` `PATCH` | `lib/communities/api/communities.$slug.flairs.$flairId.server.ts` |
| `/api/communities/:slug/invites` | `GET` `POST` | `lib/communities/api/communities.$slug.invites.server.ts` |
| `/api/communities/:slug/invites/:id` | `DELETE` | `lib/communities/api/communities.$slug.invites.$id.server.ts` |
| `/api/communities/:slug/join` | `POST` | `lib/communities/api/communities.$slug.join.server.ts` |
| `/api/communities/:slug/join-request` | `DELETE` `POST` | `lib/communities/api/communities.$slug.join-request.server.ts` |
| `/api/communities/:slug/join-requests` | `GET` | `lib/communities/api/communities.$slug.join-requests.server.ts` |
| `/api/communities/:slug/join-requests/:id` | `POST` | `lib/communities/api/communities.$slug.join-requests.$id.server.ts` |
| `/api/communities/:slug/macros` | `DELETE` `GET` `POST` | `lib/communities/api/communities.$slug.macros.server.ts` |
| `/api/communities/:slug/members` | `GET` | `lib/communities/api/communities.$slug.members.server.ts` |
| `/api/communities/:slug/members/:userId` | `DELETE` `PATCH` | `lib/communities/api/communities.$slug.members.$userId.server.ts` |
| `/api/communities/:slug/modqueue` | `GET` | `lib/communities/api/communities.$slug.modqueue.server.ts` |
| `/api/communities/:slug/modqueue/:itemId` | `POST` | `lib/communities/api/communities.$slug.modqueue.$itemId.server.ts` |
| `/api/communities/:slug/onboarding` | `GET` `POST` `PUT` | `lib/communities/api/communities.$slug.onboarding.server.ts` |
| `/api/communities/:slug/settings` | `PATCH` | `lib/communities/api/communities.$slug.settings.server.ts` |
| `/api/communities/:slug/sisters` | `PUT` | `lib/communities/api/communities.$slug.sisters.server.ts` |
| `/api/communities/:slug/starboard` | `GET` | `lib/communities/api/communities.$slug.starboard.server.ts` |

## `/api/community-goals`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/community-goals` | `GET` `POST` | `lib/economy/api/community-goals.server.ts` |
| `/api/community-goals/:id/admin` | `POST` | `lib/economy/api/community-goals.$id.admin.server.ts` |
| `/api/community-goals/:id/pledge` | `POST` | `lib/economy/api/community-goals.$id.pledge.server.ts` |

## `/api/community-pages`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/community-pages` | `GET` `POST` | `lib/communities/api/community-pages.server.ts` |
| `/api/community-pages/:id` | `DELETE` `PATCH` | `lib/communities/api/community-pages.$id.server.ts` |
| `/api/community-pages/:id/revisions` | `GET` `POST` | `lib/communities/api/community-pages.$id.revisions.server.ts` |

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
| `/api/context-notes` | `GET` `POST` | `lib/context-notes/api/context-notes.server.ts` |
| `/api/context-notes/:id` | `DELETE` | `lib/context-notes/api/context-notes.$id.server.ts` |
| `/api/context-notes/:id/rate` | `POST` | `lib/context-notes/api/context-notes.$id.rate.server.ts` |

## `/api/creator`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/creator/redeem` | `GET` `POST` | `lib/creator/api/creator.redeem.server.ts` |
| `/api/creator/studio-overview` | `GET` | `lib/creator/api/creator.studio-overview.server.ts` |

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
| `/api/csp-report` | `POST` | `lib/api/routes/csp-report.server.ts` |

## `/api/daily-puzzles`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/daily-puzzles/leaderboard` | `GET` | `lib/daily-puzzles/api/daily-puzzles.leaderboard.server.ts` |
| `/api/daily-puzzles/puzzle` | `GET` | `lib/daily-puzzles/api/daily-puzzles.puzzle.server.ts` |
| `/api/daily-puzzles/results` | `GET` | `lib/daily-puzzles/api/daily-puzzles.results.server.ts` |
| `/api/daily-puzzles/score` | `POST` | `lib/daily-puzzles/api/daily-puzzles.score.server.ts` |

## `/api/datacenter`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/datacenter/compute` | `GET` `POST` | `lib/datacenter/api/datacenter.compute.server.ts` |

## `/api/delight`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/delight/config` | `GET` | `lib/delight/api/delight.config.server.ts` |

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
| `/api/discord/sync-score` | `POST` | `lib/api/routes/discord.sync-score.server.ts` |
| `/api/discord/token` | `POST` | `lib/api/routes/discord.token.server.ts` |

## `/api/discovery`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/discovery/alerts` | `DELETE` `GET` `POST` | `lib/discovery/api/discovery.alerts.server.ts` |
| `/api/discovery/memories` | `GET` `PUT` | `lib/discovery/api/discovery.memories.server.ts` |
| `/api/discovery/surprise` | `GET` | `lib/discovery/api/discovery.surprise.server.ts` |
| `/api/discovery/today` | `GET` | `lib/discovery/api/discovery.today.server.ts` |
| `/api/discovery/trending/:tag` | `GET` | `lib/discovery/api/discovery.trending.$tag.server.ts` |
| `/api/discovery/watch` | `GET` `PUT` | `lib/discovery/api/discovery.watch.server.ts` |

## `/api/doctrine`

17 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/doctrine/admin/disclosures` | `PATCH` `POST` | `features/doctrine/api/doctrine.admin.disclosures.server.ts` |
| `/api/doctrine/admin/incidents` | `PATCH` | `features/doctrine/api/doctrine.admin.incidents.server.ts` |
| `/api/doctrine/admin/tiers` | `POST` | `features/doctrine/api/doctrine.admin.tiers.server.ts` |
| `/api/doctrine/incidents` | `GET` `POST` | `features/doctrine/api/doctrine.incidents.server.ts` |
| `/api/doctrine/incidents/:id` | `GET` | `features/doctrine/api/doctrine.incidents.$id.server.ts` |
| `/api/doctrine/puzzles/leaderboard` | `GET` | `features/doctrine/api/doctrine.puzzles.leaderboard.server.ts` |
| `/api/doctrine/puzzles/replay` | `GET` `POST` | `features/doctrine/api/doctrine.puzzles.replay.server.ts` |
| `/api/doctrine/puzzles/submit` | `POST` | `features/doctrine/api/doctrine.puzzles.submit.server.ts` |
| `/api/doctrine/puzzles/today` | `GET` | `features/doctrine/api/doctrine.puzzles.today.server.ts` |
| `/api/doctrine/reactions` | `POST` | `features/doctrine/api/doctrine.reactions.server.ts` |
| `/api/doctrine/recruitment/create` | `POST` | `features/doctrine/api/doctrine.recruitment.create.server.ts` |
| `/api/doctrine/recruitment/redeem` | `POST` | `features/doctrine/api/doctrine.recruitment.redeem.server.ts` |
| `/api/doctrine/reputation` | `GET` | `features/doctrine/api/doctrine.reputation.server.ts` |
| `/api/doctrine/reputation/leaderboard` | `GET` | `features/doctrine/api/doctrine.reputation.leaderboard.server.ts` |
| `/api/doctrine/safehouse/content` | `GET` | `features/doctrine/api/doctrine.safehouse.content.server.ts` |
| `/api/doctrine/safehouse/disclosures` | `GET` | `features/doctrine/api/doctrine.safehouse.disclosures.server.ts` |
| `/api/doctrine/sahur/status` | `GET` | `features/doctrine/api/doctrine.sahur.status.server.ts` |

## `/api/dream-rift`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/dream-rift/coop` | `GET` `POST` | `features/dream-rift/api/dream-rift.coop.server.ts` |
| `/api/dream-rift/leaderboard` | `GET` | `features/dream-rift/api/dream-rift.leaderboard.server.ts` |
| `/api/dream-rift/score` | `POST` | `features/dream-rift/api/dream-rift.score.server.ts` |

## `/api/dunesday`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/dunesday/ask` | `POST` | `lib/dunesday/api/dunesday.ask.server.ts` |
| `/api/dunesday/feeds/:feedId/calendar.ics` | `GET` | `lib/dunesday/api/dunesday.feeds.$feedId.calendar.ics.server.ts` |
| `/api/dunesday/feeds/:feedId/rss.xml` | `GET` | `lib/dunesday/api/dunesday.feeds.$feedId.rss.xml.server.ts` |
| `/api/dunesday/sync` | `POST` | `lib/dunesday/api/dunesday.sync.server.ts` |
| `/api/dunesday/sync/:feedId` | `DELETE` `GET` `PUT` | `lib/dunesday/api/dunesday.sync.$feedId.server.ts` |
| `/api/dunesday/sync/:feedId/discord` | `POST` `PUT` | `lib/dunesday/api/dunesday.sync.$feedId.discord.server.ts` |

## `/api/economy`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/economy/savings-goals` | `GET` `POST` | `lib/economy/api/economy.savings-goals.server.ts` |
| `/api/economy/savings-goals/:id` | `DELETE` | `lib/economy/api/economy.savings-goals.$id.server.ts` |

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
| `/api/elections/events` | `GET` | `lib/elections/api/elections.events.server.ts` |
| `/api/elections/events/stream` | `GET` | `app/routes/api/elections/events/stream.ts` |
| `/api/elections/history` | `GET` | `lib/elections/api/elections.history.server.ts` |
| `/api/elections/leagues` | `GET` `POST` | `lib/elections/api/elections.leagues.server.ts` |
| `/api/elections/leagues/:code` | `DELETE` `GET` `POST` | `lib/elections/api/elections.leagues.$code.server.ts` |
| `/api/elections/leagues/:code/picks` | `PUT` | `lib/elections/api/elections.leagues.$code.picks.server.ts` |
| `/api/elections/markets` | `GET` | `lib/elections/api/elections.markets.server.ts` |
| `/api/elections/measures` | `GET` | `lib/elections/api/elections.measures.server.ts` |
| `/api/elections/news` | `GET` | `lib/elections/api/elections.news.server.ts` |
| `/api/elections/offices` | `GET` | `lib/elections/api/elections.offices.server.ts` |
| `/api/elections/public` | `GET` | `lib/elections/api/elections.public.server.ts` |
| `/api/elections/races.csv` | `GET` | `lib/elections/api/elections.races.csv.server.ts` |
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
| `/api/embed/oembed` | `GET` | `lib/api/routes/embed.oembed.server.ts` |

## `/api/emoji-packs`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/emoji-packs` | `GET` `POST` | `lib/emoji/api/emoji-packs.server.ts` |
| `/api/emoji-packs/:slug` | `GET` | `lib/emoji/api/emoji-packs.$slug.server.ts` |
| `/api/emoji-packs/:slug/items` | `DELETE` `POST` | `lib/emoji/api/emoji-packs.$slug.items.server.ts` |
| `/api/emoji-packs/:slug/subscribe` | `DELETE` `POST` | `lib/emoji/api/emoji-packs.$slug.subscribe.server.ts` |
| `/api/emoji-packs/:slug/upload` | `POST` | `lib/emoji/api/emoji-packs.$slug.upload.server.ts` |
| `/api/emoji-packs/installed` | `GET` | `lib/emoji/api/emoji-packs.installed.server.ts` |

## `/api/events`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/events` | `GET` `POST` | `lib/calendar/api/events.server.ts` |
| `/api/events/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/events/$id/index.ts` |
| `/api/events/:id/ics` | `GET` | `app/routes/api/events/$id/ics.ts` |
| `/api/events/:id/rsvp` | `DELETE` `POST` | `lib/api/routes/events.$id.rsvp.server.ts` |

## `/api/experiments`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/experiments` | `GET` `POST` | `lib/api/routes/experiments.server.ts` |

## `/api/explore`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/explore` | `GET` | `lib/discovery/api/explore.server.ts` |

## `/api/feed`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feed/hashtag-search` | `GET` | `lib/feed/api/feed.hashtag-search.server.ts` |
| `/api/feed/image/:filename` | `GET` | `app/routes/api/feed/image/$filename.ts` |
| `/api/feed/mention-search` | `GET` | `lib/feed/api/feed.mention-search.server.ts` |
| `/api/feed/signal` | `DELETE` `GET` `POST` | `lib/feed/api/feed.signal.server.ts` |
| `/api/feed/stream` | `GET` | `app/routes/api/feed/stream.ts` |

## `/api/feedback`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feedback` | `GET` `POST` | `lib/api/routes/feedback.server.ts` |

## `/api/feeds`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feeds` | `GET` `POST` | `lib/discovery/api/feeds.server.ts` |
| `/api/feeds/:id` | `DELETE` `GET` `PATCH` | `lib/discovery/api/feeds.$id.server.ts` |
| `/api/feeds/:id/subscribe` | `DELETE` `POST` | `lib/discovery/api/feeds.$id.subscribe.server.ts` |

## `/api/flags`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/flags` | `GET` | `lib/flags/api/flags.server.ts` |

## `/api/forecasting`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/forecasting/calibration` | `GET` | `lib/forecasting/api/forecasting.calibration.server.ts` |
| `/api/forecasting/seasons` | `GET` | `lib/forecasting/api/forecasting.seasons.server.ts` |

## `/api/fortune`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/fortune` | `POST` | `lib/delight/api/fortune.server.ts` |
| `/api/fortune/today` | `GET` | `lib/delight/api/fortune.today.server.ts` |

## `/api/friendly`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/friendly` | `GET` `POST` | `lib/competitive/api/friendly.server.ts` |
| `/api/friendly/:id` | `POST` | `lib/competitive/api/friendly.$id.server.ts` |

## `/api/gabriels-horn`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gabriels-horn/house-rule` | `POST` | `features/gabriels-horn/api/gabriels-horn.house-rule.server.ts` |
| `/api/gabriels-horn/leaderboard` | `GET` | `features/gabriels-horn/api/gabriels-horn.leaderboard.server.ts` |
| `/api/gabriels-horn/table-read` | `GET` | `features/gabriels-horn/api/gabriels-horn.table-read.server.ts` |

## `/api/game-night`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/game-night` | `GET` `PATCH` `POST` | `lib/competitive/api/game-night.server.ts` |

## `/api/game-saves`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/game-saves/:gameId` | `DELETE` `GET` `POST` | `lib/game-saves/api/game-saves.$gameId.server.ts` |

## `/api/games`

33 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/games/:id/guides` | `GET` | `lib/games/api/games.$id.guides.server.ts` |
| `/api/games/:id/leaderboard` | `GET` | `lib/game/api/games.$id.leaderboard.server.ts` |
| `/api/games/:id/review` | `DELETE` `PUT` | `lib/games/api/games.$id.review.server.ts` |
| `/api/games/:id/reviews` | `GET` | `lib/games/api/games.$id.reviews.server.ts` |
| `/api/games/:id/score` | `POST` | `lib/game/api/games.$id.score.server.ts` |
| `/api/games/cards/craft` | `POST` | `lib/cards/api/games.cards.craft.server.ts` |
| `/api/games/collections/delete` | `POST` | `lib/games/api/games.collections.delete.server.ts` |
| `/api/games/collections/import` | `POST` | `lib/games/api/games.collections.import.server.ts` |
| `/api/games/collections/item` | `POST` | `lib/games/api/games.collections.item.server.ts` |
| `/api/games/collections/rename` | `POST` | `lib/games/api/games.collections.rename.server.ts` |
| `/api/games/customize` | `POST` | `lib/cards/api/games.customize.server.ts` |
| `/api/games/gems/buy` | `POST` | `lib/games/api/games.gems.buy.server.ts` |
| `/api/games/gems/pack` | `POST` | `lib/games/api/games.gems.pack.server.ts` |
| `/api/games/gems/unpack` | `POST` | `lib/cards/api/games.gems.unpack.server.ts` |
| `/api/games/how-to-play` | `POST` | `lib/devplatform/api/games.how-to-play.server.ts` |
| `/api/games/hub/delete` | `POST` | `lib/games/api/games.hub.delete.server.ts` |
| `/api/games/hub/moderate` | `POST` | `lib/games/api/games.hub.moderate.server.ts` |
| `/api/games/hub/post` | `POST` | `lib/games/api/games.hub.post.server.ts` |
| `/api/games/hub/thread` | `POST` | `lib/cards/api/games.hub.thread.server.ts` |
| `/api/games/market/buy` | `POST` | `lib/games/api/games.market.buy.server.ts` |
| `/api/games/market/cancel` | `POST` | `lib/games/api/games.market.cancel.server.ts` |
| `/api/games/market/list` | `POST` | `lib/cards/api/games.market.list.server.ts` |
| `/api/games/market/order` | `POST` | `lib/games/api/games.market.order.server.ts` |
| `/api/games/market/order-cancel` | `POST` | `lib/games/api/games.market.order-cancel.server.ts` |
| `/api/games/playtime` | `POST` | `lib/playtime/api/games.playtime.server.ts` |
| `/api/games/showcase` | `POST` | `lib/cards/api/games.showcase.server.ts` |
| `/api/games/synapse-storm/leaderboard` | `GET` | `features/synapse-storm/api/games.synapse-storm.leaderboard.server.ts` |
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
| `/api/gift-exchanges` | `GET` `POST` | `lib/gifting/api/gift-exchanges.server.ts` |
| `/api/gift-exchanges/:id` | `DELETE` `GET` | `lib/gifting/api/gift-exchanges.$id.server.ts` |
| `/api/gift-exchanges/:id/draw` | `POST` | `lib/gifting/api/gift-exchanges.$id.draw.server.ts` |
| `/api/gift-exchanges/:id/gift` | `POST` | `lib/gifting/api/gift-exchanges.$id.gift.server.ts` |
| `/api/gift-exchanges/:id/join` | `DELETE` `POST` | `lib/gifting/api/gift-exchanges.$id.join.server.ts` |
| `/api/gift-exchanges/:id/me` | `PUT` | `lib/gifting/api/gift-exchanges.$id.me.server.ts` |

## `/api/gift-sub`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gift-sub` | `GET` `POST` | `lib/gifting/api/gift-sub.server.ts` |

## `/api/gifts`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gifts/scheduled` | `GET` `POST` | `lib/gifting/api/gifts.scheduled.server.ts` |
| `/api/gifts/scheduled/:id` | `DELETE` | `lib/gifting/api/gifts.scheduled.$id.server.ts` |
| `/api/gifts/scheduled/:id/unwrap` | `POST` | `lib/gifting/api/gifts.scheduled.$id.unwrap.server.ts` |

## `/api/globeset`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/globeset/record` | `GET` | `lib/globeset/api/globeset.record.server.ts` |

## `/api/group-chats`

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/group-chats` | `GET` `POST` | `lib/group-chat/api/group-chats.server.ts` |
| `/api/group-chats/:id` | `GET` | `lib/group-chat/api/group-chats.$id.server.ts` |
| `/api/group-chats/:id/leave` | `POST` | `lib/group-chat/api/group-chats.$id.leave.server.ts` |
| `/api/group-chats/:id/messages` | `GET` `POST` | `lib/group-chat/api/group-chats.$id.messages.server.ts` |
| `/api/group-chats/:id/messages/:messageId/vote` | `POST` | `lib/group-chat/api/group-chats.$id.messages.$messageId.vote.server.ts` |
| `/api/group-chats/:id/react` | `POST` | `lib/group-chat/api/group-chats.$id.react.server.ts` |
| `/api/group-chats/:id/stream` | `GET` | `app/routes/api/group-chats/$id/stream.ts` |

## `/api/groupcalls`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/groupcalls/active` | `GET` | `lib/api/routes/groupcalls.active.server.ts` |
| `/api/groupcalls/history` | `GET` | `lib/api/routes/groupcalls.history.server.ts` |
| `/api/groupcalls/invitable` | `GET` | `lib/api/routes/groupcalls.invitable.server.ts` |

## `/api/guides`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/guides` | `POST` | `lib/games/api/guides.server.ts` |
| `/api/guides/:id` | `DELETE` `GET` `PUT` | `lib/games/api/guides.$id.server.ts` |
| `/api/guides/:id/publish` | `POST` | `lib/games/api/guides.$id.publish.server.ts` |

## `/api/handle`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/handle/check` | `GET` | `lib/api/routes/handle.check.server.ts` |

## `/api/handles`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/handles/change` | `GET` `POST` | `lib/api/routes/handles.change.server.ts` |
| `/api/handles/history` | `GET` | `lib/api/routes/handles.history.server.ts` |
| `/api/handles/impersonation` | `GET` `POST` | `lib/api/routes/handles.impersonation.server.ts` |

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
| `/api/history/position` | `GET` `POST` | `lib/history/api/history.position.server.ts` |
| `/api/history/resume` | `GET` | `lib/history/api/history.resume.server.ts` |

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
| `/api/homes/listings/:id` | `DELETE` `GET` `PATCH` | `lib/homes/api/homes.listings.$id.server.ts` |
| `/api/homes/listings/:id/favorite` | `DELETE` `POST` | `lib/homes/api/homes.listings.$id.favorite.server.ts` |
| `/api/homes/listings/:id/roommate` | `GET` | `lib/homes/api/homes.listings.$id.roommate.server.ts` |
| `/api/homes/roommate` | `GET` `PUT` | `lib/homes/api/homes.roommate.server.ts` |
| `/api/homes/watches` | `DELETE` `GET` `PATCH` `POST` | `lib/homes/api/homes.watches.server.ts` |

## `/api/hunt`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/hunt` | `GET` | `lib/delight/api/hunt.server.ts` |
| `/api/hunt/answer` | `POST` | `lib/delight/api/hunt.answer.server.ts` |
| `/api/hunt/marker` | `GET` | `lib/delight/api/hunt.marker.server.ts` |

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
| `/api/saves` | `DELETE` `GET` `POST` | `lib/saves/api/saves.server.ts` |
| `/api/saves/folders` | `GET` `POST` | `lib/saves/api/saves.folders.server.ts` |
| `/api/saves/folders/:id` | `DELETE` `PATCH` | `app/routes/api/saves/folders.$id.ts` |
| `/api/saves/note` | `PUT` | `lib/saves/api/saves.note.server.ts` |

## `/api/schedule`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/schedule` | `GET` | `lib/schedule/api/schedule.server.ts` |
| `/api/schedule/admin` | `DELETE` `GET` `POST` | `app/routes/api/schedule/admin.ts` |

## `/api/scheduled`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/scheduled` | `GET` `POST` | `lib/scheduled/api/scheduled.server.ts` |
| `/api/scheduled/:id` | `DELETE` `PATCH` | `lib/scheduled/api/scheduled.$id.server.ts` |
| `/api/scheduled/:id/publish` | `POST` | `lib/scheduled/api/scheduled.$id.publish.server.ts` |
| `/api/scheduled/capsules` | `GET` | `lib/scheduled/api/scheduled.capsules.server.ts` |

## `/api/search`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/search` | `GET` | `app/routes/api/search.ts` |
| `/api/search/saved` | `GET` `POST` | `lib/search/api/search.saved.server.ts` |
| `/api/search/saved/:id` | `DELETE` `PATCH` | `lib/search/api/search.saved.$id.server.ts` |

## `/api/series`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/series` | `GET` `POST` | `lib/posts-plus/api/series.server.ts` |
| `/api/series/:id` | `DELETE` `GET` `PATCH` | `lib/posts-plus/api/series.$id.server.ts` |
| `/api/series/:id/follow` | `DELETE` `PUT` | `lib/posts-plus/api/series.$id.follow.server.ts` |
| `/api/series/:id/posts` | `POST` | `lib/posts-plus/api/series.$id.posts.server.ts` |
| `/api/series/:id/posts/:postId` | `DELETE` `PATCH` | `lib/posts-plus/api/series.$id.posts.$postId.server.ts` |
| `/api/series/post/:postId` | `GET` | `lib/posts-plus/api/series.post.$postId.server.ts` |

## `/api/services`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/services/rebar-reservations` | `DELETE` `GET` `POST` | `lib/rebar-rutabaga/api/services.rebar-reservations.server.ts` |

## `/api/settings`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/settings/alt-text` | `GET` `POST` | `lib/feed/api/settings.alt-text.server.ts` |
| `/api/settings/auto-delete` | `GET` `PUT` | `lib/posts-plus/api/settings.auto-delete.server.ts` |
| `/api/settings/email-digest` | `POST` | `app/routes/api/settings/email-digest.ts` |
| `/api/settings/game-assists` | `GET` `POST` | `lib/game/api/settings.game-assists.server.ts` |
| `/api/settings/play-limits` | `GET` `POST` | `lib/economy/api/settings.play-limits.server.ts` |
| `/api/settings/playtime-privacy` | `GET` `POST` `PUT` | `lib/playtime/api/settings.playtime-privacy.server.ts` |

## `/api/shop`

9 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/shop` | `GET` | `lib/shop/api/shop.server.ts` |
| `/api/shop/bundle` | `POST` | `app/routes/api/shop/bundle.ts` |
| `/api/shop/daily` | `GET` | `app/routes/api/shop/daily.ts` |
| `/api/shop/equip` | `POST` | `lib/shop/api/shop.equip.server.ts` |
| `/api/shop/loadouts` | `GET` `POST` | `app/routes/api/shop/loadouts/index.ts` |
| `/api/shop/loadouts/:id` | `DELETE` | `app/routes/api/shop/loadouts/$id/index.ts` |
| `/api/shop/loadouts/:id/apply` | `POST` | `app/routes/api/shop/loadouts/$id/apply.ts` |
| `/api/shop/purchase` | `POST` | `app/routes/api/shop/purchase.ts` |
| `/api/shop/search` | `GET` | `app/routes/api/shop/search.ts` |

## `/api/signal-forge`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/signal-forge/abandon` | `POST` | `features/signal-forge/api/signal-forge.abandon.server.ts` |
| `/api/signal-forge/leaderboard` | `GET` | `features/signal-forge/api/signal-forge.leaderboard.server.ts` |
| `/api/signal-forge/load` | `GET` | `features/signal-forge/api/signal-forge.load.server.ts` |
| `/api/signal-forge/save` | `POST` | `app/routes/api/signal-forge/save.ts` |
| `/api/signal-forge/score` | `POST` | `features/signal-forge/api/signal-forge.score.server.ts` |

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
| `/api/slice-it/daily` | `GET` | `features/slice-it/api/slice-it.daily.server.ts` |
| `/api/slice-it/daily/submit` | `POST` | `features/slice-it/api/slice-it.daily.submit.server.ts` |
| `/api/slice-it/leaderboard` | `GET` | `app/routes/api/slice-it/leaderboard.ts` |
| `/api/slice-it/packs` | `GET` `POST` | `features/slice-it/api/slice-it.packs.server.ts` |
| `/api/slice-it/packs/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/slice-it/packs/$id.ts` |
| `/api/slice-it/packs/:id/items` | `PATCH` | `features/slice-it/api/slice-it.packs.$id.items.server.ts` |
| `/api/slice-it/replay` | `GET` `POST` | `app/routes/api/slice-it/replay.ts` |
| `/api/slice-it/replay/:id` | `GET` | `app/routes/api/slice-it/replay/$id.ts` |
| `/api/slice-it/score` | `POST` | `app/routes/api/slice-it/score.ts` |
| `/api/slice-it/setlists` | `GET` `POST` | `features/slice-it/api/slice-it.setlists.server.ts` |
| `/api/slice-it/setlists/:id` | `DELETE` `GET` `PATCH` | `features/slice-it/api/slice-it.setlists.$id.server.ts` |
| `/api/slice-it/shelves` | `GET` | `app/routes/api/slice-it/shelves.ts` |
| `/api/slice-it/showcase` | `GET` | `features/slice-it/api/slice-it.showcase.server.ts` |
| `/api/slice-it/songs` | `GET` | `app/routes/api/slice-it/songs.ts` |
| `/api/slice-it/songs/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/slice-it/songs/$id.ts` |
| `/api/slice-it/songs/:id/charts` | `GET` | `features/slice-it/api/slice-it.songs.$id.charts.server.ts` |
| `/api/slice-it/songs/:id/comments` | `DELETE` `GET` `POST` | `app/routes/api/slice-it/songs/$id/comments.ts` |
| `/api/slice-it/songs/:id/cover` | `GET` | `app/routes/api/slice-it/songs/$id/cover.ts` |
| `/api/slice-it/songs/:id/import-chart` | `POST` | `app/routes/api/slice-it/songs/$id/import-chart.ts` |
| `/api/slice-it/songs/:id/like` | `POST` | `features/slice-it/api/slice-it.songs.$id.like.server.ts` |
| `/api/slice-it/songs/:id/patch-analysis` | `POST` | `app/routes/api/slice-it/songs/$id/patch-analysis.ts` |
| `/api/slice-it/songs/:id/play` | `POST` | `features/slice-it/api/slice-it.songs.$id.play.server.ts` |
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
| `/api/sohumtracker/alert` | `GET` `POST` | `lib/sohumtracker/api/sohumtracker.alert.server.ts` |
| `/api/sohumtracker/export` | `GET` | `app/routes/api/sohumtracker/export.ts` |
| `/api/sohumtracker/stream` | `GET` | `app/routes/api/sohumtracker/stream.ts` |

## `/api/spaces`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/spaces` | `GET` `POST` | `app/routes/api/spaces/index.ts` |
| `/api/spaces/:id` | `GET` | `app/routes/api/spaces/$id/index.ts` |
| `/api/spaces/:id/end` | `POST` | `lib/spaces/api/spaces.$id.end.server.ts` |
| `/api/spaces/:id/start` | `POST` | `lib/spaces/api/spaces.$id.start.server.ts` |
| `/api/spaces/live` | `GET` | `app/routes/api/spaces/live.ts` |

## `/api/speedrun`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/speedrun/categories` | `GET` `POST` | `lib/speedrun/api/speedrun.categories.server.ts` |
| `/api/speedrun/leaderboard` | `GET` | `lib/speedrun/api/speedrun.leaderboard.server.ts` |
| `/api/speedrun/replays` | `GET` | `lib/speedrun/api/speedrun.replays.server.ts` |
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
| `/api/stamps` | `GET` `POST` | `lib/profile/api/stamps.server.ts` |
| `/api/stamps/:id` | `DELETE` | `lib/profile/api/stamps.$id.server.ts` |
| `/api/stamps/:id/wall` | `DELETE` `POST` | `lib/profile/api/stamps.$id.wall.server.ts` |
| `/api/stamps/image/:filename` | `GET` | `app/routes/api/stamps/image/$filename.ts` |
| `/api/stamps/mine` | `GET` | `lib/profile/api/stamps.mine.server.ts` |

## `/api/storefront`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/storefront/creator/:userid` | `GET` | `lib/storefront/api/storefront.creator.$userid.server.ts` |
| `/api/storefront/products` | `POST` | `lib/storefront/api/storefront.products.server.ts` |
| `/api/storefront/products/:id` | `DELETE` `PATCH` | `lib/storefront/api/storefront.products.$id.server.ts` |
| `/api/storefront/products/:id/buy` | `POST` | `lib/storefront/api/storefront.products.$id.buy.server.ts` |

## `/api/streak`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/streak` | `GET` `POST` | `lib/api/routes/streak.server.ts` |
| `/api/streak/freeze` | `POST` | `lib/api/routes/streak.freeze.server.ts` |

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
| `/api/study/cards/:id/review` | `POST` | `lib/study/api/study.cards.$id.review.server.ts` |
| `/api/study/decks` | `GET` `POST` | `lib/study/api/study.decks.server.ts` |
| `/api/study/decks/:id` | `DELETE` `GET` `POST` | `lib/study/api/study.decks.$id.server.ts` |
| `/api/study/decks/:id/clone` | `POST` | `lib/study/api/study.decks.$id.clone.server.ts` |
| `/api/study/decks/:id/review` | `GET` | `lib/study/api/study.decks.$id.review.server.ts` |
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
| `/api/temple-of-joy/efficiency` | `GET` `POST` | `lib/temple-of-joy/api/temple-of-joy.efficiency.server.ts` |
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
| `/api/tf2-hud/huds/:id/download` | `POST` | `lib/tf2-hud/api/tf2-hud.huds.$id.download.server.ts` |
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
| `/api/tf2-loadout/models` | `GET` | `lib/tf2-loadout/api/tf2-loadout.models.server.ts` |
| `/api/tf2-loadout/models/:id` | `GET` | `app/routes/api/tf2-loadout/models/$id.ts` |
| `/api/tf2-loadout/paintkits/*` | `GET` | `app/routes/api/tf2-loadout/paintkits/$.ts` |
| `/api/tf2-loadout/particles/*` | `GET` | `app/routes/api/tf2-loadout/particles/$.ts` |

## `/api/themes`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/themes` | `GET` `POST` | `lib/themes/api/themes.server.ts` |
| `/api/themes/:id` | `DELETE` `GET` `PUT` | `app/routes/api/themes/$id.ts` |
| `/api/themes/:id/buy` | `POST` | `lib/themes/api/themes.$id.buy.server.ts` |
| `/api/themes/:id/publish` | `POST` | `lib/themes/api/themes.$id.publish.server.ts` |
| `/api/themes/shop` | `GET` | `app/routes/api/themes/shop.ts` |

## `/api/tips`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tips/leaderboard` | `GET` | `lib/discovery/api/tips.leaderboard.server.ts` |

## `/api/today`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/today` | `GET` | `app/routes/api/today.ts` |

## `/api/tournaments`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tournaments` | `GET` `POST` | `lib/tournaments/api/tournaments.server.ts` |
| `/api/tournaments/:id` | `GET` | `lib/tournaments/api/tournaments.$id.server.ts` |
| `/api/tournaments/:id/cancel` | `POST` | `app/routes/api/tournaments/$id/cancel.ts` |
| `/api/tournaments/:id/matches/:matchId/report` | `POST` | `lib/tournaments/api/tournaments.$id.matches.$matchId.report.server.ts` |
| `/api/tournaments/:id/pickem` | `GET` `PUT` | `lib/competitive/api/tournaments.$id.pickem.server.ts` |
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
| `/api/user-builds` | `GET` `POST` | `lib/api/routes/user-builds.server.ts` |
| `/api/user-builds/:id` | `DELETE` `GET` `PATCH` | `lib/api/routes/user-builds.$id.server.ts` |
| `/api/user-builds/:id/comments` | `GET` `POST` | `lib/api/routes/user-builds.$id.comments.server.ts` |
| `/api/user-builds/:id/like` | `POST` | `lib/api/routes/user-builds.$id.like.server.ts` |
| `/api/user-builds/:id/unlock` | `POST` | `app/routes/api/user-builds/$id/unlock.ts` |
| `/api/user-builds/:id/view` | `POST` | `app/routes/api/user-builds/$id/view.ts` |
| `/api/user-builds/categories` | `GET` | `lib/api/routes/user-builds.categories.server.ts` |
| `/api/user-builds/featured` | `GET` | `lib/api/routes/user-builds.featured.server.ts` |

## `/api/users`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/users/:id/wishlist` | `GET` | `app/routes/api/users/$id.wishlist.ts` |
| `/api/users/search` | `GET` | `lib/discovery/api/users.search.server.ts` |

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
| `/api/vega/leaderboard` | `GET` | `lib/game/api/vega.leaderboard.server.ts` |
| `/api/vega/score` | `POST` | `features/vega/api/vega.score.server.ts` |

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
| `/api/versecraft/progress` | `GET` | `lib/versecraft/api/versecraft.progress.server.ts` |
| `/api/versecraft/save` | `GET` `POST` | `lib/versecraft/api/versecraft.save.server.ts` |
| `/api/versecraft/seeds` | `GET` `POST` | `app/routes/api/versecraft/seeds/index.ts` |
| `/api/versecraft/seeds/fork` | `POST` | `lib/versecraft/api/versecraft.seeds.fork.server.ts` |
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
| `/api/void-breaker/leaderboard` | `GET` | `lib/game/api/void-breaker.leaderboard.server.ts` |
| `/api/void-breaker/score` | `POST` | `lib/game/api/void-breaker.score.server.ts` |

## `/api/wager`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wager` | `GET` `POST` | `lib/wager/api/wager.server.ts` |
| `/api/wager/:id` | `GET` | `lib/wager/api/wager.$id.server.ts` |
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
| `/api/webrings/:slug/membership` | `DELETE` `POST` | `lib/profile/api/webrings.$slug.membership.server.ts` |

## `/api/wheel`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wheel` | `GET` | `lib/wheel/api/wheel.server.ts` |
| `/api/wheel/spin` | `POST` | `lib/wheel/api/wheel.spin.server.ts` |

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

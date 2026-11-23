<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes

Every server route in the app tier — 1324 endpoints across 203 groups: 169 route files under `app/routes/api` and 1155 registered modules that the one dispatcher route `app/routes/api/$.ts` serves (the Source column says which). This is the whole internal surface, not just the public developer API: the public, versioned, key-authenticated subset is `/api/v1/*`, documented in [the developer API reference](../developer-api/endpoints/index.md). Everything else is session-authenticated and internal — treat it as unstable.

Methods are read from each file's `server.handlers` block, or from the handlers a registered module passes to `apiRoute`. A route with no methods listed exports a handler built by a wrapper (for example the developer API `withDeveloperApi`).

## `/api/account`

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/account/delete` | `POST` | `lib/account/api/account.delete.server.ts` |
| `/api/account/delete/preview` | `GET` | `lib/account/api/account.delete.preview.server.ts` |
| `/api/account/export` | `GET` | `lib/account/api/account.export.server.ts` |
| `/api/account/reports` | `GET` | `lib/moderation/api/account.reports.server.ts` |
| `/api/account/reports/:id/withdraw` | `POST` | `lib/moderation/api/account.reports.$id.withdraw.server.ts` |
| `/api/account/standing` | `GET` | `lib/account/api/account.standing.server.ts` |
| `/api/account/strikes/:id/appeal` | `POST` | `lib/account/api/account.strikes.$id.appeal.server.ts` |

## `/api/achievements`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/achievements/:userId` | `GET` | `lib/achievements/api/achievements.$userId.server.ts` |
| `/api/achievements/compare` | `GET` | `lib/achievements/api/achievements.compare.server.ts` |
| `/api/achievements/tracked` | `GET` | `lib/achievements/api/achievements.tracked.server.ts` |
| `/api/achievements/tracked/:achievementId` | `DELETE` `PUT` | `lib/achievements/api/achievements.tracked.$achievementId.server.ts` |

## `/api/activity`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/activity` | `GET` `POST` | `lib/activity/api/activity.server.ts` |

## `/api/admin`

147 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/admin/albums` | `GET` `POST` | `lib/admin/api/admin.albums.server.ts` |
| `/api/admin/albums/:id` | `DELETE` `PATCH` | `lib/admin/api/admin.albums.$id.server.ts` |
| `/api/admin/albums/:id/reorder` | `POST` | `lib/admin/api/admin.albums.$id.reorder.server.ts` |
| `/api/admin/albums/:id/slides` | `POST` | `lib/admin/api/admin.albums.$id.slides.server.ts` |
| `/api/admin/albums/:id/slides/:slideId` | `DELETE` | `lib/admin/api/admin.albums.$id.slides.$slideId.server.ts` |
| `/api/admin/albums/reorder` | `POST` | `lib/admin/api/admin.albums.reorder.server.ts` |
| `/api/admin/analytics` | `GET` | `lib/admin/api/admin.analytics.server.ts` |
| `/api/admin/api-keys` | `GET` | `lib/admin/api/admin.api-keys.server.ts` |
| `/api/admin/api-keys/:id` | `PATCH` | `lib/admin/api/admin.api-keys.$id.server.ts` |
| `/api/admin/appeals` | `GET` | `lib/admin/api/admin.appeals.server.ts` |
| `/api/admin/appeals/:id` | `POST` | `lib/admin/api/admin.appeals.$id.server.ts` |
| `/api/admin/audit-log` | `GET` | `lib/admin/api/admin.audit-log.server.ts` |
| `/api/admin/blog` | `DELETE` `POST` | `lib/admin/api/admin.blog.server.ts` |
| `/api/admin/blog/:slug/revisions` | `GET` | `lib/admin/api/admin.blog.$slug.revisions.server.ts` |
| `/api/admin/blog/:slug/revisions/:id` | `GET` | `lib/admin/api/admin.blog.$slug.revisions.$id.server.ts` |
| `/api/admin/blog/media` | `POST` | `lib/admin/api/admin.blog.media.server.ts` |
| `/api/admin/bots` | `GET` `PUT` | `lib/admin/api/admin.bots.server.ts` |
| `/api/admin/canvas` | `GET` `POST` | `lib/canvas/api/admin.canvas.server.ts` |
| `/api/admin/canvas/:id` | `DELETE` | `lib/canvas/api/admin.canvas.$id.server.ts` |
| `/api/admin/census` | `GET` `POST` | `lib/admin/api/admin.census.server.ts` |
| `/api/admin/communities` | `GET` | `lib/admin/api/admin.communities.server.ts` |
| `/api/admin/communities/:slug` | `GET` | `lib/admin/api/admin.communities.$slug.server.ts` |
| `/api/admin/communities/:slug/delist` | `POST` | `lib/admin/api/admin.communities.$slug.delist.server.ts` |
| `/api/admin/communities/:slug/owner` | `PUT` | `lib/admin/api/admin.communities.$slug.owner.server.ts` |
| `/api/admin/communities/:slug/relist` | `POST` | `lib/admin/api/admin.communities.$slug.relist.server.ts` |
| `/api/admin/context-notes` | `GET` | `lib/context-notes/api/admin.context-notes.server.ts` |
| `/api/admin/context-notes/:id` | `PATCH` | `lib/context-notes/api/admin.context-notes.$id.server.ts` |
| `/api/admin/curated-builds/image` | `POST` | `lib/admin/api/admin.curated-builds.image.server.ts` |
| `/api/admin/curated-builds/image/:filename` | `GET` | `lib/admin/api/admin.curated-builds.image.$filename.server.ts` |
| `/api/admin/curated-builds/image/proxy` | `GET` | `lib/admin/api/admin.curated-builds.image.proxy.server.ts` |
| `/api/admin/deepseek/balance` | `GET` | `lib/ai/api/admin.deepseek.balance.server.ts` |
| `/api/admin/deepseek/history` | `GET` | `lib/ai/api/admin.deepseek.history.server.ts` |
| `/api/admin/deepseek/refresh` | `POST` | `lib/ai/api/admin.deepseek.refresh.server.ts` |
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
| `/api/admin/email/ai/design` | `GET` `POST` | `lib/admin/api/admin.email.ai.design.server.ts` |
| `/api/admin/email/ai/image` | `POST` | `lib/admin/api/admin.email.ai.image.server.ts` |
| `/api/admin/email/ai/rewrite` | `POST` | `lib/admin/api/admin.email.ai.rewrite.server.ts` |
| `/api/admin/email/campaigns` | `GET` `POST` | `lib/admin/api/admin.email.campaigns.server.ts` |
| `/api/admin/email/campaigns/:id/resume` | `POST` | `lib/admin/api/admin.email.campaigns.$id.resume.server.ts` |
| `/api/admin/email/preview` | `POST` | `lib/admin/api/admin.email.preview.server.ts` |
| `/api/admin/email/render` | `POST` | `lib/admin/api/admin.email.render.server.ts` |
| `/api/admin/email/test` | `POST` | `lib/admin/api/admin.email.test.server.ts` |
| `/api/admin/email/users` | `GET` | `lib/admin/api/admin.email.users.server.ts` |
| `/api/admin/emoji-packs` | `GET` | `lib/admin/api/admin.emoji-packs.server.ts` |
| `/api/admin/emoji-packs/:id` | `POST` | `lib/admin/api/admin.emoji-packs.$id.server.ts` |
| `/api/admin/feedback` | `GET` | `lib/feedback/api/admin.feedback.server.ts` |
| `/api/admin/feedback/:id` | `GET` `PATCH` | `lib/feedback/api/admin.feedback.$id.server.ts` |
| `/api/admin/flags` | `DELETE` `GET` `PUT` | `lib/admin/api/admin.flags.server.ts` |
| `/api/admin/flags/:key/check` | `GET` | `lib/admin/api/admin.flags.$key.check.server.ts` |
| `/api/admin/flags/:key/history` | `GET` | `lib/admin/api/admin.flags.$key.history.server.ts` |
| `/api/admin/flags/:key/targeting` | `GET` `PUT` | `lib/admin/api/admin.flags.$key.targeting.server.ts` |
| `/api/admin/forecasting/seasons` | `POST` | `lib/admin/api/admin.forecasting.seasons.server.ts` |
| `/api/admin/gift-exchanges/:id/verify` | `GET` | `lib/gifting/api/admin.gift-exchanges.$id.verify.server.ts` |
| `/api/admin/insights/cohorts` | `GET` `POST` | `lib/ops/api/admin.insights.cohorts.server.ts` |
| `/api/admin/insights/errors` | `GET` `PATCH` | `lib/ops/api/admin.insights.errors.server.ts` |
| `/api/admin/insights/experiments` | `GET` `PATCH` `POST` | `lib/ops/api/admin.insights.experiments.server.ts` |
| `/api/admin/insights/notices` | `DELETE` `GET` `POST` | `lib/ops/api/admin.insights.notices.server.ts` |
| `/api/admin/insights/routes` | `GET` | `lib/ops/api/admin.insights.routes.server.ts` |
| `/api/admin/jobs` | `GET` | `lib/admin/api/admin.jobs.server.ts` |
| `/api/admin/jobs/:queue` | `GET` | `lib/admin/api/admin.jobs.$queue.server.ts` |
| `/api/admin/jobs/:queue/:id` | `GET` | `lib/admin/api/admin.jobs.$queue.$id.server.ts` |
| `/api/admin/jobs/:queue/actions` | `POST` | `lib/admin/api/admin.jobs.$queue.actions.server.ts` |
| `/api/admin/library` | `GET` | `lib/library/api/admin.library.server.ts` |
| `/api/admin/library/:id` | `DELETE` `PATCH` | `lib/library/api/admin.library.$id.server.ts` |
| `/api/admin/library/migrate` | `POST` | `lib/library/api/admin.library.migrate.server.ts` |
| `/api/admin/library/quota-requests` | `GET` `POST` | `lib/library/api/admin.library.quota-requests.server.ts` |
| `/api/admin/library/reorder` | `POST` | `lib/library/api/admin.library.reorder.server.ts` |
| `/api/admin/library/storage-health` | `GET` | `lib/library/api/admin.library.storage-health.server.ts` |
| `/api/admin/link-rules` | `DELETE` `GET` `POST` | `lib/admin/api/admin.link-rules.server.ts` |
| `/api/admin/lookup` | `GET` `POST` | `lib/admin/api/admin.lookup.server.ts` |
| `/api/admin/market` | `GET` | `lib/admin/api/admin.market.server.ts` |
| `/api/admin/market/:id` | `POST` | `lib/admin/api/admin.market.$id.server.ts` |
| `/api/admin/media-sweep` | `GET` | `lib/media/api/admin.media-sweep.server.ts` |
| `/api/admin/media-sweep/preview` | `POST` | `lib/media/api/admin.media-sweep.preview.server.ts` |
| `/api/admin/media-sweep/run` | `POST` | `lib/media/api/admin.media-sweep.run.server.ts` |
| `/api/admin/medschools/alias-misses` | `GET` | `features/medschools/api/admin.medschools.alias-misses.server.ts` |
| `/api/admin/medschools/alias-misses/ignore` | `POST` | `features/medschools/api/admin.medschools.alias-misses.ignore.server.ts` |
| `/api/admin/medschools/alias-misses/map` | `POST` | `features/medschools/api/admin.medschools.alias-misses.map.server.ts` |
| `/api/admin/mod-macros` | `DELETE` `GET` `POST` | `lib/admin/api/admin.mod-macros.server.ts` |
| `/api/admin/moderation/content` | `POST` | `lib/moderation/api/admin.moderation.content.server.ts` |
| `/api/admin/oncall` | `GET` | `lib/admin/api/admin.oncall.server.ts` |
| `/api/admin/oncall-rules` | `GET` `PATCH` | `lib/admin/api/admin.oncall-rules.server.ts` |
| `/api/admin/oncall-series` | `GET` | `lib/admin/api/admin.oncall-series.server.ts` |
| `/api/admin/outbox` | `GET` | `lib/admin/api/admin.outbox.server.ts` |
| `/api/admin/outbox/actions` | `POST` | `lib/admin/api/admin.outbox.actions.server.ts` |
| `/api/admin/outbox/events` | `GET` | `lib/admin/api/admin.outbox.events.server.ts` |
| `/api/admin/outbox/events/:id` | `GET` | `lib/admin/api/admin.outbox.events.$id.server.ts` |
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
| `/api/admin/release-notes` | `GET` `POST` | `lib/developer/api/admin.release-notes.server.ts` |
| `/api/admin/release-notes/:id` | `DELETE` `PATCH` | `lib/developer/api/admin.release-notes.$id.server.ts` |
| `/api/admin/release-notes/draft` | `POST` | `lib/developer/api/admin.release-notes.draft.server.ts` |
| `/api/admin/reports` | `GET` | `lib/admin/api/admin.reports.server.ts` |
| `/api/admin/reports/:id` | `POST` | `lib/admin/api/admin.reports.$id.server.ts` |
| `/api/admin/reports/groups` | `GET` | `lib/admin/api/admin.reports.groups.server.ts` |
| `/api/admin/reports/groups/decide` | `POST` | `lib/admin/api/admin.reports.groups.decide.server.ts` |
| `/api/admin/restrictions/:id` | `DELETE` | `lib/moderation/api/admin.restrictions.$id.server.ts` |
| `/api/admin/review-counts` | `GET` | `lib/admin/api/admin.review-counts.server.ts` |
| `/api/admin/rideshare/applications` | `GET` `PATCH` | `lib/rideshare/api/admin.rideshare.applications.server.ts` |
| `/api/admin/rideshare/rides` | `GET` | `lib/rideshare/api/admin.rideshare.rides.server.ts` |
| `/api/admin/studio-challenges` | `POST` | `lib/creator/api/admin.studio-challenges.server.ts` |
| `/api/admin/studio-challenges/upload` | `POST` | `lib/creator/api/admin.studio-challenges.upload.server.ts` |
| `/api/admin/sweeps` | `GET` `POST` | `lib/admin/api/admin.sweeps.server.ts` |
| `/api/admin/sweeps/:id` | `POST` | `lib/admin/api/admin.sweeps.$id.server.ts` |
| `/api/admin/sweeps/:id/undo` | `POST` | `lib/admin/api/admin.sweeps.$id.undo.server.ts` |
| `/api/admin/users` | `GET` `PATCH` | `lib/admin/api/admin.users.server.ts` |
| `/api/admin/users/:id/ban` | `POST` | `lib/admin/api/admin.users.$id.ban.server.ts` |
| `/api/admin/users/:id/coins` | `GET` `POST` | `lib/admin/api/admin.users.$id.coins.server.ts` |
| `/api/admin/users/:id/coins/:adjustmentId/reverse` | `POST` | `lib/admin/api/admin.users.$id.coins.$adjustmentId.reverse.server.ts` |
| `/api/admin/users/:id/grant-membership` | `POST` | `lib/admin/api/admin.users.$id.grant-membership.server.ts` |
| `/api/admin/users/:id/moderation` | `GET` | `lib/moderation/api/admin.users.$id.moderation.server.ts` |
| `/api/admin/users/:id/notes` | `GET` `POST` | `lib/moderation/api/admin.users.$id.notes.server.ts` |
| `/api/admin/users/:id/notes/:noteId` | `DELETE` `PATCH` | `lib/moderation/api/admin.users.$id.notes.$noteId.server.ts` |
| `/api/admin/users/:id/owned-communities` | `GET` | `lib/admin/api/admin.users.$id.owned-communities.server.ts` |
| `/api/admin/users/:id/restrictions` | `POST` | `lib/moderation/api/admin.users.$id.restrictions.server.ts` |
| `/api/admin/users/:id/secure` | `GET` `POST` | `lib/admin/api/admin.users.$id.secure.server.ts` |
| `/api/admin/users/:id/strike` | `POST` | `lib/admin/api/admin.users.$id.strike.server.ts` |
| `/api/admin/vibe/backfill-thumbs` | `POST` | `lib/rmhvibe/api/admin.vibe.backfill-thumbs.server.ts` |
| `/api/admin/view-as` | `GET` | `lib/admin/api/admin.view-as.server.ts` |
| `/api/admin/wager/:id/resolve` | `POST` | `lib/wager/api/admin.wager.$id.resolve.server.ts` |
| `/api/admin/webhooks` | `GET` | `lib/admin/api/admin.webhooks.server.ts` |
| `/api/admin/webhooks/:id` | `GET` `PATCH` | `lib/admin/api/admin.webhooks.$id.server.ts` |

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

## `/api/analytics`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/analytics/audience` | `GET` | `lib/social/api/analytics.audience.server.ts` |

## `/api/arcade`

14 routes.

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
| `/api/arcade/patch-notes/:id` | `DELETE` `PATCH` | `lib/arcade/api/arcade.patch-notes.$id.server.ts` |
| `/api/arcade/patch-notes/admin/:gameId` | `GET` | `lib/arcade/api/arcade.patch-notes.admin.$gameId.server.ts` |
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

## `/api/blog`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/blog/:slug/comments` | `GET` `POST` | `lib/blog/api/blog.$slug.comments.server.ts` |
| `/api/blog/comments/:id` | `DELETE` | `lib/blog/api/blog.comments.$id.server.ts` |
| `/api/blog/media/:filename` | `GET` | `lib/media/api/blog.media.$filename.server.ts` |

## `/api/builds`

9 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/builds/:id/issues` | `GET` `POST` | `lib/builds/api/builds.$id.issues.server.ts` |
| `/api/builds/:id/issues/:issueId` | `PATCH` | `lib/builds/api/builds.$id.issues.$issueId.server.ts` |
| `/api/builds/:id/issues/:issueId/close` | `POST` | `lib/builds/api/builds.$id.issues.$issueId.close.server.ts` |
| `/api/builds/:id/issues/:issueId/hide` | `POST` | `lib/builds/api/builds.$id.issues.$issueId.hide.server.ts` |
| `/api/builds/:id/issues/:issueId/status` | `POST` | `lib/builds/api/builds.$id.issues.$issueId.status.server.ts` |
| `/api/builds/:id/issues/:issueId/vote` | `PUT` | `lib/builds/api/builds.$id.issues.$issueId.vote.server.ts` |
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

52 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/communities` | `GET` `POST` | `lib/communities/api/communities.server.ts` |
| `/api/communities/:slug` | `GET` | `lib/communities/api/communities.$slug.server.ts` |
| `/api/communities/:slug/alerts` | `GET` `PUT` | `lib/communities/api/communities.$slug.alerts.server.ts` |
| `/api/communities/:slug/announcements` | `GET` `POST` | `lib/communities/api/communities.$slug.announcements.server.ts` |
| `/api/communities/:slug/announcements/:id` | `DELETE` | `lib/communities/api/communities.$slug.announcements.$id.server.ts` |
| `/api/communities/:slug/automod` | `GET` `POST` | `lib/communities/api/communities.$slug.automod.server.ts` |
| `/api/communities/:slug/automod/:ruleId` | `DELETE` `PATCH` | `lib/communities/api/communities.$slug.automod.$ruleId.server.ts` |
| `/api/communities/:slug/bans` | `GET` `POST` | `lib/communities/api/communities.$slug.bans.server.ts` |
| `/api/communities/:slug/bans/:banId` | `DELETE` | `lib/communities/api/communities.$slug.bans.$banId.server.ts` |
| `/api/communities/:slug/census` | `GET` `POST` | `lib/communities/api/communities.$slug.census.server.ts` |
| `/api/communities/:slug/census/:id/answer` | `POST` | `lib/communities/api/communities.$slug.census.$id.answer.server.ts` |
| `/api/communities/:slug/census/:id/close` | `POST` | `lib/communities/api/communities.$slug.census.$id.close.server.ts` |
| `/api/communities/:slug/challenge` | `GET` `POST` | `lib/communities/api/communities.$slug.challenge.server.ts` |
| `/api/communities/:slug/challenge/:id` | `DELETE` | `lib/communities/api/communities.$slug.challenge.$id.server.ts` |
| `/api/communities/:slug/challenge/vote` | `POST` | `lib/communities/api/communities.$slug.challenge.vote.server.ts` |
| `/api/communities/:slug/contributors` | `GET` | `lib/communities/api/communities.$slug.contributors.server.ts` |
| `/api/communities/:slug/events` | `GET` | `lib/communities/api/communities.$slug.events.server.ts` |
| `/api/communities/:slug/extras` | `GET` | `lib/communities/api/communities.$slug.extras.server.ts` |
| `/api/communities/:slug/feed` | `GET` | `lib/communities/api/communities.$slug.feed.server.ts` |
| `/api/communities/:slug/flair-follows` | `PUT` | `lib/communities/api/communities.$slug.flair-follows.server.ts` |
| `/api/communities/:slug/flairs` | `POST` | `lib/communities/api/communities.$slug.flairs.server.ts` |
| `/api/communities/:slug/flairs/:flairId` | `DELETE` `PATCH` | `lib/communities/api/communities.$slug.flairs.$flairId.server.ts` |
| `/api/communities/:slug/handover` | `DELETE` `GET` `POST` | `lib/communities/api/communities.$slug.handover.server.ts` |
| `/api/communities/:slug/handover/respond` | `POST` | `lib/communities/api/communities.$slug.handover.respond.server.ts` |
| `/api/communities/:slug/insights` | `GET` | `lib/communities/api/communities.$slug.insights.server.ts` |
| `/api/communities/:slug/invites` | `GET` `POST` | `lib/communities/api/communities.$slug.invites.server.ts` |
| `/api/communities/:slug/invites/:id` | `DELETE` | `lib/communities/api/communities.$slug.invites.$id.server.ts` |
| `/api/communities/:slug/join` | `POST` | `lib/communities/api/communities.$slug.join.server.ts` |
| `/api/communities/:slug/join-request` | `DELETE` `POST` | `lib/communities/api/communities.$slug.join-request.server.ts` |
| `/api/communities/:slug/join-requests` | `GET` | `lib/communities/api/communities.$slug.join-requests.server.ts` |
| `/api/communities/:slug/join-requests/:id` | `POST` | `lib/communities/api/communities.$slug.join-requests.$id.server.ts` |
| `/api/communities/:slug/macros` | `DELETE` `GET` `POST` | `lib/communities/api/communities.$slug.macros.server.ts` |
| `/api/communities/:slug/members` | `GET` | `lib/communities/api/communities.$slug.members.server.ts` |
| `/api/communities/:slug/members/:userId` | `DELETE` `PATCH` | `lib/communities/api/communities.$slug.members.$userId.server.ts` |
| `/api/communities/:slug/modlog` | `GET` | `lib/communities/api/communities.$slug.modlog.server.ts` |
| `/api/communities/:slug/modlog/export` | `GET` | `lib/communities/api/communities.$slug.modlog.export.server.ts` |
| `/api/communities/:slug/modqueue` | `GET` | `lib/communities/api/communities.$slug.modqueue.server.ts` |
| `/api/communities/:slug/modqueue/:itemId` | `POST` | `lib/communities/api/communities.$slug.modqueue.$itemId.server.ts` |
| `/api/communities/:slug/my-standing` | `GET` | `lib/communities/api/communities.$slug.my-standing.server.ts` |
| `/api/communities/:slug/notes/:userId` | `GET` `POST` | `lib/communities/api/communities.$slug.notes.$userId.server.ts` |
| `/api/communities/:slug/notes/:userId/:noteId` | `DELETE` `PATCH` | `lib/communities/api/communities.$slug.notes.$userId.$noteId.server.ts` |
| `/api/communities/:slug/notes/counts` | `GET` | `lib/communities/api/communities.$slug.notes.counts.server.ts` |
| `/api/communities/:slug/onboarding` | `GET` `POST` `PUT` | `lib/communities/api/communities.$slug.onboarding.server.ts` |
| `/api/communities/:slug/pins` | `GET` `POST` `PUT` | `lib/communities/api/communities.$slug.pins.server.ts` |
| `/api/communities/:slug/pins/:postId` | `DELETE` | `lib/communities/api/communities.$slug.pins.$postId.server.ts` |
| `/api/communities/:slug/recurring` | `GET` `POST` | `lib/communities/api/communities.$slug.recurring.server.ts` |
| `/api/communities/:slug/recurring/:id` | `DELETE` `PATCH` `POST` | `lib/communities/api/communities.$slug.recurring.$id.server.ts` |
| `/api/communities/:slug/report` | `POST` | `lib/communities/api/communities.$slug.report.server.ts` |
| `/api/communities/:slug/rules` | `GET` `PUT` | `lib/communities/api/communities.$slug.rules.server.ts` |
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

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/daily-puzzles/leaderboard` | `GET` | `lib/daily-puzzles/api/daily-puzzles.leaderboard.server.ts` |
| `/api/daily-puzzles/puzzle` | `GET` | `lib/daily-puzzles/api/daily-puzzles.puzzle.server.ts` |
| `/api/daily-puzzles/results` | `GET` | `lib/daily-puzzles/api/daily-puzzles.results.server.ts` |
| `/api/daily-puzzles/score` | `POST` | `lib/daily-puzzles/api/daily-puzzles.score.server.ts` |
| `/api/daily-puzzles/stats` | `GET` | `lib/daily-puzzles/api/daily-puzzles.stats.server.ts` |

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

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/developer/keys` | `GET` `POST` | `lib/developer/api/developer.keys.server.ts` |
| `/api/developer/keys/:id` | `DELETE` `PATCH` | `lib/developer/api/developer.keys.$id.server.ts` |
| `/api/developer/keys/:id/usage` | `GET` | `lib/developer/api/developer.keys.$id.usage.server.ts` |
| `/api/developer/webhooks` | `GET` `POST` | `lib/developer/api/developer.webhooks.server.ts` |
| `/api/developer/webhooks/:id` | `DELETE` `GET` `PATCH` | `lib/developer/api/developer.webhooks.$id.server.ts` |
| `/api/developer/webhooks/:id/rotate` | `POST` | `lib/developer/api/developer.webhooks.$id.rotate.server.ts` |
| `/api/developer/webhooks/:id/test` | `POST` | `lib/developer/api/developer.webhooks.$id.test.server.ts` |
| `/api/developer/webhooks/deliveries/:id/redeliver` | `POST` | `lib/developer/api/developer.webhooks.deliveries.$id.redeliver.server.ts` |

## `/api/discord`

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/discord/activity-image` | `GET` | `app/routes/api/discord/activity-image.ts` |
| `/api/discord/daily-progress` | `GET` `POST` | `app/routes/api/discord/daily-progress.ts` |
| `/api/discord/embed` | `GET` `POST` | `app/routes/api/discord/embed.ts` |
| `/api/discord/race` | `GET` `POST` | `app/routes/api/discord/race.ts` |
| `/api/discord/sync-score` | `POST` | `lib/api/routes/discord.sync-score.server.ts` |
| `/api/discord/token` | `POST` | `lib/api/routes/discord.token.server.ts` |
| `/api/discord/vibe-launch` | `GET` | `lib/rmhvibe/api/discord.vibe-launch.server.ts` |

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

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/events` | `GET` `POST` | `lib/calendar/api/events.server.ts` |
| `/api/events/:id` | `DELETE` `GET` `PATCH` | `app/routes/api/events/$id/index.ts` |
| `/api/events/:id/cohosts` | `DELETE` `GET` `POST` | `lib/events/api/events.$id.cohosts.server.ts` |
| `/api/events/:id/cohosts/respond` | `POST` | `lib/events/api/events.$id.cohosts.respond.server.ts` |
| `/api/events/:id/ics` | `GET` | `app/routes/api/events/$id/ics.ts` |
| `/api/events/:id/occurrences` | `DELETE` `PUT` | `lib/events/api/events.$id.occurrences.server.ts` |
| `/api/events/:id/rsvp` | `DELETE` `POST` | `lib/api/routes/events.$id.rsvp.server.ts` |
| `/api/events/:id/updates` | `GET` `POST` | `lib/events/api/events.$id.updates.server.ts` |
| `/api/events/:id/updates/:updateId` | `DELETE` | `lib/events/api/events.$id.updates.$updateId.server.ts` |
| `/api/events/:id/updates/recipients` | `GET` | `lib/events/api/events.$id.updates.recipients.server.ts` |
| `/api/events/:id/waitlist` | `DELETE` `GET` | `lib/events/api/events.$id.waitlist.server.ts` |

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

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feed/hashtag-search` | `GET` | `lib/feed/api/feed.hashtag-search.server.ts` |
| `/api/feed/image/:filename` | `GET` | `app/routes/api/feed/image/$filename.ts` |
| `/api/feed/mention-search` | `GET` | `lib/feed/api/feed.mention-search.server.ts` |
| `/api/feed/repost-mutes` | `GET` `POST` | `lib/feed/api/feed.repost-mutes.server.ts` |
| `/api/feed/signal` | `DELETE` `GET` `POST` | `lib/feed/api/feed.signal.server.ts` |
| `/api/feed/stream` | `GET` | `app/routes/api/feed/stream.ts` |

## `/api/feedback`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feedback` | `POST` | `lib/api/routes/feedback.server.ts` |
| `/api/feedback/mine` | `GET` | `lib/feedback/api/feedback.mine.server.ts` |

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

## `/api/follows`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/follows` | `GET` | `lib/social/api/follows.server.ts` |
| `/api/follows/bulk-unfollow` | `POST` | `lib/social/api/follows.bulk-unfollow.server.ts` |
| `/api/follows/remove` | `POST` | `lib/social/api/follows.remove.server.ts` |
| `/api/follows/undo` | `POST` | `lib/social/api/follows.undo.server.ts` |

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

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/game-saves` | `GET` | `lib/game-saves/api/game-saves.server.ts` |
| `/api/game-saves/:gameId` | `DELETE` `GET` `POST` | `lib/game-saves/api/game-saves.$gameId.server.ts` |
| `/api/game-saves/:gameId/restore` | `POST` | `lib/game-saves/api/game-saves.$gameId.restore.server.ts` |
| `/api/game-saves/:gameId/snapshots` | `GET` | `lib/game-saves/api/game-saves.$gameId.snapshots.server.ts` |
| `/api/game-saves/:gameId/snapshots/:id` | `GET` | `lib/game-saves/api/game-saves.$gameId.snapshots.$id.server.ts` |

## `/api/games`

37 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/games/:gameId/assist-run` | `POST` | `lib/game/api/games.$gameId.assist-run.server.ts` |
| `/api/games/:gameId/follow` | `DELETE` `GET` `PUT` | `lib/arcade/api/games.$gameId.follow.server.ts` |
| `/api/games/:gameId/updates` | `GET` | `lib/arcade/api/games.$gameId.updates.server.ts` |
| `/api/games/:id/guides` | `GET` | `lib/games/api/games.$id.guides.server.ts` |
| `/api/games/:id/leaderboard` | `GET` | `lib/game/api/games.$id.leaderboard.server.ts` |
| `/api/games/:id/personal-bests` | `DELETE` `GET` | `lib/game/api/games.$id.personal-bests.server.ts` |
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
| `/api/games/how-to-play` | `POST` | `lib/developer/api/games.how-to-play.server.ts` |
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

15 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/group-chats` | `GET` `POST` | `lib/group-chat/api/group-chats.server.ts` |
| `/api/group-chats/:id` | `GET` | `lib/group-chat/api/group-chats.$id.server.ts` |
| `/api/group-chats/:id/invites` | `GET` `POST` | `lib/group-chat/api/group-chats.$id.invites.server.ts` |
| `/api/group-chats/:id/invites/:inviteId` | `DELETE` | `lib/group-chat/api/group-chats.$id.invites.$inviteId.server.ts` |
| `/api/group-chats/:id/leave` | `POST` | `lib/group-chat/api/group-chats.$id.leave.server.ts` |
| `/api/group-chats/:id/manage` | `PATCH` | `lib/group-chat/api/group-chats.$id.manage.server.ts` |
| `/api/group-chats/:id/members` | `POST` | `lib/group-chat/api/group-chats.$id.members.server.ts` |
| `/api/group-chats/:id/members/:userId` | `DELETE` | `lib/group-chat/api/group-chats.$id.members.$userId.server.ts` |
| `/api/group-chats/:id/members/:userId/role` | `PUT` | `lib/group-chat/api/group-chats.$id.members.$userId.role.server.ts` |
| `/api/group-chats/:id/mentions` | `GET` | `lib/group-chat/api/group-chats.$id.mentions.server.ts` |
| `/api/group-chats/:id/messages` | `GET` `POST` | `lib/group-chat/api/group-chats.$id.messages.server.ts` |
| `/api/group-chats/:id/messages/:messageId/vote` | `POST` | `lib/group-chat/api/group-chats.$id.messages.$messageId.vote.server.ts` |
| `/api/group-chats/:id/owner` | `PUT` | `lib/group-chat/api/group-chats.$id.owner.server.ts` |
| `/api/group-chats/:id/react` | `POST` | `lib/group-chat/api/group-chats.$id.react.server.ts` |
| `/api/group-chats/:id/stream` | `GET` | `app/routes/api/group-chats/$id/stream.ts` |

## `/api/group-invites`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/group-invites/:code/join` | `POST` | `lib/group-chat/api/group-invites.$code.join.server.ts` |

## `/api/groupcalls`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/groupcalls/active` | `GET` | `lib/api/routes/groupcalls.active.server.ts` |
| `/api/groupcalls/history` | `GET` | `lib/api/routes/groupcalls.history.server.ts` |
| `/api/groupcalls/invitable` | `GET` | `lib/api/routes/groupcalls.invitable.server.ts` |

## `/api/guides`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/guides` | `POST` | `lib/games/api/guides.server.ts` |
| `/api/guides/:id` | `DELETE` `GET` `PUT` | `lib/games/api/guides.$id.server.ts` |
| `/api/guides/:id/publish` | `POST` | `lib/games/api/guides.$id.publish.server.ts` |
| `/api/guides/:id/revisions` | `GET` | `lib/games/api/guides.$id.revisions.server.ts` |
| `/api/guides/:id/revisions/:revisionId` | `GET` | `lib/games/api/guides.$id.revisions.$revisionId.server.ts` |
| `/api/guides/:id/revisions/:revisionId/restore` | `POST` | `lib/games/api/guides.$id.revisions.$revisionId.restore.server.ts` |

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

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/history` | `DELETE` `GET` `PUT` | `lib/shop/api/history.server.ts` |
| `/api/history/:id` | `DELETE` | `lib/shop/api/history.$id.server.ts` |
| `/api/history/beat` | `POST` | `lib/history/api/history.beat.server.ts` |
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
| `/api/image-proxy` | `GET` | `lib/api/routes/image-proxy.server.ts` |

## `/api/internal`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/internal/call-auto-reply` | `POST` | `lib/call/api/internal.call-auto-reply.server.ts` |
| `/api/internal/match-result` | `POST` | `app/routes/api/internal/match-result.ts` |
| `/api/internal/notify-message` | `POST` | `app/routes/api/internal/notify-message.ts` |
| `/api/internal/notify-typing` | `POST` | `app/routes/api/internal/notify-typing.ts` |
| `/api/internal/ops/deploy-event` | `POST` | `lib/api/routes/internal.ops.deploy-event.server.ts` |
| `/api/internal/ops/post-deploy-health` | `GET` | `lib/ops/api/internal.ops.post-deploy-health.server.ts` |
| `/api/internal/predictions-tick` | `POST` | `app/routes/api/internal/predictions-tick.ts` |
| `/api/internal/streak-push` | `POST` | `app/routes/api/internal/streak-push.ts` |

## `/api/jams`

10 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/jams` | `GET` `POST` | `lib/competitive/api/jams.server.ts` |
| `/api/jams/:slug` | `GET` | `lib/competitive/api/jams.$slug.server.ts` |
| `/api/jams/:slug/entries/:entryId/feedback` | `GET` | `lib/competitive/api/jams.$slug.entries.$entryId.feedback.server.ts` |
| `/api/jams/:slug/entries/:entryId/team` | `DELETE` `GET` `POST` | `lib/competitive/api/jams.$slug.entries.$entryId.team.server.ts` |
| `/api/jams/:slug/entries/:entryId/team/respond` | `POST` | `lib/competitive/api/jams.$slug.entries.$entryId.team.respond.server.ts` |
| `/api/jams/:slug/entry` | `POST` | `lib/competitive/api/jams.$slug.entry.server.ts` |
| `/api/jams/:slug/feedback/:id/helpful` | `DELETE` `POST` | `lib/competitive/api/jams.$slug.feedback.$id.helpful.server.ts` |
| `/api/jams/:slug/rate` | `POST` | `lib/competitive/api/jams.$slug.rate.server.ts` |
| `/api/jams/:slug/theme-candidates` | `PUT` | `lib/competitive/api/jams.$slug.theme-candidates.server.ts` |
| `/api/jams/:slug/theme-vote` | `GET` `PUT` | `lib/competitive/api/jams.$slug.theme-vote.server.ts` |

## `/api/kaikai-debt`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/kaikai-debt` | `GET` | `lib/kaikai-debt/api/kaikai-debt.server.ts` |
| `/api/kaikai-debt/ask` | `POST` | `app/routes/api/kaikai-debt/ask.ts` |
| `/api/kaikai-debt/entries` | `POST` | `lib/kaikai-debt/api/kaikai-debt.entries.server.ts` |
| `/api/kaikai-debt/ledger` | `GET` | `lib/kaikai-debt/api/kaikai-debt.ledger.server.ts` |
| `/api/kaikai-debt/stats` | `GET` | `lib/kaikai-debt/api/kaikai-debt.stats.server.ts` |
| `/api/kaikai-debt/stream` | `GET` | `app/routes/api/kaikai-debt/stream.ts` |

## `/api/kudos`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/kudos/:id` | `DELETE` | `lib/gifting/api/kudos.$id.server.ts` |

## `/api/laundry-sort`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/laundry-sort/leaderboard` | `GET` | `features/laundry-sort/api/laundry-sort.leaderboard.server.ts` |
| `/api/laundry-sort/score` | `POST` | `features/laundry-sort/api/laundry-sort.score.server.ts` |

## `/api/leaderboards`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/leaderboards/:gameId` | `GET` | `lib/game/api/leaderboards.$gameId.server.ts` |
| `/api/leaderboards/players` | `GET` | `lib/api/routes/leaderboards.players.server.ts` |

## `/api/library`

12 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/library/:slug` | `DELETE` `POST` | `lib/library/api/library.$slug.server.ts` |
| `/api/library/:slug/marks` | `DELETE` `GET` `PUT` | `lib/library/api/library.$slug.marks.server.ts` |
| `/api/library/collection/:id` | `DELETE` `PATCH` | `lib/library/api/library.collection.$id.server.ts` |
| `/api/library/collection/:id/cover` | `POST` | `lib/library/api/library.collection.$id.cover.server.ts` |
| `/api/library/collection/:id/items` | `DELETE` `PATCH` `POST` | `lib/library/api/library.collection.$id.items.server.ts` |
| `/api/library/collections` | `GET` `POST` | `lib/library/api/library.collections.server.ts` |
| `/api/library/continue` | `GET` | `lib/library/api/library.continue.server.ts` |
| `/api/library/cover/:id` | `GET` | `lib/library/api/library.cover.$id.server.ts` |
| `/api/library/draft` | `POST` | `lib/library/api/library.draft.server.ts` |
| `/api/library/file/:id` | `GET` | `app/routes/api/library/file/$id.ts` |
| `/api/library/quota` | `GET` `POST` | `lib/library/api/library.quota.server.ts` |
| `/api/library/upload` | `POST` | `lib/library/api/library.upload.server.ts` |

## `/api/links`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/links/check` | `POST` | `lib/api/routes/links.check.server.ts` |

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
| `/api/marathon-lists` | `GET` `POST` | `lib/tools/api/marathon-lists.server.ts` |
| `/api/marathon-lists/:id` | `DELETE` `PUT` | `lib/tools/api/marathon-lists.$id.server.ts` |
| `/api/marathon-lists/shared/:shareId` | `GET` | `lib/tools/api/marathon-lists.shared.$shareId.server.ts` |

## `/api/market`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/market/listings` | `GET` `POST` | `lib/market/api/market.listings.server.ts` |
| `/api/market/listings/:id` | `DELETE` | `lib/market/api/market.listings.$id.server.ts` |
| `/api/market/listings/:id/buy` | `POST` | `lib/market/api/market.listings.$id.buy.server.ts` |

## `/api/medschools`

23 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/medschools/live` | `GET` | `features/medschools/api/medschools.live.server.ts` |
| `/api/medschools/me/ask` | `GET` `POST` | `features/medschools/api/medschools.me.ask.server.ts` |
| `/api/medschools/me/chances` | `GET` | `features/medschools/api/medschools.me.chances.server.ts` |
| `/api/medschools/me/list-items` | `POST` | `features/medschools/api/medschools.me.list-items.server.ts` |
| `/api/medschools/me/list-order` | `PUT` | `features/medschools/api/medschools.me.list-order.server.ts` |
| `/api/medschools/me/lists` | `GET` `POST` | `features/medschools/api/medschools.me.lists.server.ts` |
| `/api/medschools/me/lists/:id` | `DELETE` `PATCH` | `features/medschools/api/medschools.me.lists.$id.server.ts` |
| `/api/medschools/me/lists/:id/add-to-tracker` | `POST` | `features/medschools/api/medschools.me.lists.$id.add-to-tracker.server.ts` |
| `/api/medschools/me/lists/:id/item-order` | `PUT` | `features/medschools/api/medschools.me.lists.$id.item-order.server.ts` |
| `/api/medschools/me/lists/:id/items/:itemId` | `DELETE` `PATCH` | `features/medschools/api/medschools.me.lists.$id.items.$itemId.server.ts` |
| `/api/medschools/me/prefs` | `GET` `PUT` | `features/medschools/api/medschools.me.prefs.server.ts` |
| `/api/medschools/me/tracker` | `GET` | `features/medschools/api/medschools.me.tracker.server.ts` |
| `/api/medschools/me/tracker/applications` | `POST` | `features/medschools/api/medschools.me.tracker.applications.server.ts` |
| `/api/medschools/me/tracker/applications/:id` | `DELETE` `PATCH` | `features/medschools/api/medschools.me.tracker.applications.$id.server.ts` |
| `/api/medschools/me/tracker/applications/:id/milestones/:type` | `DELETE` `PUT` | `features/medschools/api/medschools.me.tracker.applications.$id.milestones.$type.server.ts` |
| `/api/medschools/me/tracker/cycle` | `DELETE` `PUT` | `features/medschools/api/medschools.me.tracker.cycle.server.ts` |
| `/api/medschools/schools` | `GET` | `features/medschools/api/medschools.schools.server.ts` |
| `/api/medschools/schools/:slug` | `GET` | `features/medschools/api/medschools.schools.$slug.server.ts` |
| `/api/medschools/schools/:slug/activity` | `GET` | `features/medschools/api/medschools.schools.$slug.activity.server.ts` |
| `/api/medschools/schools/:slug/arrivals` | `GET` | `features/medschools/api/medschools.schools.$slug.arrivals.server.ts` |
| `/api/medschools/schools/:slug/forecast` | `GET` | `features/medschools/api/medschools.schools.$slug.forecast.server.ts` |
| `/api/medschools/schools/:slug/history` | `GET` | `features/medschools/api/medschools.schools.$slug.history.server.ts` |
| `/api/medschools/today` | `GET` | `features/medschools/api/medschools.today.server.ts` |

## `/api/memory`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/memory` | `DELETE` `GET` `POST` | `lib/ai/api/memory.server.ts` |

## `/api/messages`

26 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/messages` | `GET` `POST` | `lib/messages/api/messages.server.ts` |
| `/api/messages/:conversationId` | `GET` `POST` | `lib/messages/api/messages.$conversationId.server.ts` |
| `/api/messages/:conversationId/alt` | `PATCH` | `lib/messages/api/messages.$conversationId.alt.server.ts` |
| `/api/messages/:conversationId/edit` | `POST` | `lib/messages/api/messages.$conversationId.edit.server.ts` |
| `/api/messages/:conversationId/hide` | `POST` | `lib/messages/api/messages.$conversationId.hide.server.ts` |
| `/api/messages/:conversationId/mutations` | `GET` | `lib/messages/api/messages.$conversationId.mutations.server.ts` |
| `/api/messages/:conversationId/react` | `POST` | `lib/messages/api/messages.$conversationId.react.server.ts` |
| `/api/messages/:conversationId/read` | `POST` | `lib/messages/api/messages.$conversationId.read.server.ts` |
| `/api/messages/:conversationId/thread` | `GET` | `lib/messages/api/messages.$conversationId.thread.server.ts` |
| `/api/messages/:conversationId/typing` | `POST` | `lib/messages/api/messages.$conversationId.typing.server.ts` |
| `/api/messages/:conversationId/unsend` | `POST` | `lib/messages/api/messages.$conversationId.unsend.server.ts` |
| `/api/messages/:conversationId/voice` | `POST` | `lib/messages/api/messages.$conversationId.voice.server.ts` |
| `/api/messages/away` | `DELETE` `GET` `PUT` | `lib/messages/api/messages.away.server.ts` |
| `/api/messages/away/:userId/status` | `GET` | `lib/messages/api/messages.away.$userId.status.server.ts` |
| `/api/messages/read-all` | `POST` | `lib/messages/api/messages.read-all.server.ts` |
| `/api/messages/requests` | `GET` | `lib/messages/api/messages.requests.server.ts` |
| `/api/messages/requests/:id` | `POST` | `lib/messages/api/messages.requests.$id.server.ts` |
| `/api/messages/saved` | `GET` `POST` | `lib/messages/api/messages.saved.server.ts` |
| `/api/messages/scheduled` | `GET` `POST` | `lib/messages/api/messages.scheduled.server.ts` |
| `/api/messages/scheduled/:id` | `DELETE` `PATCH` | `lib/messages/api/messages.scheduled.$id.server.ts` |
| `/api/messages/scheduled/:id/send-now` | `POST` | `lib/messages/api/messages.scheduled.$id.send-now.server.ts` |
| `/api/messages/search` | `GET` | `lib/messages/api/messages.search.server.ts` |
| `/api/messages/sidebar` | `GET` | `lib/messages/api/messages.sidebar.server.ts` |
| `/api/messages/stream` | `GET` | `app/routes/api/messages/stream.ts` |
| `/api/messages/unread-count` | `GET` | `lib/messages/api/messages.unread-count.server.ts` |
| `/api/messages/voice/:filename` | `GET` | `lib/messages/api/messages.voice.$filename.server.ts` |

## `/api/moderation`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/moderation/block` | `GET` `POST` | `lib/moderation/api/moderation.block.server.ts` |
| `/api/moderation/mute` | `GET` `POST` | `lib/moderation/api/moderation.mute.server.ts` |
| `/api/moderation/report` | `POST` | `lib/moderation/api/moderation.report.server.ts` |

## `/api/moments`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/moments` | `POST` | `lib/api/routes/moments.server.ts` |

## `/api/museum`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/museum` | `GET` | `lib/delight/api/museum.server.ts` |

## `/api/neon-driftway`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/neon-driftway/leaderboard` | `GET` | `lib/neon-driftway/api/neon-driftway.leaderboard.server.ts` |
| `/api/neon-driftway/livery` | `GET` `PUT` | `lib/neon-driftway/api/neon-driftway.livery.server.ts` |
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
| `/api/notices/active` | `GET` | `lib/ops/api/notices.active.server.ts` |
| `/api/notices/dismiss` | `POST` | `lib/ops/api/notices.dismiss.server.ts` |

## `/api/notifications`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/notifications` | `GET` | `lib/preferences/api/notifications.server.ts` |
| `/api/notifications/:id` | `DELETE` `PATCH` | `lib/notifications/api/notifications.$id.server.ts` |
| `/api/notifications/dismiss` | `POST` | `lib/notifications/api/notifications.dismiss.server.ts` |
| `/api/notifications/preferences` | `GET` `PUT` | `lib/preferences/api/notifications.preferences.server.ts` |
| `/api/notifications/read` | `POST` | `lib/preferences/api/notifications.read.server.ts` |

## `/api/oembed`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/oembed` | `GET` | `lib/api/routes/oembed.server.ts` |

## `/api/office-hours`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/office-hours` | `GET` `PUT` | `lib/calendar/api/office-hours.server.ts` |
| `/api/office-hours/bookings/:id` | `DELETE` | `lib/calendar/api/office-hours.bookings.$id.server.ts` |
| `/api/office-hours/bookings/:id/ics` | `GET` | `lib/calendar/api/office-hours.bookings.$id.ics.server.ts` |
| `/api/office-hours/host/:id` | `GET` `POST` | `lib/calendar/api/office-hours.host.$id.server.ts` |
| `/api/office-hours/host/:id/summary` | `GET` | `lib/calendar/api/office-hours.host.$id.summary.server.ts` |

## `/api/og`

19 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/og/album/:albumId` | `GET` | `lib/og/api/og.album.$albumId.server.ts` |
| `/api/og/app/:appId` | `GET` | `lib/og/api/og.app.$appId.server.ts` |
| `/api/og/blog/:slug` | `GET` | `lib/og/api/og.blog.$slug.server.ts` |
| `/api/og/build/:slug` | `GET` | `lib/og/api/og.build.$slug.server.ts` |
| `/api/og/elections` | `GET` | `lib/og/api/og.elections.server.ts` |
| `/api/og/game/:gameId` | `GET` | `lib/og/api/og.game.$gameId.server.ts` |
| `/api/og/job/:jobId` | `GET` | `lib/og/api/og.job.$jobId.server.ts` |
| `/api/og/med-school/:slug` | `GET` | `lib/og/api/og.med-school.$slug.server.ts` |
| `/api/og/moment/:id` | `GET` | `lib/og/api/og.moment.$id.server.ts` |
| `/api/og/music/:token` | `GET` | `lib/og/api/og.music.$token.server.ts` |
| `/api/og/post/:id` | `GET` | `lib/og/api/og.post.$id.server.ts` |
| `/api/og/post/:id/story` | `GET` | `lib/og/api/og.post.$id.story.server.ts` |
| `/api/og/profile/:id` | `GET` | `lib/og/api/og.profile.$id.server.ts` |
| `/api/og/replay/:id` | `GET` | `lib/og/api/og.replay.$id.server.ts` |
| `/api/og/research/:kind/:id` | `GET` | `lib/rmh-research/api/og.research.$kind.$id.server.ts` |
| `/api/og/section/:file` | `GET` | `lib/og/api/og.section.$file.server.ts` |
| `/api/og/sohumtracker` | `GET` | `lib/og/api/og.sohumtracker.server.ts` |
| `/api/og/story/:slug` | `GET` | `lib/og/api/og.story.$slug.server.ts` |
| `/api/og/wiki` | `GET` | `lib/og/api/og.wiki.server.ts` |

## `/api/onboarding`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/onboarding` | `GET` `POST` | `lib/api/routes/onboarding.server.ts` |
| `/api/onboarding/first-week` | `GET` `POST` | `lib/api/routes/onboarding.first-week.server.ts` |

## `/api/personas`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/personas` | `GET` `POST` | `lib/personas/api/personas.server.ts` |
| `/api/personas/:id` | `DELETE` `GET` | `lib/personas/api/personas.$id.server.ts` |
| `/api/personas/:id/chat` | `POST` | `lib/personas/api/personas.$id.chat.server.ts` |
| `/api/personas/avatar/:filename` | `GET` | `app/routes/api/personas/avatar/$filename.ts` |

## `/api/photo-of-the-day`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/photo-of-the-day` | `GET` `POST` | `lib/api/routes/photo-of-the-day.server.ts` |
| `/api/photo-of-the-day/:id` | `DELETE` | `lib/delight/api/photo-of-the-day.$id.server.ts` |
| `/api/photo-of-the-day/vote` | `POST` | `lib/delight/api/photo-of-the-day.vote.server.ts` |

## `/api/playlists`

7 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/playlists` | `GET` `POST` | `lib/playlists/api/playlists.server.ts` |
| `/api/playlists/:id` | `DELETE` `GET` `PATCH` | `lib/playlists/api/playlists.$id.server.ts` |
| `/api/playlists/:id/collaborators` | `GET` `POST` | `lib/playlists/api/playlists.$id.collaborators.server.ts` |
| `/api/playlists/:id/collaborators/:userId` | `DELETE` | `lib/playlists/api/playlists.$id.collaborators.$userId.server.ts` |
| `/api/playlists/:id/items` | `POST` | `lib/playlists/api/playlists.$id.items.server.ts` |
| `/api/playlists/:id/items/:itemId` | `DELETE` | `lib/playlists/api/playlists.$id.items.$itemId.server.ts` |
| `/api/playlists/:id/items/bulk` | `POST` | `lib/playlists/api/playlists.$id.items.bulk.server.ts` |

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
| `/api/predictions/:id` | `GET` | `lib/predictions/api/predictions.$id.server.ts` |
| `/api/predictions/:id/comments` | `GET` `POST` | `lib/predictions/api/predictions.$id.comments.server.ts` |
| `/api/predictions/:id/devils-advocate` | `POST` | `lib/predictions/api/predictions.$id.devils-advocate.server.ts` |
| `/api/predictions/:id/trade` | `POST` | `lib/predictions/api/predictions.$id.trade.server.ts` |

## `/api/preferences`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/preferences/appearance` | `GET` `PUT` | `lib/preferences/api/preferences.appearance.server.ts` |
| `/api/preferences/conversation` | `GET` `PUT` | `lib/preferences/api/preferences.conversation.server.ts` |
| `/api/preferences/email` | `GET` `PUT` | `lib/preferences/api/preferences.email.server.ts` |
| `/api/preferences/keyboard` | `GET` `PUT` | `lib/preferences/api/preferences.keyboard.server.ts` |
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

33 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/profile` | `PATCH` | `lib/api/routes/profile.server.ts` |
| `/api/profile/:id` | `GET` | `lib/profile/api/profile.$id.server.ts` |
| `/api/profile/:id/activity` | `GET` | `lib/profile/api/profile.$id.activity.server.ts` |
| `/api/profile/:id/card` | `GET` | `lib/profile/api/profile.$id.card.server.ts` |
| `/api/profile/:id/endorsements` | `GET` `PUT` | `lib/profile/api/profile.$id.endorsements.server.ts` |
| `/api/profile/:id/follow` | `POST` | `lib/profile/api/profile.$id.follow.server.ts` |
| `/api/profile/:id/followers` | `GET` | `lib/profile/api/profile.$id.followers.server.ts` |
| `/api/profile/:id/following` | `GET` | `lib/profile/api/profile.$id.following.server.ts` |
| `/api/profile/:id/guestbook` | `GET` `PATCH` `POST` | `lib/guestbook/api/profile.$id.guestbook.server.ts` |
| `/api/profile/:id/guestbook/:entryId` | `DELETE` `PATCH` | `lib/guestbook/api/profile.$id.guestbook.$entryId.server.ts` |
| `/api/profile/:id/kudos` | `GET` `POST` | `lib/profile/api/profile.$id.kudos.server.ts` |
| `/api/profile/:id/likes` | `GET` | `lib/profile/api/profile.$id.likes.server.ts` |
| `/api/profile/:id/membership` | `DELETE` `POST` | `lib/profile/api/profile.$id.membership.server.ts` |
| `/api/profile/:id/plus` | `GET` | `lib/profile/api/profile.$id.plus.server.ts` |
| `/api/profile/:id/pronunciation` | `GET` | `lib/profile/api/profile.$id.pronunciation.server.ts` |
| `/api/profile/:id/rmharks` | `GET` | `lib/profile/api/profile.$id.rmharks.server.ts` |
| `/api/profile/:id/shelves` | `GET` | `lib/profile/api/profile.$id.shelves.server.ts` |
| `/api/profile/:id/stamps` | `GET` | `lib/profile/api/profile.$id.stamps.server.ts` |
| `/api/profile/:id/visit` | `POST` | `lib/profile/api/profile.$id.visit.server.ts` |
| `/api/profile/:id/webrings` | `GET` | `lib/profile/api/profile.$id.webrings.server.ts` |
| `/api/profile/analytics` | `GET` | `lib/profile/api/profile.analytics.server.ts` |
| `/api/profile/avatar` | `DELETE` `POST` | `lib/api/routes/profile.avatar.server.ts` |
| `/api/profile/avatar/:filename` | `GET` | `app/routes/api/profile/avatar/$filename.ts` |
| `/api/profile/banner` | `DELETE` `POST` | `lib/api/routes/profile.banner.server.ts` |
| `/api/profile/banner-source` | `GET` | `lib/api/routes/profile.banner-source.server.ts` |
| `/api/profile/banner/:filename` | `GET` | `app/routes/api/profile/banner/$filename.ts` |
| `/api/profile/layout` | `GET` `PUT` | `lib/profile/api/profile.layout.server.ts` |
| `/api/profile/me` | `GET` | `lib/profile/api/profile.me.server.ts` |
| `/api/profile/plus` | `GET` `PUT` | `lib/profile/api/profile.plus.server.ts` |
| `/api/profile/preview` | `GET` | `lib/profile/api/profile.preview.server.ts` |
| `/api/profile/pronunciation` | `DELETE` `POST` | `lib/profile/api/profile.pronunciation.server.ts` |
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
| `/api/progress` | `GET` | `lib/api/routes/progress.server.ts` |

## `/api/promo`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/promo/free-month` | `GET` `POST` | `lib/api/routes/promo.free-month.server.ts` |

## `/api/pulse`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/pulse` | `POST` | `app/routes/api/pulse.ts` |

## `/api/push`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/push/action` | `POST` | `lib/push/api/push.action.server.ts` |
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

12 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reading/doc` | `GET` | `lib/reading/api/reading.doc.server.ts` |
| `/api/reading/goal` | `DELETE` `GET` `PUT` | `lib/reading/api/reading.goal.server.ts` |
| `/api/reading/highlights` | `GET` `POST` | `lib/reading/api/reading.highlights.server.ts` |
| `/api/reading/highlights/:id` | `DELETE` `PATCH` | `lib/reading/api/reading.highlights.$id.server.ts` |
| `/api/reading/highlights/export` | `POST` | `lib/reading/api/reading.highlights.export.server.ts` |
| `/api/reading/highlights/search` | `GET` | `lib/reading/api/reading.highlights.search.server.ts` |
| `/api/reading/shelves` | `DELETE` `GET` `PUT` | `lib/reading/api/reading.shelves.server.ts` |
| `/api/reading/shelves/prefs` | `PUT` | `lib/reading/api/reading.shelves.prefs.server.ts` |
| `/api/reading/subscriptions` | `GET` `POST` | `lib/reading/api/reading.subscriptions.server.ts` |
| `/api/reading/subscriptions/:id` | `DELETE` `PATCH` | `lib/reading/api/reading.subscriptions.$id.server.ts` |
| `/api/reading/time` | `DELETE` `GET` `POST` | `lib/reading/api/reading.time.server.ts` |
| `/api/reading/time/prefs` | `GET` `PUT` | `lib/reading/api/reading.time.prefs.server.ts` |

## `/api/ready`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/ready` | `GET` | `app/routes/api/ready.ts` |

## `/api/recap`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/recap` | `GET` | `lib/api/routes/recap.server.ts` |

## `/api/recipes`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/recipes` | `GET` `POST` | `lib/developer/api/recipes.server.ts` |
| `/api/recipes/:id` | `DELETE` `PATCH` | `lib/developer/api/recipes.$id.server.ts` |

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
| `/api/release-notes` | `GET` | `lib/developer/api/release-notes.server.ts` |

## `/api/reminders`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/reminders` | `GET` `POST` | `lib/reminders/api/reminders.server.ts` |
| `/api/reminders/:id` | `DELETE` | `lib/reminders/api/reminders.$id.server.ts` |

## `/api/replays`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/replays` | `POST` | `lib/game/api/replays.server.ts` |
| `/api/replays/:id` | `DELETE` `GET` `PATCH` | `lib/game/api/replays.$id.server.ts` |
| `/api/replays/board` | `GET` | `lib/game/api/replays.board.server.ts` |
| `/api/replays/ghost` | `GET` `POST` | `app/routes/api/replays/ghost.ts` |
| `/api/replays/mine` | `GET` | `lib/game/api/replays.mine.server.ts` |

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
| `/api/reviews/:id/vote` | `DELETE` `POST` | `lib/games/api/reviews.$id.vote.server.ts` |

## `/api/rideshare`

13 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rideshare/directions` | `GET` | `lib/rideshare/api/rideshare.directions.server.ts` |
| `/api/rideshare/driver` | `GET` `PATCH` `POST` | `lib/rideshare/api/rideshare.driver.server.ts` |
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

35 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmharks` | `GET` `POST` | `lib/feed/api/rmharks.server.ts` |
| `/api/rmharks/:id` | `DELETE` `GET` `PATCH` | `lib/feed/api/rmharks.$id.server.ts` |
| `/api/rmharks/:id/alt-text` | `PUT` | `lib/feed/api/rmharks.$id.alt-text.server.ts` |
| `/api/rmharks/:id/bookmark` | `POST` | `lib/feed/api/rmharks.$id.bookmark.server.ts` |
| `/api/rmharks/:id/comment` | `GET` `POST` | `lib/feed/api/rmharks.$id.comment.server.ts` |
| `/api/rmharks/:id/comment/:commentId` | `DELETE` | `lib/feed/api/rmharks.$id.comment.$commentId.server.ts` |
| `/api/rmharks/:id/comment/:commentId/hide` | `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.hide.server.ts` |
| `/api/rmharks/:id/comment/:commentId/like` | `GET` `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.like.server.ts` |
| `/api/rmharks/:id/comment/:commentId/repost` | `GET` `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.repost.server.ts` |
| `/api/rmharks/:id/comment/:commentId/view` | `POST` | `lib/feed/api/rmharks.$id.comment.$commentId.view.server.ts` |
| `/api/rmharks/:id/embed` | `GET` | `lib/feed/api/rmharks.$id.embed.server.ts` |
| `/api/rmharks/:id/history` | `GET` | `lib/feed/api/rmharks.$id.history.server.ts` |
| `/api/rmharks/:id/insights` | `GET` | `lib/feed/api/rmharks.$id.insights.server.ts` |
| `/api/rmharks/:id/like` | `GET` `POST` | `lib/feed/api/rmharks.$id.like.server.ts` |
| `/api/rmharks/:id/mute` | `DELETE` `GET` `PUT` | `lib/feed/api/rmharks.$id.mute.server.ts` |
| `/api/rmharks/:id/pin` | `GET` `POST` | `lib/feed/api/rmharks.$id.pin.server.ts` |
| `/api/rmharks/:id/pin-reply` | `DELETE` `PUT` | `lib/feed/api/rmharks.$id.pin-reply.server.ts` |
| `/api/rmharks/:id/pin/move` | `POST` | `lib/feed/api/rmharks.$id.pin.move.server.ts` |
| `/api/rmharks/:id/poll/end` | `POST` | `lib/feed/api/rmharks.$id.poll.end.server.ts` |
| `/api/rmharks/:id/poll/extend` | `POST` | `lib/feed/api/rmharks.$id.poll.extend.server.ts` |
| `/api/rmharks/:id/quotes` | `GET` | `lib/feed/api/rmharks.$id.quotes.server.ts` |
| `/api/rmharks/:id/react` | `POST` | `lib/feed/api/rmharks.$id.react.server.ts` |
| `/api/rmharks/:id/repost` | `GET` `POST` | `lib/feed/api/rmharks.$id.repost.server.ts` |
| `/api/rmharks/:id/similar` | `GET` | `app/routes/api/rmharks/$id/similar.ts` |
| `/api/rmharks/:id/summary` | `GET` | `lib/feed/api/rmharks.$id.summary.server.ts` |
| `/api/rmharks/:id/take` | `GET` `POST` | `lib/feed/api/rmharks.$id.take.server.ts` |
| `/api/rmharks/:id/translate` | `GET` | `lib/ai/api/rmharks.$id.translate.server.ts` |
| `/api/rmharks/:id/unlock` | `POST` | `app/routes/api/rmharks/$id/unlock.ts` |
| `/api/rmharks/:id/vibe` | `GET` | `lib/feed/api/rmharks.$id.vibe.server.ts` |
| `/api/rmharks/:id/view` | `POST` | `app/routes/api/rmharks/$id/view.ts` |
| `/api/rmharks/:id/vote` | `POST` | `lib/feed/api/rmharks.$id.vote.server.ts` |
| `/api/rmharks/ai-generate` | `POST` | `lib/feed/api/rmharks.ai-generate.server.ts` |
| `/api/rmharks/ai-image` | `POST` | `lib/rmhark-ai/api/rmharks.ai-image.server.ts` |
| `/api/rmharks/image` | `POST` | `lib/media/api/rmharks.image.server.ts` |
| `/api/rmharks/thread` | `POST` | `lib/feed/api/rmharks.thread.server.ts` |

## `/api/rmhbox`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhbox/history` | `GET` | `lib/rmhbox/api/rmhbox.history.server.ts` |
| `/api/rmhbox/leaderboard` | `GET` | `app/routes/api/rmhbox/leaderboard.ts` |
| `/api/rmhbox/packs` | `GET` `POST` | `lib/rmhbox/api/rmhbox.packs.server.ts` |
| `/api/rmhbox/packs/:id` | `DELETE` `PATCH` | `lib/rmhbox/api/rmhbox.packs.$id.server.ts` |
| `/api/rmhbox/packs/:id/report` | `POST` | `lib/rmhbox/api/rmhbox.packs.$id.report.server.ts` |
| `/api/rmhbox/presets` | `GET` `POST` | `lib/rmhbox/api/rmhbox.presets.server.ts` |
| `/api/rmhbox/presets/:id` | `DELETE` `PATCH` | `lib/rmhbox/api/rmhbox.presets.$id.server.ts` |
| `/api/rmhbox/stats` | `GET` | `lib/rmhbox/api/rmhbox.stats.server.ts` |

## `/api/rmhcalculator`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhcalculator/compute` | `POST` | `app/routes/api/rmhcalculator/compute.ts` |
| `/api/rmhcalculator/graph` | `POST` | `app/routes/api/rmhcalculator/graph.ts` |

## `/api/rmhcharacters`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhcharacters/advisor` | `POST` | `features/rmhcharacters/api/rmhcharacters.advisor.server.ts` |
| `/api/rmhcharacters/characters` | `GET` | `features/rmhcharacters/api/rmhcharacters.characters.server.ts` |
| `/api/rmhcharacters/characters/:id` | `DELETE` `PUT` | `features/rmhcharacters/api/rmhcharacters.characters.$id.server.ts` |

## `/api/rmhcode`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhcode/auth/generate` | `POST` | `lib/rmhcode/api/rmhcode.auth.generate.server.ts` |
| `/api/rmhcode/auth/initiate` | `POST` | `lib/rmhcode/api/rmhcode.auth.initiate.server.ts` |
| `/api/rmhcode/auth/list` | `GET` | `lib/rmhcode/api/rmhcode.auth.list.server.ts` |
| `/api/rmhcode/auth/revoke` | `POST` | `lib/rmhcode/api/rmhcode.auth.revoke.server.ts` |
| `/api/rmhcode/auth/validate` | `POST` | `lib/rmhcode/api/rmhcode.auth.validate.server.ts` |

## `/api/rmhladder`

20 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhladder/answers` | `DELETE` `GET` `PUT` | `lib/rmhladder/api/rmhladder.answers.server.ts` |
| `/api/rmhladder/calendar` | `GET` | `lib/rmhladder/api/rmhladder.calendar.server.ts` |
| `/api/rmhladder/events` | `POST` | `app/routes/api/rmhladder/events.ts` |
| `/api/rmhladder/export` | `GET` | `lib/rmhladder/api/rmhladder.export.server.ts` |
| `/api/rmhladder/import` | `POST` | `lib/rmhladder/api/rmhladder.import.server.ts` |
| `/api/rmhladder/insights` | `GET` | `lib/rmhladder/api/rmhladder.insights.server.ts` |
| `/api/rmhladder/interview-reports` | `GET` `POST` | `lib/rmhladder/api/rmhladder.interview-reports.server.ts` |
| `/api/rmhladder/offers` | `GET` `POST` | `lib/rmhladder/api/rmhladder.offers.server.ts` |
| `/api/rmhladder/offers/:id` | `DELETE` `PATCH` | `lib/rmhladder/api/rmhladder.offers.$id.server.ts` |
| `/api/rmhladder/offers/:id/decide` | `POST` | `lib/rmhladder/api/rmhladder.offers.$id.decide.server.ts` |
| `/api/rmhladder/prep` | `POST` | `lib/rmhladder/api/rmhladder.prep.server.ts` |
| `/api/rmhladder/referral-requests/:id` | `PATCH` | `lib/rmhladder/api/rmhladder.referral-requests.$id.server.ts` |
| `/api/rmhladder/referrals` | `GET` `POST` | `lib/rmhladder/api/rmhladder.referrals.server.ts` |
| `/api/rmhladder/referrals/:id` | `DELETE` | `lib/rmhladder/api/rmhladder.referrals.$id.server.ts` |
| `/api/rmhladder/referrals/:id/request` | `POST` | `lib/rmhladder/api/rmhladder.referrals.$id.request.server.ts` |
| `/api/rmhladder/resume` | `GET` `POST` | `app/routes/api/rmhladder/resume/index.ts` |
| `/api/rmhladder/resume/:id` | `DELETE` `GET` | `app/routes/api/rmhladder/resume/$id.ts` |
| `/api/rmhladder/resume/:id/analyze` | `POST` | `app/routes/api/rmhladder/resume/$id/analyze.ts` |
| `/api/rmhladder/resume/:id/confirm` | `POST` | `app/routes/api/rmhladder/resume/$id/confirm.ts` |
| `/api/rmhladder/searches` | `DELETE` `GET` `POST` | `lib/rmhladder/api/rmhladder.searches.server.ts` |

## `/api/rmhmusic`

18 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhmusic/friends` | `GET` | `lib/rmhmusic/api/rmhmusic.friends.server.ts` |
| `/api/rmhmusic/history` | `DELETE` `GET` | `lib/rmhmusic/api/rmhmusic.history.server.ts` |
| `/api/rmhmusic/history/entries` | `GET` | `lib/rmhmusic/api/rmhmusic.history.entries.server.ts` |
| `/api/rmhmusic/history/songs/:songId` | `GET` | `lib/rmhmusic/api/rmhmusic.history.songs.$songId.server.ts` |
| `/api/rmhmusic/learn/cards` | `GET` `POST` | `lib/rmhmusic/api/rmhmusic.learn.cards.server.ts` |
| `/api/rmhmusic/learn/lesson-complete` | `POST` | `lib/rmhmusic/api/rmhmusic.learn.lesson-complete.server.ts` |
| `/api/rmhmusic/learn/profile` | `GET` `PUT` | `lib/rmhmusic/api/rmhmusic.learn.profile.server.ts` |
| `/api/rmhmusic/r/:token` | `GET` | `lib/rmhmusic/api/rmhmusic.r.$token.server.ts` |
| `/api/rmhmusic/share` | `DELETE` `GET` `POST` | `lib/rmhmusic/api/rmhmusic.share.server.ts` |
| `/api/rmhmusic/share/:id` | `DELETE` | `lib/rmhmusic/api/rmhmusic.share.$id.server.ts` |
| `/api/rmhmusic/social` | `GET` `PUT` | `lib/rmhmusic/api/rmhmusic.social.server.ts` |
| `/api/rmhmusic/songs` | `GET` | `lib/rmhmusic/api/rmhmusic.songs.server.ts` |
| `/api/rmhmusic/songs/best` | `POST` | `lib/rmhmusic/api/rmhmusic.songs.best.server.ts` |
| `/api/rmhmusic/sprint` | `GET` | `lib/rmhmusic/api/rmhmusic.sprint.server.ts` |
| `/api/rmhmusic/sprint/board` | `GET` | `lib/rmhmusic/api/rmhmusic.sprint.board.server.ts` |
| `/api/rmhmusic/sprint/daily` | `POST` | `lib/rmhmusic/api/rmhmusic.sprint.daily.server.ts` |
| `/api/rmhmusic/sprint/daily-start` | `POST` | `lib/rmhmusic/api/rmhmusic.sprint.daily-start.server.ts` |
| `/api/rmhmusic/sprint/freeplay` | `POST` | `lib/rmhmusic/api/rmhmusic.sprint.freeplay.server.ts` |

## `/api/rmhos`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhos/session` | `GET` | `features/rmhos/api/rmhos.session.server.ts` |

## `/api/rmhstudy`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhstudy/goal` | `PUT` | `lib/rmhstudy/api/rmhstudy.goal.server.ts` |
| `/api/rmhstudy/history` | `GET` | `lib/rmhstudy/api/rmhstudy.history.server.ts` |
| `/api/rmhstudy/history/sessions` | `GET` | `lib/rmhstudy/api/rmhstudy.history.sessions.server.ts` |

## `/api/rmhtube`

12 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhtube/commentary` | `GET` `POST` | `lib/rmhtube/api/rmhtube.commentary.server.ts` |
| `/api/rmhtube/heat` | `GET` | `lib/rmhtube/api/rmhtube.heat.server.ts` |
| `/api/rmhtube/oembed` | `GET` | `app/routes/api/rmhtube/oembed.ts` |
| `/api/rmhtube/parties` | `GET` `POST` | `lib/rmhtube/api/rmhtube.parties.server.ts` |
| `/api/rmhtube/parties/:roomId` | `DELETE` `GET` `PATCH` | `lib/rmhtube/api/rmhtube.parties.$roomId.server.ts` |
| `/api/rmhtube/parties/:roomId/ics` | `GET` | `app/routes/api/rmhtube/parties/$roomId/ics.ts` |
| `/api/rmhtube/parties/:roomId/rsvp` | `DELETE` `PUT` | `lib/rmhtube/api/rmhtube.parties.$roomId.rsvp.server.ts` |
| `/api/rmhtube/stats` | `DELETE` `GET` | `lib/rmhtube/api/rmhtube.stats.server.ts` |
| `/api/rmhtube/stats/pause` | `PUT` | `lib/rmhtube/api/rmhtube.stats.pause.server.ts` |
| `/api/rmhtube/subscribe/:channelId` | `POST` | `lib/rmhtube/api/rmhtube.subscribe.$channelId.server.ts` |
| `/api/rmhtube/timed-comments` | `DELETE` `GET` `POST` | `lib/rmhtube/api/rmhtube.timed-comments.server.ts` |
| `/api/rmhtube/watch-later` | `DELETE` `GET` `POST` | `lib/rmhtube/api/rmhtube.watch-later.server.ts` |

## `/api/rmhtype`

14 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rmhtype/daily` | `GET` | `lib/rmhtype/api/rmhtype.daily.server.ts` |
| `/api/rmhtype/daily/finish` | `POST` | `lib/rmhtype/api/rmhtype.daily.finish.server.ts` |
| `/api/rmhtype/daily/leaderboard` | `GET` | `lib/rmhtype/api/rmhtype.daily.leaderboard.server.ts` |
| `/api/rmhtype/daily/start` | `POST` | `lib/rmhtype/api/rmhtype.daily.start.server.ts` |
| `/api/rmhtype/ghosts` | `DELETE` | `lib/rmhtype/api/rmhtype.ghosts.server.ts` |
| `/api/rmhtype/ghosts/:passageId` | `GET` | `lib/rmhtype/api/rmhtype.ghosts.$passageId.server.ts` |
| `/api/rmhtype/keystats` | `DELETE` `GET` `POST` | `lib/rmhtype/api/rmhtype.keystats.server.ts` |
| `/api/rmhtype/lessons/progress` | `GET` `POST` | `lib/rmhtype/api/rmhtype.lessons.progress.server.ts` |
| `/api/rmhtype/practice-test` | `POST` | `lib/rmhtype/api/rmhtype.practice-test.server.ts` |
| `/api/rmhtype/progress` | `GET` | `lib/rmhtype/api/rmhtype.progress.server.ts` |
| `/api/rmhtype/progress/runs` | `GET` | `lib/rmhtype/api/rmhtype.progress.runs.server.ts` |
| `/api/rmhtype/texts` | `GET` `POST` | `lib/rmhtype/api/rmhtype.texts.server.ts` |
| `/api/rmhtype/texts/:textId` | `DELETE` `GET` `PATCH` | `lib/rmhtype/api/rmhtype.texts.$textId.server.ts` |
| `/api/rmhtype/texts/:textId/runs` | `POST` | `lib/rmhtype/api/rmhtype.texts.$textId.runs.server.ts` |

## `/api/rum`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/rum` | `POST` | `lib/api/routes/rum.server.ts` |

## `/api/safety`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/safety/pile-on` | `GET` `POST` | `lib/api/routes/safety.pile-on.server.ts` |

## `/api/saved-replies`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/saved-replies` | `GET` `POST` | `lib/messages/api/saved-replies.server.ts` |
| `/api/saved-replies/:id` | `DELETE` `PATCH` | `lib/messages/api/saved-replies.$id.server.ts` |
| `/api/saved-replies/:id/use` | `POST` | `lib/messages/api/saved-replies.$id.use.server.ts` |
| `/api/saved-replies/order` | `PUT` | `lib/messages/api/saved-replies.order.server.ts` |

## `/api/saves`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/saves` | `DELETE` `GET` `POST` | `lib/saves/api/saves.server.ts` |
| `/api/saves/folders` | `GET` `POST` | `lib/saves/api/saves.folders.server.ts` |
| `/api/saves/folders/:id` | `DELETE` `PATCH` | `lib/saves/api/saves.folders.$id.server.ts` |
| `/api/saves/note` | `PUT` | `lib/saves/api/saves.note.server.ts` |

## `/api/schedule`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/schedule` | `GET` | `lib/schedule/api/schedule.server.ts` |
| `/api/schedule/admin` | `DELETE` `GET` `POST` | `lib/schedule/api/schedule.admin.server.ts` |
| `/api/schedule/mine` | `GET` | `lib/schedule/api/schedule.mine.server.ts` |

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
| `/api/search` | `GET` | `lib/search/api/search.server.ts` |
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

14 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/settings/alt-text` | `GET` `POST` | `lib/feed/api/settings.alt-text.server.ts` |
| `/api/settings/auto-delete` | `GET` `PUT` | `lib/posts-plus/api/settings.auto-delete.server.ts` |
| `/api/settings/blocked` | `GET` | `lib/moderation/api/settings.blocked.server.ts` |
| `/api/settings/content-warnings` | `GET` `POST` | `lib/feed/api/settings.content-warnings.server.ts` |
| `/api/settings/game-assists` | `GET` `POST` | `lib/game/api/settings.game-assists.server.ts` |
| `/api/settings/leaderboard-privacy` | `GET` `PUT` | `lib/game/api/settings.leaderboard-privacy.server.ts` |
| `/api/settings/missing-alt-text` | `GET` | `lib/feed/api/settings.missing-alt-text.server.ts` |
| `/api/settings/muted-conversations` | `GET` | `lib/notify/api/settings.muted-conversations.server.ts` |
| `/api/settings/play-limits` | `GET` `POST` | `lib/economy/api/settings.play-limits.server.ts` |
| `/api/settings/playtime-privacy` | `GET` `POST` `PUT` | `lib/playtime/api/settings.playtime-privacy.server.ts` |
| `/api/settings/quiet-counts` | `GET` `PUT` | `lib/feed/api/settings.quiet-counts.server.ts` |
| `/api/settings/read-receipts` | `GET` `PUT` | `lib/messages/api/settings.read-receipts.server.ts` |
| `/api/settings/security/activity` | `GET` | `lib/auth/api/settings.security.activity.server.ts` |
| `/api/settings/security/activity/export` | `GET` | `lib/auth/api/settings.security.activity.export.server.ts` |

## `/api/shop`

9 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/shop` | `GET` | `lib/shop/api/shop.server.ts` |
| `/api/shop/bundle` | `POST` | `lib/shop/api/shop.bundle.server.ts` |
| `/api/shop/daily` | `GET` | `lib/shop/api/shop.daily.server.ts` |
| `/api/shop/equip` | `POST` | `lib/shop/api/shop.equip.server.ts` |
| `/api/shop/loadouts` | `GET` `POST` | `lib/shop/api/shop.loadouts.server.ts` |
| `/api/shop/loadouts/:id` | `DELETE` | `lib/shop/api/shop.loadouts.$id.server.ts` |
| `/api/shop/loadouts/:id/apply` | `POST` | `lib/shop/api/shop.loadouts.$id.apply.server.ts` |
| `/api/shop/purchase` | `POST` | `app/routes/api/shop/purchase.ts` |
| `/api/shop/search` | `GET` | `lib/shop/api/shop.search.server.ts` |

## `/api/signal-forge`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/signal-forge/abandon` | `POST` | `features/signal-forge/api/signal-forge.abandon.server.ts` |
| `/api/signal-forge/leaderboard` | `GET` | `features/signal-forge/api/signal-forge.leaderboard.server.ts` |
| `/api/signal-forge/load` | `GET` | `features/signal-forge/api/signal-forge.load.server.ts` |
| `/api/signal-forge/save` | `POST` | `features/signal-forge/api/signal-forge.save.server.ts` |
| `/api/signal-forge/score` | `POST` | `features/signal-forge/api/signal-forge.score.server.ts` |

## `/api/sitewide-announcement`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/sitewide-announcement` | `GET` | `lib/api/routes/sitewide-announcement.server.ts` |
| `/api/sitewide-announcement/seen` | `POST` | `lib/api/routes/sitewide-announcement.seen.server.ts` |

## `/api/slice-it`

36 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/slice-it/admin/content` | `GET` | `features/slice-it/api/slice-it.admin.content.server.ts` |
| `/api/slice-it/admin/review` | `GET` | `features/slice-it/api/slice-it.admin.review.server.ts` |
| `/api/slice-it/admin/takedown` | `GET` `POST` | `features/slice-it/api/slice-it.admin.takedown.server.ts` |
| `/api/slice-it/charts` | `GET` `POST` | `features/slice-it/api/slice-it.charts.server.ts` |
| `/api/slice-it/charts/:id` | `DELETE` `GET` `PATCH` `POST` | `features/slice-it/api/slice-it.charts.$id.server.ts` |
| `/api/slice-it/charts/:id/reviews` | `DELETE` `GET` `PUT` | `features/slice-it/api/slice-it.charts.$id.reviews.server.ts` |
| `/api/slice-it/charts/:id/revisions` | `GET` | `features/slice-it/api/slice-it.charts.$id.revisions.server.ts` |
| `/api/slice-it/charts/ranking` | `GET` `POST` | `features/slice-it/api/slice-it.charts.ranking.server.ts` |
| `/api/slice-it/daily` | `GET` | `features/slice-it/api/slice-it.daily.server.ts` |
| `/api/slice-it/daily/submit` | `POST` | `features/slice-it/api/slice-it.daily.submit.server.ts` |
| `/api/slice-it/leaderboard` | `GET` | `features/slice-it/api/slice-it.leaderboard.server.ts` |
| `/api/slice-it/packs` | `GET` `POST` | `features/slice-it/api/slice-it.packs.server.ts` |
| `/api/slice-it/packs/:id` | `DELETE` `GET` `PATCH` | `features/slice-it/api/slice-it.packs.$id.server.ts` |
| `/api/slice-it/packs/:id/items` | `PATCH` | `features/slice-it/api/slice-it.packs.$id.items.server.ts` |
| `/api/slice-it/replay` | `GET` `POST` | `features/slice-it/api/slice-it.replay.server.ts` |
| `/api/slice-it/replay/:id` | `GET` | `features/slice-it/api/slice-it.replay.$id.server.ts` |
| `/api/slice-it/score` | `POST` | `features/slice-it/api/slice-it.score.server.ts` |
| `/api/slice-it/setlists` | `GET` `POST` | `features/slice-it/api/slice-it.setlists.server.ts` |
| `/api/slice-it/setlists/:id` | `DELETE` `GET` `PATCH` | `features/slice-it/api/slice-it.setlists.$id.server.ts` |
| `/api/slice-it/shelves` | `GET` | `features/slice-it/api/slice-it.shelves.server.ts` |
| `/api/slice-it/showcase` | `GET` | `features/slice-it/api/slice-it.showcase.server.ts` |
| `/api/slice-it/songs` | `GET` | `features/slice-it/api/slice-it.songs.server.ts` |
| `/api/slice-it/songs/:id` | `DELETE` `GET` `PATCH` | `features/slice-it/api/slice-it.songs.$id.server.ts` |
| `/api/slice-it/songs/:id/charts` | `GET` | `features/slice-it/api/slice-it.songs.$id.charts.server.ts` |
| `/api/slice-it/songs/:id/comments` | `DELETE` `GET` `POST` | `features/slice-it/api/slice-it.songs.$id.comments.server.ts` |
| `/api/slice-it/songs/:id/cover` | `GET` | `features/slice-it/api/slice-it.songs.$id.cover.server.ts` |
| `/api/slice-it/songs/:id/import-chart` | `POST` | `features/slice-it/api/slice-it.songs.$id.import-chart.server.ts` |
| `/api/slice-it/songs/:id/like` | `POST` | `features/slice-it/api/slice-it.songs.$id.like.server.ts` |
| `/api/slice-it/songs/:id/patch-analysis` | `POST` | `features/slice-it/api/slice-it.songs.$id.patch-analysis.server.ts` |
| `/api/slice-it/songs/:id/play` | `POST` | `features/slice-it/api/slice-it.songs.$id.play.server.ts` |
| `/api/slice-it/songs/:id/regenerate` | `POST` | `features/slice-it/api/slice-it.songs.$id.regenerate.server.ts` |
| `/api/slice-it/songs/artist/:key` | `GET` | `features/slice-it/api/slice-it.songs.artist.$key.server.ts` |
| `/api/slice-it/songs/artists` | `GET` | `features/slice-it/api/slice-it.songs.artists.server.ts` |
| `/api/slice-it/songs/stream/:id` | `GET` | `app/routes/api/slice-it/songs/stream/$id.ts` |
| `/api/slice-it/songs/upload` | `POST` | `features/slice-it/api/slice-it.songs.upload.server.ts` |
| `/api/slice-it/uploader-stats` | `GET` | `features/slice-it/api/slice-it.uploader-stats.server.ts` |

## `/api/sohumtracker`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/sohumtracker/activity` | `GET` | `lib/sohumtracker/api/sohumtracker.activity.server.ts` |
| `/api/sohumtracker/alert` | `GET` `POST` | `lib/sohumtracker/api/sohumtracker.alert.server.ts` |
| `/api/sohumtracker/export` | `GET` | `lib/sohumtracker/api/sohumtracker.export.server.ts` |
| `/api/sohumtracker/stream` | `GET` | `app/routes/api/sohumtracker/stream.ts` |

## `/api/spaces`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/spaces` | `GET` `POST` | `lib/spaces/api/spaces.server.ts` |
| `/api/spaces/:id` | `GET` | `app/routes/api/spaces/$id/index.ts` |
| `/api/spaces/:id/end` | `POST` | `lib/spaces/api/spaces.$id.end.server.ts` |
| `/api/spaces/:id/start` | `POST` | `lib/spaces/api/spaces.$id.start.server.ts` |
| `/api/spaces/live` | `GET` | `app/routes/api/spaces/live.ts` |

## `/api/speedrun`

6 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/speedrun/categories` | `GET` `POST` | `lib/speedrun/api/speedrun.categories.server.ts` |
| `/api/speedrun/leaderboard` | `GET` | `lib/speedrun/api/speedrun.leaderboard.server.ts` |
| `/api/speedrun/queue` | `GET` `POST` | `lib/speedrun/api/speedrun.queue.server.ts` |
| `/api/speedrun/replays` | `GET` | `lib/speedrun/api/speedrun.replays.server.ts` |
| `/api/speedrun/runs` | `GET` `POST` | `lib/speedrun/api/speedrun.runs.server.ts` |
| `/api/speedrun/verify` | `GET` `POST` | `lib/speedrun/api/speedrun.verify.server.ts` |

## `/api/spotify`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/spotify/search` | `GET` | `lib/api/routes/spotify.search.server.ts` |

## `/api/staking`

4 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/staking` | `GET` | `lib/staking/api/staking.server.ts` |
| `/api/staking/deposit` | `POST` | `lib/staking/api/staking.deposit.server.ts` |
| `/api/staking/settings` | `POST` | `lib/staking/api/staking.settings.server.ts` |
| `/api/staking/withdraw` | `POST` | `lib/staking/api/staking.withdraw.server.ts` |

## `/api/stamps`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/stamps` | `GET` `POST` | `lib/profile/api/stamps.server.ts` |
| `/api/stamps/:id` | `DELETE` | `lib/profile/api/stamps.$id.server.ts` |
| `/api/stamps/:id/wall` | `DELETE` `POST` | `lib/profile/api/stamps.$id.wall.server.ts` |
| `/api/stamps/image/:filename` | `GET` | `lib/profile/api/stamps.image.$filename.server.ts` |
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

13 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/studio/challenges` | `GET` | `lib/studio/api/studio.challenges.server.ts` |
| `/api/studio/challenges/:id` | `GET` | `lib/studio/api/studio.challenges.$id.server.ts` |
| `/api/studio/challenges/:id/entry` | `POST` | `lib/studio/api/studio.challenges.$id.entry.server.ts` |
| `/api/studio/challenges/:id/vote` | `POST` | `lib/studio/api/studio.challenges.$id.vote.server.ts` |
| `/api/studio/challenges/audio` | `POST` | `lib/creator/api/studio.challenges.audio.server.ts` |
| `/api/studio/challenges/audio/:filename` | `GET` | `lib/studio/api/studio.challenges.audio.$filename.server.ts` |
| `/api/studio/overview` | `GET` | `lib/studio/api/studio.overview.server.ts` |
| `/api/studio/projects` | `GET` `POST` | `lib/studio/api/studio.projects.server.ts` |
| `/api/studio/projects/:id` | `DELETE` `GET` `PUT` | `lib/studio/api/studio.projects.$id.server.ts` |
| `/api/studio/projects/:id/versions` | `GET` | `lib/studio/api/studio.projects.$id.versions.server.ts` |
| `/api/studio/projects/:id/versions/:versionId` | `GET` | `lib/studio/api/studio.projects.$id.versions.$versionId.server.ts` |
| `/api/studio/projects/:id/versions/:versionId/restore` | `POST` | `lib/studio/api/studio.projects.$id.versions.$versionId.restore.server.ts` |
| `/api/studio/tiers` | `GET` `PUT` | `lib/studio/api/studio.tiers.server.ts` |

## `/api/study`

28 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/study/card-images` | `POST` | `lib/study/api/study.card-images.server.ts` |
| `/api/study/card-sound` | `POST` | `lib/study/api/study.card-sound.server.ts` |
| `/api/study/card-sound/:file` | `GET` | `lib/study/api/study.card-sound.$file.server.ts` |
| `/api/study/cards/:id` | `DELETE` `PATCH` | `lib/study/api/study.cards.$id.server.ts` |
| `/api/study/cards/:id/review` | `POST` | `lib/study/api/study.cards.$id.review.server.ts` |
| `/api/study/cards/:id/suspend` | `PUT` | `lib/study/api/study.cards.$id.suspend.server.ts` |
| `/api/study/decks` | `GET` `POST` | `lib/study/api/study.decks.server.ts` |
| `/api/study/decks/:id` | `DELETE` `GET` `PATCH` `POST` | `lib/study/api/study.decks.$id.server.ts` |
| `/api/study/decks/:id/cards` | `POST` | `lib/study/api/study.decks.$id.cards.server.ts` |
| `/api/study/decks/:id/clone` | `POST` | `lib/study/api/study.decks.$id.clone.server.ts` |
| `/api/study/decks/:id/folder` | `PUT` | `lib/study/api/study.decks.$id.folder.server.ts` |
| `/api/study/decks/:id/link-original` | `POST` | `lib/study/api/study.decks.$id.link-original.server.ts` |
| `/api/study/decks/:id/order` | `PUT` | `lib/study/api/study.decks.$id.order.server.ts` |
| `/api/study/decks/:id/pace` | `GET` `PATCH` | `lib/study/api/study.decks.$id.pace.server.ts` |
| `/api/study/decks/:id/review` | `GET` | `lib/study/api/study.decks.$id.review.server.ts` |
| `/api/study/decks/:id/suggestions` | `GET` `POST` | `lib/study/api/study.decks.$id.suggestions.server.ts` |
| `/api/study/decks/:id/tests` | `GET` `POST` | `lib/study/api/study.decks.$id.tests.server.ts` |
| `/api/study/decks/:id/updates` | `GET` `POST` | `lib/study/api/study.decks.$id.updates.server.ts` |
| `/api/study/folders` | `GET` `POST` | `lib/study/api/study.folders.server.ts` |
| `/api/study/folders/:id` | `DELETE` `PATCH` | `lib/study/api/study.folders.$id.server.ts` |
| `/api/study/highlight-cards` | `POST` | `lib/study/api/study.highlight-cards.server.ts` |
| `/api/study/marketplace` | `GET` | `lib/study/api/study.marketplace.server.ts` |
| `/api/study/reminders` | `GET` `PUT` | `lib/study/api/study.reminders.server.ts` |
| `/api/study/review` | `GET` | `lib/study/api/study.review.server.ts` |
| `/api/study/stats` | `GET` | `lib/study/api/study.stats.server.ts` |
| `/api/study/suggestions/:id` | `DELETE` | `lib/study/api/study.suggestions.$id.server.ts` |
| `/api/study/suggestions/:id/decision` | `POST` | `lib/study/api/study.suggestions.$id.decision.server.ts` |
| `/api/study/tutor` | `POST` | `lib/study/api/study.tutor.server.ts` |

## `/api/study-buddy`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/study-buddy` | `DELETE` `GET` `POST` | `lib/calendar/api/study-buddy.server.ts` |

## `/api/study-plans`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/study-plans` | `GET` `POST` | `lib/tools/api/study-plans.server.ts` |
| `/api/study-plans/:id` | `DELETE` `PUT` | `lib/tools/api/study-plans.$id.server.ts` |

## `/api/tags`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tags/:tag` | `GET` | `lib/api/routes/tags.$tag.server.ts` |

## `/api/temple-of-joy`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/temple-of-joy/efficiency` | `GET` `POST` | `lib/temple-of-joy/api/temple-of-joy.efficiency.server.ts` |
| `/api/temple-of-joy/save` | `DELETE` `GET` `POST` | `lib/temple-of-joy/api/temple-of-joy.save.server.ts` |

## `/api/tf2-game`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tf2-game/assets/*` | `GET` | `app/routes/api/tf2-game/assets/$.ts` |

## `/api/tf2-hud`

15 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tf2-hud/ai` | `POST` | `lib/tf2-hud/api/tf2-hud.ai.server.ts` |
| `/api/tf2-hud/base/*` | `GET` | `app/routes/api/tf2-hud/base/$.ts` |
| `/api/tf2-hud/blobs/:sha1` | `PUT` | `lib/tf2-hud/api/tf2-hud.blobs.$sha1.server.ts` |
| `/api/tf2-hud/blobs/check` | `POST` | `lib/tf2-hud/api/tf2-hud.blobs.check.server.ts` |
| `/api/tf2-hud/huds` | `GET` `POST` | `lib/tf2-hud/api/tf2-hud.huds.server.ts` |
| `/api/tf2-hud/huds/:id` | `DELETE` `GET` `PUT` | `lib/tf2-hud/api/tf2-hud.huds.$id.server.ts` |
| `/api/tf2-hud/huds/:id/download` | `POST` | `lib/tf2-hud/api/tf2-hud.huds.$id.download.server.ts` |
| `/api/tf2-hud/huds/:id/file` | `GET` | `lib/tf2-hud/api/tf2-hud.huds.$id.file.server.ts` |
| `/api/tf2-hud/huds/:id/fork` | `POST` | `lib/tf2-hud/api/tf2-hud.huds.$id.fork.server.ts` |
| `/api/tf2-hud/huds/:id/like` | `POST` | `lib/tf2-hud/api/tf2-hud.huds.$id.like.server.ts` |
| `/api/tf2-hud/huds/:id/share` | `DELETE` `POST` | `lib/tf2-hud/api/tf2-hud.huds.$id.share.server.ts` |
| `/api/tf2-hud/huds/:id/versions` | `GET` | `lib/tf2-hud/api/tf2-hud.huds.$id.versions.server.ts` |
| `/api/tf2-hud/huds/:id/versions/:n` | `POST` | `lib/tf2-hud/api/tf2-hud.huds.$id.versions.$n.server.ts` |
| `/api/tf2-hud/share/:token` | `GET` | `lib/tf2-hud/api/tf2-hud.share.$token.server.ts` |
| `/api/tf2-hud/share/:token/file` | `GET` | `lib/tf2-hud/api/tf2-hud.share.$token.file.server.ts` |

## `/api/tf2-loadout`

11 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tf2-loadout/ai` | `POST` | `lib/tf2-loadout/api/tf2-loadout.ai.server.ts` |
| `/api/tf2-loadout/catalog` | `GET` | `lib/tf2-loadout/api/tf2-loadout.catalog.server.ts` |
| `/api/tf2-loadout/icons/:id` | `GET` | `lib/tf2-loadout/api/tf2-loadout.icons.$id.server.ts` |
| `/api/tf2-loadout/loadouts` | `GET` `POST` | `lib/tf2-loadout/api/tf2-loadout.loadouts.server.ts` |
| `/api/tf2-loadout/loadouts/:id` | `DELETE` `GET` `PUT` | `lib/tf2-loadout/api/tf2-loadout.loadouts.$id.server.ts` |
| `/api/tf2-loadout/loadouts/:id/fork` | `POST` | `lib/tf2-loadout/api/tf2-loadout.loadouts.$id.fork.server.ts` |
| `/api/tf2-loadout/loadouts/:id/like` | `POST` | `lib/tf2-loadout/api/tf2-loadout.loadouts.$id.like.server.ts` |
| `/api/tf2-loadout/models` | `GET` | `lib/tf2-loadout/api/tf2-loadout.models.server.ts` |
| `/api/tf2-loadout/models/:id` | `GET` | `lib/tf2-loadout/api/tf2-loadout.models.$id.server.ts` |
| `/api/tf2-loadout/paintkits/*` | `GET` | `app/routes/api/tf2-loadout/paintkits/$.ts` |
| `/api/tf2-loadout/particles/*` | `GET` | `app/routes/api/tf2-loadout/particles/$.ts` |

## `/api/themes`

5 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/themes` | `GET` `POST` | `lib/themes/api/themes.server.ts` |
| `/api/themes/:id` | `DELETE` `GET` `PUT` | `lib/themes/api/themes.$id.server.ts` |
| `/api/themes/:id/buy` | `POST` | `lib/themes/api/themes.$id.buy.server.ts` |
| `/api/themes/:id/publish` | `POST` | `lib/themes/api/themes.$id.publish.server.ts` |
| `/api/themes/shop` | `GET` | `lib/themes/api/themes.shop.server.ts` |

## `/api/tips`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tips/leaderboard` | `GET` | `lib/discovery/api/tips.leaderboard.server.ts` |

## `/api/today`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/today` | `GET` | `lib/quests/api/today.server.ts` |

## `/api/tournaments`

17 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tournaments` | `GET` `POST` | `lib/tournaments/api/tournaments.server.ts` |
| `/api/tournaments/:id` | `GET` | `lib/tournaments/api/tournaments.$id.server.ts` |
| `/api/tournaments/:id/cancel` | `POST` | `app/routes/api/tournaments/$id/cancel.ts` |
| `/api/tournaments/:id/checkin` | `PATCH` `POST` `PUT` | `lib/tournaments/api/tournaments.$id.checkin.server.ts` |
| `/api/tournaments/:id/matches/:matchId/award` | `POST` | `lib/tournaments/api/tournaments.$id.matches.$matchId.award.server.ts` |
| `/api/tournaments/:id/matches/:matchId/confirm` | `POST` | `lib/tournaments/api/tournaments.$id.matches.$matchId.confirm.server.ts` |
| `/api/tournaments/:id/matches/:matchId/decide` | `POST` | `lib/tournaments/api/tournaments.$id.matches.$matchId.decide.server.ts` |
| `/api/tournaments/:id/matches/:matchId/dispute` | `POST` | `lib/tournaments/api/tournaments.$id.matches.$matchId.dispute.server.ts` |
| `/api/tournaments/:id/matches/:matchId/report` | `POST` | `lib/tournaments/api/tournaments.$id.matches.$matchId.report.server.ts` |
| `/api/tournaments/:id/matches/:matchId/schedule` | `PATCH` `POST` `PUT` | `lib/tournaments/api/tournaments.$id.matches.$matchId.schedule.server.ts` |
| `/api/tournaments/:id/matches/:matchId/withdraw` | `POST` | `lib/tournaments/api/tournaments.$id.matches.$matchId.withdraw.server.ts` |
| `/api/tournaments/:id/pickem` | `GET` `PUT` | `lib/competitive/api/tournaments.$id.pickem.server.ts` |
| `/api/tournaments/:id/register` | `POST` | `app/routes/api/tournaments/$id/register.ts` |
| `/api/tournaments/:id/schedule-settings` | `PUT` | `lib/tournaments/api/tournaments.$id.schedule-settings.server.ts` |
| `/api/tournaments/:id/seeding` | `GET` `PUT` | `lib/tournaments/api/tournaments.$id.seeding.server.ts` |
| `/api/tournaments/:id/start` | `POST` | `app/routes/api/tournaments/$id/start.ts` |
| `/api/tournaments/:id/withdraw` | `POST` | `app/routes/api/tournaments/$id/withdraw.ts` |

## `/api/translate`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/translate` | `GET` | `lib/delight/api/translate.server.ts` |
| `/api/translate/suggest` | `POST` | `lib/delight/api/translate.suggest.server.ts` |
| `/api/translate/vote` | `POST` | `lib/delight/api/translate.vote.server.ts` |

## `/api/trash`

3 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/trash` | `GET` | `lib/trash/api/trash.server.ts` |
| `/api/trash/:kind/:id` | `DELETE` | `lib/trash/api/trash.$kind.$id.server.ts` |
| `/api/trash/restore` | `POST` | `lib/trash/api/trash.restore.server.ts` |

## `/api/unfurl`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/unfurl` | `GET` | `lib/unfurl/api/unfurl.server.ts` |

## `/api/user-builds`

16 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/user-builds` | `GET` `POST` | `lib/api/routes/user-builds.server.ts` |
| `/api/user-builds/:id` | `DELETE` `GET` `PATCH` | `lib/api/routes/user-builds.$id.server.ts` |
| `/api/user-builds/:id/comments` | `GET` `POST` | `lib/api/routes/user-builds.$id.comments.server.ts` |
| `/api/user-builds/:id/comments-lock` | `PUT` | `lib/builds/api/user-builds.$id.comments-lock.server.ts` |
| `/api/user-builds/:id/comments/:commentId` | `DELETE` `PATCH` | `lib/builds/api/user-builds.$id.comments.$commentId.server.ts` |
| `/api/user-builds/:id/comments/:commentId/hide` | `POST` | `lib/builds/api/user-builds.$id.comments.$commentId.hide.server.ts` |
| `/api/user-builds/:id/images` | `POST` | `lib/builds/api/user-builds.$id.images.server.ts` |
| `/api/user-builds/:id/insights` | `GET` | `lib/builds/api/user-builds.$id.insights.server.ts` |
| `/api/user-builds/:id/like` | `POST` | `lib/api/routes/user-builds.$id.like.server.ts` |
| `/api/user-builds/:id/releases` | `GET` `POST` | `lib/builds/api/user-builds.$id.releases.server.ts` |
| `/api/user-builds/:id/releases/:releaseId` | `DELETE` | `lib/builds/api/user-builds.$id.releases.$releaseId.server.ts` |
| `/api/user-builds/:id/screenshots` | `GET` `PUT` | `lib/builds/api/user-builds.$id.screenshots.server.ts` |
| `/api/user-builds/:id/unlock` | `POST` | `app/routes/api/user-builds/$id/unlock.ts` |
| `/api/user-builds/:id/view` | `POST` | `app/routes/api/user-builds/$id/view.ts` |
| `/api/user-builds/categories` | `GET` | `lib/api/routes/user-builds.categories.server.ts` |
| `/api/user-builds/featured` | `GET` | `lib/api/routes/user-builds.featured.server.ts` |

## `/api/users`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/users/:id/wishlist` | `GET` | `lib/wishlist/api/users.$id.wishlist.server.ts` |
| `/api/users/search` | `GET` | `lib/discovery/api/users.search.server.ts` |

## `/api/v1`

90 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/v1/blog` | `GET` `OPTIONS` | `app/routes/api/v1/blog.ts` |
| `/api/v1/blog/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/blog/$slug.ts` |
| `/api/v1/builds` | `GET` `OPTIONS` | `app/routes/api/v1/builds.ts` |
| `/api/v1/builds/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/builds/$slug.ts` |
| `/api/v1/communities/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/communities/$slug.ts` |
| `/api/v1/communities/:slug/modqueue` | `GET` `OPTIONS` | `app/routes/api/v1/communities/$slug/modqueue.ts` |
| `/api/v1/communities/:slug/modqueue/:itemId` | `OPTIONS` `POST` | `app/routes/api/v1/communities/$slug/modqueue/$itemId.ts` |
| `/api/v1/communities/:slug/posts` | `GET` `OPTIONS` | `app/routes/api/v1/communities/$slug/posts.ts` |
| `/api/v1/communities/:slug/rules` | `GET` `OPTIONS` | `app/routes/api/v1/communities/$slug/rules.ts` |
| `/api/v1/communities/:slug/sanctions` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/communities/$slug/sanctions.ts` |
| `/api/v1/communities/:slug/sanctions/:id` | `DELETE` `OPTIONS` | `app/routes/api/v1/communities/$slug/sanctions/$id.ts` |
| `/api/v1/events` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/events.ts` |
| `/api/v1/events/:id` | `GET` `OPTIONS` `PATCH` | `app/routes/api/v1/events/$id.ts` |
| `/api/v1/events/:id/attendees` | `GET` `OPTIONS` | `app/routes/api/v1/events/$id/attendees.ts` |
| `/api/v1/events/:id/cancel` | `OPTIONS` `POST` | `app/routes/api/v1/events/$id/cancel.ts` |
| `/api/v1/events/:id/rsvp` | `DELETE` `OPTIONS` `PUT` | `app/routes/api/v1/events/$id/rsvp.ts` |
| `/api/v1/events/:id/updates` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/events/$id/updates.ts` |
| `/api/v1/feed` | `GET` `OPTIONS` | `app/routes/api/v1/feed.ts` |
| `/api/v1/feeds/:id/posts` | `GET` `OPTIONS` | `app/routes/api/v1/feeds/$id/posts.ts` |
| `/api/v1/games` | `GET` `OPTIONS` | `app/routes/api/v1/games.ts` |
| `/api/v1/images` | `OPTIONS` `POST` | `app/routes/api/v1/images.ts` |
| `/api/v1/leaderboards/:game` | `GET` `OPTIONS` | `app/routes/api/v1/leaderboards/$game.ts` |
| `/api/v1/me` | `GET` `OPTIONS` | `app/routes/api/v1/me.ts` |
| `/api/v1/me/achievements` | `GET` `OPTIONS` | `app/routes/api/v1/me/achievements.ts` |
| `/api/v1/me/bookmarks` | `GET` `OPTIONS` | `app/routes/api/v1/me/bookmarks.ts` |
| `/api/v1/me/communities` | `GET` `OPTIONS` | `app/routes/api/v1/me/communities.ts` |
| `/api/v1/me/decks` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/me/decks.ts` |
| `/api/v1/me/decks/:id` | `DELETE` `GET` `OPTIONS` `PATCH` | `app/routes/api/v1/me/decks/$id.ts` |
| `/api/v1/me/decks/:id/cards` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/me/decks/$id/cards.ts` |
| `/api/v1/me/decks/:id/cards/:cardId` | `DELETE` `OPTIONS` `PATCH` | `app/routes/api/v1/me/decks/$id/cards/$cardId.ts` |
| `/api/v1/me/decks/:id/cards/by-external-id/:externalId` | `OPTIONS` `PUT` | `app/routes/api/v1/me/decks/$id/cards/by-external-id/$externalId.ts` |
| `/api/v1/me/decks/:id/due` | `GET` `OPTIONS` | `app/routes/api/v1/me/decks/$id/due.ts` |
| `/api/v1/me/deleted` | `GET` `OPTIONS` | `app/routes/api/v1/me/deleted.ts` |
| `/api/v1/me/events` | `GET` `OPTIONS` | `app/routes/api/v1/me/events.ts` |
| `/api/v1/me/feeds` | `GET` `OPTIONS` | `app/routes/api/v1/me/feeds.ts` |
| `/api/v1/me/feeds/:id` | `GET` `OPTIONS` | `app/routes/api/v1/me/feeds/$id.ts` |
| `/api/v1/me/feeds/:id/members` | `OPTIONS` `PUT` | `app/routes/api/v1/me/feeds/$id/members.ts` |
| `/api/v1/me/focus-sessions` | `GET` `OPTIONS` | `app/routes/api/v1/me/focus-sessions.ts` |
| `/api/v1/me/followers` | `GET` `OPTIONS` | `app/routes/api/v1/me/followers.ts` |
| `/api/v1/me/following` | `GET` `OPTIONS` | `app/routes/api/v1/me/following.ts` |
| `/api/v1/me/games` | `GET` `OPTIONS` | `app/routes/api/v1/me/games.ts` |
| `/api/v1/me/games/:gameId/days` | `GET` `OPTIONS` | `app/routes/api/v1/me/games/$gameId/days.ts` |
| `/api/v1/me/highlights` | `GET` `OPTIONS` | `app/routes/api/v1/me/highlights.ts` |
| `/api/v1/me/highlights/:id` | `DELETE` `OPTIONS` `PATCH` | `app/routes/api/v1/me/highlights/$id.ts` |
| `/api/v1/me/music/practice` | `GET` `OPTIONS` | `app/routes/api/v1/me/music/practice.ts` |
| `/api/v1/me/notifications` | `GET` `OPTIONS` | `app/routes/api/v1/me/notifications.ts` |
| `/api/v1/me/personal-bests` | `GET` `OPTIONS` | `app/routes/api/v1/me/personal-bests.ts` |
| `/api/v1/me/reading-goal` | `GET` `OPTIONS` | `app/routes/api/v1/me/reading-goal.ts` |
| `/api/v1/me/rmhtube/stats` | `GET` `OPTIONS` | `app/routes/api/v1/me/rmhtube/stats.ts` |
| `/api/v1/me/rmhtube/watch-later` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/me/rmhtube/watch-later.ts` |
| `/api/v1/me/rmhtube/watch-later/:id` | `DELETE` `OPTIONS` | `app/routes/api/v1/me/rmhtube/watch-later/$id.ts` |
| `/api/v1/me/scheduled` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/me/scheduled.ts` |
| `/api/v1/me/scheduled/:id` | `DELETE` `GET` `OPTIONS` `PATCH` | `app/routes/api/v1/me/scheduled/$id.ts` |
| `/api/v1/me/scheduled/:id/publish` | `OPTIONS` `POST` | `app/routes/api/v1/me/scheduled/$id/publish.ts` |
| `/api/v1/me/shelves` | `GET` `OPTIONS` | `app/routes/api/v1/me/shelves.ts` |
| `/api/v1/me/shelves/:slug` | `DELETE` `OPTIONS` `PUT` | `app/routes/api/v1/me/shelves/$slug.ts` |
| `/api/v1/me/tournaments` | `GET` `OPTIONS` | `app/routes/api/v1/me/tournaments.ts` |
| `/api/v1/me/typing` | `GET` `OPTIONS` | `app/routes/api/v1/me/typing.ts` |
| `/api/v1/me/typing/daily` | `GET` `OPTIONS` | `app/routes/api/v1/me/typing/daily.ts` |
| `/api/v1/me/typing/keys` | `GET` `OPTIONS` | `app/routes/api/v1/me/typing/keys.ts` |
| `/api/v1/news` | `GET` `OPTIONS` | `app/routes/api/v1/news.ts` |
| `/api/v1/news/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/news/$slug.ts` |
| `/api/v1/openapi.json` | `GET` `OPTIONS` | `app/routes/api/v1/openapi[.]json.ts` |
| `/api/v1/posts` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/posts.ts` |
| `/api/v1/posts/:id` | `DELETE` `GET` `OPTIONS` | `app/routes/api/v1/posts/$id.ts` |
| `/api/v1/posts/:id/bookmark` | `DELETE` `OPTIONS` `POST` | `app/routes/api/v1/posts/$id/bookmark.ts` |
| `/api/v1/posts/:id/comments` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/posts/$id/comments.ts` |
| `/api/v1/posts/:id/like` | `DELETE` `OPTIONS` `POST` | `app/routes/api/v1/posts/$id/like.ts` |
| `/api/v1/rmhtube/parties` | `GET` `OPTIONS` | `app/routes/api/v1/rmhtube/parties.ts` |
| `/api/v1/rmhtube/parties/:id` | `GET` `OPTIONS` | `app/routes/api/v1/rmhtube/parties/$id.ts` |
| `/api/v1/rmhtube/parties/:id/going` | `OPTIONS` `PUT` | `app/routes/api/v1/rmhtube/parties/$id/going.ts` |
| `/api/v1/search/people` | `GET` `OPTIONS` | `app/routes/api/v1/search/people.ts` |
| `/api/v1/search/posts` | `GET` `OPTIONS` | `app/routes/api/v1/search/posts.ts` |
| `/api/v1/slice-it/charts` | `GET` `OPTIONS` | `app/routes/api/v1/slice-it/charts.ts` |
| `/api/v1/slice-it/leaderboard` | `GET` `OPTIONS` | `app/routes/api/v1/slice-it/leaderboard.ts` |
| `/api/v1/tournaments` | `GET` `OPTIONS` | `app/routes/api/v1/tournaments.ts` |
| `/api/v1/tournaments/:id` | `GET` `OPTIONS` | `app/routes/api/v1/tournaments/$id.ts` |
| `/api/v1/tournaments/:id/check-in` | `OPTIONS` `POST` | `app/routes/api/v1/tournaments/$id/check-in.ts` |
| `/api/v1/tournaments/:id/matches` | `GET` `OPTIONS` | `app/routes/api/v1/tournaments/$id/matches.ts` |
| `/api/v1/tournaments/:id/matches/:matchId/claim` | `OPTIONS` `POST` | `app/routes/api/v1/tournaments/$id/matches/$matchId/claim.ts` |
| `/api/v1/tournaments/:id/matches/:matchId/claim/confirm` | `OPTIONS` `POST` | `app/routes/api/v1/tournaments/$id/matches/$matchId/claim/confirm.ts` |
| `/api/v1/tournaments/:id/matches/:matchId/claim/withdraw` | `OPTIONS` `POST` | `app/routes/api/v1/tournaments/$id/matches/$matchId/claim/withdraw.ts` |
| `/api/v1/users/:handle` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle.ts` |
| `/api/v1/users/:handle/follow` | `DELETE` `OPTIONS` `POST` | `app/routes/api/v1/users/$handle/follow.ts` |
| `/api/v1/users/:handle/followers` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/followers.ts` |
| `/api/v1/users/:handle/following` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/following.ts` |
| `/api/v1/users/:handle/games` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/games.ts` |
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
| `/api/velum2099/contracts` | `GET` `POST` | `lib/velum2099/api/velum2099.contracts.server.ts` |

## `/api/versecraft`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/versecraft/chapter` | `POST` | `lib/versecraft/api/versecraft.chapter.server.ts` |
| `/api/versecraft/outline` | `POST` | `lib/versecraft/api/versecraft.outline.server.ts` |
| `/api/versecraft/progress` | `GET` | `lib/versecraft/api/versecraft.progress.server.ts` |
| `/api/versecraft/save` | `GET` `POST` | `lib/versecraft/api/versecraft.save.server.ts` |
| `/api/versecraft/seeds` | `GET` `POST` | `lib/versecraft/api/versecraft.seeds.server.ts` |
| `/api/versecraft/seeds/fork` | `POST` | `lib/versecraft/api/versecraft.seeds.fork.server.ts` |
| `/api/versecraft/seeds/rate` | `POST` | `lib/versecraft/api/versecraft.seeds.rate.server.ts` |
| `/api/versecraft/world` | `GET` `POST` | `app/routes/api/versecraft/world.ts` |

## `/api/vibe`

8 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/vibe/ai` | `OPTIONS` `POST` | `app/routes/api/vibe/ai.ts` |
| `/api/vibe/gallery` | `GET` | `lib/rmhvibe/api/vibe.gallery.server.ts` |
| `/api/vibe/kv/:slug` | `GET` `POST` | `lib/rmhvibe/api/vibe.kv.$slug.server.ts` |
| `/api/vibe/page/:slug` | `GET` | `lib/rmhvibe/api/vibe.page.$slug.server.ts` |
| `/api/vibe/page/:slug/tweaks` | `POST` | `lib/rmhvibe/api/vibe.page.$slug.tweaks.server.ts` |
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
| `/api/webrings` | `GET` `POST` | `lib/profile/api/webrings.server.ts` |
| `/api/webrings/:slug` | `DELETE` `GET` | `lib/profile/api/webrings.$slug.server.ts` |
| `/api/webrings/:slug/hop` | `GET` | `lib/profile/api/webrings.$slug.hop.server.ts` |
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
| `/api/when` | `GET` `POST` | `lib/calendar/api/when.server.ts` |
| `/api/when/:id` | `DELETE` `GET` | `lib/calendar/api/when.$id.server.ts` |
| `/api/when/:id/ics` | `GET` | `lib/calendar/api/when.$id.ics.server.ts` |
| `/api/when/:id/lock` | `POST` | `lib/calendar/api/when.$id.lock.server.ts` |
| `/api/when/:id/respond` | `PUT` | `lib/calendar/api/when.$id.respond.server.ts` |

## `/api/wiki`

2 routes.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wiki/assist` | `OPTIONS` `POST` | `app/routes/api/wiki/assist.ts` |
| `/api/wiki/sso` | `GET` | `lib/wiki/api/wiki.sso.server.ts` |

## `/api/wishlist`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wishlist` | `DELETE` `GET` `POST` | `lib/wishlist/api/wishlist.server.ts` |

## `/api/wrapped`

1 route.

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wrapped` | `GET` | `lib/wrapped/api/wrapped.server.ts` |

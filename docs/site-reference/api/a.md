<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: A

See the [API inventory](../api.md) for how to read the tables.

## `/api/account`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/achievements/:userId` | `GET` | `lib/achievements/api/achievements.$userId.server.ts` |
| `/api/achievements/compare` | `GET` | `lib/achievements/api/achievements.compare.server.ts` |
| `/api/achievements/tracked` | `GET` | `lib/achievements/api/achievements.tracked.server.ts` |
| `/api/achievements/tracked/:achievementId` | `DELETE` `PUT` | `lib/achievements/api/achievements.tracked.$achievementId.server.ts` |

## `/api/activity`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/activity` | `GET` `POST` | `lib/activity/api/activity.server.ts` |

## `/api/admin`

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
| `/api/admin/daily-puzzles` | `GET` | `lib/admin/api/admin.daily-puzzles.server.ts` |
| `/api/admin/daily-puzzles/generate` | `POST` | `lib/admin/api/admin.daily-puzzles.generate.server.ts` |
| `/api/admin/daily-puzzles/replace` | `POST` | `lib/admin/api/admin.daily-puzzles.replace.server.ts` |
| `/api/admin/deepseek/balance` | `GET` | `lib/ai/api/admin.deepseek.balance.server.ts` |
| `/api/admin/deepseek/history` | `GET` | `lib/ai/api/admin.deepseek.history.server.ts` |
| `/api/admin/deepseek/refresh` | `POST` | `lib/ai/api/admin.deepseek.refresh.server.ts` |
| `/api/admin/deletions` | `GET` | `lib/admin/api/admin.deletions.server.ts` |
| `/api/admin/deletions/:userId/retry` | `POST` | `lib/admin/api/admin.deletions.$userId.retry.server.ts` |
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
| `/api/admin/homes` | `GET` `POST` | `lib/admin/api/admin.homes.server.ts` |
| `/api/admin/homes/scrape` | `POST` | `lib/admin/api/admin.homes.scrape.server.ts` |
| `/api/admin/homes/sources/:id/status` | `POST` | `lib/admin/api/admin.homes.sources.$id.status.server.ts` |
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
| `/api/admin/medschools/qa-limit-requests` | `GET` `POST` | `features/medschools/api/admin.medschools.qa-limit-requests.server.ts` |
| `/api/admin/medschools/secondaries` | `POST` | `features/medschools/api/admin.medschools.secondaries.server.ts` |
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
| `/api/admin/reports/claims` | `GET` | `lib/admin/api/admin.reports.claims.server.ts` |
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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/advent` | `GET` `POST` | `lib/gifting/api/advent.server.ts` |

## `/api/ai`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/albums/asset/*` | `GET` | `app/routes/api/albums/asset/$.ts` |

## `/api/altair`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/altair/heat` | `GET` | `features/altair/api/altair.heat.server.ts` |
| `/api/altair/leaderboard` | `GET` | `features/altair/api/altair.leaderboard.server.ts` |
| `/api/altair/match` | `POST` | `features/altair/api/altair.match.server.ts` |
| `/api/altair/meta` | `GET` `POST` | `features/altair/api/altair.meta.server.ts` |
| `/api/altair/run/finish` | `POST` | `features/altair/api/altair.run.finish.server.ts` |
| `/api/altair/run/start` | `POST` | `features/altair/api/altair.run.start.server.ts` |
| `/api/altair/run/status` | `GET` | `features/altair/api/altair.run.status.server.ts` |
| `/api/altair/runs` | `GET` | `features/altair/api/altair.runs.server.ts` |
| `/api/altair/score` | `POST` | `features/altair/api/altair.score.server.ts` |

## `/api/analytics`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/analytics/audience` | `GET` | `lib/social/api/analytics.audience.server.ts` |

## `/api/arcade`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/assistant` | `POST` | `lib/assistant/api/assistant.server.ts` |

## `/api/auth`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/auth/*` | `GET` `OPTIONS` `POST` | `app/routes/api/auth/$.ts` |

## `/api/awards`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/awards` | `GET` `POST` | `lib/awards/api/awards.server.ts` |
| `/api/awards/:id/hide` | `POST` | `lib/awards/api/awards.$id.hide.server.ts` |

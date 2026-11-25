<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: S

See the [API inventory](../api.md) for how to read the tables.

## `/api/safety`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/safety/pile-on` | `GET` `POST` | `lib/api/routes/safety.pile-on.server.ts` |

## `/api/saved-replies`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/saved-replies` | `GET` `POST` | `lib/messages/api/saved-replies.server.ts` |
| `/api/saved-replies/:id` | `DELETE` `PATCH` | `lib/messages/api/saved-replies.$id.server.ts` |
| `/api/saved-replies/:id/use` | `POST` | `lib/messages/api/saved-replies.$id.use.server.ts` |
| `/api/saved-replies/order` | `PUT` | `lib/messages/api/saved-replies.order.server.ts` |

## `/api/saves`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/saves` | `DELETE` `GET` `POST` | `lib/saves/api/saves.server.ts` |
| `/api/saves/folders` | `GET` `POST` | `lib/saves/api/saves.folders.server.ts` |
| `/api/saves/folders/:id` | `DELETE` `PATCH` | `lib/saves/api/saves.folders.$id.server.ts` |
| `/api/saves/note` | `PUT` | `lib/saves/api/saves.note.server.ts` |

## `/api/schedule`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/schedule` | `GET` | `lib/schedule/api/schedule.server.ts` |
| `/api/schedule/admin` | `DELETE` `GET` `POST` | `lib/schedule/api/schedule.admin.server.ts` |
| `/api/schedule/mine` | `GET` | `lib/schedule/api/schedule.mine.server.ts` |

## `/api/scheduled`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/scheduled` | `GET` `POST` | `lib/scheduled/api/scheduled.server.ts` |
| `/api/scheduled/:id` | `DELETE` `PATCH` | `lib/scheduled/api/scheduled.$id.server.ts` |
| `/api/scheduled/:id/publish` | `POST` | `lib/scheduled/api/scheduled.$id.publish.server.ts` |
| `/api/scheduled/capsules` | `GET` | `lib/scheduled/api/scheduled.capsules.server.ts` |

## `/api/search`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/search` | `GET` | `lib/search/api/search.server.ts` |
| `/api/search/saved` | `GET` `POST` | `lib/search/api/search.saved.server.ts` |
| `/api/search/saved/:id` | `DELETE` `PATCH` | `lib/search/api/search.saved.$id.server.ts` |

## `/api/series`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/series` | `GET` `POST` | `lib/posts-plus/api/series.server.ts` |
| `/api/series/:id` | `DELETE` `GET` `PATCH` | `lib/posts-plus/api/series.$id.server.ts` |
| `/api/series/:id/follow` | `DELETE` `PUT` | `lib/posts-plus/api/series.$id.follow.server.ts` |
| `/api/series/:id/posts` | `POST` | `lib/posts-plus/api/series.$id.posts.server.ts` |
| `/api/series/:id/posts/:postId` | `DELETE` `PATCH` | `lib/posts-plus/api/series.$id.posts.$postId.server.ts` |
| `/api/series/post/:postId` | `GET` | `lib/posts-plus/api/series.post.$postId.server.ts` |

## `/api/services`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/services/rebar-reservations` | `DELETE` `GET` `POST` | `lib/rebar-rutabaga/api/services.rebar-reservations.server.ts` |

## `/api/settings`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/signal-forge/abandon` | `POST` | `features/signal-forge/api/signal-forge.abandon.server.ts` |
| `/api/signal-forge/leaderboard` | `GET` | `features/signal-forge/api/signal-forge.leaderboard.server.ts` |
| `/api/signal-forge/load` | `GET` | `features/signal-forge/api/signal-forge.load.server.ts` |
| `/api/signal-forge/save` | `POST` | `features/signal-forge/api/signal-forge.save.server.ts` |
| `/api/signal-forge/score` | `POST` | `features/signal-forge/api/signal-forge.score.server.ts` |

## `/api/sitewide-announcement`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/sitewide-announcement` | `GET` | `lib/api/routes/sitewide-announcement.server.ts` |
| `/api/sitewide-announcement/seen` | `POST` | `lib/api/routes/sitewide-announcement.seen.server.ts` |

## `/api/slice-it`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/slice-it/admin/content` | `GET` | `features/slice-it/api/slice-it.admin.content.server.ts` |
| `/api/slice-it/admin/review` | `GET` | `features/slice-it/api/slice-it.admin.review.server.ts` |
| `/api/slice-it/admin/takedown` | `GET` `POST` | `features/slice-it/api/slice-it.admin.takedown.server.ts` |
| `/api/slice-it/charts` | `GET` `POST` | `features/slice-it/api/slice-it.charts.server.ts` |
| `/api/slice-it/charts/:id` | `DELETE` `GET` `PATCH` `POST` | `features/slice-it/api/slice-it.charts.$id.server.ts` |
| `/api/slice-it/charts/:id/reviews` | `DELETE` `GET` `PUT` | `features/slice-it/api/slice-it.charts.$id.reviews.server.ts` |
| `/api/slice-it/charts/:id/revisions` | `GET` | `features/slice-it/api/slice-it.charts.$id.revisions.server.ts` |
| `/api/slice-it/charts/:id/revisions/:revisionId` | `GET` | `features/slice-it/api/slice-it.charts.$id.revisions.$revisionId.server.ts` |
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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/sohumtracker/activity` | `GET` | `lib/sohumtracker/api/sohumtracker.activity.server.ts` |
| `/api/sohumtracker/alert` | `GET` `POST` | `lib/sohumtracker/api/sohumtracker.alert.server.ts` |
| `/api/sohumtracker/export` | `GET` | `lib/sohumtracker/api/sohumtracker.export.server.ts` |
| `/api/sohumtracker/stream` | `GET` | `app/routes/api/sohumtracker/stream.ts` |

## `/api/spaces`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/spaces` | `GET` `POST` | `lib/spaces/api/spaces.server.ts` |
| `/api/spaces/:id` | `GET` | `app/routes/api/spaces/$id/index.ts` |
| `/api/spaces/:id/end` | `POST` | `lib/spaces/api/spaces.$id.end.server.ts` |
| `/api/spaces/:id/start` | `POST` | `lib/spaces/api/spaces.$id.start.server.ts` |
| `/api/spaces/live` | `GET` | `app/routes/api/spaces/live.ts` |

## `/api/speedrun`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/speedrun/categories` | `GET` `POST` | `lib/speedrun/api/speedrun.categories.server.ts` |
| `/api/speedrun/leaderboard` | `GET` | `lib/speedrun/api/speedrun.leaderboard.server.ts` |
| `/api/speedrun/queue` | `GET` `POST` | `lib/speedrun/api/speedrun.queue.server.ts` |
| `/api/speedrun/replays` | `GET` | `lib/speedrun/api/speedrun.replays.server.ts` |
| `/api/speedrun/runs` | `GET` `POST` | `lib/speedrun/api/speedrun.runs.server.ts` |
| `/api/speedrun/verify` | `GET` `POST` | `lib/speedrun/api/speedrun.verify.server.ts` |

## `/api/spotify`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/spotify/search` | `GET` | `lib/api/routes/spotify.search.server.ts` |

## `/api/staking`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/staking` | `GET` | `lib/staking/api/staking.server.ts` |
| `/api/staking/deposit` | `POST` | `lib/staking/api/staking.deposit.server.ts` |
| `/api/staking/settings` | `POST` | `lib/staking/api/staking.settings.server.ts` |
| `/api/staking/withdraw` | `POST` | `lib/staking/api/staking.withdraw.server.ts` |

## `/api/stamps`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/stamps` | `GET` `POST` | `lib/profile/api/stamps.server.ts` |
| `/api/stamps/:id` | `DELETE` | `lib/profile/api/stamps.$id.server.ts` |
| `/api/stamps/:id/wall` | `DELETE` `POST` | `lib/profile/api/stamps.$id.wall.server.ts` |
| `/api/stamps/image/:filename` | `GET` | `lib/profile/api/stamps.image.$filename.server.ts` |
| `/api/stamps/mine` | `GET` | `lib/profile/api/stamps.mine.server.ts` |

## `/api/storefront`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/storefront/creator/:userid` | `GET` | `lib/storefront/api/storefront.creator.$userid.server.ts` |
| `/api/storefront/products` | `POST` | `lib/storefront/api/storefront.products.server.ts` |
| `/api/storefront/products/:id` | `DELETE` `PATCH` | `lib/storefront/api/storefront.products.$id.server.ts` |
| `/api/storefront/products/:id/buy` | `POST` | `lib/storefront/api/storefront.products.$id.buy.server.ts` |

## `/api/streak`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/streak` | `GET` `POST` | `lib/api/routes/streak.server.ts` |
| `/api/streak/freeze` | `POST` | `lib/api/routes/streak.freeze.server.ts` |

## `/api/studio`

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
| `/api/studio/shares` | `GET` `POST` | `lib/studio/api/studio.shares.server.ts` |
| `/api/studio/shares/:token` | `DELETE` `GET` | `lib/studio/api/studio.shares.$token.server.ts` |
| `/api/studio/tiers` | `GET` `PUT` | `lib/studio/api/studio.tiers.server.ts` |

## `/api/study`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/study/card-images` | `POST` | `lib/study/api/study.card-images.server.ts` |
| `/api/study/card-sound` | `POST` | `lib/study/api/study.card-sound.server.ts` |
| `/api/study/card-sound/:file` | `GET` | `lib/study/api/study.card-sound.$file.server.ts` |
| `/api/study/cards/:id` | `DELETE` `PATCH` | `lib/study/api/study.cards.$id.server.ts` |
| `/api/study/cards/:id/history` | `GET` | `lib/study/api/study.cards.$id.history.server.ts` |
| `/api/study/cards/:id/restart` | `POST` | `lib/study/api/study.cards.$id.restart.server.ts` |
| `/api/study/cards/:id/review` | `POST` | `lib/study/api/study.cards.$id.review.server.ts` |
| `/api/study/cards/:id/suspend` | `PUT` | `lib/study/api/study.cards.$id.suspend.server.ts` |
| `/api/study/decks` | `GET` `POST` | `lib/study/api/study.decks.server.ts` |
| `/api/study/decks/:id` | `DELETE` `GET` `PATCH` `POST` | `lib/study/api/study.decks.$id.server.ts` |
| `/api/study/decks/:id/cards` | `POST` | `lib/study/api/study.decks.$id.cards.server.ts` |
| `/api/study/decks/:id/clone` | `POST` | `lib/study/api/study.decks.$id.clone.server.ts` |
| `/api/study/decks/:id/editors` | `GET` `POST` | `lib/study/api/study.decks.$id.editors.server.ts` |
| `/api/study/decks/:id/editors/:userId` | `DELETE` | `lib/study/api/study.decks.$id.editors.$userId.server.ts` |
| `/api/study/decks/:id/folder` | `PUT` | `lib/study/api/study.decks.$id.folder.server.ts` |
| `/api/study/decks/:id/invitation` | `POST` | `lib/study/api/study.decks.$id.invitation.server.ts` |
| `/api/study/decks/:id/leave` | `POST` | `lib/study/api/study.decks.$id.leave.server.ts` |
| `/api/study/decks/:id/link-original` | `POST` | `lib/study/api/study.decks.$id.link-original.server.ts` |
| `/api/study/decks/:id/order` | `PUT` | `lib/study/api/study.decks.$id.order.server.ts` |
| `/api/study/decks/:id/pace` | `GET` `PATCH` | `lib/study/api/study.decks.$id.pace.server.ts` |
| `/api/study/decks/:id/rating` | `DELETE` `GET` `PUT` | `lib/study/api/study.decks.$id.rating.server.ts` |
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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/study-buddy` | `DELETE` `GET` `POST` | `lib/calendar/api/study-buddy.server.ts` |

## `/api/study-plans`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/study-plans` | `GET` `POST` | `lib/tools/api/study-plans.server.ts` |
| `/api/study-plans/:id` | `DELETE` `PUT` | `lib/tools/api/study-plans.$id.server.ts` |

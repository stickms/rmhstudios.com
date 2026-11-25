<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: D

See the [API inventory](../api.md) for how to read the tables.

## `/api/daily-puzzles`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/daily-puzzles/following` | `GET` | `lib/daily-puzzles/api/daily-puzzles.following.server.ts` |
| `/api/daily-puzzles/following/summary` | `GET` | `lib/daily-puzzles/api/daily-puzzles.following.summary.server.ts` |
| `/api/daily-puzzles/leaderboard` | `GET` | `lib/daily-puzzles/api/daily-puzzles.leaderboard.server.ts` |
| `/api/daily-puzzles/puzzle` | `GET` | `lib/daily-puzzles/api/daily-puzzles.puzzle.server.ts` |
| `/api/daily-puzzles/results` | `GET` | `lib/daily-puzzles/api/daily-puzzles.results.server.ts` |
| `/api/daily-puzzles/score` | `POST` | `lib/daily-puzzles/api/daily-puzzles.score.server.ts` |
| `/api/daily-puzzles/stats` | `GET` | `lib/daily-puzzles/api/daily-puzzles.stats.server.ts` |

## `/api/datacenter`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/datacenter/compute` | `GET` `POST` | `lib/datacenter/api/datacenter.compute.server.ts` |

## `/api/delight`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/delight/config` | `GET` | `lib/delight/api/delight.config.server.ts` |

## `/api/developer`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/discovery/alerts` | `DELETE` `GET` `POST` | `lib/discovery/api/discovery.alerts.server.ts` |
| `/api/discovery/memories` | `GET` `PUT` | `lib/discovery/api/discovery.memories.server.ts` |
| `/api/discovery/surprise` | `GET` | `lib/discovery/api/discovery.surprise.server.ts` |
| `/api/discovery/today` | `GET` | `lib/discovery/api/discovery.today.server.ts` |
| `/api/discovery/trending/:tag` | `GET` | `lib/discovery/api/discovery.trending.$tag.server.ts` |
| `/api/discovery/watch` | `GET` `PUT` | `lib/discovery/api/discovery.watch.server.ts` |

## `/api/doctrine`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/dream-rift/coop` | `GET` `POST` | `features/dream-rift/api/dream-rift.coop.server.ts` |
| `/api/dream-rift/leaderboard` | `GET` | `features/dream-rift/api/dream-rift.leaderboard.server.ts` |
| `/api/dream-rift/score` | `POST` | `features/dream-rift/api/dream-rift.score.server.ts` |

## `/api/dunesday`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/dunesday/ask` | `POST` | `lib/dunesday/api/dunesday.ask.server.ts` |
| `/api/dunesday/feeds/:feedId/calendar.ics` | `GET` | `lib/dunesday/api/dunesday.feeds.$feedId.calendar.ics.server.ts` |
| `/api/dunesday/feeds/:feedId/rss.xml` | `GET` | `lib/dunesday/api/dunesday.feeds.$feedId.rss.xml.server.ts` |
| `/api/dunesday/sync` | `POST` | `lib/dunesday/api/dunesday.sync.server.ts` |
| `/api/dunesday/sync/:feedId` | `DELETE` `GET` `PUT` | `lib/dunesday/api/dunesday.sync.$feedId.server.ts` |
| `/api/dunesday/sync/:feedId/discord` | `POST` `PUT` | `lib/dunesday/api/dunesday.sync.$feedId.discord.server.ts` |

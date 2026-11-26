<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: T

See the [API inventory](../api.md) for how to read the tables.

## `/api/tags`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tags/:tag` | `GET` | `lib/api/routes/tags.$tag.server.ts` |

## `/api/temple-of-joy`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/temple-of-joy/efficiency` | `GET` `POST` | `lib/temple-of-joy/api/temple-of-joy.efficiency.server.ts` |
| `/api/temple-of-joy/save` | `DELETE` `GET` `POST` | `lib/temple-of-joy/api/temple-of-joy.save.server.ts` |

## `/api/tf2-game`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tf2-game/assets/*` | `GET` | `app/routes/api/tf2-game/assets/$.ts` |

## `/api/tf2-hud`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/themes` | `GET` `POST` | `lib/themes/api/themes.server.ts` |
| `/api/themes/:id` | `DELETE` `GET` `PUT` | `lib/themes/api/themes.$id.server.ts` |
| `/api/themes/:id/buy` | `POST` | `lib/themes/api/themes.$id.buy.server.ts` |
| `/api/themes/:id/publish` | `POST` | `lib/themes/api/themes.$id.publish.server.ts` |
| `/api/themes/shop` | `GET` | `lib/themes/api/themes.shop.server.ts` |

## `/api/tips`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/tips/leaderboard` | `GET` | `lib/discovery/api/tips.leaderboard.server.ts` |

## `/api/today`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/today` | `GET` | `lib/quests/api/today.server.ts` |

## `/api/tournaments`

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
| `/api/tournaments/mine` | `GET` | `lib/tournaments/api/tournaments.mine.server.ts` |

## `/api/translate`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/translate` | `GET` | `lib/delight/api/translate.server.ts` |
| `/api/translate/suggest` | `POST` | `lib/delight/api/translate.suggest.server.ts` |
| `/api/translate/vote` | `POST` | `lib/delight/api/translate.vote.server.ts` |

## `/api/trash`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/trash` | `GET` | `lib/trash/api/trash.server.ts` |
| `/api/trash/:kind/:id` | `DELETE` | `lib/trash/api/trash.$kind.$id.server.ts` |
| `/api/trash/restore` | `POST` | `lib/trash/api/trash.restore.server.ts` |

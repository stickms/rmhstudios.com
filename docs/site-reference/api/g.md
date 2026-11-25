<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: G

See the [API inventory](../api.md) for how to read the tables.

## `/api/gabriels-horn`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gabriels-horn/house-rule` | `POST` | `features/gabriels-horn/api/gabriels-horn.house-rule.server.ts` |
| `/api/gabriels-horn/leaderboard` | `GET` | `features/gabriels-horn/api/gabriels-horn.leaderboard.server.ts` |
| `/api/gabriels-horn/table-read` | `GET` | `features/gabriels-horn/api/gabriels-horn.table-read.server.ts` |

## `/api/game-night`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/game-night` | `GET` `PATCH` `POST` | `lib/competitive/api/game-night.server.ts` |

## `/api/game-saves`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/game-saves` | `GET` | `lib/game-saves/api/game-saves.server.ts` |
| `/api/game-saves/:gameId` | `DELETE` `GET` `POST` | `lib/game-saves/api/game-saves.$gameId.server.ts` |
| `/api/game-saves/:gameId/restore` | `POST` | `lib/game-saves/api/game-saves.$gameId.restore.server.ts` |
| `/api/game-saves/:gameId/snapshots` | `GET` | `lib/game-saves/api/game-saves.$gameId.snapshots.server.ts` |
| `/api/game-saves/:gameId/snapshots/:id` | `GET` | `lib/game-saves/api/game-saves.$gameId.snapshots.$id.server.ts` |

## `/api/games`

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
| `/api/games/friends/activity` | `GET` | `lib/games/api/games.friends.activity.server.ts` |
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
| `/api/games/synapse-storm/matches` | `GET` | `features/synapse-storm/api/games.synapse-storm.matches.server.ts` |
| `/api/games/synapse-storm/save` | `GET` | `features/synapse-storm/api/games.synapse-storm.save.server.ts` |
| `/api/games/synapse-storm/score` | `POST` | `lib/game/api/games.synapse-storm.score.server.ts` |
| `/api/games/trades/accept` | `POST` | `lib/cards/api/games.trades.accept.server.ts` |
| `/api/games/trades/cancel` | `POST` | `lib/cards/api/games.trades.cancel.server.ts` |
| `/api/games/trades/decline` | `POST` | `lib/cards/api/games.trades.decline.server.ts` |
| `/api/games/trades/propose` | `POST` | `lib/cards/api/games.trades.propose.server.ts` |

## `/api/gif`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gif/search` | `GET` | `app/routes/api/gif/search.ts` |

## `/api/gift-exchanges`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gift-exchanges` | `GET` `POST` | `lib/gifting/api/gift-exchanges.server.ts` |
| `/api/gift-exchanges/:id` | `DELETE` `GET` | `lib/gifting/api/gift-exchanges.$id.server.ts` |
| `/api/gift-exchanges/:id/draw` | `POST` | `lib/gifting/api/gift-exchanges.$id.draw.server.ts` |
| `/api/gift-exchanges/:id/gift` | `POST` | `lib/gifting/api/gift-exchanges.$id.gift.server.ts` |
| `/api/gift-exchanges/:id/join` | `DELETE` `POST` | `lib/gifting/api/gift-exchanges.$id.join.server.ts` |
| `/api/gift-exchanges/:id/me` | `PUT` | `lib/gifting/api/gift-exchanges.$id.me.server.ts` |

## `/api/gift-sub`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gift-sub` | `GET` `POST` | `lib/gifting/api/gift-sub.server.ts` |

## `/api/gifts`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/gifts/scheduled` | `GET` `POST` | `lib/gifting/api/gifts.scheduled.server.ts` |
| `/api/gifts/scheduled/:id` | `DELETE` | `lib/gifting/api/gifts.scheduled.$id.server.ts` |
| `/api/gifts/scheduled/:id/unwrap` | `POST` | `lib/gifting/api/gifts.scheduled.$id.unwrap.server.ts` |

## `/api/globeset`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/globeset/record` | `GET` | `lib/globeset/api/globeset.record.server.ts` |

## `/api/group-chats`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/group-invites/:code/join` | `POST` | `lib/group-chat/api/group-invites.$code.join.server.ts` |

## `/api/groupcalls`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/groupcalls/active` | `GET` | `lib/api/routes/groupcalls.active.server.ts` |
| `/api/groupcalls/history` | `GET` | `lib/api/routes/groupcalls.history.server.ts` |
| `/api/groupcalls/invitable` | `GET` | `lib/api/routes/groupcalls.invitable.server.ts` |

## `/api/guides`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/guides` | `POST` | `lib/games/api/guides.server.ts` |
| `/api/guides/:id` | `DELETE` `GET` `PUT` | `lib/games/api/guides.$id.server.ts` |
| `/api/guides/:id/publish` | `POST` | `lib/games/api/guides.$id.publish.server.ts` |
| `/api/guides/:id/revisions` | `GET` | `lib/games/api/guides.$id.revisions.server.ts` |
| `/api/guides/:id/revisions/:revisionId` | `GET` | `lib/games/api/guides.$id.revisions.$revisionId.server.ts` |
| `/api/guides/:id/revisions/:revisionId/restore` | `POST` | `lib/games/api/guides.$id.revisions.$revisionId.restore.server.ts` |

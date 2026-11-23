<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: C

See the [API inventory](../api.md) for how to read the tables.

## `/api/calc-notebooks`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calc-notebooks` | `GET` `POST` | `lib/tools/api/calc-notebooks.server.ts` |
| `/api/calc-notebooks/:id` | `DELETE` `PUT` | `lib/tools/api/calc-notebooks.$id.server.ts` |

## `/api/calendar`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calendar/:token` | `GET` | `lib/calendar/api/calendar.$token.server.ts` |

## `/api/calendar-feed`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calendar-feed` | `GET` `PATCH` | `lib/calendar/api/calendar-feed.server.ts` |

## `/api/calls`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/calls/answer` | `GET` `PUT` | `lib/call/api/calls.answer.server.ts` |
| `/api/calls/history` | `GET` | `lib/call/api/calls.history.server.ts` |
| `/api/calls/ice` | `GET` | `lib/call/api/calls.ice.server.ts` |
| `/api/calls/mute` | `DELETE` `GET` `POST` | `lib/call/api/calls.mute.server.ts` |
| `/api/calls/privacy` | `GET` `PUT` | `lib/call/api/calls.privacy.server.ts` |

## `/api/canvas`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/canvas` | `GET` | `lib/canvas/api/canvas.server.ts` |
| `/api/canvas/log` | `GET` | `lib/canvas/api/canvas.log.server.ts` |
| `/api/canvas/place` | `POST` | `lib/canvas/api/canvas.place.server.ts` |
| `/api/canvas/state` | `GET` | `lib/canvas/api/canvas.state.server.ts` |
| `/api/canvas/stream` | `GET` | `app/routes/api/canvas/stream.ts` |

## `/api/casino`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/casino/rooms` | `GET` | `lib/api/routes/casino.rooms.server.ts` |

## `/api/chat-folders`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/chat-folders` | `GET` `POST` | `lib/chat-plus/api/chat-folders.server.ts` |
| `/api/chat-folders/:id` | `DELETE` `PATCH` | `lib/chat-plus/api/chat-folders.$id.server.ts` |
| `/api/chat-folders/:id/items` | `PUT` | `lib/chat-plus/api/chat-folders.$id.items.server.ts` |

## `/api/chats`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/circle` | `GET` `PUT` | `lib/api/routes/circle.server.ts` |

## `/api/client-error`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/client-error` | `POST` | `app/routes/api/client-error.ts` |

## `/api/coins`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/comments/:commentId/react` | `POST` | `lib/social/api/comments.$commentId.react.server.ts` |
| `/api/comments/:commentId/translate` | `GET` | `lib/ai/api/comments.$commentId.translate.server.ts` |

## `/api/communities`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/community-goals` | `GET` `POST` | `lib/economy/api/community-goals.server.ts` |
| `/api/community-goals/:id/admin` | `POST` | `lib/economy/api/community-goals.$id.admin.server.ts` |
| `/api/community-goals/:id/pledge` | `POST` | `lib/economy/api/community-goals.$id.pledge.server.ts` |

## `/api/community-pages`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/community-pages` | `GET` `POST` | `lib/communities/api/community-pages.server.ts` |
| `/api/community-pages/:id` | `DELETE` `PATCH` | `lib/communities/api/community-pages.$id.server.ts` |
| `/api/community-pages/:id/revisions` | `GET` `POST` | `lib/communities/api/community-pages.$id.revisions.server.ts` |

## `/api/connections`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/connections/grids` | `GET` `POST` | `lib/party/api/connections.grids.server.ts` |
| `/api/connections/grids/:id` | `DELETE` `GET` | `lib/party/api/connections.grids.$id.server.ts` |
| `/api/connections/grids/:id/guess` | `POST` | `lib/party/api/connections.grids.$id.guess.server.ts` |
| `/api/connections/grids/:id/rate` | `POST` | `lib/party/api/connections.grids.$id.rate.server.ts` |
| `/api/connections/grids/:id/schedule` | `POST` | `lib/party/api/connections.grids.$id.schedule.server.ts` |

## `/api/context-notes`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/context-notes` | `GET` `POST` | `lib/context-notes/api/context-notes.server.ts` |
| `/api/context-notes/:id` | `DELETE` | `lib/context-notes/api/context-notes.$id.server.ts` |
| `/api/context-notes/:id/rate` | `POST` | `lib/context-notes/api/context-notes.$id.rate.server.ts` |

## `/api/creator`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/creator/redeem` | `GET` `POST` | `lib/creator/api/creator.redeem.server.ts` |
| `/api/creator/studio-overview` | `GET` | `lib/creator/api/creator.studio-overview.server.ts` |

## `/api/creators`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/creators/:id/join` | `POST` | `lib/creator/api/creators.$id.join.server.ts` |

## `/api/csgo-game`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/csgo-game/assets/*` | `GET` | `app/routes/api/csgo-game/assets/$.ts` |

## `/api/csp-report`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/csp-report` | `POST` | `lib/api/routes/csp-report.server.ts` |

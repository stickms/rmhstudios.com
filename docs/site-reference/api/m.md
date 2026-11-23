<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: M

See the [API inventory](../api.md) for how to read the tables.

## `/api/marathon-lists`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/marathon-lists` | `GET` `POST` | `lib/tools/api/marathon-lists.server.ts` |
| `/api/marathon-lists/:id` | `DELETE` `PUT` | `lib/tools/api/marathon-lists.$id.server.ts` |
| `/api/marathon-lists/shared/:shareId` | `GET` | `lib/tools/api/marathon-lists.shared.$shareId.server.ts` |

## `/api/market`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/market/listings` | `GET` `POST` | `lib/market/api/market.listings.server.ts` |
| `/api/market/listings/:id` | `DELETE` | `lib/market/api/market.listings.$id.server.ts` |
| `/api/market/listings/:id/buy` | `POST` | `lib/market/api/market.listings.$id.buy.server.ts` |

## `/api/medschools`

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
| `/api/medschools/me/qa-limit-request` | `GET` `POST` | `features/medschools/api/medschools.me.qa-limit-request.server.ts` |
| `/api/medschools/me/secondaries/overlap` | `GET` | `features/medschools/api/medschools.me.secondaries.overlap.server.ts` |
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
| `/api/medschools/schools/:slug/secondaries` | `GET` | `features/medschools/api/medschools.schools.$slug.secondaries.server.ts` |
| `/api/medschools/today` | `GET` | `features/medschools/api/medschools.today.server.ts` |

## `/api/memory`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/memory` | `DELETE` `GET` `POST` | `lib/ai/api/memory.server.ts` |

## `/api/messages`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/moderation/block` | `GET` `POST` | `lib/moderation/api/moderation.block.server.ts` |
| `/api/moderation/mute` | `GET` `POST` | `lib/moderation/api/moderation.mute.server.ts` |
| `/api/moderation/report` | `POST` | `lib/moderation/api/moderation.report.server.ts` |

## `/api/moments`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/moments` | `POST` | `lib/api/routes/moments.server.ts` |

## `/api/museum`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/museum` | `GET` | `lib/delight/api/museum.server.ts` |

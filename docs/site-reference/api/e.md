<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: E

See the [API inventory](../api.md) for how to read the tables.

## `/api/economy`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/economy/savings-goals` | `GET` `POST` | `lib/economy/api/economy.savings-goals.server.ts` |
| `/api/economy/savings-goals/:id` | `DELETE` | `lib/economy/api/economy.savings-goals.$id.server.ts` |

## `/api/elections`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/email/unsubscribe` | `GET` `POST` | `app/routes/api/email/unsubscribe.ts` |

## `/api/embed`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/embed/oembed` | `GET` | `lib/api/routes/embed.oembed.server.ts` |

## `/api/emoji-packs`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/emoji-packs` | `GET` `POST` | `lib/emoji/api/emoji-packs.server.ts` |
| `/api/emoji-packs/:slug` | `GET` | `lib/emoji/api/emoji-packs.$slug.server.ts` |
| `/api/emoji-packs/:slug/items` | `DELETE` `POST` | `lib/emoji/api/emoji-packs.$slug.items.server.ts` |
| `/api/emoji-packs/:slug/subscribe` | `DELETE` `POST` | `lib/emoji/api/emoji-packs.$slug.subscribe.server.ts` |
| `/api/emoji-packs/:slug/upload` | `POST` | `lib/emoji/api/emoji-packs.$slug.upload.server.ts` |
| `/api/emoji-packs/installed` | `GET` | `lib/emoji/api/emoji-packs.installed.server.ts` |

## `/api/events`

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

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/experiments` | `GET` `POST` | `lib/api/routes/experiments.server.ts` |

## `/api/explore`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/explore` | `GET` | `lib/discovery/api/explore.server.ts` |

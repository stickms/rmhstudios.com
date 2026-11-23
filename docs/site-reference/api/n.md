<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: N

See the [API inventory](../api.md) for how to read the tables.

## `/api/neon-driftway`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/neon-driftway/leaderboard` | `GET` | `lib/neon-driftway/api/neon-driftway.leaderboard.server.ts` |
| `/api/neon-driftway/livery` | `GET` `PUT` | `lib/neon-driftway/api/neon-driftway.livery.server.ts` |
| `/api/neon-driftway/score` | `POST` | `lib/game/api/neon-driftway.score.server.ts` |

## `/api/news`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/news/summary` | `POST` | `lib/news-wire/api/news.summary.server.ts` |

## `/api/nightrail`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/nightrail/tricks` | `GET` `POST` | `lib/trick-week/api/nightrail.tricks.server.ts` |
| `/api/nightrail/tricks/vote` | `POST` | `lib/trick-week/api/nightrail.tricks.vote.server.ts` |

## `/api/notices`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/notices/active` | `GET` | `lib/ops/api/notices.active.server.ts` |
| `/api/notices/dismiss` | `POST` | `lib/ops/api/notices.dismiss.server.ts` |

## `/api/notifications`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/notifications` | `GET` | `lib/preferences/api/notifications.server.ts` |
| `/api/notifications/:id` | `DELETE` `PATCH` | `lib/notifications/api/notifications.$id.server.ts` |
| `/api/notifications/dismiss` | `POST` | `lib/notifications/api/notifications.dismiss.server.ts` |
| `/api/notifications/preferences` | `GET` `PUT` | `lib/preferences/api/notifications.preferences.server.ts` |
| `/api/notifications/read` | `POST` | `lib/preferences/api/notifications.read.server.ts` |

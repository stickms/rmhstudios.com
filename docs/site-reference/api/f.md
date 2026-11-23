<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: F

See the [API inventory](../api.md) for how to read the tables.

## `/api/feed`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feed/hashtag-search` | `GET` | `lib/feed/api/feed.hashtag-search.server.ts` |
| `/api/feed/image/:filename` | `GET` | `app/routes/api/feed/image/$filename.ts` |
| `/api/feed/mention-search` | `GET` | `lib/feed/api/feed.mention-search.server.ts` |
| `/api/feed/repost-mutes` | `GET` `POST` | `lib/feed/api/feed.repost-mutes.server.ts` |
| `/api/feed/signal` | `DELETE` `GET` `POST` | `lib/feed/api/feed.signal.server.ts` |
| `/api/feed/stream` | `GET` | `app/routes/api/feed/stream.ts` |

## `/api/feedback`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feedback` | `POST` | `lib/api/routes/feedback.server.ts` |
| `/api/feedback/mine` | `GET` | `lib/feedback/api/feedback.mine.server.ts` |

## `/api/feeds`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/feeds` | `GET` `POST` | `lib/discovery/api/feeds.server.ts` |
| `/api/feeds/:id` | `DELETE` `GET` `PATCH` | `lib/discovery/api/feeds.$id.server.ts` |
| `/api/feeds/:id/subscribe` | `DELETE` `POST` | `lib/discovery/api/feeds.$id.subscribe.server.ts` |

## `/api/flags`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/flags` | `GET` | `lib/flags/api/flags.server.ts` |

## `/api/follows`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/follows` | `GET` | `lib/social/api/follows.server.ts` |
| `/api/follows/bulk-unfollow` | `POST` | `lib/social/api/follows.bulk-unfollow.server.ts` |
| `/api/follows/remove` | `POST` | `lib/social/api/follows.remove.server.ts` |
| `/api/follows/undo` | `POST` | `lib/social/api/follows.undo.server.ts` |

## `/api/forecasting`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/forecasting/calibration` | `GET` | `lib/forecasting/api/forecasting.calibration.server.ts` |
| `/api/forecasting/seasons` | `GET` | `lib/forecasting/api/forecasting.seasons.server.ts` |

## `/api/fortune`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/fortune` | `POST` | `lib/delight/api/fortune.server.ts` |
| `/api/fortune/today` | `GET` | `lib/delight/api/fortune.today.server.ts` |

## `/api/friendly`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/friendly` | `GET` `POST` | `lib/competitive/api/friendly.server.ts` |
| `/api/friendly/:id` | `POST` | `lib/competitive/api/friendly.$id.server.ts` |

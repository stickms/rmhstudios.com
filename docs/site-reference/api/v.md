<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: V

See the [API inventory](../api.md) for how to read the tables.

## `/api/v1`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/v1/blog` | `GET` `OPTIONS` | `app/routes/api/v1/blog.ts` |
| `/api/v1/blog/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/blog/$slug.ts` |
| `/api/v1/builds` | `GET` `OPTIONS` | `app/routes/api/v1/builds.ts` |
| `/api/v1/builds/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/builds/$slug.ts` |
| `/api/v1/communities/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/communities/$slug.ts` |
| `/api/v1/communities/:slug/modqueue` | `GET` `OPTIONS` | `app/routes/api/v1/communities/$slug/modqueue.ts` |
| `/api/v1/communities/:slug/modqueue/:itemId` | `OPTIONS` `POST` | `app/routes/api/v1/communities/$slug/modqueue/$itemId.ts` |
| `/api/v1/communities/:slug/posts` | `GET` `OPTIONS` | `app/routes/api/v1/communities/$slug/posts.ts` |
| `/api/v1/communities/:slug/rules` | `GET` `OPTIONS` | `app/routes/api/v1/communities/$slug/rules.ts` |
| `/api/v1/communities/:slug/sanctions` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/communities/$slug/sanctions.ts` |
| `/api/v1/communities/:slug/sanctions/:id` | `DELETE` `OPTIONS` | `app/routes/api/v1/communities/$slug/sanctions/$id.ts` |
| `/api/v1/events` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/events.ts` |
| `/api/v1/events/:id` | `GET` `OPTIONS` `PATCH` | `app/routes/api/v1/events/$id.ts` |
| `/api/v1/events/:id/attendees` | `GET` `OPTIONS` | `app/routes/api/v1/events/$id/attendees.ts` |
| `/api/v1/events/:id/cancel` | `OPTIONS` `POST` | `app/routes/api/v1/events/$id/cancel.ts` |
| `/api/v1/events/:id/rsvp` | `DELETE` `OPTIONS` `PUT` | `app/routes/api/v1/events/$id/rsvp.ts` |
| `/api/v1/events/:id/updates` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/events/$id/updates.ts` |
| `/api/v1/feed` | `GET` `OPTIONS` | `app/routes/api/v1/feed.ts` |
| `/api/v1/feeds/:id/posts` | `GET` `OPTIONS` | `app/routes/api/v1/feeds/$id/posts.ts` |
| `/api/v1/games` | `GET` `OPTIONS` | `app/routes/api/v1/games.ts` |
| `/api/v1/images` | `OPTIONS` `POST` | `app/routes/api/v1/images.ts` |
| `/api/v1/leaderboards/:game` | `GET` `OPTIONS` | `app/routes/api/v1/leaderboards/$game.ts` |
| `/api/v1/me` | `GET` `OPTIONS` | `app/routes/api/v1/me.ts` |
| `/api/v1/me/achievements` | `GET` `OPTIONS` | `app/routes/api/v1/me/achievements.ts` |
| `/api/v1/me/bookmarks` | `GET` `OPTIONS` | `app/routes/api/v1/me/bookmarks.ts` |
| `/api/v1/me/communities` | `GET` `OPTIONS` | `app/routes/api/v1/me/communities.ts` |
| `/api/v1/me/decks` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/me/decks.ts` |
| `/api/v1/me/decks/:id` | `DELETE` `GET` `OPTIONS` `PATCH` | `app/routes/api/v1/me/decks/$id.ts` |
| `/api/v1/me/decks/:id/cards` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/me/decks/$id/cards.ts` |
| `/api/v1/me/decks/:id/cards/:cardId` | `DELETE` `OPTIONS` `PATCH` | `app/routes/api/v1/me/decks/$id/cards/$cardId.ts` |
| `/api/v1/me/decks/:id/cards/by-external-id/:externalId` | `OPTIONS` `PUT` | `app/routes/api/v1/me/decks/$id/cards/by-external-id/$externalId.ts` |
| `/api/v1/me/decks/:id/due` | `GET` `OPTIONS` | `app/routes/api/v1/me/decks/$id/due.ts` |
| `/api/v1/me/deleted` | `GET` `OPTIONS` | `app/routes/api/v1/me/deleted.ts` |
| `/api/v1/me/events` | `GET` `OPTIONS` | `app/routes/api/v1/me/events.ts` |
| `/api/v1/me/feeds` | `GET` `OPTIONS` | `app/routes/api/v1/me/feeds.ts` |
| `/api/v1/me/feeds/:id` | `GET` `OPTIONS` | `app/routes/api/v1/me/feeds/$id.ts` |
| `/api/v1/me/feeds/:id/members` | `OPTIONS` `PUT` | `app/routes/api/v1/me/feeds/$id/members.ts` |
| `/api/v1/me/focus-sessions` | `GET` `OPTIONS` | `app/routes/api/v1/me/focus-sessions.ts` |
| `/api/v1/me/followers` | `GET` `OPTIONS` | `app/routes/api/v1/me/followers.ts` |
| `/api/v1/me/following` | `GET` `OPTIONS` | `app/routes/api/v1/me/following.ts` |
| `/api/v1/me/games` | `GET` `OPTIONS` | `app/routes/api/v1/me/games.ts` |
| `/api/v1/me/games/:gameId/days` | `GET` `OPTIONS` | `app/routes/api/v1/me/games/$gameId/days.ts` |
| `/api/v1/me/highlights` | `GET` `OPTIONS` | `app/routes/api/v1/me/highlights.ts` |
| `/api/v1/me/highlights/:id` | `DELETE` `OPTIONS` `PATCH` | `app/routes/api/v1/me/highlights/$id.ts` |
| `/api/v1/me/music/practice` | `GET` `OPTIONS` | `app/routes/api/v1/me/music/practice.ts` |
| `/api/v1/me/notifications` | `GET` `OPTIONS` | `app/routes/api/v1/me/notifications.ts` |
| `/api/v1/me/personal-bests` | `GET` `OPTIONS` | `app/routes/api/v1/me/personal-bests.ts` |
| `/api/v1/me/reading-goal` | `GET` `OPTIONS` | `app/routes/api/v1/me/reading-goal.ts` |
| `/api/v1/me/rmhtube/stats` | `GET` `OPTIONS` | `app/routes/api/v1/me/rmhtube/stats.ts` |
| `/api/v1/me/rmhtube/watch-later` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/me/rmhtube/watch-later.ts` |
| `/api/v1/me/rmhtube/watch-later/:id` | `DELETE` `OPTIONS` | `app/routes/api/v1/me/rmhtube/watch-later/$id.ts` |
| `/api/v1/me/scheduled` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/me/scheduled.ts` |
| `/api/v1/me/scheduled/:id` | `DELETE` `GET` `OPTIONS` `PATCH` | `app/routes/api/v1/me/scheduled/$id.ts` |
| `/api/v1/me/scheduled/:id/publish` | `OPTIONS` `POST` | `app/routes/api/v1/me/scheduled/$id/publish.ts` |
| `/api/v1/me/shelves` | `GET` `OPTIONS` | `app/routes/api/v1/me/shelves.ts` |
| `/api/v1/me/shelves/:slug` | `DELETE` `OPTIONS` `PUT` | `app/routes/api/v1/me/shelves/$slug.ts` |
| `/api/v1/me/tournaments` | `GET` `OPTIONS` | `app/routes/api/v1/me/tournaments.ts` |
| `/api/v1/me/typing` | `GET` `OPTIONS` | `app/routes/api/v1/me/typing.ts` |
| `/api/v1/me/typing/daily` | `GET` `OPTIONS` | `app/routes/api/v1/me/typing/daily.ts` |
| `/api/v1/me/typing/keys` | `GET` `OPTIONS` | `app/routes/api/v1/me/typing/keys.ts` |
| `/api/v1/news` | `GET` `OPTIONS` | `app/routes/api/v1/news.ts` |
| `/api/v1/news/:slug` | `GET` `OPTIONS` | `app/routes/api/v1/news/$slug.ts` |
| `/api/v1/openapi.json` | `GET` `OPTIONS` | `app/routes/api/v1/openapi[.]json.ts` |
| `/api/v1/posts` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/posts.ts` |
| `/api/v1/posts/:id` | `DELETE` `GET` `OPTIONS` | `app/routes/api/v1/posts/$id.ts` |
| `/api/v1/posts/:id/bookmark` | `DELETE` `OPTIONS` `POST` | `app/routes/api/v1/posts/$id/bookmark.ts` |
| `/api/v1/posts/:id/comments` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/posts/$id/comments.ts` |
| `/api/v1/posts/:id/like` | `DELETE` `OPTIONS` `POST` | `app/routes/api/v1/posts/$id/like.ts` |
| `/api/v1/rmhtube/parties` | `GET` `OPTIONS` | `app/routes/api/v1/rmhtube/parties.ts` |
| `/api/v1/rmhtube/parties/:id` | `GET` `OPTIONS` | `app/routes/api/v1/rmhtube/parties/$id.ts` |
| `/api/v1/rmhtube/parties/:id/going` | `OPTIONS` `PUT` | `app/routes/api/v1/rmhtube/parties/$id/going.ts` |
| `/api/v1/search/people` | `GET` `OPTIONS` | `app/routes/api/v1/search/people.ts` |
| `/api/v1/search/posts` | `GET` `OPTIONS` | `app/routes/api/v1/search/posts.ts` |
| `/api/v1/slice-it/charts` | `GET` `OPTIONS` | `app/routes/api/v1/slice-it/charts.ts` |
| `/api/v1/slice-it/leaderboard` | `GET` `OPTIONS` | `app/routes/api/v1/slice-it/leaderboard.ts` |
| `/api/v1/tournaments` | `GET` `OPTIONS` | `app/routes/api/v1/tournaments.ts` |
| `/api/v1/tournaments/:id` | `GET` `OPTIONS` | `app/routes/api/v1/tournaments/$id.ts` |
| `/api/v1/tournaments/:id/check-in` | `OPTIONS` `POST` | `app/routes/api/v1/tournaments/$id/check-in.ts` |
| `/api/v1/tournaments/:id/matches` | `GET` `OPTIONS` | `app/routes/api/v1/tournaments/$id/matches.ts` |
| `/api/v1/tournaments/:id/matches/:matchId/claim` | `OPTIONS` `POST` | `app/routes/api/v1/tournaments/$id/matches/$matchId/claim.ts` |
| `/api/v1/tournaments/:id/matches/:matchId/claim/confirm` | `OPTIONS` `POST` | `app/routes/api/v1/tournaments/$id/matches/$matchId/claim/confirm.ts` |
| `/api/v1/tournaments/:id/matches/:matchId/claim/withdraw` | `OPTIONS` `POST` | `app/routes/api/v1/tournaments/$id/matches/$matchId/claim/withdraw.ts` |
| `/api/v1/users/:handle` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle.ts` |
| `/api/v1/users/:handle/follow` | `DELETE` `OPTIONS` `POST` | `app/routes/api/v1/users/$handle/follow.ts` |
| `/api/v1/users/:handle/followers` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/followers.ts` |
| `/api/v1/users/:handle/following` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/following.ts` |
| `/api/v1/users/:handle/games` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/games.ts` |
| `/api/v1/users/:handle/posts` | `GET` `OPTIONS` | `app/routes/api/v1/users/$handle/posts.ts` |
| `/api/v1/webhooks` | `GET` `OPTIONS` `POST` | `app/routes/api/v1/webhooks.ts` |
| `/api/v1/webhooks/:id` | `DELETE` `GET` `OPTIONS` `PATCH` | `app/routes/api/v1/webhooks/$id.ts` |

## `/api/vega`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/vega/leaderboard` | `GET` | `lib/game/api/vega.leaderboard.server.ts` |
| `/api/vega/score` | `POST` | `features/vega/api/vega.score.server.ts` |

## `/api/velum2099`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/velum2099/contracts` | `GET` `POST` | `lib/velum2099/api/velum2099.contracts.server.ts` |

## `/api/versecraft`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/versecraft/chapter` | `POST` | `lib/versecraft/api/versecraft.chapter.server.ts` |
| `/api/versecraft/outline` | `POST` | `lib/versecraft/api/versecraft.outline.server.ts` |
| `/api/versecraft/progress` | `GET` | `lib/versecraft/api/versecraft.progress.server.ts` |
| `/api/versecraft/save` | `GET` `POST` | `lib/versecraft/api/versecraft.save.server.ts` |
| `/api/versecraft/seeds` | `GET` `POST` | `lib/versecraft/api/versecraft.seeds.server.ts` |
| `/api/versecraft/seeds/fork` | `POST` | `lib/versecraft/api/versecraft.seeds.fork.server.ts` |
| `/api/versecraft/seeds/rate` | `POST` | `lib/versecraft/api/versecraft.seeds.rate.server.ts` |
| `/api/versecraft/world` | `GET` `POST` | `app/routes/api/versecraft/world.ts` |

## `/api/vibe`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/vibe/ai` | `OPTIONS` `POST` | `app/routes/api/vibe/ai.ts` |
| `/api/vibe/gallery` | `GET` | `lib/rmhvibe/api/vibe.gallery.server.ts` |
| `/api/vibe/kv/:slug` | `GET` `POST` | `lib/rmhvibe/api/vibe.kv.$slug.server.ts` |
| `/api/vibe/page/:slug` | `GET` | `lib/rmhvibe/api/vibe.page.$slug.server.ts` |
| `/api/vibe/page/:slug/tweaks` | `POST` | `lib/rmhvibe/api/vibe.page.$slug.tweaks.server.ts` |
| `/api/vibe/pkg/:file` | `GET` | `app/routes/api/vibe/pkg/$file.ts` |
| `/api/vibe/stream` | `POST` | `app/routes/api/vibe/stream.ts` |
| `/api/vibe/thumb/:slug` | `GET` | `app/routes/api/vibe/thumb/$slug.ts` |

## `/api/void-breaker`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/void-breaker/leaderboard` | `GET` | `lib/game/api/void-breaker.leaderboard.server.ts` |
| `/api/void-breaker/score` | `POST` | `lib/game/api/void-breaker.score.server.ts` |

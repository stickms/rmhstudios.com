<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: L

See the [API inventory](../api.md) for how to read the tables.

## `/api/laundry-sort`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/laundry-sort/leaderboard` | `GET` | `features/laundry-sort/api/laundry-sort.leaderboard.server.ts` |
| `/api/laundry-sort/score` | `POST` | `features/laundry-sort/api/laundry-sort.score.server.ts` |

## `/api/leaderboards`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/leaderboards/:gameId` | `GET` | `lib/game/api/leaderboards.$gameId.server.ts` |
| `/api/leaderboards/players` | `GET` | `lib/api/routes/leaderboards.players.server.ts` |

## `/api/library`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/library/:slug` | `DELETE` `POST` | `lib/library/api/library.$slug.server.ts` |
| `/api/library/:slug/marks` | `DELETE` `GET` `PUT` | `lib/library/api/library.$slug.marks.server.ts` |
| `/api/library/collection/:id` | `DELETE` `PATCH` | `lib/library/api/library.collection.$id.server.ts` |
| `/api/library/collection/:id/cover` | `POST` | `lib/library/api/library.collection.$id.cover.server.ts` |
| `/api/library/collection/:id/items` | `DELETE` `PATCH` `POST` | `lib/library/api/library.collection.$id.items.server.ts` |
| `/api/library/collections` | `GET` `POST` | `lib/library/api/library.collections.server.ts` |
| `/api/library/continue` | `GET` | `lib/library/api/library.continue.server.ts` |
| `/api/library/cover/:id` | `GET` | `lib/library/api/library.cover.$id.server.ts` |
| `/api/library/draft` | `POST` | `lib/library/api/library.draft.server.ts` |
| `/api/library/file/:id` | `GET` | `app/routes/api/library/file/$id.ts` |
| `/api/library/quota` | `GET` `POST` | `lib/library/api/library.quota.server.ts` |
| `/api/library/upload` | `POST` | `lib/library/api/library.upload.server.ts` |

## `/api/lights-out`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/lights-out/b` | `GET` `POST` | `lib/lights-out/api/lights-out.b.server.ts` |
| `/api/lights-out/b/:id` | `DELETE` `GET` | `lib/lights-out/api/lights-out.b.$id.server.ts` |
| `/api/lights-out/b/:id/play` | `POST` | `lib/lights-out/api/lights-out.b.$id.play.server.ts` |
| `/api/lights-out/b/:id/solve` | `POST` | `lib/lights-out/api/lights-out.b.$id.solve.server.ts` |

## `/api/links`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/links/check` | `POST` | `lib/api/routes/links.check.server.ts` |

## `/api/lists`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/lists` | `GET` `POST` | `lib/lists/api/lists.server.ts` |
| `/api/lists/:id` | `DELETE` `GET` `PATCH` | `lib/lists/api/lists.$id.server.ts` |
| `/api/lists/:id/feed` | `GET` | `lib/lists/api/lists.$id.feed.server.ts` |
| `/api/lists/:id/members` | `DELETE` `PUT` | `lib/lists/api/lists.$id.members.server.ts` |

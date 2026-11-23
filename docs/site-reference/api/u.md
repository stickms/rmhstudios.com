<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: U

See the [API inventory](../api.md) for how to read the tables.

## `/api/unfurl`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/unfurl` | `GET` | `lib/unfurl/api/unfurl.server.ts` |

## `/api/user-builds`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/user-builds` | `GET` `POST` | `lib/api/routes/user-builds.server.ts` |
| `/api/user-builds/:id` | `DELETE` `GET` `PATCH` | `lib/api/routes/user-builds.$id.server.ts` |
| `/api/user-builds/:id/comments` | `GET` `POST` | `lib/api/routes/user-builds.$id.comments.server.ts` |
| `/api/user-builds/:id/comments-lock` | `PUT` | `lib/builds/api/user-builds.$id.comments-lock.server.ts` |
| `/api/user-builds/:id/comments/:commentId` | `DELETE` `PATCH` | `lib/builds/api/user-builds.$id.comments.$commentId.server.ts` |
| `/api/user-builds/:id/comments/:commentId/hide` | `POST` | `lib/builds/api/user-builds.$id.comments.$commentId.hide.server.ts` |
| `/api/user-builds/:id/images` | `POST` | `lib/builds/api/user-builds.$id.images.server.ts` |
| `/api/user-builds/:id/insights` | `GET` | `lib/builds/api/user-builds.$id.insights.server.ts` |
| `/api/user-builds/:id/like` | `POST` | `lib/api/routes/user-builds.$id.like.server.ts` |
| `/api/user-builds/:id/releases` | `GET` `POST` | `lib/builds/api/user-builds.$id.releases.server.ts` |
| `/api/user-builds/:id/releases/:releaseId` | `DELETE` | `lib/builds/api/user-builds.$id.releases.$releaseId.server.ts` |
| `/api/user-builds/:id/screenshots` | `GET` `PUT` | `lib/builds/api/user-builds.$id.screenshots.server.ts` |
| `/api/user-builds/:id/unlock` | `POST` | `app/routes/api/user-builds/$id/unlock.ts` |
| `/api/user-builds/:id/view` | `POST` | `app/routes/api/user-builds/$id/view.ts` |
| `/api/user-builds/categories` | `GET` | `lib/api/routes/user-builds.categories.server.ts` |
| `/api/user-builds/featured` | `GET` | `lib/api/routes/user-builds.featured.server.ts` |

## `/api/users`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/users/:id/wishlist` | `GET` | `lib/wishlist/api/users.$id.wishlist.server.ts` |
| `/api/users/search` | `GET` | `lib/discovery/api/users.search.server.ts` |

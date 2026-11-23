<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: B

See the [API inventory](../api.md) for how to read the tables.

## `/api/badge`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/badge/:userId/:gameId` | `GET` | `lib/api/routes/badge.$userId.$gameId.server.ts` |

## `/api/battlepass`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/battlepass` | `GET` | `lib/battlepass/api/battlepass.server.ts` |
| `/api/battlepass/claim` | `POST` | `lib/battlepass/api/battlepass.claim.server.ts` |
| `/api/battlepass/unlock` | `POST` | `lib/battlepass/api/battlepass.unlock.server.ts` |

## `/api/birthday`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/birthday` | `DELETE` `GET` `PUT` | `lib/gifting/api/birthday.server.ts` |
| `/api/birthday/next` | `GET` | `lib/gifting/api/birthday.next.server.ts` |

## `/api/blog`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/blog/:slug/comments` | `GET` `POST` | `lib/blog/api/blog.$slug.comments.server.ts` |
| `/api/blog/comments/:id` | `DELETE` | `lib/blog/api/blog.comments.$id.server.ts` |
| `/api/blog/media/:filename` | `GET` | `lib/media/api/blog.media.$filename.server.ts` |

## `/api/builds`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/builds/:id/issues` | `GET` `POST` | `lib/builds/api/builds.$id.issues.server.ts` |
| `/api/builds/:id/issues/:issueId` | `PATCH` | `lib/builds/api/builds.$id.issues.$issueId.server.ts` |
| `/api/builds/:id/issues/:issueId/close` | `POST` | `lib/builds/api/builds.$id.issues.$issueId.close.server.ts` |
| `/api/builds/:id/issues/:issueId/hide` | `POST` | `lib/builds/api/builds.$id.issues.$issueId.hide.server.ts` |
| `/api/builds/:id/issues/:issueId/status` | `POST` | `lib/builds/api/builds.$id.issues.$issueId.status.server.ts` |
| `/api/builds/:id/issues/:issueId/vote` | `PUT` | `lib/builds/api/builds.$id.issues.$issueId.vote.server.ts` |
| `/api/builds/consent` | `DELETE` `GET` `POST` | `lib/builds/api/builds.consent.server.ts` |
| `/api/builds/cover/:file` | `GET` | `app/routes/api/builds/cover/$file.ts` |
| `/api/builds/review` | `POST` | `lib/builds/api/builds.review.server.ts` |

## `/api/bulk`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/bulk` | `GET` `POST` | `lib/bulk/api/bulk.server.ts` |
| `/api/bulk/:id` | `DELETE` `GET` | `lib/bulk/api/bulk.$id.server.ts` |
| `/api/bulk/preview` | `POST` | `lib/bulk/api/bulk.preview.server.ts` |

<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: J

See the [API inventory](../api.md) for how to read the tables.

## `/api/jams`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/jams` | `GET` `POST` | `lib/competitive/api/jams.server.ts` |
| `/api/jams/:slug` | `GET` | `lib/competitive/api/jams.$slug.server.ts` |
| `/api/jams/:slug/entries/:entryId/feedback` | `GET` | `lib/competitive/api/jams.$slug.entries.$entryId.feedback.server.ts` |
| `/api/jams/:slug/entries/:entryId/team` | `DELETE` `GET` `POST` | `lib/competitive/api/jams.$slug.entries.$entryId.team.server.ts` |
| `/api/jams/:slug/entries/:entryId/team/respond` | `POST` | `lib/competitive/api/jams.$slug.entries.$entryId.team.respond.server.ts` |
| `/api/jams/:slug/entry` | `POST` | `lib/competitive/api/jams.$slug.entry.server.ts` |
| `/api/jams/:slug/feedback/:id/helpful` | `DELETE` `POST` | `lib/competitive/api/jams.$slug.feedback.$id.helpful.server.ts` |
| `/api/jams/:slug/rate` | `POST` | `lib/competitive/api/jams.$slug.rate.server.ts` |
| `/api/jams/:slug/theme-candidates` | `PUT` | `lib/competitive/api/jams.$slug.theme-candidates.server.ts` |
| `/api/jams/:slug/theme-vote` | `GET` `PUT` | `lib/competitive/api/jams.$slug.theme-vote.server.ts` |

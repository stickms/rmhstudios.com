<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: O

See the [API inventory](../api.md) for how to read the tables.

## `/api/oembed`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/oembed` | `GET` | `lib/api/routes/oembed.server.ts` |

## `/api/office-hours`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/office-hours` | `GET` `PUT` | `lib/calendar/api/office-hours.server.ts` |
| `/api/office-hours/bookings/:id` | `DELETE` | `lib/calendar/api/office-hours.bookings.$id.server.ts` |
| `/api/office-hours/bookings/:id/ics` | `GET` | `lib/calendar/api/office-hours.bookings.$id.ics.server.ts` |
| `/api/office-hours/host/:id` | `GET` `POST` | `lib/calendar/api/office-hours.host.$id.server.ts` |
| `/api/office-hours/host/:id/summary` | `GET` | `lib/calendar/api/office-hours.host.$id.summary.server.ts` |

## `/api/og`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/og/album/:albumId` | `GET` | `lib/og/api/og.album.$albumId.server.ts` |
| `/api/og/app/:appId` | `GET` | `lib/og/api/og.app.$appId.server.ts` |
| `/api/og/blog/:slug` | `GET` | `lib/og/api/og.blog.$slug.server.ts` |
| `/api/og/build/:slug` | `GET` | `lib/og/api/og.build.$slug.server.ts` |
| `/api/og/elections` | `GET` | `lib/og/api/og.elections.server.ts` |
| `/api/og/game/:gameId` | `GET` | `lib/og/api/og.game.$gameId.server.ts` |
| `/api/og/job/:jobId` | `GET` | `lib/og/api/og.job.$jobId.server.ts` |
| `/api/og/med-school/:slug` | `GET` | `lib/og/api/og.med-school.$slug.server.ts` |
| `/api/og/moment/:id` | `GET` | `lib/og/api/og.moment.$id.server.ts` |
| `/api/og/music/:token` | `GET` | `lib/og/api/og.music.$token.server.ts` |
| `/api/og/post/:id` | `GET` | `lib/og/api/og.post.$id.server.ts` |
| `/api/og/post/:id/story` | `GET` | `lib/og/api/og.post.$id.story.server.ts` |
| `/api/og/profile/:id` | `GET` | `lib/og/api/og.profile.$id.server.ts` |
| `/api/og/replay/:id` | `GET` | `lib/og/api/og.replay.$id.server.ts` |
| `/api/og/research/:kind/:id` | `GET` | `lib/rmh-research/api/og.research.$kind.$id.server.ts` |
| `/api/og/section/:file` | `GET` | `lib/og/api/og.section.$file.server.ts` |
| `/api/og/sohumtracker` | `GET` | `lib/og/api/og.sohumtracker.server.ts` |
| `/api/og/story/:slug` | `GET` | `lib/og/api/og.story.$slug.server.ts` |
| `/api/og/wiki` | `GET` | `lib/og/api/og.wiki.server.ts` |

## `/api/onboarding`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/onboarding` | `GET` `POST` | `lib/api/routes/onboarding.server.ts` |
| `/api/onboarding/first-week` | `GET` `POST` | `lib/api/routes/onboarding.first-week.server.ts` |

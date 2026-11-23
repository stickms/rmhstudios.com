<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: W

See the [API inventory](../api.md) for how to read the tables.

## `/api/wager`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wager` | `GET` `POST` | `lib/wager/api/wager.server.ts` |
| `/api/wager/:id` | `GET` | `lib/wager/api/wager.$id.server.ts` |
| `/api/wager/:id/accept` | `POST` | `app/routes/api/wager/$id/accept.ts` |
| `/api/wager/:id/cancel` | `POST` | `app/routes/api/wager/$id/cancel.ts` |
| `/api/wager/:id/report` | `POST` | `app/routes/api/wager/$id/report.ts` |

## `/api/webrings`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/webrings` | `GET` `POST` | `lib/profile/api/webrings.server.ts` |
| `/api/webrings/:slug` | `DELETE` `GET` | `lib/profile/api/webrings.$slug.server.ts` |
| `/api/webrings/:slug/hop` | `GET` | `lib/profile/api/webrings.$slug.hop.server.ts` |
| `/api/webrings/:slug/membership` | `DELETE` `POST` | `lib/profile/api/webrings.$slug.membership.server.ts` |

## `/api/wheel`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wheel` | `GET` | `lib/wheel/api/wheel.server.ts` |
| `/api/wheel/spin` | `POST` | `lib/wheel/api/wheel.spin.server.ts` |

## `/api/when`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/when` | `GET` `POST` | `lib/calendar/api/when.server.ts` |
| `/api/when/:id` | `DELETE` `GET` | `lib/calendar/api/when.$id.server.ts` |
| `/api/when/:id/ics` | `GET` | `lib/calendar/api/when.$id.ics.server.ts` |
| `/api/when/:id/lock` | `POST` | `lib/calendar/api/when.$id.lock.server.ts` |
| `/api/when/:id/respond` | `PUT` | `lib/calendar/api/when.$id.respond.server.ts` |

## `/api/wiki`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wiki/assist` | `OPTIONS` `POST` | `app/routes/api/wiki/assist.ts` |
| `/api/wiki/sso` | `GET` | `lib/wiki/api/wiki.sso.server.ts` |

## `/api/wishlist`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wishlist` | `DELETE` `GET` `POST` | `lib/wishlist/api/wishlist.server.ts` |

## `/api/wrapped`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/wrapped` | `GET` | `lib/wrapped/api/wrapped.server.ts` |

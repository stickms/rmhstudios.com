<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: H

See the [API inventory](../api.md) for how to read the tables.

## `/api/handle`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/handle/check` | `GET` | `lib/api/routes/handle.check.server.ts` |

## `/api/handles`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/handles/change` | `GET` `POST` | `lib/api/routes/handles.change.server.ts` |
| `/api/handles/history` | `GET` | `lib/api/routes/handles.history.server.ts` |
| `/api/handles/impersonation` | `GET` `POST` | `lib/api/routes/handles.impersonation.server.ts` |

## `/api/health`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/health` | `GET` | `app/routes/api/health.ts` |

## `/api/history`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/history` | `DELETE` `GET` `PUT` | `lib/shop/api/history.server.ts` |
| `/api/history/:id` | `DELETE` | `lib/shop/api/history.$id.server.ts` |
| `/api/history/beat` | `POST` | `lib/history/api/history.beat.server.ts` |
| `/api/history/resume` | `GET` | `lib/history/api/history.resume.server.ts` |

## `/api/hl2-game`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/hl2-game/assets/*` | `GET` | `app/routes/api/hl2-game/assets/$.ts` |

## `/api/homes`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/homes/ai-image` | `GET` `POST` | `lib/homes/api/homes.ai-image.server.ts` |
| `/api/homes/compare` | `GET` | `lib/homes/api/homes.compare.server.ts` |
| `/api/homes/geocode` | `GET` | `lib/homes/api/homes.geocode.server.ts` |
| `/api/homes/listings` | `GET` `POST` | `app/routes/api/homes/listings.ts` |
| `/api/homes/listings/:id` | `DELETE` `GET` `PATCH` | `lib/homes/api/homes.listings.$id.server.ts` |
| `/api/homes/listings/:id/favorite` | `DELETE` `POST` | `lib/homes/api/homes.listings.$id.favorite.server.ts` |
| `/api/homes/listings/:id/favorite/alerts` | `PUT` | `lib/homes/api/homes.listings.$id.favorite.alerts.server.ts` |
| `/api/homes/listings/:id/favorite/note` | `PUT` | `lib/homes/api/homes.listings.$id.favorite.note.server.ts` |
| `/api/homes/listings/:id/prices` | `GET` | `lib/homes/api/homes.listings.$id.prices.server.ts` |
| `/api/homes/listings/:id/roommate` | `GET` | `lib/homes/api/homes.listings.$id.roommate.server.ts` |
| `/api/homes/roommate` | `GET` `PUT` | `lib/homes/api/homes.roommate.server.ts` |
| `/api/homes/watches` | `DELETE` `GET` `PATCH` `POST` | `lib/homes/api/homes.watches.server.ts` |

## `/api/hunt`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/hunt` | `GET` | `lib/delight/api/hunt.server.ts` |
| `/api/hunt/answer` | `POST` | `lib/delight/api/hunt.answer.server.ts` |
| `/api/hunt/marker` | `GET` | `lib/delight/api/hunt.marker.server.ts` |

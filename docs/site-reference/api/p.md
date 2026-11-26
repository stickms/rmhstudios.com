<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# API routes: P

See the [API inventory](../api.md) for how to read the tables.

## `/api/personas`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/personas` | `GET` `POST` | `lib/personas/api/personas.server.ts` |
| `/api/personas/:id` | `DELETE` `GET` | `lib/personas/api/personas.$id.server.ts` |
| `/api/personas/:id/chat` | `POST` | `lib/personas/api/personas.$id.chat.server.ts` |
| `/api/personas/avatar/:filename` | `GET` | `app/routes/api/personas/avatar/$filename.ts` |

## `/api/photo-of-the-day`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/photo-of-the-day` | `GET` `POST` | `lib/api/routes/photo-of-the-day.server.ts` |
| `/api/photo-of-the-day/:id` | `DELETE` | `lib/delight/api/photo-of-the-day.$id.server.ts` |
| `/api/photo-of-the-day/vote` | `POST` | `lib/delight/api/photo-of-the-day.vote.server.ts` |

## `/api/playlists`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/playlists` | `GET` `POST` | `lib/playlists/api/playlists.server.ts` |
| `/api/playlists/:id` | `DELETE` `GET` `PATCH` | `lib/playlists/api/playlists.$id.server.ts` |
| `/api/playlists/:id/collaborators` | `GET` `POST` | `lib/playlists/api/playlists.$id.collaborators.server.ts` |
| `/api/playlists/:id/collaborators/:userId` | `DELETE` | `lib/playlists/api/playlists.$id.collaborators.$userId.server.ts` |
| `/api/playlists/:id/items` | `POST` | `lib/playlists/api/playlists.$id.items.server.ts` |
| `/api/playlists/:id/items/:itemId` | `DELETE` | `lib/playlists/api/playlists.$id.items.$itemId.server.ts` |
| `/api/playlists/:id/items/bulk` | `POST` | `lib/playlists/api/playlists.$id.items.bulk.server.ts` |

## `/api/portal-game`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/portal-game/assets/*` | `GET` | `app/routes/api/portal-game/assets/$.ts` |

## `/api/predictions`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/predictions` | `GET` `POST` | `lib/predictions/api/predictions.server.ts` |
| `/api/predictions/:id` | `GET` | `lib/predictions/api/predictions.$id.server.ts` |
| `/api/predictions/:id/comments` | `GET` `POST` | `lib/predictions/api/predictions.$id.comments.server.ts` |
| `/api/predictions/:id/devils-advocate` | `POST` | `lib/predictions/api/predictions.$id.devils-advocate.server.ts` |
| `/api/predictions/:id/sell` | `POST` | `lib/predictions/api/predictions.$id.sell.server.ts` |
| `/api/predictions/:id/trade` | `POST` | `lib/predictions/api/predictions.$id.trade.server.ts` |
| `/api/predictions/comments/:id` | `DELETE` | `lib/predictions/api/predictions.comments.$id.server.ts` |

## `/api/preferences`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/preferences/appearance` | `GET` `PUT` | `lib/preferences/api/preferences.appearance.server.ts` |
| `/api/preferences/conversation` | `GET` `PUT` | `lib/preferences/api/preferences.conversation.server.ts` |
| `/api/preferences/email` | `GET` `PUT` | `lib/preferences/api/preferences.email.server.ts` |
| `/api/preferences/keyboard` | `GET` `PUT` | `lib/preferences/api/preferences.keyboard.server.ts` |
| `/api/preferences/layout` | `GET` `PUT` | `lib/preferences/api/preferences.layout.server.ts` |
| `/api/preferences/muted-words` | `GET` `PUT` | `lib/preferences/api/preferences.muted-words.server.ts` |
| `/api/preferences/notifications` | `GET` `PUT` | `lib/preferences/api/preferences.notifications.server.ts` |
| `/api/preferences/presence` | `GET` `PUT` | `lib/preferences/api/preferences.presence.server.ts` |

## `/api/presence`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/presence/online-count` | `GET` | `lib/presence/api/presence.online-count.server.ts` |

## `/api/profile`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/profile` | `PATCH` | `lib/api/routes/profile.server.ts` |
| `/api/profile/:id` | `GET` | `lib/profile/api/profile.$id.server.ts` |
| `/api/profile/:id/activity` | `GET` | `lib/profile/api/profile.$id.activity.server.ts` |
| `/api/profile/:id/card` | `GET` | `lib/profile/api/profile.$id.card.server.ts` |
| `/api/profile/:id/endorsements` | `GET` `PUT` | `lib/profile/api/profile.$id.endorsements.server.ts` |
| `/api/profile/:id/follow` | `POST` | `lib/profile/api/profile.$id.follow.server.ts` |
| `/api/profile/:id/followers` | `GET` | `lib/profile/api/profile.$id.followers.server.ts` |
| `/api/profile/:id/following` | `GET` | `lib/profile/api/profile.$id.following.server.ts` |
| `/api/profile/:id/guestbook` | `GET` `PATCH` `POST` | `lib/guestbook/api/profile.$id.guestbook.server.ts` |
| `/api/profile/:id/guestbook/:entryId` | `DELETE` `PATCH` | `lib/guestbook/api/profile.$id.guestbook.$entryId.server.ts` |
| `/api/profile/:id/kudos` | `GET` `POST` | `lib/profile/api/profile.$id.kudos.server.ts` |
| `/api/profile/:id/likes` | `GET` | `lib/profile/api/profile.$id.likes.server.ts` |
| `/api/profile/:id/made` | `GET` | `lib/profile/api/profile.$id.made.server.ts` |
| `/api/profile/:id/membership` | `DELETE` `POST` | `lib/profile/api/profile.$id.membership.server.ts` |
| `/api/profile/:id/plus` | `GET` | `lib/profile/api/profile.$id.plus.server.ts` |
| `/api/profile/:id/pronunciation` | `GET` | `lib/profile/api/profile.$id.pronunciation.server.ts` |
| `/api/profile/:id/rmharks` | `GET` | `lib/profile/api/profile.$id.rmharks.server.ts` |
| `/api/profile/:id/shelves` | `GET` | `lib/profile/api/profile.$id.shelves.server.ts` |
| `/api/profile/:id/stamps` | `GET` | `lib/profile/api/profile.$id.stamps.server.ts` |
| `/api/profile/:id/visit` | `POST` | `lib/profile/api/profile.$id.visit.server.ts` |
| `/api/profile/:id/webrings` | `GET` | `lib/profile/api/profile.$id.webrings.server.ts` |
| `/api/profile/analytics` | `GET` | `lib/profile/api/profile.analytics.server.ts` |
| `/api/profile/avatar` | `DELETE` `POST` | `lib/api/routes/profile.avatar.server.ts` |
| `/api/profile/avatar/:filename` | `GET` | `app/routes/api/profile/avatar/$filename.ts` |
| `/api/profile/banner` | `DELETE` `POST` | `lib/api/routes/profile.banner.server.ts` |
| `/api/profile/banner-source` | `GET` | `lib/api/routes/profile.banner-source.server.ts` |
| `/api/profile/banner/:filename` | `GET` | `app/routes/api/profile/banner/$filename.ts` |
| `/api/profile/layout` | `GET` `PUT` | `lib/profile/api/profile.layout.server.ts` |
| `/api/profile/me` | `GET` | `lib/profile/api/profile.me.server.ts` |
| `/api/profile/plus` | `GET` `PUT` | `lib/profile/api/profile.plus.server.ts` |
| `/api/profile/preview` | `GET` | `lib/profile/api/profile.preview.server.ts` |
| `/api/profile/pronunciation` | `DELETE` `POST` | `lib/profile/api/profile.pronunciation.server.ts` |
| `/api/profile/status` | `DELETE` `PUT` | `lib/profile/api/profile.status.server.ts` |
| `/api/profile/top-four` | `GET` `PUT` | `lib/profile/api/profile.top-four.server.ts` |

## `/api/profile-links`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/profile-links` | `GET` `POST` | `lib/profile-links/api/profile-links.server.ts` |
| `/api/profile-links/:id` | `DELETE` `PATCH` | `lib/profile-links/api/profile-links.$id.server.ts` |
| `/api/profile-links/:id/verify` | `POST` | `lib/profile-links/api/profile-links.$id.verify.server.ts` |

## `/api/progress`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/progress` | `GET` | `lib/api/routes/progress.server.ts` |

## `/api/promo`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/promo/free-month` | `GET` `POST` | `lib/api/routes/promo.free-month.server.ts` |

## `/api/pulse`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/pulse` | `POST` | `app/routes/api/pulse.ts` |

## `/api/push`

| Route | Methods | Source |
| ----- | ------- | ------ |
| `/api/push/action` | `POST` | `lib/push/api/push.action.server.ts` |
| `/api/push/public-key` | `GET` | `lib/push/api/push.public-key.server.ts` |
| `/api/push/subscribe` | `DELETE` `POST` | `lib/push/api/push.subscribe.server.ts` |

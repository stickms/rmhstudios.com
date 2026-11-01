# Steam-styled points shop and communities (design)

## Intent
Opening the points shop or the communities directory from the games/apps area
should not jump from the Steam frame to the main-UI look. Direct visits to the
existing main-UI pages stay as they are.

## Goals
- `/games/shop`: points shop (cosmetics catalog, daily tab, membership strip) in
  the Steam frame, reusing the `getShopData` loader.
- `/games/communities`: communities directory in the Steam frame.
- Links inside the Steam frame (top bar, `CommunityHome`, `CommunityNav`, games/apps
  entry points) point at the new routes.

## Non-goals / anti-goals
- No change to `/store`, `/communities`, `/c/$slug` main-UI pages or URLs.
- No origin tracking (query flags, session flags): the URL decides the look.
- Wallet, achievements, messages, etc. are out of scope for this pass.

## Approaches
1. Sub-routes under `/games` (chosen by owner): same URL always renders the same
   look; reuses the existing Steam shell.
2. Origin-aware theming of the main pages (query/session flag): rejected, since
   shared links and refreshes would show different looks.

## Decisions (my calls, flagged)
- Both routes are Steam-native (`steam.css`, `stm-*`, `t()` strings) and listed as
  native-material routes (already true for `/games/*`).
- `steamTabFor` maps `/games/shop` to Store and `/games/communities` to Community.
- Communities detail pages already exist at `/games/groups/$slug`; verify it shows
  the same data as `/c/$slug` before linking to it.

## Left to the builder
Component layout of the Steam shop/directory views, SEO meta (`buildMeta`), and
i18n keys (run `pnpm i18n:extract`).

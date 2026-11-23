<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# Page routes: G

Routes whose URL starts with `g`. See the [page inventory](../pages.md) for how to read the columns.

## Site shell

Standard pages, rendered inside the sidebar shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/groups` | Group Chats | public | `app/routes/_site/groups/index.tsx` |
| `/groups/:id` | Group Chat | public | `app/routes/_site/groups/$id.tsx` |
| `/groups/join/:code` | Group invite | public | `app/routes/_site/groups/join.$code.tsx` |

## Full-screen

Games, apps and standalone pages that intentionally render without the site shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/gabriels-horn` | Gabriel | public | `app/routes/gabriels-horn.tsx` |
| `/games` | redirects to `/compete?tab=leaderboard` | public | `app/routes/games/_library/index.tsx` |
| `/games/:gameId` | — | public | `app/routes/games/_library/$gameId.tsx` |
| `/games/:gameId/guides/:guideId` | — | public | `app/routes/games/_library/$gameId_.guides.$guideId.tsx` |
| `/games/:gameId/guides/:guideId/history` | Guide history | sign-in | `app/routes/games/_library/$gameId_.guides.$guideId_.history.tsx` |
| `/games/:gameId/updates` | — | public | `app/routes/games/_library/$gameId_.updates.tsx` |
| `/games/:gameId/updates/rss.xml` | — | public | `app/routes/games_.$gameId.updates.rss[.]xml.ts` |
| `/games/groups/:slug` | redirects to `/c/$slug` | public | `app/routes/games/groups.$slug.tsx` |
| `/games/hub/:gameId` | — | public | `app/routes/games/hub.$gameId.index.tsx` |
| `/games/hub/:gameId/t/:threadId` | — | public | `app/routes/games/hub.$gameId.t.$threadId.tsx` |
| `/games/inventory` | — | public | `app/routes/games/inventory.tsx` |
| `/games/market` | — | public | `app/routes/games/market.index.tsx` |
| `/games/market/:gameId/:cardIndex` | — | public | `app/routes/games/market.$gameId.$cardIndex.tsx` |
| `/games/marketplace` | — | public | `app/routes/games/marketplace.tsx` |
| `/games/membership` | — | public | `app/routes/games/membership.tsx` |
| `/games/profile/:id` | — | public | `app/routes/games/profile.$id.tsx` |
| `/games/shop` | — | public | `app/routes/games/shop.tsx` |
| `/games/slice-it` | Slice It! — charts, records and uploaders | public | `app/routes/games/_library/slice-it.tsx` |
| `/games/store` | Store — games and apps | public | `app/routes/games/store.tsx` |
| `/games/trades` | — | public | `app/routes/games/trades.index.tsx` |
| `/games/trades/new/:id` | — | public | `app/routes/games/trades.new.$id.tsx` |

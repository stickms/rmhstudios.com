<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# Page routes: L

Routes whose URL starts with `l`. See the [page inventory](../pages.md) for how to read the columns.

## Site shell

Standard pages, rendered inside the sidebar shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/library` | Library | public | `app/routes/_site/library/index.tsx` |
| `/lists/:id` | List | public | `app/routes/_site/lists/$id.tsx` |

## Full-screen

Games, apps and standalone pages that intentionally render without the site shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/laundry-sort` | Laundry Sort | public | `app/routes/laundry-sort.tsx` |
| `/library/:slug` | — | public | `app/routes/library.$slug.tsx` |
| `/library/albums/:albumId` | — | public | `app/routes/library.albums.$albumId.tsx` |
| `/login` | Login \| RMH | public | `app/routes/login.tsx` |

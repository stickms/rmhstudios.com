<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# Page routes: U

Routes whose URL starts with `u`. See the [page inventory](../pages.md) for how to read the columns.

## Site shell

Standard pages, rendered inside the sidebar shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/u/:userid` | User Not Found \| RMH | public | `app/routes/_site/u/$userid/index.tsx` |
| `/u/:userid/post/:postid` | Post Not Found \| RMH | public | `app/routes/_site/u/$userid/post/$postid.tsx` |
| `/user-builds/:slug` | redirects to `/builds/$slug` | public | `app/routes/_site/user-builds/$slug.tsx` |
| `/user-builds/submit` | redirects to `/create/builds/submit` | public | `app/routes/_site/user-builds/submit.tsx` |

## Full-screen

Games, apps and standalone pages that intentionally render without the site shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/u/:handle/rss.xml` | — | public | `app/routes/u.$handle.rss[.]xml.ts` |

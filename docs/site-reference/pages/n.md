<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# Page routes: N

Routes whose URL starts with `n`. See the [page inventory](../pages.md) for how to read the columns.

## Site shell

Standard pages, rendered inside the sidebar shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/news` | RMH News | public | `app/routes/_site/news/index.tsx` |
| `/news/:slug` | Article not found \| RMH News | public | `app/routes/_site/news/$slug.tsx` |
| `/news/stories` | Stories \| RMH News | public | `app/routes/_site/news/stories/index.tsx` |
| `/news/stories/:slug` | — | public | `app/routes/_site/news/stories/$slug.tsx` |

## Full-screen

Games, apps and standalone pages that intentionally render without the site shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/neon-driftway` | — | public | `app/routes/neon-driftway.tsx` |
| `/news/rss.xml` | RMH News | public | `app/routes/news.rss[.]xml.ts` |
| `/news/stories/:slug/rss.xml` | — | public | `app/routes/news.stories.$slug.rss[.]xml.ts` |
| `/nightrail` | — | public | `app/routes/nightrail.tsx` |

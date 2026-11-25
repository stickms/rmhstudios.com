<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# Page routes: C

Routes whose URL starts with `c`. See the [page inventory](../pages.md) for how to read the columns.

## Site shell

Standard pages, rendered inside the sidebar shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/c/:slug` | — | public | `app/routes/_site/c.$slug.tsx` |
| `/c/:slug/invite/:code` | Community invite | public | `app/routes/_site/c.$slug_.invite.$code.tsx` |
| `/c/:slug/read/:id` | Read-along | public | `app/routes/_site/c.$slug_.read.$id.tsx` |
| `/c/:slug/wiki` | — | public | `app/routes/_site/c.$slug_.wiki.index.tsx` |
| `/c/:slug/wiki/:page` | Wiki | public | `app/routes/_site/c.$slug_.wiki.$page.tsx` |
| `/calendar` | Calendar | public | `app/routes/_site/calendar.tsx` |
| `/canvas` | Community canvas | public | `app/routes/_site/canvas.tsx` |
| `/communities` | Communities | public | `app/routes/_site/communities.tsx` |
| `/compete` | Compete | public | `app/routes/_site/compete.tsx` |
| `/connections/mine` | Your Connections Grids | public | `app/routes/_site/connections.mine.tsx` |
| `/connections/new` | Make a Connections Grid | public | `app/routes/_site/connections.new.tsx` |
| `/connections/u/:id` | Connections Grid | public | `app/routes/_site/connections.u.$id.tsx` |
| `/cookies` | Cookie Policy | public | `app/routes/_site/cookies.tsx` |
| `/copyright` | Copyright | public | `app/routes/_site/copyright.tsx` |
| `/create` | Create | public | `app/routes/_site/create/index.tsx` |
| `/create/builds` | User Builds | public | `app/routes/_site/create/builds.tsx` |
| `/create/builds/:slug/insights` | Build insights | public | `app/routes/_site/create_.builds.$slug.insights.tsx` |
| `/create/builds/manage` | Manage builds | public | `app/routes/_site/create_.builds.manage.tsx` |
| `/create/builds/submit` | Submit a build | public | `app/routes/_site/create_.builds.submit.tsx` |
| `/create/earnings` | Earnings | public | `app/routes/_site/create/earnings.tsx` |
| `/create/personas` | AI Personas | public | `app/routes/_site/create/personas.tsx` |

## Full-screen

Games, apps and standalone pages that intentionally render without the site shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/c/:slug/rss.xml` | — | public | `app/routes/c.$slug.rss[.]xml.ts` |
| `/controller/:code` | Phone Controller | public | `app/routes/controller.$code.tsx` |
| `/csgo` | — | public | `app/routes/csgo.tsx` |
| `/cursed-logic` | — | public | `app/routes/cursed-logic.tsx` |

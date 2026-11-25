<!--
  GENERATED FILE — do not edit by hand.
  Source: app/routes/, lib/catalog.
  Regenerate with `pnpm docs:site`.
-->

# Page routes: M

Routes whose URL starts with `m`. See the [page inventory](../pages.md) for how to read the columns.

## Site shell

Standard pages, rendered inside the sidebar shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/marathon` | — | public | `app/routes/_site/marathon.index.tsx` |
| `/marathon/:shareId` | — | public | `app/routes/_site/marathon.$shareId.tsx` |
| `/messages` | Inbox | public | `app/routes/_site/messages/index.tsx` |
| `/messages/:conversationId` | Conversation | public | `app/routes/_site/messages/$conversationId.tsx` |
| `/messages/requests` | Message requests | public | `app/routes/_site/messages/requests.tsx` |
| `/moments/:id` | — | public | `app/routes/_site/moments.$id.tsx` |
| `/museum` | Site museum | public | `app/routes/_site/museum.tsx` |

## Full-screen

Games, apps and standalone pages that intentionally render without the site shell.

| URL | Title | Access | Source |
| --- | ----- | ------ | ------ |
| `/med` | Med school admissions by day \| RMH Med Schools | public | `app/routes/med/index.tsx` |
| `/med/:slug` | — | public | `app/routes/med/$slug.tsx` |
| `/med/ask` | Ask the data \| RMH Med Schools | public | `app/routes/med/ask.tsx` |
| `/med/lists` | My lists \| RMH Med Schools | public | `app/routes/med/lists.tsx` |
| `/med/live` | Live reported events \| RMH Med Schools | public | `app/routes/med/live.tsx` |
| `/med/practice` | Interview practice \| RMH Med Schools | public | `app/routes/med/practice.tsx` |
| `/med/tracker` | My tracker \| RMH Med Schools | public | `app/routes/med/tracker.tsx` |

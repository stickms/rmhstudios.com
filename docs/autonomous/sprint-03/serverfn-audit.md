# Server function audit (sprint 03)

A `createServerFn` is its own HTTP endpoint. A route `beforeLoad` (such as
`/_site/admin`'s `checkAdminAuth`) runs on navigation only, so it does not
protect a direct call. This audit read every handler for what it reads or
writes and whether the handler itself enforces the caller it needs.

Scope: 128 `createServerFn` handlers in `app/`, `components/`, `lib/` and
`features/` (tests excluded).

## Result

Real exposures found and fixed (beyond the two blog functions the reviewer
fixed first):

`fetchArticle` (`_site/news/$slug.tsx`)

- Exposed: any `STAGING` (unpublished) news article, body included, by
  slug, to anyone. `getNewsArticleBySlug` has no status filter; every
  list, feed and the sitemap filter to `PUBLISHED`, this loader did not.
- Fix: a non-`PUBLISHED` article returns `null` (the page's 404) unless
  `isAdminRequest()`; an admin preview is sent
  `Cache-Control: private, no-store`.

The reviewer's two functions (`fetchBlogData`, `fetchPostForEdit`) now use the
shared helper, and `fetchPostForEdit` validates its slug (by hand, not with zod:
the route module is in the shell's static closure, and zod would land on every
page's critical path).

## Shared guards

`lib/auth/server-fn-guards.server.ts`:

- `requireSessionServerFn()` returns the session or throws `notFound()`.
- `requireAdminServerFn()` returns the admin session or throws `notFound()`.
- `isAdminRequest()` is a boolean, for functions that are public but
  serve more to an admin.

The refusal is the router's 404, the shape the reviewer's fix and the admin
pages already use, so a probe cannot tell "hidden" from "absent".

## Audited and sound

- Admin-only, check in the handler: `_site/admin/route.tsx` (`checkAdminAuth`,
  redirect), `admin/blog/index.tsx`, `admin/blog/$slug/edit.tsx`,
  `lib/security-reports.ts` (list and update use `requireAdminSession`),
  `rmhladder/health.tsx`, `companies.tsx` (read and action) and `review.tsx`
  (read and resolve) each look up `isAdmin` for the session user.
- Per-user data (progress, drafts, saves, history, messages, groups, study
  decks, inventory, trades, ladder settings, pipeline, alerts, resume, jobs
  actions, events "mine", owned themes): the user id always comes from the
  session (`getRequestSession` / `auth.api.getSession`); no handler takes a
  user id from input for ownership. Anonymous callers get `null`, an empty
  result or a login redirect.
- Viewer-aware public reads (communities, lists, personas, profile, threads,
  store, game hub, guides, replays, vibes): the session is passed to the
  domain function, which applies the audience rule. `fetchOwnedDeck` returns
  404 unless the viewer owns the deck. `replays/$id` returns private replays
  only to their author.
- Login gates (`checkAuth` in `rmhtype`, `rmhbox`, `rmhstudy`, `rmhos`,
  `rmhtube`, `rmhmusic`, `balatro`, `calculator`, `altair/multiplayer`,
  `studio`; ladder `requireSignIn`): return only the caller's own session.
- Public by design: sohumtracker, elections, kaikai debt counter, research
  archive metadata, library books (hidden rows are filtered in
  `listAllBooks` and `getBook`), albums, news index and stories (published
  only), embeds (public free posts only), `fetchPostMeta` (the card gate hides
  restricted bodies), `getInitialI18n`, sign-in provider list.
- `security-reports.ts` submit is public on purpose (IP rate-limited,
  zod-validated).

## Noted, not changed

- `fetchTournamentMeta` returns name and player count for `unlisted`
  tournaments to anyone who has the id. Unlisted is link-shared by design and
  the page sets `noindex`; the API route behaves the same.
- `fetchListingMeta` (RMHHomes) reads a listing in any status, as the public
  `/api/homes/listings/$id` does. Low value, left for a product decision.

## Ratchet

`lib/__tests__/server-fn-guard-ratchet.test.ts` fails if any
`createServerFn` under `app/routes/_site/admin/**`, `app/routes/admin/**`, or
the listed admin-only files (`lib/security-reports.ts` and three ladder admin
routes) lacks a recognised admin guard in its own handler. The only allowlist
entry is the public vulnerability-report form; it may only shrink.

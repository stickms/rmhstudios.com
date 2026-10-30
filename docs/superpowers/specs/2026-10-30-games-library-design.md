# /games as a Steam-style Library — design

Status: draft for approval. Date: 2026-10-30.

## Intent

`/games` today is a card grid. The owner wants it to feel like the Steam
client's **Library**: a persistent list of everything you can play on the left,
and the selected title's page on the right, with the social layer Steam has
around a game — achievements, friends' playtime, community profiles, groups.
Steam hosts apps as well as games, so RMH apps move into the same list.

Why: one place to browse, launch and compare progress with people you follow,
instead of a grid plus separate achievements/leaderboard/groups surfaces.

## Reference

- Real Steam client (Library tab), captured in this session: sidebar with a
  view switcher (Home / Collections / Downloads), a "Games" section header,
  search + filter row, a scrolling list of titles; main pane shows shelves on
  Home and a game page (hero, primary Play button, activity strip, friends who
  play) when a title is selected. The test account owns no games, so the
  game-detail pane was taken from Steam's public Library screenshots instead.
- Public steamcommunity pages (profile, group, achievements) for the
  community-profile, group and achievement list anatomy.

## Goals

- `/games` is a two-pane library: left list (games and apps, search, filter,
  collections), right detail pane.
- Selecting a title navigates to `/games/$gameId` (list stays mounted). Deep
  links, canonical URLs and JSON-LD for every hub keep working.
- Detail pane: hero + Play, activity strip (your playtime, last played,
  achievements n/N), **Achievements**, **Friends who play** (followed users'
  playtime), **Community** (relevant Communities, i.e. Steam groups, and links
  to player profiles), and the existing hub content (reviews, guides,
  leaderboard) as sections/tabs.
- Apps appear in the same list; `/apps` redirects to `/games` (filter preset
  to apps).
- Real playtime: tracked per user per title, shown to the user and, subject to
  privacy, to followers.

## Non-goals / anti-goals

- Not a pixel clone. Steam's flat blue-grey palette and hardcoded sizes would
  fail the design gates and clash with the site. We copy **layout and
  information design**; the material is the site's (`--site-*` tokens, glass
  roles, jelly physics untouched).
- No paid store, wishlist, downloads or install manager.
- No new "friends" graph. Friends = people you follow (mutual follows are
  highlighted). No friend requests.
- No per-game achievements system rewrite. Use the existing 100-definition
  catalog (`lib/achievements/catalog.ts`), filtered by `group`/category for a
  title; titles with none show an empty state, not invented achievements.

## Constraints (from the repo)

- TanStack Start routes under `app/routes/_site/games/`; never edit
  `routeTree.gen.ts`. API routes use `defineHandler` with zod.
- Every colour/radius/shadow via site tokens; surfaces use glass role classes;
  tab strips use the shared tabs component; no `backdrop-filter`, no
  `transition-all`. Gate: `pnpm check:consistency` before each commit.
- All strings via `t()` + `pnpm i18n:extract`; `defaultValue` rules apply.
- Existing links to `/games`, `/apps`, `/arcade`, `/leaderboard`, `/builds`
  (about 40 files) must still resolve; the sitemap/SEO suites must stay green.
- Prisma migration for new tables; `pnpm db:push` locally.
- Layout never changes under jelly physics; keep 16px margins round bodies.

## Approaches considered

1. **Library shell at `/games` (chosen).** Layout route `games` (list +
   `<Outlet/>`), detail at `/games/$gameId`, Home at `/games` index. Keeps
   every URL and SEO surface; hub becomes the detail pane.
2. New `/library` route, leave `/games`. Rejected: second catalog page, not
   what was asked.
3. Single route with `?game=`. Rejected: loses per-game URLs for crawlers and
   breadcrumbs.

Playtime capture: **client heartbeat from one root-level hook** (chosen) vs
server-side from socket connections (only covers multiplayer) vs per-game
instrumentation (about 40 touchpoints).

## Design

### Routing and layout
- `app/routes/_site/games.tsx` becomes the layout: left rail + `<Outlet/>`.
  `games/index.tsx` = Home (Recent Games shelf, party bar, Ranked summary,
  Arcade Pass moved here). `games/$gameId.tsx` = detail.
- Mobile: list and detail are separate screens (list is the index, detail
  pushes), as Steam Mobile does.
- Apps are catalog entries with `kind: 'app'`; the rail filter has All / Games /
  Apps. `/apps` redirects to `/games?kind=app`.
- Unlisted/hidden catalog entries stay out of the rail, as today.
- Entries whose `href` is off-site (Discord invites) open externally and show
  no playtime.

### Left rail
View dropdown (Home / Collections), search, filter (kind, status), then the
list grouped like Steam: Recent, then alphabetical. Row = icon/art, title,
subtle "playing" state for the title you have open. Collections are
client-side groupings (Favorites, plus by tag) persisted per user.

### Detail pane
Hero art + title, primary `signal` Play button (links to catalog `href`),
activity strip, then sections: Achievements, Friends who play, Community,
Reviews and guides, Leaderboard. Reuse `GameHub` internals where they fit.

### Art: card image and banner
Steam uses two images per title: a portrait capsule for the list and shelves,
and a wide hero for the game page. The catalog has only the portrait one
today (`imagePath`, e.g. 800x1193; 29 of 40 entries have it, 11 have none).
- Add optional `bannerPath` to the shared catalog entry shape in
  `lib/catalog/types.ts` (the schemas are strict, so it must be declared
  there), carried through `listCuratedBuilds()` as `bannerUrl`. Wide hero,
  about 3:1; recommended source 1920x620 WebP.
- Detail hero fallback chain: `bannerPath`, then `imagePath` cropped
  (`object-cover`, centred) under a dark scrim, then the existing hue tile.
  So no title needs a banner to ship, and a title that looks poor cropped is
  fixed by adding one file and one line.
- The rail and shelves keep using `imagePath`, falling back to the hue tile.
- `lib/__tests__/catalog.test.ts` should check that a declared `bannerPath`
  exists under `public/` and is not larger than a set byte budget.
- Producing banner art for individual games is content work, not part of the
  build. Which titles get one first is the owner's call.

### Data
- New table `GamePlaytime`: `userId`, `gameId` (catalog id), `totalSeconds`,
  `lastPlayedAt`, unique `(userId, gameId)`.
- New table `GamePlaytimeDay`: `userId`, `gameId`, `day`, `seconds`, unique
  `(userId, gameId, day)`, for "last 2 weeks" and the Recent shelf.
- Privacy: `User.playtimePrivacy` String default `"following"` (values
  `public | following | private`), same shape as the existing `callPrivacy`.
- No new achievements table. Per-title list = catalog filtered by `group`.
- "Friends who play" = users the viewer follows who have playtime for the
  title and whose privacy allows the viewer. "Community" = Communities whose
  tags/name reference the title (matched by a tag convention; see Open items)
  plus top-playtime public profiles.

### Playtime tracking
One client hook mounted in the root layout. It matches the current pathname to
a catalog `href` (prefix match, longest wins). While the tab is visible and the
user is signed in, it posts a heartbeat roughly every 30 s to
`POST /api/games/playtime` (`defineHandler`, `rateLimit: 'write'`, zod body
`{ gameId }`). The server credits `min(elapsed since last credit, 60s)` and
ignores heartbeats faster than 20 s, so a script cannot inflate hours beyond
one real-time clock per user. Signed-out users record nothing. Tab hidden or
route left = no credit.

### Privacy and safety
Playtime is read through one server function that applies the owner's
`playtimePrivacy`. Setting lives in the existing privacy settings page.
Heartbeat endpoint is rate limited and authenticated.

## Decisions from the builder check

Builder's calls (marked so you can overrule them):

- **Apps in v1 (my call):** apps get a detail page at `/games/$gameId` and
  appear in the rail. Reviews, guides and leaderboard sections render only for
  games; apps show hero, Play, time used, community and friends. Apps get no
  new sitemap entries or OG cards in v1 (detail pages are `noindex`); `/apps`
  still redirects. A test asserts game and app ids are unique, since
  `/games/$gameId` is now one namespace. The merged list adds a `kind`
  discriminator in `listCuratedBuilds()`, not in the catalog schemas.
- **Apps measure "time used", games "playtime" (my call).** Same heartbeat.
- **What counts (my call):** tab visible AND input within the last 5 minutes.
  `/games` and `/games/*` never match a title. Off-site entries never track.
- **Empty data (my call):** Achievements section and the strip's n/N hide when
  a title has none. Friends and Community keep a one-line empty state.
- **Steam references (my call):** Valve's screenshots are kept out of the repo
  (copyright). The anatomy above is the written source of truth; screenshots
  are for side-by-side review in this session only.
- **Mobile (my call):** below `md` (768px) the rail is the page and detail
  pushes over it; Home is the first row in the rail.
- **Playtime privacy:** values `public | followers | private`. "Friends who
  play" lists people the viewer follows whose setting lets the viewer see them
  (`followers` = visible to people who follow that user). Default exposure is
  an owner decision, recorded below once answered.

## Verification
- Unit tests: heartbeat crediting/caps, privacy filter, catalog-to-route
  matcher, achievements-by-title filter.
- Route tests for redirects and for deep links still rendering hubs.
- `pnpm check:consistency`, `pnpm exec tsc --noEmit`, `pnpm test`.
- Real-browser screenshots at each stage (desktop and phone width, light and
  graphite themes), compared side by side with the Steam references.

## Open items left to the builder
- Exact group-to-game mapping for "Community" (tag convention vs a new
  `gameId` column on Community). Builder picks the smaller one and records it.
- Whether Collections persist server-side or in local storage first.
- Rail row art source when a title has no `imagePath` (hue fallback exists in
  `lib/builds/curated.ts`).

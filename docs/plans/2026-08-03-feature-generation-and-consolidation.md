# Feature Generation & Frontend Consolidation — 2026-08-03

**Document type:** Product/architecture idea list (no implementation)
**Branch audited:** `claude/website-feature-audit-36kvk6`, **revised against `0bd0236a`**
**Two questions asked:** (1) what is this site lacking relative to comparable
platforms, and (2) how do we consolidate what already exists, especially on the
frontend.

> **Revision note (same day).** The first pass of this document was written against
> `3047783`. Four commits landed on `main` immediately afterwards, one of them a
> large SEO sweep (`8cad6b95`, "SEO: make every public page discoverable, and keep
> it that way") touching ~35 of the routes audited here plus the whole sitemap
> layer, and one retiring the Alex Discord bot (`7cc2a801`, −3 Prisma models). Every
> finding those commits touched has been re-verified against the merged tree and is
> flagged **[resolved]**, **[escalated]** or **[unchanged]** below. The short
> version: **F1 shipped**, §0(a) is fixed, C3 got easier, C2 and C8 are now
> confirmed by the repo's own code comments, and **C1 got worse** — the SEO pass
> hardened two duplicate URLs with self-canonicals rather than removing them.

**Method.** Read the live tree — `app/routes/**` (734 route files, 127 under
`_site/`, 125 API namespaces), `lib/games.ts` + `lib/apps.ts`, `lib/sidebar-nav.ts`,
`prisma/schema.prisma` (249 models), `components/**` (927 `.tsx`, 41 `.css`) — then
subtracted everything already shipped **and** everything already specced in the four
prior idea docs so nothing here repeats them:

- `plans/2026-07-15-cross-system-feature-ideas.md` — 6 features
- `plans/2026-07-19-platform-expansion-design.md` — 12 features
- `plans/2026-07-20-parity-qol-customization-design.md` — 16 features
- `plans/2026-07-31-feature-gap-ideas.md` — 24 features

Every item states its **gap evidence** — the file, model or grep that proves it —
so none of it is speculative. Effort is XS/S/M/L on the same scale the other plan
docs use.

> **Framing, and it is different from the 07-31 doc's.** That document concluded
> the platform is past "build the basics" and that the remaining gaps are in
> safety, ops and connective tissue. Re-reading the tree with a consolidation lens,
> there is a fifth thing, and it now outranks most of the feature backlog:
>
> **This site has been consolidating for weeks and the consolidations are only
> half-landed.** `/playlists`, `/creator-studio`, `/arcade`, `/leaderboard`,
> `/builds` and `/market` were correctly folded into hub pages and reduced to
> redirect stubs. But `/shop` and `/pricing` were folded into `/store` and left
> live; `/explore` lost its nav entry and kept its page, reachable only from the 404;
> `/profile/$id` was superseded by `/u/$userid` and left live; the `PageLayout`
> migration stopped at 65 of 127 pages and left a dead import behind in 22 of them.
> The result is roughly a dozen URLs rendering content the reader can reach two ways
> at two levels of quality — and, since `8cad6b95`, the two ways now compete over
> which is canonical rather than merely leaving it unstated.
>
> **Finishing the consolidations already started is cheaper than any feature in
> this document and improves more of the site.** Part I is that work. Part II is
> the new-feature answer.

---

## §0 — Two live defects found while auditing

Not features. Reporting them here because they were found on the way and both are
small.

**(a) `/sitemap.xml` advertised two URLs that 404. — [resolved by `8cad6b95`]**
The old `app/routes/sitemap[.]xml.ts` emitted `/games` and `/apps` at priority 0.9,
hardcoded its own `SITE_URL`, and omitted profiles and tags. All three are fixed:
the route is now a 39-line sitemap **index** delegating to `/sitemaps/{section}[-{n}].xml`
(`app/routes/sitemaps.$name.ts` + `lib/sitemap.ts` + `lib/sitemap.server.ts`), it
imports `SITE_URL` from `@/lib/seo`, and users, posts, vibe pages and communities
are all sections now. Two new suites gate it —
`lib/__tests__/sitemap-coverage.test.ts` ("lists no path that has no route", "lists
no route that only redirects", "gives every sitemap-listed page a description and a
canonical") and `sitemap-sections.test.ts`. This is a better outcome than the
finding asked for; see F1, which is now delivered.

One artifact of the fix is worth carrying forward: `lib/seo-catalog.ts` now exports

```ts
/** Where the games/apps browser actually lives. There is no `/games` route. */
export const GAMES_INDEX_PATH = '/create?tab=games';
export const APPS_INDEX_PATH = '/create?tab=apps';
```

The SEO work hit C8's wall and worked around it by encoding the tab URL as a
constant. That is the right call for a sweep that wasn't allowed to add routes —
and it is independent confirmation that the catalogue has no index page.

**(b) 22 route files import `WIDE_NO_RIGHT_SIDEBAR_WIDTH` and never use it. — [unchanged]**
`c.$slug`, `progress`, `ranked`, `shop`, `drafts`, `moments.$id`, `thread/$rootId`,
`achievements`, `personas/$id`, `music-trivia`, `tag.$tag`, `store/$userid`,
`wrapped`, `bookmarks`, `recap`, `spaces.$id`, `roadmap`, `groups/index`,
`study/browse`, `study/$deckId`, `study/index`, `explore`. Residue of the layout
refactor described in C5. Harmless at runtime; useful as a map of exactly which
pages the migration didn't finish.

`8cad6b95` edited **13 of these 22 files** to add a `head()` and left the dead import
in every one of them — `shop.tsx` is the clearest case, where the commit reformatted
the `AnimatedMain` call two lines below the unused import. That is the finding's own
proof: this residue is invisible to a reviewer working route-by-route, which is why
C5 proposes a lint gate rather than a one-off cleanup.

---

# Part I — Consolidation

## The recipe is already in the repo

Four surfaces have been consolidated correctly, and they establish a pattern worth
naming, because every proposal in this part is an application of it:

1. Move the surface's content into a **tab of a hub page** — `PageTabs` +
   `components/ui/liquid-tabs` (the only sanctioned tab strip) + a `?tab=` search
   param validated in `validateSearch`.
2. Replace the old route file with a **`beforeLoad` redirect stub** that maps the
   old search params onto the new ones, so deep links and in-app back-links survive.
3. Remove the entry from `SIDEBAR_NAV` in `lib/sidebar-nav.ts` so the globe gets a
   pin back.

`app/routes/_site/arcade.tsx` is the reference implementation — 26 lines, and it
translates a legacy `?tab=leaderboard` into the new `?tab=games&sub=leaderboard`.
`_site/creator-studio.tsx`, `_site/leaderboard.tsx`, `_site/builds/index.tsx`,
`_site/market.tsx` and `_site/playlists.tsx` are the others. Each carries a
docstring explaining where the content went, which is why this audit could
reconstruct the history at all — keep doing that.

**Everything in C1–C4 below is a case where steps 1 and 3 happened and step 2 did
not.**

---

## C1. Finish `/store`: `/shop` and `/pricing` are still live duplicates — **XS** — [escalated]

> **What changed.** `8cad6b95` gave `/shop`, `/pricing` **and** `/store` each a
> `buildMeta({ path })` + `buildCanonical()` self-canonical, and listed `/shop`
> (0.5), `/store` (0.5) and `/pricing` (0.6) in the sitemap as three separate
> pages. Before the sweep, none of the three had a canonical, so a crawler had to
> guess which was authoritative. Now `/shop` and `/store?tab=shop` — the identical
> `ShopColumn`, the identical `getShopData()` loader — **each assert that they are
> the canonical version of the same content.** An ambiguous duplicate became a
> contradictory one.
>
> This was not an oversight. `sitemap-coverage.test.ts` line 266 requires that every
> sitemap-listed page have a description and a canonical, so the gate will keep
> re-asserting `/shop`'s self-canonical for exactly as long as `/shop` remains a
> listed route. **The gate cannot fix this and correctly does not try** — the
> decision "should this page exist" is upstream of it.
>
> The vocabulary to express the answer already exists in the same file:
> `EXCLUDED_ROUTES` in `lib/sitemap.ts` carries a `'duplicate'` reason, used for
> `/rmhtype/solo` (`'duplicate', // same content as /rmhtype`) and the six
> `/daily/*` puzzle routes. `/shop` and `/pricing` are that case and were listed
> instead. Redirecting them (the proposal below) is better still, because
> `sitemap-coverage.test.ts` line 174 — "lists no route that only redirects" —
> then removes them from the sitemap automatically.
>
> **Effort is unchanged at XS. Urgency is now the highest in Part I.**


**Evidence.** `_site/store/index.tsx` docstring: *"Merges what used to be three
separate destinations — Membership (`/pricing`), the cosmetics Shop (`/shop`), and
the player-to-player Marketplace (`/market`) — into a single tabbed page."* Of the
three, only `/market` became a redirect stub. `/shop` is a live 37-line page whose
body is `<ShopColumn initialData={shop} />` fed by `getShopData()` — byte-for-byte
the same component and the same loader as the `shop` tab of `/store` (`store/index.tsx`
line 134). `/pricing` is a live page whose body is `<MembershipPanel/>`, and its own
docstring admits the panel is *"also embedded at the top of the combined /store
page."*

**Consequence.** Two indexable URLs per surface with no `rel=canonical` between
them; two SSR loaders doing the same query; and `_site/settings/index.tsx` line 165
still links users to `/shop` rather than `/store?tab=shop`, so the settings page
actively routes people away from the consolidated surface.

**Proposal.** Turn `/shop` → `redirect('/store', { tab: 'shop' })` and `/pricing` →
`redirect('/store', { tab: 'membership' })`, following the `market.tsx` stub exactly.
Repoint the `/shop` link in `settings/index.tsx`. Grep for other `to="/shop"` /
`to="/pricing"` call sites first — pricing in particular is likely linked from
membership upsells and the Stripe return URL, and a redirect is fine for all of them
but the upsell copy may want the direct `?tab=` deep link.

**Watch for.** `/pricing` is the URL you'd hand to a payment processor, a partner or
an ad. Keeping it as a redirect (not deleting it) is the whole point.

---

## C2. Retire `/profile/$id` in favour of `/u/$userid` — **XS** — [escalated]

> **What changed.** The SEO sweep classified every route in the tree, and it
> recorded this exact finding in code. `lib/sitemap.ts` line 374:
>
> ```ts
> '/profile/$id': null, // legacy alias of `/u/$userid`
> '/store/$userid': null, // mirrors the profile; would duplicate it
> ```
>
> So the duplicate is now **documented and excluded from the sitemap** — and still
> live, still linked from wherever it was already linked, and still the only one of
> the pair without a `rel=canonical`. Sitemap exclusion is not deindexing: it stops
> the site *submitting* the URL, it does nothing about crawlers reaching it from
> links, history or the existing index. A page that a crawler can reach, that
> duplicates another page, and that carries no canonical, is the precise shape this
> finding describes — and the sweep that touched ~35 route heads did not give this
> one a head at all.
>
> The fix below is unchanged and now has the repo's own comment as its
> justification. Note the same line flags `/store/$userid` as a profile mirror,
> which is worth a look on the same pass.


**Evidence.** `diff` of the two files: they are the same route, and the older one is
strictly worse. `_site/u/$userid/index.tsx` (147 lines) has a `rel=canonical` link,
a `personSchema` JSON-LD block, RSS autodiscovery for the user's feed, and handle
resolution with the legacy `@` prefix stripped. `_site/profile/$id.tsx` (112 lines)
has **none of those four** — no canonical, no JSON-LD, no feed link, id-only lookup —
and its OG-card comment (*"`/u/$userid` already used it; this route — the same page
under a different URL — was still sharing a cropped 400px square"*) records that this
exact divergence has already bitten once and was patched on one side only.

**Consequence.** Every profile on the site is reachable at two URLs. The duplicate
carries no canonical, so search engines pick a winner themselves, and roughly half
the time that winner is the page with no structured data. This is the single
clearest SEO defect in the tree.

**Proposal.** `_site/profile/$id.tsx` → `beforeLoad: redirect({ to: '/u/$userid',
params: { userid: params.id } })`. Delete the duplicated `fetchProfileData` server
function with it.

---

## C3. `/explore` is orphaned, and SEO already picked the winner — **XS** — [half-resolved]

**Evidence.** `SIDEBAR_NAV` maps the label "Explore" to **`/search`** (line 65), and
`_site/search.tsx` titles itself `explore-title` → "Explore". Meanwhile
`_site/explore.tsx` is a separate live page rendering a different component
(`ExploreColumn`, fed by `listExplore()`). The only in-product link to it is
`components/errors/NotFound.tsx:46` — the 404 page (pre-existing, from `1cf59ccc`,
not the SEO sweep). It is not in the nav, not in the globe, not in the rail.

> **What changed, and it resolves the open question.** The first pass of this
> document offered two options — fold `/explore` into `/search`, or promote it. The
> SEO sweep answered, in `lib/sitemap.ts`:
>
> ```ts
> { loc: '/explore', changefreq: 'daily', priority: 0.8 },   // listed, high priority
> '/search': 'noindex', // a search results page is thin by construction
> ```
>
> `/explore` also got a full `buildMeta` description and a self-canonical. So the
> SEO layer has decided `/explore` is the public Explore surface and `/search` is a
> thin results page that should not be indexed at all — which is the correct call on
> both counts.
>
> **The nav was not told.** Today the site tells crawlers "Explore is `/explore`,
> priority 0.8, changes daily" and tells users "Explore is `/search`, which we have
> asked Google to ignore." The 404 page is the only thing in the product that agrees
> with the sitemap.

**Proposal — now one line, not a decision.** Point the `Explore` entry in
`SIDEBAR_NAV` at `/explore` instead of `/search`:

```ts
{ id: '/search', href: '/search', tKey: 'nav-explore', label: 'Explore', icon: Compass },
//   ^^^^^^^^          ^^^^^^^^  → '/explore'
```

Two cautions, both cheap:
- `id` is the **stable customization key** validated against `SIDEBAR_NAV_IDS` in
  `lib/home-widgets.ts` — the file's own header says renaming an id is a data
  migration. Change `href` and leave `id: '/search'` alone unless you ship the
  migration.
- `/search` must stay reachable: it is where the search field submits and where
  `SavedSearches` links. Keep it as a destination, just not as the nav's Explore
  pin.

Then `ExploreColumn` should gain a search entry point (or `/explore` should host the
field) so the two surfaces are one journey rather than two doors. `ExploreColumn`
already renders `MemoRMHarkCard` from `VirtualPostList`, so it is on the good card
path (C4) and inherits any fix made there.

---

## C4. Two post-card renderers — **S**

**Evidence.** `components/feed/RMHarkCard.tsx` (541 lines) is the real one, used by
`FeedItem`, `VirtualPostList`, `ExploreColumn`, `ExploreRecommendations`,
`RelatedPosts` and `ThreadView`. `components/radial/RmharkCard.tsx` (163 lines) is a
second, smaller renderer of the same `RMHark` object, used by exactly one caller:
`radial/RadialFeed.tsx`, the wheel on the home feed.

The names differ only in the case of three letters. On a case-insensitive
filesystem — macOS default, and a plausible contributor machine — `RmharkCard.tsx`
and `RMHarkCard.tsx` are a collision waiting for the day someone moves one of them
into the other's directory.

**Consequence.** The home feed — the site's most-viewed surface — renders posts
through a card that knows about a subset of what a post can be. Anything added to
the 541-line card (a new media type, a new badge, a content-warning state, an
audience marker) silently does not appear on the wheel. This is the classic
"two surfaces disagree about what this site is" defect that `design.md` §10.2 warns
about by name.

**Proposal.** Give `RMHarkCard` a `variant="wheel"` (or a `compact` prop) covering
what the radial card does differently — the wheel needs a fixed height and a reduced
element count for the 3D rake, which is a legitimate constraint, not a fork — and
delete `radial/RmharkCard.tsx`. If the wheel genuinely cannot afford the full card's
DOM (worth measuring: the rake is the antialiased-curve slow path from `design.md`
§4), then keep two renderers but **make the split explicit** — rename to
`RMHarkCard.full.tsx` / `RMHarkCard.wheel.tsx`, put them in the same directory, and
have the wheel one import its subcomponents from the full one rather than
reimplementing them.

**Watch for.** Do this one with a screenshot pass in three themes. It is the highest
visual-risk item in Part I.

---

## C5. Finish the `PageLayout` migration — **S** — [unchanged]

> **Re-verified after `8cad6b95`: still 65 of 127, still 29 hand-rolled, still 22
> dead imports.** The SEO sweep edited a dozen of the hand-rolled routes
> (`achievements`, `c.$slug`, `explore`, `groups/index`, `personas/$id`, `ranked`,
> `roadmap`, `shop`, `study/*`, `tag.$tag`, `thread/$rootId`,
> `u/$userid/post/$postid`) to add a `head()` and changed nothing about their
> layout. A sweep that opened two thirds of the offending files and moved the
> number by zero is the argument for the CI gate at the end of this section rather
> than for another cleanup pass.


**Evidence.** `components/CLAUDE.md` and `design.md` §5 both name
`feed/PageLayout.tsx` the canonical page wrapper, and
`lib/__tests__/design-consistency.test.ts` line 480 asserts it is in the audited set.
65 of 127 `_site` routes use it. **29 hand-roll the layout instead** — importing
`AnimatedMain` + `ContextRail` directly and composing the frame themselves:

```
c.$slug · share · progress · ranked · shop · drafts · profile/$id · moments.$id
thread/$rootId · help · achievements · personas/$id · music-trivia · tag.$tag
pricing · store/$userid · wrapped · bookmarks · messages/$conversationId
u/$userid/post/$postid · u/$userid/index · recap · spaces.$id · groups/$id
groups/index · study/browse · study/$deckId · study/index · explore
```

22 of them carry the dead `WIDE_NO_RIGHT_SIDEBAR_WIDTH` import from §0(b), which
dates them: they were written against an older `AnimatedMain` API that took an
explicit width, the API changed, and the call sites were updated without the imports
being cleaned up.

**Consequence.** Page-level chrome — the title treatment, the back link, breadcrumbs,
the sticky offset arithmetic, the `pb-dock` bottom inset, the right-rail portal — is
implemented 29 extra times. `docs/page-consistency.md` exists precisely because this
drifts, and the drift is not CI-detectable today.

**Proposal.** Migrate in three batches, cheapest first, and let each batch be its own
commit so a visual regression is bisectable:

| Batch | Routes | Why grouped |
|---|---|---|
| 1 — free wins | The 6 that C1–C3 turn into redirect stubs anyway (`shop`, `pricing`, `profile/$id`, `explore`) plus `roadmap`, `help` | The layout question disappears with the page |
| 2 — plain columns | `progress`, `achievements`, `wrapped`, `recap`, `music-trivia`, `drafts`, `bookmarks`, `tag.$tag`, `study/*`, `groups/*` | Single column, no rail, no bespoke chrome — a mechanical swap |
| 3 — the real ones | `thread/$rootId`, `u/$userid/*`, `moments.$id`, `spaces.$id`, `messages/$conversationId`, `c.$slug`, `personas/$id`, `store/$userid`, `ranked`, `share` | These have genuine layout needs; each may need a `PageLayout` prop rather than a swap |

Batch 3 is where the value is: whatever `PageLayout` is missing that made 10 authors
route around it, **that** is the thing to add to `PageLayout`. Extend the system —
`design.md` §2.

**Then gate it.** Add a case to `design-consistency.test.ts`: a file under
`app/routes/_site/**` that imports `AnimatedMain` without importing `PageLayout` must
be on an explicit allowlist. That is the same shape as the existing tab-strip gate
and it stops the count climbing back.

---

## C6. The token contract is enforced in `.tsx` and unenforced in 29,022 lines of `.css` — **M**

**Evidence.** `design-consistency.test.ts` collects sources via
`entry.name.endsWith('.tsx')` (line 98). It never opens a `.css` file. There are 41
of them under `components/`, totalling 29,022 lines, plus `app/globals.css` at 5,853.

Games are exempt from the palette rules by design (`design.md` §9), so
`temple-of-joy.css` (4,103), `synapse-storm.css` (2,107), `kowloon-knockout.css`
(1,266), `isleworks.css` (798) and friends are legitimately outside it. The
**site-tier** files are not:

| File | Lines | `var(--site-*)` | raw hex | hardcoded `border-radius` |
|---|--:|--:|--:|--:|
| `library/library.css` | 3,066 | 287 | **41** | **56** |
| `radial/radial.css` | 2,963 | — | — | — |
| `rmhladder/rmhladder.css` | 1,600 | 30 | 0 | 16 |
| `feed/feed.css` | 910 | 82 | 0 | 13 |
| `security/security.css` | 817 | 197 | 0 | 5 |
| `creator-studio/storefront.css` | 634 | — | — | — |
| `builds/builds.css` | 363 | 16 | 2 | 7 |
| `creator-studio/creator-studio.css` | 354 | 38 | **32** | 9 |

`library.css` alone carries 41 raw hex colours and 56 hardcoded radii. `design.md`
§2 law 1 is "nothing is hardcoded," §9 says the palette and radius rules are
CI-enforced — and for these files neither is true. A purchased user theme
(§6: *"must render every one of ~860 components correctly, because none of them knows
it exists"*) does not reach any of them.

**Note.** `rmhladder.css` is a deliberate exemption — the test file's comment at
line 60 names it as intentionally not liquid-glass. That exemption should be
*recorded in the CSS gate* rather than being an accident of the gate not existing.

**Proposal.** Two steps, and step 1 is worth doing even if step 2 never happens:

1. **Extend the gate to `.css`, allowlist the current state, and freeze it.** Same
   collector, `.css` extension, same site-tier/games-tier split the `.tsx` rules
   already use. Every existing violation goes on the allowlist with its count. New
   ones fail. This is XS and it stops the bleeding immediately.
2. **Burn the allowlist down**, `library.css` first — it is the worst offender and
   the Library is a flagship consumer surface. 41 colours and 56 radii is one focused
   session, and every one of them is a theme that renders wrong today.

---

## C7. The collection problem: one concept, twelve models, five destinations — **M**

**Evidence.** Grepping the schema for save-shaped models returns twelve:

| Model | Scope | Surface |
|---|---|---|
| `SavedItem` + `SaveFolder` | **generic** (`entityType` + `entityId`, foldered) | `/saves` |
| `RMHarkBookmark` | posts only, flat | `/bookmarks` |
| `WishlistEntry` | shop/market/creator intent, with `targetPrice` | `/wishlist` |
| `UserList` + `UserListMember` | lists of **accounts** (custom feeds) | `/lists` |
| `LibraryCollection` + `LibraryCollectionItem` | library documents | `/library` |
| `Playlist` + `PlaylistItem` | music tracks | `/library?view=music` |
| `RmhTubePlaylist` + `RmhTubePlaylistItem` | RMHTube videos | RMHTube |
| `HomeFavorite` | property listings | `/homes/saved` |
| `LadderWatchlistEntry` | jobs | `/rmhladder/alerts` |
| `RideSavedPlace` | addresses | `/rideshare` |
| `SavedSearch` | search queries | `/search` |
| `LadderSavedSearch` | job queries | `/rmhladder` |

`SavedItem` already **is** the general solution — polymorphic `entityType`/`entityId`
with an optional folder, uniqued on `(userId, entityType, entityId)`. It was clearly
built to be the one true saves table. `RMHarkBookmark` predates it and was never
folded in.

**Consequence.** The user-visible symptom: a post can be **bookmarked and saved
independently**, into two lists, on two pages, and neither knows the other exists.
Ask a user where the thing they saved went and there is no correct answer. Beyond
that: `SavedSearch` and `LadderSavedSearch` are the same model twice, and five
different "saved" pages each maintain their own empty state, sort, and pagination.

**Proposal.** Not one mega-refactor — a two-layer answer:

- **Data.** Migrate `RMHarkBookmark` into `SavedItem` with `entityType: 'rmhark'`
  and keep a DB view (or a thin server helper) under the old name so the post
  bookmark toggle and its `@@index([rmheetId])` count query don't have to change in
  the same commit. Merge `LadderSavedSearch` into `SavedSearch` with a scope column.
  Leave the domain collections alone — a `Playlist` with ordering and a
  `LadderWatchlistEntry` with alerting are genuinely not the same object as a
  bookmark, and forcing them into `SavedItem` would be consolidation for its own
  sake.
- **Frontend.** One `/saves` hub with a tab per source, built on the existing
  `PageTabs` contract — **Saved · Bookmarks · Lists · Wishlist · Collections** —
  where the domain collections appear as read-only cross-links into their own apps
  rather than being re-implemented. `/bookmarks`, `/lists`, `/wishlist` become
  redirect stubs with `?tab=`. That is the C1 recipe again, and it takes the
  "where did my thing go" answer from five places to one.

**Effort.** M — the frontend hub is S; the `RMHarkBookmark` migration and its
backfill are the M.

---

## C8. `/create` is a creator verb doing consumer work — **S (product), M (with an index page)** — [escalated]

> **What changed.** The SEO sweep independently hit this wall and had to encode the
> workaround as a constant — `lib/seo-catalog.ts`:
>
> ```ts
> /** Where the games/apps browser actually lives. There is no `/games` route. */
> export const GAMES_INDEX_PATH = '/create?tab=games';
> export const APPS_INDEX_PATH = '/create?tab=apps';
> ```
>
> Every game's `head()` now walks a JSON-LD breadcrumb back through that path. But
> `sitemap-coverage.test.ts` line 200 asserts **"keeps query strings out of the
> sitemap"** — correctly, since a `?tab=` URL is a page state, not a page. So the
> browse surface for 21 games and 12 apps is now, by rule, the one thing on this
> site that **cannot be submitted to a search engine**, and the breadcrumb for every
> game page terminates at a URL no crawler will index.
>
> The sweep did everything it could without adding routes: 18 game roots that had no
> `head()` at all now have titles, descriptions, canonicals and cards derived from
> `lib/games.ts`. That work is done and good. It has no index page to point at, and
> that is the remaining half.


**Evidence.** `SIDEBAR_NAV` line 75 gives `/create` the label "Create" and the `Wand2`
icon. `_site/create/index.tsx` has six tabs: `pages`, `games`, `apps`, `user-builds`,
`personas`, `earnings`. Four of those are creator surfaces. **Two of them —
`games` and `apps` — are the browse catalogue for 21 games and 12 apps**, and after
the `/arcade`, `/leaderboard` and `/builds` folds they are the *only* place to browse
them. `lib/games.ts` is imported by exactly nine files, and other than the sitemap,
the OG-card renderer and two detail routes, its consumers are `CommandPalette`,
`RecentsTracker` and `ArcadeHub`.

**Consequence.** A first-time visitor who wants to play a game has no destination
called anything like "Games." They must intuit that a wand icon labelled "Create"
contains the arcade. And the sitemap's response to this was to advertise `/games` and
`/apps` — which is §0(a): the crawler was pointed at the pages a human would expect,
and those pages do not exist.

This is the one place where consolidation went one step too far. Every comparable
catalogue platform — itch.io, Newgrounds, Poki, CrazyGames — treats its browse index
as the primary public landing page and its highest-value SEO surface. This site
consolidated its away.

**Proposal.** Split the consumer half back out, without giving up the tab count:

- Add `_site/games/index.tsx` and `_site/apps/index.tsx` — public, SSR'd, no auth
  gate, rendering the same catalogue components the Create tabs render today. They
  cost one route file each because the components already exist.
- Give them real `head()` blocks with `buildMeta` + `breadcrumbSchema`, and a
  `videoGameSchema` list. The per-game pages (`/games/$gameId`) already do this —
  they just have no index above them.
- Fix the sitemap so its two highest-priority URLs resolve.
- **Nav:** this does not need a new globe pin. Point the existing "Create" pin at
  `/create` for signed-in creators and let `/games` and `/apps` be reached from the
  homepage's projects section, the command palette and search — or, better, rename
  the pin **"Arcade"** and make `/games` its destination with Create as a tab, since
  playing is the higher-frequency intent by a wide margin.
- Keep `/create?tab=games` working as a deep link — it is where the Arcade Pass and
  Ranked summary live, and those are creator/progression surfaces that belong with
  Earnings.

---

## C9. Settings has ten pages and an off-site eleventh — **S**

**Evidence.** `_site/settings/` holds `index`, `profile`, `appearance`, `content`,
`privacy`, `security`, `notifications`, `circle`, `layout`, `account-status`. Theme
authoring lives somewhere else entirely, at `_site/studio/themes.tsx`, and
`settings/appearance.tsx` is 27 lines — a `PageLayout` around a single panel.
`settings/index.tsx` links out to `/shop` (for cosmetics), `/wallet` and `/progress`
as well.

**Consequence.** Twelve destinations for "change something about my account,"
scattered across three route prefixes.

**Proposal.** Settings is the one place a tab strip is *worse* than a list — deep
settings pages want their own URL for support links and search. So the fix is not
"one hub with tabs," it is:
- Fold `studio/themes` in as `/settings/appearance/themes` (or a section of
  `appearance`, which at 27 lines has room), leaving a redirect at `/studio/themes`.
- Make `settings/index` a real index — a grouped, searchable list of every setting
  with its destination, including the ones currently living at `/shop`, `/wallet`
  and `/progress`. A settings search box is the cheapest usability win on this list
  and it scales past twelve pages, which the current card grid does not.

---

## Consolidation scoreboard

| # | Item | Effort | Surfaces removed | Risk | Post-`0bd0236a` |
|:--:|---|:--:|:--:|---|---|
| C1 | `/shop`, `/pricing` → `/store` stubs | XS | 2 | None — pure redirect | **escalated** — both now self-canonical against `/store` |
| C2 | `/profile/$id` → `/u/$userid` stub | XS | 1 | None — fixes an SEO defect | **escalated** — now documented in `lib/sitemap.ts` as a "legacy alias" and left live |
| C3 | Point nav's Explore at `/explore` | XS | 1 | None | **easier** — SEO already picked the winner; one `href` |
| C4 | One post-card renderer | S | 1 component | **Visual** — screenshot pass required | unchanged |
| C5 | Finish `PageLayout` (29 routes) + gate | S | 29 bespoke frames | Visual, per batch | unchanged — a 13-file sweep moved it by zero |
| C6 | Extend the design gate to `.css`, then burn down | M | — | None for step 1 | unchanged — gate still `.tsx`-only |
| C7 | One saves hub; `RMHarkBookmark` → `SavedItem` | M | 3 | **Data migration** | unchanged |
| C8 | Re-expose `/games` + `/apps` as public indexes | S–M | −2 (adds two, on purpose) | None | **escalated** — the catalogue is now un-submittable by rule |
| C9 | Settings index + fold `studio/themes` | S | 1 | None | unchanged |

C1 + C2 + C3 together are perhaps two hours and remove three duplicate URLs plus one
nav contradiction. **Start there** — and note that C1 and C2 are now actively
degrading rather than merely untidy: one page-pair is emitting contradictory
canonicals, and the other is a known-duplicate route that was classified rather than
retired.

---

# Part II — What the site is lacking

The prior four documents cover 58 features between them. Everything below was
checked against the tree and is absent, and none of it appears in those documents.
I checked and discarded roughly twenty more candidates that turned out to already
exist — those are listed in Part IV so nobody re-derives them.

## D. Account security — the clearest parity gap on the site

### D1. TOTP + recovery codes — **S**

**Gap evidence.** `settings/security.tsx` renders exactly two things:
`<PasskeyManager/>` and `<SessionManager/>`. A grep for `totp`, `authenticator` and
`twoFactorSecret` across `app/ components/ lib/ prisma/ server/` returns nothing;
so does `recoveryCode`/`backupCode`.

**Why it matters.** Passkeys are the better factor and shipping them first was the
right call — but they are device-bound, and a user whose only passkey lives on a
lost phone has **no documented recovery path** on a platform holding a coin balance,
a Stripe membership and a redemption history. Every comparable platform ships TOTP
as the portable second factor and recovery codes as the floor. Better Auth has a
`twoFactor` plugin, so this is configuration plus a settings panel plus a
one-time-download code sheet.

**Also worth adding in the same pass:** step-up re-authentication before the three
irreversible actions — `RedemptionRequest`, account deletion, and email change.
`api/account/delete.ts` and `export.ts` gate on `emailVerified` today, which is not
the same thing.

### D2. Multi-account switching — **M**

**Gap evidence.** No `switchAccount`/`accountSwitcher` anywhere. Better Auth sessions
are single-active.

**Why it matters.** This platform actively encourages a second identity — `Persona`
is a shipped model with its own routes, creators have storefronts, and `/store/$userid`
is a per-user commerce surface. People running a personal account and a creator or
persona account currently sign out and back in. X, Reddit, Discord, Instagram,
Bluesky and GitHub all ship fast switching; it is table stakes for a platform with a
creator tier.

**Shape.** Multiple concurrent session cookies with an active-session pointer, an
avatar-stack switcher in the radial hub, and a hard rule that the economy surfaces
(`wallet`, `store`, redemption) always render the *active* account's balance with the
account name visible — mixing those up is the failure mode.

### D3. Signup/abuse defence: there is none — **M**

**Gap evidence.** No `captcha`, `turnstile` or `hcaptcha` anywhere.
`lib/rate-limit.ts` is **in-memory and per-process** (`RATE_LIMIT_MULTIPLIER`
defaults to 4) — so behind blue/green with two web processes, the effective limit is
whatever a single process sees, and it resets on every deploy.

**Why it matters.** This is a site where a fresh account can earn coins (quests,
streaks, the daily wheel, achievements), transfer them peer-to-peer (`MarketListing`,
tips, `CoinStake`), and route them toward `RedemptionRequest`. That is a complete
value cycle with no cost to account creation and no bot-detection layer. It composes
badly with the 07-31 doc's #1 (age gating) and #8 (auctions) — both of those assume
accounts are scarce.

**Shape.** Turnstile on signup and on the first write of a new account; move the rate
limiter's counters to the Redis backplane that `lib/redis.server.ts` already provides
(it no-ops without `REDIS_URL`, which is exactly why nobody noticed); add a velocity
rule on coin transfers between accounts younger than N days.

### D4. Upload-time media classification — **M**

**Gap evidence.** `lib/moderation/auto-moderate.server.ts` classifies **text**.
`lib/media/` handles upload, quota, sweep and policy. Nothing classifies image or
video content on the way in — no `nsfwDetect`, no `safeSearch`, no perceptual hash
for known-bad matching.

**Why it matters.** The site accepts user images on posts (`imageUrls`), albums, the
library, builds and profiles. Text-only auto-moderation on a platform accepting
arbitrary images is the gap that turns into an incident rather than a backlog item.
Pair it with the 07-31 doc's #3 (visibility tiers) so a medium-confidence image hit
has somewhere proportionate to go.

## E. Communities are a shell

### E1. Community rules, roles that do something, and a per-community mod queue — **M**

**Gap evidence.** `Community` has slug, name, description, colour, icon, isPrivate,
counts. Its relations are members, posts, announcements, spaces, events.
`CommunityMember.role` is a `CommunityRole` enum — but there is no `CommunityRule`,
no `CommunityBan`, no community-scoped report queue, no post approval, and no flair.
A grep for `CommunityRule`, `CommunityBan` and `CommunityReport` returns nothing. So
the role column exists and there is essentially nothing a moderator can *do* with it
that a site admin can't.

**Why it matters.** Compared to Reddit, Discord or even a Discourse forum, a community
here is a hashtag with a member list. The reason communities scale as a moderation
model is that they delegate — the platform team cannot review every post in every
community, and today it must. This is also the cheapest way to make the 07-31 doc's
safety block tractable: `ContentReport` already exists; scoping a queue to a community
and letting its moderators work it is mostly routing.

**Shape.** `CommunityRule { communityId, ordinal, title, body }` rendered in the
sidebar and offered as report reasons; `CommunityBan { communityId, userId, expiresAt,
reason }`; a `communityId` filter on the existing `ContentReport` queue plus a
community-scoped view of it; optional post approval for `isPrivate` communities.
Flair is a separate, smaller item and can wait.

## F. Discovery & SEO

### F1. ~~A real sitemap: index-sharded, profile-inclusive, canonical-clean~~ — **[SHIPPED in `8cad6b95`]**

Proposed in the first pass of this document; delivered by the SEO sweep the same day,
in a stronger form than proposed. `/sitemap.xml` is now an index over
`/sitemaps/{section}[-{n}].xml` with per-section chunking and a documented cap
warning; profiles, posts, vibe pages and communities are sections; `SITE_URL` comes
from `@/lib/seo`; and the whole thing is gated by two new suites that also enforce
per-page canonicals and descriptions. Recorded here rather than deleted so the
sequencing below still reads.

**One follow-up remains, and it is C1's.** `sitemap-coverage.test.ts` requires a
canonical on every listed page but cannot know that two listed pages are the same
page. `/shop` and `/store` are both listed, both self-canonical. Fixing C1 removes
one of them from the sitemap automatically via the suite's own
"lists no route that only redirects" rule.

### F2. Automated accessibility checks in CI — **S**

**Gap evidence.** `design.md` §7 makes accessibility part of the material and §9
lists what CI enforces — accent contrast, colour-vision-mode integrity, the tab-strip
grammar, no new lint warnings. None of those is an actual a11y *audit*. No `axe-core`
in `package.json`. `jsx-a11y` runs at warn.

**Why it matters.** This is a site that has invested unusually heavily in
accessibility — sixteen locales, RTL, colour-vision modes, reduced motion, reduced
transparency, high contrast, dyslexia-friendly type, a density scale — and verifies
none of it automatically. §9's own conclusion ("a green suite means you did not
regress the enforced rules; it does not mean the change looks right") is the argument
for closing this: the enforced set should be as large as it cheaply can be.

**Shape.** `playwright` is already a dependency (`^1.62.0`, for `vitest.epic.config.ts`).
Add `@axe-core/playwright`, walk a fixed list of ~15 representative routes in the
`default` and `high-contrast` themes, fail on serious/critical violations, allowlist
the current state exactly as C6 proposes for CSS. Same pattern, second axis.

### F3. A visual-regression baseline for the glass tiers — **M**

**Gap evidence.** Same Playwright dependency; no screenshot baseline anywhere.

**Why it matters.** C4 and C5 are both blocked on "screenshot pass in three themes"
being a manual step. `design.md` §10.6 ends with "look at it — three themes, two
widths, reduced motion once," which is the correct instruction and is exactly the
kind of instruction that decays. A baseline of ~20 routes × 3 themes × 2 widths turns
the consolidation work in Part I from risky into routine, and it pays for itself on
C5 alone.

**Sequencing note.** This is the one Part II item worth doing *before* Part I rather
than after.

## G. Content lifecycle

### G1. Scheduled and delayed messaging — **S**

**Gap evidence.** `lib/scheduled/publish.server.ts` schedules **posts** (via the lazy
`publishDueForUser` materialization). `messages.server.ts` and `group-chat/` have no
scheduling. No `undoSend` anywhere either.

**Why it matters.** Undo-send in particular is a ten-second client-side hold before
the write commits, it is the single most-appreciated small feature on every messaging
product that ships it, and the scheduling infrastructure to do the durable version
already exists one directory over.

### G2. Deliberate offline content — **S**

**Gap evidence.** The PWA shell is complete: `public/sw.js`, `lib/sw-register.ts`,
`manifest.webmanifest`, VAPID push, `app/routes/offline.tsx`. No `backgroundSync`, no
`SyncManager`, and nothing pins content to the cache on purpose.

**Note.** The 07-31 doc's #24 proposes offline reading *bundled with home-screen
widgets* and rates the pair M. Splitting them is worth it — the offline half is S on
its own, it depends only on the service worker that already ships, and it is the half
that makes `DailyStreak` survivable on a commute. Take the S half now.

---

# Part III — Sequencing

**Week 1 — the free consolidations.** C1, C2, C3 then §0(b). Roughly a day, no
user-visible risk, and the three of them retire two contradictory canonicals, one
classified-but-live duplicate, and the nav/sitemap disagreement about what "Explore"
means. §0(a) and F1 are already done.

A note on ordering that the SEO sweep makes concrete: **do the routing decision
before the metadata pass, not after.** `8cad6b95` gave `/shop` a description, a
canonical and a sitemap entry — all of which have to be undone the moment C1 lands,
and none of which would have been written if C1 had landed first. The same is true
of every future sweep over `/profile/$id`. Consolidation is upstream of SEO.

**Week 2 — the gates, before the risky work.** C6 step 1 (`.css` allowlist freeze),
F2 (axe in CI), F3 (visual baseline). Each is independently useful and together they
are the safety net for everything after.

**Weeks 3–4 — the structural consolidations.** C5 batches 1–3, then C4 with the
baseline in place, then C9. This is where `PageLayout` learns what it was missing.

**Then, in parallel lanes:**

- **Safety** — D3 (abuse defence) and D4 (media classification) first; both are
  preconditions the 07-31 doc's economy items quietly assume. D1 (TOTP) is S and can
  go any time.
- **Growth** — C8 (`/games` + `/apps` indexes) then F1 (sitemap index). These two
  are one project: the pages and the thing that submits them.
- **Structure** — C7 (saves), then E1 (communities). Both are M and both are the kind
  of work that gets harder every month it waits.

**The one thing to do out of order:** F3, the visual baseline. Every consolidation in
Part I is a visual change to a page someone reads daily, and the difference between
"we consolidated the frontend" and "we broke the frontend" is whether a screenshot
diff existed at the time.

---

# Part IV — Checked and found present

Listed so the next reader doesn't re-derive them. All of these were candidate gaps
and all of them already ship:

**Social** — polls on posts (`RMHarkPoll`), quote-reposts (`RMHark.originalId`
self-relation), edit history (`RMHarkEdit`), reply controls (`RMHarkReplyControl`),
audience scoping incl. close friends (`RMHarkAudience` + `CloseFriend`), content
warnings (`isSensitive`), per-image alt text (`imageAlts`), paid unlocks
(`PostUnlock`), pinned posts, scheduled posts, drafts.

**Games** — reviews and ratings (`GameReview`, `GameReviewVote`), player guides with
revisions (`GameGuide`, `GameGuideRevision`), replays (`GameReplay` + `/replays/$id`
+ `embed.replay.$id`), Elo (`EloRating`), per-game OG cards.

**Account** — passkeys (`PasskeyManager`), active-session management
(`SessionManager`), email verification, data export (`api/account/delete.ts`,
`export.ts`), cookie consent, referrals.

**Platform** — command palette (`components/site/CommandPalette`, mounted globally),
keyboard shortcuts (`components/site/KeyboardShortcuts`), digest email
(`lib/digest/pipeline.server.ts`), web push (VAPID), onboarding first-week arc,
admin audit log, moderation appeals (07-31 doc's #2 — **this one landed since that
document was written**), bundle budgets
(`lib/__tests__/performance-guardrails.test.ts`), client error beacons (`lib/rum.ts`,
`lib/client-errors.ts`).

**SEO/discoverability — shipped by `8cad6b95` after the first pass of this document
was written:** the sitemap index with per-section chunking (`lib/sitemap.ts`,
`sitemap.server.ts`, `app/routes/sitemaps.$name.ts`), a `head()` with title,
description, canonical and OG card on all 18 previously-bare game roots and the app
roots — derived from `lib/games.ts`/`lib/apps.ts` via `lib/seo-catalog.ts` so the
catalogue and the pages cannot drift — an explicit `EXCLUDED_ROUTES` classification
for every route in the tree with a typed `ExclusionReason`, a rewritten
`public/robots.txt`, and two CI suites asserting that the sitemap never lists a
missing route, a redirect-only route, a duplicate `loc`, an absolute URL, a query
string, or a page lacking a description/canonical.

That commit also removes three Prisma models with the Alex bot retirement
(`7cc2a801`), so the model count in this document is **249**, not the 252 quoted in
`/CLAUDE.md` and the earlier plan docs.

**Still absent from the 07-31 list** (re-checked against `0bd0236a`, and #4 remains
the highest-leverage item across both documents): feature flags, public status page,
changelog, keyword mutes, visibility tiers, age assurance, semantic search /
pgvector, OAuth apps.

---

# Part V — Explicitly not proposed

- **A design-system package or a component-library extraction.** `components/ui/` is
  already the primitive layer and it works; the problem is adoption (C5, C6), not
  architecture. Extracting a package would add a build step and change nothing about
  the 29 routes that hand-roll their frame.
- **Merging the `--site-*` and `--app-*` contracts.** `design.md` §8 explains why they
  are separate and the reasoning holds — an app owns the viewport and has no shared
  aurora to sample. Consolidating them would be consolidation for its own sake.
- **Collapsing the per-game component directories.** 21 games with their own
  directories and their own CSS is correct; games are explicitly exempt from the site
  palette rules and their CSS should stay theirs. Only the *site-tier* CSS in C6 is
  in scope.
- **Route-tree flattening / a different router.** `routeTree.gen.ts` is generated and
  the file-based layout is working. 733 route files is a lot of product, not a lot of
  structure.
- **Full inbound ActivityPub, ads, and the rest of the 07-31 doc's exclusions** —
  those reasons still stand.

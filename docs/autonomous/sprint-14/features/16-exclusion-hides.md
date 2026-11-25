# 16 — Self-exclusion hides the coin games, as it promises

Surface: every place the site points at the coin-risking surfaces — the sidebar and the globe's places, the account
menu, the sections page, the home widgets, the command palette's search, the `g` keyboard shortcut — and the
surfaces themselves (`/predictions`, which also holds the casino tables, and `/wager/$id`), which show a calm
"You excluded yourself" page instead; Settings > Play limits says what is hidden. Wave 6. Namespace
`exclusion-hides`. Site tier (Steel).

## User story

As a member who excluded myself from staking coins for a month, I want the coin games to disappear from the menus and
search rather than sit there refusing me, so that I am not reminded of them every time I open the site.

## Requirements elicitation

- **What exists (verified):**
  - Responsible play (W8): `UserPlayLimits` and the panel `components/settings/PlayLimitsPanel.tsx`; enforcement in
    `lib/economy/play-limits-core.ts` (`blockedBy`, `SELF_EXCLUDED`, `COOL_OFF_ACTIVE`). The design
    (`docs/plans/2026-09-19-next-phase-feature-ideas.md` §W8) says: "Self-exclusion hides the surfaces rather than only
    blocking them — `/wager`, `/predictions` and the casino lobbies drop out of the … hub and search for an excluded
    member."
  - The hiding half was never wired: `hidesRiskSurfaces` (`lib/economy/play-limits.ts`) is only folded into the panel's
    `surfacesHidden` flag (`lib/economy/play-limits.server.ts`), and `isSelfExcluded` — "the one-field question the
    navigation and search filters ask" — has **no caller**. Nothing hides anything.
  - Where the surfaces are linked: `SIDEBAR_NAV` (`lib/sidebar-nav.ts`, the `/predictions` leaf, read by
    `components/shell/Sidebar.tsx` through `sidebarPlaces` and by `components/shell/GlobeNav.tsx`),
    `components/shell/AccountMenu.tsx` (Wallet → `/predictions`), `app/routes/_site/sections.tsx`,
    `lib/home-widgets.ts` (two `/predictions` entries), `lib/search/catalog.ts` (the `/predictions` entry with casino
    keywords, read by `components/site/CommandPalette.tsx`), `components/site/KeyboardShortcuts.tsx` (a `/predictions`
    shortcut). The casino tables have no page of their own (`features/casino/feature.ts`: they live on the
    `/predictions` page's Games tab); wagers at `app/routes/_site/wager.$id.tsx`.
  - **Linkers the design pass missed** (a `git grep` for `'/predictions'` and `'/wager'` outside tests): the Compete
    hub's Wagers tab (`app/routes/_site/compete.tsx`, `COMPETE_TABS` includes `'wagers'`, rendered by
    `components/compete/WagersSection.tsx`, and `/wager` itself redirects there, `lib/route/legacy-redirects.ts`), the
    profile header's coin count (`components/profile/ProfileHero.tsx`, a link to `/predictions`), the wallet's "Play &
    predict" button (`components/wallet/WalletPage.tsx`), the elections hero and markets panel
    (`components/elections/Hero.tsx`, `components/elections/MarketsPanel.tsx`), and the casino table invite
    (`components/rmhcoins/TableInvite.tsx`). Non-UI mentions (`lib/economy/flows.ts`, `lib/og/*`, `lib/sitemap.ts`,
    `lib/wager/wager.server.ts`, `lib/api/routes/casino.rooms.server.ts`, the route files themselves) link nothing a
    member sees and are exempt with that reason.
  - The shell's lists hydrate on the client after the first paint (`useLayoutStore` in `Sidebar.tsx`), so a per-member
    hide fits the same moment.
- **Decisions:**
  - **One list:** `RISK_SURFACE_PATHS = ['/predictions', '/wager']` in `lib/economy/risk-surfaces.ts` (new, client-safe),
    with `isRiskSurfacePath(href)` (also true for `/compete?tab=wagers`, the wagers tab's address); every reader
    above filters through it. A source-scan test lists the files that link a risk surface (`RISK_SURFACE_LINKERS`,
    each with how it hides: the hook, the server check, or an exemption reason) and fails a new file that links one
    without being listed.
  - **The signal:** `GET /api/settings/play-limits/surfaces` (new, `auth: 'optional'`, `rateLimit: 'read'`, cache
    `private`, `maxAge: 60`) → `{ hidden }` (false signed out), read by `hooks/useRiskSurfacesHidden.ts` (new, React
    Query, `staleTime` 60 s) and invalidated when the member changes a limit.
  - **The Compete hub** keeps its other tabs; for an excluded member the Wagers tab is not offered and
    `?tab=wagers` is treated as the default tab, decided in the route's loader on the server (the loader already
    switches on the tab), so the open wagers are never fetched or rendered for them.
  - **The surfaces themselves:** an excluded member opening `/predictions` or `/wager/$id` sees "You excluded yourself
    from staking until {{date}}" with a link to Settings > Play limits and no hub, decided on the server in the route's
    loader through a guarded server function (`requireSessionServerFn` is not needed: signed out is never excluded) so
    the page is right with scripting off. Pages that only show results (a resolved market's public page) are unchanged.
  - **Cool-off** does not hide anything (the design's rule, `hidesRiskSurfaces`): only exclusion.
  - **The panel** says, while excluded, "Coin games are hidden from menus and search until {{date}}".
  - **No new restriction:** staking is already refused; this feature only hides.

## Functional requirements

1. FR-1 `lib/economy/risk-surfaces.ts` (new): the list, `isRiskSurfacePath`, `RISK_SURFACE_LINKERS`.
2. FR-2 `lib/economy/api/settings.play-limits.surfaces.server.ts` (new) on a contract in
   `lib/economy/play-limits.contract.ts`, calling `isSelfExcluded`.
3. FR-3 `hooks/useRiskSurfacesHidden.ts` (new); filters in `Sidebar.tsx`, `GlobeNav.tsx`, `AccountMenu.tsx`,
   `sections.tsx`, the home-widget reader of `lib/home-widgets.ts`, `CommandPalette.tsx`'s use of the search catalogue,
   `KeyboardShortcuts.tsx` (the shortcut does nothing and is not listed while hidden), `ProfileHero.tsx` (the coin
   count stays, as text, without the link, on the member's own profile), `WalletPage.tsx` (the button is not shown),
   `components/elections/Hero.tsx` and `MarketsPanel.tsx` (the links are not shown) and `TableInvite.tsx` (an invite
   reads "You excluded yourself from staking" with no join link).
3a. FR-3a `app/routes/_site/compete.tsx` and `components/compete/WagersSection.tsx`: the Wagers tab is hidden and its
   loader branch skipped for an excluded member, through the same server function as FR-4.
4. FR-4 `app/routes/_site/predictions.tsx` and `app/routes/_site/wager.$id.tsx`: a loader check through a server
   function in `lib/economy/exclusion-page.server.ts` (new) and `components/settings/ExcludedNotice.tsx` (new).
5. FR-5 `components/settings/PlayLimitsPanel.tsx`: the hidden sentence; invalidate the surfaces query after a change.

## Non-functional requirements

- **Scripting off:** the two pages render the notice from the server; the menus fall back to the default (unhidden)
  lists before hydration, as the layout store already does.
- **No leak:** the endpoint says only `hidden`, never dates; the dates stay on the settings panel.
- **Bundle:** the hook adds one tiny query; zod stays off the shell (contract types by `import type`).
- **Server functions:** the loader's server function guards inside its handler (`lib/auth/server-fn-guards.server.ts`
  conventions); a signed-out call returns "not excluded".

## Data model and API

No schema change. `GET /api/settings/play-limits/surfaces` → `{ hidden: boolean }`.

## Testing requirements

- Main suite `lib/economy/__tests__/risk-surfaces.test.ts`: the endpoint (excluded, cooling off, expired, signed out);
  the page check.
- Main suite `lib/economy/__tests__/risk-surface-linkers.test.ts`: the source scan.
- Product suite `lib/economy/__tests__/risk-surfaces.product.test.ts`: `isRiskSurfacePath` for nested and query paths.
- `lib/__tests__/useeffect-fetch-ratchet.test.ts`, `lib/__tests__/zod-off-hot-routes.test.ts`,
  `lib/__tests__/server-fn-guard-ratchet.test.ts`, `lib/__tests__/shortcut-registry.test.ts`,
  `lib/__tests__/api-cache-policy.test.ts`.

## Acceptance criteria

- [ ] A member who excludes themselves for 7 days no longer sees Predictions in the sidebar, the globe, the account
      menu, the sections page, the home widgets, the command palette, the wallet, the profile header or the elections
      pages, and `/compete` shows no Wagers tab (also with scripting off).
- [ ] Opening `/predictions` shows "You excluded yourself from staking until …" with a link to the setting, also with
      scripting off.
- [ ] A member in a cool-off still sees the menus (staking is refused as before).
- [ ] When the exclusion ends, everything is back without a reload of settings.

## Out of scope

Age gates, hiding non-staking games, hiding the wallet, a lighter "hide only" setting without exclusion.

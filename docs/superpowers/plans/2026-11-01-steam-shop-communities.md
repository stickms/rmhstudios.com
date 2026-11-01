# Steam-styled Points Shop and Communities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/games/shop` and `/games/communities` in the Steam frame and point in-frame links at them, leaving `/store` and `/communities` untouched.

**Architecture:** Two new routes under the existing `/games` layout (`app/routes/games.tsx` already wraps children in `SteamShell`). Each renders a new Steam component (`stm-*` classes, `steam.css`) fed by the existing server loaders `getShopData` and `listCommunities`; mutations reuse `/api/shop/purchase` and `/api/shop/equip`. Pure view helpers are split out so they can be unit-tested.

**Tech Stack:** TanStack Start routes, React 19, i18next (`games-hub` namespace), Vitest, lucide icons, sonner toasts.

**Spec:** `docs/superpowers/specs/2026-11-01-steam-shop-communities-design.md`

## Global Constraints

- Steam-native styling only: `components/steam/steam.css` classes (`stm-web`, `stm-web-card`, `stm-web-head`, `stm-btn`, `stm-btn-blue`, `stm-muted`, `stm-link`); no `--site-*`/glass/jelly classes. `/games/*` is already a native-material route.
- All user-facing strings via `t('key', { defaultValue })` in namespace `games-hub`; run `pnpm i18n:extract` and confirm keys land in `locales/en/games-hub.json`. No `{/* */}` comment directly before a `t()` call.
- New routes use `noindexHead(...)` from `@/lib/seo` (the main-UI pages stay the indexed canonicals).
- Never edit `app/routeTree.gen.ts` (regenerates on dev/build).
- Never import `.server` modules from client code; loaders call them inside `createServerFn`.
- Commit gate: `pnpm check:consistency` before each commit; co-author trailers as in prior commits.

## Review Focus

- Signed-out viewer on `/games/shop`: catalog visible, buy buttons replaced by a sign-in link (`/login?callbackURL=…`), no 401 toast spam.
- Purchase with insufficient coins or already-owned item: server error text shown, local state unchanged.
- Item with `requiresTier` the viewer lacks: shown locked, not purchasable client-side.
- `/games/communities` with zero communities or a query that matches none: empty-state message, not a blank page.
- Private/locked community card: no post count or members leaked; links to the Steam group page only when `!locked`.

---

### Task 1: Tab mapping for the new routes

**Files:**
- Modify: `components/steam/SteamShell.tsx:25-40` (`steamTabFor`)
- Test: `components/steam/__tests__/steam-tab.test.ts`

**Interfaces:**
- Produces: `steamTabFor('/games/shop') === 'store'`, `steamTabFor('/games/communities') === 'community'`.

- [ ] **Step 1: Add failing assertions** to `steam-tab.test.ts`: `steamTabFor('/games/shop')` → `'store'`; `steamTabFor('/games/communities')` → `'community'`. (Today the latter is `'library'` via the `/games/` fallback.)
- [ ] **Step 2: Run** `pnpm exec vitest run components/steam/__tests__/steam-tab.test.ts` — Expected: FAIL on both.
- [ ] **Step 3: Update `steamTabFor`:** add `pathname.startsWith('/games/shop')` to the store branch and `pathname.startsWith('/games/communities')` to the community list (before the library fallback).
- [ ] **Step 4: Re-run the test** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(steam): map shop and communities routes to their tabs`.

### Task 2: `/games/shop` — points shop in the Steam frame

**Files:**
- Create: `components/steam/shop-view.ts`, `components/steam/ShopPage.tsx`, `app/routes/games/shop.tsx`
- Test: `components/steam/__tests__/shop-view.test.ts`

**Interfaces:**
- Consumes: `getShopData(userId: string | null): Promise<ShopData>` (`lib/shop/list.server.ts`); `ShopListItem`; `KIND_ORDER`, `KIND_LABELS`, `RARITY_ORDER`, `ShopItemKind` from `@/lib/shop/catalog`; `POST /api/shop/purchase {itemId}` → `{newBalance}` or `{error}`; `POST /api/shop/equip {itemId, equipped}`.
- Produces: `visibleShopItems(items: ShopListItem[], kind: ShopItemKind): ShopListItem[]` (filter by kind, sort by rarity order then price ascending, non-mutating); `canBuy(item: ShopListItem, coins: number, signedIn: boolean): 'ok' | 'signed-out' | 'owned' | 'poor' | 'tier'` — `'tier'` when `requiresTier` is set (the page shows these locked; membership gating is enforced server-side). `ShopPage({ data }: { data: ShopData })`.

- [ ] **Step 1: Write failing tests** in `shop-view.test.ts`: (a) `visibleShopItems` returns only the requested kind, rarity-ascending then price-ascending, and leaves the input array order unchanged; (b) `canBuy` returns `'signed-out'` when `!signedIn`, `'owned'` when `owned`, `'tier'` when `requiresTier` is set and not owned, `'poor'` when `coins < price`, else `'ok'`, checked in that precedence order.
- [ ] **Step 2: Run** `pnpm exec vitest run components/steam/__tests__/shop-view.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the two helpers in `shop-view.ts` (read `ShopColumn.tsx` "Within a category, order by rarity" for the existing sort and match it).
- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Implement `ShopPage`** in `ShopPage.tsx`: `<div className="stm-web">`; header with title and coin balance (`CoinIcon`); one capsule/button row per kind in `KIND_ORDER` (a plain `role="tablist"` of `stm-btn` buttons with `aria-selected`, not a main-site `LiquidTabs`); item grid of `stm-web-card`s showing `Preview`-equivalent swatch (emoji/colour from `item.data`), name, description, price, and a button per `canBuy` result (`ok` → Buy; `owned` → Equip/Unequip; `signed-out` → sign-in link; `poor` → disabled; `tier` → disabled "Members only" with link to `/store?tab=membership`). Mutations follow `ShopColumn.tsx:165-205`, with sonner toasts and local state updates on success only. A footer link to the membership/daily tabs goes to `/store?tab=membership` / `/store?tab=daily` (those stay main-UI; flagged in the spec as out of scope).
- [ ] **Step 6: Create `app/routes/games/shop.tsx`:** `createFileRoute('/games/shop')`, `createServerFn({ method: 'GET' })` handler that reads `getRequestSession()` and returns `getShopData(session?.user.id ?? null)`, `head: () => ({ meta: noindexHead('Points shop') })` (match the `groups.$slug.tsx` usage), component renders `<ShopPage data={Route.useLoaderData()} />`. Regenerate the route tree via `pnpm exec vite build` or `pnpm dev` once so `/games/shop` type-checks.
- [ ] **Step 7: Verify** `pnpm exec tsc --noEmit` passes and, with `pnpm dev`, `/games/shop` renders inside the Steam frame signed-out and signed-in.
- [ ] **Step 8: Commit** `feat(steam): points shop at /games/shop`.

### Task 3: `/games/communities` — directory in the Steam frame

**Files:**
- Create: `components/steam/communities-view.ts`, `components/steam/CommunitiesPage.tsx`, `app/routes/games/communities.tsx`
- Test: `components/steam/__tests__/communities-view.test.ts`

**Interfaces:**
- Consumes: `listCommunities({ userId })` → `{ ... }[]` of `CommunityListItem` (`lib/communities.server.ts`, fields `slug,name,description,icon,memberCount,joined,isPrivate,locked`); existing `GroupPage` route `/games/groups/$slug`.
- Produces: `filterCommunities(list: CommunityListItem[], q: string): CommunityListItem[]` (case-insensitive match on name or description; blank `q` returns all); `CommunitiesPage({ communities }: { communities: CommunityListItem[] })`.

- [ ] **Step 1: Write failing tests:** `filterCommunities` matches name case-insensitively, matches description, returns everything for `'  '`, returns `[]` for no match, and keeps input order.
- [ ] **Step 2: Run** `pnpm exec vitest run components/steam/__tests__/communities-view.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `filterCommunities`. Run the test — Expected: PASS.
- [ ] **Step 4: Implement `CommunitiesPage`:** `stm-web` wrapper, `<CommunityNav />` at top, a search input (controlled, local state, uses `filterCommunities`), list of rows with icon, name, member count and a "Private" label when `isPrivate`; unlocked rows link to `/games/groups/$slug`, locked rows are non-links showing a lock icon; empty state text when the filtered list is empty.
- [ ] **Step 5: Create `app/routes/games/communities.tsx`** like Task 2: `createFileRoute('/games/communities')`, server fn calling `listCommunities({ userId: session?.user.id ?? null })`, `noindexHead('Communities')`.
- [ ] **Step 6: Verify** `pnpm exec tsc --noEmit`; check in `pnpm dev` that the Community tab is highlighted and the sub-nav shows.
- [ ] **Step 7: Commit** `feat(steam): communities directory at /games/communities`.

### Task 4: Point in-frame links at the new routes

**Files:**
- Modify: `components/steam/CommunityNav.tsx:34`, `components/steam/CommunityHome.tsx:152`, `components/steam/StorePage.tsx:52`
- Modify (if found by the grep in Step 1): other links to `/store`, `/shop`, `/communities` inside `components/steam/**`, `app/routes/games/**`, the apps entry (`app/routes/_site/apps/index.tsx`) and `components/steam/LibraryHomePage.tsx`.

- [ ] **Step 1: Find every link:** `grep -rnE "to=\"/(store|shop|communities)|to: '/(store|shop|communities)'" components/steam app/routes/games app/routes/_site/apps app/routes/_site/arcade.tsx`. Record the list in the commit message.
- [ ] **Step 2: Retarget** `/communities` → `/games/communities` in `CommunityNav` (also add `aria-current` like its siblings) and `CommunityHome`; `/store` (shop/points intent) → `/games/shop` in `StorePage`. Leave links that are meant to reach membership or daily tabs.
- [ ] **Step 3: Add a visible "Points shop" link** in `StorePage` beside the existing `/store` link (the Store tab owns it).
- [ ] **Step 4: Run** `pnpm exec tsc --noEmit` and `pnpm exec vitest run components/steam` — Expected: pass.
- [ ] **Step 5: Commit** `feat(steam): link the Steam frame to its own shop and communities pages`.

### Task 5: i18n, gate and PR

- [ ] **Step 1:** `pnpm i18n:extract`; confirm `locales/en/games-hub.json` contains every new key (grep a few). Commit the locale diff.
- [ ] **Step 2:** `pnpm check:consistency --base main` — Expected: green. Fix findings; do not bypass.
- [ ] **Step 3:** `pnpm test` — Expected: all pass.
- [ ] **Step 4:** Push the branch and open a ready-for-review PR (mirror any PR template headings).

## Not in this pass (flagged for the owner)

- `GroupPage` "Open group" still links to `/c/$slug` (main UI) because the Steam group page has no posting UI; that is a jarring jump the follow-up should address.
- Membership, daily and the player marketplace tabs of `/store` stay main-UI.

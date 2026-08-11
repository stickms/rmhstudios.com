/**
 * Canonical top-level site navigation (client-safe). Single source of truth for
 * both the rendered nav (`components/radial/LiquidGlobe`, which pins one
 * destination per point on the hub's globe) and the reorder editor (`components/site/SidebarEditMode`),
 * so the two never drift. Named "sidebar" for the left rail this predates.
 *
 * Each item has a stable `id`: leaves use their href (`/library`), groups use
 * `group:<name>`. Every destination is a leaf today — Services and Ventures were
 * the last two groups and are now plain links to their own hub pages — but the
 * group shape stays supported, since the rail and the hub both still render it.
 * The user's saved order + hidden set (see `lib/home-widgets.ts` `SidebarPref` /
 * `SIDEBAR_NAV_IDS`) is validated against these ids, so renaming an id is a data
 * migration — keep them stable.
 */
import {
  Home,
  Library,
  Wand2,
  ShieldCheck,
  TrendingUp,
  Inbox,
  ShoppingBag,
  Compass,
  Users,
  Terminal,
  LayoutGrid,
  Rocket,
  Gamepad2,
  type LucideIcon,
} from 'lucide-react';

export type NavBadge = 'inbox' | 'admin-review';

// `id` is the stable customization key; `tKey` is the i18n key (namespace
// "feed"); `label` is the English fallback.
export type NavLeaf = {
  id: string;
  href: string;
  tKey: string;
  label: string;
  icon: LucideIcon;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
  badge?: NavBadge;
  external?: boolean;
  /**
   * Extra paths that light this pin even though it navigates to `href`.
   *
   * For the pins that stand for a DESTINATION rather than a URL — "Games &
   * Apps" is one pin over two indexable catalogs — the visitor can be on a page
   * the pin represents but does not link to. Without this the rail reads as
   * "you are nowhere" on `/apps`, which is worse than the extra route costing
   * its own pin. Matched exactly like `href` (prefix, `/` segment-aware).
   */
  altHrefs?: string[];
};
export type NavGroup = {
  id: string;
  group: string;
  tKey: string;
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
};
export type NavItem = NavLeaf | NavGroup;

export const isNavGroup = (item: NavItem): item is NavGroup => 'group' in item;

// Top-level nav — one entry per destination, each its own pin on the hub's globe.
// "Services" (our standalone product verticals) and "RMH Ventures" (the brand
// microsites) are hub PAGES rather than expanding groups, so a family of related
// destinations costs the globe one pin instead of one per member. The order
// below is the default rail order; users can reorder/hide it (§15).
export const SIDEBAR_NAV: NavItem[] = [
  { id: '/', href: '/', tKey: 'nav-home', label: 'Home', icon: Home },
  // `/explore` is now the only discovery destination — search, tabs and the AI
  // ask live on it, and `/search` redirects in. (They were two "Explore"
  // surfaces: the nav sent people to one, the sitemap listed the other, and
  // each had half the feature.) The `id` stays `/search`: it is the
  // customization key validated against `SIDEBAR_NAV_IDS`
  // (`lib/home-widgets.ts`), so renaming it would silently drop this entry from
  // every user's saved rail order.
  { id: '/search', href: '/explore', tKey: 'nav-explore', label: 'Explore', icon: Compass },
  {
    id: '/messages',
    href: '/messages',
    tKey: 'nav-inbox',
    label: 'Inbox',
    icon: Inbox,
    requiresAuth: true,
    badge: 'inbox',
  },
  { id: '/create', href: '/create', tKey: 'nav-create', label: 'Create', icon: Wand2 },
  // The player's counterpart to Create. `/games` and `/apps` are two indexable
  // catalogs, but they are one destination — "show me what was made here" — so
  // they cost the globe ONE pin, the same trade Services and Ventures make
  // below. The pin lands on `/games`, and the two catalogs carry a shared
  // link-tab strip (`components/creator-studio/CatalogTabs`) that crosses
  // between them, so Apps is one visible tap from the pin rather than a second
  // one. Before this they had no pin at all: `/create` dropped its Apps tab
  // when the catalogs became their own pages, which left `/apps` reachable only
  // from search and the `?tab=apps` redirect.
  // `altHrefs` is what makes the one-pin trade honest: the pin navigates to
  // `/games`, but `/apps` is the same destination, so it lights the same pin
  // instead of leaving the rail with nothing marked.
  {
    id: '/games',
    href: '/games',
    tKey: 'nav-games',
    label: 'Games & Apps',
    icon: Gamepad2,
    altHrefs: ['/apps'],
  },
  { id: '/library', href: '/library', tKey: 'nav-library', label: 'Library', icon: Library },
  { id: '/communities', href: '/communities', tKey: 'nav-communities', label: 'Communities', icon: Users },
  { id: '/store', href: '/store', tKey: 'nav-store', label: 'Store', icon: ShoppingBag },
  // Arcade is no longer its own destination: the Arcade Pass (daily challenges + the
  // player leaderboard) is a section of Create's Games tab, under Ranked.
  // `/arcade` stays alive as a redirect there, so old links still land.
  { id: '/predictions', href: '/predictions', tKey: 'nav-predictions', label: 'Predictions', icon: TrendingUp },
  { id: '/developer', href: '/developer', tKey: 'nav-developer', label: 'Developer', icon: Terminal },
  // §15.7: Services is a plain link to the /services hub page (the former
  // expanding group died per §12.8). Its verticals (/homes, /rmhladder,
  // /rideshare) live as tabs on that page and stay reachable directly.
  { id: '/services', href: '/services', tKey: 'nav-services', label: 'Services', icon: LayoutGrid },
  // Ventures follows Services: a plain link to its own hub page rather than a
  // group. As a group its four children were flattened into four separate
  // destinations on the hub — four of fourteen spent on one arm of the company,
  // and the two longest names ("Adaptive Intelligence", "RMH Deeplink") crowding
  // the nav with labels nothing had room for. The microsites live as tabs on /ventures and stay reachable directly.
  { id: '/ventures', href: '/ventures', tKey: 'nav-ventures', label: 'RMH Ventures', icon: Rocket },
  // Admin is never reordered/hidden (its id isn't in SIDEBAR_NAV_IDS), so it
  // stays pinned to the bottom of the rail and only renders for admins.
  {
    id: '/admin',
    href: '/admin',
    tKey: 'nav-admin',
    label: 'Admin',
    icon: ShieldCheck,
    requiresAdmin: true,
    badge: 'admin-review',
  },
];

/**
 * Whether `pathname` is "inside" a nav leaf — the one definition of what lights
 * a pin, used by the desktop rail and by the globe's you-are-here orientation.
 *
 * It lived twice, once in `RadialNavRail` and once in `LiquidGlobe`, which is
 * how `/apps` came to be marked in neither: a second copy is a second thing to
 * remember to update. `/` matches only itself (every path starts with it);
 * everything else matches its own path or a `/`-delimited descendant, so
 * `/games` covers `/games/altair` without `/gameshow` covering anything.
 */
export function isNavLeafActive(
  pathname: string,
  leaf: Pick<NavLeaf, 'href' | 'altHrefs'>,
): boolean {
  const matches = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return matches(leaf.href) || (leaf.altHrefs?.some(matches) ?? false);
}

/**
 * Apply a user's saved order to a list of nav items. Items whose id is present
 * in `order` come first, in the saved order; any item not in `order` keeps its
 * default relative position afterwards. This is forward-safe: a newly shipped
 * tab (absent from an older saved order) still appears rather than vanishing,
 * and non-orderable items like Admin (never in `order`) fall to the end.
 */
export function orderNavItems<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items.slice();
  const byId = new Map(items.map((it) => [it.id, it]));
  const used = new Set<string>();
  const out: T[] = [];
  for (const id of order) {
    const it = byId.get(id);
    if (it && !used.has(id)) {
      out.push(it);
      used.add(id);
    }
  }
  for (const it of items) if (!used.has(it.id)) out.push(it);
  return out;
}

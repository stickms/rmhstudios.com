/**
 * Canonical top-level site navigation (client-safe). Single source of truth for
 * both the rendered nav (`components/radial/RadialHub`, which carves one wedge
 * per destination) and the reorder editor (`components/site/SidebarEditMode`),
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
  Gamepad2,
  LayoutGrid,
  Rocket,
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

// Top-level nav — one entry per destination, each its own wedge on the hub.
// "Services" (our standalone product verticals) and "RMH Ventures" (the brand
// microsites) are hub PAGES rather than expanding groups, so a family of related
// destinations costs the dial one wedge instead of one per member. The order
// below is the default rail order; users can reorder/hide it (§15).
export const SIDEBAR_NAV: NavItem[] = [
  { id: '/', href: '/', tKey: 'nav-home', label: 'Home', icon: Home },
  { id: '/search', href: '/search', tKey: 'nav-explore', label: 'Explore', icon: Compass },
  {
    id: '/messages',
    href: '/messages',
    tKey: 'nav-inbox',
    label: 'Inbox',
    icon: Inbox,
    requiresAuth: true,
    badge: 'inbox',
  },
  { id: '/create', href: '/create', tKey: 'nav-creator-studio', label: 'Creator Studio', icon: Wand2 },
  { id: '/library', href: '/library', tKey: 'nav-library', label: 'Library', icon: Library },
  { id: '/communities', href: '/communities', tKey: 'nav-communities', label: 'Communities', icon: Users },
  { id: '/store', href: '/store', tKey: 'nav-store', label: 'Store', icon: ShoppingBag },
  { id: '/arcade', href: '/arcade', tKey: 'nav-arcade', label: 'Arcade', icon: Gamepad2 },
  { id: '/predictions', href: '/predictions', tKey: 'nav-predictions', label: 'Predictions', icon: TrendingUp },
  { id: '/developer', href: '/developer', tKey: 'nav-developer', label: 'Developer', icon: Terminal },
  // §15.7: Services is a plain link to the /services hub page (the former
  // expanding group died per §12.8). Its verticals (/homes, /rmhladder,
  // /rideshare) live as tabs on that page and stay reachable directly.
  { id: '/services', href: '/services', tKey: 'nav-services', label: 'Services', icon: LayoutGrid },
  // Ventures follows Services: a plain link to its own hub page rather than a
  // group. As a group its four children were flattened into four separate wedges
  // on the radial hub — four of the dial's fourteen destinations spent on one arm
  // of the company, and the two longest names on the dial ("Adaptive
  // Intelligence", "RMH Deeplink") pushed into the ring with the least room for
  // them. The microsites live as tabs on /ventures and stay reachable directly.
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

/**
 * Canonical top-level sidebar navigation (client-safe). Single source of truth
 * for both the rendered rail (`components/feed/LeftSidebar`) and the reorder
 * editor (`components/site/SidebarEditMode`), so the two never drift.
 *
 * Each item has a stable `id`: leaves use their href (`/library`), groups use
 * `group:<name>` (`group:services`). The user's saved order + hidden set (see
 * `lib/home-widgets.ts` `SidebarPref` / `SIDEBAR_NAV_IDS`) is validated against
 * these ids, so renaming an id is a data migration — keep them stable.
 */
import {
  Home,
  Library,
  Atom,
  Brain,
  Wand2,
  ShieldCheck,
  TrendingUp,
  Inbox,
  Landmark,
  ShoppingBag,
  Compass,
  Users,
  Shield,
  Terminal,
  Car,
  Building2,
  Briefcase,
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

// Top-level nav. Singles stay flat; related destinations are merged into
// collapsible groups to keep the rail short. "Services" collects our real
// standalone product verticals (each gets equal billing as a group child);
// "RMH Ventures" collects the external brand/offering microsites. The order
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
  {
    id: 'group:services',
    group: 'services',
    tKey: 'nav-services',
    label: 'Services',
    icon: LayoutGrid,
    children: [
      { id: '/homes', href: '/homes', tKey: 'nav-homes', label: 'RMHHomes', icon: Building2 },
      { id: '/rmhladder', href: '/rmhladder', tKey: 'nav-rmhladder', label: 'RMHLadder', icon: Briefcase },
      { id: '/rideshare', href: '/rideshare', tKey: 'nav-rideshare', label: 'Rideshare', icon: Car },
    ],
  },
  {
    id: 'group:ventures',
    group: 'ventures',
    tKey: 'nav-ventures',
    label: 'RMH Ventures',
    icon: Rocket,
    children: [
      { id: '/rmh-capital', href: '/rmh-capital', tKey: 'nav-rmh-capital', label: 'RMH Capital', icon: Landmark },
      { id: '/rmh-pmc', href: '/rmh-pmc', tKey: 'nav-rmh-pmc', label: 'RMH PMC', icon: Shield },
      {
        id: '/adaptive-intelligence',
        href: '/adaptive-intelligence',
        tKey: 'nav-adaptive-intelligence',
        label: 'Adaptive Intelligence',
        icon: Atom,
      },
      {
        id: '/deeplink',
        href: '/deeplink',
        tKey: 'nav-rmh-deeplink',
        label: 'RMH Deeplink',
        icon: Brain,
        external: true,
      },
    ],
  },
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

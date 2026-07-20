/**
 * Home dashboard & sidebar customization (§15) — client-safe catalog, parsing,
 * and zod. Shared by the layout store, the settings editor, the home rail
 * render, and the sync API. No server imports so the settings UI + the parse
 * helpers can run anywhere.
 *
 * `parseLayoutPref` is intentionally forgiving: unknown widget kinds and
 * unknown sidebar ids are dropped at read time, so a stored layout survives an
 * app/widget being removed later (forward-safe — an acceptance criterion).
 */
import { z } from 'zod';

// ─── Home widgets ──────────────────────────────────────────────────────────

/** Every home-rail / pre-feed widget the user can order. */
export const WIDGET_KINDS = [
  'arcade', // Today's Arcade
  'streak', // Streak / daily wheel
  'continue', // Continue watching / playing (§5)
  'friends', // Friends online (§9)
  'ladder', // RMHLadder digest
  'livenow', // Live now
  'events', // Community events
  'wallet', // Wallet snapshot
] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

const WIDGET_KIND_SET = new Set<string>(WIDGET_KINDS);

export interface WidgetDef {
  kind: WidgetKind;
  /** English fallback label (i18n key is `widget-<kind>` in c-layout). */
  label: string;
  /** lucide-react icon name, resolved by the render surface. */
  iconName: string;
  /** In the default desktop rail stack. */
  defaultDesktop: boolean;
  /** In the (deliberately short) default mobile stack. */
  defaultMobile: boolean;
}

export const WIDGET_CATALOG: Record<WidgetKind, WidgetDef> = {
  arcade: { kind: 'arcade', label: "Today's Arcade", iconName: 'Gamepad2', defaultDesktop: true, defaultMobile: true },
  streak: { kind: 'streak', label: 'Streak & wheel', iconName: 'Flame', defaultDesktop: true, defaultMobile: true },
  continue: { kind: 'continue', label: 'Continue watching', iconName: 'History', defaultDesktop: true, defaultMobile: true },
  friends: { kind: 'friends', label: 'Friends', iconName: 'Users', defaultDesktop: true, defaultMobile: false },
  ladder: { kind: 'ladder', label: 'Ladder digest', iconName: 'Briefcase', defaultDesktop: true, defaultMobile: false },
  livenow: { kind: 'livenow', label: 'Live now', iconName: 'Radio', defaultDesktop: true, defaultMobile: false },
  events: { kind: 'events', label: 'Community events', iconName: 'CalendarDays', defaultDesktop: true, defaultMobile: false },
  wallet: { kind: 'wallet', label: 'Wallet', iconName: 'Coins', defaultDesktop: false, defaultMobile: false },
};

/** One entry in a user's ordered home stack. `collapsed` persists per widget. */
export interface HomeStackItem {
  kind: WidgetKind;
  collapsed?: boolean;
}

/** Default desktop rail order — reproduces today's layout. */
export const DEFAULT_HOME_STACK: HomeStackItem[] = WIDGET_KINDS.filter(
  (k) => WIDGET_CATALOG[k].defaultDesktop,
).map((kind) => ({ kind }));

/** Default mobile pre-feed stack — short, so the feed stays above the fold. */
export const DEFAULT_MOBILE_STACK: HomeStackItem[] = WIDGET_KINDS.filter(
  (k) => WIDGET_CATALOG[k].defaultMobile,
).map((kind) => ({ kind }));

const MAX_STACK = WIDGET_KINDS.length;

/**
 * Normalize a stored home stack: keep only known kinds, dedupe (first wins),
 * bound length. `[]` (empty / unset) yields the default desktop stack so an
 * unset row renders today's layout.
 */
export function parseHomeStack(raw: unknown): HomeStackItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_HOME_STACK;
  const seen = new Set<string>();
  const out: HomeStackItem[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_STACK) break;
    const kind = typeof entry === 'string' ? entry : (entry as { kind?: unknown })?.kind;
    if (typeof kind !== 'string' || !WIDGET_KIND_SET.has(kind) || seen.has(kind)) continue;
    seen.add(kind);
    const collapsed = typeof entry === 'object' && entry !== null && (entry as { collapsed?: unknown }).collapsed === true;
    out.push(collapsed ? { kind: kind as WidgetKind, collapsed: true } : { kind: kind as WidgetKind });
  }
  return out.length ? out : DEFAULT_HOME_STACK;
}

// ─── Sidebar pin/hide ──────────────────────────────────────────────────────

/**
 * The pin/hide-able sidebar destinations (hrefs), mirroring the "More" group
 * in components/feed/LeftSidebar. Kept here (client-safe) so both the editor
 * and the sidebar validate against one list; ids not in this set are dropped.
 * Home/Explore/Inbox/admin are intentionally NOT customizable (always present).
 */
export const SIDEBAR_NAV_IDS = [
  '/create',
  '/library',
  '/communities',
  '/store',
  '/arcade',
  '/predictions',
  '/leaderboard',
  '/spaces',
  '/events',
  '/market',
  '/creator-studio',
  '/help',
  '/playlists',
  '/homes',
  '/rmhladder',
  '/rideshare',
  '/developer',
  '/rmh-capital',
  '/rmh-pmc',
  '/rmh-internal-affairs',
  '/adaptive-intelligence',
  '/deeplink',
] as const;

const SIDEBAR_ID_SET = new Set<string>(SIDEBAR_NAV_IDS);

/**
 * Display metadata for the customizable sidebar destinations (English fallback
 * label + lucide icon name), mirroring components/feed/LeftSidebar's NAV. The
 * editor renders from this; i18n keys are `nav-*` in the `feed` namespace.
 */
export const SIDEBAR_NAV_META: Record<
  (typeof SIDEBAR_NAV_IDS)[number],
  { label: string; iconName: string; tKey: string }
> = {
  '/create': { label: 'Creator Studio', iconName: 'Wand2', tKey: 'nav-creator-studio' },
  '/library': { label: 'Library', iconName: 'Library', tKey: 'nav-library' },
  '/communities': { label: 'Communities', iconName: 'Users', tKey: 'nav-communities' },
  '/store': { label: 'Store', iconName: 'ShoppingBag', tKey: 'nav-store' },
  '/arcade': { label: 'Arcade', iconName: 'Gamepad2', tKey: 'nav-arcade' },
  '/predictions': { label: 'Predictions', iconName: 'TrendingUp', tKey: 'nav-predictions' },
  '/leaderboard': { label: 'Leaderboard', iconName: 'Trophy', tKey: 'nav-leaderboard' },
  '/spaces': { label: 'Spaces', iconName: 'Radio', tKey: 'nav-spaces' },
  '/events': { label: 'Events', iconName: 'CalendarDays', tKey: 'nav-events' },
  '/market': { label: 'Market', iconName: 'Store', tKey: 'nav-market' },
  '/creator-studio': { label: 'Studio', iconName: 'Coins', tKey: 'nav-studio' },
  '/help': { label: 'Help', iconName: 'HelpCircle', tKey: 'nav-help' },
  '/playlists': { label: 'Playlists', iconName: 'ListMusic', tKey: 'nav-playlists' },
  '/homes': { label: 'RMHHomes', iconName: 'Building2', tKey: 'nav-homes' },
  '/rmhladder': { label: 'RMHLadder', iconName: 'Briefcase', tKey: 'nav-rmhladder' },
  '/rideshare': { label: 'Rideshare', iconName: 'Car', tKey: 'nav-rideshare' },
  '/developer': { label: 'Developer', iconName: 'Terminal', tKey: 'nav-developer' },
  '/rmh-capital': { label: 'RMH Capital', iconName: 'Landmark', tKey: 'nav-rmh-capital' },
  '/rmh-pmc': { label: 'RMH PMC', iconName: 'Shield', tKey: 'nav-rmh-pmc' },
  '/rmh-internal-affairs': { label: 'Internal Affairs', iconName: 'Eye', tKey: 'nav-internal-affairs' },
  '/adaptive-intelligence': { label: 'Adaptive Intelligence', iconName: 'Atom', tKey: 'nav-adaptive-intelligence' },
  '/deeplink': { label: 'RMH Deeplink', iconName: 'Brain', tKey: 'nav-rmh-deeplink' },
};

export interface SidebarPref {
  /** Hrefs promoted into the main rail (out of "More"). */
  pinned: string[];
  /** Hrefs hidden from the rail (still reachable via "More"/palette/URL). */
  hidden: string[];
}

/** Normalize a stored sidebar pref: known ids only, deduped, pin wins over hide. */
export function parseSidebarPref(raw: unknown): SidebarPref {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as { pinned?: unknown; hidden?: unknown };
  const clean = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    for (const x of v) {
      if (typeof x === 'string' && SIDEBAR_ID_SET.has(x)) seen.add(x);
    }
    return [...seen];
  };
  const pinned = clean(obj.pinned);
  const pinnedSet = new Set(pinned);
  // A destination can't be both pinned and hidden — pin wins.
  const hidden = clean(obj.hidden).filter((h) => !pinnedSet.has(h));
  return { pinned, hidden };
}

export interface LayoutPref {
  sidebar: SidebarPref;
  homeStack: HomeStackItem[];
}

/** Parse a raw LayoutPreference row (or nothing) into applied, safe values. */
export function parseLayoutPref(input: { sidebar?: unknown; homeStack?: unknown } | null | undefined): LayoutPref {
  return {
    sidebar: parseSidebarPref(input?.sidebar),
    homeStack: parseHomeStack(input?.homeStack),
  };
}

// ─── zod (API) ─────────────────────────────────────────────────────────────

const homeStackItemSchema = z.object({
  kind: z.enum(WIDGET_KINDS),
  collapsed: z.boolean().optional(),
});

export const layoutPrefsSchema = z.object({
  sidebar: z
    .object({
      pinned: z.array(z.enum(SIDEBAR_NAV_IDS)).max(SIDEBAR_NAV_IDS.length).optional(),
      hidden: z.array(z.enum(SIDEBAR_NAV_IDS)).max(SIDEBAR_NAV_IDS.length).optional(),
    })
    .optional(),
  homeStack: z.array(homeStackItemSchema).max(MAX_STACK).optional(),
});

export type LayoutPrefsInput = z.infer<typeof layoutPrefsSchema>;

/** localStorage mirror keys (flash-free first paint, appearance pattern). */
export const LAYOUT_SIDEBAR_KEY = 'rmh-layout-sidebar';
export const LAYOUT_HOMESTACK_KEY = 'rmh-layout-homestack';

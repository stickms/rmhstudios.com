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
 * The reorderable top-level sidebar tabs (ids), mirroring the top-level nav in
 * `lib/sidebar-nav.ts`. Kept here (client-safe, no icon imports) so the editor,
 * the sidebar, and the sync API all validate against one list; ids not in this
 * set are dropped at read time (forward-safe). Leaf ids are hrefs; group ids are
 * `group:<name>`. Admin is intentionally excluded — it's always pinned to the
 * bottom of the rail, never reordered or hidden.
 */
export const SIDEBAR_NAV_IDS = [
  '/',
  '/search',
  '/messages',
  '/create',
  '/library',
  '/communities',
  '/store',
  '/arcade',
  '/predictions',
  '/developer',
  'group:services',
  'group:ventures',
] as const;

const SIDEBAR_ID_SET = new Set<string>(SIDEBAR_NAV_IDS);

/**
 * Which tabs may be hidden from the rail. Home is always present (never strand
 * the feed) and groups aren't individually hideable — only leaf destinations,
 * which stay reachable via the command palette and their URL when hidden (§2.6).
 */
export const SIDEBAR_HIDEABLE_IDS = [
  '/search',
  '/messages',
  '/create',
  '/library',
  '/communities',
  '/store',
  '/arcade',
  '/predictions',
  '/developer',
] as const;

const SIDEBAR_HIDEABLE_SET = new Set<string>(SIDEBAR_HIDEABLE_IDS);

export interface SidebarPref {
  /** Tab ids promoted into the main rail (reserved; see nav pin buttons). */
  pinned: string[];
  /** Tab ids hidden from the rail (still reachable via palette/URL). */
  hidden: string[];
  /** Full top-level tab order; [] = the default order in `SIDEBAR_NAV`. */
  order: string[];
}

/**
 * Normalize a stored sidebar pref: known ids only, order-preserving dedupe, pin
 * wins over hide. `order` is validated against the full orderable set; `hidden`
 * against the hideable subset only.
 */
export function parseSidebarPref(raw: unknown): SidebarPref {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as {
    pinned?: unknown;
    hidden?: unknown;
    order?: unknown;
  };
  const clean = (v: unknown, allowed: Set<string>): string[] => {
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of v) {
      if (typeof x === 'string' && allowed.has(x) && !seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  };
  const order = clean(obj.order, SIDEBAR_ID_SET);
  const pinned = clean(obj.pinned, SIDEBAR_ID_SET);
  const pinnedSet = new Set(pinned);
  // A destination can't be both pinned and hidden — pin wins.
  const hidden = clean(obj.hidden, SIDEBAR_HIDEABLE_SET).filter((h) => !pinnedSet.has(h));
  return { pinned, hidden, order };
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
      hidden: z.array(z.enum(SIDEBAR_HIDEABLE_IDS)).max(SIDEBAR_HIDEABLE_IDS.length).optional(),
      order: z.array(z.enum(SIDEBAR_NAV_IDS)).max(SIDEBAR_NAV_IDS.length).optional(),
    })
    .optional(),
  homeStack: z.array(homeStackItemSchema).max(MAX_STACK).optional(),
});

export type LayoutPrefsInput = z.infer<typeof layoutPrefsSchema>;

/** localStorage mirror keys (flash-free first paint, appearance pattern). */
export const LAYOUT_SIDEBAR_KEY = 'rmh-layout-sidebar';
export const LAYOUT_HOMESTACK_KEY = 'rmh-layout-homestack';

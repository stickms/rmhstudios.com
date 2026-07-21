import { create } from 'zustand';
import {
  parseLayoutPref,
  type HomeStackItem,
  type SidebarPref,
  type WidgetKind,
  LAYOUT_SIDEBAR_KEY,
  LAYOUT_HOMESTACK_KEY,
} from '@/lib/home-widgets';

/**
 * Layout customization store (§15) — the applied sidebar pin/hide + home widget
 * stack. Same lifecycle as the theme/nav stores: a localStorage mirror is read
 * synchronously on `hydrate()` (flash-free first paint) and the account row is
 * fetched right after (cross-device source of truth). Mutations persist to both
 * the mirror and `/api/preferences/layout`. Signed-out users keep the mirror
 * only; it syncs up on their next save while signed in.
 */

function readMirror<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeMirror(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / storage disabled */
  }
}

async function persist(body: { sidebar?: SidebarPref; homeStack?: HomeStackItem[] }) {
  try {
    await fetch('/api/preferences/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    /* best-effort — the mirror already reflects the change locally */
  }
}

interface LayoutStore {
  sidebar: SidebarPref;
  homeStack: HomeStackItem[];
  hydrated: boolean;
  /** Read the mirror synchronously, then reconcile with the account row. */
  hydrate: () => void;
  togglePin: (id: string) => void;
  toggleHidden: (id: string) => void;
  /** Persist a new full top-level sidebar tab order. */
  setSidebarOrder: (order: string[]) => void;
  /** Clear sidebar order + hidden back to the default rail. */
  resetSidebar: () => void;
  setHomeStack: (stack: HomeStackItem[]) => void;
  addWidget: (kind: WidgetKind) => void;
  removeWidget: (kind: WidgetKind) => void;
  toggleCollapsed: (kind: WidgetKind) => void;
}

const DEFAULT_SIDEBAR: SidebarPref = { pinned: [], hidden: [], order: [] };

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  sidebar: DEFAULT_SIDEBAR,
  homeStack: [],
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    // Synchronous mirror read first (no flash), normalized through the parser.
    const applied = parseLayoutPref({
      sidebar: readMirror<unknown>(LAYOUT_SIDEBAR_KEY, {}),
      homeStack: readMirror<unknown>(LAYOUT_HOMESTACK_KEY, []),
    });
    set({ sidebar: applied.sidebar, homeStack: applied.homeStack, hydrated: true });
    // Then reconcile with the account (cross-device). 401 for signed-out is fine.
    fetch('/api/preferences/layout')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sidebar?: unknown; homeStack?: unknown } | null) => {
        if (!d) return;
        const server = parseLayoutPref(d);
        writeMirror(LAYOUT_SIDEBAR_KEY, server.sidebar);
        writeMirror(LAYOUT_HOMESTACK_KEY, server.homeStack);
        set({ sidebar: server.sidebar, homeStack: server.homeStack });
      })
      .catch(() => {});
  },

  togglePin: (id) => {
    const { pinned, hidden, order } = get().sidebar;
    const next: SidebarPref = pinned.includes(id)
      ? { pinned: pinned.filter((p) => p !== id), hidden, order }
      : // Pinning implies un-hiding (can't be both).
        { pinned: [...pinned, id], hidden: hidden.filter((h) => h !== id), order };
    writeMirror(LAYOUT_SIDEBAR_KEY, next);
    set({ sidebar: next });
    void persist({ sidebar: next });
  },

  toggleHidden: (id) => {
    const { pinned, hidden, order } = get().sidebar;
    const next: SidebarPref = hidden.includes(id)
      ? { pinned, hidden: hidden.filter((h) => h !== id), order }
      : { pinned: pinned.filter((p) => p !== id), hidden: [...hidden, id], order };
    writeMirror(LAYOUT_SIDEBAR_KEY, next);
    set({ sidebar: next });
    void persist({ sidebar: next });
  },

  setSidebarOrder: (order) => {
    const next: SidebarPref = { ...get().sidebar, order };
    writeMirror(LAYOUT_SIDEBAR_KEY, next);
    set({ sidebar: next });
    void persist({ sidebar: next });
  },

  resetSidebar: () => {
    const next: SidebarPref = { pinned: [], hidden: [], order: [] };
    writeMirror(LAYOUT_SIDEBAR_KEY, next);
    set({ sidebar: next });
    void persist({ sidebar: next });
  },

  setHomeStack: (stack) => {
    writeMirror(LAYOUT_HOMESTACK_KEY, stack);
    set({ homeStack: stack });
    void persist({ homeStack: stack });
  },

  addWidget: (kind) => {
    const stack = get().homeStack;
    if (stack.some((w) => w.kind === kind)) return;
    get().setHomeStack([...stack, { kind }]);
  },

  removeWidget: (kind) => {
    get().setHomeStack(get().homeStack.filter((w) => w.kind !== kind));
  },

  toggleCollapsed: (kind) => {
    get().setHomeStack(
      get().homeStack.map((w) => (w.kind === kind ? { ...w, collapsed: !w.collapsed } : w)),
    );
  },
}));

'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSession } from '@/components/Providers';
import { SIDEBAR_NAV, isNavGroup, type NavLeaf } from '@/lib/sidebar-nav';
import { useDesktopNavStore } from '@/stores/desktopNavStore';

/**
 * The width at which the shell grows its left track — must match the
 * `min-width: 1120px` queries around `.rad-rail` in radial.css. At and above it
 * the desktop-navigation setting (`stores/desktopNavStore.ts`) decides what
 * fills that track: the docked globe, or the text rail.
 */
export const DOCK_QUERY = '(min-width: 1120px)';

/**
 * Whether the globe is docked right now, read straight from the document (the
 * pre-paint attribute + the viewport), for code that runs outside React's render
 * — the hub's warm-up asks this before rehearsing a second globe.
 */
export function isGlobeDocked(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    document.documentElement.getAttribute('data-desktop-nav') !== 'rail' &&
    window.matchMedia?.(DOCK_QUERY).matches === true
  );
}

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia?.(DOCK_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}
const wideSnapshot = () => window.matchMedia?.(DOCK_QUERY).matches === true;
const wideServerSnapshot = () => false;

/** Reactive {@link isGlobeDocked}: false on the server and until the setting has hydrated. */
export function useGlobeDocked(): boolean {
  const hydrate = useDesktopNavStore((s) => s.hydrate);
  const hydrated = useDesktopNavStore((s) => s.hydrated);
  const mode = useDesktopNavStore((s) => s.mode);
  useEffect(() => hydrate(), [hydrate]);
  const wide = useSyncExternalStore(subscribeWide, wideSnapshot, wideServerSnapshot);
  return hydrated && wide && mode === 'globe';
}

type GlobeUser = { isAdmin?: boolean };

/** The globe's destinations: every nav leaf, flattened, filtered for auth/admin. */
export function useGlobeDestinations(): NavLeaf[] {
  const { data: session } = useSession();
  const isAdmin = Boolean((session?.user as GlobeUser | undefined)?.isAdmin);
  return useMemo<NavLeaf[]>(() => {
    const out: NavLeaf[] = [];
    for (const item of SIDEBAR_NAV) {
      if (isNavGroup(item)) out.push(...item.children);
      else out.push(item);
    }
    return out.filter((leaf) => {
      if (leaf.requiresAuth && !session) return false;
      if (leaf.requiresAdmin && !isAdmin) return false;
      return true;
    });
  }, [session, isAdmin]);
}

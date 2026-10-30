/**
 * Maps a pathname to the catalog title it belongs to. One matcher for everything
 * that needs "which game or app is this page?" — the Recents tracker and the
 * playtime heartbeat — so the two can never disagree about it.
 *
 * Pure and client-safe (reads the static catalogs only).
 */

import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

export type CatalogRoute = {
  id: string;
  href: string;
  title: string;
  kind: 'game' | 'app';
  gradient: string;
  image?: string;
};

// Longest hrefs first so e.g. /rmhtube/$room matches before a shorter prefix.
const ENTRIES: CatalogRoute[] = [
  ...games
    .filter((g) => !g.unlisted && g.href.startsWith('/'))
    .map((g) => ({
      id: g.id,
      href: g.href,
      title: g.title,
      gradient: g.gradient,
      image: g.imagePath,
      kind: 'game' as const,
    })),
  ...apps
    .filter((a) => !a.hidden && !a.unlisted && a.href.startsWith('/'))
    .map((a) => ({
      id: a.id,
      href: a.href,
      title: a.title,
      gradient: a.gradient,
      image: a.imagePath,
      kind: 'app' as const,
    })),
].sort((a, b) => b.href.length - a.href.length);

/**
 * The title a pathname belongs to, or null. The library (`/games` and anything
 * under it) never matches: a title's hub page is not the title being played.
 */
export function matchCatalogRoute(pathname: string): CatalogRoute | null {
  if (pathname === '/games' || pathname.startsWith('/games/')) return null;
  return (
    ENTRIES.find((e) => pathname === e.href || pathname.startsWith(e.href + '/')) ?? null
  );
}

/** Whether an id names a listed, on-site title — the only kind that accrues playtime. */
export function isTrackableTitle(id: string): boolean {
  return ENTRIES.some((e) => e.id === id);
}

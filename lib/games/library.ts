/**
 * The games library's pure model: what the rail lists, in what order, and which
 * image the detail hero shows. No React, no I/O — safe on server and client.
 */

import type { CuratedBuild } from '@/lib/builds/curated';

export type LibraryKind = 'all' | 'game' | 'app';

export type RailQuery = { kind: LibraryKind; search: string };

/** Filter the rail by kind and a case-insensitive search over title and tags. */
export function filterRail(items: CuratedBuild[], q: RailQuery): CuratedBuild[] {
  const needle = q.search.trim().toLowerCase();
  return items.filter((b) => {
    if (q.kind !== 'all' && b.kind !== q.kind) return false;
    if (!needle) return true;
    return (
      b.title.toLowerCase().includes(needle) || b.tags.some((t) => t.toLowerCase().includes(needle))
    );
  });
}

/** Recents first, in the order given (unknown ids skipped); the rest A-Z by title. */
export function groupRail(
  items: CuratedBuild[],
  recentIds: string[],
): { recent: CuratedBuild[]; rest: CuratedBuild[] } {
  const byId = new Map(items.map((b) => [b.id, b]));
  const recent = recentIds.flatMap((id) => {
    const b = byId.get(id);
    return b ? [b] : [];
  });
  const recentSet = new Set(recent.map((b) => b.id));
  const rest = items
    .filter((b) => !recentSet.has(b.id))
    .sort((a, b) => a.title.localeCompare(b.title));
  return { recent, rest };
}

export type HeroSource = { kind: 'banner' | 'cropped-card' | 'tile'; src: string | null; hue: number };

/** Banner, else the portrait card image cropped, else the hue tile. */
export function heroSource(b: CuratedBuild): HeroSource {
  if (b.bannerUrl) return { kind: 'banner', src: b.bannerUrl, hue: b.hue };
  if (b.thumbnailUrl) return { kind: 'cropped-card', src: b.thumbnailUrl, hue: b.hue };
  return { kind: 'tile', src: null, hue: b.hue };
}

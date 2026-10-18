/**
 * P1 — Top Four: resolving a pinned (kind, id) pair against the game and app
 * catalogs. The catalogs (`lib/games.ts`, `lib/apps.ts`) are the single source
 * of truth for what exists, so a stored id that has since been removed or hidden
 * simply stops resolving and is dropped — nothing is copied into the profile.
 *
 * Library items and albums were considered and left out: the library is
 * per-member private storage and albums are an admin-curated set with no public
 * picker, so neither has anything a visitor could be sent to.
 */
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { TOP_FOUR_SIZE, type TopFourItem } from '@/lib/profile/modules';

export interface TopFourEntry {
  kind: TopFourItem['kind'];
  id: string;
  title: string;
  href: string;
  imagePath: string | null;
  /** A Lucide icon name, for entries with no image. */
  iconName: string;
}

export function resolveTopFourItem(item: TopFourItem): TopFourEntry | null {
  const source = item.kind === 'game' ? games : apps;
  const entry = source.find((e) => e.id === item.id);
  if (!entry || entry.unlisted || ('hidden' in entry && entry.hidden)) return null;
  return {
    kind: item.kind,
    id: entry.id,
    title: entry.title,
    href: entry.href,
    imagePath: entry.imagePath ?? null,
    iconName: entry.iconName,
  };
}

/** Resolve a stored list: unknown entries dropped, duplicates removed, capped at four. */
export function resolveTopFour(items: readonly TopFourItem[]): TopFourEntry[] {
  const seen = new Set<string>();
  const out: TopFourEntry[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    const resolved = resolveTopFourItem(item);
    if (!resolved) continue;
    seen.add(key);
    out.push(resolved);
    if (out.length >= TOP_FOUR_SIZE) break;
  }
  return out;
}

/** Everything a member can pick from, for the editor. Sorted by title. */
export function topFourChoices(): TopFourEntry[] {
  const all: TopFourEntry[] = [];
  for (const entry of games) {
    const r = resolveTopFourItem({ kind: 'game', id: entry.id });
    if (r) all.push(r);
  }
  for (const entry of apps) {
    const r = resolveTopFourItem({ kind: 'app', id: entry.id });
    if (r) all.push(r);
  }
  return all.sort((a, b) => a.title.localeCompare(b.title));
}

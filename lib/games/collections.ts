/**
 * Library collections as pure rules: names, the reserved Favorites, and grouping rows
 * for display. Client-safe. A collection exists while it holds at least one title.
 */

/** The built-in collection's key; its label is translated by the UI. */
export const FAVORITES = 'favorites';
export const MAX_NAME = 40;
export const MAX_COLLECTIONS = 20;
export const MAX_ITEMS = 200;

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'too-long' | 'reserved' };

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

export function normalizeCollectionName(raw: string): NameCheck {
  const name = raw.replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  if (name.length === 0) return { ok: false, reason: 'empty' };
  if (name.length > MAX_NAME) return { ok: false, reason: 'too-long' };
  if (name.toLowerCase() === FAVORITES) return { ok: false, reason: 'reserved' };
  return { ok: true, name };
}

export type Collection = { name: string; ids: string[] };

/** Favorites first, then the rest A to Z (case-insensitive); titles sorted, no repeats. */
export function groupCollections(rows: readonly { collection: string; gameId: string }[]): Collection[] {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = map.get(r.collection) ?? new Set<string>();
    set.add(r.gameId);
    map.set(r.collection, set);
  }
  return [...map.entries()]
    .map(([name, ids]) => ({ name, ids: [...ids].sort() }))
    .sort((a, b) => {
      if (a.name === FAVORITES) return -1;
      if (b.name === FAVORITES) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
}

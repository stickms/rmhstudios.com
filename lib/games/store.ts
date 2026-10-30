/**
 * The games Store front as pure rules: tag counts, search and tag filtering, and ranking
 * what to feature from play and ratings. No I/O, client-safe. Nothing here costs money:
 * the Store is for discovery.
 */

export type StoreItem = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  kind: 'game' | 'app';
};

/** A rating counts toward featuring only with at least this many reviews. */
export const MIN_REVIEWS_TO_RANK = 3;

export function tagCounts(items: readonly StoreItem[]): { tag: string; count: number }[] {
  const byLower = new Map<string, { tag: string; titles: Set<string> }>();
  for (const it of items) {
    for (const raw of it.tags) {
      const k = raw.toLowerCase();
      const entry = byLower.get(k) ?? { tag: raw, titles: new Set<string>() };
      entry.titles.add(it.id);
      byLower.set(k, entry);
    }
  }
  return [...byLower.values()]
    .map((e) => ({ tag: e.tag, count: e.titles.size }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function filterStore(
  items: readonly StoreItem[],
  q: { tag?: string; q?: string },
): StoreItem[] {
  const tag = q.tag?.trim().toLowerCase();
  const text = q.q?.trim().toLowerCase();
  return items.filter((it) => {
    if (tag && !it.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (text) {
      const hay = `${it.title} ${it.description} ${it.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

/**
 * What to feature: most-played first (players over the last two weeks), nudged up by a
 * strong rating; titles with no signal follow in catalog order. Stable and repeat-free.
 */
export function rankFeatured(
  items: readonly StoreItem[],
  signal: {
    players: ReadonlyMap<string, number>;
    ratings: ReadonlyMap<string, { average: number; count: number }>;
  },
  limit = 5,
): StoreItem[] {
  const score = (it: StoreItem) => {
    const players = signal.players.get(it.id) ?? 0;
    const r = signal.ratings.get(it.id);
    const rating = r && r.count >= MIN_REVIEWS_TO_RANK ? r.average : 0;
    return players + rating * 2;
  };
  return items
    .map((it, order) => ({ it, order, s: score(it) }))
    .sort((a, b) => b.s - a.s || a.order - b.order)
    .slice(0, limit)
    .map((x) => x.it);
}

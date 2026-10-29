/**
 * The figures on a section card, read live instead of typed in.
 *
 * The static cards carried literals — "18 games", "12 apps" — which were right the day they were drawn and wrong as
 * soon as the catalog moved: the home card said eighteen while `/games` listed twenty-five. A section card is now
 * rendered on request (`/api/og/section/$file`), so its numbers come from the same places the pages' own numbers do.
 *
 * Catalog figures are free (they are already in memory). The one database figure — public communities — is memoised
 * for ten minutes, because a card is fetched by every crawler on every share and a COUNT is not worth running that
 * often. A figure that cannot be read falls back to the entry's own literal, so a card never loses a chip because a
 * query failed.
 */
import { prisma } from '@/lib/prisma.server';
import { catalogStatsFor } from '@/lib/og/catalog-stats';
import type { Stat } from '@/lib/og/chrome.server';
import type { StaticCard } from '@/lib/og/static-cards';

const TTL_MS = 10 * 60 * 1000;
let communities: { at: number; value: number } | null = null;

async function publicCommunityCount(): Promise<number | null> {
  if (communities && Date.now() - communities.at < TTL_MS) return communities.value;
  try {
    const value = await prisma.community.count({ where: { isPrivate: false } });
    communities = { at: Date.now(), value };
    return value;
  } catch {
    return communities?.value ?? null;
  }
}

/** The figures to draw on a section card: live where the page has a countable inventory, else the entry's own. */
export async function liveStatsFor(card: StaticCard): Promise<Stat[] | undefined> {
  const fromCatalog = catalogStatsFor(card.file);
  if (fromCatalog) return fromCatalog;
  if (card.file === 'communities') {
    const n = await publicCommunityCount();
    if (n != null && n > 0) return [{ value: String(n), label: n === 1 ? 'community' : 'communities', lead: true }];
  }
  return card.stats;
}

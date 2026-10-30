import { prisma } from '@/lib/prisma.server';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { MAX_DROPS_PER_TITLE } from '@/lib/cards/cards';
import { listBadges, listCards } from '@/lib/cards/cards.server';
import { getGems } from '@/lib/cards/gems.server';
import { getBalance } from '@/lib/economy/ledger.server';
import { isTrackableTitle } from '@/lib/games/route-match';
import type { InventoryData, InventoryGroup } from '@/lib/cards/types';

/** The viewer's own cards and badges, grouped by title (titles they hold something for). */
export async function getInventory(userId: string): Promise<InventoryData> {
  const [stacks, badges, drops, gems, coins] = await Promise.all([
    listCards(userId),
    listBadges(userId),
    prisma.cardDrop.groupBy({ by: ['gameId'], where: { userId }, _count: { dropIndex: true } }),
    getGems(userId),
    getBalance(userId),
  ]);
  const titles = new Map(listCuratedBuilds().map((b) => [b.id, b]));
  const dropped = new Map(drops.map((d) => [d.gameId, d._count.dropIndex]));
  const byGame = new Map<string, InventoryGroup>();

  const group = (gameId: string): InventoryGroup | null => {
    const existing = byGame.get(gameId);
    if (existing) return existing;
    const title = titles.get(gameId);
    if (!title) return null;
    const g: InventoryGroup = {
      gameId,
      title: title.title,
      hue: title.hue,
      cards: [],
      badgeLevel: 0,
      foilBadge: false,
      dropsRemaining: Math.max(0, MAX_DROPS_PER_TITLE - (dropped.get(gameId) ?? 0)),
    };
    byGame.set(gameId, g);
    return g;
  };

  let totalCards = 0;
  for (const s of stacks) {
    const g = group(s.gameId);
    if (!g) continue;
    g.cards.push({ cardIndex: s.cardIndex, foil: s.foil, count: s.count });
    totalCards += s.count;
  }
  for (const b of badges) {
    const g = group(b.gameId);
    if (!g) continue;
    if (b.foil) g.foilBadge = true;
    else g.badgeLevel = b.level;
  }
  return {
    groups: [...byGame.values()].sort((a, b) => a.title.localeCompare(b.title)),
    totalCards,
    gems,
    coins,
    packTitles: [...titles.values()]
      .filter((b) => isTrackableTitle(b.id))
      .map((b) => ({ id: b.id, title: b.title }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
}

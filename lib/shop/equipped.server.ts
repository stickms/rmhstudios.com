/**
 * Resolve a user's equipped cosmetics into a render-ready shape for display
 * across profiles and posts. DB-backed; the pure mapping lives in `equipped.ts`.
 */

import { prisma } from '@/lib/prisma.server';
import { resolveEquippedCosmetics, type EquippedCosmetics } from '@/lib/shop/equipped';

export type { EquippedCosmetics };

export async function getEquippedCosmetics(userId: string): Promise<EquippedCosmetics> {
  const rows = await prisma.userInventory.findMany({
    where: { userId, equipped: true },
    select: { itemId: true },
  });
  return resolveEquippedCosmetics(rows.map((r) => r.itemId));
}

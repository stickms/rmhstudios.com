/**
 * Resolve a user's equipped cosmetics into a render-ready shape for display
 * across profiles and posts.
 */

import { prisma } from '@/lib/prisma.server';
import { getShopItem, type ShopItem } from '@/lib/shop/catalog';

export interface EquippedCosmetics {
  nameColor?: { color?: string; gradient?: string };
  avatarFrame?: { color?: string; gradient?: string };
  badge?: { emoji?: string };
  banner?: { gradient?: string };
  postFlair?: { className?: string; color?: string; gradient?: string };
  pet?: { emoji?: string };
}

function applyItem(out: EquippedCosmetics, item: ShopItem) {
  switch (item.kind) {
    case 'NAME_COLOR':
      out.nameColor = { color: item.data.color, gradient: item.data.gradient };
      break;
    case 'AVATAR_FRAME':
      out.avatarFrame = { color: item.data.color, gradient: item.data.gradient };
      break;
    case 'BADGE':
      out.badge = { emoji: item.data.emoji };
      break;
    case 'BANNER':
      out.banner = { gradient: item.data.gradient };
      break;
    case 'POST_FLAIR':
      out.postFlair = { className: item.data.className, color: item.data.color, gradient: item.data.gradient };
      break;
    case 'PET':
      out.pet = { emoji: item.data.emoji };
      break;
    default:
      break;
  }
}

export async function getEquippedCosmetics(userId: string): Promise<EquippedCosmetics> {
  const rows = await prisma.userInventory.findMany({
    where: { userId, equipped: true },
    select: { itemId: true },
  });
  const out: EquippedCosmetics = {};
  for (const r of rows) {
    const item = getShopItem(r.itemId);
    if (item) applyItem(out, item);
  }
  return out;
}

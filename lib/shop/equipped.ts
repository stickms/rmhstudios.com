/**
 * Pure (no-DB) resolution of equipped cosmetics into a render-ready shape.
 *
 * Kept free of server-only imports so it can be used both in server queries
 * (where equipped inventory rows are joined in) and shared display resolvers.
 * The async, DB-backed variant lives in `equipped.server.ts`.
 */

import { getShopItem, type ShopItem } from '@/lib/shop/catalog';

export interface EquippedCosmetics {
  nameColor?: { color?: string; gradient?: string };
  avatarFrame?: { color?: string; gradient?: string };
  badge?: { emoji?: string };
  banner?: { gradient?: string };
  postFlair?: { className?: string; color?: string; gradient?: string };
  pet?: { emoji?: string };
}

export function applyItem(out: EquippedCosmetics, item: ShopItem) {
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

/** Map a list of equipped catalog item ids into a render-ready cosmetics object. */
export function resolveEquippedCosmetics(itemIds: string[]): EquippedCosmetics {
  const out: EquippedCosmetics = {};
  for (const id of itemIds) {
    const item = getShopItem(id);
    if (item) applyItem(out, item);
  }
  return out;
}

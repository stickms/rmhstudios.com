import type { AdditiveId, InputId } from './types';
import { ADDITIVES, INPUTS } from './content';

export const BASE_PRICE = 10;

export type ShopItemKind = 'additive' | 'base' | 'input';
export interface ShopItem { kind: ShopItemKind; refId: string; rankReq: number; }
export interface Shop { id: string; name: string; items: ShopItem[]; }

export const SHOPS: Record<string, Shop> = {
  supplier: {
    id: 'supplier', name: 'Supplier',
    items: [
      { kind: 'base', refId: 'greenstart', rankReq: 0 },
      { kind: 'input', refId: 'nutrient', rankReq: 0 },
      { kind: 'additive', refId: 'cuke', rankReq: 0 },
      { kind: 'additive', refId: 'banana', rankReq: 0 },
      { kind: 'additive', refId: 'paracetamol', rankReq: 0 },
      { kind: 'additive', refId: 'chili', rankReq: 0 },
      { kind: 'input', refId: 'seed_couchlock', rankReq: 1 },
      { kind: 'additive', refId: 'mouthwash', rankReq: 1 },
      { kind: 'additive', refId: 'donut', rankReq: 2 },
      { kind: 'input', refId: 'seed_zoomhaze', rankReq: 2 },
      { kind: 'additive', refId: 'battery', rankReq: 3 },
      { kind: 'additive', refId: 'energydrink', rankReq: 3 },
      { kind: 'input', refId: 'reagent', rankReq: 3 },
    ],
  },
};

export function shopItemPrice(item: ShopItem): number {
  if (item.kind === 'base') return BASE_PRICE;
  if (item.kind === 'additive') return ADDITIVES[item.refId as AdditiveId].cost;
  return INPUTS[item.refId as InputId].cost;
}

export function visibleItems(shop: Shop, rank: number): ShopItem[] {
  return shop.items.filter((i) => rank >= i.rankReq);
}

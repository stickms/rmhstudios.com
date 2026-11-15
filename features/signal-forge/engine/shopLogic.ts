/**
 * shopLogic.ts — Shop inventory generation for Signal Forge
 *
 * Generates the shop inventory for a given floor, including cards, relics,
 * and service items (remove/upgrade). Costs scale with floor progression.
 */

import { createShopCard } from './Card';
import { createShopRelics } from './Relic';
import type { ShopItem } from './GameTypes';

/**
 * Generate shop inventory for a given floor.
 * @param floor - Current floor number
 * @param seedOffset - Optional seed offset for shop refresh variety
 * @returns Array of ShopItem entries
 */
export function generateShopInventory(floor: number, seedOffset: number = 0): ShopItem[] {
  const inventory: ShopItem[] = [];
  let itemId = 0;
  const costScale = 1 + (floor - 1) * 0.08;

  // Cards — more offerings at higher floors
  const cardCount = Math.min(3 + Math.floor((floor - 1) / 2), 6);
  const rarities: Array<'common' | 'uncommon' | 'rare'> = ['common', 'uncommon', 'rare'];
  for (let i = 0; i < cardCount; i++) {
    const card = createShopCard(floor, floor * 1000 + 500 + i + seedOffset * 7919, rarities[i % rarities.length]);
    const basePrices = { common: 40, uncommon: 70, rare: 110 };
    inventory.push({
      id: `card_${itemId++}`,
      type: 'card',
      item: card,
      price: Math.round((basePrices[card.rarity as keyof typeof basePrices] ?? 70) * costScale),
    });
  }

  // Relics — more at higher floors
  const relicCount = Math.min(2 + Math.floor((floor - 1) / 3), 4);
  const relics = createShopRelics(floor, relicCount, seedOffset);
  for (const relic of relics) {
    inventory.push({
      id: `relic_${itemId++}`,
      type: 'relic',
      item: relic,
      price: Math.round(120 * costScale),
    });
  }

  // Upgrade and removal are always available — price computed dynamically in UI
  inventory.push({ id: 'upgrade', type: 'upgrade', item: null, price: 0 });
  inventory.push({ id: 'removal', type: 'removal', item: null, price: 0 });

  return inventory;
}

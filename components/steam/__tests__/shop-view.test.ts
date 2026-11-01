import { describe, expect, it } from 'vitest';
import { canBuy, visibleShopItems, type SteamShopItem } from '../shop-view';

const item = (o: Partial<SteamShopItem>): SteamShopItem => ({
  id: 'x',
  kind: 'BADGE',
  name: 'X',
  description: '',
  price: 100,
  rarity: 'common',
  data: {},
  owned: false,
  equipped: false,
  ...o,
});

describe('visibleShopItems', () => {
  it('keeps one kind, ordered by rarity then price, without mutating the input', () => {
    const input = [
      item({ id: 'rare', rarity: 'rare', price: 10 }),
      item({ id: 'c-dear', rarity: 'common', price: 300 }),
      item({ id: 'c-cheap', rarity: 'common', price: 50 }),
      item({ id: 'other', kind: 'PET' }),
    ];
    const ids = input.map((i) => i.id);
    expect(visibleShopItems(input, 'BADGE').map((i) => i.id)).toEqual(['c-cheap', 'c-dear', 'rare']);
    expect(input.map((i) => i.id)).toEqual(ids);
  });
});

describe('canBuy', () => {
  it('checks signed-out, then owned, then coins', () => {
    expect(canBuy(item({ owned: true }), 0, false)).toBe('signed-out');
    expect(canBuy(item({ owned: true }), 0, true)).toBe('owned');
    expect(canBuy(item({ price: 100 }), 99, true)).toBe('poor');
    expect(canBuy(item({ price: 100 }), 100, true)).toBe('ok');
  });
});

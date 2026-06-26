import { describe, it, expect } from 'vitest';
import { SHOPS, shopItemPrice, visibleItems, BASE_PRICE } from '../shops';
import { ADDITIVES, INPUTS, BASES } from '../content';

describe('SHOPS catalog', () => {
  it('has a supplier shop whose items all reference valid content + non-negative rankReq', () => {
    const supplier = SHOPS.supplier;
    expect(supplier).toBeDefined();
    for (const item of supplier.items) {
      expect(item.rankReq).toBeGreaterThanOrEqual(0);
      if (item.kind === 'base') expect(BASES[item.refId as keyof typeof BASES]).toBeDefined();
      if (item.kind === 'additive') expect(ADDITIVES[item.refId as keyof typeof ADDITIVES]).toBeDefined();
      if (item.kind === 'input') expect(INPUTS[item.refId as keyof typeof INPUTS]).toBeDefined();
    }
  });
  it('has at least one rank-gated (rankReq > 0) item to drive progression', () => {
    expect(SHOPS.supplier.items.some((i) => i.rankReq > 0)).toBe(true);
  });
});

describe('shopItemPrice', () => {
  it('uses BASE_PRICE for base and content cost otherwise', () => {
    expect(shopItemPrice({ kind: 'base', refId: 'greenstart', rankReq: 0 })).toBe(BASE_PRICE);
    expect(shopItemPrice({ kind: 'additive', refId: 'cuke', rankReq: 0 })).toBe(ADDITIVES.cuke.cost);
    expect(shopItemPrice({ kind: 'input', refId: 'nutrient', rankReq: 0 })).toBe(INPUTS.nutrient.cost);
  });
});

describe('visibleItems', () => {
  it('filters by rank', () => {
    const shop = { id: 's', name: 'S', items: [
      { kind: 'additive' as const, refId: 'cuke', rankReq: 0 },
      { kind: 'additive' as const, refId: 'battery', rankReq: 2 },
    ] };
    expect(visibleItems(shop, 0).map((i) => i.refId)).toEqual(['cuke']);
    expect(visibleItems(shop, 2).map((i) => i.refId)).toEqual(['cuke', 'battery']);
  });
});

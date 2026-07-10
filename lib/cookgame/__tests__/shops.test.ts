import { describe, it, expect } from 'vitest';
import { SHOPS, shopItemPrice, visibleItems, BASE_PRICE, KEY_PRICES, NIGHT_WINDOW } from '../shops';
import { ADDITIVES, INPUTS, BASES } from '../content';
import { DAY_LENGTH_MS } from '../timeOfDay';

describe('SHOPS catalog', () => {
  it('has a supplier shop whose items all reference valid content + non-negative rankReq', () => {
    const supplier = SHOPS.supplier;
    expect(supplier).toBeDefined();
    for (const item of supplier.items) {
      expect(item.rankReq).toBeGreaterThanOrEqual(0);
      if (item.kind === 'base') expect(BASES[item.refId as keyof typeof BASES]).toBeDefined();
      if (item.kind === 'additive') expect(ADDITIVES[item.refId as keyof typeof ADDITIVES]).toBeDefined();
      if (item.kind === 'input') expect(INPUTS[item.refId as keyof typeof INPUTS]).toBeDefined();
      if (item.kind === 'key') expect(KEY_PRICES[item.refId]).toBeDefined();
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

describe('district shops + keys', () => {
  it('hardware sells the docks key; afterhours exists', () => {
    expect(SHOPS.hardware).toBeDefined();
    expect(SHOPS.afterhours).toBeDefined();
    expect(SHOPS.hardware.items.some((i) => i.kind === 'key' && i.refId === 'docks_key')).toBe(true);
  });
  it('shopItemPrice resolves a key via KEY_PRICES', () => {
    expect(shopItemPrice({ kind: 'key', refId: 'docks_key', rankReq: 2 })).toBe(KEY_PRICES.docks_key);
  });
});

describe('after-hours time gating', () => {
  const NOON = 0.5 * DAY_LENGTH_MS;
  const NIGHT = 0.9 * DAY_LENGTH_MS;

  it('after-hours items are night-windowed', () => {
    expect(SHOPS.afterhours.items.every((i) => i.timeWindow === NIGHT_WINDOW)).toBe(true);
  });

  it('hides after-hours items at noon (rank high enough)', () => {
    expect(visibleItems(SHOPS.afterhours, 9, NOON)).toHaveLength(0);
  });

  it('shows after-hours items at night (rank high enough)', () => {
    expect(visibleItems(SHOPS.afterhours, 9, NIGHT).length).toBeGreaterThan(0);
  });

  it('without a clock, time gating is ignored (backward compatible)', () => {
    expect(visibleItems(SHOPS.afterhours, 9).length).toBeGreaterThan(0);
  });

  it('still respects rank within the open window', () => {
    expect(visibleItems(SHOPS.afterhours, 0, NIGHT)).toHaveLength(0);
  });
});

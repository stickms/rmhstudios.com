import { describe, it, expect } from 'vitest';
import { SHOP_ITEMS, getShopItem } from '@/lib/shop/catalog';
import {
  BUNDLE_DISCOUNT_PCT,
  BUNDLE_SIZE,
  DAILY_FEATURED_COUNT,
  bundlePrice,
  checkBundle,
  dailyFeaturedIds,
  nextRotationAt,
  utcDateKey,
} from '@/lib/shop/daily-shop';

describe('dailyFeaturedIds (C2)', () => {
  it('is deterministic for a date', () => {
    expect(dailyFeaturedIds('2026-10-12')).toEqual(dailyFeaturedIds('2026-10-12'));
  });

  it('rotates between days', () => {
    const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((d) =>
      dailyFeaturedIds(d).join(','),
    );
    expect(new Set(days).size).toBe(days.length);
  });

  it('features the configured number of distinct, real, purchasable items', () => {
    const ids = dailyFeaturedIds('2026-10-12');
    expect(ids).toHaveLength(DAILY_FEATURED_COUNT);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const item = getShopItem(id)!;
      expect(item).toBeDefined();
      expect(item.requiresTier).toBeUndefined();
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('is independent of catalog declaration order', () => {
    const reversed = [...SHOP_ITEMS].reverse();
    expect(dailyFeaturedIds('2026-10-12', reversed)).toEqual(dailyFeaturedIds('2026-10-12'));
  });

  it('does not feature more than two of one kind', () => {
    for (const d of ['2026-10-12', '2026-11-03', '2027-01-01']) {
      const counts = new Map<string, number>();
      for (const id of dailyFeaturedIds(d)) {
        const k = getShopItem(id)!.kind;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    }
  });
});

describe('rotation clock', () => {
  it('keys by UTC date and rotates at the next UTC midnight', () => {
    const t = new Date('2026-10-12T23:59:59Z');
    expect(utcDateKey(t)).toBe('2026-10-12');
    expect(nextRotationAt(t).toISOString()).toBe('2026-10-13T00:00:00.000Z');
    expect(nextRotationAt(new Date('2026-10-13T00:00:00Z')).toISOString()).toBe(
      '2026-10-14T00:00:00.000Z',
    );
  });
});

describe('bundles (C3)', () => {
  it('prices at the discount, rounded down, always below list', () => {
    expect(BUNDLE_DISCOUNT_PCT).toBe(20);
    expect(bundlePrice([100, 100, 100])).toBe(240);
    expect(bundlePrice([175, 300, 601])).toBe(Math.floor((1076 * 80) / 100));
    expect(bundlePrice([1, 1, 1])).toBeLessThan(3);
  });

  const featured = dailyFeaturedIds('2026-10-12');
  const pick = featured.slice(0, BUNDLE_SIZE);

  it('accepts three distinct featured items and prices them server-side', () => {
    const r = checkBundle(pick, featured, getShopItem);
    const list = pick.reduce((a, id) => a + getShopItem(id)!.price, 0);
    expect(r).toEqual({
      ok: true,
      price: bundlePrice(pick.map((id) => getShopItem(id)!.price)),
      listPrice: list,
    });
  });

  it('rejects the wrong size, duplicates, non-featured and unknown items', () => {
    expect(checkBundle(pick.slice(0, 2), featured, getShopItem)).toEqual({
      ok: false,
      error: 'WRONG_SIZE',
    });
    expect(checkBundle([pick[0]!, pick[0]!, pick[1]!], featured, getShopItem)).toEqual({
      ok: false,
      error: 'DUPLICATE',
    });
    const outsider = SHOP_ITEMS.find((i) => !featured.includes(i.id))!.id;
    expect(checkBundle([pick[0]!, pick[1]!, outsider], featured, getShopItem)).toEqual({
      ok: false,
      error: 'NOT_FEATURED',
    });
    expect(checkBundle([pick[0]!, pick[1]!, 'ghost'], [...featured, 'ghost'], getShopItem)).toEqual(
      { ok: false, error: 'UNKNOWN_ITEM' },
    );
  });
});

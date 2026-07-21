import { describe, it, expect } from 'vitest';
import { orderNavItems, SIDEBAR_NAV, isNavGroup } from '@/lib/sidebar-nav';

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('orderNavItems', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('returns the default order (a copy) when order is empty', () => {
    const out = orderNavItems(items, []);
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd']);
    expect(out).not.toBe(items);
  });

  it('applies a full permutation', () => {
    expect(ids(orderNavItems(items, ['c', 'a', 'd', 'b']))).toEqual(['c', 'a', 'd', 'b']);
  });

  it('is forward-safe: ids absent from order keep their default position afterwards', () => {
    // Saved order predates the arrival of 'c' and 'd' — they must still appear.
    expect(ids(orderNavItems(items, ['b', 'a']))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('ignores unknown ids in the saved order', () => {
    expect(ids(orderNavItems(items, ['ghost', 'b', 'a']))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('drops duplicate ids in the saved order', () => {
    expect(ids(orderNavItems(items, ['a', 'a', 'b']))).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('SIDEBAR_NAV', () => {
  it('has unique, stable ids on every item', () => {
    const all = ids(SIDEBAR_NAV);
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives group ids a `group:` prefix and leaf ids their href', () => {
    for (const item of SIDEBAR_NAV) {
      if (isNavGroup(item)) expect(item.id).toBe(`group:${item.group}`);
      else expect(item.id).toBe(item.href);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { orderNavItems, SIDEBAR_NAV, isNavGroup } from '@/lib/sidebar-nav';
import { SIDEBAR_NAV_IDS } from '@/lib/home-widgets';

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

  it('gives group ids a `group:` prefix', () => {
    for (const item of SIDEBAR_NAV) {
      if (isNavGroup(item)) expect(item.id).toBe(`group:${item.group}`);
    }
  });

  /**
   * This used to assert `item.id === item.href` for leaves, which is how ids
   * are *minted* but not what they mean. An id is the key a user's saved rail
   * order and hidden set are validated against (`SIDEBAR_NAV_IDS` in
   * `lib/home-widgets.ts`), so it has to outlive the destination: when Explore
   * moved from `/search` to `/explore` — `/search` being `noindex` while
   * `/explore` was the page actually listed in the sitemap — keeping the id
   * would have been a silent data migration that dropped the entry from every
   * saved order.
   *
   * So the invariant is membership in the stable set, not equality with href.
   * That is also the check that would have caught the migration: adding a nav
   * item without registering its id makes it unorderable and unhideable, and
   * nothing else notices.
   */
  it('draws every orderable id from the stable registered set', () => {
    for (const item of SIDEBAR_NAV) {
      // Admin is pinned and deliberately absent from the registry.
      if (item.id === '/admin') continue;
      expect(
        SIDEBAR_NAV_IDS as readonly string[],
        `${item.label} (${item.id}) is not in SIDEBAR_NAV_IDS, so a user cannot ` +
          'reorder or hide it and an existing saved order silently drops it.',
      ).toContain(item.id);
    }
  });

  it('registers no id that the nav no longer has', () => {
    const live = new Set(SIDEBAR_NAV.map((i) => i.id));
    const orphans = (SIDEBAR_NAV_IDS as readonly string[]).filter((id) => !live.has(id));
    expect(orphans, 'SIDEBAR_NAV_IDS entries with no matching nav item.').toEqual([]);
  });
});

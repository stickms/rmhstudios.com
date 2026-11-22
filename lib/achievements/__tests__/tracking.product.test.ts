import { describe, expect, it } from 'vitest';
import {
  MAX_TRACKED,
  closest,
  crossedThreshold,
  filterAchievements,
  percent,
  sortAchievements,
  type ClosestDef,
  type ClosestRow,
  type ListedAchievement,
} from '@/lib/achievements/tracking';

const def = (id: string, target: number, secret = false): ClosestDef => ({
  id,
  target,
  secret,
});
const row = (achievementId: string, progress: number, unlockedAt: string | null = null): ClosestRow => ({
  achievementId,
  progress,
  unlockedAt,
});
const rarity = (entries: Record<string, number>) =>
  new Map(
    Object.entries(entries).map(([k, pct]) => [
      k,
      {
        pct,
      },
    ]),
  );

describe('MAX_TRACKED', () => {
  it('is five', () => expect(MAX_TRACKED).toBe(5));
});

describe('crossedThreshold', () => {
  it('reports 50 on crossing halfway and 90 on crossing nine tenths', () => {
    expect(crossedThreshold(40, 50)).toBe(50);
    expect(crossedThreshold(49.9, 60)).toBe(50);
    expect(crossedThreshold(80, 90)).toBe(90);
  });
  it('reports 90 only when one jump passes both thresholds', () => {
    expect(crossedThreshold(10, 95)).toBe(90);
    expect(crossedThreshold(0, 100)).toBe(90);
  });
  it('reports nothing inside a band, on no change or on a decrease', () => {
    expect(crossedThreshold(50, 70)).toBeNull();
    expect(crossedThreshold(90, 99)).toBeNull();
    expect(crossedThreshold(60, 60)).toBeNull();
    expect(crossedThreshold(95, 40)).toBeNull();
    expect(crossedThreshold(0, 49.9)).toBeNull();
  });
});

describe('percent', () => {
  it('clamps and tolerates a bad target', () => {
    expect(percent(37, 50)).toBe(74);
    expect(percent(80, 50)).toBe(100);
    expect(percent(-3, 50)).toBe(0);
    expect(percent(5, 0)).toBe(0);
    expect(percent(Number.NaN, 10)).toBe(0);
  });
});

describe('closest', () => {
  const defs = [def('a', 50), def('b', 10), def('c', 100), def('s', 10, true), def('one', 1), def('d', 20)];

  it('ranks by remaining fraction, so 45 of 50 comes first', () => {
    const out = closest(defs, [row('a', 45), row('b', 5), row('c', 99), row('d', 10)], rarity({}));
    expect(out.map((e) => e.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(out[1]).toEqual({
      id: 'a',
      progress: 45,
      target: 50,
      remaining: expect.closeTo(0.1),
    });
  });

  it('breaks ties with the rarer achievement first, then catalog order', () => {
    const rows = [row('a', 25), row('d', 10), row('b', 5)];
    expect(
      closest(
        defs,
        rows,
        rarity({
          a: 0.4,
          d: 0.05,
        }),
      ).map((e) => e.id),
    ).toEqual(['d', 'a', 'b']);
    expect(closest(defs, rows, rarity({})).map((e) => e.id)).toEqual(['a', 'b', 'd']);
  });

  it('leaves out secret, one-shot, unlocked, untouched and missing rows', () => {
    const rows = [row('s', 9), row('one', 1), row('a', 50, '2026-01-01T00:00:00Z'), row('b', 0), row('d', 19)];
    expect(closest(defs, rows, rarity({})).map((e) => e.id)).toEqual(['d']);
  });

  it('caps the list at n, eight by default', () => {
    const many = Array.from(
      {
        length: 12,
      },
      (_, i) => def(`x${i}`, 100),
    );
    const rows = many.map((d, i) => row(d.id, 10 + i));
    expect(closest(many, rows, rarity({}))).toHaveLength(8);
    expect(closest(many, rows, rarity({}), 3).map((e) => e.id)).toEqual(['x11', 'x10', 'x9']);
  });
});

describe('filtering and sorting the list', () => {
  const item = (id: string, category: ListedAchievement['category'], progress: number, unlockedAt: string | null) => ({
    id,
    category,
    target: 10,
    progress,
    unlocked: unlockedAt !== null,
    unlockedAt,
  });
  const list = [
    item('a', 'social', 2, null),
    item('b', 'games', 9, null),
    item('c', 'games', 10, '2026-03-01T00:00:00Z'),
    item('d', 'social', 10, '2026-05-01T00:00:00Z'),
  ];
  const tracked = new Set(['b']);

  it('filters by state and category', () => {
    const f = (state: 'all' | 'locked' | 'unlocked' | 'tracked', category: 'games' | null = null) =>
      filterAchievements(list, {
        state,
        category,
        tracked,
      }).map((a) => a.id);
    expect(f('all')).toEqual(['a', 'b', 'c', 'd']);
    expect(f('locked')).toEqual(['a', 'b']);
    expect(f('unlocked')).toEqual(['c', 'd']);
    expect(f('tracked')).toEqual(['b']);
    expect(f('all', 'games')).toEqual(['b', 'c']);
    expect(f('unlocked', 'games')).toEqual(['c']);
  });

  it('sorts by closeness with unlocked last, by rarity and by latest unlock, without mutating', () => {
    const copy = [...list];
    expect(sortAchievements(list, 'catalog', rarity({})).map((a) => a.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(sortAchievements(list, 'closest', rarity({})).map((a) => a.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(
      sortAchievements(
        list,
        'rarest',
        rarity({
          d: 0.01,
          a: 0.2,
          b: 0.5,
        }),
      ).map((a) => a.id),
    ).toEqual(['d', 'a', 'b', 'c']);
    expect(sortAchievements(list, 'recent', rarity({})).map((a) => a.id)).toEqual(['d', 'c', 'a', 'b']);
    expect(list).toEqual(copy);
  });
});

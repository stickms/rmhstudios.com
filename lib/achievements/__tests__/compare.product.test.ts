import { describe, expect, it } from 'vitest';
import type { AchievementDef } from '@/lib/achievements/catalog';
import {
  bucketOf,
  buildCompareRows,
  countBuckets,
  filterCompareRows,
  type SideState,
} from '@/lib/achievements/compare';

const def = (
  id: string,
  category: AchievementDef['category'],
  extra: Partial<AchievementDef> = {},
): AchievementDef => ({
  id,
  name: `Name ${id}`,
  description: `Desc ${id}`,
  icon: 'X',
  category,
  tier: 'bronze',
  coinReward: 1,
  target: 1,
  ...extra,
});
const catalog = [
  def('a', 'social'),
  def('b', 'social'),
  def('c', 'games', { target: 10 }),
  def('d', 'games'),
  def('s1', 'special', { secret: true }),
  def('s2', 'special', { secret: true }),
  def('s3', 'special', { secret: true }),
];
const on = (id: string): { id: string } & SideState => ({
  id,
  unlocked: true,
  unlockedAt: '2026-05-03T00:00:00Z',
  progress: 1,
});
const part = (id: string, progress: number): { id: string } & SideState => ({
  id,
  unlocked: false,
  unlockedAt: null,
  progress,
});

const viewer = { achievements: [on('a'), on('b'), part('c', 3), on('s2')] };
const other = { achievements: [on('a'), on('c'), on('s1'), on('s2')] };
const rows = buildCompareRows(catalog, viewer, other, { a: 0.04, c: 0.5 });
const byId = (id: string) => rows.find((r) => r.id === id)!;

describe('buckets and counts', () => {
  it('classifies every pair', () => {
    expect(bucketOf(true, true)).toBe('both');
    expect(bucketOf(true, false)).toBe('you');
    expect(bucketOf(false, true)).toBe('them');
    expect(bucketOf(false, false)).toBe('neither');
  });

  it('counts the diff, leaving out a secret nobody has', () => {
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 's1', 's2']);
    expect(countBuckets(rows)).toEqual({ both: 2, you: 1, them: 2, neither: 1 });
  });
});

describe('filters', () => {
  it.each([
    ['all', ['a', 'b', 'c', 'd', 's1', 's2']],
    ['both', ['a', 's2']],
    ['you', ['b']],
    ['them', ['c', 's1']],
    ['neither', ['d']],
  ] as const)('%s', (filter, ids) => {
    expect(filterCompareRows(rows, filter).map((r) => r.id)).toEqual(ids);
  });

  it('narrows by category on top of the bucket', () => {
    expect(filterCompareRows(rows, 'all', 'games').map((r) => r.id)).toEqual(['c', 'd']);
    expect(filterCompareRows(rows, 'them', 'games').map((r) => r.id)).toEqual(['c']);
    expect(filterCompareRows(rows, 'you', 'games')).toEqual([]);
  });
});

describe('rows', () => {
  it('carries both states and rarity', () => {
    expect(byId('a')).toMatchObject({ rarity: 0.04, you: { unlocked: true }, them: { unlocked: true } });
    expect(byId('c').you).toMatchObject({ unlocked: false, progress: 3 });
    expect(byId('b').rarity).toBeNull();
  });

  it('offers Track only for an "Only them" achievement that is not secret', () => {
    expect(rows.filter((r) => r.trackable).map((r) => r.id)).toEqual(['c']);
  });

  it('masks a secret only the other member unlocked, and shows one the viewer unlocked', () => {
    expect(byId('s1')).toMatchObject({
      masked: true,
      name: '',
      description: '',
      icon: '',
      tier: null,
      rarity: null,
      trackable: false,
      bucket: 'them',
    });
    expect(byId('s2')).toMatchObject({ masked: false, name: 'Name s2', bucket: 'both' });
  });

  it('treats a member missing from a payload as locked', () => {
    const only = buildCompareRows([def('a', 'social')], { achievements: [] }, { achievements: [] }, {});
    expect(only[0]).toMatchObject({ bucket: 'neither', you: { unlocked: false, progress: 0 } });
  });
});

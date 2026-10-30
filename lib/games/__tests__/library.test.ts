import { describe, expect, it } from 'vitest';
import type { CuratedBuild } from '@/lib/builds/curated';
import { filterRail, groupRail, heroSource, isOffSite } from '@/lib/games/library';

const build = (over: Partial<CuratedBuild> & { id: string }): CuratedBuild => ({
  slug: over.id,
  title: over.id,
  description: '',
  longDescription: '',
  thumbnailUrl: null,
  bannerUrl: null,
  href: `/${over.id}`,
  cta: 'Play',
  tags: [],
  kind: 'game',
  hue: 10,
  ...over,
});

const items = [
  build({ id: 'zeta', title: 'Zeta Racer', tags: ['Racing'] }),
  build({ id: 'alpha', title: 'Alpha Quest', tags: ['RPG'] }),
  build({ id: 'beta', title: 'Beta Notes', kind: 'app', tags: ['Notes', 'Productivity'] }),
];

describe('filterRail', () => {
  it('filters by kind', () => {
    expect(filterRail(items, { kind: 'app', search: '' }).map((b) => b.id)).toEqual(['beta']);
    expect(filterRail(items, { kind: 'game', search: '' }).map((b) => b.id)).toEqual(['zeta', 'alpha']);
    expect(filterRail(items, { kind: 'all', search: '' })).toHaveLength(3);
  });

  it('searches title and tags, ignoring case and surrounding space', () => {
    expect(filterRail(items, { kind: 'all', search: '  ALPHA ' }).map((b) => b.id)).toEqual(['alpha']);
    expect(filterRail(items, { kind: 'all', search: 'productiv' }).map((b) => b.id)).toEqual(['beta']);
    expect(filterRail(items, { kind: 'all', search: 'nothing-matches' })).toEqual([]);
  });
});

describe('groupRail', () => {
  it('puts recents first in the order given and the rest A-Z by title', () => {
    const { recent, rest } = groupRail(items, ['zeta', 'missing', 'beta']);
    expect(recent.map((b) => b.id)).toEqual(['zeta', 'beta']);
    expect(rest.map((b) => b.id)).toEqual(['alpha']);
  });

  it('lists everything A-Z when there are no recents', () => {
    expect(groupRail(items, []).rest.map((b) => b.id)).toEqual(['alpha', 'beta', 'zeta']);
  });
});

describe('heroSource', () => {
  it('prefers the banner, then the cropped card image, then the hue tile', () => {
    expect(heroSource(build({ id: 'a', bannerUrl: '/b.webp', thumbnailUrl: '/c.webp' }))).toEqual({
      kind: 'banner',
      src: '/b.webp',
      hue: 10,
    });
    expect(heroSource(build({ id: 'a', thumbnailUrl: '/c.webp' }))).toEqual({
      kind: 'cropped-card',
      src: '/c.webp',
      hue: 10,
    });
    expect(heroSource(build({ id: 'a' }))).toEqual({ kind: 'tile', src: null, hue: 10 });
  });
});

describe('isOffSite', () => {
  it('is true for an absolute URL and false for a site path', () => {
    expect(isOffSite('https://discord.gg/ZdfhdAKVSf')).toBe(true);
    expect(isOffSite('http://example.com/play')).toBe(true);
    expect(isOffSite('//cdn.example.com/x')).toBe(true);
    expect(isOffSite('/altair')).toBe(false);
    expect(isOffSite('/rmhtube/abc')).toBe(false);
  });
});

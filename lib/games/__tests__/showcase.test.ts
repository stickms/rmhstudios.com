import { describe, expect, it } from 'vitest';
import { MAX_SHOWCASE, badgeKey, cleanShowcase, parseBadgeKey } from '../showcase';

const owned = {
  achievements: new Set(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']),
  badges: new Set(['altair:normal', 'altair:foil', 'laundry-sort:normal']),
};

describe('badge keys', () => {
  it('round-trips', () => {
    expect(badgeKey('altair', true)).toBe('altair:foil');
    expect(parseBadgeKey('altair:foil')).toEqual({ gameId: 'altair', foil: true });
    expect(parseBadgeKey('laundry-sort:normal')).toEqual({ gameId: 'laundry-sort', foil: false });
  });

  it('rejects malformed keys', () => {
    expect(parseBadgeKey('nope')).toBeNull();
    expect(parseBadgeKey('altair:shiny')).toBeNull();
    expect(parseBadgeKey(':foil')).toBeNull();
  });
});

describe('cleanShowcase', () => {
  it('keeps order, drops duplicates and things the member does not own', () => {
    const r = cleanShowcase(
      { achievements: ['a3', 'a1', 'a3', 'zz'], badges: ['laundry-sort:normal', 'nope:normal', 'laundry-sort:normal'] },
      owned,
    );
    expect(r).toEqual({ achievements: ['a3', 'a1'], badges: ['laundry-sort:normal'] });
  });

  it('caps each list at six', () => {
    const r = cleanShowcase({ achievements: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'], badges: [] }, owned);
    expect(r.achievements).toHaveLength(MAX_SHOWCASE);
    expect(r.achievements[5]).toBe('a6');
  });

  it('ignores non-string junk', () => {
    const r = cleanShowcase({ achievements: [1, null, 'a1'] as unknown as string[], badges: [] }, owned);
    expect(r.achievements).toEqual(['a1']);
  });

  it('an empty selection is valid (it means "show my most recent")', () => {
    expect(cleanShowcase({ achievements: [], badges: [] }, owned)).toEqual({ achievements: [], badges: [] });
  });
});

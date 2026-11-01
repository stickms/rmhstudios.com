import { describe, expect, it } from 'vitest';
import { filterCommunities, type SteamCommunity } from '../communities-view';

const c = (o: Partial<SteamCommunity>): SteamCommunity => ({
  slug: 's',
  name: 'N',
  description: null,
  icon: null,
  memberCount: 1,
  isPrivate: false,
  locked: false,
  ...o,
});

describe('filterCommunities', () => {
  const list = [
    c({ slug: 'a', name: 'Speedrunners', description: 'fast games' }),
    c({ slug: 'b', name: 'Cooks', description: 'Recipes and Speed meals' }),
    c({ slug: 'd', name: 'Birds' }),
  ];
  it('matches name or description, case-insensitively, keeping order', () => {
    expect(filterCommunities(list, 'SPEED').map((x) => x.slug)).toEqual(['a', 'b']);
  });
  it('returns everything for a blank query and nothing for no match', () => {
    expect(filterCommunities(list, '  ')).toHaveLength(3);
    expect(filterCommunities(list, 'zzz')).toEqual([]);
  });
});

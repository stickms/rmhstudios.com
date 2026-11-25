import { describe, expect, it } from 'vitest';
import { DEFAULT_COUNT, MAX_COUNT, REGIONS, parseBuilderRoute } from './route';

describe('parseBuilderRoute', () => {
  it('reads a list request, maps regions to states in code and clamps the count', () => {
    const r = parseBuilderRoute({
      intent: 'list',
      states: ['tx', 'ZZ', 'CA'],
      regions: ['northeast', 'atlantis'],
      degree: 'MD',
      mdphd: true,
      size: 'large',
      missions: ['research', 'golf'],
      count: 99,
      homeState: 'TX',
    });
    expect(r.intent).toBe('list');
    expect(r.states).toEqual([...new Set(['CA', 'TX', ...REGIONS.northeast])].sort());
    expect(r.regions).toEqual(['northeast']);
    expect(r).toMatchObject({ degree: 'MD', mdphd: true, size: 'large', missions: ['research'], count: MAX_COUNT });
    expect(r.homeState).toBe('TX');
  });

  it('junk is other, never a throw; missing fields default', () => {
    for (const v of [null, 'x', [], { intent: 'facts' }, { intent: 'other' }]) expect(parseBuilderRoute(v).intent).toBe('other');
    const r = parseBuilderRoute({ intent: 'list', degree: 'PhD', size: 'huge', mdphd: 'yes', count: 2.5 });
    expect(r).toMatchObject({ states: [], degree: null, size: null, mdphd: false, count: DEFAULT_COUNT, homeState: null });
    expect(parseBuilderRoute({ intent: 'list', count: 1 }).count).toBe(5);
  });

  it('every region is real state codes', () => {
    const all = Object.values(REGIONS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(51);
  });
});

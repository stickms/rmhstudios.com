import { describe, expect, it } from 'vitest';
import { floorWhere, publicSum } from './floor';

describe('the public floor', () => {
  it('floorWhere is the clause the readers always used', () => {
    expect(floorWhere(new Date('2026-11-23T10:00:00Z'))).toEqual({
      OR: [
        { source: { not: 'RMH' } },
        {
          source: 'RMH',
          publishedContributors: { gte: 3 },
          date: { lt: new Date('2026-11-23T00:00:00.000Z') },
        },
      ],
    });
  });
  it('publicSum reads published figures for RMH and the count for everything else', () => {
    expect(publicSum('RMH', { count: 9, publishedCount: 4 })).toBe(4);
    expect(publicSum('CYCLETRACK', { count: 9, publishedCount: null })).toBe(9);
    expect(publicSum('RMH', { count: 9, publishedCount: null })).toBe(0);
  });
});

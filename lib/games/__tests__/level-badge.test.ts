import { describe, expect, it } from 'vitest';
import { levelBadgeTier } from '../level-badge';

describe('levelBadgeTier', () => {
  it('steps the badge colour every ten levels, like Steam', () => {
    expect(levelBadgeTier(0)).toBe(0);
    expect(levelBadgeTier(9)).toBe(0);
    expect(levelBadgeTier(10)).toBe(1);
    expect(levelBadgeTier(29)).toBe(2);
    expect(levelBadgeTier(30)).toBe(3);
    expect(levelBadgeTier(100)).toBe(10);
  });

  it('caps at the last colour and treats bad input as the first', () => {
    expect(levelBadgeTier(5000)).toBe(10);
    expect(levelBadgeTier(-3)).toBe(0);
    expect(levelBadgeTier(Number.NaN)).toBe(0);
  });
});

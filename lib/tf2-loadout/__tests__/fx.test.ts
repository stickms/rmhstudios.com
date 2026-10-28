import { describe, expect, it } from 'vitest';
import { compactPlacement, defaultPlacement, resolvePlacement } from '../fx';

describe('placement', () => {
  it('uses the game attachment without additional offsets', () => {
    expect(defaultPlacement('head')).toEqual({ x: 0, y: 0, z: 0, s: 1 });
    expect(defaultPlacement('misc').y).toBe(0);
    expect(defaultPlacement('taunt').y).toBe(0);
  });

  it('fills in defaults, clamps what is saved, and ignores junk', () => {
    expect(resolvePlacement(undefined, 'head')).toEqual(defaultPlacement('head'));
    expect(resolvePlacement({ y: 99, s: 0 }, 'head')).toMatchObject({ y: 2, s: 0.25 });
    expect(resolvePlacement({ x: NaN as number }, 'misc').x).toBe(0);
  });

  it('saves only what moved', () => {
    const d = resolvePlacement(undefined, 'head');
    expect(compactPlacement(d, 'head')).toBeUndefined();
    expect(compactPlacement({ ...d, x: 0.5 }, 'head')).toEqual({ x: 0.5 });
  });
});

import { describe, expect, it } from 'vitest';
import { compactPlacement, defaultPlacement, effectProfile, resolvePlacement } from '../fx';

describe('effectProfile', () => {
  it('reads the character and colour from the effect name', () => {
    expect(effectProfile('Burning Flames', 13)).toMatchObject({ kind: 'flame' });
    expect(effectProfile('Haunted Ghosts', 8)).toMatchObject({ kind: 'smoke' });
    expect(effectProfile('Electrostatic', 7)).toMatchObject({ kind: 'electric' });
    expect(effectProfile('Green Energy', 9)).toMatchObject({ kind: 'electric', colors: ['#52d65a', '#ffffff'] });
    expect(effectProfile('Purple Confetti', 1).colors[0]).toBe('#9b59d0');
  });

  it('gives an effect with no clue a colour of its own, the same every time', () => {
    const a = effectProfile('Mystery', 4242);
    expect(a.kind).toBe('glow');
    expect(effectProfile('Mystery', 4242)).toEqual(a);
    expect(effectProfile('Mystery', 17).colors).not.toEqual(a.colors);
  });

  it('keeps the particle count phone-sized', () => {
    for (const n of ['Burning Flames', 'Snowfall', 'Orbiting Fire', 'Mystery'])
      expect(effectProfile(n, 1).count).toBeLessThanOrEqual(90);
  });
});

describe('placement', () => {
  it('crowns a hat, hangs about a misc item, surrounds a taunt', () => {
    expect(defaultPlacement('head').y).toBeGreaterThan(defaultPlacement('misc').y);
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

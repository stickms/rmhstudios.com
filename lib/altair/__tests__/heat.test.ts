// Heat (difficulty tiers): the model is pure arithmetic over a tier number, and Heat 0 must be the
// identity so a standard run is exactly what it was before Heat existed. Payout rides on it.
import { describe, it, expect } from 'vitest';
import { HEAT_MAX, clampHeat, heatModifiers, unlockedHeat } from '../data/heat';
import { finalCoinsFor } from '../solo/loadout';
import { checkLoadout, type SoloLoadout } from '../solo/solo-log';
import { canonicalLoadout } from '../solo/verify-solo';

const BASE: SoloLoadout = {
  rerolls: 1,
  banishes: 0,
  revival: 0,
  extraChoice: false,
  catalystAffinity: 0,
  greed: 2,
};

describe('Heat modifiers', () => {
  it('are exactly 1 at Heat 0, so a standard run is bit-for-bit unchanged', () => {
    expect(heatModifiers(0)).toEqual({
      hp: 1,
      damage: 1,
      speed: 1,
      spawn: 1,
      bossHp: 1,
      payout: 1,
    });
  });

  it('only ever make the game harder and pay more as the tier rises', () => {
    for (let h = 1; h <= HEAT_MAX; h++) {
      const a = heatModifiers(h - 1);
      const b = heatModifiers(h);
      for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k]).toBeGreaterThan(a[k]);
    }
  });

  it('clamp to 0..HEAT_MAX and ignore junk', () => {
    expect(clampHeat(-3)).toBe(0);
    expect(clampHeat(99)).toBe(HEAT_MAX);
    expect(clampHeat(4.9)).toBe(4);
    expect(clampHeat(Number.NaN)).toBe(0);
    expect(clampHeat('7')).toBe(0);
    expect(clampHeat(undefined)).toBe(0);
    expect(heatModifiers(HEAT_MAX + 50)).toEqual(heatModifiers(HEAT_MAX));
  });
});

describe('unlockedHeat', () => {
  it('opens only tier 0 until the account has won', () => {
    expect(unlockedHeat([])).toBe(0);
  });
  it('clearing tier N unlocks N+1, using the highest clear', () => {
    expect(unlockedHeat([0])).toBe(1);
    expect(unlockedHeat([0, 0, 3, 1])).toBe(4);
  });
  it('never goes above HEAT_MAX', () => {
    expect(unlockedHeat([HEAT_MAX])).toBe(HEAT_MAX);
  });
});

describe('payout', () => {
  it('is unchanged at Heat 0 (existing behaviour)', () => {
    expect(finalCoinsFor(1000, 2, false)).toBe(Math.floor(1000 * 1.2));
    expect(finalCoinsFor(1000, 2, true)).toBe(Math.floor(1000 * 1.2 * 1.5));
    expect(finalCoinsFor(1000, 2, true, 0)).toBe(finalCoinsFor(1000, 2, true));
  });
  it('is higher at higher Heat, and stacks with greed and double time', () => {
    expect(finalCoinsFor(1000, 0, false, 10)).toBe(Math.floor(1000 * (1 + 0.12 * 10)));
    expect(finalCoinsFor(1000, 2, true, 10)).toBeGreaterThan(finalCoinsFor(1000, 2, true, 0));
  });
});

describe('loadout validation', () => {
  it('accepts a tier in range and a loadout without one', () => {
    expect(checkLoadout(BASE)).toBe(true);
    expect(checkLoadout({ ...BASE, heat: 0 })).toBe(true);
    expect(checkLoadout({ ...BASE, heat: HEAT_MAX })).toBe(true);
  });
  it('refuses a tier out of range or not a whole number', () => {
    for (const bad of [-1, HEAT_MAX + 1, 1.5, '3', null, {}])
      expect(checkLoadout({ ...BASE, heat: bad })).toBe(false);
  });
  it('keeps the exact legacy shape at Heat 0 and carries the tier above it', () => {
    expect(canonicalLoadout({ ...BASE })).not.toHaveProperty('heat');
    expect(canonicalLoadout({ ...BASE, heat: 0 })).not.toHaveProperty('heat');
    expect(canonicalLoadout({ ...BASE, heat: 6 })).toMatchObject({ heat: 6 });
  });
});

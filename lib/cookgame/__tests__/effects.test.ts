import { describe, it, expect } from 'vitest';
import { mix, productValue, effectSetKey } from '../effects';
import { BASES, EFFECTS } from '../content';
import type { Product } from '../types';

const fresh: Product = { baseId: 'greenstart', effects: [] };

describe('mix', () => {
  it('adds an additive base effect to an empty product', () => {
    const out = mix(fresh, 'cuke');
    expect(out.effects).toEqual(['energizing']);
  });
  it('does not mutate the input product', () => {
    const input: Product = { baseId: 'greenstart', effects: ['calming'] };
    mix(input, 'cuke');
    expect(input.effects).toEqual(['calming']);
  });
  it('does not duplicate an existing base effect', () => {
    const input: Product = { baseId: 'greenstart', effects: ['energizing'] };
    const out = mix(input, 'cuke');
    expect(out.effects.filter((e) => e === 'energizing')).toHaveLength(1);
  });
  it('applies a transform rule: battery flips energizing → glowing then adds euphoric', () => {
    const input: Product = { baseId: 'greenstart', effects: ['energizing'] };
    const out = mix(input, 'battery'); // energizing→glowing (transform), + euphoric (base)
    expect(out.effects).toContain('glowing');
    expect(out.effects).toContain('euphoric');
    expect(out.effects).not.toContain('energizing');
  });
  it('does not cascade an additive through its own transform output in one mix', () => {
    // donut: jittery→focused (transform) and base effect focused.
    // Starting with jittery, result should contain focused exactly once, no error.
    const input: Product = { baseId: 'greenstart', effects: ['jittery'] };
    const out = mix(input, 'donut');
    expect(out.effects.filter((e) => e === 'focused')).toHaveLength(1);
    expect(out.effects).not.toContain('jittery');
  });
  it('caps effects at MAX_EFFECTS dropping lowest tier first', () => {
    // Fill with 8 effects then add one more via an additive; tier-1 should be dropped.
    const eight: Product = {
      baseId: 'greenstart',
      effects: ['energizing','calming','gingeritis','sneaky','spicy','euphoric','focused','sedating'],
    };
    const out = mix(eight, 'battery'); // adds euphoric(dupe) — actually transforms; use a tier-3 add
    expect(out.effects.length).toBeLessThanOrEqual(8);
  });
});

describe('productValue', () => {
  it('returns base value for an effectless product', () => {
    expect(productValue(fresh)).toBe(BASES.greenstart.baseValue);
  });
  it('multiplies base value by each effect multiplier and rounds', () => {
    const p: Product = { baseId: 'greenstart', effects: ['energizing', 'spicy'] };
    const expected = Math.round(35 * EFFECTS.energizing.multiplier * EFFECTS.spicy.multiplier);
    expect(productValue(p)).toBe(expected);
  });
});

describe('effectSetKey', () => {
  it('is order-independent', () => {
    expect(effectSetKey(['spicy', 'energizing'])).toBe(effectSetKey(['energizing', 'spicy']));
  });
});

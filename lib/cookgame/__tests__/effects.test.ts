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
    // 8 distinct effects, excluding energizing (cuke's base effect) and sedating
    // (cuke's only transform source) so NO transforms fire and appending energizing
    // would make 9 effects — forcing the cap to drop a lowest-tier (tier-1) effect.
    const eight: Product = {
      baseId: 'greenstart',
      effects: ['calming', 'gingeritis', 'jittery', 'sneaky', 'spicy', 'euphoric', 'focused', 'glowing'],
    };
    const out = mix(eight, 'cuke');
    // Cap fired: result is held at 8, not 9.
    expect(out.effects).toHaveLength(8);
    // The tier-3 effect and every tier-2 effect survive; only a tier-1 was dropped.
    expect(out.effects).toContain('glowing'); // tier 3
    for (const e of ['sneaky', 'spicy', 'euphoric', 'focused'] as const) {
      expect(out.effects).toContain(e); // all tier-2 survive
    }
    // Started with 3 tier-1 effects; adding a 4th tier-1 then capping leaves 3.
    const tier1 = out.effects.filter((e) =>
      ['energizing', 'calming', 'gingeritis', 'jittery'].includes(e),
    );
    expect(tier1).toHaveLength(3);
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

describe('qualityMult', () => {
  it('productValue multiplies by qualityMult when present', () => {
    const p: Product = { baseId: 'greenstart', effects: ['energizing'], qualityMult: 1.3 };
    const expected = Math.round(35 * EFFECTS.energizing.multiplier * 1.3);
    expect(productValue(p)).toBe(expected);
  });
  it('productValue treats missing qualityMult as 1', () => {
    const p: Product = { baseId: 'greenstart', effects: [] };
    expect(productValue(p)).toBe(BASES.greenstart.baseValue);
  });
  it('mix preserves qualityMult', () => {
    const p: Product = { baseId: 'couchlock', effects: [], qualityMult: 1.2 };
    expect(mix(p, 'cuke').qualityMult).toBe(1.2);
  });
});

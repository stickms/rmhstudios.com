import { describe, it, expect } from 'vitest';
import { effectCatalog, discoverEffects, mergeBestValue } from '../journal';
import type { RecipeMeta } from '../types';

describe('effectCatalog', () => {
  it('returns every effect with a discovered flag', () => {
    const cat = effectCatalog(['euphoric']);
    expect(cat).toHaveLength(10); // the EffectId union
    const euph = cat.find((e) => e.id === 'euphoric')!;
    expect(euph.discovered).toBe(true);
    expect(euph.name).toBe('Euphoric');
    expect(euph.tier).toBe(2);
    expect(cat.find((e) => e.id === 'glowing')!.discovered).toBe(false);
  });

  it('is ordered by tier then name, regardless of discovery', () => {
    const a = effectCatalog([]);
    const b = effectCatalog(['glowing', 'spicy']);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id)); // order is discovery-independent
    for (let i = 1; i < a.length; i++) {
      const prev = a[i - 1], cur = a[i];
      expect(prev.tier < cur.tier || (prev.tier === cur.tier && prev.name <= cur.name)).toBe(true);
    }
  });
});

describe('discoverEffects', () => {
  it('adds new effects, preserving existing-first order', () => {
    expect(discoverEffects(['spicy'], ['euphoric', 'spicy'])).toEqual(['spicy', 'euphoric']);
  });
  it('returns the same reference when nothing is new', () => {
    const cur = ['spicy', 'euphoric'];
    expect(discoverEffects(cur, ['spicy'])).toBe(cur);
  });
});

describe('mergeBestValue', () => {
  it('sets best value for a new recipe key', () => {
    const out = mergeBestValue({}, 'euphoric+spicy', 120);
    expect(out['euphoric+spicy'].bestValue).toBe(120);
  });
  it('raises the best value and preserves name/favorite', () => {
    const meta: Record<string, RecipeMeta> = { 'a+b': { name: 'Zinger', favorite: true, bestValue: 100 } };
    const out = mergeBestValue(meta, 'a+b', 150);
    expect(out['a+b']).toEqual({ name: 'Zinger', favorite: true, bestValue: 150 });
  });
  it('returns the same reference when value does not exceed the stored best', () => {
    const meta: Record<string, RecipeMeta> = { 'a+b': { bestValue: 200 } };
    expect(mergeBestValue(meta, 'a+b', 150)).toBe(meta);
  });
});

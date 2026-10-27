import { describe, expect, it } from 'vitest';
import type { EffectKind } from '../fx';
import { particleAt, rnd } from '../fx-motion';

const KINDS: EffectKind[] = ['flame', 'smoke', 'electric', 'sparkle', 'snow', 'bubble', 'leaf', 'orbit', 'glow'];

describe('particleAt', () => {
  it.each(KINDS)('%s stays inside the effect volume and is visible some of the time', (kind) => {
    let visible = 0;
    for (let t = 0; t < 6; t += 0.25) {
      for (let i = 0; i < 90; i++) {
        const p = particleAt(kind, i, 90, t);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1.7);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(1.7);
        expect(p.y).toBeGreaterThanOrEqual(-1.3);
        expect(p.y).toBeLessThanOrEqual(1.7);
        expect(p.a).toBeGreaterThanOrEqual(0);
        expect(p.a).toBeLessThanOrEqual(1);
        expect(p.size).toBeGreaterThan(0);
        if (p.a > 0.2) visible++;
      }
    }
    expect(visible).toBeGreaterThan(100);
  });

  it.each(KINDS)('%s is deterministic and actually moves', (kind) => {
    expect(particleAt(kind, 3, 90, 1.5)).toEqual(particleAt(kind, 3, 90, 1.5));
    const a = particleAt(kind, 3, 90, 1.0);
    const b = particleAt(kind, 3, 90, 1.4);
    expect([a.x, a.y, a.z, a.a]).not.toEqual([b.x, b.y, b.z, b.a]);
  });

  it('flames rise and fade; snow falls', () => {
    const early = particleAt('flame', 5, 90, 0.05);
    const late = particleAt('flame', 5, 90, 0.05 + 0.6 / 0.9);
    expect(late.y).toBeGreaterThan(early.y);
    expect(late.a).toBeLessThan(early.a);
    const s1 = particleAt('snow', 5, 90, 0.2);
    const s2 = particleAt('snow', 5, 90, 0.6);
    expect(s2.y).toBeLessThan(s1.y);
  });
});

describe('rnd', () => {
  it('is in [0,1) and varies by particle and channel', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) {
      for (let k = 0; k < 4; k++) {
        const v = rnd(i, k);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
        seen.add(v);
      }
    }
    expect(seen.size).toBe(200);
  });
});

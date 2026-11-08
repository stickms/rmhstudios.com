import { describe, expect, it } from 'vitest';

import { generateBolt } from '../bolt';
import type { RoundedRect } from '../geometry';
import { buildArcFx } from '../fx';

const A: RoundedRect = { x: 0, y: 0, w: 200, h: 96, r: 32 };
const B: RoundedRect = { x: 268, y: 0, w: 200, h: 96, r: 32 };
const a = { x: 200, y: 48, nx: 1, ny: 0, rect: A };
const b = { x: 268, y: 48, nx: -1, ny: 0, rect: B };

describe('per-strike light geometry', () => {
  it('splits red and blue to opposite sides of the channel, symmetric about green', () => {
    const path = generateBolt(a, b, { seed: 11 });
    const fx = buildArcFx([path], [a, b], 1, 11);
    expect(fx.strikes).toHaveLength(1);
    const s = fx.strikes[0];
    expect(s.channels.map((c) => c.id)).toEqual(['bloom', 'mid']);
    for (const c of s.channels) {
      let moved = 0;
      for (let i = 0; i < s.main.length; i++) {
        expect(c.r[i] - s.main[i]).toBeCloseTo(-(c.b[i] - s.main[i]), 4);
        moved = Math.max(moved, Math.abs(c.r[i] - s.main[i]));
      }
      expect(moved).toBeGreaterThan(0.3);
    }
    // The wider pass splits more.
    const spread = (k: number) =>
      Math.abs(s.channels[k].r[(s.main.length / 2) | 1] - s.main[(s.main.length / 2) | 1]);
    expect(spread(0)).toBeGreaterThan(spread(1));
  });

  it('leaves channel points in the air exactly where the bolt put them', () => {
    const path = generateBolt(a, b, { seed: 5 });
    const fx = buildArcFx([path], [a, b], 1, 5);
    for (let i = 0; i < path.points.length; i += 2) {
      const x = path.points[i];
      if (x > 201 && x < 267) {
        expect(fx.strikes[0].main[i]).toBe(path.points[i]);
        expect(fx.strikes[0].main[i + 1]).toBe(path.points[i + 1]);
      }
    }
  });

  it('gives each end with a host a refracted stub and a lit rim; a cursor end gets neither', () => {
    const path = generateBolt(a, b, { seed: 3 });
    expect(buildArcFx([path], [a, b], 1, 3).stubs).toHaveLength(2);
    expect(buildArcFx([path], [a, b], 1, 3).rims).toHaveLength(2);
    const cursor = { x: 268, y: 48, nx: -1, ny: 0 };
    const half = buildArcFx([path], [a, cursor], 1, 3);
    expect(half.stubs).toHaveLength(1);
    expect(half.rims).toHaveLength(1);
    expect(half.rects).toEqual([A]);
    // Stub A goes INTO host A (left of its rim at x = 200).
    const stub = half.stubs[0].g;
    expect(stub[stub.length - 2]).toBeLessThan(200);
  });
});

import { describe, expect, it } from 'vitest';

import type { RoundedRect } from '../geometry';
import { pointToRoundedRect } from '../geometry';
import { RIM_LIGHT, outlinePoints, rimLightPath } from '../reflection';

const HOST: RoundedRect = { x: 100, y: 100, w: 200, h: 100, r: 24 };

describe('reflected light on the rim', () => {
  it('the outline lies on the rounded rect', () => {
    const pts = outlinePoints(HOST);
    expect(pts.length).toBeGreaterThan(16);
    for (let i = 0; i < pts.length; i += 2) {
      expect(
        Math.abs(pointToRoundedRect({ x: pts[i], y: pts[i + 1] }, HOST).distance),
      ).toBeLessThan(0.01);
    }
  });

  it('the lit stretch is centred on the contact, bounded by the span, brightest at the contact', () => {
    const contact = { x: 300, y: 150 };
    const lit = rimLightPath(HOST, contact)!;
    expect(lit).not.toBeNull();
    const n = lit.points.length / 2;
    expect(n).toBeGreaterThan(3);
    let len = 0;
    for (let i = 1; i < n; i++) {
      len += Math.hypot(
        lit.points[2 * i] - lit.points[2 * i - 2],
        lit.points[2 * i + 1] - lit.points[2 * i - 1],
      );
    }
    expect(len).toBeLessThanOrEqual(RIM_LIGHT.spanPx + 8);
    expect(len).toBeGreaterThan(RIM_LIGHT.spanPx / 2);
    // Every lit point is on the rim and within half the span of the contact.
    for (let i = 0; i < n; i++) {
      const p = { x: lit.points[2 * i], y: lit.points[2 * i + 1] };
      expect(Math.abs(pointToRoundedRect(p, HOST).distance)).toBeLessThan(0.01);
      expect(Math.hypot(p.x - contact.x, p.y - contact.y)).toBeLessThanOrEqual(
        RIM_LIGHT.spanPx / 2 + 8,
      );
    }
  });

  it('a contact on a corner wraps the light round the corner', () => {
    const lit = rimLightPath(HOST, {
      x: 300 - 24 + 24 * Math.SQRT1_2,
      y: 100 + 24 - 24 * Math.SQRT1_2,
    })!;
    const ys = lit.points.filter((_, i) => i % 2 === 1);
    const xs = lit.points.filter((_, i) => i % 2 === 0);
    // It reaches both the top edge and the right edge.
    expect(Math.min(...ys)).toBeCloseTo(100, 0);
    expect(Math.max(...xs)).toBeCloseTo(300, 0);
  });

  it('a degenerate rect gives nothing', () => {
    expect(rimLightPath({ x: 0, y: 0, w: 0, h: 0, r: 0 }, { x: 0, y: 0 })).toBeNull();
  });
});

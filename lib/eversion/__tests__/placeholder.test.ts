import { describe, expect, it } from 'vitest';
import { Compass, Gamepad2, Home } from 'lucide-react';

import { CAPTURE_DPR_CAP, CAPTURE_MAX_DIMENSION, PLACEHOLDER_ICON_PX } from '../constants';
import {
  iconPathData,
  inkFor,
  nodeToPath,
  placeholderGeometry,
  readIconData,
  rgbaToCss,
} from '../placeholder';

/**
 * The pure half of T18 (spec §6.5). The drawing itself needs a canvas and is
 * checked in the browser through the `placeholder` debug slot — see
 * `lib/eversion/README.md`.
 */

describe('placeholderGeometry', () => {
  it('is the viewport at min(dpr, the tier cap)', () => {
    const g = placeholderGeometry({ w: 1000, h: 600, dpr: 3 }, 'high');
    expect(g.scale).toBe(CAPTURE_DPR_CAP.high);
    expect(g.width).toBe(1500);
    expect(g.height).toBe(900);
    expect(placeholderGeometry({ w: 1000, h: 600, dpr: 1 }, 'high').scale).toBe(1);
    expect(placeholderGeometry({ w: 1000, h: 600, dpr: 3 }, 'low').width).toBe(1000);
  });

  it('holds both dimensions to the capture cap', () => {
    const g = placeholderGeometry({ w: 6000, h: 3000, dpr: 2 }, 'high');
    expect(Math.max(g.width, g.height)).toBeLessThanOrEqual(CAPTURE_MAX_DIMENSION);
  });

  it('centres the glyph horizontally and the glyph+label group vertically', () => {
    const v = { w: 800, h: 600, dpr: 1 };
    const g = placeholderGeometry(v, 'low');
    expect(g.iconX + PLACEHOLDER_ICON_PX / 2).toBeCloseTo(v.w / 2);
    expect(g.labelX).toBe(v.w / 2);
    const top = g.iconY;
    const bottom = g.labelY + 28;
    expect((top + bottom) / 2).toBeCloseTo(v.h / 2);
  });
});

describe('lucide icon data', () => {
  it('reads real nav icons without rendering them', () => {
    for (const icon of [Home, Compass, Gamepad2]) {
      const data = readIconData(icon);
      expect(data, 'lucide stopped exposing node data through render()').not.toBeNull();
      expect(data!.size).toBe(24);
      const paths = iconPathData(data!);
      expect(paths.length).toBeGreaterThan(0);
      for (const d of paths) expect(d).toMatch(/^[Mm]/);
    }
  });

  it('returns null, not a throw, for something that is not a lucide icon', () => {
    expect(readIconData(null)).toBeNull();
    expect(readIconData(() => null)).toBeNull();
    expect(
      readIconData({
        render: () => {
          throw new Error('x');
        },
      }),
    ).toBeNull();
  });
});

describe('nodeToPath', () => {
  it('passes a path through', () => {
    expect(nodeToPath(['path', { d: 'M1 2L3 4' }])).toBe('M1 2L3 4');
  });

  it('turns a circle into two arcs through its extremes', () => {
    expect(nodeToPath(['circle', { cx: 12, cy: 12, r: 3 }])).toBe(
      'M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z',
    );
  });

  it('turns a line, a polyline and a polygon into move/line commands', () => {
    expect(nodeToPath(['line', { x1: 1, y1: 2, x2: 3, y2: 4 }])).toBe('M1 2L3 4');
    expect(nodeToPath(['polyline', { points: '1 2 3 4 5 6' }])).toBe('M1 2L3 4L5 6');
    expect(nodeToPath(['polygon', { points: '1,2 3,4 5,6' }])).toBe('M1 2L3 4L5 6Z');
  });

  it('draws a square rect with straight edges and a rounded one with arcs', () => {
    expect(nodeToPath(['rect', { x: 2, y: 3, width: 4, height: 5 }])).toBe('M2 3H6V8H2Z');
    const rounded = nodeToPath(['rect', { x: 0, y: 0, width: 10, height: 10, rx: 2 }])!;
    expect(rounded.match(/A/g)).toHaveLength(4);
    // A radius larger than half the side is clamped, never inverted.
    const clamped = nodeToPath(['rect', { x: 0, y: 0, width: 4, height: 4, rx: 99 }])!;
    expect(clamped).toContain('A2 2');
  });

  it('skips tags lucide does not use and degenerate polylines', () => {
    expect(nodeToPath(['text', {}])).toBeNull();
    expect(nodeToPath(['polyline', { points: '1 2' }])).toBeNull();
    expect(nodeToPath(['polyline', { points: 'a b c d' }])).toBeNull();
  });
});

describe('colour helpers', () => {
  it('formats straight sRGB and clamps', () => {
    expect(rgbaToCss([1, 0.5, 0, 1])).toBe('rgb(255 128 0 / 1)');
    expect(rgbaToCss([2, -1, 0, 5])).toBe('rgb(255 0 0 / 1)');
  });

  it('picks dark ink on a light ground and light ink on a dark one', () => {
    expect(inkFor([1, 1, 1, 1])).toBe('rgb(20 20 20)');
    expect(inkFor([0.05, 0.05, 0.08, 1])).toBe('rgb(235 235 235)');
  });
});

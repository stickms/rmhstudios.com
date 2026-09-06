/**
 * "Built around the user", as an assertion rather than a slogan.
 *
 * The claim the whole service rests on is that a garment has no shape of its
 * own — it is the body it covers, plus a thickness. If that is true, changing
 * the figure must change every garment on it, and no garment can ever be
 * anywhere the body it covers is not.
 */

import { describe, expect, it } from 'vitest';
import { GARMENTS, getGarment } from '../garments';
import { buildFigure, figureBounds, DEFAULT_FIGURE, type FigureSpec } from '../figure';
import { buildBody, buildGarment, buildTrinket, rippleOrigin } from '../garment-hull';

const SHORT: FigureSpec = { height: 1.5, build: 0.2, taper: 0.3 };
const TALL: FigureSpec = { height: 2.0, build: 0.9, taper: 0.8 };

function bbox(parts: { grid: { positions: Float32Array } }[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (let i = 0; i < part.grid.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], part.grid.positions[i + k]);
        max[k] = Math.max(max[k], part.grid.positions[i + k]);
      }
    }
  }
  return { min, max };
}

describe('the body', () => {
  it('lofts to finite geometry and stands on the ground', () => {
    const segments = buildFigure(DEFAULT_FIGURE);
    const parts = buildBody(segments, rippleOrigin(segments));
    expect(parts.length).toBe(segments.length);
    const box = bbox(parts);
    for (const v of [...box.min, ...box.max]) expect(Number.isFinite(v)).toBe(true);
    // Soles at zero, crown at the requested height — within a centimetre, which
    // is the loft's own sampling error and not a proportion drifting.
    expect(box.min[1]).toBeGreaterThan(-0.02);
    expect(box.max[1]).toBeCloseTo(DEFAULT_FIGURE.height, 1);
  });

  it('is the height it is asked to be', () => {
    for (const spec of [SHORT, DEFAULT_FIGURE, TALL]) {
      const bounds = figureBounds(buildFigure(spec));
      expect(bounds.max[1]).toBeGreaterThan(spec.height * 0.97);
      expect(bounds.max[1]).toBeLessThan(spec.height * 1.03);
    }
  });

  it('gets wider with build, without getting taller', () => {
    const slight = figureBounds(buildFigure({ height: 1.75, build: 0, taper: 0.5 }));
    const broad = figureBounds(buildFigure({ height: 1.75, build: 1, taper: 0.5 }));
    expect(broad.max[0] - broad.min[0]).toBeGreaterThan(slight.max[0] - slight.min[0]);
    expect(broad.max[1]).toBeCloseTo(slight.max[1], 6);
  });
});

describe('every garment', () => {
  const segments = buildFigure(DEFAULT_FIGURE);
  const origin = rippleOrigin(segments);

  it.each(GARMENTS.map((g) => [g.id, g] as const))('%s builds finite geometry', (_id, garment) => {
    if (garment.trinket) {
      const wire = buildTrinket(garment.trinket, segments);
      expect(wire.positions.length).toBeGreaterThan(0);
      expect(wire.positions.length % 6).toBe(0);
      for (const v of wire.positions) expect(Number.isFinite(v)).toBe(true);
      return;
    }
    const parts = buildGarment(garment, segments, origin);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      for (const v of part.grid.positions) expect(Number.isFinite(v)).toBe(true);
      for (const v of part.grid.normals) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('puts two of anything that covers a paired limb', () => {
    const trousers = getGarment('trousers')!;
    const parts = buildGarment(trousers, segments, origin);
    const thighs = parts.filter((p) => p.segment === 'thigh');
    expect(thighs.map((p) => p.side).sort()).toEqual(['left', 'right']);
  });

  it('sits OUTSIDE the body it covers, never inside it', () => {
    // The whole layering model in one check: a jumper's sleeve must enclose the
    // arm, or the wearer's elbow comes through it.
    const body = buildBody(segments, origin);
    const arm = body.find((p) => p.segment === 'upperArm' && p.side === 'left')!;
    const jumper = buildGarment(getGarment('jumper')!, segments, origin);
    const sleeve = jumper.find((p) => p.segment === 'upperArm' && p.side === 'left')!;
    expect(bbox([sleeve]).max[0] - bbox([sleeve]).min[0]).toBeGreaterThan(
      bbox([arm]).max[0] - bbox([arm]).min[0],
    );
  });

  it('layers outward in the order the outfit says', () => {
    const shirt = bbox(buildGarment(getGarment('shirt')!, segments, origin));
    const jumper = bbox(buildGarment(getGarment('jumper')!, segments, origin));
    const coat = bbox(buildGarment(getGarment('coat')!, segments, origin));
    const depth = (b: ReturnType<typeof bbox>) => b.max[2] - b.min[2];
    expect(depth(jumper)).toBeGreaterThan(depth(shirt));
    expect(depth(coat)).toBeGreaterThan(depth(jumper));
  });
});

describe('built around the user', () => {
  it('grows every garment when the figure grows', () => {
    for (const garment of GARMENTS.filter((g) => !g.trinket)) {
      const short = buildFigure(SHORT);
      const tall = buildFigure(TALL);
      const a = bbox(buildGarment(garment, short, rippleOrigin(short)));
      const b = bbox(buildGarment(garment, tall, rippleOrigin(tall)));
      expect(
        b.max[1],
        `${garment.id} did not follow the figure upward — it has a shape of its own`,
      ).toBeGreaterThan(a.max[1]);
    }
  });

  it('measures every layer from ONE origin, so a poke is one wave', () => {
    const segments = buildFigure(DEFAULT_FIGURE);
    const origin = rippleOrigin(segments);
    const parts = [
      ...buildBody(segments, origin),
      ...buildGarment(getGarment('coat')!, segments, origin),
    ];
    for (const part of parts) {
      const i = 0;
      const dx = part.grid.positions[i] - origin[0];
      const dy = part.grid.positions[i + 1] - origin[1];
      const dz = part.grid.positions[i + 2] - origin[2];
      const len = Math.hypot(dx, dy, dz);
      expect(part.grid.rays[i]).toBeCloseTo(dx / len, 5);
      expect(part.grid.radii[0]).toBeCloseTo(len, 5);
    }
  });
});

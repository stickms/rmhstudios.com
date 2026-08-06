import { describe, it, expect } from 'vitest';
import {
  GLOBE_PERSP,
  LAT_SPAN_DEG,
  PITCH_LIMIT,
  RING_COS,
  RING_SAMPLES,
  RING_SIN,
  anchorAt,
  categoryLatitude,
  clampPitch,
  globeK,
  liftFor,
  pickNearest,
  timeLongitude,
  toScreen,
  viewOf,
} from '@/lib/kaikai-debt/globe';
import { unprojectSphere, unrotateSphere } from '@/lib/fluid';

const unit = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
/** An anchor carries its direction as bx/by/bz — the names the renderer reads. */
const anchorUnit = (a: { bx: number; by: number; bz: number }) => Math.hypot(a.bx, a.by, a.bz);

describe('placement', () => {
  it('spreads the categories across the usable band, clear of the poles', () => {
    // A point at a pole can only be brought to the front by tilting past the
    // pitch limit — i.e. it could never be inspected.
    for (let i = 0; i < 8; i++) {
      const latitude = categoryLatitude(i, 8);
      expect(Math.abs(latitude)).toBeLessThanOrEqual(LAT_SPAN_DEG);
      expect(Math.abs(latitude)).toBeLessThan(90 - 10);
    }
  });

  it('gives each category its own ring, in order', () => {
    const latitudes = Array.from({ length: 8 }, (_, i) => categoryLatitude(i, 8));
    for (let i = 1; i < latitudes.length; i++) {
      expect(latitudes[i]!).toBeLessThan(latitudes[i - 1]!);
    }
  });

  it('centres a lone category on the equator', () => {
    expect(categoryLatitude(0, 1)).toBe(0);
  });

  it('puts the newest bucket at the prime meridian and the oldest round the back', () => {
    const count = 12;
    expect(timeLongitude(0, count)).toBe(-180);
    expect(timeLongitude(count - 1, count)).toBeCloseTo(-180 + (360 * 11) / 12, 9);
    expect(timeLongitude(0, 1)).toBe(0);
  });

  it('produces unit direction cosines', () => {
    for (const [lat, lon] of [
      [0, 0],
      [45, 90],
      [-30, -170],
      [54, 179],
    ] as const) {
      expect(anchorUnit(anchorAt(lat, lon))).toBeCloseTo(1, 12);
    }
  });

  it('puts north up on screen — y grows downward', () => {
    // Getting this wrong renders the data upside down in exactly one view.
    expect(anchorAt(45, 0).by).toBeLessThan(0);
    expect(anchorAt(-45, 0).by).toBeGreaterThan(0);
  });

  it('faces the prime meridian toward the viewer at rest', () => {
    expect(anchorAt(0, 0).bz).toBeCloseTo(1, 12);
  });
});

describe('projection', () => {
  it('foreshortens the far face and magnifies the near one', () => {
    expect(globeK(1)).toBeGreaterThan(globeK(-1));
    expect(globeK(0)).toBeCloseTo(1, 12);
  });

  it('keeps a rotated direction on the unit sphere', () => {
    const anchor = anchorAt(31, -77);
    for (const [yaw, pitch] of [
      [0, 0],
      [123, -40],
      [-260, 55],
    ] as const) {
      expect(unit(viewOf(anchor, yaw, pitch))).toBeCloseTo(1, 12);
    }
  });

  it('lifts a point off the surface by the swell it is given', () => {
    const anchor = anchorAt(0, 0);
    const surface = viewOf(anchor, 0, 0, 1);
    const lifted = viewOf(anchor, 0, 0, 1.4);
    expect(lifted.z).toBeCloseTo(surface.z * 1.4, 12);
  });

  it('agrees with the inverse the ripple uses', () => {
    // The poke has to land where it was aimed, on a globe that may be turned to
    // any orientation — `unprojectSphere` + `unrotateSphere` must undo exactly
    // what `viewOf` + `toScreen` did.
    // Chosen so the anchor ends up on the NEAR face — the only face the
    // inverse is defined on (a screen point maps to two sphere points, and
    // `unprojectSphere` returns the one you can see).
    const yaw = -55;
    const pitch = -12;
    const anchor = anchorAt(18, 65);
    const view = viewOf(anchor, yaw, pitch);
    if (view.z <= 0) throw new Error('test point must be on the near face');
    const screen = toScreen(view, 1);
    const recovered = unprojectSphere(screen.x, screen.y, GLOBE_PERSP);
    expect(recovered).not.toBeNull();
    const body = unrotateSphere(recovered!, yaw, pitch);
    expect(body.x).toBeCloseTo(anchor.bx, 4);
    expect(body.y).toBeCloseTo(anchor.by, 4);
    expect(body.z).toBeCloseTo(anchor.bz, 4);
  });

  it('scales screen coordinates by the radius', () => {
    const view = viewOf(anchorAt(20, 30), 0, 0);
    const small = toScreen(view, 100);
    const large = toScreen(view, 200);
    expect(large.x).toBeCloseTo(small.x * 2, 9);
  });
});

describe('the cage', () => {
  it('precomputes a closed ring of sample angles', () => {
    expect(RING_COS).toHaveLength(RING_SAMPLES + 1);
    expect(RING_SIN).toHaveLength(RING_SAMPLES + 1);
    // The last sample closes the circle back onto the first.
    expect(RING_COS[RING_SAMPLES]).toBeCloseTo(RING_COS[0]!, 12);
    expect(RING_SIN[RING_SAMPLES]).toBeCloseTo(RING_SIN[0]!, 12);
  });

  it('samples the unit circle', () => {
    for (let s = 0; s <= RING_SAMPLES; s++) {
      expect(Math.hypot(RING_COS[s]!, RING_SIN[s]!)).toBeCloseTo(1, 12);
    }
  });
});

describe('lift', () => {
  it('never flattens a real bucket to nothing', () => {
    // A bucket with one small debt in it is still a pin standing on the surface
    // rather than a mark painted on it.
    expect(liftFor(1, 1_000_000)).toBeGreaterThan(0);
  });

  it('is monotone in value and compresses the range', () => {
    const small = liftFor(10, 1_000);
    const large = liftFor(1_000, 1_000);
    expect(large).toBeGreaterThan(small);
    // A square root, not a linear map: linear gives one spike and 383 flat cells.
    expect(small / large).toBeGreaterThan(10 / 1_000);
  });

  it('degrades gracefully with no data', () => {
    expect(liftFor(0, 0)).toBeGreaterThan(0);
    expect(Number.isFinite(liftFor(5, 0))).toBe(true);
  });
});

describe('picking', () => {
  const points = [
    { sx: 0, sy: 0, depth: 0.9 },
    { sx: 3, sy: 3, depth: 0.2 },
    { sx: 40, sy: 40, depth: 0.8 },
    { sx: 1, sy: 1, depth: -0.5 },
  ];

  it('finds the nearest front-facing point', () => {
    expect(pickNearest(points, 0, 0, 12)).toBe(0);
  });

  it('never picks something behind the globe', () => {
    // A point on the far side projects to the same region as one on the near
    // side; describing the one you cannot see is the bug this prevents.
    expect(pickNearest([points[3]!], 1, 1, 12)).toBe(-1);
  });

  it('returns −1 when nothing is inside the hit radius', () => {
    expect(pickNearest(points, 200, 200, 12)).toBe(-1);
  });
});

describe('pitch clamping', () => {
  it('is hard, not rubber-banded — a chart must hold still to be read', () => {
    expect(clampPitch(200)).toBe(PITCH_LIMIT);
    expect(clampPitch(-200)).toBe(-PITCH_LIMIT);
    expect(clampPitch(10)).toBe(10);
  });
});

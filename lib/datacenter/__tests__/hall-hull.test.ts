import { describe, expect, it } from 'vitest';
import { genusOf, loft, topologyOf, type LoftStation } from '@/lib/loft/grid';
import { buildHull } from '@/lib/rideshare/car-hull';
import { CAR_BODIES } from '@/lib/rideshare/cars';
import {
  HALL_SAMPLES,
  HALL_STATIONS,
  hallHull,
  hallStations,
  hallWireframe,
  type HallSpec,
} from '../hall-hull';
import { CAMPUSES, FLEET_PUE, TOTAL_HALLS, TOTAL_MW } from '../campuses';

/**
 * The hall is a box, and the claim this file exists to hold is that a box here
 * is topologically a SPHERE — the same surface the navigation globe, the RMH
 * family of cars and the RMH Fashion figure are, bent into a different shape.
 *
 * It is worth testing because it is easy to lose by accident and impossible to
 * see. A section list edited so an end no longer closes leaves a hall that
 * renders identically at a glance and is a TUBE: two mouths, a boundary, and no
 * longer a member of the family. `euler === 2` is the difference, and the
 * open-ended case at the bottom is here to prove the measurement can tell.
 */

const SPEC: HallSpec = { length: 92, width: 34, height: 14, square: 6.6, pitch: 0.2 };

describe('the hall is a closed genus-0 surface', () => {
  it('has no boundary and no edge shared by three faces', () => {
    const t = topologyOf(hallHull(SPEC));
    expect({ boundary: t.boundaryEdges, nonManifold: t.nonManifoldEdges }).toEqual({
      boundary: 0,
      nonManifold: 0,
    });
  });

  it('is one piece with Euler characteristic 2 — a sphere', () => {
    const t = topologyOf(hallHull(SPEC));
    expect({ components: t.components, euler: t.euler, genus: genusOf(t) }).toEqual({
      components: 1,
      euler: 2,
      genus: 0,
    });
  });

  it('is a sphere for every campus in the estate, not just the flagship', () => {
    const measured = CAMPUSES.map((c) => ({
      code: c.code,
      genus: genusOf(topologyOf(hallHull(c.hall))),
    }));
    expect(measured).toEqual(CAMPUSES.map((c) => ({ code: c.code, genus: 0 })));
  });

  it('joins a family that already had the property', () => {
    // The point of "the datacenter ALSO must be a sphere": the cars were
    // already one, and this is the arithmetic that says so in the same terms.
    const cars = CAR_BODIES.map((spec) => genusOf(topologyOf(buildHull(spec))));
    expect(cars.every((g) => g === 0)).toBe(true);
  });

  it('closes both ends to a single point rather than a small ring', () => {
    const stations = hallStations(SPEC);
    const ends = [stations[0], stations[stations.length - 1]];
    expect(ends.map((s) => [s.halfRight, s.halfUp])).toEqual([
      [0, 0],
      [0, 0],
    ]);

    // And the loft honours it: every sample of an end station is one point.
    const grid = hallHull(SPEC);
    const first = new Set<string>();
    const last = new Set<string>();
    const base = (HALL_STATIONS - 1) * HALL_SAMPLES;
    for (let r = 0; r < HALL_SAMPLES; r++) {
      const p = (v: number) =>
        `${grid.positions[v * 3].toFixed(6)},${grid.positions[v * 3 + 1].toFixed(6)},${grid.positions[v * 3 + 2].toFixed(6)}`;
      first.add(p(r));
      last.add(p(base + r));
    }
    expect([first.size, last.size]).toEqual([1, 1]);
  });

  it('would NOT be a sphere with the ends left open — the measurement discriminates', () => {
    const open: LoftStation[] = hallStations(SPEC).map((s, i, all) =>
      i === 0 || i === all.length - 1
        ? { ...s, halfRight: SPEC.width / 2, halfUp: SPEC.height / 2 }
        : s,
    );
    const t = topologyOf(loft(open, { samples: HALL_SAMPLES }));
    expect({ euler: t.euler, closed: t.boundaryEdges === 0, genus: genusOf(t) }).toEqual({
      euler: 0,
      closed: false,
      genus: null,
    });
  });

  it('is a sphere at any station and sample count, not just the shipped one', () => {
    const spheres = [
      { stations: 4, samples: 8 },
      { stations: 9, samples: 12 },
      { stations: 40, samples: 36 },
    ].map(({ stations, samples }) => {
      const list: LoftStation[] = Array.from({ length: stations }, (_, i) => {
        const end = i === 0 || i === stations - 1;
        return {
          centre: [i / (stations - 1) - 0.5, 0, 0] as [number, number, number],
          right: [0, 0, 1] as [number, number, number],
          up: [0, 1, 0] as [number, number, number],
          halfRight: end ? 0 : 0.3,
          halfUp: end ? 0 : 0.2,
          round: 6,
          crown: 0.2,
        };
      });
      return genusOf(topologyOf(loft(list, { samples })));
    });
    expect(spheres).toEqual([0, 0, 0]);
  });
});

describe('the hall takes the shape it is given', () => {
  it('spans the length, width and height on the spec', () => {
    const grid = hallHull(SPEC);
    const [hx, hy, hz] = grid.half;
    expect(hx * 2).toBeCloseTo(SPEC.length, 5);
    // The crown narrows the roof, so the width is reached at the waist and the
    // height at the ridge; both are the full spec figure.
    expect(hz * 2).toBeCloseTo(SPEC.width, 1);
    expect(hy * 2).toBeCloseTo(SPEC.height, 1);
  });

  it('grows when the spec does, in the axis the spec grew', () => {
    const taller = hallHull({ ...SPEC, height: SPEC.height * 1.5 });
    const base = hallHull(SPEC);
    expect(taller.half[1]).toBeGreaterThan(base.half[1]);
    expect(taller.half[0]).toBeCloseTo(base.half[0], 5);
  });
});

describe('the wireframe', () => {
  const wf = hallWireframe(SPEC);

  it('draws the three ink tiers the cage names', () => {
    const kinds = new Set(wf.wires.map((w) => w.kind));
    expect([...kinds].sort()).toEqual(['bay', 'major', 'run']);
  });

  it('draws exactly four majors — the eaves, the ridge and the two waists', () => {
    expect(wf.wires.filter((w) => w.kind === 'major')).toHaveLength(4);
  });

  it('draws no ring at a pole, where a ring is one point repeated', () => {
    // Every emitted polyline must cover more than one distinct point, or it is
    // a dot wearing a stroke width.
    const degenerate = wf.wires.filter((w) => new Set(w.points.split(' ')).size < 2);
    expect(degenerate).toEqual([]);
  });

  it('keeps every point inside the viewBox it reports', () => {
    const [, , vw, vh] = wf.viewBox.split(' ').map(Number);
    const outside = wf.wires.flatMap((w) =>
      w.points
        .split(' ')
        .map((p) => p.split(',').map(Number))
        .filter(([x, y]) => x < 0 || y < 0 || x > vw || y > vh),
    );
    expect(outside).toEqual([]);
  });

  it('reports depth in 0…1, so a page can fade the far side', () => {
    const bad = wf.wires.filter((w) => !(w.depth >= 0 && w.depth <= 1));
    expect(bad).toEqual([]);
  });
});

describe('the estate totals are derived, not typed twice', () => {
  it('sums the campuses', () => {
    expect({ mw: TOTAL_MW, halls: TOTAL_HALLS, sites: CAMPUSES.length }).toEqual({
      mw: 148,
      halls: 16,
      sites: 6,
    });
  });

  it('weights fleet PUE by load, so a small efficient site cannot flatter it', () => {
    const unweighted = CAMPUSES.reduce((n, c) => n + c.pue, 0) / CAMPUSES.length;
    expect(FLEET_PUE).toBeCloseTo(1.116, 3);
    // The weighted figure is the honest one and is NOT the mean of the column.
    expect(Math.abs(FLEET_PUE - unweighted)).toBeGreaterThan(0.01);
  });
});

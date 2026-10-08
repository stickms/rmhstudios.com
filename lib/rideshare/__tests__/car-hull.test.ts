/**
 * The fleet's geometry, checked where it is cheap to check it.
 *
 * The renderer is a WebGL context and cannot be asserted on in a unit test, but
 * everything that decides what a vehicle LOOKS like happens before it gets
 * there: the section list, the monotone interpolation through it, the lofted
 * grid, and the side elevation the picker and the no-WebGL fallback both draw.
 * All of that is pure, so all of that is tested here.
 *
 * The failure these guard against is specific and silent: one NaN anywhere in a
 * position buffer takes the whole body off screen, with no error, in the one
 * environment (a real GPU) where nobody is watching a console.
 */

import { describe, expect, it } from 'vitest';
import { RIDE_CLASSES } from '../classes';
import { CAR_BODIES, FLEET_HEIGHT, FLEET_RADIUS, getCarBody } from '../cars';
import {
  SAMPLES,
  STATIONS,
  buildHull,
  buildRotor,
  buildSilhouette,
  buildWheels,
  rotorHub,
  sectionAt,
  wheelCentres,
} from '../car-hull';

describe('the fleet catalogue', () => {
  it('has a body for every ride class, and no orphan bodies', () => {
    expect(CAR_BODIES.map((b) => b.id).sort()).toEqual(RIDE_CLASSES.map((c) => c.id).sort());
  });

  it.each(CAR_BODIES.map((b) => [b.id, b] as const))('%s is a well-formed body', (_id, body) => {
    expect(body.sections.length).toBeGreaterThanOrEqual(4);
    expect(body.sections[0].t).toBe(0);
    expect(body.sections[body.sections.length - 1].t).toBe(1);
    expect(body.axles.length).toBeGreaterThanOrEqual(1);
    expect(body.accent).toBeGreaterThanOrEqual(0);
    expect(body.accent).toBeLessThanOrEqual(1);

    let previous = -1;
    for (const s of body.sections) {
      expect(s.t).toBeGreaterThan(previous);
      previous = s.t;
      expect(s.top).toBeGreaterThan(s.floor);
      expect(s.halfWidth).toBeGreaterThanOrEqual(0);
      // Below 2 the superellipse exponent inverts and the section turns into a
      // four-pointed star, which is a body nobody would ship and an easy typo.
      expect(s.round).toBeGreaterThanOrEqual(2);
    }
  });

  it('closes both ends, so the meridians have poles to converge on', () => {
    for (const body of CAR_BODIES) {
      expect(body.sections[0].halfWidth).toBe(0);
      expect(body.sections[body.sections.length - 1].halfWidth).toBe(0);
    }
  });

  it('frames on extents that actually contain the fleet', () => {
    for (const body of CAR_BODIES) {
      const reach = body.rotor
        ? Math.abs(body.length * (0.5 - body.rotor.t)) + body.rotor.radius
        : body.length / 2;
      expect(reach).toBeLessThanOrEqual(FLEET_RADIUS + 1e-9);
      for (const s of body.sections) expect(s.top).toBeLessThanOrEqual(FLEET_HEIGHT + 1e-9);
      if (body.rotor) expect(body.rotor.y).toBeLessThanOrEqual(FLEET_HEIGHT + 1e-9);
    }
  });
});

describe('the loft', () => {
  it.each(CAR_BODIES.map((b) => [b.id, b] as const))('%s lofts to finite geometry', (_id, body) => {
    const hull = buildHull(body);
    expect(hull.positions).toHaveLength(STATIONS * SAMPLES * 3);
    expect(hull.radii).toHaveLength(STATIONS * SAMPLES);

    for (const v of hull.positions) expect(Number.isFinite(v)).toBe(true);
    for (const v of hull.normals) expect(Number.isFinite(v)).toBe(true);
    for (const v of hull.rays) expect(Number.isFinite(v)).toBe(true);
    for (const r of hull.radii) expect(r).toBeGreaterThan(0);
  });

  it.each(CAR_BODIES.map((b) => [b.id, b] as const))('%s has outward unit normals', (_id, body) => {
    const hull = buildHull(body);
    for (let v = 0; v < hull.radii.length; v++) {
      const i = v * 3;
      const length = Math.hypot(hull.normals[i], hull.normals[i + 1], hull.normals[i + 2]);
      expect(length).toBeCloseTo(1, 5);
      // Outward is what a ripple pushes along, so a flipped normal is a dent.
      const facing =
        hull.normals[i] * hull.rays[i] +
        hull.normals[i + 1] * hull.rays[i + 1] +
        hull.normals[i + 2] * hull.rays[i + 2];
      expect(facing).toBeGreaterThan(0);
    }
  });

  it('stands every body on the ground and inside its own declared box', () => {
    for (const body of CAR_BODIES) {
      const hull = buildHull(body);
      const widest = Math.max(...body.sections.map((s) => s.halfWidth));
      const tallest = Math.max(...body.sections.map((s) => s.top));
      for (let v = 0; v < hull.radii.length; v++) {
        const i = v * 3;
        expect(Math.abs(hull.positions[i])).toBeLessThanOrEqual(body.length / 2 + 1e-6);
        expect(hull.positions[i + 1]).toBeGreaterThanOrEqual(-1e-6);
        expect(hull.positions[i + 1]).toBeLessThanOrEqual(tallest + 1e-6);
        expect(Math.abs(hull.positions[i + 2])).toBeLessThanOrEqual(widest + 1e-6);
      }
    }
  });

  it('indexes only vertices that exist', () => {
    const hull = buildHull(CAR_BODIES[0]);
    const count = hull.radii.length;
    const lists = [hull.indices, hull.cage.minor, hull.cage.parallel, hull.cage.major];
    for (const list of lists) {
      expect(list.length).toBeGreaterThan(0);
      for (const index of list) expect(index).toBeLessThan(count);
    }
    // Line tiers are segment PAIRS; the shell is triangles.
    for (const list of [hull.cage.minor, hull.cage.parallel, hull.cage.major]) {
      expect(list.length % 2).toBe(0);
    }
    expect(hull.indices.length % 3).toBe(0);
  });

  it('draws the four major lines and nothing else in that tier', () => {
    // The waistline (both sides), the roof centreline and the keel — the body's
    // own equator and prime meridian. Four samples, no more.
    const hull = buildHull(CAR_BODIES[0]);
    const used = new Set<number>();
    for (const index of hull.cage.major) used.add(index % SAMPLES);
    expect([...used].sort((a, b) => a - b)).toEqual([
      0,
      SAMPLES / 4,
      SAMPLES / 2,
      (3 * SAMPLES) / 4,
    ]);
  });

  it('reads a section back at the stations it was given', () => {
    const body = CAR_BODIES[0];
    for (const section of body.sections) {
      const read = sectionAt(body, section.t);
      expect(read.halfWidth).toBeCloseTo(section.halfWidth, 6);
      expect(read.top).toBeCloseTo(section.top, 6);
      expect(read.floor).toBeCloseTo(section.floor, 6);
    }
  });
});

describe('running gear', () => {
  it('puts a wheel on the centreline when the axle has no track', () => {
    const bike = getCarBody('RMH_BIKE');
    expect(bike).toBeDefined();
    const centres = wheelCentres(bike!);
    expect(centres).toHaveLength(bike!.axles.length);
    for (const c of centres) expect(c.z).toBe(0);
  });

  it('puts two wheels on every tracked axle, standing on the ground', () => {
    const car = getCarBody('RMH_X')!;
    const centres = wheelCentres(car);
    expect(centres).toHaveLength(car.axles.length * 2);
    for (const axle of car.axles) {
      // Both axles share a track on most bodies, so an axle is identified by
      // where it sits along the length, not by how far apart its wheels are.
      const x = car.length * (0.5 - axle.t);
      const pair = centres.filter((c) => Math.abs(c.x - x) < 1e-9);
      expect(pair).toHaveLength(2);
      expect(pair.map((c) => c.z).sort()).toEqual([-axle.halfTrack, axle.halfTrack]);
      // A wheel centre sits exactly one rolling radius above the road.
      for (const c of pair) expect(c.y).toBeCloseTo(axle.radius, 9);
    }
  });

  it('draws wheels as line-segment pairs with no NaNs', () => {
    for (const body of CAR_BODIES) {
      const { positions } = buildWheels(body);
      expect(positions.length % 6).toBe(0);
      for (const v of positions) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('builds the rotor around the origin so it spins about its own mast', () => {
    const heli = CAR_BODIES.find((b) => b.rotor);
    expect(heli?.rotor).toBeDefined();
    const hub = rotorHub(heli!.rotor!, heli!);
    expect(hub.mast).toBeGreaterThan(0);
    const { positions } = buildRotor(heli!.rotor!, hub.mast);
    let maxRadius = 0;
    let lowest = 0;
    for (let i = 0; i < positions.length; i += 3) {
      // Everything is in the disc's own plane except the mast, which is the one
      // thing allowed to hang below it.
      expect(positions[i + 1]).toBeLessThanOrEqual(0);
      lowest = Math.min(lowest, positions[i + 1]);
      if (positions[i + 1] === 0) {
        maxRadius = Math.max(maxRadius, Math.hypot(positions[i], positions[i + 2]));
      }
    }
    expect(maxRadius).toBeCloseTo(heli!.rotor!.radius, 5);
    expect(lowest).toBeCloseTo(-hub.mast, 5);
  });
});

describe('the side elevation', () => {
  it.each(CAR_BODIES.map((b) => [b.id, b] as const))('%s draws a closed outline', (_id, body) => {
    const s = buildSilhouette(body);
    expect(s.outline.startsWith('M')).toBe(true);
    expect(s.outline.endsWith('Z')).toBe(true);
    expect(s.outline).not.toMatch(/NaN/);
    expect(s.box.width).toBeCloseTo(body.length, 5);
    expect(s.box.height).toBeGreaterThan(0);
  });

  it('gives each wheel its own axle’s radius', () => {
    const car = getCarBody('RMH_XL')!;
    const s = buildSilhouette(car);
    expect(s.wheels).toHaveLength(car.axles.length * 2);
    for (const w of s.wheels) {
      // SVG y is flipped, so a wheel sitting on the ground has cy = −radius.
      expect(w.cy).toBeCloseTo(-w.r, 6);
      expect(car.axles.some((a) => Math.abs(a.radius - w.r) < 1e-6)).toBe(true);
    }
  });

  it('only the helicopter draws a rotor', () => {
    for (const body of CAR_BODIES) {
      expect(Boolean(buildSilhouette(body).rotor)).toBe(Boolean(body.rotor));
    }
  });
});

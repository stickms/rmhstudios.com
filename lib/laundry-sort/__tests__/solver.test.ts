/**
 * The cloth solver, checked against the properties that make it read as cloth.
 *
 * A soft-body sim has no single "correct output" to assert against, so these
 * test the invariants instead: the fabric does not stretch, it does not blow
 * up, it does not pass through the arena, it falls, and a garment released
 * over a bin ends up in it.
 */

import { describe, it, expect } from 'vitest';
import { ClothWorld } from '../solver';
import { buildArena, pointInBox } from '../arena';
import { PATTERNS, GARMENT_KINDS } from '../patterns';
import { ARENA, BIN, FIXED_DT, SUBSTEPS, binCenterX } from '../constants';

function spawnOne(world: ClothWorld, overrides: Partial<Parameters<ClothWorld['spawn']>[0]> = {}) {
  return world.spawn({
    kind: 'shirt',
    colorIndex: 0,
    x: 0,
    z: 0,
    roll: 0,
    yaw: 0,
    vx: 0,
    vy: 0,
    spinX: 0,
    spinY: 0,
    spinZ: 0,
    bow: 0,
    ...overrides,
  });
}

function step(world: ClothWorld, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step(FIXED_DT, SUBSTEPS);
}

describe('garment patterns', () => {
  it('cuts a connected piece for every kind', () => {
    for (const kind of GARMENT_KINDS) {
      const pattern = PATTERNS[kind];
      expect(pattern.count).toBeGreaterThan(10);
      expect(pattern.structural.length).toBeGreaterThan(0);
      expect(pattern.indices.length % 3).toBe(0);
      // Every constraint references a real particle.
      for (const index of pattern.structural) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(pattern.count);
      }
      for (const index of pattern.indices) {
        expect(index).toBeLessThan(pattern.count);
      }
    }
  });

  it('gives rest lengths that match the lattice spacing', () => {
    const shirt = PATTERNS.shirt;
    for (const rest of shirt.structuralRest) {
      expect(rest).toBeCloseTo(shirt.spacing, 5);
    }
  });

  it('keeps the same lattice on every device — resolution is never tiered', () => {
    // Nothing in the pattern module reads device capability. If a future
    // change makes resolution adaptive, a race stops being fair, so this
    // asserts the counts are literal constants.
    expect(PATTERNS.shirt.count).toBe(44);
    expect(PATTERNS.pants.count).toBe(51);
    expect(PATTERNS.towel.count).toBe(42);
    expect(PATTERNS.sock.count).toBe(22);
  });
});

describe('ClothWorld', () => {
  it('falls under gravity', () => {
    const world = new ClothWorld(buildArena());
    const garment = spawnOne(world);
    const startY = garment.cy;
    step(world, 30);
    expect(garment.cy).toBeLessThan(startY);
  });

  it('holds the weave together — no stretching under a half-second fall', () => {
    const world = new ClothWorld(buildArena());
    const garment = spawnOne(world, { kind: 'towel' });
    step(world, 30);

    const { topology, pos } = garment;
    let worst = 0;
    for (let k = 0; k < topology.structuralRest.length; k++) {
      const a = topology.structural[k * 2] * 3;
      const b = topology.structural[k * 2 + 1] * 3;
      const length = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]);
      worst = Math.max(
        worst,
        Math.abs(length - topology.structuralRest[k]) / topology.structuralRest[k],
      );
    }
    // Real cotton is effectively inextensible; 5% is generous.
    expect(worst).toBeLessThan(0.05);
  });

  it('never produces a non-finite particle', () => {
    const world = new ClothWorld(buildArena());
    for (const kind of GARMENT_KINDS) spawnOne(world, { kind, x: Math.random() * 0 });
    step(world, 600);
    for (const garment of world.garments) {
      for (const value of garment.pos) expect(Number.isFinite(value)).toBe(true);
      for (const value of garment.vel) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('keeps cloth inside the arena', () => {
    const world = new ClothWorld(buildArena());
    // Thrown hard at a corner — the case that tunnels if contacts only run
    // once per tick instead of once per substep.
    spawnOne(world, { kind: 'sock', x: 3.5, vx: 14, vy: -14 });
    step(world, 240);

    const garment = world.garments[0];
    const slack = 0.25;
    for (let i = 0; i < garment.topology.count; i++) {
      expect(garment.pos[i * 3]).toBeLessThan(ARENA.halfWidth + slack);
      expect(garment.pos[i * 3]).toBeGreaterThan(-ARENA.halfWidth - slack);
      expect(garment.pos[i * 3 + 2]).toBeLessThan(ARENA.halfDepth + slack);
      expect(garment.pos[i * 3 + 2]).toBeGreaterThan(-ARENA.halfDepth - slack);
      expect(garment.pos[i * 3 + 1]).toBeGreaterThan(ARENA.floorY - slack);
    }
  });

  it('comes to rest on the floor rather than jittering forever', () => {
    const world = new ClothWorld(buildArena());
    // Between two bins, so it lands on open floor.
    const gap = (binCenterX(0) + binCenterX(1)) / 2;
    const garment = spawnOne(world, { kind: 'shirt', x: gap });
    step(world, 420);
    expect(garment.speed).toBeLessThan(0.35);
    expect(garment.restingFor).toBeGreaterThan(0);
  });

  it('settles a garment dropped over a bin inside that bin', () => {
    const arena = buildArena();
    const world = new ClothWorld(arena);
    const garment = spawnOne(world, { kind: 'shirt', x: binCenterX(2), z: 0 });
    step(world, 480);

    const bin = arena.bins[2];
    expect(world.fractionInside(garment, bin.interior)).toBeGreaterThan(0.62);
    expect(garment.cy).toBeLessThan(BIN.height);
  });

  it('pushes two overlapping garments apart — cloth-on-cloth contacts hold', () => {
    const world = new ClothWorld(buildArena());
    // Deliberately spawned into each other. Without inter-garment contacts they
    // would fall as one indistinguishable mass and a full bin would render as a
    // flickering blob rather than a pile.
    const a = spawnOne(world, { kind: 'towel', x: 0, z: 0 });
    const b = spawnOne(world, { kind: 'towel', x: 0, z: 0 });

    const closest = (): number => {
      let min = Infinity;
      for (let i = 0; i < a.topology.count; i++) {
        for (let j = 0; j < b.topology.count; j++) {
          min = Math.min(
            min,
            Math.hypot(
              a.pos[i * 3] - b.pos[j * 3],
              a.pos[i * 3 + 1] - b.pos[j * 3 + 1],
              a.pos[i * 3 + 2] - b.pos[j * 3 + 2],
            ),
          );
        }
      }
      return min;
    };

    expect(closest()).toBeLessThan(0.001);
    step(world, 60);
    // Separated to roughly the contact diameter. Not exactly, because the
    // constraint is resolved once per tick and cloth keeps deforming.
    expect(closest()).toBeGreaterThan(0.03);
  });

  it('bumps its revision only when the garment set changes', () => {
    const world = new ClothWorld(buildArena());
    const before = world.revision;
    const garment = spawnOne(world);
    expect(world.revision).toBe(before + 1);

    step(world, 10);
    expect(world.revision).toBe(before + 1);

    world.remove(garment.id);
    expect(world.revision).toBe(before + 2);
  });
});

describe('grabbing', () => {
  /** A ray aimed straight down the -z axis at a world point. */
  function rayAt(x: number, y: number) {
    return { ox: x, oy: y, oz: 8, dx: 0, dy: 0, dz: -1 };
  }

  it('picks the cloth under the ray and nothing else', () => {
    const world = new ClothWorld(buildArena());
    const garment = spawnOne(world, { x: 0 });
    step(world, 2);

    expect(world.pick(rayAt(garment.cx, garment.cy))?.garmentId).toBe(garment.id);
    // Far to the side — nothing to grab.
    expect(world.pick(rayAt(3.9, garment.cy))).toBeNull();
  });

  it('carries the garment to where the pointer goes', () => {
    const world = new ClothWorld(buildArena());
    const garment = spawnOne(world, { x: 0 });
    step(world, 2);

    expect(world.beginGrab(rayAt(garment.cx, garment.cy))).toBe(true);
    expect(world.heldGarmentId).toBe(garment.id);

    const target = -2.5;
    for (let i = 0; i < 60; i++) {
      world.moveGrab(rayAt(target, 4));
      world.step(FIXED_DT, SUBSTEPS);
    }
    expect(Math.abs(garment.cx - target)).toBeLessThan(0.5);

    world.endGrab();
    expect(world.heldGarmentId).toBeNull();
  });

  it('holds one garment at a time, on every platform', () => {
    const world = new ClothWorld(buildArena());
    const first = spawnOne(world, { x: -1.5 });
    const second = spawnOne(world, { x: 1.5 });
    step(world, 2);

    world.beginGrab(rayAt(first.cx, first.cy));
    world.beginGrab(rayAt(second.cx, second.cy));
    // The second grab replaces the first; it never adds to it. A touchscreen
    // reporting ten pointers must not outplay a mouse reporting one.
    expect(world.heldGarmentId).toBe(second.id);
  });

  it('will not grab a garment that has already been resolved', () => {
    const world = new ClothWorld(buildArena());
    const garment = spawnOne(world);
    step(world, 2);
    garment.state = 'sorted';
    expect(world.beginGrab(rayAt(garment.cx, garment.cy))).toBe(false);
  });

  it('keeps the drag target inside the arena', () => {
    const world = new ClothWorld(buildArena());
    const garment = spawnOne(world);
    step(world, 2);
    world.beginGrab(rayAt(garment.cx, garment.cy));

    // Way off-screen to the right.
    for (let i = 0; i < 60; i++) {
      world.moveGrab(rayAt(500, 4));
      world.step(FIXED_DT, SUBSTEPS);
    }
    expect(garment.cx).toBeLessThan(ARENA.halfWidth);
  });
});

describe('arena geometry', () => {
  it('builds one open-topped cavity per wash', () => {
    const arena = buildArena();
    expect(arena.bins).toHaveLength(BIN.count);
    arena.bins.forEach((bin, index) => {
      expect(bin.index).toBe(index);
      expect(bin.interior.maxY).toBeCloseTo(BIN.height, 5);
      // The cavity is inside the outer shell on every axis.
      expect(bin.interior.maxX - bin.interior.minX).toBeLessThan(BIN.outerWidth);
      expect(bin.interior.maxZ - bin.interior.minZ).toBeLessThan(BIN.depth);
    });
  });

  it('keeps the bins apart, and inside the walls', () => {
    const arena = buildArena();
    for (let i = 1; i < arena.bins.length; i++) {
      expect(arena.bins[i].interior.minX).toBeGreaterThan(arena.bins[i - 1].interior.maxX);
    }
    const first = arena.bins[0];
    const last = arena.bins[arena.bins.length - 1];
    expect(first.interior.minX).toBeGreaterThan(-ARENA.halfWidth);
    expect(last.interior.maxX).toBeLessThan(ARENA.halfWidth);
  });

  it('pointInBox respects its padding', () => {
    const arena = buildArena();
    const bin = arena.bins[0];
    expect(pointInBox(bin.interior, bin.centerX, BIN.height / 2, 0)).toBe(true);
    expect(pointInBox(bin.interior, bin.centerX, BIN.height + 1, 0)).toBe(false);
    expect(pointInBox(bin.interior, bin.centerX, BIN.height + 0.5, 0, 1)).toBe(true);
  });
});

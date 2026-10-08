/**
 * The globe's geometry, checked against the inverse it has to agree with.
 *
 * `rotateToView` and `lib/fluid`'s `unrotateSphere` are the two halves of one
 * rotation: the first carries a card from the sphere's own space to where it is
 * drawn, the second carries a finger back the other way. A sign flipped in
 * either is invisible in review and shows up as a globe where tapping a card
 * selects its neighbour.
 */

import { describe, it, expect } from 'vitest';
import { unrotateSphere } from '@/lib/fluid';
import { BOARD_SIZE } from '@/lib/globeset/cards';
import {
  GLOBE_PERSPECTIVE,
  PITCH_LIMIT,
  SLOT_DIRECTIONS,
  depthScale,
  faceFrontAngles,
  place,
  rotateToView,
  slotDirections,
  wrapDegrees,
  type Vec3,
} from '@/lib/globeset/globe';

const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('the slots', () => {
  it('gives one direction per card, all on the unit sphere', () => {
    expect(SLOT_DIRECTIONS).toHaveLength(BOARD_SIZE);
    for (const slot of SLOT_DIRECTIONS) near(length(slot), 1, 1e-12);
  });

  it('keeps every slot inside the reachable belt', () => {
    // A slot past the pitch limit could never be turned to the front.
    const limit = Math.sin((PITCH_LIMIT * Math.PI) / 180);
    for (const slot of SLOT_DIRECTIONS) {
      expect(Math.abs(slot.y)).toBeLessThan(limit);
    }
  });

  it('scatters them — no two slots sit on top of each other', () => {
    for (let i = 0; i < SLOT_DIRECTIONS.length; i++) {
      for (let j = i + 1; j < SLOT_DIRECTIONS.length; j++) {
        const a = SLOT_DIRECTIONS[i];
        const b = SLOT_DIRECTIONS[j];
        const dot = a.x * b.x + a.y * b.y + a.z * b.z;
        // Comfortably over a card's own angular width.
        expect(Math.acos(Math.min(1, dot))).toBeGreaterThan(0.5);
      }
    }
  });

  it('is deterministic — two clients lay the sphere out identically', () => {
    expect(slotDirections()).toEqual(slotDirections());
    expect(slotDirections(5)).toHaveLength(5);
  });
});

describe('rotateToView', () => {
  it('is exactly what unrotateSphere undoes', () => {
    for (const yaw of [0, 17, -93, 180, 359]) {
      for (const pitch of [0, 31, -44]) {
        for (const n of SLOT_DIRECTIONS) {
          const view = rotateToView(n, yaw, pitch);
          const back = unrotateSphere(view, yaw, pitch);
          near(back.x, n.x, 1e-12);
          near(back.y, n.y, 1e-12);
          near(back.z, n.z, 1e-12);
        }
      }
    }
  });

  it('keeps every direction on the sphere', () => {
    for (const n of SLOT_DIRECTIONS) near(length(rotateToView(n, 61, -23)), 1, 1e-12);
  });

  it('turns the front of the globe toward the drag', () => {
    const front: Vec3 = { x: 0, y: 0, z: 1 };
    // Dragging right (positive yaw) carries the front face to the right…
    expect(rotateToView(front, 30, 0).x).toBeGreaterThan(0);
    // …and dragging down (negative pitch, as the component applies it) carries
    // it downward. y is screen-handed, so "down" is positive.
    expect(rotateToView(front, 0, -30).y).toBeGreaterThan(0);
  });
});

describe('faceFrontAngles', () => {
  it('brings any slot to dead centre, facing the viewer', () => {
    for (const n of SLOT_DIRECTIONS) {
      const { yaw, pitch } = faceFrontAngles(n);
      const view = rotateToView(n, yaw, pitch);
      near(view.x, 0, 1e-9);
      near(view.y, 0, 1e-9);
      near(view.z, 1, 1e-9);
    }
  });

  it('never asks for a tilt the globe will not give', () => {
    for (const n of SLOT_DIRECTIONS) {
      expect(Math.abs(faceFrontAngles(n).pitch)).toBeLessThanOrEqual(PITCH_LIMIT);
    }
  });
});

describe('projection', () => {
  it('grows the near face and shrinks the far one', () => {
    expect(depthScale(1)).toBeGreaterThan(1);
    expect(depthScale(-1)).toBeLessThan(1);
    near(depthScale(0), 1, 1e-12);
    expect(depthScale(1)).toBeCloseTo(GLOBE_PERSPECTIVE / (GLOBE_PERSPECTIVE - 0.5), 12);
  });

  it('puts the front of the globe at the centre of the stage', () => {
    const p = place({ x: 0, y: 0, z: 1 }, 160);
    near(p.left, 0, 1e-12);
    near(p.top, 0, 1e-12);
    expect(p.depth).toBe(1);
  });

  it('scales with the stage', () => {
    const v = rotateToView(SLOT_DIRECTIONS[2], 40, 10);
    const small = place(v, 100);
    const big = place(v, 200);
    near(big.left, small.left * 2, 1e-9);
    near(big.top, small.top * 2, 1e-9);
    expect(big.scale).toBe(small.scale);
  });
});

describe('wrapDegrees', () => {
  it('always takes the short way round', () => {
    expect(wrapDegrees(0)).toBe(0);
    expect(wrapDegrees(190)).toBe(-170);
    expect(wrapDegrees(-190)).toBe(170);
    expect(wrapDegrees(720)).toBe(0);
    // Half-open [−180, 180): the seam belongs to the negative side, so a half
    // turn always reports the same way round however you arrived at it.
    expect(wrapDegrees(-540)).toBe(-180);
    expect(wrapDegrees(540)).toBe(-180);
    for (const a of [-1000, -37, 12, 359, 1234]) {
      expect(Math.abs(wrapDegrees(a))).toBeLessThanOrEqual(180);
    }
  });
});

import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { deviceQuaternion as threeDeviceQuaternion } from '@/lib/neon-driftway/camera';
import {
  IDENTITY,
  angleBetween,
  angleOf,
  conjugate,
  deviceQuaternion,
  elevationOf,
  fromAxisAngle,
  headingOf,
  multiply,
  nlerp,
  orbitRotation,
  toCssMatrix3d,
  wrapAngle,
  type Quat,
} from '@/lib/device-attitude';

const DEG = Math.PI / 180;

/** Apply a CSS `matrix3d(...)` to a vector in CSS space (+x right, +y DOWN, +z at viewer). */
function applyCss(matrix: string, v: readonly [number, number, number]) {
  const n = matrix.slice('matrix3d('.length, -1).split(',').map(Number);
  // matrix3d is column-major: n[col * 4 + row].
  return [
    n[0] * v[0] + n[4] * v[1] + n[8] * v[2],
    n[1] * v[0] + n[5] * v[1] + n[9] * v[2],
    n[2] * v[0] + n[6] * v[1] + n[10] * v[2],
  ] as const;
}

/**
 * A phone in a normal reading pose: pitched back 30° from vertical, aimed
 * roughly at the viewer. Deliberately NOT `beta: 90` — that is the euler
 * singularity where alpha and gamma collapse onto the same axis.
 */
const READING = { alpha: 180, beta: 60, gamma: 0 };
const q = (o: { alpha: number; beta: number; gamma: number }, screen = 0) =>
  deviceQuaternion(o.alpha, o.beta, o.gamma, screen);

describe('deviceQuaternion agrees with the three.js implementation', () => {
  // The site already converts device orientation to a rotation for VR head look
  // (lib/neon-driftway/camera.ts, built on three.js). This module reimplements
  // that maths without the three dependency, so it is checked against it rather
  // than trusted — a sign error here is invisible until someone holds a phone.
  const cases = [
    { alpha: 0, beta: 0, gamma: 0, screen: 0 },
    { alpha: 0, beta: 90, gamma: 0, screen: 0 },
    { alpha: 37, beta: 62, gamma: -18, screen: 0 },
    { alpha: 200, beta: -140, gamma: 74, screen: 90 },
    { alpha: 355, beta: 12, gamma: -89, screen: 180 },
    { alpha: 91, beta: 179, gamma: 44, screen: 270 },
  ];

  for (const c of cases) {
    test(`α${c.alpha} β${c.beta} γ${c.gamma} @${c.screen}°`, () => {
      const expected = threeDeviceQuaternion(
        new THREE.Quaternion(),
        c.alpha,
        c.beta,
        c.gamma,
        c.screen,
      );
      const got = deviceQuaternion(c.alpha, c.beta, c.gamma, c.screen);
      // Quaternions double-cover rotations, so compare the rotation rather than
      // the components: q and −q are the same orientation. The bound is 1e-6
      // radians (~6e-5 of a degree) rather than machine epsilon because acos
      // magnifies float error sharply as the two rotations converge.
      expect(angleBetween(got, [expected.x, expected.y, expected.z, expected.w])).toBeLessThan(
        1e-6,
      );
    });
  }
});

describe('quaternion algebra', () => {
  test('multiply matches three.js composition order', () => {
    const a = fromAxisAngle([0, 1, 0], 40 * DEG);
    const b = fromAxisAngle([1, 0, 0], -25 * DEG);
    const expected = new THREE.Quaternion(a[0], a[1], a[2], a[3]).multiply(
      new THREE.Quaternion(b[0], b[1], b[2], b[3]),
    );
    const got = multiply(a, b);
    expect(got[0]).toBeCloseTo(expected.x, 12);
    expect(got[1]).toBeCloseTo(expected.y, 12);
    expect(got[2]).toBeCloseTo(expected.z, 12);
    expect(got[3]).toBeCloseTo(expected.w, 12);
  });

  test('a rotation composed with its conjugate is the identity', () => {
    const r = fromAxisAngle([0.6, 0.8, 0], 73 * DEG);
    expect(angleBetween(multiply(r, conjugate(r)), IDENTITY)).toBeCloseTo(0, 12);
  });

  test('wrapAngle folds a turn past the seam into the short way round', () => {
    expect(wrapAngle(350 * DEG) / DEG).toBeCloseTo(-10);
    expect(wrapAngle(-350 * DEG) / DEG).toBeCloseTo(10);
    expect(wrapAngle(20 * DEG) / DEG).toBeCloseTo(20);
  });

  test('nlerp halfway between two rotations is the halfway rotation', () => {
    const end = fromAxisAngle([0, 1, 0], 90 * DEG);
    expect(angleOf(nlerp(IDENTITY, end, 0.5)) / DEG).toBeCloseTo(45);
  });

  test('nlerp takes the short way round a sign flip', () => {
    const end = fromAxisAngle([0, 1, 0], 90 * DEG);
    const negated: Quat = [-end[0], -end[1], -end[2], -end[3]];
    // −q is the same orientation, so the halfway point must be the same too —
    // without the sign fix this swings the long way instead.
    expect(angleBetween(nlerp(IDENTITY, negated, 0.5), nlerp(IDENTITY, end, 0.5))).toBeCloseTo(
      0,
      9,
    );
  });
});

describe('heading and elevation', () => {
  test('heading follows the device round the compass', () => {
    const turn = (alpha: number) =>
      wrapAngle(headingOf(q({ ...READING, alpha })) - headingOf(q(READING))) / DEG;
    expect(turn(220)).toBeCloseTo(40, 4);
    expect(turn(160)).toBeCloseTo(-20, 4);
    // And across the 0/360 seam, where the raw difference would read as −350.
    expect(turn(10)).toBeCloseTo(-170, 4);
  });

  test('heading is stable when the device is aimed steeply down', () => {
    // A naive euler decomposition flips by 180° here — exactly the pose someone
    // looking at a phone in their lap is in.
    const steep = { alpha: 10, beta: 8, gamma: 0 };
    const turned = { ...steep, alpha: 40 };
    expect(Math.abs(wrapAngle(headingOf(q(turned)) - headingOf(q(steep))) / DEG)).toBeLessThan(180);
  });

  test('elevation rises as the device is tipped back and falls as it is tipped down', () => {
    // beta 90 is level with the horizon; below that the device aims downward.
    expect(elevationOf(q({ alpha: 0, beta: 90, gamma: 0 })) / DEG).toBeCloseTo(0, 4);
    expect(elevationOf(q({ alpha: 0, beta: 50, gamma: 0 })) / DEG).toBeLessThan(-30);
    expect(elevationOf(q({ alpha: 0, beta: 130, gamma: 0 })) / DEG).toBeGreaterThan(30);
  });
});

describe('orbitRotation — moving the phone walks around the object', () => {
  // The book's own axes, in the CSS space the matrix lands in: +x is its
  // fore-edge (right-hand side), +y points DOWN so the top face normal is
  // (0, −1, 0), the base is (0, 1, 0), and +z is the front cover facing the
  // viewer.
  const FORE_EDGE = [1, 0, 0] as const;
  const TOP = [0, -1, 0] as const;
  const FRONT = [0, 0, 1] as const;

  const neutral = q(READING);
  const look = (pose: Partial<typeof READING>, gain = 1) =>
    toCssMatrix3d(orbitRotation(q({ ...READING, ...pose }), neutral, gain));

  test('holding still shows the front cover square-on', () => {
    expect(applyCss(look({}), FRONT)[2]).toBeCloseTo(1);
  });

  // Direction convention, and it is the physical one: to walk round an object's
  // RIGHT side while keeping it in front of you, you turn to your LEFT. alpha
  // increases as the device turns counter-clockwise seen from above (left), so
  // turning left is what brings the book's right-hand face — the fore-edge —
  // round to meet the viewer.
  test('turning the phone left brings the fore-edge into view', () => {
    const edge = applyCss(look({ alpha: 210 }), FORE_EDGE);
    // The right-hand face swings toward the viewer (+z) instead of lying flat.
    expect(edge[2]).toBeGreaterThan(0.4);
    expect(edge[0]).toBeLessThan(0.95);
  });

  test('turning the phone right brings the spine into view', () => {
    // The fore-edge turns away, so the spine on the far side is what faces them.
    expect(applyCss(look({ alpha: 150 }), FORE_EDGE)[2]).toBeLessThan(-0.4);
  });

  test('a quarter turn puts the fore-edge square-on to the viewer', () => {
    expect(applyCss(look({ alpha: 270 }), FORE_EDGE)[2]).toBeCloseTo(1, 4);
  });

  test('turning right round shows the back cover', () => {
    expect(applyCss(look({ alpha: 0 }), FRONT)[2]).toBeCloseTo(-1, 4);
  });

  test('tipping the phone down looks over the top of the book', () => {
    // beta 60 → 25 aims the device further below the horizon, so the viewer
    // rises above the book and its head comes into view.
    expect(applyCss(look({ beta: 25 }), TOP)[2]).toBeGreaterThan(0.4);
  });

  test('gain carries the object further than the device turned', () => {
    // A square-on view of the fore-edge from 60° of real turning, not 90°.
    expect(applyCss(look({ alpha: 240 }, 1.5), FORE_EDGE)[2]).toBeCloseTo(1, 3);
  });

  test('the book never rolls, however the phone is held', () => {
    // The whole reason for the orbit decomposition: the book's vertical stays in
    // the screen's vertical plane, so it turns rather than tumbling. Checked
    // across a spread of poses including tilted and steeply-aimed ones.
    for (const pose of [
      { alpha: 220 },
      { alpha: 140, beta: 30 },
      { alpha: 300, beta: 110 },
      { alpha: 190, beta: 45, gamma: -40 },
      { alpha: 260, beta: 75, gamma: 60 },
    ]) {
      const up = applyCss(look(pose, 1.5), TOP);
      expect(Math.abs(up[0])).toBeLessThan(1e-6);
    }
  });

  test('recentring on any pose shows the front cover again', () => {
    // Whatever pose becomes the new neutral, the object faces the viewer there.
    const odd = q({ alpha: 143, beta: 21, gamma: -67 });
    expect(applyCss(toCssMatrix3d(orbitRotation(odd, odd)), FRONT)[2]).toBeCloseTo(1);
  });
});

describe('toCssMatrix3d', () => {
  test('the identity is the identity matrix', () => {
    expect(toCssMatrix3d(IDENTITY)).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });

  test('emits sixteen finite numbers', () => {
    const parts = toCssMatrix3d(fromAxisAngle([0.3, 0.5, 0.81], 1.1))
      .slice('matrix3d('.length, -1)
      .split(',')
      .map(Number);
    expect(parts).toHaveLength(16);
    expect(parts.every(Number.isFinite)).toBe(true);
  });

  test('flips the Y axis, so a world Y-up turn reads as a CSS Y-down turn', () => {
    // Rotating +90° about world up must send the object's +x axis AWAY from the
    // viewer in CSS space; without the mirror it would come toward them.
    expect(applyCss(toCssMatrix3d(fromAxisAngle([0, 1, 0], 90 * DEG)), [1, 0, 0])[2]).toBeCloseTo(
      -1,
      6,
    );
  });
});

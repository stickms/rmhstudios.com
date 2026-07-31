import { describe, test, expect } from 'vitest';
import { angleDelta, driftNeutral, tiltVector } from '@/lib/device-tilt';

describe('angleDelta', () => {
  test('returns the plain difference away from the wrap point', () => {
    expect(angleDelta(40, 55)).toBe(15);
    expect(angleDelta(55, 40)).toBe(-15);
  });

  test('takes the short way round the ±180° seam', () => {
    // A phone rolling past upside-down must not slam from one extreme to the
    // other: 179° → -179° is 2° of movement, not 358°.
    expect(angleDelta(179, -179)).toBe(2);
    expect(angleDelta(-179, 179)).toBe(-2);
  });

  test('is zero for identical angles', () => {
    expect(angleDelta(45, 45)).toBe(0);
  });
});

describe('tiltVector', () => {
  const neutral = { beta: 45, gamma: 0 };

  test('reports no deflection in the pose it learnt as level', () => {
    expect(tiltVector({ beta: 45, gamma: 0 }, neutral, 0, 22)).toEqual({ x: 0, y: 0 });
  });

  test('maps a right-hand roll to +x and a lean-away to +y in portrait', () => {
    expect(tiltVector({ beta: 45, gamma: 11 }, neutral, 0, 22).x).toBeCloseTo(0.5);
    expect(tiltVector({ beta: 56, gamma: 0 }, neutral, 0, 22).y).toBeCloseTo(0.5);
  });

  test('clamps beyond full deflection so the effect has a hard ceiling', () => {
    expect(tiltVector({ beta: 45, gamma: 80 }, neutral, 0, 22).x).toBe(1);
    expect(tiltVector({ beta: -80, gamma: 0 }, neutral, 0, 22).y).toBe(-1);
  });

  test('swaps the axes in landscape so tilt still means the same thing on screen', () => {
    const rolled = { beta: 45, gamma: 11 };
    expect(tiltVector(rolled, neutral, 90, 22).y).toBeCloseTo(-0.5);
    expect(tiltVector(rolled, neutral, 90, 22).x).toBeCloseTo(0);
    expect(tiltVector(rolled, neutral, 270, 22).y).toBeCloseTo(0.5);

    const pitched = { beta: 56, gamma: 0 };
    expect(tiltVector(pitched, neutral, 90, 22).x).toBeCloseTo(0.5);
    expect(tiltVector(pitched, neutral, 270, 22).x).toBeCloseTo(-0.5);
  });

  test('inverts both axes upside-down', () => {
    const upsideDown = tiltVector({ beta: 56, gamma: 11 }, neutral, 180, 22);
    expect(upsideDown.x).toBeCloseTo(-0.5);
    expect(upsideDown.y).toBeCloseTo(-0.5);
  });

  test('normalises against the range it is given', () => {
    expect(tiltVector({ beta: 45, gamma: 11 }, neutral, 0, 11).x).toBe(1);
    expect(tiltVector({ beta: 45, gamma: 11 }, neutral, 0, 44).x).toBeCloseTo(0.25);
  });
});

describe('driftNeutral', () => {
  test('creeps toward the live pose rather than jumping to it', () => {
    const drifted = driftNeutral({ beta: 45, gamma: 0 }, { beta: 65, gamma: 10 }, 0.1);
    expect(drifted.beta).toBeCloseTo(47);
    expect(drifted.gamma).toBeCloseTo(1);
  });

  test('converges on a held pose, so a changed grip becomes the new level', () => {
    let neutral = { beta: 45, gamma: 0 };
    const held = { beta: 65, gamma: 0 };
    // 600 samples is ~10s at the ~60Hz the sensor fires — three time constants
    // of the default 0.006 rate, by which a lean the visitor is simply holding
    // has faded back to level.
    for (let i = 0; i < 600; i++) neutral = driftNeutral(neutral, held, 0.006);
    expect(tiltVector(held, neutral, 0, 22).y).toBeCloseTo(0, 1);
  });

  test('leaves an unchanged pose alone', () => {
    expect(driftNeutral({ beta: 45, gamma: 3 }, { beta: 45, gamma: 3 }, 0.5)).toEqual({
      beta: 45,
      gamma: 3,
    });
  });
});

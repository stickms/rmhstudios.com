/**
 * How one particle of an unusual effect moves. Pure: the same (kind, particle, time) always gives
 * the same answer, so it is testable and the effect looks the same on every device. Positions are in
 * units of the effect's radius around its centre (+y up); `a` is brightness 0–1; `size` is relative.
 */

import type { EffectKind } from './fx';

export interface Particle {
  x: number;
  y: number;
  z: number;
  a: number;
  size: number;
}

/** A stable pseudo-random number in [0, 1) for (particle, channel). */
export const rnd = (i: number, k: number): number => {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

const fract = (v: number): number => v - Math.floor(v);
const TAU = Math.PI * 2;

export function particleAt(kind: EffectKind, i: number, n: number, t: number): Particle {
  const r0 = rnd(i, 0);
  const r1 = rnd(i, 1);
  const r2 = rnd(i, 2);
  switch (kind) {
    case 'flame': {
      const life = fract(t * 0.9 + r0);
      return {
        x: (r1 - 0.5) * 0.9 * (1 - life) + Math.sin(t * 3 + r2 * 6) * 0.08,
        y: life * 1.3 - 0.3,
        z: (r2 - 0.5) * 0.9 * (1 - life),
        a: Math.pow(1 - life, 1.2),
        size: 0.18 + 0.4 * (1 - life),
      };
    }
    case 'smoke': {
      const life = fract(t * 0.3 + r0);
      return {
        x: (r1 - 0.5) * 0.6 + Math.sin(t * 0.9 + r2 * 6) * 0.15 * life,
        y: life * 1.5 - 0.3,
        z: (r2 - 0.5) * 0.6,
        a: Math.sin(Math.PI * life) * 0.55,
        size: 0.35 + life * 0.6,
      };
    }
    case 'electric': {
      const step = Math.floor(t * 8 + r0 * 8);
      const th = rnd(i, 10 + step) * TAU;
      const ph = Math.acos(2 * rnd(i, 40 + step) - 1);
      const rad = 0.7 + 0.4 * rnd(i, 70 + step);
      return {
        x: rad * Math.sin(ph) * Math.cos(th),
        y: rad * Math.cos(ph),
        z: rad * Math.sin(ph) * Math.sin(th),
        a: 0.4 + 0.6 * rnd(i, 100 + step),
        size: 0.16,
      };
    }
    case 'sparkle': {
      const th = r0 * TAU;
      const ph = Math.acos(2 * r1 - 1);
      const rad = 0.5 + 0.55 * r2;
      return {
        x: rad * Math.sin(ph) * Math.cos(th) + Math.sin(t * 0.7 + r0 * 6) * 0.05,
        y: rad * Math.cos(ph) + Math.cos(t * 0.6 + r1 * 6) * 0.05,
        z: rad * Math.sin(ph) * Math.sin(th),
        a: Math.max(0, 0.5 + 0.5 * Math.sin(t * 3 + r2 * TAU)),
        size: 0.14 + 0.1 * r1,
      };
    }
    case 'snow':
    case 'leaf': {
      const speed = kind === 'snow' ? 0.25 : 0.16;
      const sway = kind === 'snow' ? 0.1 : 0.28;
      return {
        x: (r1 - 0.5) * 1.6 + Math.sin(t * (kind === 'snow' ? 1 : 1.6) + r2 * 6) * sway,
        y: 1.0 - fract(t * speed + r0) * 2.0,
        z: (r2 - 0.5) * 1.6,
        a: 0.9,
        size: kind === 'snow' ? 0.14 : 0.24,
      };
    }
    case 'bubble': {
      const life = fract(t * 0.3 + r0);
      return {
        x: (r1 - 0.5) * 1.2 + Math.sin(t * 2 + r2 * 6) * 0.1,
        y: life * 2 - 0.6,
        z: (r2 - 0.5) * 1.2,
        a: 0.75 * Math.sin(Math.PI * life),
        size: 0.14 + 0.2 * r1,
      };
    }
    case 'orbit': {
      const ang = t * 1.5 + (i / Math.max(1, n)) * TAU;
      const tilt = 0.5;
      return {
        x: 0.85 * Math.cos(ang),
        y: 0.85 * Math.sin(ang) * Math.sin(tilt),
        z: 0.85 * Math.sin(ang) * Math.cos(tilt),
        a: 0.6 + 0.4 * Math.sin(ang * 2),
        size: 0.2,
      };
    }
    default: {
      const th = r0 * TAU;
      const ph = Math.acos(2 * r1 - 1);
      const rad = 0.9 + 0.1 * Math.sin(t * 2 + r2 * TAU);
      return {
        x: rad * Math.sin(ph) * Math.cos(th),
        y: rad * Math.cos(ph),
        z: rad * Math.sin(ph) * Math.sin(th),
        a: 0.4 + 0.3 * Math.sin(t * 2 + r0 * TAU),
        size: 0.2,
      };
    }
  }
}

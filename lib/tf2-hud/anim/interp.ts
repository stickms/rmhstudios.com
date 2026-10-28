/** The curves a HUD animation can follow, as the game defines them. `t` and the result are 0..1. */

import type { Interp } from './parse';

const bias = (t: number, b: number): number => {
  if (b <= 0) return 0;
  if (b >= 1) return 1;
  return t ** (Math.log(b) / Math.log(0.5));
};

const gain = (t: number, g: number): number =>
  t < 0.5 ? bias(2 * t, 1 - g) / 2 : 1 - bias(2 - 2 * t, 1 - g) / 2;

/** A repeatable pseudo-random number in [0,1) from a seed, so flicker looks the same on every run. */
const hash = (n: number): number => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * How far along the way from the start value to the target an animation is at `t` (0..1).
 * `seed` makes Flicker deterministic: it flips between the old and new value each `frame`.
 */
export function weight(interp: Interp, t: number, frame = 0, seed = 0): number {
  const x = Math.max(0, Math.min(1, t));
  switch (interp.kind) {
    case 'accel':
      return x * x;
    case 'deaccel':
      return Math.sqrt(x);
    case 'spline':
      return x * x * (3 - 2 * x);
    case 'pulse': {
      // Cosine pulses over the duration that finish on the target.
      const f = interp.param ?? 1;
      return Math.sin(Math.PI * (f + 0.5) * x) ** 2;
    }
    case 'flicker':
      return x >= 1 ? 1 : hash(frame + seed) < (interp.param ?? 0.5) ? 1 : 0;
    case 'bounce': {
      // Drops onto the target and bounces back off it a few times before settling.
      if (x < 1 / 2.75) return 7.5625 * x * x;
      if (x < 2 / 2.75) return 7.5625 * (x - 1.5 / 2.75) ** 2 + 0.75;
      if (x < 2.5 / 2.75) return 7.5625 * (x - 2.25 / 2.75) ** 2 + 0.9375;
      return 7.5625 * (x - 2.625 / 2.75) ** 2 + 0.984375;
    }
    case 'gain':
      return gain(x, interp.param ?? 0.5);
    case 'bias':
      return bias(x, interp.param ?? 0.5);
    default:
      return x;
  }
}

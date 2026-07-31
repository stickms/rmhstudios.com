import { describe, it, expect } from 'vitest';
import {
  DECELERATION,
  RUBBER_BAND_C,
  SPRINGS,
  VelocityTracker,
  projectDistance,
  projectPosition,
  resolveDetent,
  rubberBand,
  rubberBandClamp,
  shouldDismiss,
  spring,
  springSettled,
  springStep,
  type SpringState,
} from '../fluid';

/**
 * The fluid-interface kernel, pinned to the behaviour the formulas are supposed
 * to produce. These are not characterisation tests of an implementation — each
 * one asserts a property the *design* depends on (a flick projects further than
 * a nudge, resistance is asymptotic, a spring cannot explode on a dropped
 * frame), so a future "simplification" that breaks the feel fails here rather
 * than in someone's hands.
 */

describe('projectDistance (UIScrollView deceleration)', () => {
  it('matches the published formula at the normal rate', () => {
    // (v / 1000) · r/(1−r), with r = 0.998 → multiplier 499.
    expect(projectDistance(1000, DECELERATION.normal)).toBeCloseTo(499, 6);
    expect(projectDistance(2000, DECELERATION.normal)).toBeCloseTo(998, 6);
  });

  it('coasts much further at the normal rate than the fast one', () => {
    const normal = projectDistance(1000, DECELERATION.normal);
    const fast = projectDistance(1000, DECELERATION.fast);
    expect(normal).toBeGreaterThan(fast * 4);
  });

  it('preserves direction and is zero at rest', () => {
    expect(projectDistance(-800)).toBeLessThan(0);
    expect(projectDistance(0)).toBe(0);
    expect(projectDistance(Number.NaN)).toBe(0);
  });

  it('projects from the current position', () => {
    expect(projectPosition(100, 1000, DECELERATION.normal)).toBeCloseTo(599, 6);
  });
});

describe('rubberBand', () => {
  it('is asymptotic — unbounded input, bounded travel', () => {
    // The ceiling is the DIMENSION itself: no amount of pulling drags a surface
    // more than its own size past the edge.
    const dimension = 400;
    expect(rubberBand(1e6, dimension)).toBeLessThan(dimension);
    expect(rubberBand(1e9, dimension)).toBeLessThan(dimension);
    // …and it does approach that ceiling rather than flattening out early.
    expect(rubberBand(1e9, dimension)).toBeGreaterThan(dimension * 0.999);
  });

  it('is monotonic and always resists (output < input)', () => {
    let previous = 0;
    for (let x = 1; x <= 1000; x += 7) {
      const y = rubberBand(x, 400);
      expect(y).toBeGreaterThan(previous);
      expect(y).toBeLessThan(x);
      previous = y;
    }
  });

  it('starts out nearly frictionless, so entering resistance is imperceptible', () => {
    // Gradient at the origin is exactly c; over the first pixel it should still
    // be within a hair of it.
    expect(rubberBand(1, 400) / 1).toBeCloseTo(RUBBER_BAND_C, 2);
  });

  it('scales resistance with the surface being dragged', () => {
    expect(rubberBand(100, 800)).toBeGreaterThan(rubberBand(100, 200));
  });

  it('preserves sign and is inert inside the bounds', () => {
    expect(rubberBand(-100, 400)).toBeCloseTo(-rubberBand(100, 400), 10);
    expect(rubberBandClamp(50, 0, 100, 400)).toBe(50);
    expect(rubberBandClamp(-30, 0, 100, 400)).toBeGreaterThan(-30);
    expect(rubberBandClamp(-30, 0, 100, 400)).toBeLessThan(0);
    expect(rubberBandClamp(130, 0, 100, 400)).toBeLessThan(130);
    expect(rubberBandClamp(130, 0, 100, 400)).toBeGreaterThan(100);
  });
});

describe('spring (SwiftUI duration + bounce)', () => {
  it('bounce 0 is critically damped', () => {
    const s = spring(0.4, 0);
    const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
    expect(zeta).toBeCloseTo(1, 10);
  });

  it('positive bounce under-damps, negative bounce over-damps', () => {
    const zetaOf = (b: number) => {
      const s = spring(0.4, b);
      return s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
    };
    expect(zetaOf(0.3)).toBeCloseTo(0.7, 10);
    expect(zetaOf(-0.5)).toBeGreaterThan(1);
  });

  it('shorter perceptual duration means a stiffer spring', () => {
    expect(spring(0.2).stiffness).toBeGreaterThan(spring(0.6).stiffness);
  });
});

/** Run a spring to rest and report what happened on the way. */
function simulate(
  from: number,
  to: number,
  s = SPRINGS.smooth,
  velocity = 0,
  dt = 1 / 60,
  maxFrames = 1200,
) {
  let state: SpringState = { value: from, velocity };
  let frames = 0;
  let overshoot = 0;
  const direction = Math.sign(to - from) || 1;
  while (!springSettled(state, to) && frames < maxFrames) {
    state = springStep(state, to, s, dt);
    overshoot = Math.max(overshoot, (state.value - to) * direction);
    frames++;
  }
  return { state, frames, seconds: frames * dt, overshoot };
}

describe('springStep', () => {
  it('converges on the target', () => {
    const { state, frames } = simulate(0, 100);
    expect(frames).toBeLessThan(1200);
    expect(state.value).toBeCloseTo(100, 1);
    expect(Math.abs(state.velocity)).toBeLessThan(1);
  });

  it('a bounce-0 spring never overshoots; a bouncy one does', () => {
    expect(simulate(0, 100, SPRINGS.smooth).overshoot).toBeLessThan(0.01);
    expect(simulate(0, 100, SPRINGS.bouncy).overshoot).toBeGreaterThan(1);
  });

  it('settles in about its perceptual duration regardless of distance', () => {
    // The property the whole parameterisation exists for: same spring, 4px and
    // 400px, comparable settle time.
    const near = simulate(0, 4, SPRINGS.smooth).seconds;
    const far = simulate(0, 400, SPRINGS.smooth).seconds;
    expect(Math.abs(far - near)).toBeLessThan(0.35);
  });

  it('press is quicker than release, as UIKit does it', () => {
    expect(simulate(1, 0.96, SPRINGS.press).seconds).toBeLessThan(
      simulate(0.96, 1, SPRINGS.release).seconds,
    );
  });

  it('inherits entry velocity instead of discarding it', () => {
    const thrown = springStep({ value: 0, velocity: 900 }, 0, SPRINGS.smooth, 1 / 60);
    // Launched away from a target it is already sitting on: it must move.
    expect(thrown.value).toBeGreaterThan(5);
  });

  it('is redirectable mid-flight without a discontinuity', () => {
    // Half-way to 100, retarget to 0. Position must be continuous — the retarget
    // may only change where it is HEADING, never where it is.
    let state: SpringState = { value: 0, velocity: 0 };
    for (let i = 0; i < 12; i++) state = springStep(state, 100, SPRINGS.smooth, 1 / 60);
    const before = state.value;
    const after = springStep(state, 0, SPRINGS.smooth, 1 / 60);
    expect(Math.abs(after.value - before)).toBeLessThan(6);
    expect(simulate(after.value, 0, SPRINGS.smooth, after.velocity).state.value).toBeCloseTo(0, 1);
  });

  it('survives a catastrophic frame instead of exploding', () => {
    // A 4-second stall (backgrounded tab, GC pause). Euler integration would
    // diverge to infinity here; the analytic solution must stay sane.
    const state = springStep({ value: 0, velocity: 0 }, 100, SPRINGS.smooth, 4);
    expect(Number.isFinite(state.value)).toBe(true);
    expect(state.value).toBeGreaterThan(-1);
    expect(state.value).toBeLessThan(201);
  });

  it('is stable across wildly different frame rates', () => {
    // 30fps and 240fps must land in the same place at the same wall-clock time,
    // or motion changes character on a high-refresh display.
    const run = (dt: number, seconds: number) => {
      let state: SpringState = { value: 0, velocity: 0 };
      for (let t = 0; t < seconds; t += dt) state = springStep(state, 100, SPRINGS.smooth, dt);
      return state.value;
    };
    expect(Math.abs(run(1 / 240, 0.25) - run(1 / 30, 0.25))).toBeLessThan(2);
  });

  it('treats a non-positive dt as a no-op', () => {
    const state = { value: 3, velocity: 7 };
    expect(springStep(state, 0, SPRINGS.smooth, 0)).toBe(state);
  });
});

describe('the two spring vocabularies agree', () => {
  it('lib/fluid SPRINGS and lib/motion APPLE_SPRING describe the same motion', async () => {
    // The site animates through two tiers: framer-motion (declarative, React)
    // and this kernel (imperative, rAF). They must not drift, or "the same"
    // spring feels different depending on which tier a surface happens to use.
    // framer-motion is parameterised by duration+bounce, so recover those from
    // the kernel's stiffness/damping and compare.
    const { APPLE_SPRING } = await import('../motion');
    const invert = (s: { stiffness: number; damping: number; mass: number }) => {
      const omega = Math.sqrt(s.stiffness / s.mass);
      return {
        duration: (2 * Math.PI) / omega,
        bounce: 1 - s.damping / (2 * Math.sqrt(s.stiffness * s.mass)),
      };
    };
    for (const name of ['smooth', 'snappy', 'bouncy', 'sheet', 'press'] as const) {
      const declarative = APPLE_SPRING[name] as { duration: number; bounce: number };
      const imperative = invert(SPRINGS[name]);
      expect(imperative.duration, `${name}.duration`).toBeCloseTo(declarative.duration, 6);
      expect(imperative.bounce, `${name}.bounce`).toBeCloseTo(declarative.bounce ?? 0, 6);
    }
  });
});

describe('springSettled', () => {
  it('is not fooled by a spring passing through its target at speed', () => {
    expect(springSettled({ value: 100, velocity: 400 }, 100)).toBe(false);
    expect(springSettled({ value: 100, velocity: 0 }, 100)).toBe(true);
  });
});

describe('VelocityTracker', () => {
  it('averages over the window rather than trusting the last delta', () => {
    const v = new VelocityTracker(100);
    // Moving 10px every 10ms = 1000px/s, but the final sample repeats — a
    // last-delta reading would report 0.
    for (let i = 0; i <= 10; i++) v.add(i * 10, i * 10);
    v.add(100, 105);
    expect(v.get()).toBeGreaterThan(800);
  });

  it('drops to near zero when the finger genuinely stops', () => {
    const v = new VelocityTracker(100);
    for (let i = 0; i <= 10; i++) v.add(i * 10, i * 10);
    // Held still for longer than the window.
    for (let i = 1; i <= 12; i++) v.add(100, 100 + i * 20);
    expect(Math.abs(v.get())).toBeLessThan(60);
  });

  it('reports direction, and nothing at all with too little data', () => {
    const v = new VelocityTracker();
    expect(v.get()).toBe(0);
    v.add(0, 0);
    expect(v.get()).toBe(0);
    v.add(-50, 50);
    expect(v.get()).toBeCloseTo(-1000, 6);
    v.reset();
    expect(v.get()).toBe(0);
  });

  it('does not divide by zero on duplicate timestamps', () => {
    const v = new VelocityTracker();
    v.add(0, 10);
    v.add(50, 10);
    expect(v.get()).toBe(0);
  });
});

describe('resolveDetent', () => {
  it('lands on the detent the flick is heading for, not the nearest one now', () => {
    // Sitting at 10 (nearest detent 0), but thrown hard toward 300.
    expect(resolveDetent(10, 700, [0, 300])).toBe(300);
    // Same position, released at rest: it goes back.
    expect(resolveDetent(10, 0, [0, 300])).toBe(0);
  });

  it('is more conservative at the fast rate, as a card carousel should be', () => {
    // The same 700px/s flick coasts ~349px at the normal rate but only ~69px at
    // the fast one, so it no longer reaches the far detent.
    expect(resolveDetent(10, 700, [0, 300], DECELERATION.fast)).toBe(0);
  });

  it('is order-independent and degenerate-safe', () => {
    expect(resolveDetent(10, 700, [300, 0])).toBe(300);
    expect(resolveDetent(42, 0, [])).toBe(42);
  });
});

describe('shouldDismiss', () => {
  it('dismisses a fast flick that has barely moved', () => {
    expect(shouldDismiss({ position: 20, velocity: 1200, threshold: 200 })).toBe(true);
  });

  it('dismisses a slow drag that went the distance', () => {
    expect(shouldDismiss({ position: 260, velocity: 0, threshold: 200 })).toBe(true);
  });

  it('keeps a hesitant drag that stopped short', () => {
    expect(shouldDismiss({ position: 60, velocity: 0, threshold: 200 })).toBe(false);
  });

  it('keeps a surface thrown decisively back, however far it had travelled', () => {
    expect(shouldDismiss({ position: 400, velocity: -900, threshold: 200 })).toBe(false);
  });
});

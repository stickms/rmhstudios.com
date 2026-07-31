/**
 * Fluid interface physics — the shared kernel behind every gesture on the site.
 *
 * This is the executable half of Apple's *Designing Fluid Interfaces*
 * (WWDC 2018, session 803). That talk's thesis is that the "magical" feel of
 * native gestures is not decoration but a small set of mechanics, and that each
 * one has a formula:
 *
 * 1. **Instantaneous response.** A surface reacts on touch-DOWN, never on click
 *    or after a recognition delay. (Owned by `hooks/useFluidPress`.)
 * 2. **Interruptible, and redirectable mid-flight.** Motion is driven by a
 *    SPRING carrying position *and velocity*, so grabbing something already in
 *    motion retargets it from where it is and how fast it is going, instead of
 *    snapping or fighting. A duration-based tween structurally cannot do this,
 *    which is most of what makes web UI feel stiff. → {@link springStep}
 * 3. **Momentum carries across the lift.** When the finger leaves, the gesture's
 *    velocity is handed to the animation rather than thrown away.
 *    → {@link projectDistance}
 * 4. **Intent is read from the projection, not the position.** "Will this flick
 *    END past the threshold?" is the right question; "is it past the threshold
 *    right now?" is why so many web sheets refuse to dismiss on a fast flick.
 *    → {@link projectPosition}, {@link resolveDetent}
 * 5. **Limits push back instead of stopping.** Past an edge, travel is damped
 *    asymptotically — the surface stays alive under the finger and tells you
 *    there is nothing further. → {@link rubberBand}
 *
 * Everything here is **pure** (no DOM, no React, no time source of its own) so
 * it is unit-testable and shared by the press layer, the sheet drag, the
 * navigation globe and anything added later. Units are pixels and
 * pixels-per-second unless a doc comment says otherwise.
 */

/* ── Momentum ─────────────────────────────────────────────────────────────── */

/**
 * `UIScrollView.DecelerationRate`. The rate is the fraction of velocity retained
 * per millisecond, which is why the projections below are so sensitive to it:
 * `normal` keeps 99.8% of its speed every millisecond and therefore coasts about
 * five times as far as `fast`.
 */
export const DECELERATION = {
  /** `.normal` — scroll views, sheets, anything with a long glide. */
  normal: 0.998,
  /** `.fast` — page/card carousels, where a flick should settle promptly. */
  fast: 0.99,
} as const;

/**
 * How much further a surface travels after the finger lifts, given the velocity
 * it was moving at. This is the projection function from the talk, verbatim:
 *
 * ```
 * distance = (v / 1000) · rate / (1 − rate)
 * ```
 *
 * (`v / 1000` converts px/s to px/ms, the unit the decay rate is expressed in.)
 * At the `normal` rate the multiplier works out to ≈0.499, so a 1000px/s flick
 * coasts about 500px.
 *
 * @param velocity px/s at the moment of release. Sign is preserved.
 * @param rate one of {@link DECELERATION}, or any value in (0, 1).
 */
export function projectDistance(velocity: number, rate: number = DECELERATION.normal): number {
  if (!Number.isFinite(velocity) || velocity === 0) return 0;
  const r = Math.min(0.99999, Math.max(0, rate));
  return (velocity / 1000) * (r / (1 - r));
}

/** Where a surface released at `position` moving at `velocity` would come to rest. */
export function projectPosition(
  position: number,
  velocity: number,
  rate: number = DECELERATION.normal,
): number {
  return position + projectDistance(velocity, rate);
}

/* ── Rubber banding ───────────────────────────────────────────────────────── */

/** UIScrollView's rubber-band constant. Lower = stiffer resistance. */
export const RUBBER_BAND_C = 0.55;

/**
 * Damped travel past an edge:
 *
 * ```
 * f(x, d, c) = (x · d · c) / (d + c · x)
 * ```
 *
 * The curve is asymptotic — as `x` grows without bound the result approaches
 * `d`, so no amount of pulling can drag a surface further than its own size past
 * the edge, and it never comes to a dead stop under the finger either. Near zero
 * `f` is linear with gradient `c`, which is what makes crossing INTO resistance
 * imperceptible: the surface does not change behaviour at the boundary, it just
 * gradually stops keeping up.
 *
 * @param distance how far past the edge the gesture has travelled. Sign preserved.
 * @param dimension the surface's own size along that axis — resistance has to
 *   scale with the thing being dragged, or it reads as sticky on a big sheet and
 *   as rigid on a small one.
 */
export function rubberBand(distance: number, dimension: number, c: number = RUBBER_BAND_C): number {
  if (!distance || dimension <= 0) return 0;
  const x = Math.abs(distance);
  return Math.sign(distance) * ((x * dimension * c) / (dimension + c * x));
}

/**
 * Clamp to `[min, max]`, but rubber-band the overshoot rather than cutting it —
 * the standard treatment for a drag that has reached its limit.
 */
export function rubberBandClamp(
  value: number,
  min: number,
  max: number,
  dimension: number,
  c: number = RUBBER_BAND_C,
): number {
  if (value < min) return min + rubberBand(value - min, dimension, c);
  if (value > max) return max + rubberBand(value - max, dimension, c);
  return value;
}

/* ── Springs ──────────────────────────────────────────────────────────────── */

export interface Spring {
  /** Restoring force per unit of displacement. */
  stiffness: number;
  /** Velocity-proportional drag. `2·√(stiffness·mass)` is critical damping. */
  damping: number;
  mass: number;
}

export interface SpringState {
  value: number;
  /** Units per second. Carried across every retarget — this is the whole point. */
  velocity: number;
}

/**
 * Build a spring the way SwiftUI does: by **perceptual duration** and
 * **bounce**, not by hand-tuned stiffness.
 *
 * ```
 * ω₀ = 2π / duration          stiffness = ω₀²·m
 * ζ  = 1 − bounce             damping   = 2ζω₀·m
 * ```
 *
 * This parameterisation is why iOS motion stays coherent across wildly
 * different travel distances: the same spring settles in the same *perceived*
 * time whether it moves 4px or 400px, because a spring's period depends on its
 * constants and not on its amplitude. Hand-tuned stiffness numbers do not
 * survive being reused at another scale; these do.
 *
 * @param duration perceptual duration in seconds.
 * @param bounce 0 = critically damped (no overshoot); 0.3 = lively. Negative
 *   values over-damp.
 */
export function spring(duration: number, bounce = 0, mass = 1): Spring {
  const d = Math.max(0.02, duration);
  const omega = (2 * Math.PI) / d;
  const zeta = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
  return { stiffness: omega * omega * mass, damping: 2 * zeta * omega * mass, mass };
}

/**
 * The site's spring vocabulary. Names match `APPLE_SPRING` in `lib/motion.ts`
 * (the framer-motion side of the same system) so a surface animated in React and
 * one animated imperatively here are the same motion, not two impressions of it.
 */
export const SPRINGS = {
  /** SwiftUI `.smooth`. Default for state changes with no gesture behind them. */
  smooth: spring(0.4, 0),
  /** SwiftUI `.snappy`. Controls, toggles, selections. */
  snappy: spring(0.4, 0.15),
  /** SwiftUI `.bouncy`. Reactions, badges, celebratory pops. */
  bouncy: spring(0.5, 0.3),
  /** Sheets and detents: longer travel, fully settled, no wobble to distract. */
  sheet: spring(0.55, 0.06),
  /**
   * Press-DOWN. Deliberately quicker than the release, as UIKit does it: the
   * acknowledgement has to feel instant, while the recovery can afford to be
   * relaxed. Symmetric press/release is one of the tells of a web button.
   */
  press: spring(0.22, 0),
  /** Press-RELEASE. Slower, with a whisper of bounce, so the surface "lets go". */
  release: spring(0.42, 0.18),
} as const satisfies Record<string, Spring>;

/**
 * Advance a spring by `dt` seconds toward `target`, **analytically**.
 *
 * A closed-form solution rather than a numeric integrator, because this is
 * driven from animation frames: dt is whatever the browser hands us, and a
 * background tab or a slow frame can deliver 250ms in one go. Euler integration
 * explodes there; the exact solution is unconditionally stable, so a janky frame
 * produces a correct jump rather than a visual detonation.
 *
 * (This module itself schedules nothing — callers own their frame loop, which is
 * what keeps it pure and testable. See the §17.3 allowlist test.)
 *
 * `state.velocity` is an input as well as an output — that is the mechanism
 * behind "interruptible and redirectable": to grab a moving element, call this
 * with a new `target` and the state you already have.
 */
export function springStep(
  state: SpringState,
  target: number,
  s: Spring = SPRINGS.smooth,
  dt: number,
): SpringState {
  if (dt <= 0) return state;
  // Clamped so one catastrophic frame cannot teleport the animation past its
  // target and back; the loop simply takes an extra frame instead.
  const t = Math.min(dt, 0.064);
  const omega = Math.sqrt(s.stiffness / s.mass);
  const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));

  // Solve in displacement-from-target space, where the target is the origin.
  const x0 = state.value - target;
  const v0 = state.velocity;
  let x: number;
  let v: number;

  if (zeta < 1) {
    // Under-damped: decaying oscillation.
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * omega * t);
    const c1 = x0;
    const c2 = (v0 + zeta * omega * x0) / wd;
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    x = e * (c1 * cos + c2 * sin);
    v = e * ((c2 * wd - zeta * omega * c1) * cos - (c1 * wd + zeta * omega * c2) * sin);
  } else if (zeta === 1) {
    // Critically damped: fastest approach with no overshoot.
    const e = Math.exp(-omega * t);
    const c2 = v0 + omega * x0;
    x = e * (x0 + c2 * t);
    v = e * (c2 - omega * (x0 + c2 * t));
  } else {
    // Over-damped: two real exponentials, no overshoot, slower.
    const r = omega * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * omega + r;
    const r2 = -zeta * omega - r;
    const c2 = (v0 - r1 * x0) / (r2 - r1);
    const c1 = x0 - c2;
    x = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
    v = c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t);
  }

  return { value: target + x, velocity: v };
}

/**
 * Has the spring arrived? Both tests matter: a spring passing through its target
 * at speed is at zero displacement but is not finished, and stopping it there is
 * exactly how an animation ends with a visible snap.
 */
export function springSettled(
  state: SpringState,
  target: number,
  distanceEpsilon = 0.01,
  velocityEpsilon = 0.4,
): boolean {
  return (
    Math.abs(state.value - target) < distanceEpsilon && Math.abs(state.velocity) < velocityEpsilon
  );
}

/* ── Velocity ─────────────────────────────────────────────────────────────── */

/** How far back the tracker looks. UIKit uses a comparable short window. */
export const VELOCITY_WINDOW_MS = 100;

/**
 * Windowed velocity sampler.
 *
 * Deriving release velocity from the last pointer delta alone is unusable: a
 * finger held still for a moment before lifting produces a delta of zero, so
 * every deliberate drag reads as a velocity-zero release, and one 2px jitter on
 * the final event reads as a flick. Averaging over a short trailing window gives
 * the number a person would describe as "how fast it was moving" — and, because
 * the window is short, it still drops to zero when the finger genuinely stops.
 */
export class VelocityTracker {
  private samples: Array<{ p: number; t: number }> = [];

  constructor(private windowMs: number = VELOCITY_WINDOW_MS) {}

  /** @param position current position, @param time a ms timestamp. */
  add(position: number, time: number): void {
    this.samples.push({ p: position, t: time });
    const cutoff = time - this.windowMs;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
  }

  /** Units per second over the window, or 0 with too little to go on. */
  get(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return 0;
    return ((last.p - first.p) / dt) * 1000;
  }

  reset(): void {
    this.samples.length = 0;
  }
}

/* ── Intent ───────────────────────────────────────────────────────────────── */

/**
 * Pick the detent a gesture is *heading for*, from its projected resting place
 * rather than from where the finger happens to be.
 *
 * This is the difference between a sheet that dismisses on a quick flick and one
 * that springs back because the flick only travelled 30px before the finger
 * left. It is the same rule scroll views use to decide which page they land on.
 *
 * @param position where the surface is now.
 * @param velocity px/s at release.
 * @param detents candidate resting positions. Order does not matter.
 */
export function resolveDetent(
  position: number,
  velocity: number,
  detents: readonly number[],
  rate: number = DECELERATION.normal,
): number {
  if (detents.length === 0) return position;
  const projected = projectPosition(position, velocity, rate);
  let best = detents[0];
  let bestDistance = Math.abs(projected - best);
  for (const d of detents) {
    const distance = Math.abs(projected - d);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = d;
    }
  }
  return best;
}

/** Smooth 0→1 ramp across `[a, b]`, flat outside it. */
export function smoothstep(a: number, b: number, v: number): number {
  if (b === a) return v >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How confident a gesture was, from how fast it was moving: 0 = browsing,
 * 1 = decisive.
 *
 * The talk's "accelerate decisions" idea, generalised. Speed is evidence about
 * intent, and an interface that already measures it has no excuse for asking a
 * hurried user to confirm as slowly as a hesitant one. Somebody who flicks
 * straight to a target has told you they know where they are going; somebody
 * creeping around has told you they are still deciding. Use it to shorten a
 * confirmation, not to skip one — the floor still has to be long enough to
 * abandon.
 *
 * @param speed magnitude of the gesture's velocity, in whatever unit the caller
 *   measures (px/s, deg/s — only the thresholds have to agree with it).
 * @param browsing at or below this, treat the gesture as exploratory.
 * @param decisive at or above this, treat it as certain.
 */
export function gestureConfidence(speed: number, browsing: number, decisive: number): number {
  if (!Number.isFinite(speed)) return 0;
  return smoothstep(browsing, decisive, Math.abs(speed));
}

/**
 * Should a dismissable surface go away when released here at this speed?
 *
 * A distance test alone punishes fast, confident gestures; a velocity test alone
 * fires on jitter. Projection subsumes both — a slow drag past the threshold
 * projects past it, and a fast flick short of it projects past it too — and the
 * explicit `escapeVelocity` covers the one case projection is too conservative
 * for: a hard flick from almost nowhere, which every platform treats as intent.
 */
export function shouldDismiss({
  position,
  velocity,
  threshold,
  escapeVelocity = 550,
  rate = DECELERATION.normal,
}: {
  /** Distance travelled in the dismissing direction (positive). */
  position: number;
  /** px/s at release; positive is toward dismissal. */
  velocity: number;
  /** How far the surface must be projected to travel to count as dismissed. */
  threshold: number;
  escapeVelocity?: number;
  rate?: number;
}): boolean {
  if (velocity <= -escapeVelocity) return false; // thrown decisively back
  if (velocity >= escapeVelocity) return true;
  return projectPosition(position, velocity, rate) >= threshold;
}

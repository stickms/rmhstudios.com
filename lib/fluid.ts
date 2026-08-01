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

/* ── Ripples ──────────────────────────────────────────────────────────────── */

/**
 * Default shape of a ripple, in the units {@link rippleWave} works in: radians
 * of arc for the geometry, seconds for time, and a peak displacement expressed
 * as a fraction of the surface's radius.
 *
 * `speed` is chosen against `life`: at 3.4 rad/s a crest crosses a hemisphere
 * (π/2) in ~0.46s and reaches the antipode (π) in ~0.92s, so it has just about
 * run out of sphere by the time the envelope has faded it out. A wave that dies
 * while still visibly mid-surface reads as a glitch; one that is still going
 * when it reconverges at the far pole reads as a bug.
 */
export interface RippleShape {
  /** How fast the crest travels outward, in radians of arc per second. */
  speed: number;
  /** Half-width of the wave packet, in radians. ~0.34 ≈ a 19° crest. */
  width: number;
  /** Peak outward displacement, as a fraction of the surface's radius. */
  amplitude: number;
  /** Total life, in seconds. Past this a ripple contributes exactly nothing. */
  life: number;
}

export const RIPPLE: RippleShape = {
  speed: 3.4,
  width: 0.34,
  amplitude: 0.055,
  life: 1.15,
};

/** One live ripple: where it was struck, and when. */
export interface RippleSource {
  /** Age of the ripple in seconds. Negative or past `life` contributes 0. */
  age: number;
  /** Arc distance from the impact point to the sample, in radians (0…π). */
  distance: number;
}

/**
 * Displacement of a point on a rippling surface, as a fraction of its radius.
 *
 * The packet is a **Ricker wavelet** — the negated second derivative of a
 * Gaussian, `(1 − q²)·e^(−q²/2)` where `q` is how far the sample sits ahead of
 * or behind the crest, in packet widths. That shape is chosen rather than a
 * plain Gaussian bump because a bump is a shockwave: one lump of surface pushed
 * outward and nothing else. The wavelet peaks at +1 on the crest and dips to
 * ≈−0.45 on either side of it, so the surface it passes over rises, falls back
 * *below* where it started, and settles — which is what water does, and what the
 * eye recognises as a ripple rather than a pulse.
 *
 * The envelope is quadratic (`(1 − age/life)²`) rather than linear so the wave
 * loses its energy fastest at the start, like a real one, and lands on exactly
 * zero at the end of its life instead of being cut off mid-amplitude.
 *
 * Pure, and unaware of spheres: the caller supplies the arc distance, so the
 * same function serves a ripple travelling over a ball, along a strip, or across
 * a flat pane.
 *
 * @returns 0 outside the ripple's life, so a caller can sum sources freely.
 */
export function rippleWave(
  { age, distance }: RippleSource,
  {
    speed = RIPPLE.speed,
    width = RIPPLE.width,
    amplitude = RIPPLE.amplitude,
    life = RIPPLE.life,
  }: Partial<RippleShape> = {},
): number {
  if (!(age >= 0) || age >= life || !Number.isFinite(distance)) return 0;
  const q = (distance - speed * age) / width;
  // Beyond ~4 packet widths the wavelet is under 0.1% of its peak; skipping the
  // exponential there is what keeps a per-sample call cheap in a frame loop,
  // where the overwhelming majority of samples are nowhere near the crest.
  if (q > 4 || q < -4) return 0;
  const decay = 1 - age / life;
  return amplitude * (1 - q * q) * Math.exp(-0.5 * q * q) * decay * decay;
}

/** How far a ripple's crest has travelled, in radians of arc. */
export function rippleFront(age: number, speed: number = RIPPLE.speed): number {
  return Math.max(0, age) * speed;
}

/**
 * Invert a perspective projection of the unit sphere: given a point on the
 * projected disc, which point on the sphere's NEAR face is under it?
 *
 * A point at depth `z` is drawn at `(x, y) · k(z)` where `k(z) = p / (p − z/2)`
 * is the foreshortening the renderer applies — so recovering `(x, y, z)` from a
 * screen position means solving for a `z` that is consistent with the `k` used
 * to place it. There is no closed form worth writing, but the map is a strong
 * contraction (`k` only ranges over ~1…1.19 for a perspective of 3.1), so a
 * handful of fixed-point iterations converge to well under a pixel — cheaper and
 * shorter than the quartic.
 *
 * Coordinates are in radii: `(0, 0)` is the centre of the disc and `1` is its
 * edge, x right, y **down** (screen-handed, matching CSS 3D). The returned
 * vector is a unit vector with `z` toward the viewer.
 *
 * @returns `null` when the point is off the sphere — the caller decides whether
 *   that is a miss or should clamp to the limb.
 */
export function unprojectSphere(
  x: number,
  y: number,
  perspective: number,
  iterations = 8,
): { x: number; y: number; z: number } | null {
  const r2 = x * x + y * y;
  // The drawn limb sits a little past r = 1 (perspective lets you see slightly
  // over the horizon), but the sliver between the two is ~1% of the radius and
  // treating it as a miss avoids a sqrt of a negative for no visible cost.
  if (!(r2 <= 1) || !Number.isFinite(perspective)) return null;
  let z = Math.sqrt(1 - r2);
  let px = x;
  let py = y;
  for (let i = 0; i < iterations; i++) {
    const k = perspective / (perspective - z * 0.5);
    px = x / k;
    py = y / k;
    const planar = px * px + py * py;
    if (planar >= 1) return null;
    z = Math.sqrt(1 - planar);
  }
  // Returned from the SAME iterate, so the triple is a unit vector by
  // construction however far the fixed point has converged. Taking `z` from one
  // pass and re-deriving `x`/`y` from the next leaves the two disagreeing by the
  // step's remaining error, which is nothing on screen but is enough to bias the
  // `acos` a caller measures arc distance with.
  return { x: px, y: py, z };
}

/**
 * Turn a point in a rotated sphere's VIEW space back into the sphere's own body
 * space — the inverse of "yaw about Y, then pitch about X", the rotation order a
 * renderer applies to get from the model to the screen.
 *
 * This is what makes a mark on a spinning ball stay a mark on the ball. A
 * gesture arrives in view space (where the viewer is looking), but everything
 * the renderer samples — a point on a wireframe ring, the direction of a pin —
 * is defined in body space, so an impact has to be carried back across the
 * rotation once, at the moment it lands, rather than the whole surface being
 * carried forward across it on every frame.
 *
 * Angles in degrees, to match the rotations they undo. Screen-handed like
 * {@link unprojectSphere}: x right, y down, z toward the viewer.
 */
export function unrotateSphere(
  v: { x: number; y: number; z: number },
  yawDeg: number,
  pitchDeg: number,
): { x: number; y: number; z: number } {
  const d = Math.PI / 180;
  const cy = Math.cos(yawDeg * d);
  const sy = Math.sin(yawDeg * d);
  const cp = Math.cos(pitchDeg * d);
  const sp = Math.sin(pitchDeg * d);
  // Undo the pitch first (it was applied last), then the yaw.
  const y1 = v.y * cp + v.z * sp;
  const z1 = -v.y * sp + v.z * cp;
  return { x: v.x * cy - z1 * sy, y: y1, z: v.x * sy + z1 * cy };
}

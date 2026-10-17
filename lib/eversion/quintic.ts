/**
 * Quintic Hermite segments — the only way anything on the eversion timeline
 * moves (spec §7.2). PRIVATE to `timeline.ts` and its tests. Pure, no DOM.
 *
 * ## Why a quintic, and why Hermite
 *
 * A cubic can match position and velocity at both ends; a retime then leaves a
 * visible kink in acceleration, which on a sphere that is mid-spin reads as a
 * lurch. The fifth-order Hermite matches position, velocity AND acceleration at
 * both ends, so a segment can start from wherever a previous one was interrupted
 * — mid-flight, accelerating — and the joint is C² by construction. That is what
 * lets a gate wait, a fast-forward or a resize re-plan every channel at an
 * arbitrary instant with no hard cut. (`lib/fluid.ts` springs are the repo's
 * idiom for user-driven motion; a spring cannot be told "arrive at 4300 ms with
 * zero velocity", which the spin landing needs.)
 *
 * ## Layout
 *
 * A segment lives in a caller-owned `Float64Array` at an offset, so a timeline
 * of twelve channels is one buffer and re-planning allocates nothing. Times are
 * milliseconds, velocities per ms, accelerations per ms². Internally the
 * polynomial is evaluated in normalised time `s = (t − t0)/T`, with velocity and
 * acceleration scaled by `T` and `T²`, which keeps the coefficients O(Δx) and the
 * evaluation well-conditioned for any duration.
 *
 * ## After the end
 *
 * What a segment does once `t ≥ t0 + T` is its {@link SegmentKind}:
 *
 * - `HOLD`: stays at `x1` at rest. Requires `v1 = a1 = 0` (a hold that ends
 *   moving would be a position/velocity contradiction).
 * - `ASYMPTOTE`: approaches `p1` exponentially at rate `p2` — the eversion
 *   waiting for AFTER (spec §7.5). C² at the joint iff `v1 = p2·(p1 − x1)` and
 *   `a1 = −p2·v1`; {@link asymptoteRate} computes `p2` from the other two.
 * - `CRUISE`: continues at constant velocity `v1` (`a1 = 0`) — the spin turning
 *   slowly while it waits.
 *
 * Before `t0` a segment reports its initial state; the timeline only schedules a
 * segment in the future when the channel is at rest, so that is `(x0, 0, 0)`.
 */

/** Floats per segment. */
export const SEG_STRIDE = 14;

/** What a segment does after its end — see the module docblock. */
export const SEG_HOLD = 0;
export const SEG_ASYMPTOTE = 1;
export const SEG_CRUISE = 2;
export type SegmentKind = typeof SEG_HOLD | typeof SEG_ASYMPTOTE | typeof SEG_CRUISE;

/* Field offsets within a segment. */
const T0 = 0;
const DUR = 1;
const X0 = 2;
const V0S = 3; // initial velocity × T
const A0S = 4; // initial acceleration × T²
const C3 = 5;
const C4 = 6;
const C5 = 7;
const KIND = 8;
const P1 = 9;
const P2 = 10;
const X1 = 11;
const V1 = 12;
const A1 = 13;

/**
 * Write the quintic Hermite from `(x0, v0, a0)` at `t0` to `(x1, v1, a1)` at
 * `t0 + duration`, then continue as `kind` (with tail parameters `p1`, `p2`).
 *
 * The coefficients solve the six boundary conditions exactly; with
 * `dx = x1 − x0 − V0 − A0/2`, `dv = V1 − V0 − A0` and `da = A1 − A0` (all in
 * normalised time):
 * `c3 = 10dx − 4dv + da/2`, `c4 = −15dx + 7dv − da`, `c5 = 6dx − 3dv + da/2`.
 */
export function setSegment(
  d: Float64Array,
  o: number,
  t0: number,
  duration: number,
  x0: number,
  v0: number,
  a0: number,
  x1: number,
  v1: number,
  a1: number,
  kind: SegmentKind = SEG_HOLD,
  p1 = 0,
  p2 = 0,
): void {
  const T = duration;
  const V0 = v0 * T;
  const A0 = a0 * T * T;
  const V1s = v1 * T;
  const A1s = a1 * T * T;
  const dx = x1 - x0 - V0 - A0 * 0.5;
  const dv = V1s - V0 - A0;
  const da = A1s - A0;
  d[o + T0] = t0;
  d[o + DUR] = T;
  d[o + X0] = x0;
  d[o + V0S] = V0;
  d[o + A0S] = A0;
  d[o + C3] = 10 * dx - 4 * dv + 0.5 * da;
  d[o + C4] = -15 * dx + 7 * dv - da;
  d[o + C5] = 6 * dx - 3 * dv + 0.5 * da;
  d[o + KIND] = kind;
  d[o + P1] = p1;
  d[o + P2] = p2;
  d[o + X1] = x1;
  d[o + V1] = v1;
  d[o + A1] = a1;
}

/**
 * Exponential rate that makes an {@link SEG_ASYMPTOTE} tail C² with a quintic
 * arriving at `x1` with velocity `v1`, heading for `target`.
 */
export function asymptoteRate(target: number, x1: number, v1: number): number {
  return v1 / (target - x1);
}

/** Absolute end time of the polynomial part. */
export function segmentEnd(d: Float64Array, o: number): number {
  return d[o + T0] + d[o + DUR];
}

/** Where the polynomial part ends. */
export function segmentTarget(d: Float64Array, o: number): number {
  return d[o + X1];
}

/** Write `(x, ẋ, ẍ)` of the segment at `t` to `out[oo..oo+2]`. Allocation-free. */
export function evalSegment(
  d: Float64Array,
  o: number,
  t: number,
  out: Float64Array,
  oo = 0,
): void {
  const t0 = d[o + T0];
  const T = d[o + DUR];
  const s = (t - t0) / T;
  if (s <= 0) {
    out[oo] = d[o + X0];
    out[oo + 1] = d[o + V0S] / T;
    out[oo + 2] = d[o + A0S] / (T * T);
    return;
  }
  if (s < 1) {
    const V0 = d[o + V0S];
    const A0 = d[o + A0S];
    const c3 = d[o + C3];
    const c4 = d[o + C4];
    const c5 = d[o + C5];
    const s2 = s * s;
    const s3 = s2 * s;
    const s4 = s3 * s;
    out[oo] = d[o + X0] + V0 * s + 0.5 * A0 * s2 + c3 * s3 + c4 * s4 + c5 * s4 * s;
    out[oo + 1] = (V0 + A0 * s + 3 * c3 * s2 + 4 * c4 * s3 + 5 * c5 * s4) / T;
    out[oo + 2] = (A0 + 6 * c3 * s + 12 * c4 * s2 + 20 * c5 * s3) / (T * T);
    return;
  }
  const x1 = d[o + X1];
  const kind = d[o + KIND];
  if (kind === SEG_HOLD) {
    out[oo] = x1;
    out[oo + 1] = 0;
    out[oo + 2] = 0;
    return;
  }
  const tau = t - (t0 + T);
  if (kind === SEG_CRUISE) {
    const v1 = d[o + V1];
    out[oo] = x1 + v1 * tau;
    out[oo + 1] = v1;
    out[oo + 2] = 0;
    return;
  }
  // SEG_ASYMPTOTE: x = p1 − (p1 − x1)·e^(−k τ)
  const k = d[o + P2];
  const gap = (d[o + P1] - x1) * Math.exp(-k * tau);
  out[oo] = d[o + P1] - gap;
  out[oo + 1] = k * gap;
  out[oo + 2] = -k * k * gap;
}

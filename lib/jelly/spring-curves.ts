/**
 * CSS spring curves (CSS-first jelly, PR 3; docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3 "Soft body
 * is CSS").
 *
 * The soft body is CSS transitions on `scale` now, and a transition's easing can be a spring: CSS `linear(...)` takes
 * evenly spaced progress stops, so sampling the closed-form step response of a damped spring (rest 0 → target 1, from
 * rest) over its settle time gives an easing that rises, overshoots and settles the way the old physics spring did.
 * The curves are generated here ONCE and pasted as `--spring-*` tokens into `app/jelly-material.css`;
 * `lib/__tests__/jelly-spring-tokens.test.ts` keeps each literal equal to its generator.
 *
 * Pure: nothing here touches the DOM.
 */

export interface DampedSpringOptions {
  /** N/m: `ω₀² · mass`. */
  stiffness: number;
  /** N·s/m: `2ζω₀ · mass` (critical damping is `2·√(stiffness·mass)`). */
  damping: number;
  /** Default 1. */
  mass?: number;
  /** Number of equal intervals sampled over the settle time (the curve has `samples + 1` stops). Default 40. */
  samples?: number;
}

/** The response is settled once it stays within this of the target for good (0.1% of the travel). */
export const SPRING_SETTLE_EPSILON = 1e-3;

const DEFAULT_SAMPLES = 40;
/** Settle search: step and horizon, seconds. */
const SEARCH_STEP_S = 1e-4;
const SEARCH_HORIZON_S = 10;

function validate(opts: DampedSpringOptions): { k: number; c: number; m: number } {
  const m = opts.mass ?? 1;
  const { stiffness: k, damping: c } = opts;
  if (!(k > 0) || !(m > 0) || !(c >= 0) || !Number.isFinite(k + m + c))
    throw new RangeError(
      `a damped spring needs stiffness > 0, mass > 0 and damping ≥ 0 (got ${k}, ${m}, ${c})`,
    );
  return { k, c, m };
}

/**
 * The step response at `t` seconds: a spring at rest at 0, released toward 1 with no initial velocity.
 * Under-damped `1 − e^{−ζω₀t}(cos ω_d t + ζω₀/ω_d · sin ω_d t)`, critically damped `1 − e^{−ω₀t}(1 + ω₀t)`,
 * over-damped `1 + (r₂e^{r₁t} − r₁e^{r₂t}) / (r₁ − r₂)`.
 */
export function springResponse(t: number, opts: DampedSpringOptions): number {
  const { k, c, m } = validate(opts);
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  if (Math.abs(zeta - 1) < 1e-6) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return (
      1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
    );
  }
  const s = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - s);
  const r2 = -w0 * (zeta + s);
  return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2);
}

/** Seconds after which the response stays within {@link SPRING_SETTLE_EPSILON} of 1 for good. */
function settleSeconds(opts: DampedSpringOptions): number {
  validate(opts);
  let last = 0;
  for (let t = SEARCH_STEP_S; t <= SEARCH_HORIZON_S; t += SEARCH_STEP_S)
    if (Math.abs(springResponse(t, opts) - 1) > SPRING_SETTLE_EPSILON) last = t;
  return last;
}

/** The settle time in whole milliseconds (rounded up): the `--spring-*-dur` a transition on this curve takes. */
export function springSettleMs(opts: DampedSpringOptions): number {
  return Math.ceil(settleSeconds(opts) * 1000);
}

const stop = (v: number) => `${+v.toFixed(4)}`;

/**
 * A CSS `linear(...)` easing for the damped spring: `samples + 1` evenly spaced stops of its step response over
 * {@link springSettleMs}, the first exactly 0 and the last exactly 1. Use it with that duration.
 */
export function dampedSpringLinear(opts: DampedSpringOptions): string {
  const samples = opts.samples ?? DEFAULT_SAMPLES;
  if (!Number.isInteger(samples) || samples < 2)
    throw new RangeError(`a spring curve needs at least 2 samples (got ${samples})`);
  const duration = springSettleMs(opts) / 1000;
  const values: string[] = ['0'];
  for (let i = 1; i < samples; i++)
    values.push(stop(springResponse((duration * i) / samples, opts)));
  values.push('1');
  return `linear(${values.join(', ')})`;
}

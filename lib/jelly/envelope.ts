/**
 * Tier E — the envelope soft body every eligible element gets (docs/plans/plasmatic-jelly/02-soft-body.md §1.2).
 *
 * A body is four independent springs: `sx`, `sy` (scale multipliers about the centre, rest 1) and `tx`, `ty` (px,
 * rest 0), each advanced with the analytic {@link springStep} from `lib/fluid.ts`, so any `dt` is stable. This file
 * is pure math: it computes targets (hover, press, drag, rest), steps the springs, applies the caps through a soft
 * saturating ceiling, and reports when the body has settled. The physics service owns the DOM and the frame.
 *
 * ## Caps (02 D3, `MOTION_BOUNDS` in tiers.ts)
 *
 * The jelly part of the motion never moves an edge more than `MOTION_BOUNDS.maxEdgeTravelPx` (4px) and never
 * changes a scale by more than `MOTION_BOUNDS.maxScaleDelta` (3%). The 4px are split evenly: translate ≤ 2px and the
 * jelly scale ≤ 2px of edge travel, i.e. per axis `c = min(3%, 4px / size)`.
 *
 * "Jelly part" is measured from the **legacy press anchor**: an isotropic scale anywhere between rest (1) and the
 * mode's base press scale `s0` (0.96 / 0.985 / 1.028) is the press that ships today and is left exactly as it is,
 * so a centre press still lands on `s0`. Everything beyond that — anisotropic squash, overshoot past either end,
 * hover plump — is saturated with `x → cap·tanh(x/cap)` (dough's `U_MAX` idea), so a violent flick never shows a
 * clamp edge. The squash is expressed as a log-aspect `d = ½·ln(sx/sy)` and rendered as `iso·e^{±d}`, which keeps
 * the area exactly `iso²` however hard the cap bites.
 */

import { SPRINGS, springStep, type Spring, type SpringState } from '@/lib/fluid';

import { SOFT_BODY, plasticDecay, plasticFraction } from './soft-policy';
import { MOTION_BOUNDS } from './tiers';

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface EnvelopeBody {
  sx: SpringState;
  sy: SpringState;
  tx: SpringState;
  ty: SpringState;
  /** Plastic memory: multiplicative scale offsets added to the rest target, decaying with age. */
  plastic: { kx: number; ky: number; age: number };
}

/** A pose: what the springs head toward, or what the host is drawn with. */
export interface EnvelopePose {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

export interface EnvelopeSize {
  /** Rest border-box width/height (CSS px). */
  w: number;
  h: number;
}

/** A point relative to the rest rect's centre, normalised to [-1, 1] on each axis. */
export interface UnitOffset {
  x: number;
  y: number;
}

export interface EnvelopeCaps {
  /** Per-axis jelly scale cap `min(3%, 4px/size)` (fraction). */
  scaleX: number;
  scaleY: number;
  /** Translate cap (px). */
  translate: number;
  /** Hover lean `min(2px, 0.006·min(w,h))` (px). */
  lean: number;
}

/** Sleep thresholds: below these a write would change nothing visible (02 §4 write phase). */
export const ENVELOPE_EPSILON = {
  scale: 0.0005,
  scaleVelocity: 0.005,
  translate: 0.05,
  translateVelocity: 0.5,
} as const;

/** Frame-time guard: a dt above this is a stall, not a frame (matches the lattice). */
export const ENVELOPE_MAX_DT = 0.25;
/** Substep size handed to `springStep` (which clamps a single step to 64ms). */
const SUBSTEP = 1 / 30;

/* ── Construction ────────────────────────────────────────────────────────── */

export const REST_POSE: Readonly<EnvelopePose> = Object.freeze({ sx: 1, sy: 1, tx: 0, ty: 0 });

/** A body at rest (or at `pose`, velocity 0). */
export function createEnvelope(pose: EnvelopePose = REST_POSE): EnvelopeBody {
  return {
    sx: { value: pose.sx, velocity: 0 },
    sy: { value: pose.sy, velocity: 0 },
    tx: { value: pose.tx, velocity: 0 },
    ty: { value: pose.ty, velocity: 0 },
    plastic: { kx: 0, ky: 0, age: 0 },
  };
}

/* ── Caps ────────────────────────────────────────────────────────────────── */

/** The caps for an element of this rest size (02 §1.2 Caps, split per the module doc). */
export function envelopeCaps(size: EnvelopeSize): EnvelopeCaps {
  const translate = MOTION_BOUNDS.maxEdgeTravelPx / 2;
  const scaleBudgetPx = MOTION_BOUNDS.maxEdgeTravelPx - translate;
  const axis = (s: number) =>
    s > 0 ? Math.min(MOTION_BOUNDS.maxScaleDelta, (2 * scaleBudgetPx) / s) : 0;
  const short = Math.max(0, Math.min(size.w, size.h));
  return {
    scaleX: axis(size.w),
    scaleY: axis(size.h),
    translate,
    lean: Math.min(SOFT_BODY.maxLeanPx, SOFT_BODY.leanPerSize * short, translate),
  };
}

/** The soft ceiling: identity near 0, asymptotic to ±cap. */
export function saturate(x: number, cap: number): number {
  if (!(cap > 0) || !Number.isFinite(x)) return 0;
  return cap * Math.tanh(x / cap);
}

/* ── Targets ─────────────────────────────────────────────────────────────── */

function clampUnit(u: UnitOffset): UnitOffset {
  const c = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return { x: c(u.x), y: c(u.y) };
}

/** The rest pose (plus any plastic memory). */
export function restTarget(body?: EnvelopeBody): EnvelopePose {
  if (!body) return { ...REST_POSE };
  const k = plasticDecay(body.plastic.age);
  return { sx: 1 + body.plastic.kx * k, sy: 1 + body.plastic.ky * k, tx: 0, ty: 0 };
}

/**
 * Hover pose (fine pointer only). Cards plump (`1 + 0.008`) and lean toward the cursor by `lean·u`; controls dent
 * (`1 − 0.004`) with half the lean — a button reads as something you push, a card as something that rises.
 */
export function hoverTarget(
  u: UnitOffset,
  size: EnvelopeSize,
  kind: 'plump' | 'dent' = 'plump',
): EnvelopePose {
  const p = clampUnit(u);
  const caps = envelopeCaps(size);
  const s = kind === 'plump' ? 1 + SOFT_BODY.hoverPlump : 1 - SOFT_BODY.hoverDent;
  const lean = kind === 'plump' ? caps.lean : caps.lean / 2;
  return { sx: s, sy: s, tx: lean * p.x, ty: lean * p.y };
}

/** Press axis weights `w = u² / (ux² + uy² + 0.15)` (02 §1.2 Press). */
export function pressWeights(u: UnitOffset): { wx: number; wy: number } {
  const p = clampUnit(u);
  const den = p.x * p.x + p.y * p.y + SOFT_BODY.pressWeightSoftening;
  return { wx: (p.x * p.x) / den, wy: (p.y * p.y) / den };
}

/**
 * Volume-preserving press pose about the contact `u`:
 *
 * ```
 * sx = s0 · (1 − q·wx) · (1 + q·wy)
 * sy = s0 · (1 − q·wy) · (1 + q·wx)
 * ```
 *
 * A centre press (`w ≈ 0`) is exactly the legacy isotropic `s0`. Pressing near the top flattens vertically and
 * widens. The translate moves 30% of the lean toward the contact, so the element gives under the finger.
 */
export function pressTarget(u: UnitOffset, s0: number, size: EnvelopeSize): EnvelopePose {
  const p = clampUnit(u);
  const { wx, wy } = pressWeights(p);
  const q = SOFT_BODY.pressSquash;
  const lean = envelopeCaps(size).lean * SOFT_BODY.pressLeanShare;
  return {
    sx: s0 * (1 - q * wx) * (1 + q * wy),
    sy: s0 * (1 - q * wy) * (1 + q * wx),
    tx: lean * p.x,
    ty: lean * p.y,
  };
}

/**
 * Drag pose for a pointer velocity `(vx, vy)` px/s: stretch along the velocity, area-preserving
 * (`s_par = 1 + min(0.035, |v|/2400·0.035)`, `s_perp = 1/s_par`, projected onto x/y in log space), plus a lag of up
 * to 2px *against* the velocity for the trailing jiggle. The caller still owns the drag translation itself.
 */
export function dragTarget(vx: number, vy: number): EnvelopePose {
  const speed = Math.hypot(vx, vy);
  if (!(speed > 0) || !Number.isFinite(speed)) return { ...REST_POSE };
  const stretch = Math.min(SOFT_BODY.dragMax, (speed / SOFT_BODY.dragSpeed) * SOFT_BODY.dragMax);
  const ax = (vx * vx) / (speed * speed);
  const ay = 1 - ax;
  const logX = Math.log(1 + stretch) * (ax - ay);
  const lag = SOFT_BODY.dragLagPx * Math.min(1, speed / SOFT_BODY.dragSpeed);
  return {
    sx: Math.exp(logX),
    sy: Math.exp(-logX),
    tx: (-lag * vx) / speed,
    ty: (-lag * vy) / speed,
  };
}

/* ── Impulses ────────────────────────────────────────────────────────────── */

/**
 * The initial velocity that makes a spring at rest peak at `peak` units, i.e. the inverse of
 * `x* = v0/ω · exp(−ζ/√(1−ζ²) · atan(√(1−ζ²)/ζ))` (and `x* = v0/(ω·e)` when critically damped).
 */
export function impulseVelocity(peak: number, s: Spring): number {
  const omega = Math.sqrt(s.stiffness / s.mass);
  const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
  let factor: number;
  if (zeta < 1) {
    const r = Math.sqrt(1 - zeta * zeta);
    factor = Math.exp((-zeta / r) * Math.atan2(r, zeta));
  } else if (zeta === 1) {
    factor = Math.exp(-1);
  } else {
    const r = Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta + r;
    const r2 = -zeta - r;
    const t = Math.log(r2 / r1) / (r1 - r2);
    factor = (Math.exp(r1 * t) - Math.exp(r2 * t)) / (r1 - r2);
  }
  return (peak * omega) / factor;
}

/**
 * Kick the translate springs so the body moves up to `peak` px along `(dx, dy)` and springs back — the neighbour
 * nudge (≤ 1.5px, 02 §2) and an arc strike's impulse (R12). Never touches scale. Mutates `body`.
 */
export function nudgeEnvelope(
  body: EnvelopeBody,
  dx: number,
  dy: number,
  peak: number,
  s: Spring = SPRINGS.jellyNudge,
): void {
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || !(peak > 0)) return;
  const v = impulseVelocity(Math.min(peak, MOTION_BOUNDS.nudgePx), s);
  body.tx.velocity += (v * dx) / len;
  body.ty.velocity += (v * dy) / len;
}

/**
 * Hover-entry jiggle: `min(1, |v|/1500) · 0.6 /s` added to the scale springs, split by the entry axis. Mutates `body`.
 */
export function hoverKick(body: EnvelopeBody, vx: number, vy: number): void {
  const speed = Math.hypot(vx, vy);
  if (!(speed > 0) || !Number.isFinite(speed)) return;
  const k = Math.min(1, speed / SOFT_BODY.kickSpeed) * SOFT_BODY.kickScale;
  body.sx.velocity += (k * Math.abs(vx)) / speed;
  body.sy.velocity += (k * Math.abs(vy)) / speed;
}

/**
 * On release: keep a plastic memory of the squash when the press was held longer than 350ms (≤ 40% of it, decaying
 * with τ = 0.6s, exactly gone after 3τ). `pressed` is the press pose the body was heading to and `s0` its base.
 * Mutates `body`.
 */
export function beginPlastic(
  body: EnvelopeBody,
  pressed: EnvelopePose,
  s0: number,
  heldMs: number,
): void {
  const f = plasticFraction(heldMs, SOFT_BODY.plasticMaxEnvelope);
  const base = s0 > 0 ? s0 : 1;
  if (f === 0) {
    body.plastic = { kx: 0, ky: 0, age: 0 };
    return;
  }
  body.plastic = { kx: f * (pressed.sx / base - 1), ky: f * (pressed.sy / base - 1), age: 0 };
}

/* ── Stepping ────────────────────────────────────────────────────────────── */

/** The springs a phase uses (02 §1.2 table). `wobble: false` (lite/still) makes the release critically damped. */
export function phaseSprings(
  phase: 'hover' | 'press' | 'release' | 'drag',
  wobble = true,
): { scale: Spring; translate: Spring } {
  switch (phase) {
    case 'hover':
      return { scale: SPRINGS.jellyHover, translate: SPRINGS.jellyHover };
    case 'press':
      return { scale: SPRINGS.jellyPress, translate: SPRINGS.jellyPress };
    case 'drag':
      return { scale: SPRINGS.jellyDrag, translate: SPRINGS.jellyDrag };
    case 'release': {
      const s = wobble ? SPRINGS.jellyRelease : CRITICAL_RELEASE;
      return { scale: s, translate: wobble ? SPRINGS.jellyNudge : CRITICAL_RELEASE };
    }
  }
}

/** `jellyRelease`'s period with ζ = 1: the lite/still release (02 §4 Degradation). */
const CRITICAL_RELEASE: Spring = {
  stiffness: SPRINGS.jellyRelease.stiffness,
  damping: 2 * Math.sqrt(SPRINGS.jellyRelease.stiffness * SPRINGS.jellyRelease.mass),
  mass: SPRINGS.jellyRelease.mass,
};

/**
 * Advance the body by `dt` seconds toward `target`. Velocity is carried across retargets (re-press mid-wobble is
 * continuous). `dt` is clamped to {@link ENVELOPE_MAX_DT} and split into ≤ 1/30s analytic substeps, so even a
 * 250ms stall advances the full time instead of being silently dropped. Mutates and returns `body`.
 */
export function stepEnvelope(
  body: EnvelopeBody,
  target: EnvelopePose,
  springs: { scale: Spring; translate: Spring },
  dt: number,
): EnvelopeBody {
  if (!(dt > 0)) return body;
  let left = Math.min(dt, ENVELOPE_MAX_DT);
  while (left > 1e-9) {
    const h = Math.min(left, SUBSTEP);
    body.sx = springStep(body.sx, target.sx, springs.scale, h);
    body.sy = springStep(body.sy, target.sy, springs.scale, h);
    body.tx = springStep(body.tx, target.tx, springs.translate, h);
    body.ty = springStep(body.ty, target.ty, springs.translate, h);
    left -= h;
  }
  if (body.plastic.kx !== 0 || body.plastic.ky !== 0) {
    body.plastic.age += Math.min(dt, ENVELOPE_MAX_DT);
    if (plasticDecay(body.plastic.age) === 0) body.plastic = { kx: 0, ky: 0, age: 0 };
  }
  return body;
}

/** True when every spring sits on `target` and has stopped (the writes would no longer change anything). */
export function envelopeSettled(body: EnvelopeBody, target: EnvelopePose): boolean {
  const e = ENVELOPE_EPSILON;
  return (
    Math.abs(body.sx.value - target.sx) < e.scale &&
    Math.abs(body.sy.value - target.sy) < e.scale &&
    Math.abs(body.sx.velocity) < e.scaleVelocity &&
    Math.abs(body.sy.velocity) < e.scaleVelocity &&
    Math.abs(body.tx.value - target.tx) < e.translate &&
    Math.abs(body.ty.value - target.ty) < e.translate &&
    Math.abs(body.tx.velocity) < e.translateVelocity &&
    Math.abs(body.ty.velocity) < e.translateVelocity
  );
}

/**
 * True when the body is at rest with no plastic memory left: the service may clear `scale`, `translate` and
 * `will-change` and stop requesting frames for it.
 */
export function envelopeAsleep(body: EnvelopeBody): boolean {
  return body.plastic.kx === 0 && body.plastic.ky === 0 && envelopeSettled(body, REST_POSE);
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

/**
 * The capped pose to write, for a body of rest `size` whose legacy press base is `s0`.
 *
 * - The isotropic part `iso = √(sx·sy)` is free inside `[min(1,s0), max(1,s0)]` (the legacy press) and saturated
 *   beyond it at `0.33·c`.
 * - The log-aspect `d = ½·ln(sx/sy)` is saturated at `ln(1 + 0.64·c)`, so `(1 + 0.33c)(1 + 0.64c) − 1 ≤ c` for every
 *   `c ≤ 3%`: the combined jelly deviation never exceeds the per-axis cap, and the area stays exactly `iso²`.
 * - Translate is saturated at 2px per axis component's magnitude.
 *
 * With `scale: false` (large surfaces, inline framer offsets) only the lean survives.
 */
export function renderEnvelope(
  body: EnvelopeBody,
  size: EnvelopeSize,
  s0 = 1,
  opts: { scale?: boolean } = {},
): EnvelopePose {
  const caps = envelopeCaps(size);
  const tLen = Math.hypot(body.tx.value, body.ty.value);
  const tScale = tLen > 0 ? saturate(tLen, caps.translate) / tLen : 0;
  const tx = body.tx.value * tScale;
  const ty = body.ty.value * tScale;
  if (opts.scale === false) return { sx: 1, sy: 1, tx, ty };

  const sx = Math.max(1e-3, body.sx.value);
  const sy = Math.max(1e-3, body.sy.value);
  const lo = Math.min(1, s0);
  const hi = Math.max(1, s0);
  // ÷ hi: the deviation is relative to an anchor of up to `hi`, and the cap is on absolute travel.
  const c = Math.min(caps.scaleX, caps.scaleY) / hi;
  const iso = Math.sqrt(sx * sy);
  const anchor = Math.min(hi, Math.max(lo, iso));
  const isoOut = anchor * (1 + saturate(iso / anchor - 1, 0.33 * c));
  const d = 0.5 * Math.log(sx / sy);
  const dOut = saturate(d, Math.log(1 + 0.64 * c));
  return { sx: isoOut * Math.exp(dOut), sy: isoOut * Math.exp(-dOut), tx, ty };
}

/* ── Corner flex (02 §1.4) ───────────────────────────────────────────────── */

/**
 * Per-corner radii `[topLeft, topRight, bottomRight, bottomLeft]` for a small control pressed at `u`: the corners
 * nearest the contact tighten and the far corners round out, by at most ±25% of the rest radius scaled by `amount`
 * (0..1, the press progress).
 */
export function cornerFlexRadii(
  radius: number,
  u: UnitOffset,
  amount = 1,
): [number, number, number, number] {
  const p = clampUnit(u);
  const a = Math.max(0, Math.min(1, amount)) * SOFT_BODY.cornerFlexAmount;
  const r = Math.max(0, radius);
  // Corner directions in unit space; proximity = dot(u, corner)/2 ∈ [-1, 1].
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const out = corners.map(([cx, cy]) => r * (1 - a * ((p.x * cx + p.y * cy) / 2)));
  return [out[0], out[1], out[2], out[3]];
}

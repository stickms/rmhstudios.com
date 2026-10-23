/**
 * Tier L — the 8-node perimeter spring lattice that squishes a shader slab's rim
 * (docs/plans/plasmatic-jelly/02-soft-body.md §1.3).
 *
 * Eight nodes sit on the rest rect — four corners and four edge midpoints, clockwise from the top-left, in slab-local
 * CSS px (y down). Each holds a 2D offset `o_i` and velocity `v_i`. Per node:
 *
 * ```
 * F_i = −k_a·(o_i − p_i)                          anchor to rest (p_i = plastic memory)   k_a = (2π/0.40)²
 *     + k_n·(o_{i−1} + o_{i+1} − 2·o_i)           perimeter smoothness                     k_n = 0.6·k_a
 *     − k_v·(ΔA / P)·n̂_i                          area preservation                        k_v = 5·k_a
 *     − c·v_i                                     c = 2ζ√k_a, ζ 0.40 free / 0.80 driven
 *     + input_i                                   hover pull, press dent, drag pseudo-force
 * ```
 *
 * `ΔA / P` is the shoelace area change in px of uniform normal offset, so the area term's stiffness is `k_v` at every
 * slab size and the integrator's stability does not depend on how big the surface is.
 *
 * Integration is semi-implicit Euler with `h ≤ 1/120 s`, at most 4 substeps per frame, `dt` clamped to 0.05 s: the
 * stiffest mode is `ω ≤ √(8.4·k_a) ≈ 46 rad/s`, so `ω·h ≤ 0.57`, far inside the `2` stability bound even when a
 * 250ms stall arrives as one frame.
 *
 * The output ({@link latticeUniform}) is what the rim shader reads as `uniform vec2 uJelly[8]`: the offsets with
 * their normal component soft-capped at `outward` (≤ 2px, the focus ring's offset, 04 §4.5) and `inward`
 * (`min(0.6·bevel, 10px)`), so whatever the solver does, the drawn rim stays inside the bounds.
 *
 * Pure: no DOM, no clock. The glass engine steps it inside its own frame (02 D9).
 */

import { latticeCaps, plasticDecay, plasticFraction, SOFT_BODY } from './soft-policy';
import { DENT } from './tiers';

export const LATTICE_NODES = 8;

/** Solver constants (02 §1.3). */
export const LATTICE = {
  /** Anchor stiffness, `(2π/0.40)²`. */
  ka: ((2 * Math.PI) / 0.4) ** 2,
  /** Smoothness as a share of `ka`. */
  smoothness: 0.6,
  /** Area stiffness as a multiple of `ka`: a held 6px dent bulges the far sides by ≈ 1.5px (02 §1.3). */
  area: 5,
  /** Damping ratios: free (release wobble) and while an input drives the lattice. */
  zetaFree: 0.4,
  zetaDriven: 0.8,
  /** Fixed substep and its cap. */
  h: 1 / 120,
  maxSubsteps: 4,
  maxDt: 0.05,
  /** Hover pull: Gaussian σ as a share of the perimeter, peak outward offset (px). */
  hoverSigma: 0.18,
  hoverPx: 3,
  /** Press dent: Gaussian σ as a share of the perimeter, and the overdrive that lets the dent reach its cap. */
  pressSigma: 0.08,
  pressDrive: 2.2,
  /** Sleep thresholds. */
  sleepOffset: 0.05,
  sleepVelocity: 0.5,
} as const;

export interface LatticeSpec {
  /** Rest slab size (CSS px). */
  w: number;
  h: number;
  /** Rim bevel width (CSS px), 3–24 at the engine's current policy. */
  bevel: number;
  /** Amplitude multiplier (0.5 on large surfaces, 04 §4.3). Default 1. */
  amplitude?: number;
}

export type LatticeInput =
  /** Pointer over the slab at local `(x, y)`; `strength` 0..1 scales the pull. */
  | { kind: 'hover'; x: number; y: number; strength?: number }
  /** Press at local `(x, y)`; `strength` 0..1 scales the dent. */
  | { kind: 'press'; x: number; y: number; strength?: number }
  /** Host acceleration (px/s²) from a drag owner: the slab lags as a pseudo-force `−a`. */
  | { kind: 'drag'; ax: number; ay: number };

export interface Lattice {
  readonly w: number;
  readonly h: number;
  readonly bevel: number;
  readonly perimeter: number;
  readonly restArea: number;
  readonly caps: { outward: number; inward: number };
  /** Rest node positions, unit outward normals and perimeter parameters. */
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly nx: Float64Array;
  readonly ny: Float64Array;
  readonly s: Float64Array;
  /** State. */
  readonly ox: Float64Array;
  readonly oy: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  /** Plastic memory (rest offset per node) and its age. */
  readonly plx: Float64Array;
  readonly ply: Float64Array;
  plasticAge: number;
  input: LatticeInput | null;
  /** Seconds the current press input has been held. */
  pressHeld: number;
  asleep: boolean;
}

/* ── Construction ────────────────────────────────────────────────────────── */

export function createLattice(spec: LatticeSpec): Lattice {
  const w = Math.max(1, spec.w);
  const h = Math.max(1, spec.h);
  const SQ = Math.SQRT1_2;
  const nodes: [number, number, number, number, number][] = [
    // x, y, nx, ny, s (perimeter parameter, clockwise from top-left)
    [0, 0, -SQ, -SQ, 0],
    [w / 2, 0, 0, -1, w / 2],
    [w, 0, SQ, -SQ, w],
    [w, h / 2, 1, 0, w + h / 2],
    [w, h, SQ, SQ, w + h],
    [w / 2, h, 0, 1, w + h + w / 2],
    [0, h, -SQ, SQ, 2 * w + h],
    [0, h / 2, -1, 0, 2 * w + h + h / 2],
  ];
  const col = (k: number) => Float64Array.from(nodes, (n) => n[k]);
  const z = () => new Float64Array(LATTICE_NODES);
  return {
    w,
    h,
    bevel: spec.bevel,
    perimeter: 2 * (w + h),
    restArea: w * h,
    caps: latticeCaps(spec.bevel, spec.amplitude ?? 1),
    px: col(0),
    py: col(1),
    nx: col(2),
    ny: col(3),
    s: col(4),
    ox: z(),
    oy: z(),
    vx: z(),
    vy: z(),
    plx: z(),
    ply: z(),
    plasticAge: 0,
    input: null,
    pressHeld: 0,
    asleep: true,
  };
}

/* ── Geometry helpers ────────────────────────────────────────────────────── */

/** Shoelace area of the deformed polygon (rest + offsets). */
export function latticeArea(l: Lattice): number {
  let a = 0;
  for (let i = 0; i < LATTICE_NODES; i++) {
    const j = (i + 1) % LATTICE_NODES;
    const xi = l.px[i] + l.ox[i];
    const yi = l.py[i] + l.oy[i];
    const xj = l.px[j] + l.ox[j];
    const yj = l.py[j] + l.oy[j];
    a += xi * yj - xj * yi;
  }
  return Math.abs(a) / 2;
}

/** Perimeter parameter of the rim point nearest a local point (clockwise from the top-left corner). */
export function perimeterParam(l: Lattice, x: number, y: number): number {
  const cx = Math.max(0, Math.min(l.w, x));
  const cy = Math.max(0, Math.min(l.h, y));
  const dTop = cy;
  const dRight = l.w - cx;
  const dBottom = l.h - cy;
  const dLeft = cx;
  const m = Math.min(dTop, dRight, dBottom, dLeft);
  if (m === dTop) return cx;
  if (m === dRight) return l.w + cy;
  if (m === dBottom) return l.w + l.h + (l.w - cx);
  return 2 * l.w + l.h + (l.h - cy);
}

/** Gaussian weight of node `i` around perimeter parameter `s0`, with periodic distance. */
function weight(l: Lattice, i: number, s0: number, sigma: number): number {
  const P = l.perimeter;
  let d = Math.abs(l.s[i] - s0) % P;
  if (d > P / 2) d = P - d;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

/** The shader's rim falloff: full at the rim, zero from `min(2·bevel, bevel + 8)` px inside (02 §1.3). */
export function warpFalloff(depth: number, bevel: number): number {
  const a = bevel;
  const b = Math.min(2 * bevel, bevel + 8);
  if (depth <= a) return 1;
  if (depth >= b) return 0;
  const t = (depth - a) / (b - a);
  return 1 - t * t * (3 - 2 * t);
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */

/**
 * Set (or clear with `null`) the driving input. Releasing a press held longer than 350ms leaves a plastic memory of
 * ≤ 30% of the dent that decays with τ = 0.6s. Any input wakes the lattice.
 */
export function setLatticeInput(l: Lattice, input: LatticeInput | null): void {
  const wasPress = l.input?.kind === 'press';
  const isPress = input?.kind === 'press';
  if (wasPress && !isPress) {
    const f = plasticFraction(l.pressHeld * 1000, SOFT_BODY.plasticMaxLattice);
    for (let i = 0; i < LATTICE_NODES; i++) {
      l.plx[i] = f * l.ox[i];
      l.ply[i] = f * l.oy[i];
    }
    l.plasticAge = 0;
  }
  if (!isPress) l.pressHeld = 0;
  l.input = input;
  if (input) l.asleep = false;
}

/**
 * An impulse from outside (neighbour nudge, arc strike): the edge facing away from `(dx, dy)` — the push direction —
 * is kicked so it moves in by up to `peak` px (≤ 2px). Wakes the lattice.
 */
export function impulseLattice(l: Lattice, dx: number, dy: number, peak: number): void {
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || !(peak > 0)) return;
  const ux = dx / len;
  const uy = dy / len;
  const p = Math.min(peak, 2);
  const omega = Math.sqrt(LATTICE.ka);
  const z = LATTICE.zetaFree;
  const r = Math.sqrt(1 - z * z);
  const v0 = (p * omega) / Math.exp((-z / r) * Math.atan2(r, z));
  for (let i = 0; i < LATTICE_NODES; i++) {
    const facing = -(l.nx[i] * ux + l.ny[i] * uy);
    if (facing <= 0) continue;
    l.vx[i] += v0 * facing * ux;
    l.vy[i] += v0 * facing * uy;
  }
  l.asleep = false;
}

/** Per-node input force (and whether an input is driving). */
function inputForce(l: Lattice, i: number): [number, number] {
  const input = l.input;
  if (!input) return [0, 0];
  const ka = LATTICE.ka;
  if (input.kind === 'drag') {
    const cap = LATTICE.hoverPx * ka;
    const mag = Math.hypot(input.ax, input.ay);
    if (!(mag > 0) || !Number.isFinite(mag)) return [0, 0];
    const k = (cap * Math.tanh(mag / cap)) / mag;
    return [-input.ax * k, -input.ay * k];
  }
  const s0 = perimeterParam(l, input.x, input.y);
  const strength = Math.max(0, Math.min(1, input.strength ?? 1));
  if (input.kind === 'hover') {
    const g = LATTICE.hoverPx * strength * weight(l, i, s0, LATTICE.hoverSigma * l.perimeter);
    return [ka * g * l.nx[i], ka * g * l.ny[i]];
  }
  // The press is the #989 dent's outline: it indents ~DENT.indentPx under the contact (never past the bevel's cap),
  // and the area term bulges the far side.
  const g =
    -Math.min(l.caps.inward, DENT.indentPx) *
    strength *
    LATTICE.pressDrive *
    weight(l, i, s0, LATTICE.pressSigma * l.perimeter);
  return [ka * g * l.nx[i], ka * g * l.ny[i]];
}

/* ── Stepping ────────────────────────────────────────────────────────────── */

/**
 * Advance the lattice by `dt` seconds (clamped to 0.05s, ≤ 4 substeps of ≤ 1/120s). Returns `true` while awake.
 * Falls asleep — offsets and velocities zeroed — when no input drives it, the plastic memory has gone, and
 * `max|o| < 0.05px`, `max|v| < 0.5px/s`.
 */
export function stepLattice(l: Lattice, dt: number): boolean {
  if (l.asleep) return false;
  if (!(dt > 0)) return true;
  const total = Math.min(dt, LATTICE.maxDt);
  const n = Math.min(LATTICE.maxSubsteps, Math.max(1, Math.ceil(total / LATTICE.h - 1e-9)));
  const h = total / n;
  const ka = LATTICE.ka;
  const kn = LATTICE.smoothness * ka;
  const kv = LATTICE.area * ka;
  const zeta = l.input ? LATTICE.zetaDriven : LATTICE.zetaFree;
  const c = 2 * zeta * Math.sqrt(ka);
  if (l.input?.kind === 'press') l.pressHeld += total;

  for (let step = 0; step < n; step++) {
    const plastic = plasticDecay(l.plasticAge);
    const dA = (latticeArea(l) - l.restArea) / l.perimeter;
    for (let i = 0; i < LATTICE_NODES; i++) {
      const a = (i + LATTICE_NODES - 1) % LATTICE_NODES;
      const b = (i + 1) % LATTICE_NODES;
      const [ix, iy] = inputForce(l, i);
      const fx =
        -ka * (l.ox[i] - l.plx[i] * plastic) +
        kn * (l.ox[a] + l.ox[b] - 2 * l.ox[i]) -
        kv * dA * l.nx[i] -
        c * l.vx[i] +
        ix;
      const fy =
        -ka * (l.oy[i] - l.ply[i] * plastic) +
        kn * (l.oy[a] + l.oy[b] - 2 * l.oy[i]) -
        kv * dA * l.ny[i] -
        c * l.vy[i] +
        iy;
      l.vx[i] += fx * h;
      l.vy[i] += fy * h;
    }
    for (let i = 0; i < LATTICE_NODES; i++) {
      l.ox[i] += l.vx[i] * h;
      l.oy[i] += l.vy[i] * h;
    }
    if (l.plasticAge > 0 || hasPlastic(l)) {
      l.plasticAge += h;
      if (plasticDecay(l.plasticAge) === 0) clearPlastic(l);
    }
  }

  if (!l.input && !hasPlastic(l) && quiet(l)) {
    l.ox.fill(0);
    l.oy.fill(0);
    l.vx.fill(0);
    l.vy.fill(0);
    l.asleep = true;
    return false;
  }
  return true;
}

function hasPlastic(l: Lattice): boolean {
  for (let i = 0; i < LATTICE_NODES; i++) if (l.plx[i] !== 0 || l.ply[i] !== 0) return true;
  return false;
}

function clearPlastic(l: Lattice): void {
  l.plx.fill(0);
  l.ply.fill(0);
  l.plasticAge = 0;
}

function quiet(l: Lattice): boolean {
  let o = 0;
  let v = 0;
  for (let i = 0; i < LATTICE_NODES; i++) {
    o = Math.max(o, Math.hypot(l.ox[i], l.oy[i]));
    v = Math.max(v, Math.hypot(l.vx[i], l.vy[i]));
  }
  return o < LATTICE.sleepOffset && v < LATTICE.sleepVelocity;
}

/** True when the lattice sleeps (its uniform is all zero and `uJellyOn` should be 0). */
export function latticeAsleep(l: Lattice): boolean {
  return l.asleep;
}

/** `uJellyOn`: 1 while awake, 0 asleep. */
export function latticeOn(l: Lattice): 0 | 1 {
  return l.asleep ? 0 : 1;
}

/* ── Output ──────────────────────────────────────────────────────────────── */

/**
 * The shader uniform `uJelly[8]` as 16 floats (x, y per node, clockwise from the top-left), with each node's
 * normal component soft-capped (`tanh`) at `+outward` / `−inward` and its tangential component at `±outward`.
 * Pass `out` to reuse a buffer per frame.
 */
export function latticeUniform(
  l: Lattice,
  out: Float32Array = new Float32Array(LATTICE_NODES * 2),
): Float32Array {
  const { outward, inward } = l.caps;
  const sat = (x: number, cap: number) => (cap > 0 ? cap * Math.tanh(x / cap) : 0);
  for (let i = 0; i < LATTICE_NODES; i++) {
    if (l.asleep) {
      out[2 * i] = 0;
      out[2 * i + 1] = 0;
      continue;
    }
    const nx = l.nx[i];
    const ny = l.ny[i];
    const n = l.ox[i] * nx + l.oy[i] * ny;
    const t = -l.ox[i] * ny + l.oy[i] * nx;
    const nOut = n >= 0 ? sat(n, outward) : sat(n, inward);
    const tOut = sat(t, outward);
    out[2 * i] = nOut * nx - tOut * ny;
    out[2 * i + 1] = nOut * ny + tOut * nx;
  }
  return out;
}

/** Normal component of node `i`'s output offset (px, + outward), as the shader sees it. */
export function nodeNormalOffset(uniform: Float32Array, l: Lattice, i: number): number {
  return uniform[2 * i] * l.nx[i] + uniform[2 * i + 1] * l.ny[i];
}

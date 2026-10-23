/**
 * The jelly governor: the battery and thermal answer for an always-moving material (plan 04 §3.3, master plan R7).
 *
 * Modelled on `lib/eversion/gl/governor-tiers.ts`'s `DprGovernor`: pure (no DOM, no clock of its own — the engine
 * feeds it), **downscale-only**, with a warm-up so a route's first frames (shader compiles, decodes) never read as
 * load. Each window is {@link GOVERNOR_WINDOW_MS} of ticks; if its p90 jelly frame cost exceeds the tier's target, or
 * its p90 tick interval exceeds 1.5× the clock period, it takes ONE step down this ladder:
 *
 *   1. clock 30 → 20 Hz · 2. ambient slots halved · 3. carriers halved · 4. ambient arcs off ·
 *   5. haze canvases at 0.125 scale · 6. clock 0 (static haze).
 *
 * At most one step per window, never back up within a route ({@link JellyGovernor.reset} on navigation). It turns
 * only engine-internal knobs; the tier itself never flips on a frame-rate reading (`tiers.ts`). Safari Low Power Mode
 * caps rAF at 30 Hz, which the interval rule catches in the first window.
 */
import type { JellyBudget, JellyTier } from './tiers';

/** Ticks ignored at the start of a route (and after {@link JellyGovernor.reset}). */
export const GOVERNOR_WARMUP_TICKS = 30;
/** Length of one judging window, by summed tick interval. Also the minimum time between steps. */
export const GOVERNOR_WINDOW_MS = 2000;
/** A window needs at least this many samples to be judged (a 12 Hz idle clock gives 24). */
export const GOVERNOR_MIN_SAMPLES = 8;
/** p90 interval above this multiple of the clock period is a miss. */
export const GOVERNOR_DT_FACTOR = 1.5;
/**
 * An interval longer than this is a discontinuity (the clock was paused for a hidden tab, blur or a scroll), not a slow
 * frame. It is dropped rather than clamped so a resume never steps the governor.
 */
export const GOVERNOR_MAX_INTERVAL_MS = 1000;
/** Main-thread jelly work per ambient tick (04 §3.5): 2 ms on desktop, 3 ms on handheld. */
export const GOVERNOR_COST_TARGET_MS: Readonly<Record<JellyTier, number>> = {
  full: 2,
  coarse: 2,
  handheld: 3,
  lite: 3,
  off: 3,
};
/** Step 1's clock ceiling. */
export const GOVERNED_CLOCK_HZ = 20;
/** Step 5's haze canvas resolution scale. */
export const GOVERNED_HAZE_SCALE = 0.125;
/** The number of steps on the ladder. */
export const GOVERNOR_MAX_STEP = 6;

export interface GovernorKnobs {
  /** 0 (untouched) … {@link GOVERNOR_MAX_STEP}. */
  step: number;
  /** Ceiling on the ambient clock (Hz); `Infinity` = no ceiling, 0 = static haze. */
  maxClockHz: number;
  /** Multiplier on `hazeSlots` (floored, at least 1 while the budget is non-zero). */
  slotScale: number;
  /** Multiplier on `carriers`. */
  carrierScale: number;
  ambientArcs: boolean;
  /** Resolution multiplier for haze canvases. */
  hazeScale: number;
}

/** The knobs at a given ladder step. Pure. */
export function knobsAt(step: number): GovernorKnobs {
  const s = Math.max(0, Math.min(GOVERNOR_MAX_STEP, Math.floor(step)));
  return {
    step: s,
    maxClockHz: s >= 6 ? 0 : s >= 1 ? GOVERNED_CLOCK_HZ : Infinity,
    slotScale: s >= 2 ? 0.5 : 1,
    carrierScale: s >= 3 ? 0.5 : 1,
    ambientArcs: s < 4,
    hazeScale: s >= 5 ? GOVERNED_HAZE_SCALE : 1,
  };
}

const halve = (n: number, scale: number) =>
  scale >= 1 || n <= 0 ? n : Math.max(1, Math.floor(n * scale));

/** Apply the ladder to a budget. Never raises a value. Pure. */
export function governBudget(budget: Readonly<JellyBudget>, step: number): JellyBudget {
  const k = knobsAt(step);
  const clockHz = Math.min(budget.clockHz, k.maxClockHz);
  return {
    ...budget,
    clockHz,
    idleClockHz: Math.min(budget.idleClockHz, clockHz),
    hazeSlots: halve(budget.hazeSlots, k.slotScale),
    carriers: halve(budget.carriers, k.carrierScale),
    ambientArcMinIntervalMs: k.ambientArcs ? budget.ambientArcMinIntervalMs : Infinity,
  };
}

/** The p90 of `values[0..n)`, nearest-rank. Sorts a copy. Pure. */
export function p90(values: ArrayLike<number>, n = values.length): number {
  if (n <= 0) return 0;
  const sorted = Array.from({ length: n }, (_, i) => values[i]!).sort((a, b) => a - b);
  return sorted[Math.min(n - 1, Math.ceil(0.9 * n) - 1)]!;
}

/** Capacity of a window's sample buffer: 2 s at 60 Hz with headroom. Past it, the oldest are overwritten. */
const CAPACITY = 256;

export class JellyGovernor {
  private readonly costs = new Float64Array(CAPACITY);
  private readonly intervals = new Float64Array(CAPACITY);
  private readonly costTargetMs: number;
  private count = 0;
  private elapsed = 0;
  private seen = 0;
  private _step = 0;

  /**
   * @param tier picks the cost target ({@link GOVERNOR_COST_TARGET_MS}).
   * @param baseClockHz the clock the tier would run before any step (the interval rule uses the CURRENT clock).
   */
  constructor(
    tier: JellyTier,
    private readonly baseClockHz: number,
  ) {
    this.costTargetMs = GOVERNOR_COST_TARGET_MS[tier];
  }

  /** The clock in force at the current step. */
  get clockHz(): number {
    return Math.min(this.baseClockHz, knobsAt(this._step).maxClockHz);
  }

  get step(): number {
    return this._step;
  }

  get knobs(): GovernorKnobs {
    return knobsAt(this._step);
  }

  /**
   * Record one ambient tick: `costMs` = main-thread jelly work in it, `intervalMs` = time since the previous tick.
   * Returns the new step when one is taken, else `null`.
   */
  record(costMs: number, intervalMs: number): number | null {
    if (this._step >= GOVERNOR_MAX_STEP || this.clockHz <= 0) return null;
    if (this.seen++ < GOVERNOR_WARMUP_TICKS) return null;
    if (!(intervalMs > 0) || intervalMs > GOVERNOR_MAX_INTERVAL_MS || !(costMs >= 0)) return null;
    const i = this.count++ % CAPACITY;
    this.costs[i] = costMs;
    this.intervals[i] = intervalMs;
    this.elapsed += intervalMs;
    if (this.elapsed < GOVERNOR_WINDOW_MS || this.count < GOVERNOR_MIN_SAMPLES) return null;
    const n = Math.min(this.count, CAPACITY);
    const period = 1000 / this.clockHz;
    const over =
      p90(this.costs, n) > this.costTargetMs ||
      p90(this.intervals, n) > GOVERNOR_DT_FACTOR * period;
    // Disjoint windows: whatever the verdict, the next one is judged on fresh ticks (at the new settings after a step).
    this.count = 0;
    this.elapsed = 0;
    if (!over) return null;
    return ++this._step;
  }

  /** A new route: back to step 0, warming up again. */
  reset(): void {
    this._step = 0;
    this.count = 0;
    this.elapsed = 0;
    this.seen = 0;
  }
}

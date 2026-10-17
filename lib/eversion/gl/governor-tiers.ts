/**
 * Quality tier selection, the runtime DPR governor and frame statistics
 * (spec §8.2–8.3). OWNER: T25. Pure, client-safe (the render worker has no DOM,
 * so everything here takes its inputs as arguments).
 *
 * ## Tier
 *
 * Picked on the MAIN thread — that is where `html.perf-lite` and the device
 * probe are readable — and sent to the worker in `init`. `low` is where
 * `perf-lite` starts; phones default to `mid`; the table behind each tier is
 * `TIERS` in `constants.ts`. Reuses `lib/render/tier.ts`'s vocabulary.
 *
 * ## Governor
 *
 * `FrametimeMonitor` (`lib/render/governor.ts`; window `GOVERNOR_WINDOW`, target
 * `GOVERNOR_TARGET_FPS`) runs in the worker. It is **downscale-only** and steps
 * the CANVAS DPR — never the mesh, which would pop geometry — by
 * `GOVERNOR_STEP`× per step to a floor of `GOVERNOR_DPR_FLOOR`, at most
 * `GOVERNOR_MAX_STEPS` per navigation. A DPR step changes sharpness, never
 * position, so it does not break the timeline's continuity.
 */

import { FrametimeMonitor } from '@/lib/render/governor';
import type { RenderTier } from '@/lib/render/tier';
import {
  DROPPED_FRAME_FACTOR,
  GOVERNOR_DPR_FLOOR,
  GOVERNOR_MAX_STEPS,
  GOVERNOR_STEP,
  GOVERNOR_TARGET_FPS,
  GOVERNOR_WINDOW,
  MAX_DT_MS,
} from '../constants';
import type { FrameStats, Tier } from '../types';

/** What the main thread knows that decides the tier. */
export interface TierInputs {
  /** From `detectTier` (`lib/render/tier.ts`). */
  renderTier: RenderTier;
  /** `html.perf-lite` (`lib/perf-tier.ts`). Forces `low`. */
  perfLite: boolean;
  /** Phones are capped at `mid`. */
  isMobile: boolean;
}

/** The site's four tiers folded onto the effect's three: `ultra` and `high` both get the full mesh. */
const FROM_RENDER_TIER: Readonly<Record<RenderTier, Tier>> = {
  low: 'low',
  medium: 'mid',
  high: 'high',
  ultra: 'high',
};

/** Map the site's render tier and `perf-lite` onto the effect's three tiers. */
export function pickTier(inputs: TierInputs): Tier {
  if (inputs.perfLite) return 'low';
  const tier = FROM_RENDER_TIER[inputs.renderTier];
  return inputs.isMobile && tier === 'high' ? 'mid' : tier;
}

/**
 * The downscale-only DPR governor. Feed it every frame interval; when the
 * window average misses the target it returns the new cumulative scale to pass
 * to `RendererApi.setDprScale`, else `null`.
 *
 * ## What the floor is a floor OF
 *
 * Spec §8.3 steps "the canvas DPR by 0.75× per step to a floor of 0.75". The
 * floor is on the DPR itself, not on the multiplier — a multiplier floor of 0.75
 * would allow exactly one step from an untouched 1.0 and make "at most two
 * steps" unreachable. So the governor is told the DPR it starts from (the
 * viewport DPR clamped to the tier's cap) and refuses a step that would take
 * `startDpr · scale` below the floor. A `high` tier at DPR 2 can step 2 → 1.5 →
 * 1.125; a `low` tier at 1.0 can step once (0.75) and then has nowhere to go.
 *
 * ## Transients are not load
 *
 * `FrametimeMonitor` averages, so one 120 ms route render in a 30-frame window
 * would be enough to trip it — the very hiccup the in-thread mode is expected to
 * have (spec §7.7). Each interval is therefore clamped to `MAX_DT_MS` (the same
 * clamp the timeline applies to its own clock) before it is pushed: one stalled
 * frame cannot move a 30-frame mean past the budget, while a sustained miss
 * still does. After a step the window restarts, so the next step is judged on
 * frames drawn at the NEW resolution.
 */
export class DprGovernor {
  private readonly monitor = new FrametimeMonitor(GOVERNOR_WINDOW);
  private readonly budgetMs = 1000 / GOVERNOR_TARGET_FPS;
  private _steps = 0;
  private _scale = 1;

  /** @param startDpr the canvas DPR in force before any step (viewport DPR, tier-capped). */
  constructor(private readonly startDpr: number = 1) {}

  /** Record one frame interval (ms). Returns a new cumulative scale when a step is taken. */
  record(intervalMs: number): number | null {
    if (this._steps >= GOVERNOR_MAX_STEPS) return null;
    this.monitor.push(Math.min(intervalMs, MAX_DT_MS));
    if (!this.monitor.full() || this.monitor.averageMs() <= this.budgetMs) return null;
    const next = this._scale * GOVERNOR_STEP;
    if (this.startDpr * next < GOVERNOR_DPR_FLOOR) {
      // Nowhere left to go: stop sampling for the rest of the navigation.
      this._steps = GOVERNOR_MAX_STEPS;
      return null;
    }
    this._scale = next;
    this._steps++;
    this.monitor.reset();
    return next;
  }

  /** Steps taken so far this navigation (≤ `GOVERNOR_MAX_STEPS`). */
  get steps(): number {
    return this._steps;
  }

  /** Cumulative scale applied so far (1 = untouched). */
  get scale(): number {
    return this._scale;
  }

  /** Forget everything: the next navigation starts untouched. */
  reset(): void {
    this._steps = 0;
    this._scale = 1;
    this.monitor.reset();
  }
}

/**
 * Capacity of the interval buffer: a 4.9 s plan plus the longest stretch is
 * ~8 s, which is ~1150 frames at 144 Hz. 4096 covers a stalled run several times
 * over; past it the ring overwrites the oldest, so recording can never allocate.
 */
const STATS_CAPACITY = 4096;

/**
 * Collects frame intervals between `start` and `done` and summarises them for
 * the `done` message: count, dropped (interval > `DROPPED_FRAME_FACTOR` × the
 * median) and the 95th-percentile interval. Preallocates; recording allocates
 * nothing — only {@link summary}, once per navigation, sorts a copy.
 *
 * The FIRST frame of a run has no interval (nothing precedes it but the
 * `start` message, whose latency is not a frame time), so it is counted with
 * {@link recordFirst} and contributes to `frames` only.
 */
export class FrameStatsRecorder {
  private readonly intervals = new Float32Array(STATS_CAPACITY);
  private count = 0;
  private frames = 0;

  /** Count a frame that has no interval (the first). */
  recordFirst(): void {
    this.frames++;
  }

  record(intervalMs: number): void {
    this.intervals[this.count % STATS_CAPACITY] = intervalMs;
    this.count++;
    this.frames++;
  }

  summary(): FrameStats {
    const n = Math.min(this.count, STATS_CAPACITY);
    if (n === 0) return { frames: this.frames, dropped: 0, p95: 0 };
    const sorted = this.intervals.slice(0, n).sort();
    const median = sorted[n >> 1]!;
    let dropped = 0;
    for (let i = 0; i < n; i++) if (sorted[i]! > DROPPED_FRAME_FACTOR * median) dropped++;
    const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)]!;
    return { frames: this.frames, dropped, p95 };
  }

  reset(): void {
    this.count = 0;
    this.frames = 0;
  }
}

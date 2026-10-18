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
 * `DprGovernor` (window `GOVERNOR_WINDOW`, target `governorTargetFps` of the
 * display's refresh rate) runs in the worker. It is **downscale-only** and steps
 * the CANVAS DPR — never the mesh, which would pop geometry — by
 * `GOVERNOR_STEP`× per step to a floor of `GOVERNOR_DPR_FLOOR`, at most
 * `GOVERNOR_MAX_STEPS` per navigation. A DPR step changes sharpness, never
 * position, so it does not break the timeline's continuity.
 */

import type { RenderTier } from '@/lib/render/tier';
import {
  DROPPED_FRAME_FACTOR,
  GOVERNOR_DPR_FLOOR,
  GOVERNOR_MAX_STEPS,
  GOVERNOR_MAX_FPS,
  GOVERNOR_MIN_FPS,
  GOVERNOR_REFRESH_SHARE,
  GOVERNOR_STEP,
  GOVERNOR_WARMUP_FRAMES,
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

/** The frame rate the governor defends on a display of `refreshHz` (see `GOVERNOR_REFRESH_SHARE`). */
export function governorTargetFps(refreshHz: number): number {
  const hz = Number.isFinite(refreshHz) && refreshHz > 0 ? refreshHz : 60;
  const share = hz * GOVERNOR_REFRESH_SHARE;
  return Math.min(GOVERNOR_MAX_FPS, hz >= 60 ? Math.max(GOVERNOR_MIN_FPS, share) : share);
}

/** Intervals left out of the window's mean: its worst tenth. */
const GOVERNOR_TRIM = Math.floor(GOVERNOR_WINDOW / 10);

/**
 * The downscale-only DPR governor. Feed it every frame interval; when the
 * window misses the target it returns the new cumulative scale to pass to
 * `RendererApi.setDprScale`, else `null`.
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
 * ## The target is the display's
 *
 * A fixed 55 fps target never stepped in on a 120 Hz panel showing 70 fps — half
 * of what the panel can show, with the uneven pacing that implies. The target is
 * `governorTargetFps(refreshHz)`: 57 fps on 60 Hz, 114 on 120 Hz, capped at 144.
 * The refresh rate is measured on the main thread (`lib/render/refresh-rate.ts`)
 * and sent with each `start`.
 *
 * ## Transients are not load
 *
 * Three things keep a hitch from reading as load: the first
 * `GOVERNOR_WARMUP_FRAMES` intervals of a run are not recorded at all (they carry
 * the driver's first use of each program); each interval is clamped to
 * `MAX_DT_MS`; and the window is judged by its TRIMMED mean — the worst tenth of
 * the window (three frames of thirty) is left out. A route render, a GC or a
 * decode in the window is ignored, while a run that drops one frame in five
 * still steps. After a step the window restarts, so the next step is judged on
 * frames drawn at the NEW resolution.
 */
export class DprGovernor {
  private readonly ring = new Float64Array(GOVERNOR_WINDOW);
  private readonly sorted = new Float64Array(GOVERNOR_WINDOW);
  private readonly budgetMs: number;
  private count = 0;
  private seen = 0;
  private _steps = 0;
  private _scale = 1;

  /**
   * @param startDpr the canvas DPR in force before any step (viewport DPR, tier-capped).
   * @param refreshHz the display's refresh rate (60 when unknown).
   */
  constructor(
    private readonly startDpr: number = 1,
    refreshHz = 60,
  ) {
    this.budgetMs = 1000 / governorTargetFps(refreshHz);
  }

  /** The per-frame budget the window is judged against, in ms. */
  get budget(): number {
    return this.budgetMs;
  }

  /** Record one frame interval (ms). Returns a new cumulative scale when a step is taken. */
  record(intervalMs: number): number | null {
    if (this._steps >= GOVERNOR_MAX_STEPS) return null;
    if (this.seen++ < GOVERNOR_WARMUP_FRAMES) return null;
    this.ring[this.count++ % GOVERNOR_WINDOW] = Math.min(intervalMs, MAX_DT_MS);
    if (this.count < GOVERNOR_WINDOW || this.trimmedMean() <= this.budgetMs) return null;
    const next = this._scale * GOVERNOR_STEP;
    if (this.startDpr * next < GOVERNOR_DPR_FLOOR) {
      // Nowhere left to go: stop sampling for the rest of the navigation.
      this._steps = GOVERNOR_MAX_STEPS;
      return null;
    }
    this._scale = next;
    this._steps++;
    this.count = 0;
    return next;
  }

  private trimmedMean(): number {
    this.sorted.set(this.ring);
    this.sorted.sort();
    let sum = 0;
    const n = GOVERNOR_WINDOW - GOVERNOR_TRIM;
    for (let i = 0; i < n; i++) sum += this.sorted[i]!;
    return sum / n;
  }

  /** Steps taken so far this navigation (≤ `GOVERNOR_MAX_STEPS`). */
  get steps(): number {
    return this._steps;
  }

  /** Cumulative scale applied so far (1 = untouched). */
  get scale(): number {
    return this._scale;
  }

  /** Forget everything: the next navigation starts untouched (and warms up again). */
  reset(): void {
    this._steps = 0;
    this._scale = 1;
    this.count = 0;
    this.seen = 0;
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

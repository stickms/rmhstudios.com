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

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T25 replaces every body, and this line with them */
import { notImplemented } from '../not-implemented';
import type { RenderTier } from '@/lib/render/tier';
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

/** Map the site's render tier and `perf-lite` onto the effect's three tiers. */
export function pickTier(inputs: TierInputs): Tier {
  return notImplemented('pickTier', 'T25');
}

/**
 * The downscale-only DPR governor. Feed it every frame interval; when the
 * window average misses the target it returns the new cumulative scale to pass
 * to `RendererApi.setDprScale`, else `null`.
 */
export class DprGovernor {
  constructor() {
    notImplemented('DprGovernor', 'T25');
  }

  /** Record one frame interval (ms). Returns a new cumulative scale when a step is taken. */
  record(intervalMs: number): number | null {
    return notImplemented('DprGovernor.record', 'T25');
  }

  /** Steps taken so far this navigation (≤ `GOVERNOR_MAX_STEPS`). */
  get steps(): number {
    return notImplemented('DprGovernor.steps', 'T25');
  }

  /** Cumulative scale applied so far (1 = untouched). */
  get scale(): number {
    return notImplemented('DprGovernor.scale', 'T25');
  }

  /** Forget everything: the next navigation starts untouched. */
  reset(): void {
    notImplemented('DprGovernor.reset', 'T25');
  }
}

/**
 * Collects frame intervals between `start` and `done` and summarises them for
 * the `done` message: count, dropped (interval > `DROPPED_FRAME_FACTOR` × the
 * median) and the 95th-percentile interval. Preallocates; recording allocates
 * nothing.
 */
export class FrameStatsRecorder {
  constructor() {
    notImplemented('FrameStatsRecorder', 'T25');
  }

  record(intervalMs: number): void {
    notImplemented('FrameStatsRecorder.record', 'T25');
  }

  summary(): FrameStats {
    return notImplemented('FrameStatsRecorder.summary', 'T25');
  }

  reset(): void {
    notImplemented('FrameStatsRecorder.reset', 'T25');
  }
}

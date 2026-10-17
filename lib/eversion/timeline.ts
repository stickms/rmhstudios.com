/**
 * The timeline engine — channels, quintic re-planning, gates, fast-forward
 * (spec §7). OWNER: T10. Pure, client-safe, no DOM.
 *
 * ## The one rule
 *
 * Every channel segment is a quintic Hermite from the channel's CURRENT
 * `(x, ẋ, ẍ)` to a target `(x₁, ẋ₁, ẍ₁)` over a duration (spec §7.2). Any
 * retime — a gate wait, a fast-forward, an abort, a resize — re-plans every live
 * channel from where it is NOW, so position, velocity and acceleration are
 * continuous (C²) across every re-plan by construction. That is the single
 * mechanism behind "never jerky, never a hard cut", and **no code path may set a
 * channel's value directly**. The property suite (spec §11.1 tests 17–22) is
 * 10 000 seeded scenarios that try to break exactly this.
 *
 * ## What the surface promises (the implementation is T10's)
 *
 * - `tick(now)` allocates nothing: it rewrites one reused {@link TimelineSnapshot}
 *   and returns it. ≤ 5 µs.
 * - Time is the timeline's own clock, advanced by `min(now − last, MAX_DT_MS)`
 *   at the top of every method that takes `now` (spec §7.7).
 * - Stage events come out in `STAGE_IDS` order, each exactly once; `gate-open`
 *   is never before `evert`; `unwrap` never starts before AFTER is ready except
 *   at the stretch cap or after `afterFailed` (tests 18, 20).
 * - The spin lands on `θ_align + 2π·k` with zero velocity and acceleration at
 *   4300 ms, with `k` re-picked at every re-plan so the remaining travel is
 *   never backwards and never more than `SPIN_MAX_REMAINING_TURNS` (test 21).
 * - After `fastForward`, completion is within `FF_REMAINING_MS` plus any gate
 *   wait (≤ `FF_STRETCH_CAP_MS`) plus POP (test 19).
 * - `snapshot.radius/centreX/centreY` are EFFECTIVE (POP folded in); the raw
 *   channel is `sample()`.
 *
 * The default plan is `PLAN_MS` in `constants.ts`.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T10 replaces every body, and this line with them */
import { notImplemented } from './not-implemented';
import type {
  ChannelId,
  TimelineApi,
  TimelineConfig,
  TimelineEvent,
  TimelineSnapshot,
  Viewport,
} from './types';

export class Timeline implements TimelineApi {
  constructor(config: TimelineConfig) {
    notImplemented('Timeline', 'T10');
  }

  get finished(): boolean {
    return notImplemented('Timeline.finished', 'T10');
  }

  start(t0: number): void {
    notImplemented('Timeline.start', 'T10');
  }

  tick(now: number): Readonly<TimelineSnapshot> {
    return notImplemented('Timeline.tick', 'T10');
  }

  fastForward(now: number): void {
    notImplemented('Timeline.fastForward', 'T10');
  }

  afterReady(now: number): void {
    notImplemented('Timeline.afterReady', 'T10');
  }

  afterFailed(now: number): void {
    notImplemented('Timeline.afterFailed', 'T10');
  }

  abort(now: number): void {
    notImplemented('Timeline.abort', 'T10');
  }

  resize(now: number, viewport: Viewport): void {
    notImplemented('Timeline.resize', 'T10');
  }

  reveal(now: number): void {
    notImplemented('Timeline.reveal', 'T10');
  }

  events(): TimelineEvent[] {
    return notImplemented('Timeline.events', 'T10');
  }

  afterDeadline(now: number): number {
    return notImplemented('Timeline.afterDeadline', 'T10');
  }

  sample(id: ChannelId, now: number, out: Float64Array, offset?: number): void {
    notImplemented('Timeline.sample', 'T10');
  }
}

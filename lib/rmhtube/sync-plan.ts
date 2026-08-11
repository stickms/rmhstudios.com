/**
 * RmhTube — the drift-correction planner (pure).
 *
 * Given the room timeline, a sample of the local player and what the player is
 * capable of, decide the single next correction. Pure so the policy can be
 * reasoned about and tested away from a media element that behaves differently
 * in every browser and provider.
 *
 * The policy exists in this shape because of how the previous one failed. It
 * corrected from DOM events — `seeked` triggered a forced realignment, which
 * set `currentTime`, which fired `seeked` again. That loop re-buffered the
 * player on every pass, and on YouTube it did not even need a user to start it:
 * `youtube-video-element` *synthesises* `seeking`/`seeked` from a 50 ms poll
 * whenever the position moves more than 0.1 s between samples, which ordinary
 * playback does the moment a timer is throttled or the rate goes above 2×.
 *
 * So nothing here is event-driven. The caller samples the player on a fixed
 * tick and applies at most one action per tick, and the three guards below —
 * never seek into a stall, never seek twice inside the cooldown, never correct
 * a live source — are what keep a correction from causing the next one.
 */

import { extrapolate } from './sync-math';
import { SYNC_SOFT_TOLERANCE_S, SYNC_HARD_TOLERANCE_S, SYNC_NUDGE_RATE } from './constants';
import type { VideoState } from './types';

/** One observation of the local player. */
export interface PlayerSample {
  /** Position in seconds. */
  position: number;
  paused: boolean;
  ended: boolean;
  /** The player can act on a seek (metadata loaded, source attached). */
  ready: boolean;
  /** The player is stalled waiting on data. */
  buffering: boolean;
  /** Effective playback rate the element reports. */
  rate: number;
  /** Furthest reachable position, or null when the provider won't say. */
  seekableEnd: number | null;
  /** Earliest reachable position (> 0 for a DVR window), or null. */
  seekableStart: number | null;
}

export interface SyncPlanInput {
  state: VideoState;
  /** Server-clock "now", as the client best estimates it. */
  serverNow: number;
  sample: PlayerSample;
  /**
   * Corrections are allowed at all. False while the tab is hidden, while a
   * previous seek is still settling, or before the clock has been calibrated —
   * correcting against an uncalibrated clock seeks everyone to the offset.
   */
  canCorrect: boolean;
  /**
   * The provider supports fine-grained playback rates. YouTube and Twitch
   * expose a handful of discrete steps, so a ±5% nudge is either ignored or
   * snapped to 1.25× — an audible lurch to close a half-second gap.
   */
  canNudge: boolean;
  /** Realign hard regardless of drift (media change, resync, tab return). */
  force: boolean;
}

export type SyncPlan =
  /** Do nothing this tick. */
  | { action: 'hold'; reason: HoldReason; drift: number }
  /** Jump the playhead. */
  | { action: 'seek'; to: number; drift: number }
  /** Close the gap by running slightly off the room's rate. */
  | { action: 'rate'; rate: number; drift: number }
  /** In sync — make sure the rate is back on the room's. */
  | { action: 'settled'; rate: number; drift: number };

export type HoldReason =
  | 'suspended'
  | 'not-ready'
  | 'live'
  | 'ended'
  | 'buffering'
  | 'paused'
  | 'coarse-rate';

/**
 * The room position this player should be at, clamped to what it can reach.
 * A DVR window or a partially-loaded source can make the room's position
 * unreachable; seeking outside the seekable range is a request the player
 * either ignores or answers with a stall.
 */
export function targetPosition(state: VideoState, serverNow: number, sample: PlayerSample): number {
  const raw = extrapolate(state, serverNow);
  let target = Math.max(0, raw);
  if (sample.seekableStart != null) target = Math.max(target, sample.seekableStart);
  if (sample.seekableEnd != null) target = Math.min(target, sample.seekableEnd);
  return target;
}

export function planSync(input: SyncPlanInput): SyncPlan {
  const { state, serverNow, sample, canCorrect, canNudge, force } = input;
  const roomRate = state.playbackRate || 1;

  // A live source has no position to agree on. Play/pause still mirrors the
  // room (the caller handles that); the playhead is the provider's business.
  if (state.mode === 'live') return { action: 'hold', reason: 'live', drift: 0 };

  if (!canCorrect) return { action: 'hold', reason: 'suspended', drift: 0 };
  if (!sample.ready) return { action: 'hold', reason: 'not-ready', drift: 0 };

  const target = targetPosition(state, serverNow, sample);
  const drift = target - sample.position;
  const absDrift = Math.abs(drift);

  // The end of the item is the queue's business, not the timeline's. Seeking a
  // finished element only restarts it.
  if (sample.ended && !force) return { action: 'hold', reason: 'ended', drift };

  // Never chase a target while the player is starved of data. This is the
  // stutter loop the old code shipped: buffering held the position still, the
  // timeline ran on, the gap crossed the threshold, the seek dropped the
  // buffer, and the stall started again one seek deeper.
  if (sample.buffering && drift > 0 && !force) {
    return { action: 'hold', reason: 'buffering', drift };
  }

  if (force || absDrift > SYNC_HARD_TOLERANCE_S) {
    return { action: 'seek', to: target, drift };
  }

  // While the room is paused the anchor is static, so any residual gap is the
  // player sitting a frame off. Not worth a seek — it would be visible.
  if (!state.playing) {
    return absDrift > SYNC_SOFT_TOLERANCE_S
      ? { action: 'seek', to: target, drift }
      : { action: 'hold', reason: 'paused', drift };
  }

  if (absDrift <= SYNC_SOFT_TOLERANCE_S) {
    return { action: 'settled', rate: roomRate, drift };
  }

  // Mid-band: close the gap by running slightly fast or slow, which nobody
  // sees, instead of jumping, which everybody does.
  if (canNudge) {
    const rate = roomRate * (drift > 0 ? 1 + SYNC_NUDGE_RATE : 1 - SYNC_NUDGE_RATE);
    return { action: 'rate', rate, drift };
  }

  // No usable rate control: tolerate up to the hard threshold. A sub-2 s gap on
  // an embedded player is cheaper than the re-buffer a seek costs.
  return { action: 'hold', reason: 'coarse-rate', drift };
}

// ─── Position observer ───────────────────────────────────────────

export interface PositionObservation {
  /** Seconds the playhead moved since the previous sample. */
  delta: number;
  /** Seconds it should have moved, from wall-clock time and the rate. */
  expected: number;
  /** The playhead moved by an amount playback cannot explain. */
  jumped: boolean;
  /** The playhead did not move while the player claimed to be playing. */
  stalled: boolean;
}

/**
 * Classify what happened to the playhead between two samples.
 *
 * This replaces listening for `seeked`. Provider elements synthesise that event
 * from their own polling and get it wrong in both directions — YouTube fires it
 * during untouched playback, Twitch does not fire it for a scrub at all — so
 * intent is inferred from the position itself, which no provider can fake.
 *
 * `jumpToleranceS` absorbs one tick of timer jitter; below it, a difference is
 * measurement noise rather than a seek.
 */
export function observePosition(
  previous: number,
  current: number,
  elapsedMs: number,
  rate: number,
  playing: boolean,
  jumpToleranceS: number,
): PositionObservation {
  const delta = current - previous;
  const expected = playing ? (elapsedMs / 1000) * (rate || 1) : 0;
  return {
    delta,
    expected,
    jumped: Math.abs(delta - expected) > jumpToleranceS,
    // Only a claim of playing makes a still playhead meaningful; a paused
    // player is supposed to sit still.
    stalled: playing && elapsedMs > 0 && delta <= 0 && expected > 0,
  };
}

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
import {
  SYNC_SOFT_TOLERANCE_S,
  SYNC_HARD_TOLERANCE_S,
  SYNC_NUDGE_RATE,
  SYNC_SETTLE_TARGET_S,
  SYNC_MAX_SEEK_LEAD_S,
  SYNC_PAUSED_TOLERANCE_S,
  SYNC_NUDGE_ENTER_S,
  SYNC_MAX_NUDGE_RATE,
  SYNC_HARD_TOLERANCE_NUDGE_S,
} from './constants';
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
  /**
   * A nudge is already in progress. With it, the planner keeps nudging until
   * the gap is under `SYNC_SETTLE_TARGET_S` instead of stopping the moment it
   * re-enters the soft band (hysteresis). Optional; defaults to false.
   */
  nudging?: boolean;
  /**
   * Seconds this player typically spends buffering after a seek. A seek to
   * the room's position lands that far behind, because the room keeps playing
   * while the player refills — so while the room plays, the seek is led by
   * this much (capped at `SYNC_MAX_SEEK_LEAD_S`). Optional; defaults to 0.
   */
  seekLeadS?: number;
}

export type SyncPlan =
  /** Do nothing this tick. */
  | { action: 'hold'; reason: HoldReason; drift: number }
  /** Jump the playhead. `lead` is how far past the room's position it aims (media s). */
  | { action: 'seek'; to: number; drift: number; lead: number }
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

  // A player that can nudge closes mid-sized gaps smoothly, so it only needs
  // to jump for bigger ones; one that can't tolerates up to the full 2 s.
  const hardTolerance = canNudge ? SYNC_HARD_TOLERANCE_NUDGE_S : SYNC_HARD_TOLERANCE_S;
  if (force || absDrift > hardTolerance) {
    // Lead a seek on a playing room by the time the player will spend refilling,
    // so it lands where the room will be, not where it was.
    const lead = state.playing
      ? Math.min(Math.max(0, input.seekLeadS ?? 0), SYNC_MAX_SEEK_LEAD_S) * roomRate
      : 0;
    const to = sample.seekableEnd != null ? Math.min(target + lead, sample.seekableEnd) : target + lead;
    return { action: 'seek', to, drift, lead: to - target };
  }

  // While the room is paused the anchor is static: a gap under a few frames is
  // not worth a seek, anything more is where this viewer would resume from.
  if (!state.playing) {
    return absDrift > SYNC_PAUSED_TOLERANCE_S
      ? { action: 'seek', to: target, drift, lead: 0 }
      : { action: 'hold', reason: 'paused', drift };
  }

  // Hysteresis: a nudge starts past SYNC_NUDGE_ENTER_S and runs on down to the
  // settle target. Entry used to be the 0.5 s soft tolerance, which let a
  // viewer that started 0.4 s off stay there for good — a rate nudge is
  // inaudible, so there is no reason to tolerate a gap that size on a player
  // that can make one (HLS run, 2026-10-11).
  const settleBand = !canNudge
    ? SYNC_SOFT_TOLERANCE_S
    : input.nudging
      ? SYNC_SETTLE_TARGET_S
      : SYNC_NUDGE_ENTER_S;
  if (absDrift <= settleBand) {
    return { action: 'settled', rate: roomRate, drift };
  }

  // Mid-band: close the gap by running slightly fast or slow, which nobody
  // sees, instead of jumping, which everybody does.
  if (canNudge) {
    // Proportional: a second behind runs faster than a quarter-second behind,
    // between the floor that is inaudible and the ceiling that is not.
    const amount = Math.min(SYNC_MAX_NUDGE_RATE, Math.max(SYNC_NUDGE_RATE, absDrift * 0.08));
    const rate = roomRate * (drift > 0 ? 1 + amount : 1 - amount);
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

/**
 * Learn this player's seek cost from how a seek actually landed.
 *
 * A seek aimed `leadUsed` past the room, on a player that then spent `L`
 * seconds refilling, is found `leadUsed − L·rate` off the room once it plays at
 * speed again. So the residual drift measures `L` directly — no timing of when
 * frames resumed, which a 250 ms tick (and the cooldown after a seek) can only
 * over-estimate. Timing it that way taught a player that seeks instantly to
 * lead every seek by ~1.4 s and land that far AHEAD (found in a two-browser
 * run, 2026-10-11).
 */
export function refineSeekLead(current: number, leadUsed: number, driftAfter: number, roomRate = 1): number {
  const measured = Math.min(SYNC_MAX_SEEK_LEAD_S, Math.max(0, (leadUsed - driftAfter) / (roomRate || 1)));
  return current === 0 ? measured : current * 0.6 + measured * 0.4;
}

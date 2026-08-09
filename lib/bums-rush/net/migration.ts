/**
 * Bum's Rush — host election and handoff (§9.6).
 *
 * Pure functions over values, and imported by BOTH the hub and the client on
 * purpose: the hub elects, the client explains the result in the HUD ("Marta is
 * hosting now"), and an election rule that existed twice would eventually
 * disagree with itself about who is hosting — which is the one thing a room
 * cannot survive.
 *
 * No socket.io, no browser globals, no `.server` imports.
 */

import { NET } from '../constants';
import type { SeatIndex } from '../types';
import type { DeviceKind } from './protocol';

/** The wipe the new host holds before resuming (§9.6). */
export const MIGRATION_FREEZE_MS = 300;

/**
 * Past this, the keyframe the hub kept is not worth resuming from.
 *
 * §9.6: resuming mid-air from two-second-old state drops everyone into geometry
 * that has moved. A rewind to the last checkpoint costs a few seconds of
 * progress and is legible; a resume from stale state costs a wipe and is not.
 */
export const KEYFRAME_STALE_MS = 2_000;

/** How far back the RTT median looks. */
export const ELECTION_WINDOW_MS = 30_000;

/**
 * RTT is bucketed before it is compared.
 *
 * "Lowest median RTT" taken literally makes a phone that is 8 ms better than a
 * laptop the host, and then the room runs a 60 Hz matter-js world on a device
 * that thermally throttles four minutes in. A 50 ms band says: pick the
 * meaningfully-closer client, and when nobody is meaningfully closer, pick the
 * machine that can actually simulate.
 */
export const RTT_BUCKET_MS = 50;

export interface HostCandidate {
  clientId: string;
  /** Seats this client owns. A client with none is not a candidate at all. */
  seats: readonly SeatIndex[];
  /** Median RTT over the last {@link ELECTION_WINDOW_MS}; null = never probed. */
  medianRtt: number | null;
  device?: DeviceKind;
  /** Excluded while a client is inside its reconnect grace. */
  connected?: boolean;
}

/** Never-probed clients sort behind every probed one without special-casing. */
const UNKNOWN_RTT = 10_000;

function deviceRank(device: DeviceKind | undefined): number {
  // Unknown sits between the two: better than a phone we are sure about,
  // worse than a desktop we are sure about.
  return device === 'desktop' ? 0 : device === 'mobile' ? 2 : 1;
}

function lowestSeat(candidate: HostCandidate): number {
  let min = Number.POSITIVE_INFINITY;
  for (const seat of candidate.seats) if (seat < min) min = seat;
  return min;
}

/**
 * §9.6's rule, in order: seat-owning and connected · lowest RTT band · desktop
 * over phone where detectable · lowest seat index.
 *
 * Deterministic for a given input, which is what
 * `handler.test.ts`'s "re-elects deterministically" assertion needs: two
 * clients that tie on everything are separated by seat index, and seat indices
 * are unique.
 */
export function electHost(candidates: readonly HostCandidate[]): string | null {
  const eligible = candidates.filter((c) => c.seats.length > 0 && c.connected !== false);
  if (eligible.length === 0) return null;

  let best: HostCandidate | null = null;
  let bestKey: [number, number, number] = [Infinity, Infinity, Infinity];

  for (const candidate of eligible) {
    const rtt = candidate.medianRtt ?? UNKNOWN_RTT;
    const key: [number, number, number] = [
      Math.floor(rtt / RTT_BUCKET_MS),
      deviceRank(candidate.device),
      lowestSeat(candidate),
    ];
    if (
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
      (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
    ) {
      best = candidate;
      bestKey = key;
    }
  }

  return best?.clientId ?? null;
}

/**
 * Should the room offer to migrate away from the current host?
 *
 * §9.5's honest-degradation rule: sustained RTT above
 * {@link NET.RTT_MIGRATE_MS} for ten seconds. Offered, never forced — a room
 * that reassigns the host under someone mid-swing is worse than a laggy one.
 */
export function shouldOfferMigration(sustainedHighRttMs: number): boolean {
  return sustainedHighRttMs >= 10_000;
}

export type ResumeMode = 'keyframe' | 'checkpoint';

export interface MigrationPlan {
  resumeFrom: ResumeMode;
  freezeMs: number;
}

/** §9.6: load the keyframe, freeze 300 ms, rewind to the checkpoint if stale. */
export function planMigration(input: {
  hasKeyframe: boolean;
  keyframeAgeMs: number | null;
}): MigrationPlan {
  const usable =
    input.hasKeyframe && input.keyframeAgeMs !== null && input.keyframeAgeMs <= KEYFRAME_STALE_MS;
  return { resumeFrom: usable ? 'keyframe' : 'checkpoint', freezeMs: MIGRATION_FREEZE_MS };
}

// ─── RTT tracking ───────────────────────────────────────────────────────────

/**
 * A rolling median over a time window.
 *
 * Median rather than mean because RTT distributions are one-sided: a single
 * 900 ms stall from a wifi roam drags a mean far enough to lose an election the
 * client would otherwise deserve to win, and it is exactly the sample we do not
 * want to be judged on.
 */
export class RttWindow {
  private readonly samples: { at: number; rtt: number }[] = [];

  constructor(private readonly windowMs: number = ELECTION_WINDOW_MS) {}

  push(rtt: number, now: number): void {
    if (!Number.isFinite(rtt) || rtt < 0) return;
    this.samples.push({ at: now, rtt });
    this.prune(now);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop].at < cutoff) drop++;
    if (drop > 0) this.samples.splice(0, drop);
    // A pathological clock (or a socket that pings far faster than it should)
    // must not make this array the room's memory leak.
    const cap = Math.ceil(this.windowMs / 250) + 8;
    if (this.samples.length > cap) this.samples.splice(0, this.samples.length - cap);
  }

  median(now: number): number | null {
    this.prune(now);
    if (this.samples.length === 0) return null;
    const sorted = this.samples.map((s) => s.rtt).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  get size(): number {
    return this.samples.length;
  }
}

/**
 * Does this seat's RTT warrant auto-enabling grab assist (§9.5)?
 *
 * The HUD says why, in one line, whenever this flips on. Silent assistance is
 * the version of this feature that makes people distrust the game.
 */
export function rttNeedsGrabAssist(medianRtt: number | null): boolean {
  return medianRtt !== null && medianRtt > NET.RTT_ASSIST_MS;
}

/**
 * The owner side of random crits: the crit-chance multiplier that grows with
 * recent damage dealt (CTFPlayerShared::RecordDamageEvent + UpdateCritMult +
 * GetCritMult), kept per player.
 *
 * The SDK keeps a list of damage events; this keeps a one-sample-per-tick
 * ring of the player's cumulative damage dealt to enemies (`stats.damage`,
 * which the core already caps at the victim's health like RecordDamageEvent
 * caps a kill) and sums the window the SDK counts: events at least
 * TF_DAMAGE_CRITMOD_MINTIME (2 s) and at most TF_DAMAGE_CRITMOD_MAXTIME
 * (20 s) old. The result is quantized to the byte the SDK networks
 * (m_iCritMult), so a predicting client that receives the byte rolls with the
 * same multiplier.
 */

import { TICK_INTERVAL } from '../../core/constants';
import { CRIT, remapValClamped } from '../../data/damage';
import type { Player } from '../player';

const RING = Math.ceil(CRIT.critMod.maxTime / TICK_INTERVAL) + 2;
const MIN_TICKS = Math.round(CRIT.critMod.minTime / TICK_INTERVAL);
const MAX_TICKS = Math.round(CRIT.critMod.maxTime / TICK_INTERVAL);

export class CritTracker {
  /** Cumulative damage dealt at each recorded tick (ring). */
  private readonly samples = new Float64Array(RING);
  private readonly ticks = new Int32Array(RING).fill(-1);
  private lastTick = -1;
  /** m_iCritMult (0…255). */
  critMultByte = 0;
  /** Set on a predicting client from the networked byte (the client has no damage stats). */
  networked = false;

  /** Records this tick's cumulative damage once per tick and recomputes the byte (UpdateCritMult). */
  update(p: Player): void {
    const tick = p.world.tickCount;
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    if (this.networked || !p.world.isServer) return;
    const slot = tick % RING;
    this.samples[slot] = p.stats.damage;
    this.ticks[slot] = tick;
    const recent = this.sampleAt(tick - MIN_TICKS);
    const old = this.sampleAt(tick - MAX_TICKS);
    const dealt = recent < 0 ? 0 : Math.max(0, recent - Math.max(0, old));
    this.critMultByte = Math.floor(remapValClamped(dealt, 0, CRIT.critMod.damage, 0, 255));
  }

  /** CTFPlayerShared::GetCritMult: the byte remapped to 1…4. */
  mult(): number {
    return remapValClamped(this.critMultByte, 0, 255, 1, 4);
  }

  reset(): void {
    this.ticks.fill(-1);
    this.critMultByte = 0;
    this.lastTick = -1;
  }

  /** Cumulative damage at the newest sample at or before `tick` (-1 = none recorded). */
  private sampleAt(tick: number): number {
    if (tick < 0) return -1;
    const slot = tick % RING;
    if (this.ticks[slot] === tick) return this.samples[slot];
    // A tick with no command (missed sample): fall back to the nearest older one in range.
    for (let i = 1; i < 8; i++) {
      const t = tick - i;
      if (t < 0) break;
      const s = t % RING;
      if (this.ticks[s] === t) return this.samples[s];
    }
    return -1;
  }
}

const trackers = new WeakMap<Player, CritTracker>();

/** The player's crit tracker (created on first use). */
export function critTracker(p: Player): CritTracker {
  let t = trackers.get(p);
  if (!t) {
    t = new CritTracker();
    trackers.set(p, t);
  }
  return t;
}

/** The tracker table, for a checkpoint (sim/checkpoint): read without creating, and put back. */
export const critTrackerTable = {
  peek: (p: Player): CritTracker | undefined => trackers.get(p),
  set: (p: Player, t: CritTracker): void => void trackers.set(p, t),
};

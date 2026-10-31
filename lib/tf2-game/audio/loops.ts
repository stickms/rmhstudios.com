/**
 * Looping sounds that follow replicated state instead of start/stop events.
 *
 * In the SDK the client owns a weapon's envelope sounds: C_TFMinigun::WeaponSoundUpdate and
 * C_TFFlameThrower::OnDataChanged (StartFlame / StartPilotLight / StopFlame) read the networked
 * m_iWeaponState of every weapon — the local player's predicted one and everyone else's from
 * their snapshot — and create or destroy the loop (CSoundEnvelopeController) when the wanted
 * sound changes. A loop driven that way cannot outlive its state: a lost or reordered packet
 * only delays it, and death, a weapon switch or the entity leaving stops it on the next frame.
 *
 * `EntityLoopSounds` is that controller over the mixer. Every frame the caller says which loop
 * each entity wants (the player record's `weaponLoop`, or the predicted weapon's `loopSound()`)
 * and the controller starts, swaps and stops voices to match; an entity it is not told about
 * any more is silenced. A loop that failed to start (the index still loading, the voice limit,
 * out of earshot) or was stolen is retried after `LOOP_RETRY_INTERVAL`.
 *
 * `LateStartFilter` covers the loops that are still events (the medigun beam, a dispenser's hum,
 * a sapper's timer, map entities): starts ride unreliable snapshots while stops are reliable and
 * go out first, so a start can arrive after the stop that ended it. A start older than a stop of
 * the same sound on the same entity is dropped.
 *
 * Environment-agnostic: no Web Audio here (the host plays and stops voices).
 */

import type { AudioEmit, VoiceHandle } from './engine';

/** Seconds before a wanted loop that is not playing is tried again. */
export const LOOP_RETRY_INTERVAL = 0.5;

export interface LoopSoundHost {
  emit(ev: AudioEmit): VoiceHandle | null;
}

interface EntityLoop {
  name: string;
  handle: VoiceHandle | null;
  /** Clock time of the last start attempt. */
  tried: number;
}

export class EntityLoopSounds {
  private readonly loops = new Map<number, EntityLoop>();
  private readonly seen = new Set<number>();

  constructor(private readonly host: LoopSoundHost) {}

  /** Number of entities with a wanted loop (tests, HUD debug). */
  get size(): number {
    return this.loops.size;
  }

  /** The loop an entity currently wants ('' for none). */
  wanted(entity: number): string {
    return this.loops.get(entity)?.name ?? '';
  }

  /**
   * One frame: `wants` lists every entity's wanted loop ('' = none) at clock `now` (seconds).
   * Entities missing from it are stopped.
   */
  update(wants: Iterable<readonly [entity: number, name: string]>, now: number): void {
    this.seen.clear();
    for (const [entity, name] of wants) {
      this.seen.add(entity);
      this.set(entity, name, now);
    }
    for (const entity of [...this.loops.keys()])
      if (!this.seen.has(entity)) this.set(entity, '', now);
  }

  /** Stop everything (map change, disconnect). */
  stopAll(): void {
    for (const l of this.loops.values()) l.handle?.stop();
    this.loops.clear();
  }

  private set(entity: number, name: string, now: number): void {
    const cur = this.loops.get(entity);
    if (cur && cur.name === name) {
      if (cur.handle?.playing) return;
      // Started once and ended by itself (a wave with no loop points): leave it be.
      if (cur.handle && !cur.handle.looping) return;
      if (now - cur.tried < LOOP_RETRY_INTERVAL) return;
      cur.handle = this.host.emit({ name, entity });
      cur.tried = now;
      return;
    }
    cur?.handle?.stop();
    if (!name) {
      this.loops.delete(entity);
      return;
    }
    this.loops.set(entity, { name, handle: this.host.emit({ name, entity }), tried: now });
  }
}

/** Seconds a stop is remembered for (longer than any snapshot can lag behind a reliable packet). */
export const LATE_START_MEMORY = 2;

export class LateStartFilter {
  /** `entity|name` → the tick of the newest stop. */
  private readonly stops = new Map<string, number>();
  private lastPrune = 0;

  constructor(private readonly tickInterval: number) {}

  private static key(entity: number | undefined, name: string): string {
    return `${entity ?? 0}|${name.toLowerCase()}`;
  }

  /** Note a stop that happened on server tick `tick`. */
  stopped(entity: number | undefined, name: string, tick: number): void {
    const k = LateStartFilter.key(entity, name);
    const prev = this.stops.get(k);
    if (prev === undefined || tick > prev) this.stops.set(k, tick);
    this.prune(tick);
  }

  /** Whether a start from server tick `tick` should still play (no later stop has been seen). */
  admits(entity: number | undefined, name: string, tick: number): boolean {
    const stop = this.stops.get(LateStartFilter.key(entity, name));
    return stop === undefined || tick >= stop;
  }

  clear(): void {
    this.stops.clear();
  }

  private prune(tick: number): void {
    const keep = Math.ceil(LATE_START_MEMORY / this.tickInterval);
    if (tick - this.lastPrune < keep) return;
    this.lastPrune = tick;
    for (const [k, t] of this.stops) if (tick - t > keep) this.stops.delete(k);
  }
}

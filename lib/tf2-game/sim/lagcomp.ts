/**
 * Lag compensation (the SDK's CLagCompensationManager,
 * player_lagcompensation.cpp): a one-second history of every player's
 * position, stance and facing, and `withRewind`, which moves everyone but
 * the shooter back to where the shooter saw them while a hitscan attack is
 * traced, then puts them back.
 *
 * The target time follows StartLagCompensation: the command's tick minus the
 * client's interpolation ticks, cross-checked against the measured latency
 * (if they disagree by more than 200 ms the latency wins), never more than
 * sv_maxunlag (1 s) into the past. BacktrackPlayer interpolates between the
 * two records around that time and refuses to cross a teleport (a jump of
 * more than 64 units between records) or a death.
 */

import { TICK_INTERVAL, timeToTicks, VEC_DUCK_HULL_MAX, VEC_DUCK_HULL_MIN, VEC_HULL_MAX, VEC_HULL_MIN } from '../core/constants';
import type { UserCmd } from '../core/types';
import type { Player } from './player';
import { MAX_PLAYERS, type GameWorld } from './world';

/** sv_maxunlag. */
export const SV_MAXUNLAG = 1.0;
/** sv_lagcompensation_teleport_dist (64), squared. */
export const LAG_COMPENSATION_TELEPORTED_DISTANCE_SQR = 64 * 64;
/** The history length in ticks (sv_maxunlag worth, plus one). */
export const LAG_HISTORY_TICKS = Math.ceil(SV_MAXUNLAG / TICK_INTERVAL) + 1;

/** Ring of LagRecords for one player (structure of arrays). */
export class PlayerTrack {
  readonly time = new Float64Array(LAG_HISTORY_TICKS);
  readonly x = new Float64Array(LAG_HISTORY_TICKS);
  readonly y = new Float64Array(LAG_HISTORY_TICKS);
  readonly z = new Float64Array(LAG_HISTORY_TICKS);
  readonly yaw = new Float64Array(LAG_HISTORY_TICKS);
  readonly ducked = new Uint8Array(LAG_HISTORY_TICKS);
  readonly alive = new Uint8Array(LAG_HISTORY_TICKS);
  /** Index of the newest record. */
  head = -1;
  count = 0;

  push(t: number, p: Player): void {
    this.head = (this.head + 1) % LAG_HISTORY_TICKS;
    const i = this.head;
    this.time[i] = t;
    this.x[i] = p.origin.x;
    this.y[i] = p.origin.y;
    this.z[i] = p.origin.z;
    this.yaw[i] = p.eyeAngles.y;
    this.ducked[i] = p.move.ducked ? 1 : 0;
    this.alive[i] = p.alive ? 1 : 0;
    if (this.count < LAG_HISTORY_TICKS) this.count++;
  }

  clear(): void {
    this.head = -1;
    this.count = 0;
  }

  /** i-th newest record's ring index (0 = newest). */
  at(i: number): number {
    return (this.head - i + LAG_HISTORY_TICKS * 2) % LAG_HISTORY_TICKS;
  }
}

/** Saved state of a moved player. */
interface Restore {
  player: Player;
  x: number;
  y: number;
  z: number;
  yaw: number;
  ducked: boolean;
}

export interface RewindOptions {
  /** Client interpolation ticks (TIME_TO_TICKS(cl_interp)); default the player's `lerpTicks`. */
  lerpTicks?: number;
  /** Measured one-way latency in seconds; default the player's `latency`. */
  latency?: number;
}

export class LagCompensation {
  private readonly world: GameWorld;
  private readonly tracks: PlayerTrack[] = [];
  private readonly restores: Restore[] = [];
  private active = false;
  /** Disable for offline play / tests (sv_unlag 0). */
  enabled = true;

  constructor(world: GameWorld) {
    this.world = world;
  }

  private track(id: number): PlayerTrack {
    let t = this.tracks[id];
    if (!t) {
      t = new PlayerTrack();
      this.tracks[id] = t;
    }
    return t;
  }

  /** SDK: CLagCompensationManager::FrameUpdatePostEntityThink — record every player this tick. */
  record(): void {
    const t = this.world.curtime;
    const ents = this.world.entities;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = ents[i];
      if (e && !e.removed) this.track(i).push(t, e as Player);
    }
  }

  /** Forget a player's history (respawn/teleport/leave): never rewind across it. */
  reset(playerId: number): void {
    this.tracks[playerId]?.clear();
  }

  /** The time a command's shot should be evaluated at (StartLagCompensation's targettick). */
  targetTime(cmdTick: number, opts: RewindOptions = {}): number {
    const now = this.world.tickCount;
    const lerpTicks = opts.lerpTicks ?? 0;
    let correct = (opts.latency ?? 0) + lerpTicks * TICK_INTERVAL;
    correct = Math.min(Math.max(correct, 0), SV_MAXUNLAG);
    let targetTick = cmdTick - lerpTicks;
    const delta = correct - (now - targetTick) * TICK_INTERVAL;
    if (Math.abs(delta) > 0.2) targetTick = now - timeToTicks(correct);
    // Never further back than the history holds.
    targetTick = Math.max(targetTick, now - LAG_HISTORY_TICKS + 1);
    targetTick = Math.min(targetTick, now);
    return this.world.tickToTime(targetTick);
  }

  /**
   * Runs `fn` with every other living player moved back to where `shooter`
   * saw them at `cmdTick` (StartLagCompensation … FinishLagCompensation).
   * Re-entrant calls run `fn` unrewound.
   */
  withRewind<T>(shooter: Player, cmdTick: number | UserCmd, fn: () => T, opts: RewindOptions = {}): T {
    if (!this.enabled || this.active || shooter.isBot) return fn();
    const tick = typeof cmdTick === 'number' ? cmdTick : cmdTick.tickCount;
    const target = this.targetTime(tick, {
      lerpTicks: opts.lerpTicks ?? shooter.lerpTicks,
      latency: opts.latency ?? shooter.latency,
    });
    this.active = true;
    this.restores.length = 0;
    try {
      this.world.forEachPlayer((p) => {
        if (p === shooter || !p.alive) return;
        this.backtrack(p, target);
      });
      return fn();
    } finally {
      for (const r of this.restores) {
        const p = r.player;
        p.origin.x = r.x;
        p.origin.y = r.y;
        p.origin.z = r.z;
        p.eyeAngles.y = r.yaw;
        p.move.ducked = r.ducked;
        p.setSize(r.ducked ? VEC_DUCK_HULL_MIN : VEC_HULL_MIN, r.ducked ? VEC_DUCK_HULL_MAX : VEC_HULL_MAX);
      }
      this.restores.length = 0;
      this.active = false;
    }
  }

  /** SDK: CLagCompensationManager::BacktrackPlayer. */
  private backtrack(p: Player, targetTime: number): void {
    const tr = this.tracks[p.id];
    if (!tr || tr.count === 0) return;
    let prevOx = p.origin.x;
    let prevOy = p.origin.y;
    let rec = -1;
    let prev = -1;
    for (let i = 0; i < tr.count; i++) {
      prev = rec;
      rec = tr.at(i);
      if (!tr.alive[rec]) return;
      const dx = tr.x[rec] - prevOx;
      const dy = tr.y[rec] - prevOy;
      if (dx * dx + dy * dy > LAG_COMPENSATION_TELEPORTED_DISTANCE_SQR) return;
      if (tr.time[rec] <= targetTime) break;
      prevOx = tr.x[rec];
      prevOy = tr.y[rec];
    }
    if (rec < 0) return;
    let x = tr.x[rec];
    let y = tr.y[rec];
    let z = tr.z[rec];
    let yaw = tr.yaw[rec];
    let ducked = tr.ducked[rec] === 1;
    if (prev >= 0 && tr.time[rec] < targetTime && tr.time[rec] < tr.time[prev]) {
      const frac = (targetTime - tr.time[rec]) / (tr.time[prev] - tr.time[rec]);
      x += (tr.x[prev] - x) * frac;
      y += (tr.y[prev] - y) * frac;
      z += (tr.z[prev] - z) * frac;
      let dyaw = tr.yaw[prev] - yaw;
      dyaw = ((((dyaw + 180) % 360) + 360) % 360) - 180;
      yaw += dyaw * frac;
      if (frac > 0.5) ducked = tr.ducked[prev] === 1;
    }
    this.restores.push({
      player: p,
      x: p.origin.x,
      y: p.origin.y,
      z: p.origin.z,
      yaw: p.eyeAngles.y,
      ducked: p.move.ducked,
    });
    p.origin.x = x;
    p.origin.y = y;
    p.origin.z = z;
    p.eyeAngles.y = yaw;
    p.move.ducked = ducked;
    p.setSize(ducked ? VEC_DUCK_HULL_MIN : VEC_HULL_MIN, ducked ? VEC_DUCK_HULL_MAX : VEC_HULL_MAX);
  }

  get isRewinding(): boolean {
    return this.active;
  }
}

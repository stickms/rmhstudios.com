/**
 * Client-side prediction of the local player (the SDK's CPrediction,
 * game/client/prediction.cpp): every command is run locally the moment it is
 * made, through the same `Player.runCommand` the server runs — movement
 * (playerMove) and the active weapon's itemPostFrame — in a client world
 * (`GameWorld` with `isServer: false`: no authoritative damage, spawning or
 * broadcast events).
 *
 * On each snapshot the authoritative player (its owner-view record: exact
 * origin and velocity plus the private MoveState block) and weapon records
 * are restored, the commands the server has not run yet (number > the
 * snapshot's ackCmd) are run again, and the difference between where we had
 * predicted to be and where the replay ends up is the prediction error. Small
 * errors are blended out over `smoothTime` (cl_smoothtime 0.1 s); large ones
 * (`snapDistance`, a teleport or respawn) snap.
 *
 * Time: the server runs a player's commands one per tick as they arrive, so a
 * command K after the acknowledged command A is assumed to run at snapshot
 * tick + (K − A) — the role of the SDK's player tickbase. Weapon timers read
 * that `curtime`.
 *
 * Sounds and effects the weapon code emits while predicting are captured
 * (the client world's emitSound/emitEffect are rerouted here) and reported
 * ONCE, on a command's first run, with a dedupe key `<command>:<n>`; replays
 * never report. The server leaves the predicting owner out of those events
 * (`predictedBy` → `notTo`), so nothing plays twice.
 *
 * Environment-agnostic.
 */

import { TICK_INTERVAL } from '../../core/constants';
import type { UserCmd } from '../../core/types';
import { copy, vec3, type Vec3 } from '../../core/vec';
import { unpackUnlockNet } from '../../sim/items/effects';
import type { EffectEvent } from '../../sim/events';
import type { NetRecord } from '../../sim/net-schema';
import { readMoveState, type Player } from '../../sim/player';
import { weaponSpecFor } from '../../sim/loadout';
import { createWeapon, WEAPON_SLOTS, type SoundOptions } from '../../sim/weapon-api';
import { decodeItems, wornAttributesOf } from '../../sim/items/loadout';
import type { GameWorld } from '../../sim/world';

/** cl_smoothtime. */
export const PREDICTION_SMOOTH_TIME = 0.1;
/** Errors beyond this snap instead of blending (cl_pred_error_verify-like; a teleport). */
export const PREDICTION_SNAP_DISTANCE = 64;
/** Commands kept for replay (≥ 1 s at 66 Hz). */
export const PREDICTION_HISTORY = 128;

export interface PredictedSound {
  type: 'sound';
  key: string;
  name: string;
  opts: SoundOptions;
}

export interface PredictedEffect {
  type: 'effect';
  key: string;
  effect: Omit<EffectEvent, 'type'>;
}

export interface PredictionOptions {
  smoothTime?: number;
  snapDistance?: number;
  /** A predicted sound/effect, reported once per command (play it now). */
  onEvent?: (e: PredictedSound | PredictedEffect) => void;
}

export interface AuthoritativeState {
  /** Snapshot tick. */
  tick: number;
  /** Last command the server ran for us. */
  ackCmd: number;
  /** Our player record, owner view. */
  player: NetRecord;
  /** Our weapon records by slot. */
  weapons: ReadonlyArray<{ slot: number; record: NetRecord }>;
  /** The rules record (round state: frozen in pre-round, humiliation). */
  rules?: NetRecord | null;
}

interface Entry {
  cmd: UserCmd;
  /** Origin after the command, as last predicted. */
  origin: Vec3;
}

const COND_KEYS = ['cond0', 'cond1', 'cond2', 'cond3', 'cond4'];

/** Restores a client-world player from its owner-view record and weapon records. */
export function restorePlayerFromRecords(
  player: Player,
  rec: NetRecord,
  weapons: ReadonlyArray<{ slot: number; record: NetRecord }>,
): void {
  const n = (k: string): number => (typeof rec[k] === 'number' ? (rec[k] as number) : 0);
  player.changeTeam(n('team'));
  player.playerClass = n('cls');
  player.lifeState = n('lifeState');
  player.health = n('health');
  player.maxHealth = n('maxHealth');
  player.observerMode = n('observerMode');
  for (let i = 0; i < COND_KEYS.length && i < player.cond.bits.length; i++)
    player.cond.bits[i] = n(COND_KEYS[i]) >>> 0;
  for (let i = 1; i < player.ammo.length; i++)
    if (`ammo${i}` in rec) player.ammo[i] = n(`ammo${i}`);
  for (let i = 0; i < player.meters.length; i++) player.meters[i] = n(`meter${i}`);
  player.blastJumpState = n('blastJump');
  unpackUnlockNet(player, n('unlockState'));
  // Worn weapon-slot items provide attributes the shared code reads (move speed, deploy time…).
  const items = typeof rec.items === 'string' ? rec.items : '';
  if (items !== player.items) {
    player.items = items;
    player.wornAttributes = wornAttributesOf(decodeItems(items), player.playerClass);
  }
  player.lastSlot = n('lastSlot');
  player.eyeAngles.x = n('eyePitch');
  player.eyeAngles.y = n('eyeYaw');
  readMoveState(rec, player.move);
  player.syncFromMove();

  const present = new Set<number>();
  for (const { slot, record } of weapons) {
    if (slot < 0 || slot >= WEAPON_SLOTS) continue;
    present.add(slot);
    const defindex = typeof record.defindex === 'number' ? record.defindex : -1;
    let w = player.weapons[slot];
    if (!w || w.defindex !== defindex) {
      const spec = weaponSpecFor(defindex, player.playerClass) ?? {
        defindex,
        classname: 'tf_weapon_stub',
        slot,
      };
      w = createWeapon(spec);
      if (!w) continue;
      player.weapons[slot] = w;
      w.equip(player);
    }
    w.readNet(record);
  }
  for (let s = 0; s < WEAPON_SLOTS; s++) if (!present.has(s)) player.weapons[s] = null;
  const active = n('activeSlot');
  player.activeSlot = active >= 0 && active < WEAPON_SLOTS && player.weapons[active] ? active : -1;
}

export class Prediction {
  private readonly entries: Entry[] = [];
  private snapTick = 0;
  private ackCmd = 0;
  private hasAuthority = false;
  private replaying = false;
  private currentCmd = 0;
  private eventSeq = 0;
  private readonly smoothTime: number;
  private readonly snapDistance: number;
  private readonly onEvent: PredictionOptions['onEvent'];
  /** The visible error being blended out, and when it was set (ms). */
  private readonly errorOffset = vec3();
  private errorAt = 0;
  /** |predicted − authoritative| for the newest acknowledged command, units. */
  lastMisprediction = 0;
  /** The largest misprediction seen (diagnostics, tests). */
  maxMisprediction = 0;
  /** Size of the last correction applied to the current predicted position. */
  lastCorrection = 0;
  snaps = 0;

  constructor(
    readonly world: GameWorld,
    readonly player: Player,
    opts: PredictionOptions = {},
  ) {
    this.smoothTime = opts.smoothTime ?? PREDICTION_SMOOTH_TIME;
    this.snapDistance = opts.snapDistance ?? PREDICTION_SNAP_DISTANCE;
    this.onEvent = opts.onEvent;
    // Capture what the shared code emits while we predict.
    world.emitSound = (name: string, o: SoundOptions = {}) => {
      if (this.replaying || this.currentCmd === 0) return;
      this.onEvent?.({
        type: 'sound',
        key: `${this.currentCmd}:${this.eventSeq++}`,
        name,
        opts: o,
      });
    };
    world.emitEffect = (effect: Omit<EffectEvent, 'type'>) => {
      if (this.replaying || this.currentCmd === 0) return;
      this.onEvent?.({ type: 'effect', key: `${this.currentCmd}:${this.eventSeq++}`, effect });
    };
  }

  /** Commands waiting for the server. */
  get pending(): number {
    return this.entries.length;
  }

  /** The predicted origin (latest command). */
  get origin(): Vec3 {
    return this.player.origin;
  }

  /** The origin predicted after `commandNumber` (if still kept). */
  predictedOrigin(commandNumber: number): Vec3 | null {
    for (const e of this.entries) if (e.cmd.commandNumber === commandNumber) return e.origin;
    return null;
  }

  private tickFor(cmd: UserCmd): number {
    return this.hasAuthority ? this.snapTick + (cmd.commandNumber - this.ackCmd) : cmd.tickCount;
  }

  private run(cmd: UserCmd, tick: number, replay: boolean): void {
    const w = this.world;
    const saveTick = w.tickCount;
    const saveTime = w.curtime;
    w.tickCount = tick;
    w.curtime = tick * TICK_INTERVAL;
    this.replaying = replay;
    this.currentCmd = cmd.commandNumber;
    this.eventSeq = 0;
    try {
      this.player.runCommand(cmd);
    } finally {
      this.replaying = false;
      this.currentCmd = 0;
      w.tickCount = saveTick;
      w.curtime = saveTime;
    }
  }

  /** Predicts a new command (already canonical — usercmd-codec canonicalizeUserCmd). */
  addCommand(cmd: UserCmd): void {
    const last = this.entries[this.entries.length - 1];
    if (last && cmd.commandNumber <= last.cmd.commandNumber) return;
    if (cmd.commandNumber <= this.ackCmd) return;
    this.run(cmd, this.tickFor(cmd), false);
    this.entries.push({ cmd, origin: copy(vec3(), this.player.origin) });
    while (this.entries.length > PREDICTION_HISTORY) this.entries.shift();
  }

  /**
   * Reconciles with the server: restore, replay, measure. `nowMs` is the
   * render clock (for the error blend).
   */
  reconcile(auth: AuthoritativeState, nowMs: number): void {
    if (this.hasAuthority && auth.tick <= this.snapTick) return;
    const before = copy(vec3(), this.player.origin);
    const visibleBefore = this.renderOffset(nowMs, vec3());

    // Misprediction: where we thought the acknowledged command left us.
    const ackEntry = this.entries.find((e) => e.cmd.commandNumber === auth.ackCmd);
    const ax = num(auth.player.ox);
    const ay = num(auth.player.oy);
    const az = num(auth.player.oz);
    if (ackEntry) {
      this.lastMisprediction = Math.hypot(
        ackEntry.origin.x - ax,
        ackEntry.origin.y - ay,
        ackEntry.origin.z - az,
      );
      if (this.lastMisprediction > this.maxMisprediction)
        this.maxMisprediction = this.lastMisprediction;
    }

    if (auth.rules) {
      const rules = this.world.rules;
      if (typeof auth.rules.state === 'number') rules.state = auth.rules.state;
      if (typeof auth.rules.winningTeam === 'number') rules.winningTeam = auth.rules.winningTeam;
    }
    restorePlayerFromRecords(this.player, auth.player, auth.weapons);
    while (this.entries.length > 0 && this.entries[0].cmd.commandNumber <= auth.ackCmd)
      this.entries.shift();
    this.snapTick = auth.tick;
    this.ackCmd = auth.ackCmd;
    this.hasAuthority = true;

    for (const e of this.entries) {
      this.run(e.cmd, this.tickFor(e.cmd), true);
      copy(e.origin, this.player.origin);
    }

    const after = this.player.origin;
    const ex = before.x - after.x;
    const ey = before.y - after.y;
    const ez = before.z - after.z;
    this.lastCorrection = Math.hypot(ex, ey, ez);
    if (this.lastCorrection > this.snapDistance) {
      this.errorOffset.x = this.errorOffset.y = this.errorOffset.z = 0;
      this.snaps++;
    } else {
      this.errorOffset.x = visibleBefore.x + ex;
      this.errorOffset.y = visibleBefore.y + ey;
      this.errorOffset.z = visibleBefore.z + ez;
    }
    this.errorAt = nowMs;
  }

  /** The part of the last correction still being blended out (linear over smoothTime). */
  renderOffset(nowMs: number, out: Vec3): Vec3 {
    const t = this.smoothTime > 0 ? (nowMs - this.errorAt) / 1000 / this.smoothTime : 1;
    const k = t >= 1 ? 0 : t <= 0 ? 1 : 1 - t;
    out.x = this.errorOffset.x * k;
    out.y = this.errorOffset.y * k;
    out.z = this.errorOffset.z * k;
    return out;
  }

  /** Where to draw the local player: the prediction plus the fading error. */
  renderOrigin(nowMs: number, out: Vec3): Vec3 {
    this.renderOffset(nowMs, out);
    out.x += this.player.origin.x;
    out.y += this.player.origin.y;
    out.z += this.player.origin.z;
    return out;
  }

  /** Forget everything (respawn into a new match). */
  reset(): void {
    this.entries.length = 0;
    this.hasAuthority = false;
    this.snapTick = 0;
    this.ackCmd = 0;
    this.errorOffset.x = this.errorOffset.y = this.errorOffset.z = 0;
  }
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

/**
 * The bomb: the C4 a Terrorist carries (planted only inside a func_bomb_target, standing or crouched,
 * by holding +attack for C4_ARM_TIME; moving, jumping or letting go cancels), and the planted bomb —
 * its mp_c4timer countdown with quickening beeps, the defuse (a Counter-Terrorist holding +use while
 * looking at it within reach: 10 s, 5 s with a kit; CsPlayer runs the use), and the explosion
 * (damage = info_map_parameters' bombradius, reach 3.5 × that, through armor).
 */

import { FL_ONGROUND, IN_ATTACK, MASK_SOLID } from '../../tf2-game/core/constants';
import { emptyTrace, NO_ENTITY, type UserCmd } from '../../tf2-game/core/types';
import { DAMAGE_NO, Entity, FSOLID_NOT_SOLID, SOLID_NONE } from '../../tf2-game/sim/entity';
import { registerEntityClass } from '../../tf2-game/sim/entity-registry';
import { DMG_BLAST } from '../../tf2-game/sim/damage';
import type { NetRecord, NetSchema } from '../../tf2-game/sim/net-schema';
import { registerAlwaysTransmit } from '../../tf2-game/net/snapshot';
import {
  BOMB_RADIUS_SCALE,
  C4_ARM_TIME,
  C4_BEEP_FAST,
  C4_BEEP_SLOW,
  CS_TEAM_T,
} from '../constants';
import { NET_CS_C4 } from '../net-schema';
import type { CsWorld } from '../world';
import { CsWeapon, VM_FIRE, VM_IDLE } from './base';
import { csRadiusDamage } from './grenades';

const plantTr = emptyTrace();

export class CsC4 extends CsWeapon {
  /** curtime the arming started, −1 when not planting. */
  armStartedAt = -1;

  get planting(): boolean {
    return this.armStartedAt >= 0;
  }

  /** May the owner plant here now (on the ground, inside a bomb target, the round live)? */
  canPlant(): boolean {
    const p = this.cs;
    if (!p || !p.alive || !(p.move.flags & FL_ONGROUND)) return false;
    const w = this.world;
    return w.csRules.mayPlant() && p.inBombTarget();
  }

  itemPostFrame(cmd: UserCmd): void {
    const p = this.cs;
    if (!p) return;
    const t = this.curtime;
    const moving = cmd.forwardMove !== 0 || cmd.sideMove !== 0;
    if (!(cmd.buttons & IN_ATTACK) || moving) {
      if (this.planting) this.cancel();
      return;
    }
    if (!this.planting) {
      if (t < this.nextPrimaryAttack || !this.canPlant()) return;
      this.armStartedAt = t;
      this.setActivity(VM_FIRE);
      this.sound('C4.PlantSound');
      return;
    }
    if (!this.canPlant()) {
      this.cancel();
      return;
    }
    if (t - this.armStartedAt >= C4_ARM_TIME - 1e-6) this.plant();
  }

  private cancel(): void {
    this.armStartedAt = -1;
    this.nextPrimaryAttack = this.curtime + 0.5;
    this.setActivity(VM_IDLE);
  }

  private plant(): void {
    const p = this.cs;
    const w = this.world;
    this.armStartedAt = -1;
    if (!w.isServer) return;
    // On the floor under the planter.
    const down = { x: p.origin.x, y: p.origin.y, z: p.origin.z - 64 };
    w.traceLineWorldOnly(
      { x: p.origin.x, y: p.origin.y, z: p.origin.z + 8 },
      down,
      MASK_SOLID,
      plantTr,
    );
    const c4 = w.spawnEntity('planted_c4', (e) => {
      const b = e as PlantedC4;
      b.origin.x = plantTr.endPos.x;
      b.origin.y = plantTr.endPos.y;
      b.origin.z = plantTr.endPos.z;
      b.angles.y = p.eyeAngles.y;
      b.team = CS_TEAM_T;
      b.owner = p.id;
      b.plantedAt = w.curtime;
      b.explodesAt = w.curtime + w.csRules.c4Timer;
    }) as PlantedC4;
    p.removeWeapon(this);
    w.csRules.onBombPlanted(c4, p);
  }

  override holster(next: Parameters<CsWeapon['holster']>[0]): boolean {
    this.armStartedAt = -1;
    return super.holster(next);
  }

  override onOwnerDeath(): void {
    this.armStartedAt = -1;
    super.onOwnerDeath();
  }

  protected override writeNetExtra(out: NetRecord): void {
    out.aux0 = this.armStartedAt;
  }

  protected override readNetExtra(rec: NetRecord): void {
    this.armStartedAt = rec.aux0 as number;
  }
}

// ─── The planted bomb ─────────────────────────────────────────────────────────────────────

export class PlantedC4 extends Entity {
  plantedAt = 0;
  explodesAt = 0;
  /** The Counter-Terrorist defusing it, NO_ENTITY when nobody. */
  defuser: number = NO_ENTITY;
  defuseEndsAt = 0;
  defused = false;
  exploded = false;
  private nextBeepAt = 0;

  constructor(classname = 'planted_c4') {
    super(classname);
    this.solid = SOLID_NONE;
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.takeDamage = DAMAGE_NO;
    this.model = 'models/weapons/w_c4_planted.mdl';
    this.setSize({ x: -8, y: -8, z: 0 }, { x: 8, y: 8, z: 8 });
  }

  override spawn(): void {
    super.spawn();
    this.nextBeepAt = this.world.curtime;
    this.setThink(this.bombThink, this.world.curtime);
  }

  /** Seconds until it blows. */
  timeLeft(): number {
    return Math.max(0, this.explodesAt - this.world.curtime);
  }

  readonly bombThink = (): void => {
    if (this.defused || this.exploded) return;
    const w = this.world as CsWorld;
    const t = w.curtime;
    if (this.defuser !== NO_ENTITY && t >= this.defuseEndsAt) {
      this.defused = true;
      const d = w.player(this.defuser);
      w.emitSound('c4.disarmfinish', { entity: this.id });
      w.csRules.onBombDefused(this, d);
      return;
    }
    if (t >= this.explodesAt) {
      this.explode();
      return;
    }
    if (t >= this.nextBeepAt) {
      w.emitSound('C4.PlantSoundB', { entity: this.id });
      // The beeps quicken as the timer runs out.
      const frac = Math.max(0, Math.min(1, this.timeLeft() / Math.max(1, w.csRules.c4Timer)));
      this.nextBeepAt = t + C4_BEEP_FAST + (C4_BEEP_SLOW - C4_BEEP_FAST) * frac;
    }
    this.setThink(this.bombThink, t + 0.05);
  };

  /** A Counter-Terrorist starts defusing (CsPlayer checks the reach and the look). */
  startDefuse(defuserId: number, seconds: number): void {
    this.defuser = defuserId;
    this.defuseEndsAt = this.world.curtime + seconds;
    this.world.emitSound('c4.disarmstart', { entity: this.id });
  }

  stopDefuse(defuserId: number): void {
    if (this.defuser !== defuserId) return;
    this.defuser = NO_ENTITY;
    this.defuseEndsAt = 0;
  }

  explode(): void {
    if (this.exploded) return;
    this.exploded = true;
    const w = this.world as CsWorld;
    const radius = w.bombRadius;
    const at = { x: this.origin.x, y: this.origin.y, z: this.origin.z + 8 };
    w.emitEffect({ kind: 'explosion', pos: at, system: 'explosion_c4_500' });
    w.emitSound('c4.explode', { pos: at });
    // The round is the Terrorists' by the bomb before its blast kills anyone (no elimination win).
    w.csRules.onBombExploded(this);
    csRadiusDamage(
      w,
      at,
      radius,
      radius * BOMB_RADIUS_SCALE,
      this.owner,
      -1,
      'planted_c4',
      DMG_BLAST,
    );
  }

  override netSchema(): NetSchema {
    return NET_CS_C4;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.plantedAt = this.plantedAt;
    out.explodesAt = this.explodesAt;
    out.defuser = this.defuser;
    out.defuseEndsAt = this.defuseEndsAt;
    out.defused = this.defused;
    out.exploded = this.exploded;
  }
}

registerEntityClass('planted_c4', PlantedC4);
// Every client's HUD shows the planted bomb (the radar, the timer sound) wherever it is.
registerAlwaysTransmit('planted_c4');

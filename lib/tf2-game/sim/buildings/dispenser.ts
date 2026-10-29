/**
 * The Dispenser (the SDK's CObjectDispenser, tf_obj_dispenser.cpp).
 *
 * Once built it keeps a touch trigger (dispenser_touch_trigger, a ±64 box
 * around its centre). Every 0.1 s (DispenseThink) it heals the teammates in it
 * that can see it (g_flDispenserHealRates: 10/15/20 HP/s, no overheal) and,
 * every second someone took something, hands out ammo (g_flDispenserAmmoRates:
 * 20/30/40 % of max primary and secondary) and metal (40 + 10 per level from its
 * store). Every 6 s (RefillThink, first after 3 s) it generates 40 + 10 per
 * level metal up to 400. Disabled (sapped) it neither heals nor dispenses.
 */

import { emptyTrace } from '../../core/types';
import { CONTENTS_WINDOW, MASK_BLOCKLOS, TF_TEAM_RED } from '../../core/constants';
import { vec3, type Vec3 } from '../../core/vec';
import { DISPENSER } from '../../data';
import { OBJ_DISPENSER } from '../building-api';
import { TF_COND } from '../conditions';
import { COLLISION_GROUP_NONE, type Entity } from '../entity';
import type { NetRecord, NetSchema } from '../net-schema';
import type { Player } from '../player';
import type { TouchVolume } from '../world';
import { TF_AMMO_METAL, TFBaseObject } from './base-object';
import { NET_DISPENSER } from './net';

/** DISPENSER_STATE_*. */
export const DISPENSER_STATE_IDLE = 0;
export const DISPENSER_STATE_UPGRADING = 1;

/** DispenseThink / RefillThink intervals. */
const DISPENSE_THINK = 0.1;
/** MASK_DISPENSER: everything that blocks line of sight except grates. */
const MASK_DISPENSER = MASK_BLOCKLOS | CONTENTS_WINDOW;
const TF_AMMO_PRIMARY = 1;
const TF_AMMO_SECONDARY = 2;

const MODEL_PLACEMENT = 'models/buildables/dispenser_blueprint.mdl';
const MODEL_BUILDING: readonly string[] = [
  '',
  'models/buildables/dispenser.mdl',
  'models/buildables/dispenser_lvl2.mdl',
  'models/buildables/dispenser_lvl3.mdl',
];
const MODEL_FINISHED: readonly string[] = [
  '',
  'models/buildables/dispenser_light.mdl',
  'models/buildables/dispenser_lvl2_light.mdl',
  'models/buildables/dispenser_lvl3_light.mdl',
];

const DISPENSER_MINS: Vec3 = { ...DISPENSER.mins };
const DISPENSER_MAXS: Vec3 = { ...DISPENSER.maxs };

const losTrace = emptyTrace();
const sEye = vec3();
const sCenter = vec3();

/** The dispenser's touch trigger (dispenser_touch_trigger): a box the world links players to. */
export class DispenserTouchTrigger implements TouchVolume {
  readonly id: number;
  removed = false;
  readonly center = vec3();
  radius: number = DISPENSER.radius;
  constructor(readonly owner: ObjectDispenser) {
    this.id = owner.id;
  }
  wantsToucher(other: Entity): boolean {
    return other.isPlayer();
  }
  touchesBox(mins: Vec3, maxs: Vec3): boolean {
    const c = this.center;
    const r = this.radius;
    return (
      mins.x < c.x + r &&
      maxs.x > c.x - r &&
      mins.y < c.y + r &&
      maxs.y > c.y - r &&
      mins.z < c.z + r &&
      maxs.z > c.z - r
    );
  }
  startTouch(other: Entity): void {
    this.owner.startTouchTrigger(other);
  }
  touch(): void {}
  endTouch(other: Entity): void {
    this.owner.endTouchTrigger(other);
  }
}

export class ObjectDispenser extends TFBaseObject {
  readonly objectType = OBJ_DISPENSER;
  readonly baseHealth = DISPENSER.baseHealth;
  readonly objMins = DISPENSER_MINS;
  readonly objMaxs = DISPENSER_MAXS;

  /** m_iAmmoMetal. */
  metal = 0;
  dispenserState = DISPENSER_STATE_IDLE;
  nextAmmoDispense = 0;
  private nextRefill = -1;
  /** m_hTouchingEntities / m_hHealingTargets (player ids, in order). */
  readonly touching: number[] = [];
  readonly healing: number[] = [];
  private trigger: DispenserTouchTrigger | null = null;

  constructor(classname = 'obj_dispenser') {
    super(classname);
  }

  override netSchema(): NetSchema | null {
    return NET_DISPENSER;
  }

  protected override onRespawnObject(): void {
    this.model = MODEL_PLACEMENT;
    this.dispenserState = DISPENSER_STATE_IDLE;
  }

  protected override onStartBuilding(): void {
    this.model = MODEL_BUILDING[1];
  }

  /** SDK: CObjectDispenser::OnGoActive. */
  protected override onGoActive(): void {
    this.model = MODEL_FINISHED[1];
    if (!this.carryDeploy) this.metal = DISPENSER.startMetal;
    this.nextRefill = this.world.curtime + DISPENSER.generateFirstDelay;
    this.nextAmmoDispense = this.world.curtime + 0.5;
    this.createTrigger();
    this.world.emitSound('Building_Dispenser.Idle', { entity: this.id });
    this.setContextThinkIn(DISPENSE_THINK);
  }

  /** SDK: CObjectDispenser::StartUpgrading — heal rates change, so everyone is re-added. */
  protected override onStartUpgrading(): void {
    this.model = MODEL_BUILDING[this.level] ?? MODEL_BUILDING[1];
    this.resetHealingTargets();
    this.dispenserState = DISPENSER_STATE_UPGRADING;
  }

  protected override onFinishUpgrading(): void {
    this.dispenserState = DISPENSER_STATE_IDLE;
    if (this.level > 1) this.model = MODEL_FINISHED[this.level] ?? MODEL_FINISHED[1];
  }

  /** SDK: CObjectDispenser::MakeCarriedObject. */
  protected override onMakeCarried(): void {
    this.removeTrigger();
    this.resetHealingTargets();
    this.touching.length = 0;
    this.world.events.push({
      type: 'sound',
      name: 'Building_Dispenser.Idle',
      entity: this.id,
      channel: 0,
      stop: true,
    });
  }

  override onRemove(): void {
    this.resetHealingTargets();
    this.removeTrigger();
    super.onRemove();
  }

  private createTrigger(): void {
    if (this.trigger) return;
    this.trigger = new DispenserTouchTrigger(this);
    this.worldSpaceCenter(this.trigger.center);
    this.world.registerTrigger(this.trigger);
  }

  private removeTrigger(): void {
    const t = this.trigger;
    if (!t) return;
    t.removed = true;
    this.world.unregisterTrigger(t);
    this.trigger = null;
  }

  /** GetDispenserRadius. */
  dispenserRadius(): number {
    return DISPENSER.radius;
  }

  /** g_flDispenserHealRates. */
  healRate(): number {
    return DISPENSER.healRate[this.level] ?? DISPENSER.healRate[1];
  }

  /** SDK: CObjectDispenser::StartTouch. */
  startTouchTrigger(other: Entity): void {
    if (!this.touching.includes(other.id)) this.touching.push(other.id);
    if (
      !this.building &&
      !this.disabled &&
      this.couldHealTarget(other) &&
      !this.isHealingTarget(other.id)
    )
      this.startHealing(other);
  }

  /** SDK: CObjectDispenser::EndTouch. */
  endTouchTrigger(other: Entity): void {
    const i = this.touching.indexOf(other.id);
    if (i >= 0) this.touching.splice(i, 1);
    this.stopHealing(other.id);
  }

  /** SDK: CObjectDispenser::CouldHealTarget — sees us, alive, our team (or disguised as it). */
  couldHealTarget(target: Entity): boolean {
    if (!target.isPlayer()) return false;
    const p = target as Player;
    if (!p.alive) return false;
    p.eyePosition(sEye);
    this.worldSpaceCenter(sCenter);
    const f = this.world.entityFilterObject(p, COLLISION_GROUP_NONE);
    f.ignorePlayers = true;
    this.world.traceLine(sEye, sCenter, MASK_DISPENSER, f.fn, losTrace);
    if (losTrace.fraction < 1 && losTrace.entity !== this.id) return false;
    let team = p.team;
    if (team !== this.team && p.cond.has(TF_COND.DISGUISED)) team = p.disguiseTeam;
    return team === this.team;
  }

  isHealingTarget(id: number): boolean {
    return this.healing.includes(id);
  }

  /** SDK: CObjectDispenser::StartHealing (CTFPlayerShared::Heal, no overheal). */
  private startHealing(other: Entity): void {
    if (this.carried || !other.isPlayer()) return;
    this.healing.push(other.id);
    (other as Player).addHealer(this.id, this.healRate(), 1, true);
    this.world.emitEffect({
      kind: 'beam',
      system: this.team === TF_TEAM_RED ? 'dispenser_heal_red' : 'dispenser_heal_blue',
      pos: this.worldSpaceCenter(vec3()),
      entity: this.id,
      value: other.id,
    });
  }

  /** SDK: CObjectDispenser::StopHealing. */
  private stopHealing(id: number): void {
    const i = this.healing.indexOf(id);
    if (i < 0) return;
    this.healing.splice(i, 1);
    const p = this.world.player(id);
    if (p) p.removeHealer(this.id);
    if (!this.removed) {
      this.world.emitEffect({
        kind: 'beam',
        system: 'dispenser_heal_stop',
        pos: this.worldSpaceCenter(vec3()),
        entity: this.id,
        value: id,
      });
    }
  }

  /** SDK: CObjectDispenser::ResetHealingTargets. */
  resetHealingTargets(): void {
    for (let i = this.healing.length - 1; i >= 0; i--) this.stopHealing(this.healing[i]);
  }

  /** SDK: CObjectDispenser::DispenseMetal. */
  private dispenseMetal(p: Player): number {
    const give = DISPENSER.metalPerDispense + (this.level - 1) * DISPENSER.metalPerDispensePerLevel;
    const got = p.giveAmmo(Math.min(this.metal, give), TF_AMMO_METAL);
    this.metal -= got;
    return got;
  }

  /** SDK: CObjectDispenser::DispenseAmmo. */
  private dispenseAmmo(p: Player): boolean {
    const rate = DISPENSER.ammoRate[this.level] ?? DISPENSER.ammoRate[1];
    let total = 0;
    total += p.giveAmmo(Math.trunc(p.maxAmmo[TF_AMMO_PRIMARY] * rate), TF_AMMO_PRIMARY);
    total += p.giveAmmo(Math.trunc(p.maxAmmo[TF_AMMO_SECONDARY] * rate), TF_AMMO_SECONDARY);
    total += this.dispenseMetal(p);
    if (total > 0) {
      this.world.emitSound('BaseCombatCharacter.AmmoPickup', { entity: p.id, to: p.id });
      return true;
    }
    return false;
  }

  /** SDK: CObjectDispenser::RefillThink. */
  private refillThink(): void {
    this.nextRefill = this.world.curtime + DISPENSER.generateInterval;
    if (this.disabled) return;
    if (this.metal < DISPENSER.maxMetal) {
      const add = DISPENSER.generateMetal + (this.level - 1) * DISPENSER.generateMetalPerLevel;
      this.metal = Math.min(this.metal + add, DISPENSER.maxMetal);
      this.world.emitSound('Building_Dispenser.GenerateMetal', { entity: this.id });
    }
  }

  /** SDK: CObjectDispenser::DispenseThink (+ RefillThink on its own clock). */
  protected override contextThink(): void {
    if (this.carried || this.placing || this.building) return;
    const world = this.world;
    this.setContextThinkIn(DISPENSE_THINK);
    if (this.nextRefill >= 0 && world.curtime >= this.nextRefill - 1e-9) this.refillThink();
    if (this.disabled) {
      this.resetHealingTargets();
      return;
    }
    const trig = this.trigger;
    if (trig) this.worldSpaceCenter(trig.center);

    const dispense = this.nextAmmoDispense <= world.curtime + 1e-9;
    let received = false;
    const doubleRadius2 = 4 * (trig ? trig.radius * trig.radius : 0) * 3;
    for (let i = this.touching.length - 1; i >= 0; i--) {
      const id = this.touching[i];
      const e = world.entity(id);
      if (!e) {
        this.touching.splice(i, 1);
        this.stopHealing(id);
        continue;
      }
      const p = e as Player;
      if (trig) {
        e.worldSpaceCenter(sEye);
        const dx = sEye.x - trig.center.x;
        const dy = sEye.y - trig.center.y;
        const dz = sEye.z - trig.center.z;
        if (!p.alive || dx * dx + dy * dy + dz * dz > doubleRadius2) {
          this.touching.splice(i, 1);
          this.stopHealing(id);
          continue;
        }
      }
      const healing = this.isHealingTarget(id);
      const valid = this.couldHealTarget(e);
      if (healing && !valid) this.stopHealing(id);
      else if (!healing && valid) this.startHealing(e);
      if (dispense && valid && this.dispenseAmmo(p)) received = true;
    }
    if (dispense) this.nextAmmoDispense = world.curtime + (received ? DISPENSER.ammoInterval : 0.1);
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.dispenserState = this.dispenserState;
    out.metal = this.metal;
    let mask = 0;
    for (let i = 0; i < this.healing.length; i++) {
      const id = this.healing[i];
      if (id >= 1 && id <= 32) mask |= 1 << (id - 1);
    }
    out.healTargets = mask >>> 0;
  }
}

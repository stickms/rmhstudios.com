/**
 * The Spy's Sapper (the SDK's CObjectSapper, tf_obj_sapper.cpp): an
 * attachment built on an enemy building's build point
 * (CBaseObject::FindSnapToBuildPos / FindNearestBuildPoint, within
 * tf_obj_max_attach_dist of the spy, in his view cone and line of sight).
 * Built in 0.1 s; then the building is sapped (OnAddSapper → disabled) and
 * SapperThink drains obj_sapper_amount (25) health per second in whole
 * points. Only wrench hits hurt it (TF_DMG_WRENCH_FIX, 65 each: two hits);
 * when it dies the building stays disabled for SAPPER_REMOVE_DISABLE_TIME.
 */

import { emptyTrace, NO_ENTITY } from '../../core/types';
import { MASK_SOLID } from '../../core/constants';
import { angleVectors, copy, set, vec3, type Vec3 } from '../../core/vec';
import { SAPPER } from '../../data';
import { OBJ_ATTACHMENT_SAPPER } from '../building-api';
import {
  createDamageInfo,
  DMG_CRUSH,
  resetDamageInfo,
  TF_DMG_WRENCH_FIX,
  type DamageInfo,
} from '../damage';
import {
  COLLISION_GROUP_NONE,
  DAMAGE_YES,
  EF_NODRAW,
  FSOLID_NOT_SOLID,
  SOLID_NONE,
} from '../entity';
import type { NetRecord, NetSchema } from '../net-schema';
import type { Player } from '../player';
import { objectsOf, TFBaseObject } from './base-object';
import { NET_SAPPER } from './net';

/** CBasePlayer::m_flFieldOfView: build points must be within this cosine of the view (2D). */
const PLAYER_FIELD_OF_VIEW = 0.766;
const SAPPER_THINK = SAPPER.thinkInterval;
const MODEL_PLACEMENT = 'models/weapons/c_models/c_sapper/c_sapper.mdl';
const MODEL_PLACED = 'models/buildables/sapper_placed.mdl';
const SAPPER_SIZE_MIN: Vec3 = { x: 0, y: 0, z: 0 };
const SAPPER_SIZE_MAX: Vec3 = { x: 1, y: 1, z: 1 };

const sEye = vec3();
const sPoint = vec3();
const sFwd = vec3();
const sAng = vec3();
const losTrace = emptyTrace();
const drainInfo = createDamageInfo();

export class ObjectSapper extends TFBaseObject {
  readonly objectType = OBJ_ATTACHMENT_SAPPER;
  readonly baseHealth = SAPPER.health;
  readonly objMins = SAPPER_SIZE_MIN;
  readonly objMaxs = SAPPER_SIZE_MAX;

  /** m_hBuiltOnEntity. */
  builtOn: number = NO_ENTITY;
  private damageAccumulator = 0;
  private lastThinkTime = 0;

  constructor(classname = 'obj_attachment_sapper') {
    super(classname);
  }

  override netSchema(): NetSchema | null {
    return NET_SAPPER;
  }

  override get killIcon(): string {
    return 'obj_attachment_sapper';
  }

  /** The sapper has one level and no upgrades. */
  override maxHealthForCurrentLevel(): number {
    return this.baseHealth;
  }

  override canBeUpgraded(): boolean {
    return false;
  }

  /** SDK: CObjectSapper::Spawn — not solid, hidden until it snaps to a build point. */
  protected override onRespawnObject(): void {
    this.model = MODEL_PLACEMENT;
    this.solid = SOLID_NONE;
    this.effects |= EF_NODRAW;
  }

  protected override onStartPlacement(): void {
    this.solid = SOLID_NONE;
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.effects |= EF_NODRAW;
  }

  /** The building it's on. */
  target(): TFBaseObject | null {
    const e = this.world.entity(this.builtOn);
    return e instanceof TFBaseObject && !e.removed ? e : null;
  }

  /** The attachment point on a building (its "build_point_0": the hull centre). */
  static buildPoint(o: TFBaseObject, out: Vec3): Vec3 {
    return o.worldSpaceCenter(out);
  }

  /**
   * SDK: CBaseObject::FindSnapToBuildPos / FindNearestBuildPoint — the nearest enemy
   * building with a free build point within reach, in view and in line of sight.
   * `only` restricts it to one building (sapping a teleporter's other end).
   */
  updateAttachmentPlacement(only: TFBaseObject | null = null): boolean {
    const spy = this.builderPlayer();
    this.placementOk = false;
    this.builtOn = NO_ENTITY;
    if (!spy) return false;
    const world = this.world;
    let best: number = SAPPER.maxAttachDistance;
    let found: TFBaseObject | null = null;
    spy.eyePosition(sEye);
    set(sAng, 0, spy.eyeAngles.y, 0);
    angleVectors(sAng, sFwd);
    const list = objectsOf(world);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (only && o !== only) continue;
      if (o.removed || o === this || o.placing || o.carried || o.dying) continue;
      if (o.objectType === OBJ_ATTACHMENT_SAPPER || o.team === this.team) continue;
      if (o.sapped || o.sapperId !== NO_ENTITY) continue;
      ObjectSapper.buildPoint(o, sPoint);
      if (!only) {
        // FInViewCone (2D) and an unobstructed line from the eye (players don't block).
        let lx = sPoint.x - sEye.x;
        let ly = sPoint.y - sEye.y;
        const ll = Math.hypot(lx, ly);
        if (ll > 0) {
          lx /= ll;
          ly /= ll;
        }
        const fl = Math.hypot(sFwd.x, sFwd.y) || 1;
        if ((lx * sFwd.x + ly * sFwd.y) / fl <= PLAYER_FIELD_OF_VIEW) continue;
        const f = world.entityFilterObject(spy, COLLISION_GROUP_NONE);
        f.ignorePlayers = true;
        world.traceLine(sEye, sPoint, MASK_SOLID, f.fn, losTrace);
        if (losTrace.entity !== o.id && losTrace.fraction !== 1) continue;
      }
      const d = Math.hypot(
        sPoint.x - spy.origin.x,
        sPoint.y - spy.origin.y,
        sPoint.z - spy.origin.z,
      );
      if (only || d < best) {
        best = d;
        found = o;
      }
    }
    if (!found) {
      this.effects |= EF_NODRAW;
      return false;
    }
    this.effects &= ~EF_NODRAW;
    this.builtOn = found.id;
    ObjectSapper.buildPoint(found, this.buildOrigin);
    copy(this.origin, this.buildOrigin);
    copy(this.angles, found.angles);
    this.placementOk = true;
    return true;
  }

  /** Attachments place by snapping, not by the ground search. */
  override updatePlacement(): boolean {
    return this.updateAttachmentPlacement();
  }

  /** SDK: CObjectSapper — attach to the building, then build (0.1 s). */
  attachAndBuild(spy: Player): boolean {
    const target = this.target();
    if (!target || target.sapperId !== NO_ENTITY) {
      this.stopPlacement();
      return false;
    }
    target.sapperId = this.id;
    this.setParent(target);
    if (!this.startBuildingChecked(spy)) return false;
    this.solid = SOLID_NONE;
    this.model = MODEL_PLACEMENT;
    return true;
  }

  /** SDK: CObjectSapper::FinishedBuilding / OnGoActive. */
  protected override onGoActive(): void {
    const target = this.target();
    if (!target) {
      this.world.remove(this);
      return;
    }
    this.model = MODEL_PLACED;
    this.solid = SOLID_NONE;
    this.takeDamage = DAMAGE_YES;
    target.onAddSapper(this.id);
    this.world.events.push({
      type: 'object',
      kind: 'sapped',
      object: target.id,
      objectType: target.objectType,
      owner: target.builder,
      attacker: this.builder,
    });
    this.world.emitSound('Weapon_Sapper.Plant', { entity: this.id });
    this.world.emitSound('Weapon_Sapper.Timer', { entity: this.id });
    this.damageAccumulator = 0;
    this.lastThinkTime = this.world.curtime;
    this.setContextThinkIn(SAPPER_THINK);
  }

  /** The sapper's builder is a spy; it never needs the engineer checks. */
  protected override checkBuilder(): boolean {
    const b = this.world.entity(this.builder);
    if (!b || !b.isPlayer()) {
      this.world.remove(this);
      return false;
    }
    return super.checkBuilder();
  }

  /** SDK: CObjectSapper::SapperThink. */
  protected override contextThink(): void {
    if (this.building || this.placing) return;
    const world = this.world;
    const target = this.target();
    if (!target) {
      world.remove(this);
      return;
    }
    if (target.dying) return;
    const dt = world.curtime - this.lastThinkTime;
    this.damageAccumulator += dt * SAPPER.damagePerSecond;
    const dmg = Math.trunc(this.damageAccumulator);
    this.damageAccumulator -= dmg;
    this.lastThinkTime = world.curtime;
    this.setContextThinkIn(SAPPER_THINK);
    if (dmg > 0) {
      const info = drainInfo;
      resetDamageInfo(info);
      // The sapper does it; the spy is the scorer (GetDeathScorer of an object attacker).
      info.attacker = this.builder;
      info.inflictor = this.id;
      info.damage = dmg;
      info.damageType = DMG_CRUSH;
      info.killIcon = 'obj_attachment_sapper';
      copy(info.position, this.origin);
      world.applyDamage(target, info);
    }
  }

  /** SDK: CObjectSapper::OnTakeDamage — only a wrench's TF_DMG_WRENCH_FIX hurts it. */
  override onTakeDamage(info: DamageInfo): number {
    if (info.customKill !== TF_DMG_WRENCH_FIX) return 0;
    return super.onTakeDamage(info);
  }

  /** SDK: CObjectSapper::Killed — the building stays disabled for a moment. */
  override onKilled(info: DamageInfo): void {
    const target = this.target();
    if (target) target.setPlasmaDisabled(SAPPER.removeDisableTime);
    super.onKilled(info);
  }

  /** No metal gibs for a sapper; Weapon_Sapper.Removed + its effect come from Explode. */
  protected override createObjectGibs(): void {}

  /** SDK: UpdateOnRemove → DetachObjectFromObject → OnRemoveSapper. */
  override onRemove(): void {
    this.world.events.push({
      type: 'sound',
      name: 'Weapon_Sapper.Timer',
      entity: this.id,
      channel: 0,
      stop: true,
    });
    const target = this.target();
    if (target && target.sapperId === this.id) target.onRemoveSapper();
    super.onRemove();
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.target = this.builtOn;
  }
}

/**
 * The Engineer's and Spy's building tools:
 *
 * - tf_weapon_pda_engineer_build (CTFWeaponPDA_Engineer_Build, slot 4): shows
 *   the build menu; the HUD's choice arrives as a `BuildCommand` through
 *   `selectBuilding`. Attack1 puts it away (SelectLastItem), attack2 is the
 *   class special skill (pick up a building).
 * - tf_weapon_pda_engineer_destroy (slot 5): `destroyBuilding` detonates one.
 * - tf_weapon_builder (CTFWeaponBuilder, tf_weapon_builder.cpp): holds the
 *   blueprint — attack1 places it (StartBuilding), attack2 turns it 90° —
 *   or the carried building; for the Spy it is the sapper (slot 2, the
 *   sapper's objects.txt SelectionSlot), which snaps to enemy buildings and
 *   stays out for the next one (OF_ALLOW_REPEAT_PLACEMENT).
 */

import { IN_ATTACK, IN_ATTACK2, TF_CLASS_ENGINEER } from '../../core/constants';
import type { UserCmd } from '../../core/types';
import { NO_ENTITY } from '../../core/types';
import { BUILDING, STOCK_WEAPONS } from '../../data';
import {
  OBJ_ATTACHMENT_SAPPER,
  OBJ_DISPENSER,
  OBJ_SENTRYGUN,
  OBJ_TELEPORTER,
} from '../building-api';
import { TF_COND } from '../conditions';
import { hookInt, hookPlayer } from '../items/attributes';
import { GR_STATE_TEAM_WIN } from '../rules';
import {
  BaseWeapon,
  defaultWeaponStats,
  SLOT_BUILDING,
  SLOT_PDA,
  SLOT_PDA2,
  type Weapon,
  type WeaponSpec,
  type WeaponStats,
} from '../weapon-api';
import type { NetRecord } from '../net-schema';
import type { Player } from '../player';
import { OBJECT_CONSTRUCTION_STARTINGHEALTH } from '../building-api';
import { OBJECT_INFO_BY_TYPE, TFBaseObject } from './base-object';
import { ObjectSapper } from './sapper';
import { ObjectTeleporter } from './teleporter';
import {
  canBuild,
  carriedObjectOf,
  CB_CAN_BUILD,
  detonateObjectOfType,
  doEngineerSpecialSkill,
  selectLastItem,
  startBuildingObjectOfType,
  switchOwnersWeaponToLast,
  type BuildCommand,
  type BuilderWeaponLike,
} from './player-objects';

/** CTFWeaponBuilder build states (BS_*). */
export const BS_IDLE = 0;
export const BS_SELECTING = 1;
export const BS_PLACING = 2;
export const BS_PLACING_INVALID = 3;

/** CTFWeaponBuilder::Deploy: the first placement waits this long. */
const BUILDER_DEPLOY_ATTACK_DELAY = 0.35;
/** PrimaryAttack / SecondaryAttack refire. */
const BUILDER_REFIRE = 0.2;
/** The invalid-placement deny sound repeats at most this often. */
const DENY_SOUND_DELAY = 0.5;
/** CTFWeaponPDA::SecondaryAttack refire. */
const PDA_SECONDARY_DELAY = 0.5;

const statsFor = (spec: WeaponSpec, over: Partial<WeaponStats>): WeaponStats =>
  defaultWeaponStats({
    ...spec.stats,
    classname: spec.classname,
    defindex: spec.defindex,
    slot: spec.slot,
    ...over,
  });

/** CTFWeaponPDA: attack1 puts the PDA away, attack2 is the class special skill. */
export abstract class EngineerPda extends BaseWeapon {
  primaryAttack(_cmd: UserCmd): void {
    const owner = this.owner;
    if (!owner) return;
    selectLastItem(owner);
    this.nextPrimaryAttack = this.curtime + BUILDER_REFIRE;
  }

  /** SDK: CTFWeaponPDA::SecondaryAttack. */
  override secondaryAttack(_cmd: UserCmd): void {
    if (this.inAttack2) return;
    const owner = this.owner;
    if (!owner) return;
    doEngineerSpecialSkill(owner);
    this.nextSecondaryAttack = this.curtime + PDA_SECONDARY_DELAY;
  }
}

/** tf_weapon_pda_engineer_build. */
export class PdaEngineerBuild extends EngineerPda {
  private lastButtons = 0;

  constructor(spec: WeaponSpec) {
    super(statsFor(spec, { slot: SLOT_PDA, weaponId: 46 }));
  }

  /** The HUD's build menu choice (the "build <type> <mode>" command). */
  selectBuilding(cmd: BuildCommand): boolean {
    const owner = this.owner;
    if (!owner) return false;
    if (cmd.action === 'destroy')
      return detonateObjectOfType(owner, cmd.objectType, cmd.objectMode ?? 0);
    return startBuildingObjectOfType(owner, cmd.objectType, cmd.objectMode ?? 0);
  }

  /**
   * Every stock Engineer weapon's attack2 is DoClassSpecialSkill (pick up a building:
   * CTFWeaponBaseGun / CTFWeaponBaseMelee::SecondaryAttack). The PDA, always in the
   * loadout, does it for whatever weapon is out; a weapon that calls
   * `doEngineerSpecialSkill` itself is harmless (a second call finds the building
   * already carried).
   */
  override itemHolsterFrame(cmd: UserCmd): void {
    const owner = this.owner;
    const pressed = cmd.buttons & ~this.lastButtons;
    this.lastButtons = cmd.buttons;
    if (!owner || !(pressed & IN_ATTACK2) || owner.playerClass !== TF_CLASS_ENGINEER) return;
    const active = owner.activeWeapon();
    if (!active || active instanceof EngineerPda || active instanceof WeaponBuilder) return;
    doEngineerSpecialSkill(owner);
  }

  override itemPostFrame(cmd: UserCmd): void {
    this.lastButtons = cmd.buttons;
    super.itemPostFrame(cmd);
  }
}

/** tf_weapon_pda_engineer_destroy. */
export class PdaEngineerDestroy extends EngineerPda {
  constructor(spec: WeaponSpec) {
    super(statsFor(spec, { slot: SLOT_PDA2, weaponId: 47 }));
  }

  /** The HUD's destroy menu choice (the "destroy <type> <mode>" command). */
  destroyBuilding(cmd: Pick<BuildCommand, 'objectType' | 'objectMode'>): boolean {
    const owner = this.owner;
    if (!owner) return false;
    return detonateObjectOfType(owner, cmd.objectType, cmd.objectMode ?? 0);
  }
}

/** tf_weapon_builder (CTFWeaponBuilder) — and, in sapper mode, the Spy's tf_weapon_sapper. */
export class WeaponBuilder extends BaseWeapon implements BuilderWeaponLike {
  readonly isBuilderWeapon = true as const;
  /** m_iObjectType (-1 until the build menu picks one) and m_iObjectMode. */
  objectType: number;
  objectMode = 0;
  /** m_iBuildState. */
  buildState = BS_IDLE;
  /** m_hObjectBeingBuilt. */
  objectBeingBuilt: number = NO_ENTITY;
  private nextDenySound = 0;
  readonly sapperMode: boolean;

  constructor(spec: WeaponSpec, sapper: boolean) {
    const slot = sapper ? OBJECT_INFO_BY_TYPE[OBJ_ATTACHMENT_SAPPER].selectionSlot : SLOT_BUILDING;
    super(statsFor(spec, { slot, weaponId: 49 }));
    this.sapperMode = sapper;
    this.objectType = sapper ? OBJ_ATTACHMENT_SAPPER : -1;
  }

  /** CTFWeaponBuilder::CanBuildObjectType. */
  canBuildObjectType(objectType: number): boolean {
    if (this.sapperMode) return objectType === OBJ_ATTACHMENT_SAPPER;
    return (
      objectType === OBJ_SENTRYGUN || objectType === OBJ_DISPENSER || objectType === OBJ_TELEPORTER
    );
  }

  /** SDK: CTFWeaponBuilder::SetSubType. */
  setSubType(objectType: number): void {
    if (this.canBuildObjectType(objectType)) this.objectType = objectType;
  }

  setObjectMode(mode: number): void {
    this.objectMode = mode;
  }

  /** The blueprint (or carried building) in hand. */
  objectInHand(): TFBaseObject | null {
    const owner = this.owner;
    if (!owner) return null;
    const e = owner.world.entity(this.objectBeingBuilt);
    return e instanceof TFBaseObject && e.builder === owner.id ? e : null;
  }

  /** SDK: CTFWeaponBuilder::CanDeploy. */
  override canDeploy(): boolean {
    const owner = this.owner;
    if (!owner) return false;
    if (carriedObjectOf(owner)) return true;
    if (this.objectType < 0) return false;
    return canBuild(owner, this.objectType, this.objectMode) === CB_CAN_BUILD;
  }

  /** SDK: CTFWeaponBuilder::Deploy. */
  override deploy(): boolean {
    if (!super.deploy()) return false;
    this.buildState = BS_PLACING;
    this.startPlacement();
    this.nextPrimaryAttack = this.curtime + BUILDER_DEPLOY_ATTACK_DELAY;
    this.nextSecondaryAttack = this.curtime;
    this.nextDenySound = 0;
    return true;
  }

  /** SDK: CTFWeaponBuilder::Holster — not while carrying a building. */
  override holster(next: Weapon | null): boolean {
    const owner = this.owner;
    if (!owner) return false;
    if (carriedObjectOf(owner) && next !== null) return false;
    if (this.buildState === BS_PLACING || this.buildState === BS_PLACING_INVALID)
      this.buildState = BS_IDLE;
    this.stopPlacement();
    return super.holster(next);
  }

  override canHolster(): boolean {
    const owner = this.owner;
    return !owner || !carriedObjectOf(owner);
  }

  /** Carrying a building slows the Engineer to 90 % (CTFPlayer::TeamFortress_CalculateMaxSpeed). */
  override speedMod(): number {
    const owner = this.owner;
    if (owner && !this.sapperMode && carriedObjectOf(owner)) return BUILDING.carrySpeedMult;
    return this.stats.speedMod;
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    const o = this.objectInHand();
    if (o && !o.carried) this.stopPlacement();
    this.objectBeingBuilt = NO_ENTITY;
    this.buildState = BS_IDLE;
  }

  /** SDK: CTFWeaponBuilder::StartPlacement — a new blueprint, or the carried building. */
  startPlacement(): void {
    this.stopPlacement();
    const owner = this.owner;
    if (!owner || !owner.world.isServer) return;
    const carried = carriedObjectOf(owner);
    let obj: TFBaseObject;
    if (carried) {
      obj = carried;
      obj.respawnObject();
      obj.startPlacement(owner);
    } else {
      if (this.objectType < 0) return;
      const info = OBJECT_INFO_BY_TYPE[this.objectType];
      const mode = this.objectMode;
      const e = owner.world.spawnEntity(info.className, (ent) => {
        const o = ent as TFBaseObject;
        o.builder = owner.id;
        o.owner = owner.id;
        o.team = owner.team;
        o.objectMode = mode;
        o.placing = true;
      });
      if (!(e instanceof TFBaseObject)) {
        owner.world.remove(e);
        return;
      }
      obj = e;
      obj.startPlacement(owner);
      obj.health = OBJECT_CONSTRUCTION_STARTINGHEALTH;
    }
    this.objectBeingBuilt = obj.id;
  }

  /** SDK: CTFWeaponBuilder::StopPlacement — the blueprint goes; a carried building stays carried. */
  stopPlacement(): void {
    const owner = this.owner;
    const obj = this.objectInHand();
    this.objectBeingBuilt = NO_ENTITY;
    if (!obj || obj.removed) return;
    if (obj.carried) {
      if (owner) obj.makeCarriedObject(owner);
    } else if (obj.placing) obj.stopPlacement();
  }

  /** SDK: CTFWeaponBuilder::IsValidPlacement. */
  isValidPlacement(): boolean {
    const obj = this.objectInHand();
    if (!obj) return false;
    return obj.updatePlacement();
  }

  /** SDK: CTFWeaponBuilder::UpdatePlacementState. */
  updatePlacementState(): void {
    const valid = this.isValidPlacement();
    if (this.buildState === BS_PLACING || this.buildState === BS_PLACING_INVALID) {
      this.buildState = valid ? BS_PLACING : BS_PLACING_INVALID;
    }
  }

  /** SDK: CTFWeaponBuilder::ItemPostFrame. */
  override itemPostFrame(cmd: UserCmd): void {
    const owner = this.owner;
    if (!owner) return;
    const world = owner.world;
    const t = this.curtime;
    if (
      this.objectBeingBuilt !== NO_ENTITY &&
      world.rules.state === GR_STATE_TEAM_WIN &&
      owner.team !== world.rules.winningTeam
    ) {
      this.stopPlacement();
      return;
    }
    if (
      this.objectType < 0 ||
      (!carriedObjectOf(owner) &&
        canBuild(owner, this.objectType, this.objectMode) !== CB_CAN_BUILD)
    ) {
      switchOwnersWeaponToLast(owner);
      return;
    }
    // The blueprint vanished under us (round restart CleanUpMap): forget it and take out a new one.
    if (this.objectBeingBuilt !== NO_ENTITY && !this.objectInHand())
      this.objectBeingBuilt = NO_ENTITY;
    if (
      world.isServer &&
      this.objectBeingBuilt === NO_ENTITY &&
      (this.buildState === BS_PLACING || this.buildState === BS_PLACING_INVALID)
    ) {
      this.startPlacement();
    }
    // The client moves the blueprint every frame; the server does too so validity is current.
    this.updatePlacementState();
    if (cmd.buttons & IN_ATTACK && this.nextPrimaryAttack <= t) this.primaryAttack(cmd);
    if (owner.activeWeapon() !== this) return;
    // mark_for_death_on_building_pickup (the Rescue Ranger): marked while carrying, renewed each frame.
    if (carriedObjectOf(owner) && hookInt(hookPlayer(owner, 'mark_for_death_on_building_pickup', 0))) {
      owner.cond.add(TF_COND.MARKEDFORDEATH_SILENT, 3);
    }
    if (cmd.buttons & IN_ATTACK2) {
      if (this.nextSecondaryAttack <= t) this.secondaryAttack(cmd);
    } else this.inAttack2 = false;
  }

  /** SDK: CTFWeaponBuilder::PrimaryAttack. */
  primaryAttack(_cmd: UserCmd): void {
    const owner = this.owner;
    if (!owner) return;
    const world = owner.world;
    if (owner.cannotAttack() || owner.cond.has(TF_COND.STEALTHED)) return;
    this.updatePlacementState();
    switch (this.buildState) {
      case BS_IDLE:
        this.buildState = BS_SELECTING;
        break;
      case BS_SELECTING:
        return;
      case BS_PLACING: {
        const obj = this.objectInHand();
        if (!obj || !world.isServer) break;
        this.objectBeingBuilt = NO_ENTITY;
        if (this.sapperMode && obj instanceof ObjectSapper) {
          const target = obj.target();
          if (obj.attachAndBuild(owner)) {
            owner.doAnimationEvent(2 /* PLAYERANIMEVENT_ATTACK_GRENADE */);
            // Sapping a teleporter saps its other end too.
            if (target instanceof ObjectTeleporter) {
              const other = target.matching();
              if (other && !other.sapped && other.sapperId === NO_ENTITY) {
                this.startPlacement();
                const second = this.objectInHand();
                this.objectBeingBuilt = NO_ENTITY;
                if (second instanceof ObjectSapper) {
                  if (second.updateAttachmentPlacement(other)) second.attachAndBuild(owner);
                  else second.stopPlacement();
                }
              }
            }
          }
          // OF_ALLOW_REPEAT_PLACEMENT: a fresh sapper, ready for the next building.
          this.buildState = BS_PLACING;
          this.startPlacement();
        } else {
          obj.startBuildingChecked(owner);
          switchOwnersWeaponToLast(owner);
        }
        break;
      }
      case BS_PLACING_INVALID:
        if (this.nextDenySound < this.curtime) {
          world.emitSound('Player.DenyWeaponSelection', { entity: owner.id, to: owner.id });
          this.nextDenySound = this.curtime + DENY_SOUND_DELAY;
        }
        break;
    }
    this.nextPrimaryAttack = this.curtime + BUILDER_REFIRE;
  }

  /** SDK: CTFWeaponBuilder::SecondaryAttack — rotate the blueprint (engineers) or the special skill. */
  override secondaryAttack(_cmd: UserCmd): void {
    if (this.inAttack2) return;
    this.inAttack2 = true;
    const owner = this.owner;
    if (!owner) return;
    this.updatePlacementState();
    if (owner.playerClass !== TF_CLASS_ENGINEER) {
      // The spy's special skill (cloak) belongs to the invis watch.
    } else if (this.buildState === BS_PLACING || this.buildState === BS_PLACING_INVALID) {
      const obj = this.objectInHand();
      if (obj) obj.rotateBuildAngles();
    } else doEngineerSpecialSkill(owner);
    this.nextSecondaryAttack = this.curtime + BUILDER_REFIRE;
  }

  /** Weapon state for prediction / the HUD: aux0 type, aux1 mode, aux2 build state, aux3 the blueprint. */
  protected override writeNetExtra(out: NetRecord): void {
    out.aux0 = this.objectType;
    out.aux1 = this.objectMode;
    out.aux2 = this.buildState;
    out.aux3 = this.objectBeingBuilt;
  }

  protected override readNetExtra(rec: NetRecord): void {
    this.objectType = rec.aux0 as number;
    this.objectMode = rec.aux1 as number;
    this.buildState = rec.aux2 as number;
    this.objectBeingBuilt = rec.aux3 as number;
  }
}

/** Is this tf_weapon_builder item the Spy's sapper (by its item definition)? */
export function isSapperItem(defindex: number): boolean {
  const item = STOCK_WEAPONS[defindex];
  return defindex === 735 || (!!item && !!item.perClass.spy && !item.perClass.engineer);
}

/** The builder a player holds for an object type (convenience for HUD wiring). */
export function builderOf(player: Player): WeaponBuilder | null {
  for (const w of player.weapons) if (w instanceof WeaponBuilder && !w.sapperMode) return w;
  return null;
}

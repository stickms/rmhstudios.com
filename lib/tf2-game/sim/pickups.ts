/**
 * Pickups: health kits and ammo packs placed by the map (CTFPowerup →
 * CHealthKit / CAmmoPack, entity_healthkit.cpp, entity_ammopack.cpp,
 * tf_powerup.cpp) and the ammo box a dead player drops (CTFAmmoPack,
 * tf_ammo_pack.cpp).
 *
 * Map pickups give PackRatios[size] (20 % / 50 % / 100 %) of max health or
 * of max ammo and metal, then hide and respawn after ITEM_RESPAWN_TIME (10 s).
 * Touching uses the item's box bloated by ITEM_PICKUP_BOX_BLOAT (24 units,
 * not below — CCollisionProperty::WorldSpaceTriggerBounds).
 */

import { FL_ONGROUND, MOVETYPE_FLYGRAVITY, MOVETYPE_NONE, TF_CLASS_ENGINEER } from '../core/constants';
import { set, vec3, type Vec3 } from '../core/vec';
import {
  COLLISION_GROUP_DEBRIS,
  COLLISION_GROUP_WEAPON,
  EF_NODRAW,
  Entity,
  FSOLID_NOT_SOLID,
  FSOLID_TRIGGER,
  MOVECOLLIDE_FLY_BOUNCE,
  SOLID_BBOX,
} from './entity';
import { registerEntityClass } from './entity-registry';
import { NET_PICKUP, type NetRecord, type NetSchema } from './net-schema';
import { TF_COND } from './conditions';
import type { Player } from './player';
import { TF_AMMO_GRENADES1, TF_AMMO_METAL, TF_AMMO_PRIMARY, TF_AMMO_SECONDARY } from './weapon-api';
import { hookPlayer } from './items/attributes';

/** PackRatios[POWERUP_SIZES] (tf_powerup.cpp): small, medium, full. */
export const PACK_RATIOS = [0.2, 0.5, 1.0] as const;
export const POWERUP_SMALL = 0;
export const POWERUP_MEDIUM = 1;
export const POWERUP_FULL = 2;
/** ITEM_RESPAWN_TIME (tf_gamerules.cpp, CTFGameRules::FlItemRespawnTime). */
export const ITEM_RESPAWN_TIME = 10;
/** ITEM_PICKUP_BOX_BLOAT (item_world.cpp). */
export const ITEM_PICKUP_BOX_BLOAT = 24;
/** SF_NORESPAWN (items.h). */
export const SF_NORESPAWN = 1 << 30;

/** Approximate model bounds per size (healthkit / ammopack .mdl hull boxes). */
const ITEM_BOUNDS: ReadonlyArray<readonly [Vec3, Vec3]> = [
  [vec3(-9, -9, 0), vec3(9, 9, 10)],
  [vec3(-13, -13, 0), vec3(13, 13, 16)],
  [vec3(-17, -17, 0), vec3(17, 17, 24)],
];

const triggerMins = vec3();
const triggerMaxs = vec3();

/** SDK: CTFPowerup over CItem. */
export abstract class TFPowerup extends Entity {
  disabled = false;
  respawning = false;
  autoMaterialize = true;
  /** POWERUP_SMALL / MEDIUM / FULL. */
  abstract readonly size: number;

  override spawn(): void {
    super.spawn();
    this.disabled = this.kvBool('StartDisabled');
    this.autoMaterialize = this.kvBool('AutoMaterialize', true);
    this.solid = SOLID_BBOX;
    this.solidFlags = FSOLID_NOT_SOLID | FSOLID_TRIGGER;
    this.collisionGroup = COLLISION_GROUP_WEAPON;
    this.moveType = MOVETYPE_NONE;
    const [mn, mx] = ITEM_BOUNDS[this.size];
    this.setSize(mn, mx);
    if (this.disabled) this.effects |= EF_NODRAW;
    if (!this.model) this.model = this.defaultModel();
    this.world.registerTrigger(this);
  }

  abstract defaultModel(): string;

  wantsToucher(other: Entity): boolean {
    return other.isPlayer();
  }

  /** Bloated trigger bounds. */
  touchesBox(mins: Vec3, maxs: Vec3): boolean {
    if (this.disabled || this.respawning) return false;
    const b = ITEM_PICKUP_BOX_BLOAT;
    triggerMins.x = this.origin.x + this.mins.x - b;
    triggerMins.y = this.origin.y + this.mins.y - b;
    triggerMins.z = this.origin.z + this.mins.z;
    triggerMaxs.x = this.origin.x + this.maxs.x + b;
    triggerMaxs.y = this.origin.y + this.maxs.y + b;
    triggerMaxs.z = this.origin.z + this.maxs.z + b;
    return (
      mins.x < triggerMaxs.x &&
      maxs.x > triggerMins.x &&
      mins.y < triggerMaxs.y &&
      maxs.y > triggerMins.y &&
      mins.z < triggerMaxs.z &&
      maxs.z > triggerMins.z
    );
  }

  override isTrigger(): boolean {
    return true;
  }

  /** SDK: CTFPowerup::ValidTouch. */
  validTouch(p: Player): boolean {
    if (this.disabled || this.respawning) return false;
    if (!p.alive) return false;
    if (this.team && p.team !== this.team) return false;
    return true;
  }

  /** SDK: CItem::ItemTouch → MyTouch → Respawn. */
  override touch(other: Entity): void {
    if (!other.isPlayer()) return;
    const p = other as Player;
    if (!this.validTouch(p)) return;
    if (!this.myTouch(p)) return;
    this.fireOutput('OnPlayerTouch', p);
    this.world.events.push({ type: 'pickup', player: p.id, item: this.classname });
    if (this.hasSpawnFlags(SF_NORESPAWN)) this.world.remove(this);
    else this.respawn();
  }

  /** Gives the pickup; true when something was taken. */
  abstract myTouch(p: Player): boolean;

  /** SDK: CTFPowerup::Respawn — hide and come back in ITEM_RESPAWN_TIME. */
  respawn(): void {
    this.respawning = true;
    this.effects |= EF_NODRAW;
    this.setThink(this.materialize, this.world.curtime + ITEM_RESPAWN_TIME);
  }

  /** SDK: CTFPowerup::Materialize. */
  readonly materialize = (): void => {
    this.setThink(null, -1);
    if (!this.autoMaterialize) return;
    if (!this.disabled && this.effects & EF_NODRAW) {
      this.effects &= ~EF_NODRAW;
      this.world.emitSound('Item.Materialize', { entity: this.id });
    }
    this.respawning = false;
  };

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled) this.effects |= EF_NODRAW;
    else if (!this.respawning) this.effects &= ~EF_NODRAW;
    else if (!this.autoMaterialize) {
      this.effects &= ~EF_NODRAW;
      this.respawning = false;
    }
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.setDisabled(false);
        return true;
      case 'disable':
        this.setDisabled(true);
        return true;
      case 'toggle':
        this.setDisabled(!this.disabled);
        return true;
      case 'roundspawn':
      case 'roundactivate':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override onRemove(): void {
    this.world.unregisterTrigger(this);
  }

  override netSchema(): NetSchema | null {
    return NET_PICKUP;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.hidden = (this.effects & EF_NODRAW) !== 0;
  }
}

/** item_healthkit_small / _medium / _full (CHealthKit::MyTouch). */
export class HealthKit extends TFPowerup {
  readonly size: number;

  constructor(classname: string) {
    super(classname);
    this.size = classname.endsWith('small') ? POWERUP_SMALL : classname.endsWith('medium') ? POWERUP_MEDIUM : POWERUP_FULL;
  }

  defaultModel(): string {
    return ['models/items/medkit_small.mdl', 'models/items/medkit_medium.mdl', 'models/items/medkit_large.mdl'][this.size];
  }

  myTouch(p: Player): boolean {
    // × mult_health_frompacks on the player (the Back Scratcher).
    const amount = hookPlayer(p, 'mult_health_frompacks', Math.ceil(p.maxHealth * PACK_RATIOS[this.size]));
    const given = p.takeHealth(amount);
    const burning = p.cond.has(TF_COND.BURNING) || p.cond.has(TF_COND.BLEEDING);
    if (given > 0 || burning) {
      // Health kits extinguish and stop bleeding (CTFPlayerShared::HealthKitPickupEffects).
      p.extinguish();
      p.cond.remove(TF_COND.BLEEDING);
      this.world.emitSound('HealthKit.Touch', { entity: p.id, to: p.id });
      this.world.events.push({ type: 'healed', patient: p.id, healer: 0, amount: given });
      return true;
    }
    return false;
  }
}

/** item_ammopack_small / _medium / _full (CAmmoPack::MyTouch). */
export class AmmoPack extends TFPowerup {
  readonly size: number;

  constructor(classname: string) {
    super(classname);
    this.size = classname.endsWith('small') ? POWERUP_SMALL : classname.endsWith('medium') ? POWERUP_MEDIUM : POWERUP_FULL;
  }

  defaultModel(): string {
    return ['models/items/ammopack_small.mdl', 'models/items/ammopack_medium.mdl', 'models/items/ammopack_large.mdl'][this.size];
  }

  myTouch(p: Player): boolean {
    const ratio = PACK_RATIOS[this.size];
    let ok = false;
    if (p.giveAmmo(Math.ceil(p.maxAmmo[TF_AMMO_PRIMARY] * ratio), TF_AMMO_PRIMARY) > 0) ok = true;
    if (p.giveAmmo(Math.ceil(p.maxAmmo[TF_AMMO_SECONDARY] * ratio), TF_AMMO_SECONDARY) > 0) ok = true;
    if (p.giveAmmo(Math.ceil(p.maxAmmo[TF_AMMO_METAL] * ratio), TF_AMMO_METAL) > 0) ok = true;
    if (p.cloakMeter < 100) {
      p.cloakMeter = Math.min(100, p.cloakMeter + 100 * ratio);
      ok = true;
    }
    if (p.playerClass === TF_CLASS_ENGINEER) {
      if (p.giveAmmo(Math.ceil(p.maxAmmo[TF_AMMO_GRENADES1] * ratio), TF_AMMO_GRENADES1) > 0) ok = true;
    }
    if (ok) this.world.emitSound('AmmoPack.Touch', { entity: p.id, to: p.id });
    return ok;
  }
}

for (const s of ['small', 'medium', 'full']) {
  registerEntityClass(`item_healthkit_${s}`, HealthKit);
  registerEntityClass(`item_ammopack_${s}`, AmmoPack);
}

/** tf_ammo_pack lifetime (CTFAmmoPack::Spawn "DieContext"). */
export const TF_AMMO_PACK_LIFETIME = 30;
/** Seconds before the owner may pick their own pack back up (FlyThink). */
export const TF_AMMO_PACK_OWNER_DELAY = 0.75;

/**
 * A dead player's dropped ammo box (CTFAmmoPack): 50 % of max primary and
 * secondary, the metal the player carried (5–100), falls and bounces,
 * disappears after 30 s.
 */
export class DroppedAmmoPack extends Entity {
  ammoRatio = 0.5;
  metal = 5;
  allowOwnerPickup = false;

  constructor(classname = 'tf_ammo_pack') {
    super(classname);
  }

  override spawn(): void {
    super.spawn();
    this.solid = SOLID_BBOX;
    this.solidFlags = FSOLID_TRIGGER;
    this.collisionGroup = COLLISION_GROUP_DEBRIS;
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.moveCollide = MOVECOLLIDE_FLY_BOUNCE;
    this.elasticity = 0.45;
    this.setSize(vec3(-8, -8, -4), vec3(8, 8, 8));
    if (!this.model) this.model = 'models/items/ammopack_medium.mdl';
    const owner = this.world.entity(this.owner);
    if (owner && owner.isPlayer()) {
      const p = owner as Player;
      this.metal = Math.min(100, Math.max(5, p.ammo[TF_AMMO_METAL]));
    }
    // A small random toss (InitAmmoPack's impulse, applied as velocity).
    const r = this.world.random;
    this.velocity.x += r.randomFloat(-0.25, 0.25) * 100;
    this.velocity.y += r.randomFloat(-0.25, 0.25) * 100;
    this.velocity.z += 100;
    this.spawnTime = this.world.curtime;
    this.setThink(this.flyThink, this.world.curtime + TF_AMMO_PACK_OWNER_DELAY);
    this.world.registerTrigger(this);
  }

  readonly flyThink = (): void => {
    this.allowOwnerPickup = true;
    this.setThink(this.subRemove, this.spawnTime + TF_AMMO_PACK_LIFETIME);
  };

  wantsToucher(other: Entity): boolean {
    return other.isPlayer();
  }

  touchesBox(mins: Vec3, maxs: Vec3): boolean {
    const b = ITEM_PICKUP_BOX_BLOAT;
    return (
      mins.x < this.origin.x + this.maxs.x + b &&
      maxs.x > this.origin.x + this.mins.x - b &&
      mins.y < this.origin.y + this.maxs.y + b &&
      maxs.y > this.origin.y + this.mins.y - b &&
      mins.z < this.origin.z + this.maxs.z + b &&
      maxs.z > this.origin.z + this.mins.z
    );
  }

  /** SDK: CTFAmmoPack::PackTouch. */
  override touch(other: Entity): void {
    if (!other.isPlayer()) {
      if (other === this.world.worldEntity && this.flags & FL_ONGROUND) set(this.velocity, 0, 0, 0);
      return;
    }
    const p = other as Player;
    if (!p.alive) return;
    if (p.id === this.owner && !this.allowOwnerPickup) return;
    let taken = 0;
    taken += p.giveAmmo(Math.ceil(p.maxAmmo[TF_AMMO_PRIMARY] * this.ammoRatio), TF_AMMO_PRIMARY);
    taken += p.giveAmmo(Math.ceil(p.maxAmmo[TF_AMMO_SECONDARY] * this.ammoRatio), TF_AMMO_SECONDARY);
    taken += p.giveAmmo(this.metal, TF_AMMO_METAL);
    if (p.cloakMeter < 100) {
      p.cloakMeter = Math.min(100, p.cloakMeter + 100 * this.ammoRatio);
      taken++;
    }
    if (p.playerClass === TF_CLASS_ENGINEER) {
      taken += p.giveAmmo(Math.ceil(p.maxAmmo[TF_AMMO_GRENADES1] * this.ammoRatio), TF_AMMO_GRENADES1);
    }
    if (taken > 0) {
      this.world.emitSound('AmmoPack.Touch', { entity: p.id, to: p.id });
      this.world.events.push({ type: 'pickup', player: p.id, item: 'tf_ammo_pack' });
      this.world.remove(this);
    }
  }

  override onRemove(): void {
    this.world.unregisterTrigger(this);
  }

  override isTrigger(): boolean {
    return true;
  }

  override netSchema(): NetSchema | null {
    return NET_PICKUP;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.hidden = false;
  }
}

registerEntityClass('tf_ammo_pack', DroppedAmmoPack);

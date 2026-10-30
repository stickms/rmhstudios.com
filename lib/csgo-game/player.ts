/**
 * `CsPlayer`: a CS:GO player on the shared Player (lib/tf2-game/sim/player.ts) — the same command
 * processing (PlayerRunCommand's order: weapon select → movement → weapon frame → triggers), lag
 * compensation, spawning and networking seams — with CS:GO's own body and rules:
 *
 *   - movement: CS_MOVE_PARAMS on the shared playerMove, the weapon's max speed, walking, tagging and
 *     stamina (movement.ts); CS:GO's hull, eyes and hitboxes;
 *   - health 100, kevlar and helmet, money, the defuse kit, the bomb;
 *   - damage by hit group through armor (combat.ts), friendly fire (mp_friendlyfire, with CS:GO's
 *     ff_damage_reduction_bullets 0.33 / _grenade 0.85 / _other 0.4), spawn protection, fall damage;
 *   - weapon slots (primary, pistol, knife, the grenade pouch, the C4), pickup and drop (G, deaths),
 *     buying (the host validates: economy.ts);
 *   - footsteps only when running (shift-walking and crouch-walking are silent), flash blindness, the
 *     defuse (+use at the bomb).
 */

import {
  FL_FROZEN,
  FL_GODMODE,
  FL_ONGROUND,
  IN_SPEED,
  IN_USE,
  MOVETYPE_NONE,
  TICK_INTERVAL,
} from '../tf2-game/core/constants';
import { HITGROUP_GENERIC, HITGROUP_HEAD, NO_ENTITY, type UserCmd } from '../tf2-game/core/types';
import { angleVectors, set, vec3 } from '../tf2-game/core/vec';
import {
  createDamageInfo,
  DMG_BLAST,
  DMG_BULLET,
  DMG_BURN,
  DMG_FALL,
  DMG_SLASH,
  isHeadshot,
  type DamageInfo,
} from '../tf2-game/sim/damage';
import {
  DAMAGE_NO,
  Entity,
  FSOLID_NOT_SOLID,
  LIFE_ALIVE,
  LIFE_DYING,
  SOLID_NONE,
} from '../tf2-game/sim/entity';
import { buildHitboxSet, type Hitbox } from '../tf2-game/sim/hitboxes';
import type { NetRecord, NetSchema } from '../tf2-game/sim/net-schema';
import {
  Player,
  PLAYERANIMEVENT_DIE,
  PLAYERANIMEVENT_JUMP,
  readMoveState,
  writeMoveState,
  type PlayerHull,
} from '../tf2-game/sim/player';
import { GR_STATE_PREROUND } from '../tf2-game/sim/rules';
import {
  SLOT_MELEE,
  SLOT_PDA,
  SLOT_PDA2,
  SLOT_PRIMARY,
  SLOT_SECONDARY,
  WEAPON_SLOTS,
} from '../tf2-game/sim/weapon-api';
import {
  applyArmor,
  decayAimPunch,
  hitGroupMultiplier,
  type AimPunch,
  type ArmorResult,
} from './combat';
import {
  C4_DEFUSE_RANGE,
  C4_DEFUSE_TIME,
  C4_DEFUSE_TIME_KIT,
  CS_MAX_ARMOR,
  CS_MAX_HEALTH,
  CS_PLAYER_CLASS,
  CS_TEAM_CT,
  CS_TEAM_T,
} from './constants';
import { CS_GRENADE_KINDS, csWeaponByDefindex, type CsGrenadeKind } from './data/weapon-data';
import { checkBuy, TEAM_KNIFE, TEAM_PISTOL, TEAM_RIFLE, type BuyContext } from './economy';
import { csEvent } from './events';
import {
  CS_DUCK_VIEW_Z,
  CS_JUMP_IMPULSE,
  CS_MOVE_PARAMS,
  CS_PLAYER_HULL,
  CS_VIEW_Z,
  csFallDamage,
  csMaxSpeed,
  staminaAfterJump,
  staminaAfterLand,
  staminaRecover,
  staminaScale,
  VELOCITY_MODIFIER_RECOVERY,
} from './movement';
import { NET_CS_PLAYER } from './net-schema';
import type { CsWeapon } from './weapons/base';
import { CsC4, type PlantedC4 } from './weapons/c4';
import { CsGrenadePouch } from './weapons/grenades';
import { CsGun } from './weapons/gun';
import { createCsWeapon, createCsWeaponFromInfo } from './weapons/index';
import type { CsWorld } from './world';

/** Friendly fire reductions (VDC cvars ff_damage_reduction_bullets / _grenade / _other). */
export const FF_DAMAGE_REDUCTION_BULLETS = 0.33;
export const FF_DAMAGE_REDUCTION_GRENADE = 0.85;
export const FF_DAMAGE_REDUCTION_OTHER = 0.4;
/** An assist: more than 40 damage to the victim this life (CS:GO's assist rule, the CS:GO wiki). */
export const ASSIST_DAMAGE = 41;
/** Hits of at least this much health damage flinch with the weapon's "large" modifier (clean-room reading). */
export const FLINCH_LARGE_DAMAGE = 40;
/** Landing inaccuracy: the weapon's `inaccuracy land` per unit of landing speed, scaled (clean-room). */
export const LANDING_INACCURACY_SCALE = 0.25;
/** A dropped weapon leaves the hand at this speed (community measurement of the toss). */
export const DROP_SPEED = 250;
/** Running feet carry this far for the bots' hearing (community measurement of footstep range). */
export const FOOTSTEP_NOISE_RANGE = 1100;

/** CS:GO's hitboxes on the shared box model, from its eye heights (64 standing, 46 crouched). */
const CS_HITBOXES_STANDING = buildHitboxSet(CS_VIEW_Z, 0.8, false);
const CS_HITBOXES_CROUCHED = buildHitboxSet(CS_DUCK_VIEW_Z, 0.8, true);

const armorScratch: ArmorResult = { health: 0, armor: 0 };
const deathInfo = createDamageInfo();
const useFwd = vec3();
const useEye = vec3();

export class CsPlayer extends Player {
  money = 0;
  armor = 0;
  helmet = false;
  defuser = false;
  /** The stamina penalty (0 … sv_staminamax). */
  stamina = 0;
  /** Tagging: 1 = full speed. */
  velocityModifier = 1;
  readonly aimPunch: AimPunch = { x: 0, y: 0, vx: 0, vy: 0 };
  /** Flash blindness: when it struck, how long it lasts, how white (0…255). */
  flashAt = -1000;
  flashDuration = 0;
  flashAlpha = 0;
  /** Deathmatch spawn protection until this curtime. */
  immuneUntil = 0;
  /** Last command's buy-zone test (the HUD's buy icon). */
  inBuyZoneNow = false;
  /** Damage dealt to this player this life, by attacker (assists). */
  readonly damageFrom = new Map<number, number>();
  /** The bots' hearing: when this player last made noise and how far it carried. */
  lastNoiseAt = -1000;
  noiseRange = 0;

  constructor(name: string) {
    super(name);
    this.setSize(CS_PLAYER_HULL.min, CS_PLAYER_HULL.max);
    const ctx = this.moveCtx;
    ctx.params = CS_MOVE_PARAMS;
    ctx.onFallDamage = (speed: number) => this.takeFallDamage(speed);
    ctx.onLand = (fallSpeed: number) => this.landed(fallSpeed);
    ctx.onJump = (airDash: boolean) => this.jumped(airDash);
    ctx.onFootstep = (surface: string, volume: number) => this.footstep(surface, volume);
    ctx.onWaterLevelChange = () => {};
    ctx.onChargeEnd = () => {};
  }

  override get hull(): PlayerHull {
    return CS_PLAYER_HULL;
  }

  override standEyeHeight(): number {
    return CS_VIEW_Z;
  }

  override viewOffsetZ(): number {
    if (this.lifeState !== LIFE_ALIVE) return super.viewOffsetZ();
    return this.move.ducked ? CS_DUCK_VIEW_Z : CS_VIEW_Z;
  }

  override hitboxSet(): readonly Hitbox[] {
    return this.move.ducked ? CS_HITBOXES_CROUCHED : CS_HITBOXES_STANDING;
  }

  get cs(): CsWorld {
    return this.world as CsWorld;
  }

  get onGround(): boolean {
    return (this.move.flags & FL_ONGROUND) !== 0;
  }

  override computeMaxHealth(): number {
    return CS_MAX_HEALTH;
  }

  // ─── Movement inputs ──────────────────────────────────────────────────────────────────────

  override computeMaxSpeed(): number {
    const w = this.activeWeapon() as CsWeapon | null;
    const weaponSpeed = w ? w.maxSpeed() : 250;
    return csMaxSpeed(
      weaponSpeed,
      (this.buttons & IN_SPEED) !== 0,
      this.velocityModifier,
      this.stamina,
    );
  }

  override syncMoveInputs(): void {
    super.syncMoveInputs();
    // Planting and defusing hold the player still (CS:GO).
    if (this.planting || this.defusing) this.move.flags |= FL_FROZEN;
    this.moveCtx.jumpImpulseScale = staminaScale(this.stamina);
  }

  private jumped(airDash: boolean): void {
    if (airDash) return;
    this.stamina = staminaAfterJump(this.stamina, CS_JUMP_IMPULSE);
    this.doAnimationEvent(PLAYERANIMEVENT_JUMP);
  }

  private landed(fallSpeed: number): void {
    this.stamina = staminaAfterLand(this.stamina, fallSpeed);
    const w = this.activeWeapon();
    if (w instanceof CsGun)
      w.accuracyPenalty += w.info.inaccuracy.land * fallSpeed * LANDING_INACCURACY_SCALE;
  }

  /** Footsteps only when running: shift-walking and crouch-walking are silent in CS:GO. */
  private footstep(surface: string, volume: number): void {
    if (this.buttons & IN_SPEED || this.move.ducked) return;
    if (!this.world.isServer) return;
    this.makeNoise(FOOTSTEP_NOISE_RANGE);
    this.world.emitSound(
      `${this.team === CS_TEAM_T ? 'T' : 'CT'}_${capitalize(surface || 'default')}.StepLeft`,
      {
        entity: this.id,
        volume,
        predictedBy: this.isBot ? undefined : this.id,
      },
    );
  }

  private takeFallDamage(speed: number): void {
    const dmg = csFallDamage(speed);
    if (dmg <= 0 || !this.world.isServer) return;
    const info = createDamageInfo();
    info.attacker = 0;
    info.inflictor = 0;
    info.damage = dmg;
    info.damageType = DMG_FALL;
    info.position.x = this.origin.x;
    info.position.y = this.origin.y;
    info.position.z = this.origin.z;
    this.world.applyDamage(this, info);
    this.world.emitSound('Player.FallDamage', { entity: this.id });
  }

  /** Marks noise the bots can hear. */
  makeNoise(range: number): void {
    this.lastNoiseAt = this.world.curtime;
    this.noiseRange = range;
  }

  /** Firing ends deathmatch spawn protection. */
  onFiredWeapon(): void {
    this.immuneUntil = 0;
  }

  // ─── The command ───────────────────────────────────────────────────────────────────────────

  override runCommand(cmd: UserCmd): void {
    if (this.lifeState === LIFE_ALIVE) {
      const dt = TICK_INTERVAL;
      this.stamina = staminaRecover(this.stamina, dt);
      this.velocityModifier = Math.min(1, this.velocityModifier + VELOCITY_MODIFIER_RECOVERY * dt);
      decayAimPunch(this.aimPunch, dt);
      // `slot4` again with the grenades out: the next kind.
      if (cmd.weaponSelect - 1 === SLOT_PDA && this.activeSlot === SLOT_PDA) {
        (this.weapons[SLOT_PDA] as CsGrenadePouch | null)?.cycle();
      }
      this.useFrame(cmd);
    }
    super.runCommand(cmd);
    if (this.lifeState === LIFE_ALIVE) this.inBuyZoneNow = this.inBuyZone();
  }

  override cannotAttack(): boolean {
    // No shooting in the freeze time, or while defusing.
    if (this.world.rules.state === GR_STATE_PREROUND || this.defusing) return true;
    return super.cannotAttack();
  }

  /** CS players have no TF regeneration, afterburn or conditions to run per tick. */
  override serverThink(): void {}

  // ─── The bomb ──────────────────────────────────────────────────────────────────────────────

  hasC4(): boolean {
    return this.weapons[SLOT_PDA2] instanceof CsC4;
  }

  get planting(): boolean {
    const w = this.activeWeapon();
    return w instanceof CsC4 && w.planting;
  }

  /** The planted bomb this player is defusing, or null. */
  defusingBomb(): PlantedC4 | null {
    const c4 = this.cs.csRules.plantedC4;
    return c4 && !c4.removed && c4.defuser === this.id ? c4 : null;
  }

  get defusing(): boolean {
    return this.defusingBomb() !== null;
  }

  /** Inside a func_bomb_target? */
  inBombTarget(): boolean {
    const o = this.origin;
    const mins = { x: o.x + this.mins.x, y: o.y + this.mins.y, z: o.z + this.mins.z };
    const maxs = { x: o.x + this.maxs.x, y: o.y + this.maxs.y, z: o.z + this.maxs.z };
    return this.cs.bombTargets().some((t) => t.touchesBox(mins, maxs));
  }

  /** May this player reach the bomb with +use: close, and looking at it. */
  canReachBomb(c4: PlantedC4, viewAngles: { x: number; y: number; z: number }): boolean {
    const dx = c4.origin.x - this.origin.x;
    const dy = c4.origin.y - this.origin.y;
    const dz = c4.origin.z - this.origin.z;
    if (Math.hypot(dx, dy) > C4_DEFUSE_RANGE || Math.abs(dz) > 80) return false;
    this.eyePosition(useEye);
    angleVectors(viewAngles, useFwd);
    const ex = c4.origin.x - useEye.x;
    const ey = c4.origin.y - useEye.y;
    const ez = c4.origin.z + 4 - useEye.z;
    const len = Math.hypot(ex, ey, ez) || 1;
    return (useFwd.x * ex + useFwd.y * ey + useFwd.z * ez) / len > 0.5;
  }

  /** +use at the bomb: start, keep or abort a defuse (the bomb's think finishes it). */
  private useFrame(cmd: UserCmd): void {
    const w = this.cs;
    const c4 = w.csRules.plantedC4;
    if (!c4 || c4.removed || c4.defused || c4.exploded) return;
    const holding = (cmd.buttons & IN_USE) !== 0;
    if (c4.defuser === this.id) {
      if (!holding || !this.canReachBomb(c4, cmd.viewAngles)) {
        c4.stopDefuse(this.id);
        csEvent(w, { type: 'cs_bomb', kind: 'defuse_abort', player: this.id, entity: c4.id });
      }
      return;
    }
    if (
      !holding ||
      this.team !== CS_TEAM_CT ||
      !this.onGround ||
      c4.defuser !== NO_ENTITY ||
      !w.isServer
    )
      return;
    if (w.rules.state === GR_STATE_PREROUND || !this.canReachBomb(c4, cmd.viewAngles)) return;
    c4.startDefuse(this.id, this.defuser ? C4_DEFUSE_TIME_KIT : C4_DEFUSE_TIME);
    csEvent(w, { type: 'cs_bomb', kind: 'defuse_start', player: this.id, entity: c4.id });
  }

  // ─── Weapons ───────────────────────────────────────────────────────────────────────────────

  /** CS:GO's default loadout: the team's knife and pistol (deathmatch: a rifle and armor too). */
  override giveDefaultItems(): void {
    for (let i = 0; i < WEAPON_SLOTS; i++) {
      this.weapons[i]?.onOwnerDeath();
      this.weapons[i] = null;
    }
    const team = this.team === CS_TEAM_CT ? CS_TEAM_CT : CS_TEAM_T;
    for (const n of TEAM_KNIFE[team]) if (this.giveNamedWeapon(n)) break;
    for (const n of TEAM_PISTOL[team]) if (this.giveNamedWeapon(n)) break;
    if (this.cs.csMode === 'dm') {
      this.giveNamedWeapon(TEAM_RIFLE[team]);
      this.armor = CS_MAX_ARMOR;
      this.helmet = true;
    }
    this.activeSlot = -1;
    this.lastSlot = -1;
    this.items = '';
  }

  /** Gives a fresh weapon by name (grenades go into the pouch). Null when it cannot be carried. */
  giveNamedWeapon(name: string): CsWeapon | null {
    const w = createCsWeapon(name);
    if (!w) return null;
    if (w instanceof CsGrenadePouch) {
      const kind = w.info.grenade as CsGrenadeKind;
      const pouch = this.weapons[SLOT_PDA];
      if (pouch instanceof CsGrenadePouch) return pouch.add(kind) ? pouch : null;
      w.counts.fill(0);
      if (!w.add(kind)) return null;
    }
    this.giveWeapon(w);
    return w;
  }

  /** Takes a weapon off the ground into an empty slot (the bomb by Terrorists only). */
  pickUp(w: CsWeapon): boolean {
    if (!this.alive) return false;
    if (w instanceof CsC4 && this.team !== CS_TEAM_T) return false;
    if (w instanceof CsGrenadePouch) {
      const pouch = this.weapons[SLOT_PDA];
      if (pouch instanceof CsGrenadePouch) {
        let took = false;
        for (let i = 0; i < w.counts.length; i++) {
          while (w.counts[i] > 0 && pouch.add(CS_GRENADE_KINDS[i])) {
            w.counts[i]--;
            took = true;
          }
        }
        return took && w.total() === 0;
      }
    }
    if (this.weapons[w.slot]) return false;
    this.weapons[w.slot] = w;
    w.equip(this);
    if (w instanceof CsC4)
      csEvent(this.world, { type: 'cs_bomb', kind: 'pickup', player: this.id, team: CS_TEAM_T });
    if (this.activeSlot < 0) this.switchToBest();
    return true;
  }

  /** Removes a weapon from its slot (the planted bomb, a drop); switches away when it was out. */
  removeWeapon(w: CsWeapon): void {
    const slot = this.weapons.indexOf(w);
    if (slot < 0) return;
    this.weapons[slot] = null;
    if (this.activeSlot === slot) {
      this.activeSlot = -1;
      this.switchToBest();
    }
  }

  /** The best weapon carried: primary, pistol, knife, grenades, the bomb. */
  switchToBest(): void {
    for (const slot of [SLOT_PRIMARY, SLOT_SECONDARY, SLOT_MELEE, SLOT_PDA, SLOT_PDA2]) {
      const w = this.weapons[slot];
      if (w && w.canDeploy() && (this.activeSlot === slot || this.switchToSlot(slot))) return;
    }
  }

  /** The grenade pouch ran out. */
  switchAwayFromEmptySlot(): void {
    const slot =
      this.lastSlot >= 0 && this.lastSlot !== this.activeSlot && this.weapons[this.lastSlot]
        ? this.lastSlot
        : -1;
    this.activeSlot = -1;
    if (slot >= 0 && this.switchToSlot(slot)) return;
    this.switchToBest();
  }

  /** Tosses a weapon to the ground in front of the player (host only). */
  dropWeapon(w: CsWeapon): boolean {
    if (!this.world.isServer) return false;
    this.removeWeapon(w);
    w.onOwnerDeath();
    w.owner = null;
    const eye = this.eyePosition(vec3());
    const fwd = vec3();
    angleVectors(this.eyeAngles, fwd);
    this.world.spawnEntity('cs_dropped_weapon', (e) => {
      const d = e as import('./entities').CsDroppedWeapon;
      d.weapon = w;
      d.droppedBy = this.id;
      d.origin.x = eye.x + fwd.x * 8;
      d.origin.y = eye.y + fwd.y * 8;
      d.origin.z = eye.z - 12;
      d.velocity.x = this.velocity.x + fwd.x * DROP_SPEED;
      d.velocity.y = this.velocity.y + fwd.y * DROP_SPEED;
      d.velocity.z = this.velocity.z + fwd.z * DROP_SPEED + 60;
      d.model = w.worldModel;
    });
    if (w instanceof CsC4)
      csEvent(this.world, {
        type: 'cs_bomb',
        kind: 'dropped',
        player: this.id,
        team: CS_TEAM_T,
        pos: { x: eye.x, y: eye.y, z: eye.z },
      });
    return true;
  }

  /** The `drop` command: the weapon out (not the knife or the grenades). */
  dropActive(): boolean {
    const w = this.activeWeapon() as CsWeapon | null;
    if (!w || w.info.category === 'knife' || w instanceof CsGrenadePouch) return false;
    return this.dropWeapon(w);
  }

  /** A new match or the halftime switch: nothing in hand, no armor. */
  stripForNewMatch(): void {
    for (let i = 0; i < WEAPON_SLOTS; i++) {
      this.weapons[i]?.onOwnerDeath();
      this.weapons[i] = null;
    }
    this.activeSlot = -1;
    this.lastSlot = -1;
    this.armor = 0;
    this.helmet = false;
    this.defuser = false;
  }

  // ─── Buying ─────────────────────────────────────────────────────────────────────────────────

  inBuyZone(): boolean {
    const w = this.cs;
    if (w.csMode === 'dm' || w.csRules.settings.buyAnywhere) return true;
    const o = this.origin;
    return w.inBuyZone(
      this.team,
      { x: o.x + this.mins.x, y: o.y + this.mins.y, z: o.z + this.mins.z },
      { x: o.x + this.maxs.x, y: o.y + this.maxs.y, z: o.z + this.maxs.z },
      o,
    );
  }

  buyContext(): BuyContext {
    const rules = this.cs.csRules;
    return {
      alive: this.alive,
      team: this.team,
      money: this.money,
      inBuyZone: this.inBuyZone(),
      buyTime: rules.inBuyTime(),
      free: rules.csMode === 'dm',
      armor: this.armor,
      helmet: this.helmet,
      defuser: this.defuser,
      slotWeapon: (slot) => this.weapons[slot]?.classname ?? '',
      canCarryGrenade: (kind) => {
        const pouch = this.weapons[SLOT_PDA];
        if (pouch instanceof CsGrenadePouch) return pouch.canCarry(kind as CsGrenadeKind);
        return true;
      },
    };
  }

  /** The `buy` command (host only). Returns null on success, else the reason it was refused. */
  buy(name: string): string | null {
    if (!this.world.isServer) return 'not the host';
    const r = checkBuy(name, this.buyContext());
    if (!r.ok) {
      csEvent(this.world, {
        type: 'cs_buy',
        to: this.id,
        player: this.id,
        item: name,
        ok: false,
        reason: r.reason,
      });
      return r.reason;
    }
    const item = r.item;
    switch (item.kind) {
      case 'armor':
        this.armor = CS_MAX_ARMOR;
        if (item.helmet) this.helmet = true;
        break;
      case 'defuser':
        this.defuser = true;
        break;
      case 'weapon': {
        const info = item.info;
        if (info.category !== 'grenade') {
          const old = this.weapons[info.slot] as CsWeapon | null;
          if (old) this.dropWeapon(old);
        }
        const w = this.giveNamedWeapon(info.name);
        if (!w) return 'cannot carry it';
        if (info.category !== 'grenade' || this.activeSlot < 0) this.switchToSlot(w.slot);
        break;
      }
    }
    this.cs.csRules.addMoney(this, -r.price, 'buy');
    csEvent(this.world, {
      type: 'cs_buy',
      to: this.id,
      player: this.id,
      item: name,
      ok: true,
      price: r.price,
    });
    return null;
  }

  // ─── Spawning ───────────────────────────────────────────────────────────────────────────────

  override requestClass(cls: number): void {
    void cls;
    super.requestClass(CS_PLAYER_CLASS);
  }

  override spawnPlayer(): boolean {
    if (this.playerClass <= 0 || this.desiredClass <= 0) {
      this.playerClass = CS_PLAYER_CLASS;
      this.desiredClass = CS_PLAYER_CLASS;
    }
    this.stamina = 0;
    this.velocityModifier = 1;
    this.aimPunch.x = this.aimPunch.y = this.aimPunch.vx = this.aimPunch.vy = 0;
    this.flashAt = -1000;
    this.flashDuration = 0;
    this.flashAlpha = 0;
    this.immuneUntil = 0;
    this.damageFrom.clear();
    return super.spawnPlayer();
  }

  // ─── Damage and death ──────────────────────────────────────────────────────────────────────

  override onTakeDamage(input: DamageInfo): number {
    if (this.lifeState !== LIFE_ALIVE || this.takeDamage === DAMAGE_NO) return 0;
    if (this.flags & FL_GODMODE) return 0;
    const w = this.cs;
    if (w.curtime < this.immuneUntil) return 0;
    const attackerEnt = w.entity(input.attacker);
    const attacker = attackerEnt && attackerEnt.isPlayer() ? (attackerEnt as CsPlayer) : null;
    let damage = input.damage;
    if (
      attacker &&
      attacker !== this &&
      attacker.team === this.team &&
      !w.csRules.teammatesAreEnemies
    ) {
      if (!w.options.friendlyFire) return 0;
      damage *=
        input.damageType & DMG_BULLET
          ? FF_DAMAGE_REDUCTION_BULLETS
          : input.damageType & DMG_BLAST
            ? FF_DAMAGE_REDUCTION_GRENADE
            : FF_DAMAGE_REDUCTION_OTHER;
    }
    const aimed = (input.damageType & (DMG_BULLET | DMG_SLASH)) !== 0;
    const group = aimed ? input.hitGroup : HITGROUP_GENERIC;
    if (aimed) damage *= hitGroupMultiplier(group);
    const weapon = input.weaponDefIndex >= 0 ? csWeaponByDefindex(input.weaponDefIndex) : null;
    let armorLost = 0;
    if (this.armor > 0 && !(input.damageType & (DMG_FALL | DMG_BURN))) {
      applyArmor(
        damage,
        group,
        this.armor,
        this.helmet,
        weapon ? weapon.armorRatio : 1,
        armorScratch,
      );
      damage = armorScratch.health;
      armorLost = armorScratch.armor;
    }
    const prev = this.health;
    // Health and armor are whole numbers (CS:GO drops the fraction).
    this.health -= Math.trunc(damage);
    this.armor = Math.max(0, this.armor - Math.trunc(armorLost));
    this.lastDamageTime = w.curtime;
    const removed = prev - this.health;
    if (attacker && attacker !== this && removed > 0)
      this.damageFrom.set(
        attacker.id,
        (this.damageFrom.get(attacker.id) ?? 0) + Math.min(removed, Math.max(prev, 0)),
      );
    if (attacker && attacker !== this)
      attacker.stats.damage += Math.min(removed, Math.max(prev, 0));
    // Tagging: a bullet hit slows the victim (the weapon's flinch modifiers).
    if (input.damageType & DMG_BULLET && weapon) {
      this.velocityModifier = Math.min(
        this.velocityModifier,
        removed >= FLINCH_LARGE_DAMAGE ? weapon.flinchLarge : weapon.flinchSmall,
      );
    }
    // The hit punches the view a little.
    this.move.punchAngle.x = Math.max(
      -8,
      this.move.punchAngle.x - Math.min(4, removed * 0.05) * (group === HITGROUP_HEAD ? 2 : 1),
    );
    w.events.push({
      type: 'damage',
      victim: this.id,
      attacker: input.attacker,
      amount: removed,
      health: Math.max(0, this.health),
      crit: 0,
      customKill: input.customKill,
      pos: { x: input.position.x, y: input.position.y, z: input.position.z },
    });
    if (this.health <= 0) {
      if (this.buddha) this.health = 1;
      else this.die(input);
    }
    return removed;
  }

  override die(info: DamageInfo): void {
    if (this.lifeState !== LIFE_ALIVE) return;
    const w = this.cs;
    this.lifeState = LIFE_DYING;
    this.deathTime = w.curtime;
    this.takeDamage = DAMAGE_NO;
    const killerEnt = w.entity(info.attacker);
    const scorer =
      killerEnt && killerEnt.isPlayer() && killerEnt !== this ? (killerEnt as CsPlayer) : null;
    const enemyKill = scorer !== null && w.isEnemy(scorer, this);
    // Assist: another enemy who did more than 40 damage this life.
    let assister: CsPlayer | null = null;
    let best = ASSIST_DAMAGE - 1;
    for (const [id, dmg] of this.damageFrom) {
      if (dmg <= best || (scorer && id === scorer.id)) continue;
      const a = w.player(id) as CsPlayer | null;
      if (a && w.isEnemy(a, this)) {
        best = dmg;
        assister = a;
      }
    }
    this.stats.deaths++;
    if (scorer) {
      if (enemyKill) {
        scorer.stats.kills++;
        if (isHeadshot(info.customKill)) scorer.stats.headshots++;
      } else scorer.stats.kills--;
    } else this.stats.suicides++;
    if (assister) assister.stats.assists++;
    w.events.push({
      type: 'death',
      victim: this.id,
      attacker: scorer ? scorer.id : 0,
      assister: assister ? assister.id : 0,
      inflictor: info.inflictor > 0 ? info.inflictor : 0,
      weapon: info.killIcon,
      weaponDefIndex: info.weaponDefIndex,
      crit: 0,
      customKill: info.customKill,
      damageType: info.damageType,
      deathFlags: 0,
      victimClass: this.playerClass,
      gib: false,
      burning: false,
    });
    w.emitEffect({
      kind: 'ragdoll',
      pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
      entity: this.id,
      team: this.team,
      value: this.playerClass,
      // Where the blow landed (the bullet's hit, the blast's centre): the part it pushes hardest.
      start: { x: info.position.x, y: info.position.y, z: info.position.z },
      force: {
        x: info.force.x + this.velocity.x,
        y: info.force.y + this.velocity.y,
        z: info.force.z + this.velocity.z,
      },
    });

    // Drops: the best gun, the bomb, the kit.
    this.dropOnDeath();
    this.defusingBomb()?.stopDefuse(this.id);
    for (let i = 0; i < WEAPON_SLOTS; i++) {
      this.weapons[i]?.onOwnerDeath();
      this.weapons[i] = null;
    }
    this.activeSlot = -1;
    this.lastSlot = -1;
    this.armor = 0;
    this.helmet = false;
    this.defuser = false;
    this.health = 0;
    this.solid = SOLID_NONE;
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.move.dead = true;
    this.move.moveType = MOVETYPE_NONE;
    set(this.velocity, 0, 0, 0);
    this.doAnimationEvent(PLAYERANIMEVENT_DIE);
    copyInfo(deathInfo, info);
    w.rules.onPlayerKilled(this, deathInfo, scorer, assister);
    this.respawnAt = w.rules.nextRespawnTime(this);
  }

  private dropOnDeath(): void {
    if (!this.world.isServer) return;
    const primary = this.weapons[SLOT_PRIMARY] as CsWeapon | null;
    const pistol = this.weapons[SLOT_SECONDARY] as CsWeapon | null;
    const gun = primary ?? pistol;
    if (gun) this.dropWeapon(gun);
    const c4 = this.weapons[SLOT_PDA2] as CsWeapon | null;
    if (c4) this.dropWeapon(c4);
  }

  // ─── Network ────────────────────────────────────────────────────────────────────────────────

  override netSchema(): NetSchema {
    return NET_CS_PLAYER;
  }

  override writeNet(out: NetRecord): void {
    // The base entity block (Entity.writeNet), not TF2's player record.
    Entity.prototype.writeNet.call(this, out);
    out.vx = this.velocity.x;
    out.vy = this.velocity.y;
    out.vz = this.velocity.z;
    out.eyePitch = this.eyeAngles.x;
    out.eyeYaw = this.eyeAngles.y;
    out.cls = this.playerClass;
    out.lifeState = this.lifeState;
    out.health = Math.max(-999, Math.min(32767, this.health));
    out.armor = Math.max(0, Math.min(255, this.armor));
    out.helmet = this.helmet;
    out.defuser = this.defuser;
    out.hasC4 = this.hasC4();
    out.flags = this.move.flags;
    out.ducked = this.move.ducked;
    out.onGround = this.onGround;
    const w = this.activeWeapon() as CsWeapon | null;
    out.activeWeapon = w ? w.defindex : -1;
    out.activeSlot = this.activeSlot;
    out.weaponName = w ? w.classname : '';
    out.animEvent = this.animEvent;
    out.animEventSeq = this.animEventSeq;
    out.observerMode = this.observerMode;
    out.observerTarget = this.observerTarget;
    out.zoomLevel = w ? w.zoomLevel : 0;
    out.planting = this.planting;
    out.defusing = this.defusing;
    out.spawnProtected = this.world.curtime < this.immuneUntil;
    writeMoveState(this.move, out);
    out.money = this.money;
    out.stamina = this.stamina;
    out.velocityModifier = this.velocityModifier;
    out.aimPunchX = this.aimPunch.x;
    out.aimPunchY = this.aimPunch.y;
    out.aimPunchVX = this.aimPunch.vx;
    out.aimPunchVY = this.aimPunch.vy;
    out.flashAt = this.flashAt;
    out.flashDuration = this.flashDuration;
    out.flashAlpha = this.flashAlpha;
    out.inBuyZone = this.inBuyZoneNow;
    out.lastSlot = this.lastSlot;
    out.respawnAt = this.respawnAt;
    out.immuneUntil = this.immuneUntil;
  }
}

/** A predicting client restores its own player's state from the owner's record (CS's private block). */
export function readCsPlayerNet(p: CsPlayer, rec: NetRecord): void {
  readMoveState(rec, p.move);
  p.syncFromMove();
  p.lifeState = rec.lifeState as number;
  p.health = rec.health as number;
  p.armor = rec.armor as number;
  p.helmet = rec.helmet as boolean;
  p.defuser = rec.defuser as boolean;
  p.money = rec.money as number;
  p.stamina = rec.stamina as number;
  p.velocityModifier = rec.velocityModifier as number;
  p.aimPunch.x = rec.aimPunchX as number;
  p.aimPunch.y = rec.aimPunchY as number;
  p.aimPunch.vx = rec.aimPunchVX as number;
  p.aimPunch.vy = rec.aimPunchVY as number;
  p.flashAt = rec.flashAt as number;
  p.flashDuration = rec.flashDuration as number;
  p.flashAlpha = rec.flashAlpha as number;
  p.activeSlot = rec.activeSlot as number;
  p.lastSlot = rec.lastSlot as number;
  p.immuneUntil = rec.immuneUntil as number;
}

/**
 * A predicting client's player and weapons from the owner-view records (the CS counterpart of the
 * TF client's restorePlayerFromRecords): the player's private block, and each weapon by its defindex
 * (re-created when it changed), then its NET_CS_WEAPON state.
 */
export function restoreCsPlayerFromRecords(
  p: CsPlayer,
  rec: NetRecord,
  weapons: ReadonlyArray<{ slot: number; record: NetRecord }>,
): void {
  p.changeTeam(rec.team as number);
  p.playerClass = rec.cls as number;
  p.observerMode = rec.observerMode as number;
  p.eyeAngles.x = rec.eyePitch as number;
  p.eyeAngles.y = rec.eyeYaw as number;
  readCsPlayerNet(p, rec);
  const present = new Set<number>();
  for (const { slot, record } of weapons) {
    if (slot < 0 || slot >= WEAPON_SLOTS) continue;
    present.add(slot);
    const defindex = record.defindex as number;
    let w = p.weapons[slot] as CsWeapon | null;
    if (!w || w.defindex !== defindex) {
      const info = csWeaponByDefindex(defindex);
      w = info ? createCsWeaponFromInfo(info) : null;
      if (!w) continue;
      p.weapons[slot] = w;
      w.equip(p);
    }
    w.readNet(record);
  }
  for (let s = 0; s < WEAPON_SLOTS; s++) if (!present.has(s)) p.weapons[s] = null;
  const active = rec.activeSlot as number;
  p.activeSlot = active >= 0 && active < WEAPON_SLOTS && p.weapons[active] ? active : -1;
}

function copyInfo(out: DamageInfo, src: DamageInfo): void {
  Object.assign(out, src, {
    position: { ...src.position },
    force: { ...src.force },
    reportedPosition: { ...src.reportedPosition },
  });
}

const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

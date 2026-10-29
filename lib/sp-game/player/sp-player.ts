/**
 * The single-player player (SDK: CBasePlayer + CHL2_Player; Portal's player is
 * clean-room from public behaviour): Source movement through the shared
 * CGameMovement port with HL2/Portal parameters, health and HEV armor, suit
 * power for sprint and the flashlight, +use on buttons, doors, props and
 * actors, carrying physics objects (CPlayerPickupController), pushing light
 * props, fall damage by the single-player rule, view control by
 * point_viewcontrol, and death (the world reloads the last checkpoint).
 */

import type { UserCmd } from '../../tf2-game/core/types';
import { emptyTrace, NO_ENTITY, WORLD_ENTITY, type TraceFilter } from '../../tf2-game/core/types';
import {
  FL_DUCKING,
  FL_FROZEN,
  FL_ONGROUND,
  IN_ATTACK,
  IN_ATTACK2,
  IN_DUCK,
  IN_JUMP,
  IN_SPEED,
  IN_USE,
  MASK_PLAYERSOLID,
  MASK_SOLID,
  MOVETYPE_NOCLIP,
  MOVETYPE_NONE,
  MOVETYPE_WALK,
} from '../../tf2-game/core/constants';
import { angleVectors, copy, dot, length, normalize, vec3, type Vec3 } from '../../tf2-game/core/vec';
import { playerMove } from '../../tf2-game/sim/movement';
import { createMoveState, type MoveContext, type MoveParams, type MoveState, type SurfaceProps } from '../../tf2-game/sim/movement-types';
import { COLLISION_GROUP_DEBRIS, COLLISION_GROUP_PLAYER, DAMAGE_YES, FSOLID_NOT_SOLID, type Entity } from '../../tf2-game/sim/entity';
import type { DamageInfo } from '../../tf2-game/sim/damage';
import {
  DAMAGE_FOR_FALL_SPEED,
  DMG_FALL,
  HL2_DEAD_VIEW_Z,
  HL2_MOVE_PARAMS,
  HL2_NORM_SPEED,
  HL2_SPRINT_SPEED,
  HL2_WALK_SPEED,
  PLAYER_ENTITY_ID,
  PLAYER_MAX_LIFT_MASS,
  PORTAL_MAX_LIFT_MASS,
  PLAYER_MAX_SAFE_FALL_SPEED,
  PLAYER_THROW_FORCE,
  PLAYER_USE_RANGE,
  PORTAL_MOVE_PARAMS,
  PORTAL_NORM_SPEED,
  PORTAL_WALK_SPEED,
  SUIT_FLASHLIGHT_DRAIN,
  SUIT_SPRINT_DRAIN,
  SUIT_SPRINT_MIN_POWER,
  SUITPOWER_BEGIN_RECHARGE_DELAY,
  SUITPOWER_CHARGE_RATE,
} from '../constants';
import { SpEntity, USE_ON, USE_TOGGLE } from '../entities/base';
import { PHYS_GROUP, type PhysBody } from '../physics/physics-world';
import { quatFromAngles, quatMul, type Quat } from '../math';

/** in_buttons.h bits the TF constants module does not name. */
export const IN_WALK = 1 << 18;
export const IN_ZOOM = 1 << 19;
/** Impulse 100: toggle the flashlight. */
export const IMPULSE_FLASHLIGHT = 100;

/** A user command plus the impulse byte (CUserCmd::impulse). */
export interface SpUserCmd extends UserCmd {
  impulse?: number;
}

/** Something the player can hold (+use pickup). */
export interface Holdable {
  readonly id: number;
  phys: PhysBody | null;
  /** Called when picked up / dropped / thrown (fires OnPlayerPickup, OnPhysGunDrop…). */
  onPickedUp?(player: SpPlayer): void;
  onDropped?(player: SpPlayer, thrown: boolean): void;
}

const DEATH_RELOAD_DELAY = 3;

export class SpPlayer extends SpEntity {
  readonly move: MoveState;
  readonly params: Readonly<MoveParams>;
  readonly eyeAngles = vec3();
  armor = 0;
  hasSuit = false;
  suitPower = 100;
  private suitRechargeAt = 0;
  sprinting = false;
  flashlight = false;
  dead = false;
  deathTime = 0;
  /** `buddha` (console cheat): damage lands but never kills (health stays at 1). */
  buddha = false;
  /** Seconds of the current command (lastCmd buttons). */
  buttons = 0;
  oldButtons = 0;
  /** The object held with +use, or null. */
  held: Holdable | null = null;
  private heldError = 0;
  /** How far in front of the eyes the held object is kept. */
  holdDistance = 0;
  private holdRotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
  /** Physics body standing in for the player (kinematic boxes, standing and ducked). */
  phys: PhysBody | null = null;
  duckPhys: PhysBody | null = null;
  /** Portal: weapon_portalgun state. */
  portalgun: { canFire1: boolean; canFire2: boolean; nextFire: number } | null = null;
  /** Latest movement contact of the hull with props this tick (for pushing). */
  readonly lastCmd: SpUserCmd;
  private readonly ctx: MoveContext;
  private readonly filterFn: TraceFilter;
  /** Collision group the player's movement uses (debris passes through). */
  readonly surfaceCache = new Map<string, SurfaceProps>();
  /** Whether movement input is ignored (viewcontrol freeze, scripted). */
  frozenBy = 0;
  /** No fall damage (Portal's long-fall boots). */
  noFallDamage = false;
  /** The func_useableladder being climbed, or null. */
  ladder: { readonly bottom: Vec3; readonly top: Vec3; readonly id: number } | null = null;
  private ladderT = 0;

  constructor(game: 'hl2' | 'portal') {
    super('player');
    this.params = game === 'hl2' ? HL2_MOVE_PARAMS : PORTAL_MOVE_PARAMS;
    this.move = createMoveState(0, 0);
    this.move.viewOffsetZ = this.params.viewZ ?? 64;
    this.move.maxSpeed = game === 'hl2' ? HL2_NORM_SPEED : PORTAL_NORM_SPEED;
    this.noFallDamage = game === 'portal';
    this.health = 100;
    this.maxHealth = 100;
    this.takeDamage = DAMAGE_YES;
    this.collisionGroup = COLLISION_GROUP_PLAYER;
    this.moveType = MOVETYPE_WALK;
    this.solid = 2;
    this.lastCmd = {
      commandNumber: 0,
      tickCount: 0,
      viewAngles: vec3(),
      forwardMove: 0,
      sideMove: 0,
      upMove: 0,
      buttons: 0,
      weaponSelect: 0,
      randomSeed: 0,
    };
    copy(this.mins, this.params.hullMin);
    copy(this.maxs, this.params.hullMax);
    this.filterFn = (id: number) => this.shouldHit(id);
    this.ctx = {
      params: this.params,
      world: null as unknown as MoveContext['world'],
      curtime: 0,
      filter: this.filterFn,
      entityIndex: PLAYER_ENTITY_ID,
      isPlayer: (id) => id === PLAYER_ENTITY_ID,
      getEntityVelocity: (id, out) => this.sp.entityVelocity(id, out),
      surfaceProps: (name) => this.surfaceFor(name),
      onFallDamage: (speed) => this.fallDamage(speed),
      onJump: () => this.sp.emitSound('HL2Player.Jump', { entity: this.id, quiet: true }),
      onFootstep: (surface, volume) => this.footstep(surface, volume),
    };
  }

  override isPlayer(): boolean {
    return true;
  }

  override get alive(): boolean {
    return !this.removed && !this.dead;
  }

  /** TF trigger filters read this. */
  get isBot(): boolean {
    return false;
  }

  override isSolid(): boolean {
    return !this.dead && this.move.moveType !== MOVETYPE_NOCLIP;
  }

  get ducked(): boolean {
    return this.move.ducked;
  }

  /** World position of the eyes. */
  override eyePosition(out: Vec3): Vec3 {
    out.x = this.origin.x;
    out.y = this.origin.y;
    out.z = this.origin.z + this.move.viewOffsetZ;
    return out;
  }

  /** Places the player (spawn, transition, checkpoint). */
  placeAt(origin: Vec3, angles: Vec3 | null, velocity: Vec3 | null): void {
    copy(this.move.origin, origin);
    copy(this.origin, origin);
    if (angles) {
      copy(this.eyeAngles, angles);
      this.angles.y = angles.y;
    }
    if (velocity) copy(this.move.velocity, velocity);
    else this.move.velocity.x = this.move.velocity.y = this.move.velocity.z = 0;
    copy(this.velocity, this.move.velocity);
    this.move.groundEntity = NO_ENTITY;
    this.move.flags &= ~FL_ONGROUND;
    this.move.gameMoved = true;
    this.syncBodies();
  }

  private shouldHit(id: number): boolean {
    if (id === this.id) return false;
    if (id === WORLD_ENTITY) return true;
    if (this.held && id === this.held.id) return false;
    const e = this.sp.entity(id);
    if (!e) return true;
    if (e.solidFlags & FSOLID_NOT_SOLID) return false;
    if (e.collisionGroup === COLLISION_GROUP_DEBRIS) return false;
    const pc = (e as Entity & { passableToPlayer?: () => boolean }).passableToPlayer;
    if (pc && pc.call(e)) return false;
    return true;
  }

  /** The player's movement trace filter (shared with checks that should see what the player sees). */
  get traceFilter(): TraceFilter {
    return this.filterFn;
  }

  private surfaceFor(name: string): SurfaceProps {
    let s = this.surfaceCache.get(name);
    if (!s) {
      const surfName = name.includes('/') ? this.sp.assets.material(name).surfaceProp : name;
      s = this.sp.assets.surfaceProps.get(surfName || 'default');
      this.surfaceCache.set(name, s);
    }
    return s;
  }

  private footstep(surface: string, volume: number): void {
    const s = this.sp.assets.surfaceProps.get(surface.includes('/') ? this.sp.assets.material(surface).surfaceProp : surface);
    const name = s.stepLeft || 'Default.StepLeft';
    this.sp.emitSound(name, { entity: this.id, volume, quiet: true });
  }

  /** SDK: CSingleplayRules::FlPlayerFallDamage (Portal's boots: none). */
  private fallDamage(speed: number): void {
    if (this.noFallDamage) return;
    const dmg = (speed - PLAYER_MAX_SAFE_FALL_SPEED) * DAMAGE_FOR_FALL_SPEED;
    if (dmg <= 0) return;
    this.sp.emitSound('Player.FallDamage', { entity: this.id });
    this.sp.damage(this, dmg, DMG_FALL, null, null);
  }

  // ─── The command ──────────────────────────────────────────────────────────

  runCommand(cmd: SpUserCmd): void {
    const w = this.sp;
    const last = this.lastCmd;
    last.commandNumber = cmd.commandNumber;
    last.tickCount = cmd.tickCount;
    copy(last.viewAngles, cmd.viewAngles);
    last.forwardMove = cmd.forwardMove;
    last.sideMove = cmd.sideMove;
    last.upMove = cmd.upMove;
    last.buttons = cmd.buttons;
    last.impulse = cmd.impulse;
    this.oldButtons = this.buttons;
    this.buttons = cmd.buttons;

    if (this.dead) {
      this.move.dead = true;
      if (w.curtime >= this.deathTime + DEATH_RELOAD_DELAY) w.reloadAfterDeath();
      return;
    }

    if (!this.isViewLocked()) {
      copy(this.eyeAngles, cmd.viewAngles);
      this.eyeAngles.x = Math.max(-89, Math.min(89, this.eyeAngles.x));
      this.angles.y = this.eyeAngles.y;
    }

    if (cmd.impulse === IMPULSE_FLASHLIGHT) this.toggleFlashlight();
    this.updateSpeed(cmd);

    const mcmd = this.frozenBy > 0 ? frozenCmd(cmd) : cmd;
    copy(mcmd.viewAngles, this.eyeAngles);
    if (this.frozenBy > 0) this.move.flags |= FL_FROZEN;
    else this.move.flags &= ~FL_FROZEN;

    if (this.ladder) {
      this.ladderMove(mcmd);
      const pressedL = this.buttons & ~this.oldButtons;
      if (pressedL & IN_USE) this.dismountLadder();
      return;
    }

    const ctx = this.ctx;
    ctx.world = w.collision;
    ctx.curtime = w.curtime;
    ctx.sprinting = this.sprinting;
    if (this.move.moveType !== MOVETYPE_NONE) {
      w.collision.carving = true;
      playerMove(this.move, mcmd, ctx);
      w.collision.carving = false;
    }
    copy(this.origin, this.move.origin);
    copy(this.velocity, this.move.velocity);
    if (this.move.ducked) {
      copy(this.mins, this.params.duckHullMin);
      copy(this.maxs, this.params.duckHullMax);
    } else {
      copy(this.mins, this.params.hullMin);
      copy(this.maxs, this.params.hullMax);
    }
    this.flags = (this.flags & ~(FL_ONGROUND | FL_DUCKING)) | (this.move.flags & (FL_ONGROUND | FL_DUCKING));
    this.groundEntity = this.move.groundEntity;

    this.pushProps();
    this.syncBodies();

    const pressed = this.buttons & ~this.oldButtons;
    if (pressed & IN_USE) this.pressUse();
    if (this.held) this.updateHeld();
    if (!this.held && this.portalgun && this.frozenBy === 0) w.portalgunFire(this, this.buttons, pressed);
    this.updateSuitPower();
  }

  private isViewLocked(): boolean {
    return this.sp.viewControl !== null && this.frozenBy > 0;
  }

  private updateSpeed(cmd: UserCmd): void {
    const w = this.sp;
    let speed: number;
    if (w.game === 'hl2') {
      const wantSprint = (cmd.buttons & IN_SPEED) !== 0 && this.hasSuit;
      if (wantSprint && !this.sprinting && this.suitPower >= SUIT_SPRINT_MIN_POWER && !this.move.ducked) this.sprinting = true;
      if (!wantSprint || this.suitPower <= 0 || this.move.ducked) this.sprinting = false;
      speed = this.sprinting ? HL2_SPRINT_SPEED : cmd.buttons & IN_WALK ? HL2_WALK_SPEED : HL2_NORM_SPEED;
      // Carrying something heavy does not slow you in HL2's hands; only the gravity gun does.
    } else {
      this.sprinting = false;
      speed = cmd.buttons & IN_WALK ? PORTAL_WALK_SPEED : PORTAL_NORM_SPEED;
    }
    this.move.maxSpeed = speed;
  }

  /** SDK: CHL2_Player::SuitPower_Update — devices drain, idle recharges after a delay. */
  private updateSuitPower(): void {
    if (!this.hasSuit) return;
    const dt = this.sp.tick;
    let drain = 0;
    const moving = length(this.move.velocity) > 1;
    if (this.sprinting && moving) drain += SUIT_SPRINT_DRAIN;
    if (this.flashlight) drain += SUIT_FLASHLIGHT_DRAIN;
    if (drain > 0) {
      this.suitPower = Math.max(0, this.suitPower - drain * dt);
      this.suitRechargeAt = this.sp.curtime + SUITPOWER_BEGIN_RECHARGE_DELAY;
      if (this.suitPower <= 0) {
        this.sprinting = false;
        if (this.flashlight) this.toggleFlashlight();
      }
    } else if (this.sp.curtime >= this.suitRechargeAt) {
      this.suitPower = Math.min(100, this.suitPower + SUITPOWER_CHARGE_RATE * dt);
    }
  }

  toggleFlashlight(): void {
    if (!this.hasSuit && this.sp.game === 'hl2') return;
    if (this.sp.game === 'portal') return;
    this.flashlight = !this.flashlight;
    this.sp.emitSound(this.flashlight ? 'HL2Player.FlashLightOn' : 'HL2Player.FlashLightOff', { entity: this.id });
  }

  // ─── Ladders (func_useableladder) ─────────────────────────────────────────

  /** Starts climbing: the player snaps to the ladder line at the nearest height. */
  mountLadder(l: { readonly bottom: Vec3; readonly top: Vec3; readonly id: number }): void {
    if (this.held) this.drop(false);
    this.ladder = l;
    const h = l.top.z - l.bottom.z || 1;
    this.ladderT = Math.min(1, Math.max(0, (this.origin.z - l.bottom.z) / h));
    this.move.velocity.x = this.move.velocity.y = this.move.velocity.z = 0;
    this.sp.emitSound('Ladder.StepRight', { entity: this.id, quiet: true });
  }

  dismountLadder(): void {
    const l = this.ladder;
    if (!l) return;
    this.ladder = null;
    this.move.groundEntity = NO_ENTITY;
    this.move.flags &= ~FL_ONGROUND;
    this.move.gameMoved = true;
  }

  /** Climbs along the ladder with forward/back (looking down reverses), leaves at the ends or on jump. */
  private ladderMove(cmd: UserCmd): void {
    const l = this.ladder!;
    const len = Math.hypot(l.top.x - l.bottom.x, l.top.y - l.bottom.y, l.top.z - l.bottom.z) || 1;
    let dir = Math.sign(cmd.forwardMove) * (this.eyeAngles.x > 45 ? -1 : 1);
    if (cmd.buttons & IN_JUMP) {
      angleVectors(this.eyeAngles, useFwd);
      this.dismountLadder();
      this.move.velocity.x = -useFwd.x * 150;
      this.move.velocity.y = -useFwd.y * 150;
      return;
    }
    if (cmd.forwardMove === 0) dir = 0;
    this.ladderT += (dir * 200 * this.sp.tick) / len;
    if (this.ladderT >= 1 || this.ladderT < 0) {
      const top = this.ladderT >= 1;
      this.ladderT = Math.min(1, Math.max(0, this.ladderT));
      const at = top ? l.top : l.bottom;
      useEnd.x = at.x;
      useEnd.y = at.y;
      useEnd.z = at.z + (top ? 2 : 0);
      this.placeAt(useEnd, null, null);
      this.dismountLadder();
      return;
    }
    useEnd.x = l.bottom.x + (l.top.x - l.bottom.x) * this.ladderT;
    useEnd.y = l.bottom.y + (l.top.y - l.bottom.y) * this.ladderT;
    useEnd.z = l.bottom.z + (l.top.z - l.bottom.z) * this.ladderT;
    copy(this.move.origin, useEnd);
    copy(this.origin, useEnd);
    this.syncBodies();
  }

  // ─── Physics stand-in and pushing ─────────────────────────────────────────

  /** Moves the kinematic boxes props collide with. */
  syncBodies(): void {
    const ducked = this.move.ducked;
    if (this.phys) {
      this.phys.setGroups(ducked || this.dead ? 0 : PHYS_GROUP.PLAYER, PHYS_GROUP.PROP);
      this.phys.setKinematicTarget(this.origin, ZERO_ANGLES);
    }
    if (this.duckPhys) {
      this.duckPhys.setGroups(ducked && !this.dead ? PHYS_GROUP.PLAYER : 0, PHYS_GROUP.PROP);
      this.duckPhys.setKinematicTarget(this.origin, ZERO_ANGLES);
    }
  }

  /**
   * The player's shadow pushing props (vphysics' player controller): light
   * props the hull is pressing into get the hull's speed along the contact,
   * scaled by the mass ratio (85 kg player, as CPlayerShadow assumes).
   */
  private pushProps(): void {
    const p = this.sp.physics;
    const v = this.move.velocity;
    const speed2 = v.x * v.x + v.y * v.y;
    if (speed2 < 1) return;
    pmins.x = this.origin.x + this.mins.x - 2;
    pmins.y = this.origin.y + this.mins.y - 2;
    pmins.z = this.origin.z + this.mins.z + 2;
    pmaxs.x = this.origin.x + this.maxs.x + 2;
    pmaxs.y = this.origin.y + this.maxs.y + 2;
    pmaxs.z = this.origin.z + this.maxs.z;
    pushList.length = 0;
    p.bodiesInBox(pmins, pmaxs, pushList);
    const speed = Math.sqrt(speed2);
    pushDir.x = v.x / speed;
    pushDir.y = v.y / speed;
    pushDir.z = 0;
    const cz = this.origin.z + (this.mins.z + this.maxs.z) * 0.5;
    for (const b of pushList) {
      if (b.held || !b.isMotionEnabled() || b.entity === this.move.groundEntity) continue;
      const ent = this.sp.entity(b.entity);
      if (ent && !this.shouldHit(ent.id)) continue;
      // Contact: the point of the body's bounds nearest the hull's leading face.
      b.fastBounds(bmn, bmx);
      contact.x = Math.min(Math.max(this.origin.x + pushDir.x * 16, bmn.x), bmx.x);
      contact.y = Math.min(Math.max(this.origin.y + pushDir.y * 16, bmn.y), bmx.y);
      contact.z = Math.min(Math.max(cz, bmn.z), bmx.z);
      // Only what is in front of the hull.
      const rx = contact.x - this.origin.x;
      const ry = contact.y - this.origin.y;
      if (rx * pushDir.x + ry * pushDir.y <= 0) continue;
      // The contact point's velocity (linear + angular × lever).
      b.getVelocity(pushVel);
      b.getAngularVelocity(angVel);
      b.getCenter(bodyC);
      const k = Math.PI / 180;
      const lx = contact.x - bodyC.x;
      const ly = contact.y - bodyC.y;
      const lz = contact.z - bodyC.z;
      const px = pushVel.x + (angVel.y * k * lz - angVel.z * k * ly);
      const py = pushVel.y + (angVel.z * k * lx - angVel.x * k * lz);
      const has = px * pushDir.x + py * pushDir.y;
      if (has >= speed) continue;
      const ratio = 85 / (85 + b.mass);
      const dv = Math.min(speed - has, speed) * ratio * 0.25;
      pushImp.x = pushDir.x * dv * b.mass;
      pushImp.y = pushDir.y * dv * b.mass;
      pushImp.z = 0;
      b.applyImpulseAt(pushImp, contact);
    }
  }

  // ─── +use ─────────────────────────────────────────────────────────────────

  private pressUse(): void {
    if (this.held) {
      this.drop(false);
      return;
    }
    const target = this.findUseEntity();
    if (!target) {
      this.sp.emitSound('HL2Player.UseDeny', { entity: this.id, quiet: true });
      return;
    }
    const holdable = this.sp.asHoldable(target);
    if (holdable && this.canPickup(holdable)) {
      this.pickup(holdable);
      return;
    }
    if (target instanceof SpEntity) target.use(this, USE_TOGGLE);
  }

  /**
   * SDK: CBasePlayer::FindUseEntity — a line along the view first, then the
   * nearest usable entity within reach whose centre is near the view direction.
   */
  findUseEntity(): Entity | null {
    const w = this.sp;
    this.eyePosition(useEye);
    angleVectors(this.eyeAngles, useFwd);
    useEnd.x = useEye.x + useFwd.x * PLAYER_USE_RANGE;
    useEnd.y = useEye.y + useFwd.y * PLAYER_USE_RANGE;
    useEnd.z = useEye.z + useFwd.z * PLAYER_USE_RANGE;
    const tr = emptyTrace();
    w.collision.traceLine(useEye, useEnd, MASK_SOLID | 0x2000000, this.filterFn, tr);
    if (tr.fraction < 1 && tr.entity > 0) {
      const e = w.entity(tr.entity);
      if (e && this.usable(e)) return e;
    }
    // Nearest usable in a cone.
    let best: Entity | null = null;
    let bestDot = 0.8;
    w.forEachEntity((e) => {
      if (e === this || !this.usable(e)) return;
      e.worldSpaceCenter(useCenter);
      e.nearestPoint(useEye, useNear);
      const dx = useNear.x - useEye.x;
      const dy = useNear.y - useEye.y;
      const dz = useNear.z - useEye.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > PLAYER_USE_RANGE) return;
      useDir.x = useCenter.x - useEye.x;
      useDir.y = useCenter.y - useEye.y;
      useDir.z = useCenter.z - useEye.z;
      normalize(useDir);
      const d = dot(useDir, useFwd);
      if (d <= bestDot && dist > 8) return;
      // Line of sight to it.
      w.collision.traceLine(useEye, useCenter, MASK_SOLID, (id) => id !== this.id && id !== e.id && this.filterFn(id, 0), tr);
      if (tr.fraction < 0.99 && tr.entity !== e.id) return;
      bestDot = d;
      best = e;
    });
    return best;
  }

  private usable(e: Entity): boolean {
    if (e.removed) return false;
    if (this.sp.asHoldable(e)) return true;
    return e instanceof SpEntity && e.isUsable();
  }

  canPickup(h: Holdable): boolean {
    const b = h.phys;
    if (!b || !b.isMotionEnabled()) return false;
    if (b.mass > (this.sp.game === 'portal' ? PORTAL_MAX_LIFT_MASS : PLAYER_MAX_LIFT_MASS)) return false;
    const e = this.sp.entity(h.id) as (Entity & { preventPickup?: boolean }) | null;
    if (e?.preventPickup) return false;
    // Can't pick up what you stand on.
    if (this.move.groundEntity === h.id) return false;
    return true;
  }

  /** Starts carrying (CPlayerPickupController::Init). */
  pickup(h: Holdable): void {
    const b = h.phys!;
    this.held = h;
    b.held = true;
    b.setGravityEnabled(false);
    b.setGroups(PHYS_GROUP.HELD, PHYS_GROUP.WORLD | PHYS_GROUP.PROP | PHYS_GROUP.BRUSH | PHYS_GROUP.PORTAL_WALL_0 | PHYS_GROUP.PORTAL_WALL_1 | PHYS_GROUP.NPC);
    this.holdDistance = 24 + b.radius * 2;
    // Keep the object's yaw relative to the player.
    const qPlayer = quatFromAngles({ x: 0, y: this.eyeAngles.y, z: 0 });
    const inv: Quat = { x: -qPlayer.x, y: -qPlayer.y, z: -qPlayer.z, w: qPlayer.w };
    quatMul(inv, b.getQuat({ x: 0, y: 0, z: 0, w: 1 }), this.holdRotation);
    this.heldError = 0;
    h.onPickedUp?.(this);
    this.sp.emitSound('Player.PickupWeapon', { entity: this.id, quiet: true });
  }

  /** Drops (or throws) the held object (CPlayerPickupController::Shutdown). */
  drop(thrown: boolean): void {
    const h = this.held;
    if (!h) return;
    this.held = null;
    const b = h.phys;
    if (b && !b.removed) {
      b.held = false;
      b.setGravityEnabled(true);
      b.setGroups(PHYS_GROUP.PROP, b.filter === 0 ? 0xffff : this.sp.propFilter());
      if (thrown) {
        angleVectors(this.eyeAngles, useFwd);
        // massFactor = RemapVal(clamp(mass, 0.5, 15), 0.5, 15, 0.5, 4); vphysics' ApplyForceCenter is an impulse.
        const m = Math.min(15, Math.max(0.5, b.mass));
        const massFactor = 0.5 + ((m - 0.5) / 14.5) * 3.5;
        const imp = PLAYER_THROW_FORCE * massFactor;
        b.applyImpulse({ x: useFwd.x * imp, y: useFwd.y * imp, z: useFwd.z * imp });
        b.applyAngularImpulse({ x: (this.sp.random() - 0.5) * 20 * massFactor, y: (this.sp.random() - 0.5) * 20 * massFactor, z: 0 });
      }
    }
    h.onDropped?.(this, thrown);
  }

  /**
   * Holds the object in front of the eyes (CGrabController::UpdateObject): a
   * velocity servo toward the target point and orientation; dropped when it is
   * blocked more than 12 units from the target, or on +attack2; +attack throws.
   */
  private updateHeld(): void {
    const h = this.held!;
    const b = h.phys;
    if (!b || b.removed || !b.isMotionEnabled()) {
      this.drop(false);
      return;
    }
    const pressed = this.buttons & ~this.oldButtons;
    if (pressed & IN_ATTACK) {
      this.drop(true);
      return;
    }
    if (pressed & IN_ATTACK2) {
      this.drop(false);
      return;
    }
    this.eyePosition(useEye);
    angleVectors(this.eyeAngles, useFwd);
    // Don't push the object into walls: trace to the hold point.
    useEnd.x = useEye.x + useFwd.x * this.holdDistance;
    useEnd.y = useEye.y + useFwd.y * this.holdDistance;
    useEnd.z = useEye.z + useFwd.z * this.holdDistance;
    b.getCenter(useCenter);
    const ex = useEnd.x - useCenter.x;
    const ey = useEnd.y - useCenter.y;
    const ez = useEnd.z - useCenter.z;
    const err = Math.sqrt(ex * ex + ey * ey + ez * ez);
    // Blocked: the object stayed more than 12 units off its target for a second
    // (the grab controller's error is judged over time, not per frame).
    if (err > 12) this.heldError += this.sp.tick;
    else this.heldError = 0;
    if (this.heldError > 1) {
      this.drop(false);
      return;
    }
    const dt = this.sp.tick;
    const gain = 0.5 / dt;
    const maxSpeed = 1500;
    holdVel.x = ex * gain + this.move.velocity.x;
    holdVel.y = ey * gain + this.move.velocity.y;
    holdVel.z = ez * gain + this.move.velocity.z;
    const s = length(holdVel);
    if (s > maxSpeed) {
      holdVel.x *= maxSpeed / s;
      holdVel.y *= maxSpeed / s;
      holdVel.z *= maxSpeed / s;
    }
    b.setVelocity(holdVel);
    // Orientation: player yaw ∘ the relative rotation captured at pickup.
    const target = quatMul(quatFromAngles({ x: 0, y: this.eyeAngles.y, z: 0 }), this.holdRotation, { x: 0, y: 0, z: 0, w: 1 });
    const cur = b.getQuat({ x: 0, y: 0, z: 0, w: 1 });
    // Angular velocity toward the target: 2·log(target·cur⁻¹)/dt, limited.
    const inv: Quat = { x: -cur.x, y: -cur.y, z: -cur.z, w: cur.w };
    const d = quatMul(target, inv, { x: 0, y: 0, z: 0, w: 1 });
    if (d.w < 0) {
      d.x = -d.x;
      d.y = -d.y;
      d.z = -d.z;
      d.w = -d.w;
    }
    const sinHalf = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
    const angle = 2 * Math.atan2(sinHalf, d.w);
    const wScale = sinHalf > 1e-6 ? ((angle / sinHalf) * 0.5) / dt : 0;
    const deg = 180 / Math.PI;
    b.setAngularVelocity({ x: d.x * wScale * deg, y: d.y * wScale * deg, z: d.z * wScale * deg });
  }

  // ─── Damage and death ─────────────────────────────────────────────────────

  /** SDK: CBasePlayer::OnTakeDamage + CHL2_Player armor (ARMOR_RATIO 0.2, ARMOR_BONUS 1.0). */
  override onTakeDamage(info: DamageInfo): number {
    if (this.dead || this.takeDamage !== DAMAGE_YES) return 0;
    let dmg = info.damage;
    if (this.armor > 0 && !(info.damageType & (DMG_FALL | 0x4000 /* DMG_DROWN */))) {
      const toHealth = dmg * 0.2;
      let toArmor = dmg - toHealth;
      if (toArmor > this.armor) {
        toArmor = this.armor;
        dmg = dmg - toArmor;
        this.armor = 0;
      } else {
        this.armor -= toArmor;
        dmg = toHealth;
      }
    }
    dmg = Math.floor(dmg + 0.5) || (dmg > 0 ? 1 : 0);
    this.health -= dmg;
    this.sp.emitSound(info.damageType & DMG_FALL ? 'Player.FallDamage' : 'Player.Pain', { entity: this.id, quiet: true });
    this.move.punchAngle.x = Math.min(this.move.punchAngle.x + dmg * 0.3, 10);
    if (this.health <= 0) {
      if (this.buddha) this.health = 1;
      else this.die();
    }
    return dmg;
  }

  die(): void {
    if (this.dead) return;
    this.health = 0;
    this.dead = true;
    this.deathTime = this.sp.curtime;
    this.move.dead = true;
    this.move.viewOffsetZ = HL2_DEAD_VIEW_Z;
    if (this.held) this.drop(false);
    this.sp.emit({ type: 'death' });
    this.sp.emit({ type: 'fade', color: [255, 0, 0, 128], duration: 0.5, hold: DEATH_RELOAD_DELAY, fadeIn: false, modulate: false, stayOut: true });
  }

  /** Back to life at the checkpoint (the world restores everything else). */
  revive(): void {
    this.dead = false;
    this.move.dead = false;
    this.move.viewOffsetZ = this.params.viewZ ?? 64;
  }
}

const ZERO_ANGLES = Object.freeze(vec3());
const pmins = vec3();
const pmaxs = vec3();
const pushList: PhysBody[] = [];
const pushDir = vec3();
const pushVel = vec3();
const pushImp = vec3();
const bmn = vec3();
const bmx = vec3();
const contact = vec3();
const angVel = vec3();
const bodyC = vec3();
const useEye = vec3();
const useFwd = vec3();
const useEnd = vec3();
const useCenter = vec3();
const useNear = vec3();
const useDir = vec3();
const holdVel = vec3();

const frozen: SpUserCmd = {
  commandNumber: 0,
  tickCount: 0,
  viewAngles: vec3(),
  forwardMove: 0,
  sideMove: 0,
  upMove: 0,
  buttons: 0,
  weaponSelect: 0,
  randomSeed: 0,
};

function frozenCmd(cmd: UserCmd): UserCmd {
  frozen.commandNumber = cmd.commandNumber;
  frozen.tickCount = cmd.tickCount;
  frozen.buttons = cmd.buttons & (IN_DUCK & 0);
  return frozen;
}

export { MASK_PLAYERSOLID, IN_JUMP, IN_DUCK, IN_USE, USE_ON };

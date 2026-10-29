/**
 * A player: CTFPlayer + CTFPlayerShared, server side. Owns command
 * processing (PlayerRunCommand: weapon select → movement → weapon frame →
 * trigger touches), spawning (CTFPlayer::Spawn / GetPlayerSpawnSpot), damage
 * (CTFPlayer::OnTakeDamage / OnTakeDamage_Alive), death (Event_Killed with
 * scorer/assister, dominations, the dropped ammo pack, gibs), health regen
 * (RegenThink), overheal decay, healers, afterburn, resupply (Regenerate)
 * and the per-tick condition think (ConditionGameRulesThink).
 *
 * The player's `origin`, `velocity` and `baseVelocity` are the same Vec3
 * objects as its MoveState's, so movement and the entity never disagree;
 * restore prediction state with `restoreMoveState` (it copies).
 */

import {
  copy,
  normalize,
  remapClamped,
  set,
  vec3,
  type Vec3,
} from '../core/vec';
import {
  FL_DUCKING,
  FL_FROZEN,
  FL_GODMODE,
  FL_ONGROUND,
  IN_ATTACK,
  MOVETYPE_NONE,
  MOVETYPE_OBSERVER,
  MOVETYPE_WALK,
  TEAM_SPECTATOR,
  TEAM_UNASSIGNED,
  TF_CLASS_COUNT,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SOLDIER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  VEC_DUCK_HULL_MAX,
  VEC_DUCK_HULL_MIN,
  VEC_DUCK_VIEW_Z,
  VEC_HULL_MAX,
  VEC_HULL_MIN,
  WL_WAIST,
  CONTENTS_BLUETEAM,
  CONTENTS_MONSTER,
  CONTENTS_REDTEAM,
  CONTENTS_SOLID,
} from '../core/constants';
import { emptyUserCmd, NO_ENTITY, WORLD_ENTITY, type UserCmd } from '../core/types';
import {
  createMoveState,
  MOVE_COND_BLAST_JUMPING,
  MOVE_COND_BURNING,
  MOVE_COND_LOSER,
  MOVE_COND_SHIELD_CHARGE,
  MOVE_COND_TAUNTING,
  OBS_MODE_NONE,
  OBS_MODE_ROAMING,
  type MoveContext,
  type MoveState,
} from './movement-types';
import { playerMove } from './movement';
import { calculateMaxSpeed, classEyeHeight, tfFallDamage, VEC_DEAD_VIEW_Z, type MaxSpeedInput } from './class-speeds';
import {
  COLLISION_GROUP_PLAYER,
  COLLISION_GROUP_PLAYER_MOVEMENT,
  DAMAGE_NO,
  DAMAGE_YES,
  EF_NODRAW,
  EF_NOINTERP,
  Entity,
  FL_CLIENT,
  FL_FAKECLIENT,
  FSOLID_NOT_SOLID,
  LIFE_ALIVE,
  LIFE_DEAD,
  LIFE_DYING,
  SOLID_BBOX,
  SOLID_NONE,
  TFCOLLISION_GROUP_ROCKETS,
} from './entity';
import { Conditions, COND_WORDS, PERMANENT_CONDITION, TF_COND } from './conditions';
import {
  applyOnDamageModifyRules,
  applyPushFromDamage,
  copyDamageInfo,
  createDamageInfo,
  DMG_BLAST,
  DMG_BURN,
  DMG_CRITICAL,
  DMG_FALL,
  DMG_GENERIC,
  DMG_HALF_FALLOFF,
  DMG_IGNITE,
  DMG_IGNORE_MAXHEALTH,
  DMG_PREVENT_PHYSICS_FORCE,
  isHeadshot,
  TF_DAMAGESCALE_SELF_SOLDIER,
  TF_DMG_CUSTOM_BACKSTAB,
  TF_DMG_CUSTOM_BURNING,
  TF_DMG_CUSTOM_TELEFRAG,
  TF_DMG_CUSTOM_TRIGGER_HURT,
  TF_PLAYER_ROCKET_JUMPED,
  type DamageInfo,
} from './damage';
import { MOVE_STATE_NET_FIELDS, NET_PLAYER, type NetRecord, type NetSchema } from './net-schema';
import { createWeapon, TF_AMMO_COUNT, WEAPON_SLOTS, type Weapon } from './weapon-api';
import { classHealth, classMaxAmmo, stockLoadout } from './loadout';
import { TF_DEATH_DOMINATION, TF_DEATH_REVENGE, TF_DEATH_ASSISTER_DOMINATION, TF_DEATH_ASSISTER_REVENGE } from './events';

// ─── Constants (tf_shareddefs.h, tf_player.cpp, tf_player_shared.cpp) ─────
/** TF_REGEN_TIME / TF_REGEN_AMOUNT. */
export const TF_REGEN_TIME = 1.0;
export const TF_REGEN_AMOUNT = 3;
/** TF_BURNING_FREQUENCY / TF_BURNING_FLAME_LIFE / TF_BURNING_FLAME_LIFE_PYRO / TF_BURNING_DMG. */
export const TF_BURNING_FREQUENCY = 0.5;
export const TF_BURNING_FLAME_LIFE = 10.0;
export const TF_BURNING_FLAME_LIFE_PYRO = 0.25;
export const TF_BURNING_DMG = 4;
/** tf_afterburn_max_duration. */
export const TF_AFTERBURN_MAX_DURATION = 10;
/** tf_max_health_boost. */
export const TF_MAX_HEALTH_BOOST = 1.5;
/** tf_boost_drain_time: seconds for a full overheal to drain. */
export const TF_BOOST_DRAIN_TIME = 15.0;
/** TF_KILLS_DOMINATION. */
export const TF_KILLS_DOMINATION = 4;
/** TF_TIME_ASSIST_KILL / TF_TIME_SUICIDE_KILL_CREDIT. */
export const TF_TIME_ASSIST_KILL = 3.0;
export const TF_TIME_SUICIDE_KILL_CREDIT = 10.0;
/** TF_DEATH_ANIMATION_TIME. */
export const TF_DEATH_ANIMATION_TIME = 2.0;
/** TF_REGENERATE_NEXT_USE_TIME (func_regenerate cooldown). */
export const TF_REGENERATE_NEXT_USE_TIME = 3.0;
/** Commands processed per player per tick at most (bounds catch-up CPU). */
export const MAX_CMDS_PER_TICK = 8;

/** PlayerAnimEvent_t subset the renderer animates from. */
export const PLAYERANIMEVENT_ATTACK_PRIMARY = 0;
export const PLAYERANIMEVENT_ATTACK_SECONDARY = 1;
export const PLAYERANIMEVENT_RELOAD = 3;
export const PLAYERANIMEVENT_RELOAD_LOOP = 4;
export const PLAYERANIMEVENT_RELOAD_END = 5;
export const PLAYERANIMEVENT_JUMP = 6;
export const PLAYERANIMEVENT_SWIM = 7;
export const PLAYERANIMEVENT_DIE = 8;
export const PLAYERANIMEVENT_SPAWN = 11;
export const PLAYERANIMEVENT_CUSTOM_GESTURE = 20;

export interface PlayerStats {
  kills: number;
  deaths: number;
  assists: number;
  dominations: number;
  revenges: number;
  captures: number;
  defenses: number;
  destructions: number;
  healing: number;
  damage: number;
  invulns: number;
  teleports: number;
  backstabs: number;
  headshots: number;
  suicides: number;
  bonusPoints: number;
  flagReturns: number;
}

const newStats = (): PlayerStats => ({
  kills: 0,
  deaths: 0,
  assists: 0,
  dominations: 0,
  revenges: 0,
  captures: 0,
  defenses: 0,
  destructions: 0,
  healing: 0,
  damage: 0,
  invulns: 0,
  teleports: 0,
  backstabs: 0,
  headshots: 0,
  suicides: 0,
  bonusPoints: 0,
  flagReturns: 0,
});

/** SDK: CTFGameRules::CalcPlayerScore (TF_SCORE_* weights, integer divisions). */
export function calcPlayerScore(s: PlayerStats): number {
  return (
    s.kills +
    s.captures * 2 +
    s.flagReturns * 4 +
    s.defenses +
    s.destructions +
    Math.trunc(s.headshots / 2) +
    s.backstabs +
    Math.trunc(s.healing / 600) +
    Math.trunc(s.assists / 2) +
    Math.trunc(s.teleports / 2) +
    s.invulns +
    s.revenges +
    Math.trunc(s.bonusPoints / 10)
  );
}

/** One healer (CTFPlayerShared::healers_t). */
export interface Healer {
  id: number;
  /** HP per second. */
  rate: number;
  /** Overheal ceiling as a multiple of max health (1 = no overheal). */
  overhealMult: number;
  /** Dispensers don't give heal assists. */
  dispenser: boolean;
  accum: number;
}

/** A damager in the victim's history (EntityHistory_t). */
interface DamagerRecord {
  id: number;
  time: number;
}

const DAMAGER_HISTORY = 2;
/** The MOVE_COND_* bits the game owns (movement owns the rest). */
const GAME_MOVE_CONDS =
  MOVE_COND_TAUNTING | MOVE_COND_BURNING | MOVE_COND_BLAST_JUMPING | MOVE_COND_SHIELD_CHARGE | MOVE_COND_LOSER;
const scratchDir = vec3();
const scratchA = vec3();
const scratchB = vec3();
const damageStack: DamageInfo[] = [];
let damageDepth = 0;

export class Player extends Entity {
  name: string;
  userId: string | undefined;
  isBot = false;
  /** ETFClass currently played. */
  playerClass = 0;
  /** Class the player picked (applies on the next spawn). */
  desiredClass = 0;
  lifeState = LIFE_DEAD;
  deathTime = -1000;
  /** When the rules will respawn this player (0 = not scheduled). */
  respawnAt = 0;
  observerMode = OBS_MODE_NONE;
  observerTarget: number = NO_ENTITY;

  readonly move: MoveState;
  readonly moveCtx: MoveContext;
  readonly eyeAngles: Vec3 = vec3();
  readonly ammo = new Int32Array(TF_AMMO_COUNT);
  readonly maxAmmo = new Int32Array(TF_AMMO_COUNT);
  readonly weapons: (Weapon | null)[] = new Array<Weapon | null>(WEAPON_SLOTS).fill(null);
  activeSlot = -1;
  lastSlot = -1;
  readonly cond = new Conditions();
  stats: PlayerStats = newStats();
  /** Unanswered kills by each player id (statsKills.iNumKilledByUnanswered). */
  readonly killedByUnanswered = new Map<number, number>();
  /** Players this one dominates. */
  readonly dominating = new Set<number>();

  /** Commands received and not yet run. */
  readonly pendingCmds: UserCmd[] = [];
  /** The last command run (re-run when a tick gets none). */
  readonly lastCmd: UserCmd = emptyUserCmd();
  /** cl_autoreload. */
  autoReload = true;
  /** Buttons of the command being run. */
  buttons = 0;

  /** curtime of the last damage taken (GetLastDamageReceivedTime). */
  lastDamageTime = -1000;
  private lastRegenAt = 0;
  private accumulatedRegen = 0;
  private healFraction = 0;
  /** func_regenerate cooldown (GetNextRegenTime). */
  nextRegenTime = 0;
  /** Touching func_respawnroom volumes of any team (m_iRespawnTouchCount). */
  respawnTouchCount = 0;
  /** Own-team respawn rooms touched. */
  ownRespawnRoomCount = 0;

  /** Afterburn. */
  afterburnDuration = 0;
  private flameBurnTime = 0;
  burnAttacker: number = NO_ENTITY;
  burnWeaponId = 0;

  readonly healers: Healer[] = [];
  /** The medigun's current target (MedicGetHealTarget), set by the medigun. */
  healTarget: number = NO_ENTITY;
  blastJumpState = 0;
  takenBlastDamageSinceLastMovement = false;
  private readonly damagers: DamagerRecord[] = [];
  /** Explicit assist for the next death (CTFPlayerShared::SetAssist). */
  pendingAssist: number = NO_ENTITY;

  /** Spy. */
  disguiseTeam = 0;
  disguiseClass = 0;
  disguiseTarget = 0;
  cloakMeter = 100;
  /** Charge meters (demo charge, scout drink, …) the weapons module owns. */
  readonly meters = new Float32Array(4);
  /** Flag entity carried (CTF), NO_ENTITY when none. */
  carriedFlag: number = NO_ENTITY;
  animEvent = 0;
  animEventSeq = 0;
  /** Seconds of respawn time a map forced (SetRespawnTimeOverride), -1 = none. */
  respawnTimeOverride = -1;
  /** Arena / forced spawn point name for the next spawn. */
  spawnPointName = '';
  /** The last spawn point used (round-robin start). */
  lastSpawnPoint: number = NO_ENTITY;
  /** Client interpolation in ticks (TIME_TO_TICKS(cl_interp)), for lag compensation. */
  lerpTicks = 0;
  /** Measured one-way latency in seconds, for lag compensation. */
  latency = 0;

  constructor(name: string) {
    super('player');
    this.name = name;
    this.preserved = true;
    this.flags |= FL_CLIENT;
    this.move = createMoveState();
    // Share the kinematic vectors with the movement state.
    this.move.origin = this.origin;
    this.move.velocity = this.velocity;
    this.move.baseVelocity = this.baseVelocity;
    this.contents = CONTENTS_SOLID | CONTENTS_MONSTER;
    this.collisionGroup = COLLISION_GROUP_PLAYER;
    this.moveType = MOVETYPE_NONE;
    this.solid = SOLID_NONE;
    this.setSize(VEC_HULL_MIN, VEC_HULL_MAX);
    this.moveCtx = {
      world: null as unknown as MoveContext['world'],
      curtime: 0,
      filter: null,
      entityIndex: 0,
      isPlayer: (id: number) => this.world.isPlayerId(id),
      getEntityVelocity: (id: number, out: Vec3) => {
        const e = this.world.entity(id);
        if (e) copy(out, e.velocity);
        else set(out, 0, 0, 0);
      },
      onFallDamage: (speed: number) => this.onFallDamage(speed),
      onLand: () => {
        if (this.blastJumpState) this.clearBlastJumpState();
      },
      onJump: (airDash: boolean) => {
        if (!airDash) this.doAnimationEvent(PLAYERANIMEVENT_JUMP);
      },
      onFootstep: (surface: string, volume: number) => {
        if (!this.world.isServer) return;
        this.world.emitSound(`Player.Footstep.${surface}`, {
          entity: this.id,
          volume,
          predictedBy: this.isBot ? undefined : this.id,
        });
      },
      onWaterLevelChange: (_old: number, level: number) => {
        if (level >= WL_WAIST && this.cond.has(TF_COND.BURNING)) this.extinguish();
      },
    };
  }

  /** Called by the world when the player joins. */
  attach(): void {
    this.moveCtx.world = this.world;
    this.moveCtx.filter = this.world.createEntityFilter(this, COLLISION_GROUP_PLAYER_MOVEMENT);
    this.moveCtx.entityIndex = this.id;
  }

  override isPlayer(): boolean {
    return true;
  }

  override get alive(): boolean {
    return !this.removed && this.lifeState === LIFE_ALIVE;
  }

  get fakeClient(): boolean {
    return (this.flags & FL_FAKECLIENT) !== 0;
  }

  get ducked(): boolean {
    return this.move.ducked;
  }

  /** SDK: CTFPlayer::ShouldCollide — teammates pass through each other and through team rockets. */
  override shouldCollide(collisionGroup: number, contentsMask: number): boolean {
    if (collisionGroup === COLLISION_GROUP_PLAYER_MOVEMENT || collisionGroup === TFCOLLISION_GROUP_ROCKETS) {
      if (this.team === TF_TEAM_RED && !(contentsMask & CONTENTS_REDTEAM)) return false;
      if (this.team === TF_TEAM_BLUE && !(contentsMask & CONTENTS_BLUETEAM)) return false;
    }
    return true;
  }

  // ─── Geometry ────────────────────────────────────────────────────────────

  viewOffsetZ(): number {
    if (this.lifeState !== LIFE_ALIVE) return VEC_DEAD_VIEW_Z;
    return this.move.ducked ? VEC_DUCK_VIEW_Z : classEyeHeight(this.playerClass);
  }

  /** EyePosition(): origin + view offset. */
  eyePosition(out: Vec3): Vec3 {
    return set(out, this.origin.x, this.origin.y, this.origin.z + this.move.viewOffsetZ);
  }

  /** SDK: CBaseEntity::ApplyAbsVelocityImpulse. */
  applyAbsVelocityImpulse(impulse: Vec3): void {
    this.velocity.x += impulse.x;
    this.velocity.y += impulse.y;
    this.velocity.z += impulse.z;
  }

  /** SDK: CTFPlayer::SetBlastJumpState. */
  setBlastJumpState(state: number): void {
    this.blastJumpState |= state;
    this.cond.add(TF_COND.BLASTJUMPING);
  }

  clearBlastJumpState(): void {
    this.blastJumpState = 0;
    this.cond.remove(TF_COND.BLASTJUMPING);
  }

  doAnimationEvent(event: number): void {
    this.animEvent = event;
    this.animEventSeq = (this.animEventSeq + 1) & 255;
  }

  // ─── Health ──────────────────────────────────────────────────────────────

  /** SDK: CTFPlayerShared::GetMaxBuffedHealth (rounded down to 5, never below max/current). */
  maxBuffedHealth(mult = TF_MAX_HEALTH_BOOST, ignoreHealthOverMax = false): number {
    let boosted = Math.floor((this.maxHealth * mult) / 5) * 5;
    if (!ignoreHealthOverMax) boosted = Math.max(boosted, this.maxHealth, this.health);
    return boosted;
  }

  /** SDK: CTFPlayer::TakeHealth. DMG_IGNORE_MAXHEALTH lets the caller overheal. */
  override takeHealth(amount: number, damageType = DMG_GENERIC): number {
    if (!this.alive) return 0;
    const before = this.health;
    if (damageType & DMG_IGNORE_MAXHEALTH) this.health += Math.floor(amount);
    else {
      if (this.health >= this.maxHealth) return 0;
      this.health = Math.min(this.maxHealth, this.health + Math.floor(amount));
    }
    return this.health - before;
  }

  /** Starts/updates a healer (medigun beam, dispenser). Heal processing happens in the condition think. */
  addHealer(healerId: number, rate: number, overhealMult = TF_MAX_HEALTH_BOOST, dispenser = false): void {
    const h = this.healers.find((x) => x.id === healerId);
    if (h) {
      h.rate = rate;
      h.overhealMult = overhealMult;
      return;
    }
    this.healers.push({ id: healerId, rate, overhealMult, dispenser, accum: 0 });
    this.cond.add(TF_COND.HEALTH_BUFF, PERMANENT_CONDITION, healerId);
  }

  removeHealer(healerId: number): void {
    const i = this.healers.findIndex((x) => x.id === healerId);
    if (i >= 0) this.healers.splice(i, 1);
    if (this.healers.length === 0) this.cond.remove(TF_COND.HEALTH_BUFF);
  }

  // ─── Weapons ─────────────────────────────────────────────────────────────

  activeWeapon(): Weapon | null {
    return this.activeSlot >= 0 ? this.weapons[this.activeSlot] : null;
  }

  /** Gives a weapon into its slot, replacing what was there. */
  giveWeapon(w: Weapon): void {
    const old = this.weapons[w.slot];
    if (old && old !== w) old.onOwnerDeath();
    this.weapons[w.slot] = w;
    w.equip(this);
  }

  /** SDK: CBasePlayer::Weapon_Switch / CTFPlayer::Weapon_Switch. */
  switchToSlot(slot: number): boolean {
    if (slot < 0 || slot >= WEAPON_SLOTS) return false;
    const next = this.weapons[slot];
    if (!next || slot === this.activeSlot) return false;
    if (!next.canDeploy()) return false;
    const cur = this.activeWeapon();
    if (cur) {
      if (!cur.canHolster() || this.cond.has(TF_COND.CANNOT_SWITCH_FROM_MELEE)) return false;
      if (!cur.holster(next)) return false;
    }
    this.lastSlot = this.activeSlot;
    this.activeSlot = slot;
    next.deploy();
    return true;
  }

  /** Can't attack: humiliated losers, taunting, stunned (CTFPlayer::CanAttack / IsAllowedToFire). */
  cannotAttack(): boolean {
    if (this.cond.has(TF_COND.TAUNTING)) return true;
    if (this.world.rules.isHumiliated(this)) return true;
    return false;
  }

  /** Builds the class's stock loadout (CTFPlayer::GiveDefaultItems). */
  giveDefaultItems(): void {
    for (let i = 0; i < WEAPON_SLOTS; i++) {
      this.weapons[i]?.onOwnerDeath();
      this.weapons[i] = null;
    }
    for (const spec of stockLoadout(this.playerClass)) {
      const w = createWeapon(spec);
      if (w) {
        this.weapons[w.slot] = w;
        w.equip(this);
      }
    }
    this.activeSlot = -1;
    this.lastSlot = -1;
  }

  /** Refills ammo to the class maximums (GiveDefaultAmmo). */
  refillAmmo(): void {
    classMaxAmmo(this.playerClass, this.maxAmmo);
    this.ammo.set(this.maxAmmo);
  }

  /** CTFPlayer::GiveAmmo. Returns how much was taken. */
  giveAmmo(count: number, type: number): number {
    if (type <= 0 || type >= TF_AMMO_COUNT) return 0;
    const max = this.maxAmmo[type];
    const room = max - this.ammo[type];
    const add = Math.max(0, Math.min(room, Math.ceil(count)));
    this.ammo[type] += add;
    return add;
  }

  // ─── Command processing ─────────────────────────────────────────────────

  /**
   * SDK: CBasePlayer::PlayerRunCommand → CTFPlayer::PreThink, SelectItem,
   * ProcessMovement, PostThink (ItemPostFrame), PhysicsTouchTriggers.
   */
  runCommand(cmd: UserCmd): void {
    const world = this.world;
    copy(this.eyeAngles, cmd.viewAngles);
    this.buttons = cmd.buttons;

    if (this.lifeState !== LIFE_ALIVE) {
      if (this.observerMode === OBS_MODE_ROAMING) {
        this.move.moveType = MOVETYPE_OBSERVER;
        this.moveCtx.curtime = world.curtime;
        playerMove(this.move, cmd, this.moveCtx);
      }
      this.copyLastCmd(cmd);
      return;
    }

    if (cmd.weaponSelect > 0) this.switchToSlot(cmd.weaponSelect - 1);

    // Movement.
    this.syncMoveInputs();
    this.moveCtx.curtime = world.curtime;
    playerMove(this.move, cmd, this.moveCtx);
    this.syncFromMove();
    if (this.removed || this.lifeState !== LIFE_ALIVE) return;
    if (this.takenBlastDamageSinceLastMovement && this.move.flags & FL_ONGROUND) {
      this.takenBlastDamageSinceLastMovement = false;
    }

    // Weapons: the active one runs its frame, the others their holster frame.
    const active = this.activeWeapon();
    for (let i = 0; i < WEAPON_SLOTS; i++) {
      const w = this.weapons[i];
      if (w && w !== active) w.itemHolsterFrame(cmd);
    }
    if (active && !(this.world.rules.isHumiliated(this) && cmd.buttons & IN_ATTACK)) active.itemPostFrame(cmd);
    if (this.removed || this.lifeState !== LIFE_ALIVE) return;

    world.touchTriggers(this);
    this.copyLastCmd(cmd);
  }

  private copyLastCmd(cmd: UserCmd): void {
    const l = this.lastCmd;
    l.commandNumber = cmd.commandNumber;
    l.tickCount = cmd.tickCount;
    copy(l.viewAngles, cmd.viewAngles);
    l.forwardMove = cmd.forwardMove;
    l.sideMove = cmd.sideMove;
    l.upMove = cmd.upMove;
    l.buttons = cmd.buttons;
    l.weaponSelect = 0;
    l.randomSeed = cmd.randomSeed;
  }

  /** Writes what movement reads from the game (team, class, speed, conditions). */
  syncMoveInputs(): void {
    const m = this.move;
    m.team = this.team;
    m.classIndex = this.playerClass;
    m.dead = this.lifeState !== LIFE_ALIVE;
    m.moveType = this.lifeState === LIFE_ALIVE ? MOVETYPE_WALK : this.move.moveType;
    m.maxSpeed = this.computeMaxSpeed();
    let conds = 0;
    if (this.cond.has(TF_COND.TAUNTING)) conds |= MOVE_COND_TAUNTING;
    if (this.cond.has(TF_COND.BURNING)) conds |= MOVE_COND_BURNING;
    if (this.cond.has(TF_COND.BLASTJUMPING)) conds |= MOVE_COND_BLAST_JUMPING;
    if (this.cond.has(TF_COND.SHIELD_CHARGE)) conds |= MOVE_COND_SHIELD_CHARGE;
    if (this.world.rules.isHumiliated(this)) conds |= MOVE_COND_LOSER;
    m.conds = (m.conds & ~GAME_MOVE_CONDS) | conds;
    if (this.world.rules.isFrozen(this)) m.flags |= FL_FROZEN;
    else m.flags &= ~FL_FROZEN;
  }

  /** Mirrors movement results onto the entity (flags, ground, hull). */
  syncFromMove(): void {
    const m = this.move;
    this.flags = (this.flags & ~(FL_ONGROUND | FL_DUCKING)) | (m.flags & (FL_ONGROUND | FL_DUCKING));
    this.groundEntity = m.groundEntity;
    if (m.ducked) this.setSize(VEC_DUCK_HULL_MIN, VEC_DUCK_HULL_MAX);
    else this.setSize(VEC_HULL_MIN, VEC_HULL_MAX);
    this.angles.y = this.eyeAngles.y;
  }

  private readonly speedInput: MaxSpeedInput = { classIndex: 0 };

  /** SDK: CTFPlayer::TeamFortress_CalculateMaxSpeed (via class-speeds.ts). */
  computeMaxSpeed(): number {
    const w = this.activeWeapon();
    const rules = this.world.rules;
    const s = this.speedInput;
    s.classIndex = this.playerClass;
    s.canMove = rules.canPlayerMove(this);
    s.disguiseClass = this.cond.has(TF_COND.DISGUISED) ? this.disguiseClass : 0;
    s.stealthed = this.cond.has(TF_COND.STEALTHED);
    s.aiming = this.cond.has(TF_COND.AIMING);
    s.speedBoost = this.cond.has(TF_COND.SPEED_BOOST);
    s.teamWin = rules.bonusRoundSide(this);
    s.weaponSpeedMod = w ? w.speedMod() : 1;
    s.shieldCharging = this.cond.has(TF_COND.SHIELD_CHARGE);
    return calculateMaxSpeed(s);
  }

  /** Copies a predicted/snapshot MoveState into ours without breaking the shared vectors. */
  restoreMoveState(src: MoveState): void {
    const m = this.move;
    const o = m.origin;
    const v = m.velocity;
    const b = m.baseVelocity;
    const p = m.punchAngle;
    const pv = m.punchAngleVel;
    const wj = m.waterJumpVel;
    const attrs = m.attrs;
    Object.assign(m, src);
    m.origin = copy(o, src.origin);
    m.velocity = copy(v, src.velocity);
    m.baseVelocity = copy(b, src.baseVelocity);
    m.punchAngle = copy(p, src.punchAngle);
    m.punchAngleVel = copy(pv, src.punchAngleVel);
    m.waterJumpVel = copy(wj, src.waterJumpVel);
    m.attrs = Object.assign(attrs, src.attrs);
    this.syncFromMove();
  }

  // ─── Per-tick think (not per command) ────────────────────────────────────

  /**
   * Runs once per server tick for every player: conditions, healers,
   * overheal decay, afterburn and regen (CTFPlayerShared::
   * ConditionGameRulesThink + CTFPlayer::RegenThink + PostThink bits).
   */
  serverThink(): void {
    if (this.lifeState !== LIFE_ALIVE) return;
    const world = this.world;
    const dt = world.frametime;
    const t = world.curtime;

    // Healers.
    let decayHealth = true;
    if (this.healers.length > 0) {
      decayHealth = false;
      for (let i = 0; i < this.healers.length; i++) {
        const h = this.healers[i];
        const healer = world.entity(h.id);
        if (!healer || healer.removed) {
          this.healers.splice(i--, 1);
          continue;
        }
        h.accum += h.rate * dt;
        const cap = this.maxBuffedHealth(h.overhealMult);
        const whole = Math.floor(h.accum);
        if (whole > 0) {
          h.accum -= whole;
          const room = Math.max(0, cap - this.health);
          const healed = this.takeHealth(Math.min(whole, room), DMG_IGNORE_MAXHEALTH);
          if (healed > 0 && healer.isPlayer() && healer !== this) (healer as Player).stats.healing += healed;
        }
      }
      if (this.healers.length === 0) this.cond.remove(TF_COND.HEALTH_BUFF);
      if (this.cond.has(TF_COND.BURNING)) this.afterburnDuration -= 2 * dt;
    }

    // Overheal flag and decay (tf_boost_drain_time).
    if (this.health > this.maxHealth) this.cond.add(TF_COND.HEALTH_OVERHEALED);
    else this.cond.remove(TF_COND.HEALTH_OVERHEALED);
    if (decayHealth && this.health > this.maxHealth) {
      const boostMax = this.maxBuffedHealth(TF_MAX_HEALTH_BOOST, true) - this.maxHealth;
      this.healFraction += dt * (boostMax / TF_BOOST_DRAIN_TIME);
      const drain = Math.trunc(this.healFraction);
      if (drain > 0) {
        this.healFraction -= drain;
        this.health = Math.max(this.maxHealth, this.health - drain);
      }
    } else if (!decayHealth) this.healFraction = 0;

    // Afterburn.
    if (this.cond.has(TF_COND.BURNING)) {
      if (this.afterburnDuration <= 0 || this.move.waterLevel >= WL_WAIST) this.extinguish();
      else if (t >= this.flameBurnTime) {
        if (this.playerClass !== TF_CLASS_PYRO || this.cond.has(TF_COND.BURNING_PYRO)) {
          const info = this.scratchDamage();
          info.attacker = this.burnAttacker;
          info.inflictor = this.burnAttacker;
          info.weaponId = this.burnWeaponId;
          info.damage = TF_BURNING_DMG;
          info.damageType = DMG_BURN | DMG_PREVENT_PHYSICS_FORCE;
          info.customKill = TF_DMG_CUSTOM_BURNING;
          info.killIcon = 'tf_weapon_flamethrower';
          this.eyePosition(info.position);
          world.applyDamage(this, info);
          this.releaseScratchDamage();
          if (this.lifeState !== LIFE_ALIVE) return;
        }
        this.flameBurnTime = t + TF_BURNING_FREQUENCY;
        this.afterburnDuration -= TF_BURNING_FREQUENCY;
      }
    }

    this.cond.think(dt);
    this.regenThink();
  }

  /** SDK: CTFPlayer::RegenThink. */
  private regenThink(): void {
    const t = this.world.curtime;
    if (this.lastRegenAt + TF_REGEN_TIME > t) return;
    this.lastRegenAt = t;
    if (this.playerClass === TF_CLASS_MEDIC) {
      const scale = remapClamped(t - this.lastDamageTime, 5, 10, 1, 2);
      let amt = TF_REGEN_AMOUNT;
      const patient = this.world.entity(this.healTarget);
      if (patient && patient.isPlayer() && patient.health < patient.maxHealth) amt += TF_REGEN_AMOUNT;
      this.accumulatedRegen += amt * scale;
    }
    let heal = 0;
    if (this.accumulatedRegen >= 1) {
      heal = Math.floor(this.accumulatedRegen);
      if (this.health < this.maxHealth) this.takeHealth(heal);
    }
    this.accumulatedRegen -= heal;
  }

  /** SDK: CTFPlayerShared::Burn. `flameLife` = the weapon's afterburn per hit. */
  ignite(attacker: number, weaponId: number, flameLife = TF_BURNING_FLAME_LIFE): void {
    if (!this.alive) return;
    const immunePyro = this.playerClass === TF_CLASS_PYRO && !this.cond.has(TF_COND.BURNING_PYRO);
    if (!this.cond.has(TF_COND.BURNING)) {
      this.cond.add(TF_COND.BURNING, PERMANENT_CONDITION, attacker);
      this.flameBurnTime = this.world.curtime + TF_BURNING_FREQUENCY;
      this.afterburnDuration = 0;
    }
    this.burnAttacker = attacker;
    this.burnWeaponId = weaponId;
    if (immunePyro) this.afterburnDuration = TF_BURNING_FLAME_LIFE_PYRO;
    else this.afterburnDuration = Math.min(TF_AFTERBURN_MAX_DURATION, this.afterburnDuration + flameLife);
  }

  extinguish(): void {
    if (!this.cond.has(TF_COND.BURNING)) return;
    this.cond.remove(TF_COND.BURNING);
    this.afterburnDuration = 0;
    this.burnAttacker = NO_ENTITY;
  }

  private onFallDamage(speed: number): void {
    const spread = this.world.random.randomFloat(0.8, 1.2);
    const dmg = tfFallDamage(speed, this.maxHealth, spread);
    if (dmg <= 0) return;
    const info = this.scratchDamage();
    info.attacker = WORLD_ENTITY;
    info.inflictor = WORLD_ENTITY;
    info.damage = dmg;
    info.damageType = DMG_FALL;
    copy(info.position, this.origin);
    this.world.applyDamage(this, info);
    this.releaseScratchDamage();
    this.world.emitSound('Player.FallDamage', { entity: this.id });
  }

  private scratchDamage(): DamageInfo {
    const i = damageDepth++;
    if (!damageStack[i]) damageStack[i] = createDamageInfo();
    const info = damageStack[i];
    copyDamageInfo(info, EMPTY_DAMAGE);
    return info;
  }

  private releaseScratchDamage(): void {
    damageDepth--;
  }

  // ─── Damage ──────────────────────────────────────────────────────────────

  /** SDK: CTFPlayer::OnTakeDamage + OnTakeDamage_Alive. Returns health removed. */
  override onTakeDamage(input: DamageInfo): number {
    if (this.lifeState !== LIFE_ALIVE || this.takeDamage === DAMAGE_NO) return 0;
    if (this.flags & FL_GODMODE) return 0;
    const world = this.world;
    const info = this.scratchDamage();
    copyDamageInfo(info, input);
    try {
      const attacker = world.entity(info.attacker);
      const inflictor = world.entity(info.inflictor);

      // Friendly fire (CTFGameRules::FPlayerCanTakeDamage).
      if (attacker && attacker !== this && attacker.isPlayer() && attacker.team === this.team && !world.options.friendlyFire) {
        return 0;
      }

      // Rocket jumping: soldiers take 60 % of their own blast damage in the air.
      const selfBlastAirborne =
        attacker === this &&
        info.damageType & DMG_BLAST &&
        !(this.move.flags & FL_ONGROUND) &&
        this.move.waterLevel === 0;
      if (selfBlastAirborne && this.playerClass === TF_CLASS_SOLDIER) {
        info.damage *= TF_DAMAGESCALE_SELF_SOLDIER;
        if (this.health - info.damage > 0) this.setBlastJumpState(TF_PLAYER_ROCKET_JUMPED);
      }

      const allowDamage =
        (inflictor !== null && inflictor.classname === 'trigger_hurt') || info.customKill === TF_DMG_CUSTOM_TELEFRAG;
      if (allowDamage && inflictor && inflictor.classname === 'trigger_hurt') info.customKill = TF_DMG_CUSTOM_TRIGGER_HURT;

      // Direction from us toward the inflictor (for knockback).
      const dir = scratchDir;
      set(dir, 0, 0, 0);
      if (inflictor) {
        inflictor.worldSpaceCenter(scratchA);
        this.worldSpaceCenter(scratchB);
        set(dir, scratchA.x - scratchB.x, scratchA.y - scratchB.y, scratchA.z - 10 - scratchB.z);
        normalize(dir);
      } else if (info.attacker === WORLD_ENTITY) {
        set(dir, 0, 0, 0);
      }

      if (!applyOnDamageModifyRules(world, info, this, allowDamage)) {
        // Invulnerable: no damage, but still pushed.
        if (!(info.damageType & DMG_PREVENT_PHYSICS_FORCE) && inflictor) applyPushFromDamage(this, info, dir);
        return 0;
      }

      // ApplyOnDamageAliveModifyRules (stock subset): ignition immunity in water handled in ignite.
      const realDamage = info.damage;
      if (realDamage <= 0 && !(info.damageType & DMG_BLAST && attacker === this)) return 0;

      const prev = this.health;
      // "Take damage - round to the nearest integer." (m_iHealth is a CNetworkVar<int>: its
      // operator-= converts the float argument to int first, so this is health -= (int)(dmg + 0.5).)
      this.health -= Math.trunc(realDamage + 0.5);
      this.lastDamageTime = world.curtime;
      const removed = prev - this.health;

      if (attacker && attacker !== this && attacker.isPlayer() && attacker.team !== this.team) {
        this.recordDamager(attacker.id);
        (attacker as Player).stats.damage += Math.min(removed, Math.max(prev, 0));
      }

      world.events.push({
        type: 'damage',
        victim: this.id,
        attacker: info.attacker,
        amount: removed,
        health: Math.max(0, this.health),
        crit: info.critType,
        customKill: info.customKill,
        pos: { x: info.position.x, y: info.position.y, z: info.position.z },
      });
      if (info.critType !== 0 && attacker !== this) {
        world.emitEffect({ kind: 'crittext', pos: this.eyePosition(vec3()), entity: this.id, value: info.critType });
      }

      // Knockback.
      if (
        !(info.damageType & DMG_PREVENT_PHYSICS_FORCE) &&
        inflictor &&
        this.move.moveType === MOVETYPE_WALK &&
        !(attacker && attacker.isTrigger()) &&
        !this.cond.has(TF_COND.DISGUISED)
      ) {
        applyPushFromDamage(this, info, dir);
      }

      // Ignition.
      if (info.damageType & DMG_IGNITE && this.move.waterLevel < WL_WAIST && attacker && attacker.isPlayer()) {
        this.ignite(attacker.id, info.weaponId, info.afterburn > 0 ? info.afterburn : TF_BURNING_FLAME_LIFE);
      }

      if (this.health <= 0) this.die(info);
      return removed;
    } finally {
      this.releaseScratchDamage();
    }
  }

  private recordDamager(id: number): void {
    const t = this.world.curtime;
    const h = this.damagers;
    // Most recent first, unique (CAchievementData::AddDamagerToHistory).
    const idx = h.findIndex((d) => d.id === id);
    if (idx >= 0) h.splice(idx, 1);
    h.unshift({ id, time: t });
    if (h.length > DAMAGER_HISTORY + 2) h.length = DAMAGER_HISTORY + 2;
  }

  /** SDK: CTFGameRules::GetRecentDamager. */
  recentDamager(index: number, maxElapsed: number): Player | null {
    const d = this.damagers[index];
    if (!d || this.world.curtime - d.time > maxElapsed) return null;
    const e = this.world.entity(d.id);
    return e && e.isPlayer() && !e.removed ? (e as Player) : null;
  }

  /** SDK: CTFPlayer::ShouldGib. */
  shouldGib(info: DamageInfo): boolean {
    if (!(info.damageType & DMG_BLAST) && !(info.damageType & DMG_HALF_FALLOFF)) return false;
    if (info.damageType & DMG_CRITICAL) return true;
    return this.health <= -10;
  }

  /**
   * SDK: CTFPlayer::Event_Killed + CTFGameRules::PlayerKilled /
   * DeathNotice: credit, dominations, drops, effects, respawn scheduling.
   */
  die(info: DamageInfo): void {
    if (this.lifeState !== LIFE_ALIVE) return;
    const world = this.world;
    const gib = this.shouldGib(info);
    const burning = this.cond.has(TF_COND.BURNING);
    this.lifeState = LIFE_DYING;
    this.deathTime = world.curtime;
    this.takeDamage = DAMAGE_NO;

    // Scorer (GetDeathScorer): suicides and environment deaths credit a recent damager.
    let scorer: Player | null = null;
    const killer = world.entity(info.attacker);
    if (killer && killer.isPlayer() && killer !== this) scorer = killer as Player;
    else if (!killer || killer === this || !killer.isPlayer()) {
      scorer = this.recentDamager(0, TF_TIME_SUICIDE_KILL_CREDIT);
    }
    // Assister (GetAssister).
    let assister: Player | null = null;
    if (scorer) {
      const explicit = world.entity(this.pendingAssist);
      if (explicit && explicit.isPlayer() && explicit !== scorer) assister = explicit as Player;
      if (!assister) {
        for (const h of scorer.healers) {
          const e = world.entity(h.id);
          if (!h.dispenser && e && e.isPlayer() && (e as Player).playerClass === TF_CLASS_MEDIC) {
            const inflictor = world.entity(info.inflictor);
            if (!inflictor || !inflictor.isBaseObject()) assister = e as Player;
            break;
          }
        }
      }
      if (!assister) {
        const recent = this.recentDamager(1, TF_TIME_ASSIST_KILL);
        if (recent && recent !== scorer) assister = recent;
      }
      if (assister && assister.team !== scorer.team) assister = null;
    }
    this.pendingAssist = NO_ENTITY;

    // Stats, dominations, revenge (CTF_GameStats::Event_PlayerKilled + CalcDominationAndRevenge).
    let deathFlags = 0;
    this.stats.deaths++;
    if (scorer) {
      scorer.stats.kills++;
      if (info.customKill === TF_DMG_CUSTOM_BACKSTAB) scorer.stats.backstabs++;
      if (isHeadshot(info.customKill)) scorer.stats.headshots++;
      deathFlags |= this.calcDominationAndRevenge(scorer, false);
      this.killedByUnanswered.set(scorer.id, (this.killedByUnanswered.get(scorer.id) ?? 0) + 1);
      scorer.killedByUnanswered.set(this.id, 0);
    } else {
      this.stats.suicides++;
    }
    if (assister) {
      assister.stats.assists++;
      deathFlags |= this.calcDominationAndRevenge(assister, true);
    }

    world.events.push({
      type: 'death',
      victim: this.id,
      attacker: scorer ? scorer.id : 0,
      assister: assister ? assister.id : 0,
      inflictor: info.inflictor > 0 ? info.inflictor : 0,
      weapon: info.killIcon,
      weaponDefIndex: info.weaponDefIndex,
      crit: info.critType,
      customKill: info.customKill,
      damageType: info.damageType,
      deathFlags,
      victimClass: this.playerClass,
      gib,
      burning,
    });
    world.emitEffect({
      kind: gib ? 'gibs' : 'ragdoll',
      pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
      entity: this.id,
      team: this.team,
      value: this.playerClass,
      force: { x: info.force.x + this.velocity.x, y: info.force.y + this.velocity.y, z: info.force.z + this.velocity.z },
    });

    // Drops: ammo pack with the active weapon's model, the flag.
    world.rules.onPlayerKilled(this, info, scorer, assister);
    this.dropAmmoPack();

    // Clean up.
    for (let i = 0; i < WEAPON_SLOTS; i++) this.weapons[i]?.onOwnerDeath();
    this.healers.length = 0;
    this.cond.clear();
    this.afterburnDuration = 0;
    this.blastJumpState = 0;
    this.health = 0;
    this.solid = SOLID_NONE;
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.move.dead = true;
    this.move.moveType = MOVETYPE_NONE;
    set(this.velocity, 0, 0, 0);
    this.doAnimationEvent(PLAYERANIMEVENT_DIE);
    this.respawnAt = world.rules.nextRespawnTime(this);
  }

  private calcDominationAndRevenge(attacker: Player, isAssist: boolean): number {
    let flags = 0;
    const unanswered = (this.killedByUnanswered.get(attacker.id) ?? 0) + 1;
    if (unanswered === TF_KILLS_DOMINATION) {
      flags |= isAssist ? TF_DEATH_ASSISTER_DOMINATION : TF_DEATH_DOMINATION;
      attacker.dominating.add(this.id);
      attacker.stats.dominations++;
    } else if (this.dominating.has(attacker.id)) {
      flags |= isAssist ? TF_DEATH_ASSISTER_REVENGE : TF_DEATH_REVENGE;
      this.dominating.delete(attacker.id);
      attacker.stats.revenges++;
    }
    return flags;
  }

  /** SDK: CTFPlayer::DropAmmoPack — a medium pack with the active weapon's look. */
  dropAmmoPack(): void {
    const w = this.activeWeapon() ?? this.weapons.find((x) => x !== null) ?? null;
    if (!w || !this.world.isServer) return;
    this.world.spawnEntity('tf_ammo_pack', (e) => {
      copy(e.origin, this.origin);
      e.origin.z += 40;
      e.model = w.worldModel;
      e.owner = this.id;
      e.team = this.team;
      copy(e.velocity, this.velocity);
    });
  }

  /** Kill without credit (team change, class change outside spawn with forced respawn, "kill" command). */
  commitSuicide(explode = false): void {
    if (this.lifeState !== LIFE_ALIVE) return;
    const info = this.scratchDamage();
    info.attacker = this.id;
    info.inflictor = this.id;
    info.damage = this.health + 1000;
    info.damageType = explode ? DMG_BLAST | DMG_CRITICAL : DMG_GENERIC;
    info.customKill = 6; // TF_DMG_CUSTOM_SUICIDE
    this.health = 0;
    this.die(info);
    this.releaseScratchDamage();
  }

  // ─── Spawning ────────────────────────────────────────────────────────────

  /**
   * SDK: CTFPlayer::Spawn (via the rules' respawn). Picks a spawn point,
   * resets health/ammo/weapons/movement. Returns false when no spawn point
   * is available (the player stays dead and the rules retry).
   */
  spawnPlayer(): boolean {
    const world = this.world;
    if (this.team !== TF_TEAM_RED && this.team !== TF_TEAM_BLUE) return false;
    if (this.desiredClass > 0 && this.desiredClass < TF_CLASS_COUNT) {
      if (this.desiredClass !== this.playerClass) {
        this.playerClass = this.desiredClass;
        for (let i = 0; i < WEAPON_SLOTS; i++) this.weapons[i] = null;
      }
    }
    if (this.playerClass <= 0) return false;
    const spot = world.spawns.selectSpawnPoint(this);
    if (!spot) return false;

    // Reset movement state.
    const fresh = createMoveState(this.playerClass, this.team);
    copy(fresh.origin, spot.origin);
    set(fresh.velocity, 0, 0, 0);
    this.restoreMoveState(fresh);
    this.move.viewOffsetZ = classEyeHeight(this.playerClass);
    world.spawns.dropToGround(this);
    copy(this.angles, spot.angles);
    copy(this.eyeAngles, spot.angles);
    this.eyeAngles.x = 0;
    this.eyeAngles.z = 0;

    this.lifeState = LIFE_ALIVE;
    this.move.dead = false;
    this.move.moveType = MOVETYPE_WALK;
    this.moveType = MOVETYPE_WALK;
    this.observerMode = OBS_MODE_NONE;
    this.solid = SOLID_BBOX;
    this.solidFlags &= ~FSOLID_NOT_SOLID;
    this.takeDamage = DAMAGE_YES;
    this.effects &= ~EF_NODRAW;
    this.effects |= EF_NOINTERP;
    this.setSize(VEC_HULL_MIN, VEC_HULL_MAX);
    this.cond.clear();
    this.healers.length = 0;
    this.afterburnDuration = 0;
    this.blastJumpState = 0;
    this.damagers.length = 0;
    this.lastDamageTime = -1000;
    this.accumulatedRegen = 0;
    this.healFraction = 0;
    this.lastRegenAt = world.curtime;
    this.respawnAt = 0;
    this.cloakMeter = 100;
    this.meters.fill(100);
    this.carriedFlag = NO_ENTITY;

    this.initClass();
    if (this.weapons.every((w) => w === null)) this.giveDefaultItems();
    else for (const w of this.weapons) w?.refill();
    this.activeSlot = -1;
    const first = this.weapons.findIndex((w) => w !== null);
    if (first >= 0) this.switchToSlot(first);
    this.lastSlot = -1;

    this.doAnimationEvent(PLAYERANIMEVENT_SPAWN);
    world.lagcomp.reset(this.id);
    // Link to the volumes we spawned in (respawn room) right away.
    world.touchTriggers(this);
    world.events.push({ type: 'spawn', player: this.id, team: this.team, cls: this.playerClass });
    world.events.push({ type: 'teleport', player: this.id });
    world.rules.onPlayerSpawned(this);
    return true;
  }

  /** SDK: CTFPlayer::InitClass — max health and full ammo. */
  initClass(): void {
    this.maxHealth = classHealth(this.playerClass);
    this.health = this.maxHealth;
    this.refillAmmo();
  }

  /** SDK: CTFPlayer::Regenerate (resupply cabinet). */
  regenerate(refillHealthAndAmmo = true): void {
    if (!this.alive) return;
    const oldHealth = this.health;
    const oldMax = this.maxHealth;
    const boosted = oldHealth > oldMax;
    this.maxHealth = classHealth(this.playerClass);
    if (refillHealthAndAmmo) {
      this.health = Math.max(boosted ? oldHealth : 0, this.maxHealth);
      for (const c of [TF_COND.BURNING, TF_COND.URINE, TF_COND.MAD_MILK, TF_COND.BLEEDING, TF_COND.ENERGY_BUFF, TF_COND.PHASE]) {
        this.cond.remove(c);
      }
      this.afterburnDuration = 0;
      this.cloakMeter = 100;
      this.meters.fill(100);
      this.refillAmmo();
      for (const w of this.weapons) w?.refill();
    }
    this.world.events.push({ type: 'pickup', player: this.id, item: 'regenerate' });
  }

  /** In one of our own team's respawn rooms (PointInRespawnRoom with the same team). */
  inRespawnRoom(): boolean {
    return this.ownRespawnRoomCount > 0;
  }

  /**
   * SDK: CTFPlayer::HandleCommand_JoinClass. In a respawn room (or with no
   * class yet) the change is instant; otherwise it applies on the next spawn.
   */
  requestClass(cls: number): void {
    if (cls <= 0 || cls >= TF_CLASS_COUNT) return;
    this.desiredClass = cls;
    if (this.lifeState !== LIFE_ALIVE) {
      if (this.playerClass === 0 || this.world.rules.canSpawnInstantly(this)) this.world.rules.respawnNow(this);
      return;
    }
    if (cls === this.playerClass) return;
    if (this.inRespawnRoom()) this.world.rules.respawnNow(this, true);
  }

  /** SDK: CTFPlayer::ChangeTeam — alive players die (no credit), then wait for a wave. */
  requestTeam(team: number): void {
    if (team === this.team) return;
    const old = this.team;
    if (this.lifeState === LIFE_ALIVE) this.commitSuicide();
    this.changeTeam(team);
    this.move.team = team;
    this.world.events.push({ type: 'team', player: this.id, team, oldTeam: old });
    if (team === TEAM_SPECTATOR || team === TEAM_UNASSIGNED) {
      this.observerMode = OBS_MODE_ROAMING;
      this.respawnAt = 0;
    } else {
      this.respawnAt = this.world.rules.nextRespawnTime(this);
    }
  }

  // ─── Network ─────────────────────────────────────────────────────────────

  override netSchema(): NetSchema | null {
    return NET_PLAYER;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.vx = this.velocity.x;
    out.vy = this.velocity.y;
    out.vz = this.velocity.z;
    out.eyePitch = this.eyeAngles.x;
    out.eyeYaw = this.eyeAngles.y;
    out.cls = this.playerClass;
    out.lifeState = this.lifeState;
    out.health = Math.max(-999, Math.min(32767, this.health));
    out.maxHealth = this.maxHealth;
    out.flags = this.move.flags;
    out.ducked = this.move.ducked;
    out.onGround = (this.move.flags & FL_ONGROUND) !== 0;
    for (let i = 0; i < COND_WORDS; i++) out[COND_FIELDS[i]] = this.cond.bits[i];
    const w = this.activeWeapon();
    out.activeWeapon = w ? w.defindex : -1;
    out.activeSlot = this.activeSlot;
    out.animEvent = this.animEvent;
    out.animEventSeq = this.animEventSeq;
    out.disguiseTeam = this.disguiseTeam;
    out.disguiseClass = this.disguiseClass;
    out.disguiseTarget = this.disguiseTarget;
    out.cloak = this.cloakMeter;
    out.carriedFlag = this.carriedFlag;
    out.observerMode = this.observerMode;
    out.observerTarget = this.observerTarget;
    // Private block.
    for (let i = 1; i < TF_AMMO_COUNT; i++) out[AMMO_FIELDS[i]] = this.ammo[i];
    out.lastSlot = this.lastSlot;
    out.respawnAt = this.respawnAt;
    out.nextRegenAt = this.nextRegenTime;
    for (let i = 0; i < 4; i++) out[METER_FIELDS[i]] = this.meters[i];
    out.blastJump = this.blastJumpState;
    writeMoveState(this.move, out);
  }
}

const EMPTY_DAMAGE = createDamageInfo();
const COND_FIELDS = Array.from({ length: COND_WORDS }, (_, i) => `cond${i}`);
const AMMO_FIELDS = Array.from({ length: TF_AMMO_COUNT }, (_, i) => `ammo${i}`);
const METER_FIELDS = ['meter0', 'meter1', 'meter2', 'meter3'];

/** Precomputed `mv_*` record keys for MOVE_STATE_NET_FIELDS (no string building per snapshot). */
const MOVE_KEYS = MOVE_STATE_NET_FIELDS.map(([name, kind]) =>
  kind === 'vec' ? { name, vec: true, k: '', kx: `mv_${name}_x`, ky: `mv_${name}_y`, kz: `mv_${name}_z` } : { name, vec: false, k: `mv_${name}`, kx: '', ky: '', kz: '' },
);

/** Writes the MoveState into `mv_*` fields (vectors as `mv_<name>_x/_y/_z`). */
export function writeMoveState(m: MoveState, out: NetRecord): void {
  const rec = m as unknown as Record<string, unknown>;
  for (let i = 0; i < MOVE_KEYS.length; i++) {
    const f = MOVE_KEYS[i];
    const v = rec[f.name];
    if (f.vec) {
      const vv = v as Vec3;
      out[f.kx] = vv.x;
      out[f.ky] = vv.y;
      out[f.kz] = vv.z;
    } else out[f.k] = v as number | boolean | string;
  }
}

/** Reads `mv_*` fields back into a MoveState (prediction restore). Origin/velocity come from the public fields. */
export function readMoveState(rec: NetRecord, m: MoveState): void {
  const target = m as unknown as Record<string, unknown>;
  for (let i = 0; i < MOVE_KEYS.length; i++) {
    const f = MOVE_KEYS[i];
    if (f.vec) {
      const vv = target[f.name] as Vec3;
      vv.x = rec[f.kx] as number;
      vv.y = rec[f.ky] as number;
      vv.z = rec[f.kz] as number;
    } else target[f.name] = rec[f.k];
  }
  m.origin.x = rec.ox as number;
  m.origin.y = rec.oy as number;
  m.origin.z = rec.oz as number;
  m.velocity.x = rec.vx as number;
  m.velocity.y = rec.vy as number;
  m.velocity.z = rec.vz as number;
}

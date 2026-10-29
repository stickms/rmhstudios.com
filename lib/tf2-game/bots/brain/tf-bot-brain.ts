/**
 * `TFBotBrain` — a TF2 bot (the role of CTFBot and its behaviour tree,
 * tf/bot/**): one `think()` per tick returns the UserCmd a player would
 * send, so bots move through the same playerMove, weapons and rules as
 * humans.
 *
 * Each tick, in order:
 *   1. Bookkeeping: spawn / death (class choice from the team roster).
 *   2. Perception (every few ticks, staggered): vision cone + line of sight,
 *      gunfire heard, who just hurt us; remembered enemies; disguised spies
 *      look friendly until bumped, caught attacking or seen through.
 *   3. Threat choice (CTFBot::SelectTargetPoint's "most dangerous visible").
 *   4. A goal: retreat for health / ammo, the class's job (medic patient,
 *      engineer nest, sniper lane, spy target), else the objective
 *      (./objective.ts).
 *   5. Combat: the right weapon for the range, a lead / arc for
 *      projectiles, fire when the crosshair is on the target; per class
 *      tricks (minigun spin-up, airblast reflects, sticky traps, rocket
 *      jumps, zoomed headshots, backstabs, sappers, über).
 *   6. Movement: follow the nav path to the goal, strafe in a fight, hold
 *      ground on a capture zone.
 *   7. Aim: turn toward the desired view at the difficulty's turn rate, with
 *      its aim error and tracking interval (./difficulty.ts).
 *
 * Deterministic: a seeded stream per bot, the world's clock only. The
 * command object is reused (the host copies it into the world each tick).
 */

import {
  IN_ATTACK,
  IN_ATTACK2,
  IN_DUCK,
  IN_JUMP,
  IN_RELOAD,
  FL_ONGROUND,
  MASK_BLOCKLOS,
  TEAM_SPECTATOR,
  TEAM_UNASSIGNED,
  TF_CLASS_DEMOMAN,
  TF_CLASS_ENGINEER,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  enemyTeam,
} from '../../core/constants';
import { UniformRandomStream } from '../../core/random';
import { emptyTrace, emptyUserCmd, NO_ENTITY, type UserCmd } from '../../core/types';
import { angleDiff, vec3, type Vec3 } from '../../core/vec';
import type { BotDifficulty } from '../../net/events';
import {
  OBJ_ATTACHMENT_SAPPER,
  OBJ_DISPENSER,
  OBJ_SENTRYGUN,
  OBJ_TELEPORTER,
  MODE_TELEPORTER_ENTRANCE,
  MODE_TELEPORTER_EXIT,
} from '../../sim/building-api';
import {
  allObjects,
  builderOf,
  getObjectOfType,
  handleBuildCommand,
  BS_PLACING,
  type TFBaseObject,
} from '../../sim/buildings';
import { TF_COND } from '../../sim/conditions';
import type { Entity } from '../../sim/entity';
import type { TriggerAreaCapture } from '../../sim/entities';
import { BaseProjectile } from '../../sim/physics';
import type { Player } from '../../sim/player';
import { GR_STATE_RND_RUNNING, GR_STATE_TEAM_WIN } from '../../sim/rules';
import {
  SLOT_MELEE,
  SLOT_PRIMARY,
  SLOT_SECONDARY,
  TF_AMMO_METAL,
  type Weapon,
} from '../../sim/weapon-api';
import { Medigun, SniperRifle, StickybombLauncher, requestDisguise } from '../../sim/weapons';
import { MAX_PLAYERS, type GameWorld } from '../../sim/world';
import { NAV_CROUCH } from '../nav/nav-mesh';
import {
  applyMoveIntent,
  newMoveIntent,
  PathFollower,
  type FollowerHost,
  type MoveIntent,
} from '../path';
import type { BotBrain } from '../../server/tf2-match-host';
import { botSkill, type BotSkill } from './difficulty';
import { getBotManager, type BotManager, type SupplySpot } from './manager';
import {
  botHash,
  GOAL_CAPTURE,
  GOAL_DEFEND,
  GOAL_FOLLOW,
  GOAL_NONE,
  GOAL_ROAM,
  GOAL_TOUCH,
  inZone,
  newObjectiveGoal,
  objectiveGoal,
  type ObjectiveGoal,
} from './objective';

// ─── Tunables ───────────────────────────────────────────────────────────────

/** Ticks between perception updates (bots are staggered across them). */
export const PERCEPTION_TICKS = 3;
/** Farthest a bot sees an enemy. */
export const VISION_RANGE = 4500;
/** Seconds an unseen enemy stays remembered. */
export const MEMORY_TIME = 4;
/** Gunfire heard within this range (tf_bot_notice_gunfire_range is 3000; ours is a bit shorter). */
export const HEAR_GUNFIRE_RANGE = 1800;
/** Seconds a suspected spy stays suspected (tf_bot_suspect_spy_forget_cooldown). */
export const SPY_SUSPECT_TIME = 5;
/** Seconds between objective re-evaluations. */
export const GOAL_INTERVAL = 0.4;
/** Seconds a bot holding ground stays on one spot (it then moves to another). */
export const HOLD_SHUFFLE = 6;
/** Seconds a sniper keeps one vantage spot. */
export const SNIPER_RELOCATE = 40;
/** Seconds between voice lines a bot may say. */
export const VOICE_COOLDOWN = 8;

const ROCKET_SPEED = 1100;
const PIPE_SPEED = 1200;
const PIPE_UP = 200;
const PIPE_GRAVITY = 320;
const SYRINGE_SPEED = 1000;

/** Medic patient preference by class (heavy first, like CTFBotMedicHeal's selection). */
const PATIENT_PRIORITY = [0, 3, 1, 6, 5, 2, 9, 4, 1, 4];

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const isPlaying = (team: number): boolean => team === TF_TEAM_RED || team === TF_TEAM_BLUE;

export interface TFBotBrainOptions {
  difficulty?: BotDifficulty;
  /** Seed for the bot's private random stream (default: from the player id). */
  seed?: number;
}

/** Per-bot counters for tests and diagnostics. */
export interface BotStats {
  shots: number;
  goalLabel: string;
  distanceMoved: number;
}

export class TFBotBrain implements BotBrain {
  readonly skill: BotSkill;
  readonly difficulty: BotDifficulty;
  readonly stats: BotStats = { shots: 0, goalLabel: '', distanceMoved: 0 };
  private readonly cmd: UserCmd = emptyUserCmd();
  private readonly rng: UniformRandomStream;
  private readonly follower = new PathFollower();
  private readonly intent: MoveIntent = newMoveIntent();
  private readonly goal: ObjectiveGoal = newObjectiveGoal();
  private mgr: BotManager | null = null;
  private fhost: FollowerHost | null = null;
  /** A class job chose where to go this tick (else the objective does). */
  private jobGoalSet = false;
  private jobStand = false;

  // Memory (indexed by player id).
  private readonly seenAt = new Float32Array(MAX_PLAYERS + 1).fill(-1000);
  private readonly heardAt = new Float32Array(MAX_PLAYERS + 1).fill(-1000);
  private readonly firstSeenAt = new Float32Array(MAX_PLAYERS + 1).fill(-1000);
  private readonly lastX = new Float32Array(MAX_PLAYERS + 1);
  private readonly lastY = new Float32Array(MAX_PLAYERS + 1);
  private readonly lastZ = new Float32Array(MAX_PLAYERS + 1);
  private readonly visible = new Uint8Array(MAX_PLAYERS + 1);
  private readonly suspectUntil = new Float32Array(MAX_PLAYERS + 1).fill(-1000);
  private threat = -1;
  private threatBuilding: TFBaseObject | null = null;
  private lastPerceiveDamage = -1000;
  private lastThreatAt = -1000;

  // Aim.
  private aimYaw = 0;
  private aimPitch = 0;
  private desiredYaw = 0;
  private desiredPitch = 0;
  private readonly tracked = vec3();
  private nextTrackAt = 0;
  private errYaw = 0;
  private errPitch = 0;
  private nextErrAt = 0;
  private snapAim = false;

  // Life.
  private wasAlive = false;
  private spawnedAt = -1000;
  private nextGoalAt = 0;
  private lastPos = vec3();
  private lastVoiceAt = -1000;
  private classChecked = false;
  private strafeSign = 1;
  private nextStrafeFlip = 0;

  // Class state.
  private patient = -1;
  private medicFightUntil = 0;
  private nextPatientAt = 0;
  private buildFail = 0;
  private buildSpot = -1;
  private buildType = -1;
  private placingSince = -1;
  private stickyTrapAt = -1000;
  private stickyCharging = 0;
  private rocketJumpStage = 0;
  private nextRocketJumpAt = 0;
  private sniperSpot = -1;
  private sniperMoveAt = 0;
  private spyTarget = -1;
  private readonly reflectRolled = new Map<number, boolean>();
  private supplyGoal: SupplySpot | null = null;
  private readonly supplyCooldown = new Map<SupplySpot['pos'], number>();

  // Scratch.
  private readonly eye = vec3();
  private readonly v = vec3();
  private readonly w = vec3();
  private readonly aimPoint = vec3();
  private readonly moveGoal = vec3();
  private readonly tr = emptyTrace();

  constructor(player: Player, opts: TFBotBrainOptions = {}) {
    this.difficulty = opts.difficulty ?? 'normal';
    this.skill = botSkill(this.difficulty);
    this.rng = new UniformRandomStream(opts.seed ?? 0x5eed + player.id * 7919);
    this.strafeSign = player.id & 1 ? 1 : -1;
    this.follower.repathInterval = 1.6 + this.rng.randomFloat(0, 0.8);
  }

  // ─── The tick ─────────────────────────────────────────────────────────────

  think(world: GameWorld, player: Player): UserCmd {
    const cmd = this.cmd;
    cmd.forwardMove = 0;
    cmd.sideMove = 0;
    cmd.upMove = 0;
    cmd.buttons = 0;
    cmd.weaponSelect = 0;
    const mgr = (this.mgr ??= getBotManager(world));
    mgr.update();
    if (mgr.pathfinder) this.fhost = mgr.followerHost;
    this.jobGoalSet = false;
    this.jobStand = false;

    if (
      !isPlaying(player.team) ||
      player.team === TEAM_SPECTATOR ||
      player.team === TEAM_UNASSIGNED
    ) {
      this.writeView(cmd);
      return cmd;
    }
    if (!this.classChecked) {
      // The host gave us a random class; the roster decides (in the spawn room the change is instant).
      this.classChecked = true;
      this.pickClass(mgr, player);
    }
    if (!player.alive) {
      if (this.wasAlive) this.onDeath(mgr, player);
      this.wasAlive = false;
      this.writeView(cmd);
      return cmd;
    }
    if (!this.wasAlive) this.onSpawn(world, mgr, player);
    this.wasAlive = true;
    const now = world.curtime;
    const dx = player.origin.x - this.lastPos.x;
    const dy = player.origin.y - this.lastPos.y;
    this.stats.distanceMoved += Math.sqrt(dx * dx + dy * dy);
    this.lastPos.x = player.origin.x;
    this.lastPos.y = player.origin.y;
    this.lastPos.z = player.origin.z;
    player.eyePosition(this.eye);

    // Bonus round losers / preround freeze: just look around.
    const rules = world.rules;
    if (rules.isFrozen(player)) {
      this.writeView(cmd);
      return cmd;
    }

    if ((world.tickCount + player.id) % PERCEPTION_TICKS === 0) this.perceive(world, mgr, player);
    this.chooseThreat(world, player);

    // Goal.
    if (now >= this.nextGoalAt) {
      this.nextGoalAt = now + GOAL_INTERVAL + this.rng.randomFloat(0, 0.1);
      this.planGoal(world, mgr, player);
    }

    // Class jobs (may move, aim and press buttons) and combat.
    this.snapAim = false;
    let holding = false;
    const target = this.threatEntity(world);
    switch (player.playerClass) {
      case TF_CLASS_MEDIC:
        holding = this.medic(world, mgr, player, target);
        break;
      case TF_CLASS_ENGINEER:
        holding = this.engineer(world, mgr, player, target);
        break;
      case TF_CLASS_SPY:
        holding = this.spy(world, mgr, player, target);
        break;
      case TF_CLASS_SNIPER:
        holding = this.sniper(world, mgr, player, target);
        break;
      default:
        break;
    }
    if (!holding && target) this.fight(world, mgr, player, target);
    else if (!holding && !target) this.idleWeapon(world, player);
    if (player.playerClass === TF_CLASS_PYRO) this.airblast(world, player);
    if (player.playerClass === TF_CLASS_DEMOMAN) this.stickyLogic(world, player, target);

    // Movement.
    this.move(world, mgr, player, target, holding);

    // Aim.
    this.turn(world, player);
    this.writeView(cmd);
    if (rules.state === GR_STATE_TEAM_WIN && player.team !== rules.winningTeam)
      cmd.buttons &= ~(IN_ATTACK | IN_ATTACK2);
    return cmd;
  }

  /** One line about what the bot is doing (diagnostics, tests). */
  debugState(world: GameWorld, player: Player): string {
    const f = this.follower;
    return `${player.name.slice(0, 12)} t${player.team} c${player.playerClass} ${player.alive ? 'alive' : 'dead'} hp${player.health} @${player.origin.x | 0},${player.origin.y | 0},${player.origin.z | 0} goal=${this.goal.label}${this.supplyGoal ? '+supply' : ''} job=${this.jobGoalSet ? (this.jobStand ? 'stand' : 'walk') : '-'} mg=${this.moveGoal.x | 0},${this.moveGoal.y | 0},${this.moveGoal.z | 0} path=${f.hasPath ? `${f.index}/${f.path.length}${f.path.reachedGoal ? '' : '!'}` : 'none'} stuck=${f.stuckEvents} repaths=${f.repaths} threat=${this.threat} moved=${this.stats.distanceMoved | 0} slot=${player.activeSlot} t=${world.curtime.toFixed(0)}`;
  }

  private writeView(cmd: UserCmd): void {
    cmd.viewAngles.x = this.aimPitch;
    cmd.viewAngles.y = this.aimYaw;
    cmd.viewAngles.z = 0;
  }

  // ─── Life cycle ───────────────────────────────────────────────────────────

  private pickClass(mgr: BotManager, player: Player): void {
    const cls = mgr.chooseClass(player, this.skill, (n) => this.rng.randomInt(0, n - 1));
    if (cls !== player.playerClass && cls !== player.desiredClass) player.requestClass(cls);
  }

  private onDeath(mgr: BotManager, player: Player): void {
    this.follower.clear();
    this.threat = -1;
    this.threatBuilding = null;
    this.patient = -1;
    this.supplyGoal = null;
    // tf_bot_keep_class_after_death 0: the roster picks again (engineers keep their nest).
    if (player.playerClass !== TF_CLASS_ENGINEER || this.rng.randomFloat() < 0.3)
      this.pickClass(mgr, player);
  }

  private onSpawn(world: GameWorld, mgr: BotManager, player: Player): void {
    this.spawnedAt = world.curtime;
    this.aimYaw = player.eyeAngles.y;
    this.aimPitch = 0;
    this.follower.clear();
    this.nextGoalAt = 0;
    this.buildFail = 0;
    this.buildSpot = -1;
    this.sniperSpot = -1;
    this.spyTarget = -1;
    this.rocketJumpStage = 0;
    this.lastPos.x = player.origin.x;
    this.lastPos.y = player.origin.y;
    this.lastPos.z = player.origin.z;
    this.seenAt.fill(-1000);
    this.heardAt.fill(-1000);
    void mgr;
    if (world.rules.state === GR_STATE_RND_RUNNING && this.rng.randomFloat() < 0.05)
      this.say(world, player, 'Go! Go! Go!');
  }

  private say(world: GameWorld, player: Player, line: string): void {
    if (world.curtime - this.lastVoiceAt < VOICE_COOLDOWN) return;
    this.lastVoiceAt = world.curtime;
    world.events.push({ type: 'voice', player: player.id, line });
  }

  // ─── Perception ───────────────────────────────────────────────────────────

  private perceive(world: GameWorld, mgr: BotManager, player: Player): void {
    const now = world.curtime;
    const team = player.team;
    const eye = this.eye;
    const yaw = this.aimYaw * D2R;
    const pitch = this.aimPitch * D2R;
    const fx = Math.cos(pitch) * Math.cos(yaw);
    const fy = Math.cos(pitch) * Math.sin(yaw);
    const fz = -Math.sin(pitch);
    const cosHalf = Math.cos(this.skill.fov * 0.5 * D2R);
    const mesh = mgr.mesh;
    const dt = PERCEPTION_TICKS * world.frametime;

    // Who just hurt us is known (and a disguised attacker is a spy).
    if (player.lastDamageTime > this.lastPerceiveDamage) {
      this.lastPerceiveDamage = player.lastDamageTime;
      const attacker = player.recentDamager(0, 1.0);
      if (attacker && attacker.team !== team && attacker.alive) {
        this.heardAt[attacker.id] = now;
        this.lastX[attacker.id] = attacker.origin.x;
        this.lastY[attacker.id] = attacker.origin.y;
        this.lastZ[attacker.id] = attacker.origin.z;
        if (attacker.playerClass === TF_CLASS_SPY)
          this.suspectUntil[attacker.id] = now + SPY_SUSPECT_TIME;
      }
    }

    for (let i = 1; i <= MAX_PLAYERS; i++) {
      this.visible[i] = 0;
      const e = world.entities[i] as Player | undefined;
      if (!e || e.removed || !e.alive || e === player || e.team === team || !isPlaying(e.team))
        continue;
      const ex = e.origin.x - eye.x;
      const ey = e.origin.y - eye.y;
      const ez = e.origin.z + 40 - eye.z;
      const d2 = ex * ex + ey * ey + ez * ez;
      const d = Math.sqrt(d2);
      // Gunfire.
      if (e.buttons & IN_ATTACK && d < HEAR_GUNFIRE_RANGE && !e.cond.has(TF_COND.STEALTHED)) {
        this.heardAt[i] = now;
        this.lastX[i] = e.origin.x;
        this.lastY[i] = e.origin.y;
        this.lastZ[i] = e.origin.z;
      }
      // Cloaked: only a flicker, fire, or a bump gives them away.
      if (
        e.cond.has(TF_COND.STEALTHED) &&
        !e.cond.has(TF_COND.STEALTHED_BLINK) &&
        !e.cond.has(TF_COND.BURNING) &&
        d > 70
      )
        continue;
      // Disguised as one of ours: friendly until suspected.
      const disguised = e.cond.has(TF_COND.DISGUISED) && e.disguiseTeam === team;
      if (disguised && this.suspectUntil[i] < now) {
        if (d < 60)
          this.suspectUntil[i] = now + SPY_SUSPECT_TIME; // bumped
        else if (d < 500 && this.rng.randomFloat() < this.skill.spyNotice * dt * 4) {
          this.suspectUntil[i] = now + SPY_SUSPECT_TIME;
          this.say(world, player, 'Spy!');
        }
        if (this.suspectUntil[i] < now) continue;
      }
      const inFov = d < 150 || (ex * fx + ey * fy + ez * fz) / (d || 1) >= cosHalf;
      if (!inFov && this.heardAt[i] < now - 0.5) continue;
      if (d > VISION_RANGE) continue;
      // The nav mesh's sector PVS rules most pairs out without a trace.
      const ma = mgr.playerArea[player.id];
      const ta = mgr.playerArea[i];
      if (mesh && ma >= 0 && ta >= 0 && !mesh.isPotentiallyVisible(ma, ta)) continue;
      this.w.x = e.origin.x;
      this.w.y = e.origin.y;
      this.w.z = e.origin.z + (e.move.ducked ? 30 : 48);
      const tr = world.traceLineWorldOnly(eye, this.w, MASK_BLOCKLOS, this.tr);
      if (tr.fraction < 1) continue;
      if (!inFov) {
        // Heard and in the open: we turn to it but have not seen it yet.
        continue;
      }
      this.visible[i] = 1;
      if (now - this.seenAt[i] > 2) {
        this.firstSeenAt[i] = now;
        if (this.rng.randomFloat() < 0.04) this.say(world, player, 'Incoming');
      }
      this.seenAt[i] = now;
      this.lastX[i] = e.origin.x;
      this.lastY[i] = e.origin.y;
      this.lastZ[i] = e.origin.z;
    }

    // Enemy sentries in view.
    this.threatBuilding = null;
    let best = 1600;
    for (const o of allObjects(world)) {
      if (o.removed || o.team === team || o.objectType !== OBJ_SENTRYGUN || o.placing || o.carried)
        continue;
      const d = Math.hypot(o.origin.x - eye.x, o.origin.y - eye.y, o.origin.z + 30 - eye.z);
      if (d > best) continue;
      if (mesh && mgr.playerArea[player.id] >= 0) {
        const sa = mesh.areaAt(o.origin.x, o.origin.y, o.origin.z + 4);
        if (sa >= 0 && !mesh.isPotentiallyVisible(mgr.playerArea[player.id], sa)) continue;
      }
      this.w.x = o.origin.x;
      this.w.y = o.origin.y;
      this.w.z = o.origin.z + 30;
      const tr = world.traceLineWorldOnly(eye, this.w, MASK_BLOCKLOS, this.tr);
      if (tr.fraction < 1) continue;
      best = d;
      this.threatBuilding = o;
    }
  }

  /** Recognized = seen long enough to react to (GetMinRecognizeTime). */
  private recognized(i: number, now: number): boolean {
    return this.visible[i] === 1 && now - this.firstSeenAt[i] >= this.skill.reactionTime;
  }

  private chooseThreat(world: GameWorld, player: Player): void {
    const now = world.curtime;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      if (!this.recognized(i, now)) continue;
      const e = world.entities[i] as Player | undefined;
      if (!e || e.removed || !e.alive) {
        this.visible[i] = 0;
        continue;
      }
      let score = Math.hypot(
        e.origin.x - player.origin.x,
        e.origin.y - player.origin.y,
        e.origin.z - player.origin.z,
      );
      if (i === this.threat) score -= 250;
      if (e.playerClass === TF_CLASS_MEDIC) score -= 150;
      if (e.carriedFlag !== NO_ENTITY) score -= 400;
      if (e.cond.has(TF_COND.INVULNERABLE)) score += 1500;
      if (player.recentDamager(0, 2) === e) score -= 300;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    this.threat = best;
    if (best >= 0) this.lastThreatAt = now;
  }

  private threatEntity(world: GameWorld): Entity | null {
    if (this.threat > 0) {
      const p = world.player(this.threat);
      if (p && p.alive) return p;
    }
    // A sentry is a target for the classes that can take one out.
    const s = this.threatBuilding;
    if (s && !s.removed) return s;
    return null;
  }

  /** The most recently known enemy position within `maxAge` seconds (−1 none). */
  private recentEnemy(world: GameWorld, player: Player, maxAge: number): number {
    const now = world.curtime;
    let best = -1;
    let bestD = Infinity;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const t = Math.max(this.seenAt[i], this.heardAt[i]);
      if (now - t > maxAge) continue;
      const e = world.entities[i] as Player | undefined;
      if (!e || e.removed || !e.alive || e.team === player.team) continue;
      const d = Math.hypot(this.lastX[i] - player.origin.x, this.lastY[i] - player.origin.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  // ─── Goals ────────────────────────────────────────────────────────────────

  private planGoal(world: GameWorld, mgr: BotManager, player: Player): void {
    const g = this.goal;
    objectiveGoal(world, mgr, player, g);
    this.stats.goalLabel = g.label;

    // Retreat for health or ammo (CTFBotGetHealth / CTFBotGetAmmo), unless the objective is urgent.
    const lowHealth =
      player.health < player.maxHealth * this.skill.retreatHealth && player.healers.length === 0;
    const needAmmo = this.needsAmmo(player);
    const capping = g.kind === GOAL_CAPTURE && inZone(world, g, player, this.w);
    // Close to the enemy intelligence: no turning back now.
    const closing =
      g.kind === GOAL_TOUCH &&
      Math.hypot(g.pos.x - player.origin.x, g.pos.y - player.origin.y) < 900;
    if (
      (lowHealth || needAmmo) &&
      !(g.urgent && capping) &&
      !closing &&
      player.carriedFlag === NO_ENTITY
    ) {
      const spot = this.nearestSupply(world, mgr, player, lowHealth, needAmmo);
      if (spot) {
        this.supplyGoal = spot;
        if (lowHealth && this.rng.randomFloat() < 0.5) this.say(world, player, 'Medic!');
        return;
      }
    }
    this.supplyGoal = null;
  }

  private needsAmmo(p: Player): boolean {
    const w0 = p.weapons[SLOT_PRIMARY];
    if (p.playerClass === TF_CLASS_ENGINEER)
      return p.ammo[TF_AMMO_METAL] < 60 && !getObjectOfType(p, OBJ_SENTRYGUN);
    if (!w0 || w0.ammoType === 0) return false;
    const reserve = p.ammo[w0.ammoType];
    const clip = w0.clip > 0 ? w0.clip : 0;
    return reserve + clip <= Math.max(1, Math.floor(p.maxAmmo[w0.ammoType] * 0.1));
  }

  private nearestSupply(
    world: GameWorld,
    mgr: BotManager,
    p: Player,
    health: boolean,
    ammo: boolean,
  ): SupplySpot | null {
    let best: SupplySpot | null = null;
    let bestD = 2500;
    const now = world.curtime;
    for (const s of mgr.supplies) {
      if (s.team && s.team !== p.team) continue;
      if ((health && !s.health) || (!health && ammo && !s.ammo)) continue;
      if ((this.supplyCooldown.get(s.pos) ?? -1) > now) continue;
      const d = Math.hypot(s.pos.x - p.origin.x, s.pos.y - p.origin.y, (s.pos.z - p.origin.z) * 2);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    // A friendly dispenser.
    for (const o of allObjects(world)) {
      if (
        o.removed ||
        o.team !== p.team ||
        o.objectType !== OBJ_DISPENSER ||
        o.building ||
        o.placing ||
        o.carried
      )
        continue;
      const d = Math.hypot(o.origin.x - p.origin.x, o.origin.y - p.origin.y);
      if (d < bestD) {
        bestD = d;
        best = { entity: o, pos: o.origin, health: true, ammo: true, team: p.team };
      }
    }
    return best;
  }

  // ─── Movement ─────────────────────────────────────────────────────────────

  /** Sets where to walk this tick; returns whether to stand still there. */
  private chooseMoveGoal(
    world: GameWorld,
    mgr: BotManager,
    player: Player,
    target: Entity | null,
    holding: boolean,
  ): boolean {
    const g = this.goal;
    const mg = this.moveGoal;
    const now = world.curtime;
    if (holding) return true;
    if (this.supplyGoal) {
      const s = this.supplyGoal;
      mg.x = s.pos.x;
      mg.y = s.pos.y;
      mg.z = s.pos.z;
      const d = Math.hypot(s.pos.x - player.origin.x, s.pos.y - player.origin.y);
      if (d < 40 || (s.entity && s.entity.removed)) {
        this.supplyCooldown.set(s.pos, now + 12);
        this.supplyGoal = null;
      }
      if (s.entity && s.entity.isBaseObject() && d < 90) return true;
      return false;
    }
    // Chase a fleeing enemy only when the objective is not pressing.
    const fightRange = this.preferredRange(player);
    if (target && target.isPlayer() && g.kind !== GOAL_CAPTURE && g.kind !== GOAL_TOUCH) {
      const d = Math.hypot(target.origin.x - player.origin.x, target.origin.y - player.origin.y);
      if (d > fightRange * 1.3 && this.skill.aggression > botHash(player.id, 21)) {
        mg.x = target.origin.x;
        mg.y = target.origin.y;
        mg.z = target.origin.z;
        return false;
      }
    }
    switch (g.kind) {
      case GOAL_CAPTURE:
        if (inZone(world, g, player, this.w)) {
          // Hold the zone, shuffling to another of its spots now and then (harder to hit).
          if (g.zone && !g.entity && mgr.mesh) return this.shuffle(world, mgr, player, null, 0);
          return true;
        }
        if (g.entity && !g.zone) {
          mg.x = g.entity.origin.x;
          mg.y = g.entity.origin.y;
          mg.z = g.entity.origin.z;
        } else if (g.entity && g.zone) {
          // The cart's zone moves with it: walk at the cart.
          mg.x = g.entity.origin.x;
          mg.y = g.entity.origin.y;
          mg.z = g.entity.origin.z;
        } else {
          mg.x = g.pos.x;
          mg.y = g.pos.y;
          mg.z = g.pos.z;
        }
        return false;
      case GOAL_FOLLOW: {
        const e = g.entity;
        const p = e && !e.removed ? e.origin : g.pos;
        mg.x = p.x;
        mg.y = p.y;
        mg.z = p.z;
        return (
          Math.hypot(p.x - player.origin.x, p.y - player.origin.y) < g.radius &&
          Math.abs(p.z - player.origin.z) < 120
        );
      }
      case GOAL_DEFEND: {
        mg.x = g.pos.x;
        mg.y = g.pos.y;
        mg.z = g.pos.z;
        const d = Math.hypot(g.pos.x - player.origin.x, g.pos.y - player.origin.y);
        // Hold around the point, moving between spots in the radius now and then.
        if (d < g.radius && mgr.mesh)
          return this.shuffle(world, mgr, player, g.pos, g.radius * 0.6);
        return false;
      }
      case GOAL_TOUCH:
        mg.x = g.pos.x;
        mg.y = g.pos.y;
        mg.z = g.pos.z;
        return false;
      case GOAL_ROAM:
      case GOAL_NONE:
      default: {
        // Seek the nearest remembered enemy, else the enemy's spawn side.
        const e = this.recentEnemy(world, player, 10);
        if (e >= 0) {
          mg.x = this.lastX[e];
          mg.y = this.lastY[e];
          mg.z = this.lastZ[e];
        } else mgr.spawnCenter(enemyTeam(player.team), mg);
        return false;
      }
    }
  }

  private move(
    world: GameWorld,
    mgr: BotManager,
    player: Player,
    target: Entity | null,
    holding: boolean,
  ): void {
    const cmd = this.cmd;
    const it = this.intent;
    const stand = this.jobGoalSet
      ? this.jobStand
      : this.chooseMoveGoal(world, mgr, player, target, holding);
    it.dirX = it.dirY = it.speed = 0;
    it.jump = it.duck = false;
    const pf = mgr.pathfinder;
    const host = this.fhost;
    if (!stand) {
      if (pf && host) {
        this.follower.setGoal(host, world, player.origin, this.moveGoal, player.team);
        this.follower.update(
          host,
          world,
          player.origin,
          player.velocity,
          player.move.flags,
          player.move.waterLevel,
          it,
        );
      } else {
        // No mesh yet (generating): walk straight at it.
        const dx = this.moveGoal.x - player.origin.x;
        const dy = this.moveGoal.y - player.origin.y;
        const d = Math.hypot(dx, dy);
        if (d > 32) {
          it.dirX = dx / d;
          it.dirY = dy / d;
          it.speed = 1;
          it.look.x = this.moveGoal.x;
          it.look.y = this.moveGoal.y;
          it.look.z = this.moveGoal.z + 60;
        }
      }
    } else if (pf && mgr.mesh) {
      // Crouch areas still need the duck while standing in them.
      const a = mgr.mesh.areaAt(player.origin.x, player.origin.y, player.origin.z + 4);
      if (a >= 0 && mgr.mesh.attrs[a] & NAV_CROUCH) it.duck = true;
    }

    // Fighting: strafe across the line of fire (not while capturing in a tight zone, not snipers/engineers on duty).
    const now = world.curtime;
    if (
      target &&
      player.playerClass !== TF_CLASS_SNIPER &&
      !(player.playerClass === TF_CLASS_HEAVYWEAPONS && player.cond.has(TF_COND.AIMING) && stand)
    ) {
      if (now >= this.nextStrafeFlip) {
        this.nextStrafeFlip = now + this.rng.randomFloat(0.4, 1.4);
        this.strafeSign = this.rng.randomFloat() < 0.5 ? -1 : 1;
      }
      const tx = target.origin.x - player.origin.x;
      const ty = target.origin.y - player.origin.y;
      const tl = Math.hypot(tx, ty) || 1;
      const px = -ty / tl;
      const py = tx / tl;
      const strafe =
        player.playerClass === TF_CLASS_SCOUT
          ? 1
          : player.playerClass === TF_CLASS_HEAVYWEAPONS
            ? 0.3
            : 0.7;
      let mx = it.dirX * it.speed + px * this.strafeSign * strafe;
      let my = it.dirY * it.speed + py * this.strafeSign * strafe;
      // Keep a class's distance: back off when too close (pyros and melee press in).
      const want = this.preferredRange(player);
      if (
        tl < want * 0.5 &&
        player.playerClass !== TF_CLASS_PYRO &&
        player.activeSlot !== SLOT_MELEE
      ) {
        mx -= (tx / tl) * 0.6;
        my -= (ty / tl) * 0.6;
      } else if (tl > want && (stand || it.speed === 0)) {
        mx += (tx / tl) * 0.5;
        my += (ty / tl) * 0.5;
      }
      const ml = Math.hypot(mx, my);
      if (ml > 0.05) {
        it.dirX = mx / ml;
        it.dirY = my / ml;
        it.speed = Math.min(1, ml);
      }
      if (
        player.playerClass === TF_CLASS_SCOUT &&
        player.move.flags & FL_ONGROUND &&
        this.rng.randomFloat() < 0.02
      )
        it.jump = true;
    }

    // Look where we go when there is nothing to aim at.
    if (!target && !this.hasCustomAim) {
      if (it.speed > 0) this.lookAt(it.look.x, it.look.y, it.look.z, player);
      else {
        const e = this.recentEnemy(world, player, MEMORY_TIME);
        if (e >= 0) this.lookAt(this.lastX[e], this.lastY[e], this.lastZ[e] + 50, player);
      }
    }
    this.hasCustomAim = false;

    // Rocket jump toward far goals.
    if (this.rocketJumpStage > 0) {
      it.jump = this.rocketJumpStage === 2;
      it.duck = true;
    }
    applyMoveIntent(it, this.aimYaw, cmd, IN_JUMP, IN_DUCK);
    this.maybeRocketJump(world, player, target);
  }

  private hasCustomAim = false;
  private shuffleAt = 0;
  private shuffling = false;
  private readonly shuffleGoal = vec3();

  /**
   * Holding ground: stand, but every HOLD_SHUFFLE seconds walk to another spot —
   * a random area of the capture zone, or within `radius` of `center`.
   * Returns whether to stand still this tick (else moveGoal is set).
   */
  private shuffle(
    world: GameWorld,
    mgr: BotManager,
    player: Player,
    center: Vec3 | null,
    radius: number,
  ): boolean {
    const mesh = mgr.mesh!;
    const now = world.curtime;
    const mg = this.moveGoal;
    if (this.shuffling) {
      const d = Math.hypot(
        this.shuffleGoal.x - player.origin.x,
        this.shuffleGoal.y - player.origin.y,
      );
      if (d > 32 && now < this.shuffleAt + 4) {
        mg.x = this.shuffleGoal.x;
        mg.y = this.shuffleGoal.y;
        mg.z = this.shuffleGoal.z;
        return false;
      }
      this.shuffling = false;
      this.shuffleAt = now + HOLD_SHUFFLE + this.rng.randomFloat(0, HOLD_SHUFFLE * 0.6);
      return true;
    }
    if (now < this.shuffleAt) return true;
    let a = -1;
    const zone = this.goal.zone;
    if (!center && zone && zone.classname === 'trigger_capture_area') {
      const list = mgr.captureAreas(zone as TriggerAreaCapture);
      if (list.length > 0) a = list[this.rng.randomInt(0, list.length - 1)];
    } else if (center) {
      a = mesh.nearestArea(
        center.x + this.rng.randomFloat(-radius, radius),
        center.y + this.rng.randomFloat(-radius, radius),
        center.z,
        300,
      );
    }
    if (a < 0) {
      this.shuffleAt = now + HOLD_SHUFFLE;
      return true;
    }
    mesh.center(a, this.shuffleGoal);
    this.shuffling = true;
    this.shuffleAt = now;
    mg.x = this.shuffleGoal.x;
    mg.y = this.shuffleGoal.y;
    mg.z = this.shuffleGoal.z;
    return false;
  }

  private maybeRocketJump(world: GameWorld, player: Player, target: Entity | null): void {
    const cmd = this.cmd;
    if (player.playerClass !== TF_CLASS_SOLDIER || !this.skill.rocketJumps) return;
    const now = world.curtime;
    if (this.rocketJumpStage === 2) {
      // Look down behind the direction of travel and fire as we leave the ground.
      this.aimPitch = 75;
      cmd.buttons |= IN_ATTACK | IN_JUMP | IN_DUCK;
      cmd.viewAngles.x = 75;
      this.rocketJumpStage = 1;
      return;
    }
    if (this.rocketJumpStage === 1) {
      this.rocketJumpStage = 0;
      return;
    }
    if (
      target ||
      now < this.nextRocketJumpAt ||
      player.health < 150 ||
      !(player.move.flags & FL_ONGROUND)
    )
      return;
    if (player.activeSlot !== SLOT_PRIMARY) return;
    const w = player.weapons[SLOT_PRIMARY];
    if (!w || w.clip < 2) return;
    if (this.intent.speed < 0.9 || this.follower.remainingDistance(player.origin) < 1500) return;
    this.nextRocketJumpAt = now + this.rng.randomFloat(8, 20);
    if (this.rng.randomFloat() < 0.5) return;
    this.rocketJumpStage = 2;
  }

  // ─── Aim ──────────────────────────────────────────────────────────────────

  private lookAt(x: number, y: number, z: number, player: Player): void {
    const ex = x - this.eye.x;
    const ey = y - this.eye.y;
    const ez = z - this.eye.z;
    if (ex * ex + ey * ey < 1) return;
    this.desiredYaw = Math.atan2(ey, ex) * R2D;
    this.desiredPitch = -Math.atan2(ez, Math.hypot(ex, ey)) * R2D;
    void player;
  }

  /** Aims at a point with the difficulty's tracking interval and error. */
  private aimAt(world: GameWorld, p: Vec3, precise: boolean, errorScale = 1): void {
    const now = world.curtime;
    if (now >= this.nextTrackAt || precise) {
      this.tracked.x = p.x;
      this.tracked.y = p.y;
      this.tracked.z = p.z;
      this.nextTrackAt = now + this.skill.aimTrackInterval;
    }
    if (now >= this.nextErrAt) {
      this.nextErrAt = now + this.rng.randomFloat(0.3, 0.9);
      const s = this.skill.aimErrorDeg;
      this.errYaw = (this.rng.randomFloat(-1, 1) + this.rng.randomFloat(-1, 1)) * s * 0.7;
      this.errPitch = (this.rng.randomFloat(-1, 1) + this.rng.randomFloat(-1, 1)) * s * 0.4;
    }
    const ex = this.tracked.x - this.eye.x;
    const ey = this.tracked.y - this.eye.y;
    const ez = this.tracked.z - this.eye.z;
    this.desiredYaw = Math.atan2(ey, ex) * R2D + (precise ? 0 : this.errYaw * errorScale);
    this.desiredPitch =
      -Math.atan2(ez, Math.hypot(ex, ey)) * R2D + (precise ? 0 : this.errPitch * errorScale);
    this.hasCustomAim = true;
  }

  private turn(world: GameWorld, player: Player): void {
    const dt = world.frametime;
    const max = this.snapAim ? 1e9 : this.skill.turnRate * dt;
    const dy = angleDiff(this.desiredYaw, this.aimYaw);
    const dp = this.desiredPitch - this.aimPitch;
    const len = Math.hypot(dy, dp);
    const k = len > max ? max / len : 1;
    this.aimYaw = normalizeYaw(this.aimYaw + dy * k);
    this.aimPitch = clampPitch(this.aimPitch + dp * k);
    void player;
  }

  /** Is the view within `tol` degrees of the desired direction? */
  private onTarget(tol: number): boolean {
    return (
      Math.abs(angleDiff(this.desiredYaw, this.aimYaw)) < tol &&
      Math.abs(this.desiredPitch - this.aimPitch) < tol
    );
  }

  // ─── Combat ───────────────────────────────────────────────────────────────

  private preferredRange(p: Player): number {
    switch (p.playerClass) {
      case TF_CLASS_SCOUT:
        return 300;
      case TF_CLASS_SOLDIER:
        return 500;
      case TF_CLASS_PYRO:
        return 150;
      case TF_CLASS_DEMOMAN:
        return 600;
      case TF_CLASS_HEAVYWEAPONS:
        return 500;
      case TF_CLASS_ENGINEER:
        return 400;
      case TF_CLASS_MEDIC:
        return 400;
      case TF_CLASS_SNIPER:
        return 1500;
      case TF_CLASS_SPY:
        return 60;
      default:
        return 500;
    }
  }

  private select(slot: number, player: Player): boolean {
    if (player.activeSlot === slot) return true;
    const w = player.weapons[slot];
    if (!w || !w.canDeploy()) return false;
    this.cmd.weaponSelect = slot + 1;
    return false;
  }

  private hasAmmo(w: Weapon | null, player: Player): boolean {
    if (!w) return false;
    if (w.ammoType === 0) return true;
    return (w.maxClip >= 0 && w.clip > 0) || player.ammo[w.ammoType] > 0;
  }

  /** Target point for hitscan: the body, a little higher for the far ones. */
  private bodyPoint(target: Entity, out: Vec3): Vec3 {
    out.x = target.origin.x;
    out.y = target.origin.y;
    out.z = target.origin.z + (target.isPlayer() ? ((target as Player).move.ducked ? 30 : 44) : 24);
    return out;
  }

  /** Lead a projectile of `speed` at the target (two iterations), scaled by skill. */
  private leadPoint(target: Entity, speed: number, out: Vec3, feet: boolean): Vec3 {
    this.bodyPoint(target, out);
    if (feet && target.isPlayer() && (target as Player).move.flags & FL_ONGROUND)
      out.z = target.origin.z + 6;
    const lead = this.skill.leadAccuracy;
    let t = 0;
    for (let k = 0; k < 2; k++) {
      const dx = out.x + target.velocity.x * t - this.eye.x;
      const dy = out.y + target.velocity.y * t - this.eye.y;
      const dz = out.z - this.eye.z;
      t = Math.sqrt(dx * dx + dy * dy + dz * dz) / speed;
    }
    out.x += target.velocity.x * t * lead;
    out.y += target.velocity.y * t * lead;
    if (!feet) out.z += target.velocity.z * t * lead * 0.5;
    return out;
  }

  /** Elevation (degrees up) that lands a grenade at horizontal distance d and height h. */
  private pipeElevation(d: number, h: number): number {
    let best = 10;
    let bestErr = Infinity;
    for (let deg = -15; deg <= 60; deg += 1.5) {
      const r = deg * D2R;
      const vh = PIPE_SPEED * Math.cos(r) - PIPE_UP * Math.sin(r);
      const vz = PIPE_SPEED * Math.sin(r) + PIPE_UP * Math.cos(r);
      if (vh <= 1) continue;
      const t = d / vh;
      const z = vz * t - 0.5 * PIPE_GRAVITY * t * t;
      const err = Math.abs(z - h);
      if (err < bestErr) {
        bestErr = err;
        best = deg;
      }
    }
    return best;
  }

  private fire(alt = false): void {
    this.cmd.buttons |= alt ? IN_ATTACK2 : IN_ATTACK;
    if (!alt) this.stats.shots++;
  }

  /** Fights `target` with the class's weapons. */
  private fight(world: GameWorld, mgr: BotManager, player: Player, target: Entity): void {
    void mgr;
    const cls = player.playerClass;
    const ap = this.aimPoint;
    const d = Math.hypot(
      target.origin.x - player.origin.x,
      target.origin.y - player.origin.y,
      target.origin.z - player.origin.z,
    );
    const primary = player.weapons[SLOT_PRIMARY];
    const secondary = player.weapons[SLOT_SECONDARY];
    const melee = player.weapons[SLOT_MELEE];
    const priOk = this.hasAmmo(primary, player);
    const secOk = this.hasAmmo(secondary, player);
    const tolHit = Math.max(1.5, Math.atan2(22, d) * R2D) + 1;
    let slot = SLOT_PRIMARY;

    if (d < 90 && cls !== TF_CLASS_PYRO && cls !== TF_CLASS_HEAVYWEAPONS && melee)
      slot = SLOT_MELEE;
    switch (cls) {
      case TF_CLASS_SCOUT:
        slot =
          d > 650 && secOk
            ? SLOT_SECONDARY
            : priOk
              ? SLOT_PRIMARY
              : secOk
                ? SLOT_SECONDARY
                : SLOT_MELEE;
        break;
      case TF_CLASS_SOLDIER:
        slot =
          priOk && (primary!.clip > 0 || d > 400)
            ? SLOT_PRIMARY
            : secOk
              ? SLOT_SECONDARY
              : SLOT_MELEE;
        if (d < 110 && !priOk) slot = SLOT_MELEE;
        break;
      case TF_CLASS_PYRO:
        slot =
          d < 380 && priOk
            ? SLOT_PRIMARY
            : secOk
              ? SLOT_SECONDARY
              : priOk
                ? SLOT_PRIMARY
                : SLOT_MELEE;
        break;
      case TF_CLASS_DEMOMAN:
        slot =
          d < 100 && melee
            ? SLOT_MELEE
            : priOk && d < 1600
              ? SLOT_PRIMARY
              : secOk
                ? SLOT_SECONDARY
                : SLOT_MELEE;
        break;
      case TF_CLASS_HEAVYWEAPONS:
        slot = priOk ? SLOT_PRIMARY : secOk ? SLOT_SECONDARY : SLOT_MELEE;
        break;
      case TF_CLASS_ENGINEER:
        slot =
          d < 80
            ? SLOT_MELEE
            : priOk && d < 900
              ? SLOT_PRIMARY
              : secOk
                ? SLOT_SECONDARY
                : SLOT_MELEE;
        break;
      case TF_CLASS_MEDIC:
        slot = d < 90 ? SLOT_MELEE : priOk ? SLOT_PRIMARY : SLOT_MELEE;
        break;
      case TF_CLASS_SNIPER:
        slot =
          d < 90
            ? SLOT_MELEE
            : d < 500 && secOk
              ? SLOT_SECONDARY
              : priOk
                ? SLOT_PRIMARY
                : SLOT_MELEE;
        break;
      case TF_CLASS_SPY:
        slot = d < 100 ? SLOT_MELEE : priOk ? SLOT_PRIMARY : SLOT_MELEE;
        break;
    }
    if (!priOk && !secOk) slot = SLOT_MELEE;
    const ready = this.select(slot, player);

    // Aim point by weapon.
    let tol = tolHit;
    if (slot === SLOT_PRIMARY && cls === TF_CLASS_SOLDIER) {
      this.leadPoint(target, ROCKET_SPEED, ap, d > 180 && target.origin.z <= player.origin.z + 40);
      tol = Math.max(3, Math.atan2(60, d) * R2D);
    } else if (slot === SLOT_PRIMARY && cls === TF_CLASS_DEMOMAN) {
      this.leadPoint(target, PIPE_SPEED, ap, true);
      const hd = Math.hypot(ap.x - this.eye.x, ap.y - this.eye.y);
      const elev = this.pipeElevation(hd, ap.z - this.eye.z);
      ap.z = this.eye.z + Math.tan(elev * D2R) * hd;
      tol = Math.max(3, Math.atan2(50, d) * R2D);
    } else if (slot === SLOT_PRIMARY && cls === TF_CLASS_MEDIC) {
      this.leadPoint(target, SYRINGE_SPEED, ap, false);
      ap.z += ((d * d) / (SYRINGE_SPEED * SYRINGE_SPEED)) * 0.5 * 240;
      tol = 4;
    } else if (slot === SLOT_PRIMARY && cls === TF_CLASS_PYRO) {
      this.bodyPoint(target, ap);
      tol = 12;
    } else if (slot === SLOT_PRIMARY && cls === TF_CLASS_SNIPER) {
      this.headPoint(target, ap);
    } else {
      this.bodyPoint(target, ap);
      if (slot === SLOT_MELEE) tol = 25;
    }
    this.aimAt(world, ap, false);
    if (!ready) return;

    // Fire.
    const inRange =
      slot === SLOT_MELEE
        ? d < 110
        : cls === TF_CLASS_PYRO && slot === SLOT_PRIMARY
          ? d < 420
          : d < 2600;
    if (cls === TF_CLASS_HEAVYWEAPONS && slot === SLOT_PRIMARY) {
      this.cmd.buttons |= IN_ATTACK2; // keep the barrel spinning while engaged
      if (inRange && this.onTarget(Math.max(tol, 4))) this.fire();
      return;
    }
    if (cls === TF_CLASS_SNIPER && slot === SLOT_PRIMARY) {
      this.sniperShoot(world, player, target, d);
      return;
    }
    if (inRange && this.onTarget(tol)) this.fire();
  }

  private headPoint(target: Entity, out: Vec3): Vec3 {
    if (target.isPlayer()) {
      const p = target as Player;
      out.x = p.origin.x;
      out.y = p.origin.y;
      out.z = p.origin.z + p.move.viewOffsetZ - 2;
      return out;
    }
    return this.bodyPoint(target, out);
  }

  /** Nothing to shoot: reload, keep the minigun cool, switch back to the main gun. */
  private idleWeapon(world: GameWorld, player: Player): void {
    const now = world.curtime;
    const cls = player.playerClass;
    if (cls === TF_CLASS_MEDIC || cls === TF_CLASS_ENGINEER || cls === TF_CLASS_SPY) return;
    const primary = player.weapons[SLOT_PRIMARY];
    if (
      primary &&
      this.hasAmmo(primary, player) &&
      player.activeSlot !== SLOT_PRIMARY &&
      now - this.lastThreatAt > 1
    ) {
      this.select(SLOT_PRIMARY, player);
      return;
    }
    const w = player.activeWeapon();
    if (
      w &&
      w.maxClip > 0 &&
      w.clip < w.maxClip &&
      now - this.lastThreatAt > 1.5 &&
      player.ammo[w.ammoType] > 0
    )
      this.cmd.buttons |= IN_RELOAD;
    // Heavies spin up when an enemy was seen or heard close by a moment ago.
    if (cls === TF_CLASS_HEAVYWEAPONS && player.activeSlot === SLOT_PRIMARY) {
      const e = this.recentEnemy(world, player, 1.5);
      if (
        e >= 0 &&
        Math.hypot(this.lastX[e] - player.origin.x, this.lastY[e] - player.origin.y) < 1200
      )
        this.cmd.buttons |= IN_ATTACK2;
    }
  }

  // ─── Pyro: reflect ────────────────────────────────────────────────────────

  private airblast(world: GameWorld, player: Player): void {
    if (player.activeSlot !== SLOT_PRIMARY || (world.tickCount + player.id) % 2 !== 0) return;
    const primary = player.weapons[SLOT_PRIMARY];
    if (!primary || player.ammo[primary.ammoType] < 20) return;
    const eye = this.eye;
    let best: Entity | null = null;
    let bestD = 260;
    world.forEachEntity((e) => {
      if (!(e instanceof BaseProjectile) || e.team === player.team || e.removed) return;
      const cn = e.classname;
      if (cn.indexOf('rocket') < 0 && cn.indexOf('pipe') < 0) return;
      const dx = eye.x - e.origin.x;
      const dy = eye.y - e.origin.y;
      const dz = eye.z - 20 - e.origin.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > bestD) return;
      // Coming at us?
      if (e.velocity.x * dx + e.velocity.y * dy + e.velocity.z * dz <= 0 && d > 90) return;
      best = e;
      bestD = d;
    });
    if (!best) return;
    const proj = best as Entity;
    let rolled = this.reflectRolled.get(proj.id);
    if (rolled === undefined) {
      rolled = this.rng.randomFloat() < this.skill.airblastSkill;
      this.reflectRolled.set(proj.id, rolled);
      if (this.reflectRolled.size > 64) this.reflectRolled.clear();
    }
    if (!rolled) return;
    this.snapAim = this.skill.level >= 2;
    this.aimAt(world, proj.origin, true);
    if (this.onTarget(30) || this.snapAim) this.cmd.buttons |= IN_ATTACK2;
  }

  // ─── Demoman: sticky traps ────────────────────────────────────────────────

  private stickyLogic(world: GameWorld, player: Player, target: Entity | null): void {
    const sticky = player.weapons[SLOT_SECONDARY];
    if (!(sticky instanceof StickybombLauncher)) return;
    // Detonate when an enemy walks onto a trap.
    for (const pipe of sticky.pipebombs) {
      if (pipe.removed) continue;
      for (let i = 1; i <= MAX_PLAYERS; i++) {
        const e = world.entities[i] as Player | undefined;
        if (!e || e.removed || !e.alive || e.team === player.team) continue;
        const dx = e.origin.x - pipe.origin.x;
        const dy = e.origin.y - pipe.origin.y;
        const dz = e.origin.z + 30 - pipe.origin.z;
        if (dx * dx + dy * dy + dz * dz < 110 * 110) {
          this.cmd.buttons |= IN_ATTACK2;
          return;
        }
      }
    }
    // Lay a trap on a defended point when idle.
    const g = this.goal;
    const now = world.curtime;
    if (
      target ||
      (g.kind !== GOAL_DEFEND && !(g.kind === GOAL_CAPTURE && g.label === 'hold point'))
    ) {
      this.stickyCharging = 0;
      return;
    }
    if (sticky.pipebombs.length >= 4 || now - this.stickyTrapAt < 1.2) return;
    const d = Math.hypot(g.pos.x - player.origin.x, g.pos.y - player.origin.y);
    if (d > 700 || d < 60) return;
    if (!this.select(SLOT_SECONDARY, player)) return;
    this.w.x = g.pos.x + this.rng.randomFloat(-60, 60);
    this.w.y = g.pos.y + this.rng.randomFloat(-60, 60);
    this.w.z = g.pos.z + 10;
    const hd = Math.hypot(this.w.x - this.eye.x, this.w.y - this.eye.y);
    const elev = this.pipeElevation(hd * 1.2, this.w.z - this.eye.z);
    this.w.z = this.eye.z + Math.tan(elev * D2R) * hd;
    this.aimAt(world, this.w, true);
    if (this.stickyCharging === 0 && this.onTarget(4)) this.stickyCharging = 1;
    if (this.stickyCharging > 0) {
      this.stickyCharging++;
      if (this.stickyCharging < 6) this.cmd.buttons |= IN_ATTACK;
      else {
        this.stickyCharging = 0;
        this.stickyTrapAt = now;
      }
    }
  }

  // ─── Medic ────────────────────────────────────────────────────────────────

  private medic(world: GameWorld, mgr: BotManager, player: Player, target: Entity | null): boolean {
    void mgr;
    const now = world.curtime;
    const gun = player.weapons[SLOT_SECONDARY];
    if (!(gun instanceof Medigun)) return false;
    if (now >= this.nextPatientAt || this.patient < 0) {
      this.nextPatientAt = now + 1;
      this.patient = this.choosePatient(world, player);
    }
    const p = this.patient > 0 ? world.player(this.patient) : null;
    if (!p || !p.alive) {
      this.patient = -1;
      return false;
    }
    const d = Math.hypot(
      p.origin.x - player.origin.x,
      p.origin.y - player.origin.y,
      p.origin.z - player.origin.z,
    );
    // Under fire with a full charge: pop it (CTFBotMedicHeal::IsReadyToDeployUber).
    if (
      gun.chargeLevel >= 1 &&
      player.healTarget === p.id &&
      (player.health < player.maxHealth * 0.5 || p.health < p.maxHealth * 0.4) &&
      (target || now - this.lastThreatAt < 1)
    ) {
      this.cmd.buttons |= IN_ATTACK2;
      this.say(world, player, 'Activate Charge!');
    }
    // Too far from the patient, or he is topped up and an enemy is in our face: defend
    // ourselves for a while (switching weapons every tick would never fire either).
    if (target) {
      const td = Math.hypot(target.origin.x - player.origin.x, target.origin.y - player.origin.y);
      if (d > 700 || (p.health >= p.maxHealth * 0.95 && td < 600)) this.medicFightUntil = now + 2.5;
      if (now < this.medicFightUntil && p.health > p.maxHealth * 0.6) return false;
    }
    if (this.select(SLOT_SECONDARY, player)) {
      this.bodyPoint(p, this.aimPoint);
      this.aimAt(world, this.aimPoint, true);
      if (d < 420 && (this.onTarget(10) || player.healTarget === p.id))
        this.cmd.buttons |= IN_ATTACK;
    }
    // Follow: stay near, a little behind.
    if (d > 180) this.walkTo(world, mgr, player, p.origin);
    else this.standStill();
    this.supplyGoal = null;
    return true;
  }

  private choosePatient(world: GameWorld, player: Player): number {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = world.entities[i] as Player | undefined;
      if (!e || e.removed || !e.alive || e === player || e.team !== player.team) continue;
      if (e.playerClass === TF_CLASS_MEDIC || e.playerClass === TF_CLASS_SNIPER) continue;
      if (e.playerClass === TF_CLASS_SPY && e.cond.has(TF_COND.STEALTHED)) continue;
      const d = Math.hypot(e.origin.x - player.origin.x, e.origin.y - player.origin.y);
      if (d > 2000) continue;
      // Is somebody else already on him?
      let healers = 0;
      for (const h of e.healers) if (h.id !== player.id && !h.dispenser) healers++;
      let score =
        PATIENT_PRIORITY[e.playerClass] * 100 -
        d * 0.15 +
        (1 - e.health / e.maxHealth) * 300 -
        healers * 400;
      if (i === this.patient) score += 150;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  // ─── Engineer ─────────────────────────────────────────────────────────────

  private engineer(
    world: GameWorld,
    mgr: BotManager,
    player: Player,
    target: Entity | null,
  ): boolean {
    const now = world.curtime;
    const sentry = getObjectOfType(player, OBJ_SENTRYGUN);
    const dispenser = getObjectOfType(player, OBJ_DISPENSER);
    const metal = player.ammo[TF_AMMO_METAL];
    // Defend the nest: shoot what attacks it.
    if (
      target &&
      (!sentry ||
        Math.hypot(target.origin.x - player.origin.x, target.origin.y - player.origin.y) < 500)
    ) {
      const builder = builderOf(player);
      if (builder && player.activeWeapon() === builder) this.select(SLOT_PRIMARY, player);
      // Keep whacking a sentry under construction if the enemy is not on top of us.
      if (!(
        sentry &&
        sentry.building &&
        Math.hypot(sentry.origin.x - player.origin.x, sentry.origin.y - player.origin.y) < 70
      ))
        return false;
    }
    if (this.supplyGoal) return false;

    // Where to build: a spot near what we defend (or attack).
    const g = this.goal;
    const mesh = mgr.mesh;
    if (!mesh) return false;
    const anchorKey = `${g.pointIndex}:${g.label}`;
    const spots =
      g.kind === GOAL_NONE || g.kind === GOAL_ROAM
        ? null
        : mgr.spots('sentry', g.pos, player.team, anchorKey);

    // Maintain: hit unfinished, damaged or upgradable buildings with the wrench.
    const work = this.buildingNeedingWork(player, sentry, dispenser, metal);
    if (work) return this.whack(world, mgr, player, work);

    // Build: sentry first, then a dispenser beside it, then a teleporter exit.
    let want = -1;
    let mode = 0;
    if (!sentry && metal >= 130) want = OBJ_SENTRYGUN;
    else if (sentry && !dispenser && metal >= 100) want = OBJ_DISPENSER;
    else if (
      sentry &&
      dispenser &&
      metal >= 50 &&
      !getObjectOfType(player, OBJ_TELEPORTER, MODE_TELEPORTER_EXIT)
    ) {
      want = OBJ_TELEPORTER;
      mode = MODE_TELEPORTER_EXIT;
    } else if (
      sentry &&
      metal >= 50 &&
      !getObjectOfType(player, OBJ_TELEPORTER, MODE_TELEPORTER_ENTRANCE)
    ) {
      // An entrance by our spawn, when we pass it.
      const own = mgr.spawnCenter(player.team, this.w);
      if (
        Math.hypot(own.x - player.origin.x, own.y - player.origin.y) < 700 &&
        !player.inRespawnRoom()
      ) {
        want = OBJ_TELEPORTER;
        mode = MODE_TELEPORTER_ENTRANCE;
      }
    }
    if (want < 0) {
      if (sentry && metal < 100) return false; // go fetch metal (planGoal) or roam with the team
      if (!sentry && metal < 130) {
        const spot = this.nearestSupply(world, mgr, player, false, true);
        if (spot) this.supplyGoal = spot;
        return false;
      }
      return false;
    }
    if (want !== this.buildType) {
      this.buildType = want;
      this.buildFail = 0;
      this.buildSpot = -1;
    }
    // Pick the spot.
    let spotPos: Vec3 | null = null;
    if (want === OBJ_SENTRYGUN || (want === OBJ_TELEPORTER && mode === MODE_TELEPORTER_ENTRANCE)) {
      if (want === OBJ_SENTRYGUN && spots && spots.length > 0) {
        if (this.buildSpot < 0)
          this.buildSpot = Math.floor(botHash(player.id, 31) * Math.min(4, spots.length));
        const a = spots[(this.buildSpot + this.buildFail) % spots.length];
        spotPos = mesh.center(a, this.w);
      } else if (want === OBJ_TELEPORTER)
        spotPos = null; // right here
      else spotPos = null;
    } else if (sentry) {
      // Beside the sentry, toward our side.
      this.w.x = sentry.origin.x + (this.buildFail % 2 === 0 ? 70 : -70);
      this.w.y = sentry.origin.y + (this.buildFail % 3 === 0 ? 50 : -50);
      this.w.z = sentry.origin.z;
      spotPos = this.w;
    }
    if (spotPos) {
      const d = Math.hypot(spotPos.x - player.origin.x, spotPos.y - player.origin.y);
      if (d > 50 && !(want !== OBJ_SENTRYGUN && d < 110)) {
        const builder = builderOf(player);
        if (builder && player.activeWeapon() === builder && this.placingSince < 0)
          this.select(SLOT_MELEE, player);
        this.walkTo(world, mgr, player, spotPos);
        if (!target) this.lookAt(spotPos.x, spotPos.y, spotPos.z + 40, player);
        this.hasCustomAim = !target;
        return true;
      }
    }
    // Place it.
    this.standStill();
    const builder = builderOf(player);
    if (!builder || player.activeWeapon() !== builder) {
      handleBuildCommand(player, { action: 'build', objectType: want, objectMode: mode });
      this.placingSince = now;
      return true;
    }
    // Look a little down and ahead; rotate the view while the spot is invalid.
    const yaw = this.aimYaw * D2R;
    this.w.x = player.origin.x + Math.cos(yaw) * 80;
    this.w.y = player.origin.y + Math.sin(yaw) * 80;
    this.w.z = player.origin.z;
    if (builder.buildState === BS_PLACING && builder.isValidPlacement()) {
      this.cmd.buttons |= IN_ATTACK;
      this.placingSince = -1;
    } else if (now - this.placingSince > 0.6) {
      this.desiredYaw = normalizeYaw(this.aimYaw + 40);
      this.desiredPitch = 15;
      this.hasCustomAim = true;
      if (now - this.placingSince > 3) {
        this.buildFail++;
        this.placingSince = now;
        this.select(SLOT_MELEE, player);
      }
    }
    return true;
  }

  private buildingNeedingWork(
    player: Player,
    sentry: TFBaseObject | null,
    dispenser: TFBaseObject | null,
    metal: number,
  ): TFBaseObject | null {
    for (const o of [sentry, dispenser]) {
      if (!o || o.removed || o.placing || o.carried) continue;
      if (o.building) return o;
      if (o.sapped) return o;
      if (o.health < o.maxHealth && metal > 0) return o;
      if (o === sentry && o.level < 3 && metal >= 200) return o;
    }
    return null;
  }

  private whack(world: GameWorld, mgr: BotManager, player: Player, o: TFBaseObject): boolean {
    const d = Math.hypot(o.origin.x - player.origin.x, o.origin.y - player.origin.y);
    if (d > 62) {
      this.walkTo(world, mgr, player, o.origin);
      this.lookAt(o.origin.x, o.origin.y, o.origin.z + 20, player);
      this.hasCustomAim = true;
      return true;
    }
    this.standStill();
    if (this.select(SLOT_MELEE, player)) {
      this.w.x = o.origin.x;
      this.w.y = o.origin.y;
      this.w.z = o.origin.z + 16;
      this.aimAt(world, this.w, true);
      if (this.onTarget(20)) this.cmd.buttons |= IN_ATTACK;
    }
    return true;
  }

  /** A class job walks toward a point this tick (move() follows the path). */
  private walkTo(world: GameWorld, mgr: BotManager, player: Player, p: Vec3): void {
    void world;
    void mgr;
    void player;
    this.moveGoal.x = p.x;
    this.moveGoal.y = p.y;
    this.moveGoal.z = p.z;
    this.jobGoalSet = true;
    this.jobStand = false;
  }

  /** A class job holds its ground this tick. */
  private standStill(): void {
    this.jobGoalSet = true;
    this.jobStand = true;
  }

  // ─── Sniper ───────────────────────────────────────────────────────────────

  private sniper(
    world: GameWorld,
    mgr: BotManager,
    player: Player,
    target: Entity | null,
  ): boolean {
    const rifle = player.weapons[SLOT_PRIMARY];
    if (!(rifle instanceof SniperRifle)) return false;
    if (target) {
      const d = Math.hypot(target.origin.x - player.origin.x, target.origin.y - player.origin.y);
      if (d < 500) return false; // SMG / kukri up close (fight())
      this.fight(world, mgr, player, target);
      this.standStill();
      return true;
    }
    if (this.supplyGoal) return false;
    // Go to a vantage spot over the objective and watch it, scoped.
    const g = this.goal;
    const mesh = mgr.mesh;
    if (!mesh || g.kind === GOAL_NONE || g.kind === GOAL_ROAM) return false;
    const spots = mgr.spots('sniper', g.pos, player.team, `${g.pointIndex}:${g.label}`);
    if (spots.length === 0) return false;
    if (this.sniperSpot < 0) {
      this.sniperSpot = Math.floor(botHash(player.id, 41) * Math.min(5, spots.length));
      this.sniperMoveAt = world.curtime + SNIPER_RELOCATE;
    }
    // Snipers change spots now and then, and when shot at.
    if (world.curtime > this.sniperMoveAt || player.lastDamageTime > world.curtime - 0.2) {
      this.sniperSpot++;
      this.sniperMoveAt = world.curtime + SNIPER_RELOCATE + this.rng.randomFloat(0, 20);
    }
    const a = spots[this.sniperSpot % spots.length];
    mesh.center(a, this.w);
    const d = Math.hypot(this.w.x - player.origin.x, this.w.y - player.origin.y);
    if (d > 60) {
      if (rifle.isZoomed()) this.cmd.buttons |= IN_ATTACK2;
      this.select(SLOT_PRIMARY, player);
      this.walkTo(world, mgr, player, this.w);
      return true;
    }
    this.select(SLOT_PRIMARY, player);
    this.standStill();
    // Watch the objective (or the last enemy seen).
    const e = this.recentEnemy(world, player, 3);
    if (e >= 0) this.lookAt(this.lastX[e], this.lastY[e], this.lastZ[e] + 60, player);
    else this.lookAt(g.pos.x, g.pos.y, g.pos.z + 60, player);
    this.hasCustomAim = true;
    if (!rifle.isZoomed() && player.activeSlot === SLOT_PRIMARY && (world.tickCount & 15) === 0)
      this.cmd.buttons |= IN_ATTACK2;
    return true;
  }

  private sniperShoot(world: GameWorld, player: Player, target: Entity, d: number): void {
    const rifle = player.weapons[SLOT_PRIMARY];
    if (!(rifle instanceof SniperRifle)) return;
    if (!rifle.isZoomed()) {
      if ((world.tickCount & 7) === 0) this.cmd.buttons |= IN_ATTACK2;
      return;
    }
    const full = rifle.chargedDamage >= 150 * this.skill.sniperCharge;
    const head = this.skill.level >= 1;
    if (head) this.headPoint(target, this.aimPoint);
    else this.bodyPoint(target, this.aimPoint);
    this.aimAt(world, this.aimPoint, false, 0.35);
    const tol = Math.max(0.6, Math.atan2(head ? 6 : 14, d) * R2D);
    if ((full || d < 900) && this.onTarget(tol)) this.fire();
  }

  // ─── Spy ──────────────────────────────────────────────────────────────────

  private spy(world: GameWorld, mgr: BotManager, player: Player, target: Entity | null): boolean {
    const now = world.curtime;
    const cloaked = player.cond.has(TF_COND.STEALTHED);
    // Disguise when nobody is shooting at us.
    if (
      !player.cond.has(TF_COND.DISGUISED) &&
      !player.cond.has(TF_COND.DISGUISING) &&
      !cloaked &&
      now - player.lastDamageTime > 2
    ) {
      const classes = [
        TF_CLASS_SCOUT,
        TF_CLASS_SOLDIER,
        TF_CLASS_PYRO,
        TF_CLASS_DEMOMAN,
        TF_CLASS_HEAVYWEAPONS,
        TF_CLASS_MEDIC,
        TF_CLASS_ENGINEER,
        TF_CLASS_SNIPER,
      ];
      requestDisguise(
        player,
        classes[this.rng.randomInt(0, classes.length - 1)],
        enemyTeam(player.team),
      );
    }
    // Sap a sentry in reach.
    const s = this.threatBuilding;
    if (s && !s.removed && !s.sapped && !cloaked) {
      const d = Math.hypot(s.origin.x - player.origin.x, s.origin.y - player.origin.y);
      if (d < 110) {
        const builder = builderOf(player);
        if (!builder || player.activeWeapon() !== builder)
          handleBuildCommand(player, {
            action: 'build',
            objectType: OBJ_ATTACHMENT_SAPPER,
            objectMode: 0,
          });
        this.w.x = s.origin.x;
        this.w.y = s.origin.y;
        this.w.z = s.origin.z + 20;
        this.aimAt(world, this.w, true);
        if (this.onTarget(15)) this.cmd.buttons |= IN_ATTACK;
        this.walkTo(world, mgr, player, s.origin);
        return true;
      }
      if (d < 900) {
        this.walkTo(world, mgr, player, s.origin);
        return true;
      }
    }
    // Pick a victim: the closest enemy we know of, preferring one not looking at us.
    let victim = this.spyTarget > 0 ? world.player(this.spyTarget) : null;
    if (
      !victim ||
      !victim.alive ||
      now - Math.max(this.seenAt[victim.id], this.heardAt[victim.id]) > 6
    ) {
      this.spyTarget = this.recentEnemy(world, player, 6);
      victim = this.spyTarget > 0 ? world.player(this.spyTarget) : null;
    }
    if (!victim) {
      if (cloaked && (world.tickCount & 31) === 0) this.cmd.buttons |= IN_ATTACK2;
      return false; // go with the objective
    }
    const vx = victim.origin.x - player.origin.x;
    const vy = victim.origin.y - player.origin.y;
    const d = Math.hypot(vx, vy);
    // Their facing: behind them is where we want to be.
    const vyaw = victim.eyeAngles.y * D2R;
    const fx = Math.cos(vyaw);
    const fy = Math.sin(vyaw);
    const behind = (vx * fx + vy * fy) / (d || 1) > 0.3; // we are behind when their forward points away from us
    // Cloak on the approach when exposed, decloak close in.
    if (
      !cloaked &&
      d > 300 &&
      d < 1200 &&
      player.cloakMeter > 60 &&
      player.lastDamageTime > now - 1
    )
      this.cmd.buttons |= IN_ATTACK2;
    else if (cloaked && d < 260 && (world.tickCount & 7) === 0) this.cmd.buttons |= IN_ATTACK2;
    // Approach the point behind the victim.
    this.w.x = victim.origin.x - fx * 50;
    this.w.y = victim.origin.y - fy * 50;
    this.w.z = victim.origin.z;
    this.walkTo(world, mgr, player, d > 70 && d < 220 ? this.w : victim.origin);
    if (d < 140 && !cloaked) {
      if (this.select(SLOT_MELEE, player)) {
        this.bodyPoint(victim, this.aimPoint);
        this.aimAt(world, this.aimPoint, true);
        if (d < 75 && (behind || this.visible[victim.id] === 1 || target === victim)) this.fire();
      }
    } else if (
      target === victim &&
      !cloaked &&
      d < 500 &&
      !behind &&
      this.visible[victim.id] === 1 &&
      player.lastDamageTime > now - 1.5
    ) {
      // Spotted and shot at: revolver.
      return false;
    } else if (!cloaked) {
      this.lookAt(victim.origin.x, victim.origin.y, victim.origin.z + 50, player);
      this.hasCustomAim = true;
    }
    return true;
  }
}

function normalizeYaw(a: number): number {
  a %= 360;
  if (a > 180) a -= 360;
  else if (a < -180) a += 360;
  return a;
}

const clampPitch = (p: number): number => (p > 89 ? 89 : p < -89 ? -89 : p);

/** The match host's bot factory (`Tf2MatchHostOptions.botBrain`, a BotBrainFactory). */
export const tfBotBrainFactory = (difficulty: BotDifficulty, player: Player): TFBotBrain =>
  new TFBotBrain(player, { difficulty });

/** A factory that ignores the match's setting and plays at `difficulty`. */
export const tfBotBrainFactoryAt =
  (difficulty: BotDifficulty) =>
  (_ignored: BotDifficulty, player: Player): TFBotBrain =>
    new TFBotBrain(player, { difficulty });

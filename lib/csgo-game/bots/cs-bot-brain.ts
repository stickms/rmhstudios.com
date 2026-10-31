/**
 * The CS bot: the shared bots module's nav mesh (generated for NAV_HULL_CS), A* and path following
 * (lib/tf2-game/bots — NavPathfinder, PathFollower, the per-world BotManager and its search budget),
 * with a CS:GO brain written for this port from the game's public behaviour:
 *
 *   - buys by money in the freeze time (a rifle — sometimes the AWP —, else an SMG, armor, a kit, a
 *     grenade or two), through the host-validated buy command;
 *   - bomb defusal: Terrorists take one site (A or B) together, the carrier plants, everyone holds the
 *     bomb; a dropped bomb is fetched; Counter-Terrorists split over the sites, rotate to the bomb once it
 *     is down and defuse it when nobody is in sight;
 *   - deathmatch: hunt the nearest enemy;
 *   - fighting: sight through a field of view and line of sight (smoke and flashes blind it), a reaction
 *     time, aim error and turn rate by difficulty (the shared `BotSkill` table), the head for the better
 *     bots, spray control (pulling down against the aim punch), counter-strafing to shoot, bursts and
 *     reloads; the occasional HE or flashbang at an enemy in mid range.
 */

import {
  IN_ATTACK,
  IN_ATTACK2,
  IN_DUCK,
  IN_JUMP,
  IN_RELOAD,
  IN_USE,
  MASK_BLOCKLOS,
  TICK_INTERVAL,
} from '../../tf2-game/core/constants';
import { UniformRandomStream } from '../../tf2-game/core/random';
import { emptyTrace, emptyUserCmd, type UserCmd } from '../../tf2-game/core/types';
import { angleNormalize, vec3, vectorAngles, type Vec3 } from '../../tf2-game/core/vec';
import type { Player } from '../../tf2-game/sim/player';
import { GR_STATE_PREROUND, GR_STATE_RND_RUNNING } from '../../tf2-game/sim/rules';
import { SLOT_PDA, SLOT_PDA2, SLOT_PRIMARY, SLOT_SECONDARY } from '../../tf2-game/sim/weapon-api';
import type { GameWorld } from '../../tf2-game/sim/world';
import type { BotDifficulty } from '../../tf2-game/net/events';
import { getBotManager } from '../../tf2-game/bots/brain/manager';
import { botSkill, type BotSkill } from '../../tf2-game/bots/brain/difficulty';
import { applyMoveIntent, newMoveIntent, PathFollower } from '../../tf2-game/bots/path';
import type { BotBrain } from '../../tf2-game/server/tf2-match-host';
import { WEAPON_RECOIL_SCALE } from '../combat';
import { CS_TEAM_CT, CS_TEAM_T } from '../constants';
import { csWeapon } from '../data/weapon-data';
import { TEAM_RIFLE, TEAM_SMG } from '../economy';
import { CsDroppedWeapon } from '../entities';
import type { CsPlayer } from '../player';
import { CsC4 } from '../weapons/c4';
import { CsGrenadePouch, smokeBlocksLine } from '../weapons/grenades';
import { CsGun } from '../weapons/gun';
import type { CsWeapon } from '../weapons/base';
import type { CsWorld } from '../world';

/** How much of the aim punch a bot pulls down against, by difficulty level (0 easy … 3 expert). */
const SPRAY_CONTROL = [0, 0.5, 0.8, 0.95];
/** Shots per burst before a pause (expert sprays). */
const BURST = [3, 5, 8, 30];
/** Aim at the head on this share of engagements, by level. */
const HEAD_AIM = [0.1, 0.3, 0.6, 0.85];
/** Chance per second to throw a grenade at an enemy in mid range. */
const GRENADE_CHANCE = 0.15;
/** Perception every this many ticks. */
const PERCEPTION_TICKS = 3;
/** Half the CS player hull's width (cs_shareddefs VEC_HULL_MAX.x): the path follower's wall probe. */
const CS_HALF_WIDTH = 16;

/** Forget an enemy not seen for this long (seconds). */
const MEMORY = 3;

const tr = emptyTrace();
const eye = vec3();
const aimDir = vec3();
const aimAng = vec3();

function lineClear(world: CsWorld, a: Vec3, b: Vec3): boolean {
  world.traceLineWorldOnly(a, b, MASK_BLOCKLOS, tr);
  return tr.fraction >= 1 && !smokeBlocksLine(world, a, b);
}

export class CsBotBrain implements BotBrain {
  readonly skill: BotSkill;
  readonly level: number;
  private readonly follower = Object.assign(new PathFollower(), { halfWidth: CS_HALF_WIDTH });
  private readonly intent = newMoveIntent();
  private readonly rng: UniformRandomStream;
  private readonly view = vec3();
  private viewSet = false;
  private target = -1;
  private targetSeenAt = -1000;
  private targetFirstSeenAt = -1000;
  private readonly lastSeenPos = vec3();
  private aimHead = false;
  private aimErrX = 0;
  private aimErrY = 0;
  private nextAimUpdate = 0;
  private shotsThisBurst = 0;
  private burstPauseUntil = 0;
  /** The round (CsGameRules.roundSerial) this bot last bought in. */
  private boughtRound = -1;
  /** 0 = A, 1 = B (the site this bot heads for this round). */
  private site = -1;
  private siteRound = -1;
  private grenadeUntil = -1;
  private grenadeStage = 0;
  private readonly goal = vec3();
  private sweepPhase = 0;

  constructor(player: Player, opts: { difficulty?: BotDifficulty } = {}) {
    this.skill = botSkill(opts.difficulty);
    this.level = this.skill.level;
    this.rng = new UniformRandomStream(0x5eed + player.id * 977);
  }

  think(gameWorld: GameWorld, player: Player): UserCmd {
    const world = gameWorld as CsWorld;
    const p = player as CsPlayer;
    const cmd = emptyUserCmd();
    if (!this.viewSet || !p.alive) {
      this.view.x = p.eyeAngles.x;
      this.view.y = p.eyeAngles.y;
      this.viewSet = true;
    }
    if (!p.alive) {
      this.follower.clear();
      this.target = -1;
      cmd.viewAngles = { x: this.view.x, y: this.view.y, z: 0 };
      return cmd;
    }
    const mgr = getBotManager(world);
    mgr.update();
    const rules = world.csRules;
    const t = world.curtime;

    // The freeze time: buy, look around.
    if (
      rules.state === GR_STATE_PREROUND ||
      (rules.inBuyTime() && this.boughtRound !== rules.roundSerial)
    )
      this.buy(world, p);

    if (world.tickCount % PERCEPTION_TICKS === p.id % PERCEPTION_TICKS) this.perceive(world, p, t);
    const enemy = this.target >= 0 ? (world.player(this.target) as CsPlayer | null) : null;
    const engaged = enemy !== null && enemy.alive && t - this.targetSeenAt < 0.3;

    let wantMove = true;
    if (engaged && enemy) {
      wantMove = this.fight(world, p, enemy, cmd, t);
    } else {
      this.shotsThisBurst = 0;
      if (this.target >= 0 && t - this.targetSeenAt > MEMORY) this.target = -1;
      this.reloadIfNeeded(p, cmd);
    }

    if (rules.state === GR_STATE_RND_RUNNING || rules.csMode === 'dm') {
      if (!engaged) wantMove = this.objective(world, p, cmd, t);
    } else wantMove = false;

    // Path following toward the goal.
    if (wantMove && mgr.pathfinder) {
      const host = mgr.followerHost;
      this.follower.setGoal(host, world, p.origin, this.goal, p.team);
      this.follower.update(
        host,
        world,
        p.origin,
        p.velocity,
        p.move.flags,
        p.move.waterLevel,
        this.intent,
      );
      if (!engaged) this.lookAlong(p, t);
      applyMoveIntent(this.intent, this.view.y, cmd, IN_JUMP, IN_DUCK);
    } else if (!engaged) {
      this.sweep(t);
    }

    cmd.viewAngles = { x: this.view.x, y: this.view.y, z: 0 };
    return cmd;
  }

  // ─── Buying ──────────────────────────────────────────────────────────────────────────────

  private buy(world: CsWorld, p: CsPlayer): void {
    const rules = world.csRules;
    if (this.boughtRound === rules.roundSerial || !p.inBuyZone() || !rules.inBuyTime()) return;
    this.boughtRound = rules.roundSerial;
    if (rules.csMode === 'dm') return;
    const team = p.team;
    const has = (slot: number) => p.weapons[slot] !== null;
    const price = (name: string) => csWeapon(name)?.price ?? Infinity;
    // No primary, or one short of a rifle (an SMG, a shotgun kept from an eco): buy up when it can.
    const primary = p.weapons[SLOT_PRIMARY] as CsWeapon | null;
    const category = primary?.info.category;
    if (category !== 'rifle' && category !== 'sniper') {
      const awp = 'weapon_awp';
      if (this.level >= 2 && p.money >= price(awp) + 1000 && this.rng.randomFloat() < 0.2)
        p.buy(awp);
      else if (p.money >= price(TEAM_RIFLE[team]) + 650) p.buy(TEAM_RIFLE[team]);
      else if (!primary && p.money >= price(TEAM_SMG[team]) + 650 && p.money >= 2000)
        p.buy(TEAM_SMG[team]);
    }
    if ((p.armor < 100 || !p.helmet) && p.money >= 1000 && has(SLOT_PRIMARY)) p.buy('vesthelm');
    else if (p.armor < 100 && p.money >= 650) p.buy('vest');
    if (team === CS_TEAM_CT && !p.defuser && p.money >= 400 + 300) p.buy('defuser');
    if (p.money >= 300) p.buy('hegrenade');
    if (p.money >= 200 && this.rng.randomFloat() < 0.5) p.buy('flashbang');
    if (team === CS_TEAM_T && p.money >= 300 && this.rng.randomFloat() < 0.3) p.buy('smokegrenade');
  }

  // ─── Seeing ──────────────────────────────────────────────────────────────────────────────

  private perceive(world: CsWorld, p: CsPlayer, t: number): void {
    // Flashed: sees nothing for most of the flash.
    if (t - p.flashAt < p.flashDuration * 0.7 && p.flashAlpha > 100) return;
    p.eyePosition(eye);
    const cosHalf = Math.cos(((this.skill.fov / 2) * Math.PI) / 180);
    const yaw = (this.view.y * Math.PI) / 180;
    const pitch = (this.view.x * Math.PI) / 180;
    const fx = Math.cos(pitch) * Math.cos(yaw);
    const fy = Math.cos(pitch) * Math.sin(yaw);
    const fz = -Math.sin(pitch);
    let best: CsPlayer | null = null;
    let bestDist = Infinity;
    const keep = this.target;
    world.forEachPlayer((other) => {
      const o = other as CsPlayer;
      if (!o.alive || !world.isEnemy(p, o)) return;
      const c = { x: o.origin.x, y: o.origin.y, z: o.origin.z + (o.move.ducked ? 40 : 56) };
      const dx = c.x - eye.x;
      const dy = c.y - eye.y;
      const dz = c.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1) return;
      const heard = t - o.lastNoiseAt < 0.5 && d < o.noiseRange;
      const inCone = (fx * dx + fy * dy + fz * dz) / d >= cosHalf || d < 120;
      if (!inCone && !(heard && o.id === keep)) {
        if (heard && !best && this.target < 0) {
          // Turn toward what we heard.
          this.lastSeenPos.x = c.x;
          this.lastSeenPos.y = c.y;
          this.lastSeenPos.z = c.z;
        }
        return;
      }
      if (!lineClear(world, eye, c)) return;
      if (d < bestDist || o.id === keep) {
        best = o;
        bestDist = o.id === keep ? -1 : d;
      }
    });
    const seen = best as CsPlayer | null;
    if (seen) {
      if (seen.id !== this.target || t - this.targetSeenAt > 1) {
        this.targetFirstSeenAt = t;
        this.aimHead = this.rng.randomFloat() < HEAD_AIM[this.level];
        this.shotsThisBurst = 0;
      }
      this.target = seen.id;
      this.targetSeenAt = t;
      this.lastSeenPos.x = seen.origin.x;
      this.lastSeenPos.y = seen.origin.y;
      this.lastSeenPos.z = seen.origin.z;
    }
  }

  // ─── Fighting ────────────────────────────────────────────────────────────────────────────

  /** Aims and shoots at `enemy`; returns whether the bot should keep walking its path. */
  private fight(world: CsWorld, p: CsPlayer, enemy: CsPlayer, cmd: UserCmd, t: number): boolean {
    const w = p.activeWeapon() as CsWeapon | null;
    // Out of a gun's ammo: the pistol, then the knife.
    if (w instanceof CsGun && w.clip <= 0 && w.reserve <= 0) {
      cmd.weaponSelect =
        w.slot === SLOT_PRIMARY && p.weapons[SLOT_SECONDARY] ? SLOT_SECONDARY + 1 : 3;
    } else if (!(w instanceof CsGun) && !(w instanceof CsGrenadePouch && this.grenadeStage > 0)) {
      const gun = p.weapons[SLOT_PRIMARY] ?? p.weapons[SLOT_SECONDARY];
      if (gun && w?.info.category !== 'knife') cmd.weaponSelect = gun.slot + 1;
      else if (
        gun &&
        w?.info.category === 'knife' &&
        Math.hypot(enemy.origin.x - p.origin.x, enemy.origin.y - p.origin.y) > 150
      )
        cmd.weaponSelect = gun.slot + 1;
    }

    p.eyePosition(eye);
    const aimZ = this.aimHead ? (enemy.move.ducked ? 44 : 62) : enemy.move.ducked ? 32 : 46;
    if (t >= this.nextAimUpdate) {
      this.nextAimUpdate = t + this.skill.aimTrackInterval;
      const err = this.skill.aimErrorDeg * (w instanceof CsGun && w.zoomLevel > 0 ? 0.35 : 1);
      this.aimErrX = this.rng.randomFloat(-err, err);
      this.aimErrY = this.rng.randomFloat(-err, err);
    }
    aimDir.x = enemy.origin.x - eye.x;
    aimDir.y = enemy.origin.y - eye.y;
    aimDir.z = enemy.origin.z + aimZ - eye.z;
    const dist = Math.hypot(aimDir.x, aimDir.y, aimDir.z);
    vectorAngles(aimDir, aimAng);
    let wantPitch = angleNormalize(aimAng.x) + this.aimErrX;
    let wantYaw = aimAng.y + this.aimErrY;
    // Spray control: pull against the aim punch.
    const control = SPRAY_CONTROL[this.level];
    wantPitch -= p.aimPunch.x * WEAPON_RECOIL_SCALE * control;
    wantYaw -= p.aimPunch.y * WEAPON_RECOIL_SCALE * control;
    const err = this.turnToward(wantPitch, wantYaw);

    // A grenade at a mid-range enemy now and then.
    if (this.tryGrenade(p, dist, cmd, t)) return false;

    const reacted = t - this.targetFirstSeenAt >= this.skill.reactionTime;
    const gun = w instanceof CsGun ? w : null;
    if (gun && gun.clip <= 0 && gun.reserve > 0) {
      cmd.buttons |= IN_RELOAD;
      return true;
    }
    // Snipers scope in before shooting.
    if (
      gun &&
      gun.info.zoomLevels > 0 &&
      gun.zoomLevel === 0 &&
      dist > 400 &&
      t >= gun.nextSecondaryAttack
    )
      cmd.buttons |= IN_ATTACK2;
    const tolerance = Math.max(1.5, Math.min(8, (900 / Math.max(dist, 50)) * 1.5));
    if (reacted && err < tolerance && t >= this.burstPauseUntil) {
      if (!gun || gun.info.fullAuto || world.tickCount % 2 === 0) cmd.buttons |= IN_ATTACK;
      if (gun && t >= gun.nextPrimaryAttack && gun.clip > 0) {
        this.shotsThisBurst++;
        if (this.shotsThisBurst >= BURST[this.level] && dist > 300) {
          this.shotsThisBurst = 0;
          this.burstPauseUntil = t + 0.25 + 0.15 * (3 - this.level);
        }
      }
    }
    // Hard bots stop to shoot (counter-strafe); easy ones keep walking; close fights strafe.
    if (dist < 250 && this.level >= 1) {
      cmd.sideMove = (Math.floor(t * 1.5) % 2 === 0 ? 1 : -1) * 250;
      return false;
    }
    if (this.level >= 2 || (gun && gun.info.category === 'sniper')) return false;
    return this.level === 0;
  }

  private tryGrenade(p: CsPlayer, dist: number, cmd: UserCmd, t: number): boolean {
    const pouch = p.weapons[SLOT_PDA];
    if (this.grenadeStage === 0) {
      if (!(pouch instanceof CsGrenadePouch) || dist < 300 || dist > 1200) return false;
      if (this.rng.randomFloat() > GRENADE_CHANCE * TICK_INTERVAL * (1 + this.level)) return false;
      if (!pouch.select('hegrenade') && !pouch.select('flashbang')) return false;
      this.grenadeStage = 1;
      this.grenadeUntil = t + 2.5;
    }
    if (t > this.grenadeUntil) {
      this.grenadeStage = 0;
      return false;
    }
    if (p.activeSlot !== SLOT_PDA) {
      cmd.weaponSelect = SLOT_PDA + 1;
      return true;
    }
    const w = p.activeWeapon() as CsGrenadePouch;
    // Lob it a little high, hold the pin for a moment, let go.
    this.view.x = Math.max(-89, this.view.x - 6);
    if (this.grenadeStage === 1 && t >= w.nextPrimaryAttack) {
      cmd.buttons |= IN_ATTACK;
      if (w.throwState === 1) this.grenadeStage = 2;
      return true;
    }
    if (this.grenadeStage === 2) {
      this.grenadeStage = 3;
      return true;
    }
    if (this.grenadeStage === 3 && w.throwState === 2) {
      this.grenadeStage = 0;
      const gun = p.weapons[SLOT_PRIMARY] ?? p.weapons[SLOT_SECONDARY];
      if (gun) cmd.weaponSelect = gun.slot + 1;
    }
    return true;
  }

  private reloadIfNeeded(p: CsPlayer, cmd: UserCmd): void {
    const w = p.activeWeapon();
    if (w instanceof CsGun && w.clip < w.info.clipSize * 0.4 && w.reserve > 0 && !w.inReload)
      cmd.buttons |= IN_RELOAD;
    if (!(w instanceof CsGun) && !(w instanceof CsC4)) {
      const gun = p.weapons[SLOT_PRIMARY] ?? p.weapons[SLOT_SECONDARY];
      if (gun && cmd.weaponSelect === 0) cmd.weaponSelect = gun.slot + 1;
    }
  }

  /** Turns the view toward (pitch, yaw) at the skill's turn rate; returns the remaining error (degrees). */
  private turnToward(pitch: number, yaw: number): number {
    const max = this.skill.turnRate * TICK_INTERVAL;
    const dy = angleNormalize(yaw - this.view.y);
    const dp = Math.max(-89, Math.min(89, pitch)) - this.view.x;
    this.view.y = angleNormalize(this.view.y + Math.max(-max, Math.min(max, dy)));
    this.view.x = Math.max(-89, Math.min(89, this.view.x + Math.max(-max, Math.min(max, dp))));
    return Math.hypot(angleNormalize(yaw - this.view.y), pitch - this.view.x);
  }

  private lookAlong(p: CsPlayer, _t: number): void {
    const look = this.intent.look;
    const dx = look.x - p.origin.x;
    const dy = look.y - p.origin.y;
    if (dx * dx + dy * dy < 16) return;
    this.turnToward(0, (Math.atan2(dy, dx) * 180) / Math.PI);
  }

  private sweep(t: number): void {
    this.sweepPhase += TICK_INTERVAL;
    this.turnToward(0, this.view.y + Math.sin(this.sweepPhase * 0.8 + t * 0.1) * 2);
  }

  // ─── Objectives ──────────────────────────────────────────────────────────────────────────

  /** Sets `goal` (and the buttons a plant or defuse needs); returns whether to walk to it. */
  private objective(world: CsWorld, p: CsPlayer, cmd: UserCmd, t: number): boolean {
    const rules = world.csRules;
    if (rules.csMode === 'dm') return this.hunt(world, p);
    const targets = world.bombTargets();
    if (targets.length === 0) return this.hunt(world, p);
    if (this.siteRound !== rules.roundsPlayed) {
      this.siteRound = rules.roundsPlayed;
      // Terrorists agree on a site per round (from the round number); CTs split by their id.
      this.site =
        p.team === CS_TEAM_T
          ? (rules.roundsPlayed * 7 + 3) % targets.length
          : p.id % targets.length;
    }
    const site = targets[Math.min(this.site, targets.length - 1)];
    const siteCenter = site.worldSpaceCenter(vec3());
    const c4 = rules.plantedC4 && !rules.plantedC4.removed ? rules.plantedC4 : null;

    if (p.team === CS_TEAM_T) {
      if (p.hasC4()) {
        if (p.inBombTarget()) {
          // Plant: the bomb out, +attack held, standing still.
          if (p.activeSlot !== SLOT_PDA2) cmd.weaponSelect = SLOT_PDA2 + 1;
          else cmd.buttons |= IN_ATTACK;
          this.turnToward(60, this.view.y);
          return false;
        }
        this.setGoal(siteCenter);
        return true;
      }
      // A dropped bomb: the nearest Terrorist fetches it.
      const dropped = this.droppedBomb(world);
      if (dropped && !c4) {
        this.setGoal(dropped.origin);
        return true;
      }
      const hold = c4 ? c4.origin : siteCenter;
      if (Math.hypot(hold.x - p.origin.x, hold.y - p.origin.y) < 220) return false;
      this.setGoal(hold);
      return true;
    }

    // Counter-Terrorists.
    if (c4) {
      if (
        p.canReachBomb(c4, { x: this.view.x, y: this.view.y, z: 0 }) ||
        Math.hypot(c4.origin.x - p.origin.x, c4.origin.y - p.origin.y) < 40
      ) {
        p.eyePosition(eye);
        aimDir.x = c4.origin.x - eye.x;
        aimDir.y = c4.origin.y - eye.y;
        aimDir.z = c4.origin.z + 4 - eye.z;
        vectorAngles(aimDir, aimAng);
        this.view.x = Math.max(-89, Math.min(89, angleNormalize(aimAng.x)));
        this.view.y = aimAng.y;
        cmd.buttons |= IN_USE;
        return false;
      }
      this.setGoal(c4.origin);
      return true;
    }
    if (Math.hypot(siteCenter.x - p.origin.x, siteCenter.y - p.origin.y) < 200) return false;
    this.setGoal(siteCenter);
    void t;
    return true;
  }

  private hunt(world: CsWorld, p: CsPlayer): boolean {
    let best: Player | null = null;
    let bestD = Infinity;
    world.forEachPlayer((o) => {
      if (!o.alive || !world.isEnemy(p, o)) return;
      const d = Math.hypot(
        o.origin.x - p.origin.x,
        o.origin.y - p.origin.y,
        o.origin.z - p.origin.z,
      );
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    });
    const target = best as Player | null;
    if (!target) return false;
    this.setGoal(this.target >= 0 ? this.lastSeenPos : target.origin);
    return true;
  }

  private droppedBomb(world: CsWorld): CsDroppedWeapon | null {
    let found: CsDroppedWeapon | null = null;
    world.forEachEntity((e) => {
      if (!found && e instanceof CsDroppedWeapon && e.weapon instanceof CsC4) found = e;
    });
    return found;
  }

  private setGoal(p: Vec3): void {
    this.goal.x = p.x;
    this.goal.y = p.y;
    this.goal.z = p.z;
  }
}

/** The host's bot factory for CS matches. */
export const csBotBrainFactory = (difficulty: BotDifficulty, player: Player): BotBrain =>
  new CsBotBrain(player, { difficulty });

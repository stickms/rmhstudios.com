/**
 * The objective state the SDK keeps in globals and singletons —
 * g_hControlPointMasters, CBaseTeamObjectiveResource (tf_objective_resource),
 * the auto-lists (ICaptureFlagAutoList, ITriggerAreaCaptureAutoList…) and
 * the objective half of CTFGameRules (TeamMayCapturePoint,
 * PlayerMayCapturePoint, GetCaptureValueForPlayer, TimerMayExpire,
 * GetFarthestOwnedControlPoint, RecalculateControlPointState, the KOTH team
 * timers, the respawn-wave adjustments with their originals) — one record
 * per world, plus the tf_objective_resource entity that networks the
 * mode-wide part of it.
 */

import { TEAM_UNASSIGNED, TF_CLASS_SCOUT, TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import { Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import type { NetRecord, NetSchema } from '../net-schema';
import type { Player } from '../player';
import {
  GR_STATE_PREROUND,
  GR_STATE_RND_RUNNING,
  GR_STATE_STALEMATE,
  GR_STATE_TEAM_WIN,
} from '../rules';
import { TF_COND } from '../conditions';
import type { GameWorld } from '../world';
import { NET_OBJECTIVE } from './net';
import type {
  TeamControlPoint,
  TeamControlPointMaster,
  TeamControlPointRound,
  TriggerAreaCapture,
} from './control-points';
import type { TeamRoundTimer } from './round-timer';
import type { CaptureFlag, CaptureZone } from './flag';
import type { TeamTrainWatcher } from './train-watcher';
import type { TeamSpawn } from '../spawn';

/** MAX_CONTROL_POINTS (team_control_point.h). */
export const MAX_CONTROL_POINTS = 8;
/** MAX_PREVIOUS_POINTS. */
export const MAX_PREVIOUS_POINTS = 3;
/** MAX_CONTROL_POINT_GROUPS. */
export const MAX_CONTROL_POINT_GROUPS = 8;
/** TEAM_INVALID. */
export const TEAM_INVALID = -1;

/** mp_capstyle 1: more players cap faster (diminishing returns), with longer base times. */
export const MP_CAPSTYLE: number = 1;
/** mp_blockstyle 1: blocks pause captures instead of breaking them. */
export const MP_BLOCKSTYLE: number = 1;
/** mp_capdeteriorate_time. */
export const MP_CAPDETERIORATE_TIME = 90;
/** tf_caplinear. */
export const TF_CAPLINEAR: boolean = true;
/** tf_flag_caps_per_round. */
export const TF_FLAG_CAPS_PER_ROUND: number = 3;
/** tf_ctf_bonus_time. */
export const TF_CTF_BONUS_TIME = 10;
/** tf_flag_return_on_touch (0: a dropped flag only returns by its timer). */
export const TF_FLAG_RETURN_ON_TOUCH: boolean = false;
/** tf_escort_recede_time / tf_escort_recede_time_overtime. */
export const TF_ESCORT_RECEDE_TIME = 30;
export const TF_ESCORT_RECEDE_TIME_OVERTIME = 5;

export type ObjectiveGameType = '' | 'ctf' | 'cp' | 'cp_ad' | 'koth' | 'pl' | 'arena';

export class Objectives {
  readonly world: GameWorld;
  readonly points: TeamControlPoint[] = [];
  readonly areas: TriggerAreaCapture[] = [];
  readonly masters: TeamControlPointMaster[] = [];
  readonly rounds: TeamControlPointRound[] = [];
  readonly timers: TeamRoundTimer[] = [];
  readonly flags: CaptureFlag[] = [];
  readonly zones: CaptureZone[] = [];
  readonly watchers: TeamTrainWatcher[] = [];
  /** ObjectiveResource's control points, by (renumbered) point index. */
  readonly sorted: TeamControlPoint[] = [];
  playingMiniRounds = false;
  /** SetBaseCP per team. */
  readonly baseControlPoint = [-1, -1, -1, -1];
  timerInHud: TeamRoundTimer | null = null;
  /** CTFGameRules::m_hRedKothTimer / m_hBlueKothTimer, by team. */
  readonly kothTimers: (TeamRoundTimer | null)[] = [null, null, null, null];
  /** m_flCapInProgressBuffer. */
  capInProgressBuffer = 0;
  /** tf_gamerules "ctf_overtime" (CTFGameRulesProxy::m_bOvertimeAllowedForCTF). */
  ctfOvertimeAllowed = true;
  /** SetCTFCaptureBonusTime (−1 = tf_ctf_bonus_time). */
  ctfCaptureBonusTime = -1;
  /** m_flOriginalTeamRespawnWaveTime. */
  readonly originalWaveTimes = [-1, -1, -1, -1];
  gameType: ObjectiveGameType = '';
  isKoth = false;
  isArena = false;
  /** CTFGameRules::m_flCapturePointEnableTime (arena). */
  arenaCapEnableTime = 0;
  stalemateOnTimelimit = false;
  readonly teamGoal = ['', '', '', ''];
  readonly teamRole = [0, 0, 0, 0];
  requiredObserverTarget = -1;
  capLayout = '';
  /** m_bControlSpawnsPerTeam[team][point]. */
  readonly controlSpawnsPerTeam: boolean[][] = [0, 1, 2, 3].map(() =>
    new Array<boolean>(MAX_CONTROL_POINTS).fill(false),
  );
  /** The networked tf_objective_resource. */
  resource: Entity | null = null;

  constructor(world: GameWorld) {
    this.world = world;
  }

  master(): TeamControlPointMaster | null {
    return this.masters.length > 0 ? this.masters[0] : null;
  }

  pointByIndex(index: number): TeamControlPoint | null {
    return index >= 0 && index < this.sorted.length ? this.sorted[index] : null;
  }

  numControlPoints(): number {
    return this.sorted.length;
  }
}

const registry = new WeakMap<GameWorld, Objectives>();

/** The world's objective state (created on first use). */
export function objectives(world: GameWorld): Objectives {
  let o = registry.get(world);
  if (!o) {
    o = new Objectives(world);
    registry.set(world, o);
  }
  return o;
}

/** The objectives table, for a checkpoint (sim/checkpoint): read without creating. */
export const objectivesTable = {
  peek: (world: GameWorld): Objectives | undefined => registry.get(world),
};

/** Adds `e` to `list` once. */
export function track<T>(list: T[], e: T): void {
  if (!list.includes(e)) list.push(e);
}

/** Removes `e` from `list`. */
export function untrack<T>(list: T[], e: T): void {
  const i = list.indexOf(e);
  if (i >= 0) list.splice(i, 1);
}

// ─── CTFGameRules objective rules ───────────────────────────────────────────

export function inKothMode(world: GameWorld): boolean {
  return objectives(world).isKoth;
}

/** SDK: CTFGameRules::FlagsMayBeCapped. */
export function flagsMayBeCapped(world: GameWorld): boolean {
  const s = world.rules.state;
  return s !== GR_STATE_TEAM_WIN && s !== GR_STATE_PREROUND;
}

/** SDK: CTFGameRules::GetFarthestOwnedControlPoint. */
export function farthestOwnedControlPoint(
  world: GameWorld,
  team: number,
  withSpawnpoints: boolean,
): number {
  const o = objectives(world);
  const ownedEnd = o.baseControlPoint[team] ?? -1;
  if (ownedEnd === -1) return -1;
  const n = o.numControlPoints();
  let walk = 1;
  let enemyEnd = n - 1;
  if (ownedEnd !== 0) {
    walk = -1;
    enemyEnd = 0;
  }
  let farthest = ownedEnd;
  for (let p = ownedEnd; p !== enemyEnd; p += walk) {
    const pt = o.pointByIndex(p);
    if (!pt || pt.ownerTeam !== team) break;
    if (withSpawnpoints && !o.controlSpawnsPerTeam[team][p]) continue;
    farthest = p;
  }
  return farthest;
}

/** SDK: CTFGameRules::TeamMayCapturePoint. */
export function teamMayCapturePoint(world: GameWorld, team: number, pointIndex: number): boolean {
  if (!TF_CAPLINEAR) return true;
  const o = objectives(world);
  const point = o.pointByIndex(pointIndex);
  if (!point) return false;
  let needed = point.previousPointIndex(team, 0);
  // Points set to require themselves are always cappable.
  if (needed === pointIndex) return true;
  if (point.locked) return false;
  if (needed === -1) {
    if (o.isArena)
      return world.rules.state === GR_STATE_STALEMATE && o.arenaCapEnableTime <= world.curtime;
    if (!o.playingMiniRounds) {
      const farthest = farthestOwnedControlPoint(world, team, false);
      return Math.abs(farthest - pointIndex) <= 1;
    }
    return true;
  }
  for (let i = 0; i < MAX_PREVIOUS_POINTS; i++) {
    needed = point.previousPointIndex(team, i);
    if (needed !== -1) {
      const prev = o.pointByIndex(needed);
      if (!prev || prev.ownerTeam !== team) return false;
    }
  }
  return true;
}

/** CTFPlayerShared::IsInvulnerable. */
function isInvulnerable(p: Player): boolean {
  const c = p.cond;
  return (
    c.has(TF_COND.INVULNERABLE) ||
    c.has(TF_COND.INVULNERABLE_HIDE_UNLESS_DAMAGED) ||
    c.has(TF_COND.INVULNERABLE_USER_BUFF) ||
    c.has(TF_COND.INVULNERABLE_CARD_EFFECT)
  );
}

/** CTFPlayerShared::IsStealthed. */
export function isStealthed(p: Player): boolean {
  return p.cond.has(TF_COND.STEALTHED) || p.cond.has(TF_COND.STEALTHED_BLINK);
}

/** SDK: CTFGameRules::PlayerMayCapturePoint. */
export function playerMayCapturePoint(p: Player): boolean {
  if (isStealthed(p)) return false;
  if (isInvulnerable(p) || p.cond.has(TF_COND.MEGAHEAL)) return false;
  if (p.cond.has(TF_COND.PHASE)) return false;
  // IsControlStunned: a stun that stops movement (the conditions module marks it with STUNNED).
  if (p.cond.has(TF_COND.STUNNED) && p.move.stunAmount >= 1) return false;
  if (p.cond.has(TF_COND.DISGUISED) && p.disguiseTeam !== p.team) return false;
  return true;
}

/** SDK: CTFGameRules::PlayerMayBlockPoint — invulnerable players block without capping. */
export function playerMayBlockPoint(p: Player): boolean {
  return isInvulnerable(p);
}

/** SDK: CTFGameRules::GetCaptureValueForPlayer — scouts count double with mp_capstyle 1. */
export function captureValueForPlayer(p: Player): number {
  if (p.playerClass === TF_CLASS_SCOUT) return MP_CAPSTYLE === 1 ? 2 : 10;
  return 1;
}

/** SDK: CTFGameRules::TimerMayExpire (+ CTeamplayRoundBasedRules' train watcher check). */
export function timerMayExpire(world: GameWorld): boolean {
  const o = objectives(world);
  for (let i = 0; i < o.sorted.length; i++) {
    if (o.sorted[i].cappingTeam !== TEAM_UNASSIGNED) {
      o.capInProgressBuffer = world.curtime + 0.1;
      return false;
    }
  }
  if (o.capInProgressBuffer >= world.curtime) return false;
  if (o.ctfOvertimeAllowed) {
    for (const f of o.flags) if (!f.disabled && !f.isHome()) return false;
  }
  for (const w of o.watchers) if (!w.timerMayExpire()) return false;
  return true;
}

/** SDK: CTFGameRules::ShouldScorePerRound — false when the master scores per capture. */
export function shouldScorePerRound(world: GameWorld): boolean {
  const m = objectives(world).master();
  return !(m && m.scorePerCapture);
}

/** SDK: CTFGameRules::RecalculateControlPointState — enable the spawns of each team's farthest point. */
export function recalculateControlPointState(world: GameWorld): void {
  const o = objectives(world);
  if (o.masters.length === 0 || o.playingMiniRounds) return;
  for (const team of [TF_TEAM_RED, TF_TEAM_BLUE]) {
    const farthest = farthestOwnedControlPoint(world, team, true);
    if (farthest === -1) continue;
    forEachTeamSpawn(world, (s) => {
      if (!s.controlPointName || s.team !== team) return;
      const cp = findPointByName(world, s.controlPointName);
      if (!cp) return;
      s.disabled = cp.pointIndex !== farthest;
    });
  }
}

export function findPointByName(world: GameWorld, name: string): TeamControlPoint | null {
  const lc = name.toLowerCase();
  for (const p of objectives(world).points) if (!p.removed && p.targetnameLower === lc) return p;
  return null;
}

/** Every info_player_teamspawn. */
export function forEachTeamSpawn(world: GameWorld, fn: (s: TeamSpawn) => void): void {
  world.forEachEntity((e) => {
    if (e.classname === 'info_player_teamspawn') fn(e as TeamSpawn);
  });
}

/**
 * SDK: CTFGameRules::SetupOnRoundStart's control-spawn bookkeeping for maps
 * without mini-rounds: note which points have spawns per team, disable those
 * spawns, then RecalculateControlPointState enables the farthest ones.
 */
export function setupControlSpawns(world: GameWorld): void {
  const o = objectives(world);
  if (o.playingMiniRounds) return;
  for (const row of o.controlSpawnsPerTeam) row.fill(false);
  forEachTeamSpawn(world, (s) => {
    if (!s.controlPointName) return;
    const cp = findPointByName(world, s.controlPointName);
    if (!cp) return;
    if (s.team >= 0 && s.team < 4 && cp.pointIndex >= 0 && cp.pointIndex < MAX_CONTROL_POINTS) {
      o.controlSpawnsPerTeam[s.team][cp.pointIndex] = true;
    }
    s.disabled = true;
  });
  recalculateControlPointState(world);
}

// ─── Respawn wave times (CTeamplayRoundBasedRules) ─────────────────────────

/** SDK: CTeamplayRoundBasedRules::SetTeamRespawnWaveTime. */
export function setTeamRespawnWaveTime(world: GameWorld, team: number, value: number): void {
  if (team < 0 || team > 3) return;
  const v = value < 0 ? 0 : value;
  const o = objectives(world);
  if (o.originalWaveTimes[team] < 0) o.originalWaveTimes[team] = v;
  world.rules.setTeamRespawnWaveTime(team, v);
}

/** SDK: CTeamplayRoundBasedRules::AddTeamRespawnWaveTime. */
export function addTeamRespawnWaveTime(world: GameWorld, team: number, value: number): void {
  if (team < 0 || team > 3) return;
  const rules = world.rules;
  let current = rules.teamRespawnWaveTimes[team];
  if (current < 0) current = rules.options.respawnWaveTime;
  const o = objectives(world);
  if (o.originalWaveTimes[team] < 0) o.originalWaveTimes[team] = current;
  rules.setTeamRespawnWaveTime(team, Math.max(0, current + value));
}

/** RoundRespawn: "reset our spawn times to the original values". */
export function restoreOriginalWaveTimes(world: GameWorld): void {
  const o = objectives(world);
  for (let t = 0; t < 4; t++)
    if (o.originalWaveTimes[t] >= 0) world.rules.setTeamRespawnWaveTime(t, o.originalWaveTimes[t]);
}

/** Is the round live for objectives (RND_RUNNING, not stalemate)? */
export function roundRunning(world: GameWorld): boolean {
  return world.rules.state === GR_STATE_RND_RUNNING;
}

// ─── tf_objective_resource ─────────────────────────────────────────────────

/** The networked CTFObjectiveResource (mode-wide HUD state). Preserved across CleanUpMap. */
export class ObjectiveResourceEntity extends Entity {
  override spawn(): void {
    super.spawn();
    this.preserved = true;
    objectives(this.world).resource = this;
  }

  override netSchema(): NetSchema | null {
    return NET_OBJECTIVE;
  }

  override writeNet(out: NetRecord): void {
    const o = objectives(this.world);
    const rules = this.world.rules;
    out.gameType = o.gameType;
    out.numPoints = o.sorted.length;
    out.playingMiniRounds = o.playingMiniRounds;
    out.timerInHud = o.timerInHud && !o.timerInHud.removed ? o.timerInHud.id : -1;
    const rk = o.kothTimers[TF_TEAM_RED];
    const bk = o.kothTimers[TF_TEAM_BLUE];
    out.redKothTimer = rk && !rk.removed ? rk.id : -1;
    out.blueKothTimer = bk && !bk.removed ? bk.id : -1;
    out.redFlagCaps = rules.flagCaptures[TF_TEAM_RED];
    out.blueFlagCaps = rules.flagCaptures[TF_TEAM_BLUE];
    out.flagCapLimit = o.gameType === 'ctf' ? TF_FLAG_CAPS_PER_ROUND : 0;
    out.redBasePoint = o.baseControlPoint[TF_TEAM_RED];
    out.blueBasePoint = o.baseControlPoint[TF_TEAM_BLUE];
    out.capLayout = o.capLayout;
    out.redGoal = o.teamGoal[TF_TEAM_RED];
    out.blueGoal = o.teamGoal[TF_TEAM_BLUE];
    out.redRole = o.teamRole[TF_TEAM_RED];
    out.blueRole = o.teamRole[TF_TEAM_BLUE];
    out.arenaCapEnableAt = o.arenaCapEnableTime;
    out.requiredObserverTarget = o.requiredObserverTarget;
  }
}

registerEntityClass('tf_objective_resource', ObjectiveResourceEntity);

/** Creates the objective resource once per world (CTFGameRules::CreateStandardEntities). */
export function ensureObjectiveResource(world: GameWorld): Entity {
  const o = objectives(world);
  if (o.resource && !o.resource.removed) return o.resource;
  return world.spawnEntity('tf_objective_resource');
}

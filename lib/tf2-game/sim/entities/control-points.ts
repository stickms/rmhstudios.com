/**
 * Control points (SDK: server/team_control_point.cpp, trigger_area_capture.cpp,
 * team_control_point_master.cpp, team_control_point_round.cpp):
 *
 * - team_control_point (CTeamControlPoint): owner, default owner, lock state
 *   and unlock time, previous-point requirements, per-team models/skins, the
 *   OnCapTeamX / OnOwnerChangedToTeamX / OnRoundStartOwnedByTeamX outputs and
 *   the capture events. It also carries the per-point arrays of the SDK's
 *   objective resource (capping team, cap percentage, players in the zone,
 *   blocked) for the HUD.
 * - trigger_capture_area (CTriggerAreaCapture): CaptureThink every 0.1 s —
 *   counts cappers (scouts ×2, invulnerable players block only), applies the
 *   mp_capstyle 1 speed-up (each extra capper adds dt/(i+1)), mp_blockstyle 1
 *   blocking (a contested capture pauses), deterioration when the cappers
 *   leave (scaled by mp_capdeteriorate_time, ×6 in overtime), the respawn
 *   wave adjustments (team_spawn_X) and the outputs.
 * - team_control_point_master (CTeamControlPointMaster): finds and renumbers
 *   the points, picks the mini-round, checks win conditions (all points in a
 *   group owned by one team, cpm_restrict_team_cap_win, KOTH timers).
 * - team_control_point_round (CTeamControlPointRound): a stage of a
 *   multi-stage map (cp_dustbowl, pl_badwater's single round).
 */

import { TEAM_UNASSIGNED, TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import { type Entity, EF_NODRAW, EF_NOSHADOW } from '../entity';
import { registerEntityClass } from '../entity-registry';
import type { NetRecord, NetSchema } from '../net-schema';
import type { Player } from '../player';
import {
  GR_STATE_INIT,
  GR_STATE_PREGAME,
  GR_STATE_RND_RUNNING,
  GR_STATE_STARTGAME,
  GR_STATE_TEAM_WIN,
  WINREASON_ALL_POINTS_CAPTURED,
  WINREASON_STALEMATE,
} from '../rules';
import { BaseTrigger, SF_TRIGGER_ALLOW_CLIENTS } from '../triggers';
import type { GameWorld } from '../world';
import {
  ContextThinks,
  MapEntity,
  atoi,
  atof,
  teamOutputIndex,
  stopSound,
  type ThinkContext,
} from './base';
import { NET_CONTROL_POINT } from './net';
import {
  MAX_CONTROL_POINT_GROUPS,
  MAX_PREVIOUS_POINTS,
  MP_BLOCKSTYLE,
  MP_CAPDETERIORATE_TIME,
  MP_CAPSTYLE,
  TEAM_INVALID,
  addTeamRespawnWaveTime,
  captureValueForPlayer,
  objectives,
  playerMayBlockPoint,
  playerMayCapturePoint,
  recalculateControlPointState,
  shouldScorePerRound,
  teamMayCapturePoint,
  timerMayExpire,
  track,
  untrack,
} from './objectives';
import type { TeamTrainWatcher } from './train-watcher';

// team_control_point spawnflags.
export const SF_CAP_POINT_HIDEFLAG = 1 << 0;
export const SF_CAP_POINT_HIDE_MODEL = 1 << 1;
export const SF_CAP_POINT_HIDE_SHADOW = 1 << 2;
export const SF_CAP_POINT_NO_CAP_SOUNDS = 1 << 3;
export const SF_CAP_POINT_BOTS_IGNORE = 1 << 4;

/** AREA_THINK_TIME. */
export const AREA_THINK_TIME = 0.1;
/** MAX_AREA_CAPPERS. */
export const MAX_AREA_CAPPERS = 9;
/** CPM think interval. */
const CPM_THINK_TIME = 0.2;
/** CTeamControlPoint unlock think interval. */
const UNLOCK_THINK_TIME = 0.1;

const HOLOGRAM_START = 'Hologram.Start';
const HOLOGRAM_STOP = 'Hologram.Stop';
const HOLOGRAM_MOVE = 'Hologram.Move';
const HOLOGRAM_INTERRUPTED = 'Hologram.Interrupted';

/** Waiting for players (CTeamplayRoundBasedRules::IsInWaitingForPlayers) — before the first round. */
export function inWaitingForPlayers(world: GameWorld): boolean {
  const s = world.rules.state;
  return s === GR_STATE_INIT || s === GR_STATE_PREGAME || s === GR_STATE_STARTGAME;
}

interface PointTeamData {
  capSound: string;
  model: string;
  timedPoints: number;
  bodygroup: number;
  icon: string;
  overlay: string;
  previous: string[];
  playersRequired: number;
}

const newPointTeamData = (): PointTeamData => ({
  capSound: '',
  model: '',
  timedPoints: 0,
  bodygroup: 0,
  icon: '',
  overlay: '',
  previous: ['', '', ''],
  playersRequired: 1,
});

// ─── team_control_point ────────────────────────────────────────────────────

export class TeamControlPoint extends MapEntity {
  printName = '';
  group = 0;
  defaultOwner = TEAM_UNASSIGNED;
  pointIndex = 0;
  warnOnCap = 0;
  warnSound = '';
  captureStartSound = '';
  captureEndSound = '';
  captureInProgressSound = '';
  captureInterruptedSound = '';
  randomOwnerOnRestart = false;
  locked = false;
  unlockTime = -1;
  active = true;
  startDisabled = false;
  /** m_iTeam. */
  /** The owning team (m_iOwner); `owner` stays the entity-owner id of Entity. */
  ownerTeam = TEAM_UNASSIGNED;
  readonly teamData: PointTeamData[] = [
    newPointTeamData(),
    newPointTeamData(),
    newPointTeamData(),
    newPointTeamData(),
  ];
  lastContestedAt = -1;

  // ── Objective resource arrays (per point) ──
  cappingTeam = TEAM_UNASSIGNED;
  /** Fraction of the capture remaining (1 → 0). */
  capPercent = 0;
  teamInZone = TEAM_UNASSIGNED;
  blocked = false;
  readonly numPlayers = [0, 0, 0, 0];
  readonly canCap = [true, true, true, true];
  readonly capTime = [0, 0, 0, 0];
  inMiniRound = true;
  /** SetTrainPathDistance (0…1), −1 when not on a payload track. */
  trackDistance = -1;
  /** Resolved previous point indices per team ([team*3+i]); −2 unresolved. */
  private readonly previousCache = new Int8Array(4 * MAX_PREVIOUS_POINTS).fill(-2);
  private loopingSound = '';
  private readonly unlockThink: ThinkContext;
  /** The current animation (the hologram's "idle"). */
  sequence = 'idle';

  constructor(classname: string) {
    super(classname);
    this.unlockThink = this.context(() => this.unlockThinkFn());
  }

  override keyValue(key: string, value: string): boolean {
    if (key.startsWith('team_capsound_')) {
      const t = this.teamKey(key, 14);
      if (t >= 0) this.teamData[t].capSound = value;
      return true;
    }
    if (key.startsWith('team_model_')) {
      const t = this.teamKey(key, 11);
      if (t >= 0) this.teamData[t].model = value;
      return true;
    }
    if (key.startsWith('team_timedpoints_')) {
      const t = this.teamKey(key, 17);
      if (t >= 0) this.teamData[t].timedPoints = atoi(value);
      return true;
    }
    if (key.startsWith('team_bodygroup_')) {
      const t = this.teamKey(key, 15);
      if (t >= 0) this.teamData[t].bodygroup = atoi(value);
      return true;
    }
    if (key.startsWith('team_icon_')) {
      const t = this.teamKey(key, 10);
      if (t >= 0) this.teamData[t].icon = value;
      return true;
    }
    if (key.startsWith('team_overlay_')) {
      const t = this.teamKey(key, 13);
      if (t >= 0) this.teamData[t].overlay = value;
      return true;
    }
    if (key.startsWith('team_previouspoint_')) {
      const rest = key.slice(19).split('_');
      const t = atoi(rest[0]);
      const i = atoi(rest[1]);
      if (t >= 0 && t < 4 && i >= 0 && i < MAX_PREVIOUS_POINTS)
        this.teamData[t].previous[i] = value;
      return true;
    }
    switch (key) {
      case 'point_printname':
        this.printName = value;
        return true;
      case 'point_group':
        this.group = atoi(value);
        return true;
      case 'point_default_owner':
        this.defaultOwner = atoi(value);
        return true;
      case 'point_index':
        this.pointIndex = atoi(value);
        return true;
      case 'point_warn_on_cap':
        this.warnOnCap = atoi(value);
        return true;
      case 'point_warn_sound':
        this.warnSound = value;
        return true;
      case 'point_capture_start_sound':
        this.captureStartSound = value;
        return true;
      case 'point_capture_end_sound':
        this.captureEndSound = value;
        return true;
      case 'point_capture_progress_sound':
        this.captureInProgressSound = value;
        return true;
      case 'point_capture_interrupted_sound':
        this.captureInterruptedSound = value;
        return true;
      case 'random_owner_on_restart':
        this.randomOwnerOnRestart = atoi(value) !== 0;
        return true;
      case 'point_start_locked':
        this.locked = atoi(value) !== 0;
        return true;
      case 'startdisabled':
        this.startDisabled = atoi(value) !== 0;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  private teamKey(key: string, at: number): number {
    const t = atoi(key.slice(at));
    return t >= 0 && t < 4 ? t : -1;
  }

  /** SDK: CTeamControlPoint::Spawn. */
  override spawn(): void {
    super.spawn();
    track(objectives(this.world).points, this);
    if (this.defaultOwner < 0 || this.defaultOwner >= 4) this.defaultOwner = TEAM_UNASSIGNED;
    if (!this.captureStartSound) this.captureStartSound = HOLOGRAM_START;
    if (!this.captureEndSound) this.captureEndSound = HOLOGRAM_STOP;
    if (!this.captureInProgressSound) this.captureInProgressSound = HOLOGRAM_MOVE;
    if (!this.captureInterruptedSound) this.captureInterruptedSound = HOLOGRAM_INTERRUPTED;
    this.internalSetOwner(this.defaultOwner, false, null);
    recalculateControlPointState(this.world);
    this.setActive(!this.startDisabled);
    if (this.spawnflags & SF_CAP_POINT_HIDE_MODEL) this.effects |= EF_NODRAW;
    if (this.spawnflags & SF_CAP_POINT_HIDE_SHADOW) this.effects |= EF_NOSHADOW;
    this.lastContestedAt = -1;
  }

  override onRemove(): void {
    const o = objectives(this.world);
    untrack(o.points, this);
    this.stopLoopingSounds();
    super.onRemove();
  }

  isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) this.effects &= ~EF_NODRAW;
    else this.effects |= EF_NODRAW;
  }

  /** Clears the cached previous-point lookups (after the master renumbers). */
  invalidatePrevious(): void {
    this.previousCache.fill(-2);
  }

  /** SDK: CTeamControlPoint::GetPreviousPointForTeam (via ObjectiveResource::GetPreviousPointForPoint). */
  previousPointIndex(team: number, i: number): number {
    if (team < 0 || team >= 4 || i < 0 || i >= MAX_PREVIOUS_POINTS) return -1;
    const k = team * MAX_PREVIOUS_POINTS + i;
    let v = this.previousCache[k];
    if (v === -2) {
      v = -1;
      const name = this.teamData[team].previous[i];
      if (name) {
        const lc = name.toLowerCase();
        for (const p of objectives(this.world).points) {
          if (!p.removed && p.targetnameLower === lc) {
            v = p.pointIndex;
            break;
          }
        }
      }
      this.previousCache[k] = v;
    }
    return v;
  }

  /** SDK: CTeamControlPoint::PointValue. */
  pointValue(): number {
    return this.ownerTeam !== this.defaultOwner ? this.teamData[this.ownerTeam].timedPoints : 0;
  }

  /** SDK: CTeamControlPoint::HandleScoring — per-capture team score when the master scores that way. */
  private handleScoring(team: number): void {
    if (shouldScorePerRound(this.world)) return;
    if (team < 2) return;
    this.world.rules.addTeamScore(team, 1);
    const master = objectives(this.world).master();
    if (master && !master.wouldNewCPOwnerWinGame(this, team)) {
      if (objectives(this.world).gameType === 'pl')
        this.world.emitSound('Hud.EndRoundScored', { entity: this.id });
      else
        this.world.events.push({
          type: 'sound',
          name: 'Hud.EndRoundScored',
          entity: this.id,
          channel: 0,
          team,
        });
    }
  }

  /** SDK: CTeamControlPoint::SetOwner (a capture by players). */
  setOwner(team: number, makeSound: boolean, cappers: readonly number[] | null): void {
    if (!this.world.rules.pointsMayBeCaptured()) return;
    this.handleScoring(team);
    this.internalSetOwner(team, makeSound, cappers);
    recalculateControlPointState(this.world);
  }

  /** SDK: CTeamControlPoint::ForceOwner. */
  forceOwner(team: number): void {
    this.internalSetOwner(team, false, null);
    recalculateControlPointState(this.world);
  }

  /** SDK: CTeamControlPoint::InternalSetOwner. */
  internalSetOwner(team: number, makeSound: boolean, cappers: readonly number[] | null): void {
    const world = this.world;
    const oldTeam = this.ownerTeam;
    this.ownerTeam = team;
    this.changeTeam(team);
    const data = this.teamData[team] ?? this.teamData[0];
    if (makeSound && data.capSound) world.emitSound(data.capSound, { entity: this.id });
    if (data.model) this.model = data.model;
    this.body = team;
    this.skin = team === TEAM_UNASSIGNED ? 2 : team - 2;
    this.sequence = 'idle';
    if (team === TEAM_UNASSIGNED) this.fireOutput('OnCapReset', this);
    else {
      const idx = teamOutputIndex(team);
      if (idx === 1) this.fireOutput('OnCapTeam1', this);
      else if (idx === 2) this.fireOutput('OnCapTeam2', this);
    }
    if (makeSound) {
      void oldTeam;
      const idx = teamOutputIndex(team);
      if (idx === 1) this.fireOutput('OnOwnerChangedToTeam1', this);
      else if (idx === 2) this.fireOutput('OnOwnerChangedToTeam2', this);
      if (team !== TEAM_UNASSIGNED && cappers && cappers.length > 0)
        this.sendCapString(team, cappers);
    }
    const o = objectives(world);
    for (const m of o.masters) {
      if (m.removed || !m.isActive()) continue;
      m.checkWinConditions();
      m.lastOwnershipChangeTime = world.curtime;
    }
  }

  /** SDK: CTeamControlPoint::SendCapString — "teamplay_point_captured" + capture credit. */
  private sendCapString(team: number, cappers: readonly number[]): void {
    const world = this.world;
    for (const id of cappers) {
      const p = world.player(id);
      if (p) p.stats.captures++;
    }
    if (this.printName.length <= 0) return;
    world.events.push({
      type: 'capture',
      kind: 'captured',
      point: this.pointIndex,
      pointName: this.printName,
      team,
      cappers: cappers.slice(0, 8),
    });
  }

  /** SDK: CTeamControlPoint::CaptureStart — "teamplay_point_startcapture". */
  captureStart(capTeam: number, cappers: readonly number[]): void {
    this.world.events.push({
      type: 'capture',
      kind: 'start',
      point: this.pointIndex,
      pointName: this.printName,
      team: capTeam,
      cappers: cappers.slice(0, 8),
    });
  }

  /** SDK: CTeamControlPoint::CaptureEnd. */
  captureEnd(): void {
    this.stopLoopingSounds();
    if (!(this.spawnflags & SF_CAP_POINT_NO_CAP_SOUNDS))
      this.world.emitSound(this.captureEndSound, { entity: this.id });
  }

  /** SDK: CTeamControlPoint::CaptureInterrupted. */
  captureInterrupted(blocked: boolean): void {
    this.stopLoopingSounds();
    if (this.spawnflags & SF_CAP_POINT_NO_CAP_SOUNDS) return;
    let loop: string;
    if (blocked) loop = this.captureInterruptedSound;
    else {
      loop = this.captureInProgressSound;
      this.world.emitSound(this.captureStartSound, { entity: this.id });
    }
    if (loop) {
      this.loopingSound = loop;
      this.world.emitSound(loop, { entity: this.id, channel: 6 });
    }
  }

  stopLoopingSounds(): void {
    if (this.loopingSound) {
      stopSound(this.world, this.id, this.loopingSound, 6);
      this.loopingSound = '';
    }
  }

  /** SDK: CTeamControlPoint::CaptureBlocked — "teamplay_capture_blocked" + defense credit. */
  captureBlocked(blocker: Player, victim: Player | null): void {
    blocker.stats.defenses++;
    if (this.printName.length <= 0) return;
    this.world.events.push({
      type: 'capture',
      kind: 'blocked',
      point: this.pointIndex,
      pointName: this.printName,
      team: blocker.team,
      cappers: victim ? [blocker.id, victim.id] : [blocker.id],
    });
  }

  /** SDK: CTeamControlPoint::InternalSetLocked. */
  internalSetLocked(locked: boolean): void {
    const world = this.world;
    if (!locked && this.locked) {
      world.events.push({
        type: 'capture',
        kind: 'unlocked',
        point: this.pointIndex,
        pointName: this.printName,
        team: this.ownerTeam,
        cappers: [],
      });
    } else if (locked && !this.locked) {
      world.events.push({
        type: 'capture',
        kind: 'locked',
        point: this.pointIndex,
        pointName: this.printName,
        team: this.ownerTeam,
        cappers: [],
      });
    }
    this.locked = locked;
    if (!this.locked) {
      this.unlockTime = -1;
      this.fireOutput('OnUnlocked', this);
      this.setContextThink(this.unlockThink, -1);
    }
  }

  private unlockThinkFn(): void {
    const world = this.world;
    if (
      this.unlockTime > 0 &&
      this.unlockTime < world.curtime &&
      world.rules.state === GR_STATE_RND_RUNNING
    ) {
      this.internalSetLocked(false);
      return;
    }
    this.setContextThink(this.unlockThink, world.curtime + UNLOCK_THINK_TIME);
  }

  /** The point's team percentage for the hologram's pose parameter (GetTeamCapPercentage). */
  teamCapPercentage(team: number): number {
    if (this.cappingTeam === TEAM_UNASSIGNED) return team === this.ownerTeam ? 1 : 0;
    if (team === this.cappingTeam) return 1 - this.capPercent;
    if (team === this.ownerTeam) return this.capPercent;
    return 0;
  }

  /** ObjectiveResource()->ResetControlPoints for this point. */
  resetObjectiveState(): void {
    this.cappingTeam = TEAM_UNASSIGNED;
    this.capPercent = 0;
    this.teamInZone = TEAM_UNASSIGNED;
    this.blocked = false;
    this.numPlayers.fill(0);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    const world = this.world;
    switch (input.toLowerCase()) {
      case 'setowner': {
        const team = atoi(value);
        if (team < 0 || team >= 4 || this.ownerTeam === team) return true;
        if (world.rules.pointsMayBeCaptured()) {
          this.handleScoring(team);
          if (caller && caller.isPlayer()) this.internalSetOwner(team, true, [caller.id]);
          else this.internalSetOwner(team, false, null);
          recalculateControlPointState(world);
        }
        return true;
      }
      case 'showmodel':
        this.effects &= ~EF_NODRAW;
        return true;
      case 'hidemodel':
        this.effects |= EF_NODRAW;
        return true;
      case 'roundactivate': {
        const idx = teamOutputIndex(this.ownerTeam);
        if (idx === 1) this.fireOutput('OnRoundStartOwnedByTeam1', this);
        else if (idx === 2) this.fireOutput('OnRoundStartOwnedByTeam2', this);
        this.internalSetLocked(this.locked);
        return true;
      }
      case 'setlocked':
        if (inWaitingForPlayers(world)) return true;
        this.internalSetLocked(atoi(value) > 0);
        return true;
      case 'setunlocktime': {
        if (inWaitingForPlayers(world)) return true;
        const t = atoi(value);
        if (t <= 0) {
          this.internalSetLocked(false);
          return true;
        }
        this.unlockTime = world.curtime + t;
        this.setContextThink(this.unlockThink, world.curtime + UNLOCK_THINK_TIME);
        return true;
      }
      case 'roundspawn':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    return NET_CONTROL_POINT;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.pointIndex = this.pointIndex;
    out.ownerTeam = this.ownerTeam;
    out.defaultOwner = this.defaultOwner;
    out.cappingTeam = this.cappingTeam;
    out.capPercent = this.capPercent;
    out.teamInZone = this.teamInZone;
    out.blocked = this.blocked;
    out.locked = this.locked;
    out.unlockTime = this.unlockTime;
    out.numRed = this.numPlayers[TF_TEAM_RED];
    out.numBlue = this.numPlayers[TF_TEAM_BLUE];
    out.requiredRed = this.teamData[TF_TEAM_RED].playersRequired;
    out.requiredBlue = this.teamData[TF_TEAM_BLUE].playersRequired;
    out.capTimeRed = this.capTime[TF_TEAM_RED];
    out.capTimeBlue = this.capTime[TF_TEAM_BLUE];
    out.canCapRed = this.canCap[TF_TEAM_RED];
    out.canCapBlue = this.canCap[TF_TEAM_BLUE];
    out.inMiniRound = this.inMiniRound;
    out.visible = this.active && !(this.spawnflags & SF_CAP_POINT_HIDEFLAG);
    out.printName = this.printName;
    out.group = this.group;
    out.warnOnCap = this.warnOnCap;
    out.trackDistance = this.trackDistance;
  }
}

// ─── trigger_capture_area ──────────────────────────────────────────────────

interface AreaTeamData {
  numRequiredToCap: number;
  canCap: boolean;
  spawnAdjust: number;
  numRequiredToStartCap: number;
  numTouching: number;
  blockedTouching: number;
}

const newAreaTeamData = (): AreaTeamData => ({
  numRequiredToCap: 0,
  canCap: false,
  spawnAdjust: 0,
  numRequiredToStartCap: 0,
  numTouching: 0,
  blockedTouching: 0,
});

interface Blocker {
  player: number;
  capAttemptNumber: number;
  nextBlockTime: number;
}

export class TriggerAreaCapture extends BaseTrigger {
  capPointName = '';
  capTime = 0;
  readonly teamData: AreaTeamData[] = [
    newAreaTeamData(),
    newAreaTeamData(),
    newAreaTeamData(),
    newAreaTeamData(),
  ];
  point: TeamControlPoint | null = null;
  capturing = false;
  capturingTeam = TEAM_UNASSIGNED;
  owningTeam = TEAM_UNASSIGNED;
  teamInZone = TEAM_UNASSIGNED;
  timeRemaining = 0;
  lastReductionTime = 0;
  blockedCap = false;
  capAttemptNumber = 0;
  trainWatcher: TeamTrainWatcher | null = null;
  private inStartTouch = false;
  private readonly blockers: Blocker[] = [];
  private readonly thinks = new ContextThinks(this);
  private readonly thinkCtx: ThinkContext;
  // Scratch (CaptureThink locals).
  private readonly numPlayers = [0, 0, 0, 0];
  private readonly numBlockable = [0, 0, 0, 0];
  private readonly firstTouching: (Player | null)[] = [null, null, null, null];
  private readonly cappersScratch: number[] = [];

  constructor(classname: string) {
    super(classname);
    this.thinkCtx = this.thinks.add(() => this.captureThink());
  }

  setContextThink(c: ThinkContext, at: number): void {
    this.thinks.set(c, at);
  }

  override think(): void {
    this.thinks.run();
  }

  /** SDK: CTriggerAreaCapture::KeyValue (team_numcap_ / team_cancap_ / team_spawn_ / team_startcap_). */
  override keyValue(key: string, value: string): boolean {
    const team = (at: number): number => {
      const t = atoi(key.slice(at));
      return t >= 0 && t < 4 ? t : -1;
    };
    if (key.startsWith('team_numcap_')) {
      const t = team(12);
      if (t >= 0) this.teamData[t].numRequiredToCap = atoi(value);
      return true;
    }
    if (key.startsWith('team_cancap_')) {
      const t = team(12);
      if (t >= 0) this.teamData[t].canCap = atoi(value) !== 0;
      return true;
    }
    if (key.startsWith('team_spawn_')) {
      const t = team(11);
      if (t >= 0) this.teamData[t].spawnAdjust = atoi(value);
      return true;
    }
    if (key.startsWith('team_startcap_')) {
      const t = team(14);
      if (t >= 0) this.teamData[t].numRequiredToStartCap = atoi(value);
      return true;
    }
    switch (key) {
      case 'area_cap_point':
        this.capPointName = value;
        return true;
      case 'area_time_to_cap':
        this.capTime = atof(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CTriggerAreaCapture::Spawn. */
  override spawn(): void {
    super.spawn();
    this.spawnflags |= SF_TRIGGER_ALLOW_CLIENTS;
    track(objectives(this.world).areas, this);
    this.setContextThink(this.thinkCtx, this.world.curtime + AREA_THINK_TIME);
    for (const d of this.teamData) {
      if (d.numRequiredToCap < 1) d.numRequiredToCap = 1;
      if (d.numRequiredToStartCap < 1) d.numRequiredToStartCap = 1;
    }
  }

  override onRemove(): void {
    untrack(objectives(this.world).areas, this);
    super.onRemove();
  }

  isActive(): boolean {
    return !this.disabled;
  }

  isBlocked(): boolean {
    return this.blockedCap;
  }

  teamCanCap(team: number): boolean {
    return !!this.teamData[team]?.canCap;
  }

  /** SDK: CTriggerAreaCapture::StartTouch. */
  override startTouch(other: Entity): void {
    super.startTouch(other);
    if (this.passesTriggerFilters(other) && this.point) {
      this.owningTeam = this.point.ownerTeam;
      this.inStartTouch = true;
      this.captureThink();
      this.inStartTouch = false;
    }
  }

  /** SDK: CTriggerAreaCapture::CaptureThink. */
  captureThink(): void {
    const world = this.world;
    const rules = world.rules;
    this.setContextThink(this.thinkCtx, world.curtime + AREA_THINK_TIME);
    const o = objectives(world);
    const master = o.master();
    const point = this.point && !this.point.removed ? this.point : null;
    if (master && point && !master.isInRound(point)) return;
    if (!rules.pointsMayBeCaptured()) {
      if (this.capturing) {
        this.breakCapture(false);
        this.updateNumPlayers();
      }
      return;
    }

    const numPlayers = this.numPlayers;
    const numBlockable = this.numBlockable;
    const first = this.firstTouching;
    for (let i = 2; i < 4; i++) {
      numPlayers[i] = 0;
      numBlockable[i] = 0;
      first[i] = null;
    }
    if (point) {
      const list = this.touching;
      for (let i = 0; i < list.length; i++) {
        const ent = list[i];
        if (!ent.isPlayer() || !ent.alive) continue;
        const p = ent as Player;
        const team = p.team;
        if (team < 2 || team > 3) continue;
        // A team that may not capture this point does not count at all.
        if (!teamMayCapturePoint(world, team, point.pointIndex)) continue;
        if (!playerMayCapturePoint(p)) {
          if (playerMayBlockPoint(p)) {
            if (numPlayers[team] === 0 && numBlockable[team] === 0) first[team] = p;
            numBlockable[team] += captureValueForPlayer(p);
          }
          continue;
        }
        if (numPlayers[team] === 0 && numBlockable[team] === 0) first[team] = p;
        numPlayers[team] += captureValueForPlayer(p);
      }
    }

    let teamsInZone = 0;
    let updatePlayers = false;
    this.teamInZone = TEAM_UNASSIGNED;
    for (let i = 2; i < 4; i++) {
      const d = this.teamData[i];
      if (d.numTouching !== numPlayers[i]) {
        d.numTouching = numPlayers[i];
        updatePlayers = true;
      }
      d.blockedTouching = d.numTouching;
      if (d.numTouching) {
        teamsInZone++;
        this.teamInZone = i;
      }
    }
    if (teamsInZone > 1) this.teamInZone = TEAM_UNASSIGNED;
    else {
      // Blockable-only players of the team not in the zone still contest it (invulnerable defenders).
      for (let i = 2; i < 4; i++) {
        if (!numBlockable[i] || this.teamInZone === i) continue;
        teamsInZone++;
      }
    }
    if (point) point.teamInZone = this.teamInZone;

    let blocked = false;
    if (MP_BLOCKSTYLE === 1 && this.capturing && teamsInZone > 1) {
      blocked = true;
      for (let i = 2; i < 4; i++) {
        numPlayers[i] = 0;
        if (this.teamData[i].numTouching !== 0) {
          this.teamData[i].numTouching = 0;
          updatePlayers = true;
        }
      }
    }
    if (updatePlayers) this.updateNumPlayers(blocked);

    if (this.capturing) {
      if (point) point.lastContestedAt = world.curtime;
      const timeDelta = world.curtime - this.lastReductionTime;
      let reduction = timeDelta;
      if (MP_CAPSTYLE === 1) {
        // Diminishing returns for successive players.
        const n = this.teamInZone >= 0 ? this.teamData[this.teamInZone].numTouching : 0;
        for (let i = 1; i < n; i++) reduction += timeDelta / (i + 1);
      }
      this.lastReductionTime = world.curtime;

      if (teamsInZone > 1) {
        if (!this.blockedCap) {
          this.blockedCap = true;
          this.updateBlocked();
        }
        let percentToGo = this.timeRemaining / this.capTime;
        if (MP_CAPSTYLE === 1)
          percentToGo =
            this.timeRemaining /
            (this.capTime * 2 * this.teamData[this.capturingTeam].numRequiredToCap);
        if (percentToGo <= 0.5 && point) {
          let blocker: Player | null = null;
          for (let i = 2; i < 4; i++) {
            if (this.capturingTeam === i) continue;
            if (first[i]) {
              blocker = first[i];
              break;
            }
          }
          if (blocker) {
            let repeat = false;
            for (let i = this.blockers.length - 1; i >= 0; i--) {
              const b = this.blockers[i];
              if (b.player !== blocker.id) continue;
              if (b.capAttemptNumber !== this.capAttemptNumber || !this.isTouching(blocker)) {
                this.blockers.splice(i, 1);
                continue;
              }
              repeat = true;
              break;
            }
            if (!repeat) {
              point.captureBlocked(blocker, null);
              this.blockers.push({
                player: blocker.id,
                capAttemptNumber: this.capAttemptNumber,
                nextBlockTime: world.curtime + 10,
              });
            }
          }
        }
        if (MP_BLOCKSTYLE === 0) this.breakCapture(false);
        return;
      }

      if (this.blockedCap) {
        this.blockedCap = false;
        this.updateBlocked();
      }

      let totalTimeToCap = this.capTime;
      if (MP_CAPSTYLE === 1)
        totalTimeToCap = this.capTime * 2 * this.teamData[this.capturingTeam].numRequiredToCap;

      if (this.capturingTeam === this.teamInZone) {
        this.setCapTimeRemaining(this.timeRemaining - reduction);
      } else if (this.owningTeam === TEAM_UNASSIGNED && this.teamInZone !== TEAM_UNASSIGNED) {
        this.setCapTimeRemaining(this.timeRemaining + reduction);
      } else if (point && teamMayCapturePoint(world, this.capturingTeam, point.pointIndex)) {
        // Caps deteriorate over time.
        const scale = MP_CAPSTYLE === 1 ? MP_CAPDETERIORATE_TIME : totalTimeToCap;
        let decrease = (totalTimeToCap / scale) * timeDelta;
        if (rules.inOvertime) decrease *= 6;
        this.setCapTimeRemaining(this.timeRemaining + decrease);
      } else {
        this.setCapTimeRemaining(totalTimeToCap);
      }

      if (this.timeRemaining <= 0) {
        this.endCapture(this.capturingTeam);
        return;
      }
      if (!this.inStartTouch && this.timeRemaining >= totalTimeToCap) this.breakCapture(false);
      return;
    }

    // If there are any teams in the zone that aren't the owner, try to start capping.
    if (teamsInZone > 0) {
      for (let i = 2; i < 4; i++) {
        const d = this.teamData[i];
        if (!d.canCap || this.owningTeam === i) continue;
        if (d.numTouching === 0) continue;
        if (d.numTouching < d.numRequiredToStartCap) continue;
        if (MP_CAPSTYLE !== 1 && d.numTouching < d.numRequiredToCap) continue;
        this.startCapture(i);
        break;
      }
    }
  }

  /** SDK: CTriggerAreaCapture::SetCapTimeRemaining. */
  private setCapTimeRemaining(t: number): void {
    this.timeRemaining = t;
    let pct = 0;
    if (this.capturingTeam) {
      pct = this.timeRemaining / this.capTime;
      if (MP_CAPSTYLE === 1)
        pct =
          this.timeRemaining /
          (this.capTime * 2 * this.teamData[this.capturingTeam].numRequiredToCap);
    }
    if (this.point) this.point.capPercent = pct;
  }

  /** SDK: CTriggerAreaCapture::SetOwner. */
  setOwner(team: number): void {
    this.breakCapture(false);
    this.handleRespawnTimeAdjustments(this.owningTeam, team);
    this.owningTeam = team;
  }

  /** SDK: CTriggerAreaCapture::ForceOwner. */
  forceOwner(team: number): void {
    this.setOwner(team);
    this.point?.forceOwner(team);
  }

  /** SDK: CTriggerAreaCapture::HandleRespawnTimeAdjustments. */
  private handleRespawnTimeAdjustments(oldTeam: number, newTeam: number): void {
    if (oldTeam > 1 && this.teamData[oldTeam].spawnAdjust !== 0) {
      addTeamRespawnWaveTime(this.world, oldTeam, -this.teamData[oldTeam].spawnAdjust);
    }
    if (newTeam > 1 && this.teamData[newTeam].spawnAdjust !== 0) {
      addTeamRespawnWaveTime(this.world, newTeam, this.teamData[newTeam].spawnAdjust);
    }
  }

  /** SDK: CTriggerAreaCapture::StartCapture. */
  private startCapture(team: number): void {
    const idx = teamOutputIndex(team);
    if (idx === 1) this.fireOutput('OnStartTeam1', this);
    else if (idx === 2) this.fireOutput('OnStartTeam2', this);
    this.fireOutput('OnStartCap', this);
    this.capturingTeam = team;
    this.updateNumPlayers();
    if (MP_CAPSTYLE === 1)
      this.setCapTimeRemaining(this.capTime * 2 * this.teamData[team].numRequiredToCap);
    else this.setCapTimeRemaining(this.capTime);
    this.capturing = true;
    this.blockedCap = false;
    this.lastReductionTime = this.world.curtime;
    if (this.point) this.point.cappingTeam = this.capturingTeam;
    this.updateBlocked();
    if (this.point)
      this.point.captureStart(this.capturingTeam, this.getNumCappingPlayers(this.capturingTeam));
  }

  /** SDK: CTriggerAreaCapture::GetNumCappingPlayers (player ids). */
  private getNumCappingPlayers(team: number): number[] {
    const out = this.cappersScratch;
    out.length = 0;
    this.world.forEachPlayer((p) => {
      if (out.length < MAX_AREA_CAPPERS - 1 && p.team === team && this.isTouching(p))
        out.push(p.id);
    });
    return out;
  }

  /** SDK: CTriggerAreaCapture::EndCapture. */
  private endCapture(team: number): void {
    this.incrementCapAttemptNumber();
    const idx = teamOutputIndex(team);
    if (idx === 1) this.fireOutput('OnCapTeam1', this);
    else if (idx === 2) this.fireOutput('OnCapTeam2', this);
    this.fireOutput('OnEndCap', this);
    const cappers = this.getNumCappingPlayers(team).slice();
    this.handleRespawnTimeAdjustments(this.owningTeam, team);
    this.owningTeam = team;
    this.capturing = false;
    this.capturingTeam = TEAM_UNASSIGNED;
    this.setCapTimeRemaining(0);
    const point = this.point;
    if (point) {
      point.cappingTeam = TEAM_UNASSIGNED;
      point.setOwner(this.owningTeam, true, cappers);
      point.captureEnd();
    }
    this.setNumCappers(0);
  }

  /** SDK: CTriggerAreaCapture::BreakCapture. */
  breakCapture(notEnoughPlayers: boolean): void {
    if (!this.capturing) return;
    const idx = teamOutputIndex(this.capturingTeam);
    if (idx === 1) this.fireOutput('OnBreakTeam1', this);
    else if (idx === 2) this.fireOutput('OnBreakTeam2', this);
    this.fireOutput('OnBreakCap', this);
    this.capturing = false;
    const team = this.capturingTeam;
    this.capturingTeam = TEAM_UNASSIGNED;
    if (this.point) this.point.cappingTeam = TEAM_UNASSIGNED;
    if (notEnoughPlayers) this.incrementCapAttemptNumber();
    const remaining = this.timeRemaining;
    this.setCapTimeRemaining(0);
    if (this.point) {
      this.point.captureEnd();
      this.world.events.push({
        type: 'capture',
        kind: 'broken',
        point: this.point.pointIndex,
        pointName: this.point.printName,
        team,
        cappers: [],
      });
      void remaining;
    }
    this.setNumCappers(0);
  }

  private incrementCapAttemptNumber(): void {
    this.capAttemptNumber++;
    this.blockers.length = 0;
  }

  /** SDK: CTriggerAreaCapture::InputRoundSpawn — find the point and publish its requirements. */
  roundSpawn(): void {
    if (this.point && !this.point.removed) return;
    this.point = null;
    const lc = this.capPointName.toLowerCase();
    for (const p of objectives(this.world).points) {
      if (!p.removed && p.targetnameLower === lc) {
        this.point = p;
        break;
      }
    }
    const p = this.point;
    if (!p) return;
    this.owningTeam = p.ownerTeam;
    for (let i = 2; i < 4; i++) {
      const d = this.teamData[i];
      p.teamData[i].playersRequired = d.numRequiredToCap;
      p.canCap[i] = d.canCap;
      p.capTime[i] = MP_CAPSTYLE === 1 ? this.capTime * 2 * d.numRequiredToCap : this.capTime;
    }
  }

  /** SDK: CTriggerAreaCapture::CheckIfDeathCausesBlock. */
  checkIfDeathCausesBlock(victim: Player, killer: Player): boolean {
    if (!this.isTouching(victim)) return false;
    if (victim.team === killer.team) return true;
    if (!this.capturing) return true;
    if (victim.team !== this.capturingTeam) return true;
    const d = this.teamData[this.capturingTeam];
    const breakCap =
      MP_CAPSTYLE === 1 ? d.blockedTouching - 1 <= 0 : d.blockedTouching - 1 < d.numRequiredToCap;
    if (breakCap && this.point) this.point.captureBlocked(killer, victim);
    return true;
  }

  /** SDK: CTriggerAreaCapture::UpdateNumPlayers. */
  private updateNumPlayers(blocked = false): void {
    const p = this.point;
    if (!p) return;
    for (let i = 0; i < 4; i++) {
      if (i >= 2 && i === this.capturingTeam)
        this.setNumCappers(this.teamData[i].numTouching, blocked);
      p.numPlayers[i] = this.teamData[i].numTouching;
    }
  }

  /** SDK: CTriggerAreaCapture::UpdateBlocked. */
  private updateBlocked(): void {
    if (!this.point) return;
    this.point.blocked = this.blockedCap;
    this.point.captureInterrupted(this.blockedCap);
  }

  /** SDK: CTriggerAreaCapture::SetNumCappers — the cart reads OnNumCappersChanged / the watcher. */
  private setNumCappers(n: number, blocked = false): void {
    this.fireOutput('OnNumCappersChanged', this, String(n));
    const n2 = blocked ? -1 : n;
    this.fireOutput('OnNumCappersChanged2', this, String(n2));
    const w = this.trainWatcher;
    if (w && !w.removed) w.setNumTrainCappers(n2, this);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'roundspawn':
        this.roundSpawn();
        return true;
      case 'setteamcancap': {
        const parts = value.trim().split(/\s+/);
        if (parts.length >= 2) {
          const team = atoi(parts[0]);
          if (team >= 0 && team < 4) {
            this.teamData[team].canCap = atoi(parts[1]) !== 0;
            if (this.point) this.point.canCap[team] = this.teamData[team].canCap;
          }
        }
        return true;
      }
      case 'setcontrolpoint': {
        this.breakCapture(false);
        this.capPointName = value;
        this.point = null;
        this.roundSpawn();
        // Everyone touching re-touches so the HUD (and counts) set up for the new point.
        const list = this.touching.slice();
        for (const e of list) {
          if (!e.isPlayer()) continue;
          this.endTouch(e);
          this.startTouch(e);
        }
        return true;
      }
      case 'capturecurrentcp':
        if (this.capturing) this.endCapture(this.capturingTeam);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── team_control_point_round ──────────────────────────────────────────────

export class TeamControlPointRound extends MapEntity {
  disabled = false;
  cpNames = '';
  priority = 0;
  invalidCapWinner = 0;
  printNameKey = '';
  readonly controlPoints: TeamControlPoint[] = [];

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'startdisabled':
        this.disabled = atoi(value) !== 0;
        return true;
      case 'cpr_cp_names':
        this.cpNames = value;
        return true;
      case 'cpr_priority':
        this.priority = atoi(value);
        return true;
      case 'cpr_restrict_team_cap_win':
        this.invalidCapWinner = atoi(value);
        return true;
      case 'cpr_printname':
        this.printNameKey = value;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  override spawn(): void {
    super.spawn();
    track(objectives(this.world).rounds, this);
  }

  override activate(): void {
    super.activate();
    this.findControlPoints();
  }

  override onRemove(): void {
    untrack(objectives(this.world).rounds, this);
    super.onRemove();
  }

  /** SDK: CTeamControlPointRound::FindControlPoints (space-separated names; head insertion like AddToHead). */
  findControlPoints(): void {
    this.controlPoints.length = 0;
    const names = this.cpNames
      .toLowerCase()
      .split(/\s+/)
      .filter((n) => n !== '');
    for (const p of objectives(this.world).points) {
      if (p.removed) continue;
      if (names.includes(p.targetnameLower) && !this.controlPoints.includes(p))
        this.controlPoints.unshift(p);
    }
  }

  isControlPointInRound(p: TeamControlPoint): boolean {
    return this.controlPoints.includes(p);
  }

  /** SDK: CTeamControlPointRound::TeamOwnsAllPoints. */
  teamOwnsAllPoints(
    overridePoint: TeamControlPoint | null = null,
    overrideTeam = TEAM_UNASSIGNED,
  ): number {
    return teamOwnsAll(this.controlPoints, overridePoint, overrideTeam);
  }

  wouldNewCPOwnerWinGame(p: TeamControlPoint, newOwner: number): boolean {
    return this.teamOwnsAllPoints(p, newOwner) === newOwner;
  }

  /** SDK: CTeamControlPointRound::CheckWinConditions. */
  checkWinConditions(): number {
    const winners = this.teamOwnsAllPoints();
    if (this.invalidCapWinner !== 1 && winners >= 2 && winners !== this.invalidCapWinner) {
      if (kothWinBlocked(this.world, winners)) return -1;
      this.fireTeamWinOutput(winners);
      return winners;
    }
    return -1;
  }

  fireTeamWinOutput(team: number): void {
    const idx = teamOutputIndex(team);
    if (idx === 1) this.fireOutput('OnWonByTeam1', this);
    else if (idx === 2) this.fireOutput('OnWonByTeam2', this);
  }

  /** SDK: CTeamControlPointRound::IsPlayable. */
  isPlayable(): boolean {
    const winners = this.teamOwnsAllPoints();
    if (this.invalidCapWinner === 1) return true;
    if (winners >= 2 && winners !== this.invalidCapWinner) return false;
    return true;
  }

  /** SDK: CTeamControlPointRound::MakePlayable. */
  makePlayable(): boolean {
    const master = objectives(this.world).master();
    if (!master || this.isPlayable()) return false;
    for (let team = 2; team < 4; team++) {
      for (const cp of this.controlPoints) {
        if (master.isBaseControlPoint(cp.pointIndex) || this.wouldNewCPOwnerWinGame(cp, team))
          continue;
        for (const area of objectives(this.world).areas) {
          if (area.teamCanCap(team) && area.point === cp) {
            area.forceOwner(team);
            return true;
          }
        }
      }
    }
    return false;
  }

  /** SDK: CTeamControlPointRound::SelectedToPlay → SetupSpawnPoints (CTFGameRules::SetupSpawnPointsForRound). */
  selectedToPlay(): void {
    const world = this.world;
    const name = this.targetnameLower;
    world.spawns.setupSpawnPointsForRound(
      (n) => n.toLowerCase() === name,
      (pointName) => {
        const lc = pointName.toLowerCase();
        return this.controlPoints.some((p) => p.targetnameLower === lc);
      },
      (pointName) => {
        const lc = pointName.toLowerCase();
        const p = objectives(world).points.find((x) => !x.removed && x.targetnameLower === lc);
        return p ? p.ownerTeam : TEAM_UNASSIGNED;
      },
    );
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'roundspawn':
        this.findControlPoints();
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** TeamOwnsAllPoints over a point list: a team owning every point of some group wins. */
function teamOwnsAll(
  points: readonly TeamControlPoint[],
  overridePoint: TeamControlPoint | null,
  overrideTeam: number,
): number {
  const winning = groupScratch;
  winning.fill(TEAM_INVALID);
  for (const p of points) {
    const group = p.group >= 0 && p.group < MAX_CONTROL_POINT_GROUPS ? p.group : 0;
    const owner = p === overridePoint ? overrideTeam : p.ownerTeam;
    if (winning[group] === TEAM_INVALID) winning[group] = owner;
    else if (winning[group] === TEAM_UNASSIGNED) continue;
    else if (owner !== winning[group]) winning[group] = TEAM_UNASSIGNED;
  }
  for (let i = 0; i < MAX_CONTROL_POINT_GROUPS; i++) if (winning[i] >= 2) return winning[i];
  return TEAM_UNASSIGNED;
}
const groupScratch = new Array<number>(MAX_CONTROL_POINT_GROUPS).fill(TEAM_INVALID);

/** The KOTH clause of CheckWinConditions: the owner's team timer must have run out (and may expire). */
function kothWinBlocked(world: GameWorld, winners: number): boolean {
  const o = objectives(world);
  if (!o.isKoth) return false;
  const timer = o.kothTimers[winners];
  if (timer && !timer.removed) {
    if (timer.getTimeRemaining() > 0 || !timerMayExpire(world)) return true;
  }
  return false;
}

// ─── team_control_point_master ─────────────────────────────────────────────

export class TeamControlPointMaster extends MapEntity {
  disabled = false;
  capLayout = '';
  invalidCapWinner = 0;
  switchTeamsOnWin = false;
  scorePerCapture = false;
  playAllRounds = false;
  partialCapPointsRate = 0;
  customPositionX = -1;
  customPositionY = -1;
  readonly teamBaseIcons = ['', '', '', ''];
  /** m_ControlPoints, sorted by point index. */
  readonly controlPoints: TeamControlPoint[] = [];
  readonly controlPointRounds: TeamControlPointRound[] = [];
  currentRoundIndex = -1;
  firstRoundAfterRestart = true;
  lastOwnershipChangeTime = -1;
  /** PreviousRoundEnd pending (set when a round is won; fired at the next RoundSpawn). */
  roundEndPending = false;
  private readonly cpmThink: ThinkContext;

  constructor(classname: string) {
    super(classname);
    this.cpmThink = this.context(() => this.cpmThinkFn());
  }

  override keyValue(key: string, value: string): boolean {
    if (key.startsWith('team_base_icon_')) {
      const t = atoi(key.slice(15));
      if (t >= 0 && t < 4) this.teamBaseIcons[t] = value;
      return true;
    }
    switch (key) {
      case 'startdisabled':
        this.disabled = atoi(value) !== 0;
        return true;
      case 'caplayout':
        this.capLayout = value;
        return true;
      case 'cpm_restrict_team_cap_win':
        this.invalidCapWinner = atoi(value);
        return true;
      case 'switch_teams':
        this.switchTeamsOnWin = atoi(value) !== 0;
        return true;
      case 'score_style':
        this.scorePerCapture = atoi(value) !== 0;
        return true;
      case 'play_all_rounds':
        this.playAllRounds = atoi(value) !== 0;
        return true;
      case 'partial_cap_points_rate':
        this.partialCapPointsRate = atof(value);
        return true;
      case 'custom_position_x':
        this.customPositionX = atof(value);
        return true;
      case 'custom_position_y':
        this.customPositionY = atof(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  override spawn(): void {
    super.spawn();
    this.currentRoundIndex = -1;
    this.firstRoundAfterRestart = true;
    this.lastOwnershipChangeTime = -1;
    track(objectives(this.world).masters, this);
  }

  override activate(): void {
    super.activate();
    this.findControlPoints();
    this.findControlPointRounds();
    this.setBaseControlPoints();
  }

  override onRemove(): void {
    untrack(objectives(this.world).masters, this);
    super.onRemove();
  }

  isActive(): boolean {
    return !this.disabled;
  }

  playingMiniRounds(): boolean {
    return this.controlPointRounds.length > 0;
  }

  getCurrentRound(): TeamControlPointRound | null {
    if (this.currentRoundIndex < 0 || this.currentRoundIndex >= this.controlPointRounds.length)
      return null;
    return this.controlPointRounds[this.currentRoundIndex];
  }

  /** SDK: CTeamControlPointMaster::FindControlPoints — collect active points and renumber them 0…N−1. */
  findControlPoints(): boolean {
    const o = objectives(this.world);
    const list = this.controlPoints;
    list.length = 0;
    for (const p of o.points) {
      if (p.removed || !p.isActive()) continue;
      if (list.some((q) => q.pointIndex === p.pointIndex)) {
        // Multiple control points with the same index: duplicates are removed.
        this.world.remove(p);
        continue;
      }
      list.push(p);
    }
    list.sort((a, b) => a.pointIndex - b.pointIndex);
    for (let i = 0; i < list.length; i++) list[i].pointIndex = i;
    o.sorted.length = 0;
    for (const p of list) o.sorted.push(p);
    for (const p of o.points) p.invalidatePrevious();
    return list.length > 0;
  }

  /** SDK: CTeamControlPointMaster::SetBaseControlPoints. */
  setBaseControlPoints(): void {
    const o = objectives(this.world);
    for (let team = 0; team < 4; team++) o.baseControlPoint[team] = this.getBaseControlPoint(team);
  }

  /** SDK: CTeamControlPointMaster::FindControlPointRounds (sorted by priority, highest first). */
  findControlPointRounds(): boolean {
    const o = objectives(this.world);
    this.controlPointRounds.length = 0;
    for (const r of o.rounds) {
      if (r.removed) continue;
      if (!this.controlPointRounds.includes(r)) this.controlPointRounds.unshift(r);
    }
    // ControlPointRoundSort: descending priority (a stable sort keeps head-insertion order on ties).
    this.controlPointRounds.sort((a, b) => b.priority - a.priority);
    const found = this.controlPointRounds.length > 0;
    o.playingMiniRounds = found;
    o.capLayout = this.capLayout;
    return found;
  }

  isInRound(p: TeamControlPoint): boolean {
    const r = this.getCurrentRound();
    if (this.controlPointRounds.length > 0 && r) return r.isControlPointInRound(p);
    return true;
  }

  numPlayableControlPointRounds(): number {
    let n = 0;
    for (const r of this.controlPointRounds) if (r.isPlayable()) n++;
    return n;
  }

  /** SDK: CTeamControlPointMaster::GetControlPointRoundToPlay. */
  getControlPointRoundToPlay(): boolean {
    const rounds = this.controlPointRounds;
    let i = 0;
    for (; i < rounds.length; i++) if (rounds[i].isPlayable()) break;
    if (i >= rounds.length) {
      this.currentRoundIndex = -1;
      return false;
    }
    const priority = rounds[i].priority;
    const candidates: number[] = [];
    const o = objectives(this.world);
    const last = lastPlayedRound.get(o) ?? '';
    let lastIdx = -1;
    for (i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      if (r.isPlayable() && r.priority === priority) {
        if (r.targetnameLower === last) lastIdx = i;
        candidates.unshift(i);
      }
    }
    if (candidates.length === 0) {
      this.currentRoundIndex = -1;
      return false;
    }
    if (candidates.length > 1 && lastIdx !== -1) candidates.splice(candidates.indexOf(lastIdx), 1);
    const pick = candidates.length > 1 ? this.world.random.randomInt(0, candidates.length - 1) : 0;
    this.currentRoundIndex = candidates[pick];
    const round = rounds[this.currentRoundIndex];
    round.selectedToPlay();
    round.fireOutput('OnStart', round);
    this.setBaseControlPoints();
    lastPlayedRound.set(o, round.targetnameLower);
    this.firstRoundAfterRestart = false;
    return true;
  }

  private cpmThinkFn(): void {
    if (!this.disabled && this.world.rules.pointsMayBeCaptured()) this.checkWinConditions();
    this.setContextThink(this.cpmThink, this.world.curtime + CPM_THINK_TIME);
  }

  /** SDK: CTeamControlPointMaster::CheckWinConditions. */
  checkWinConditions(): void {
    if (this.disabled) return;
    const rules = this.world.rules;
    if (rules.state === GR_STATE_TEAM_WIN) return;
    if (this.controlPointRounds.length > 0) {
      const r = this.getCurrentRound();
      if (!r) return;
      const winners = r.checkWinConditions();
      if (winners !== -1 && winners >= 2) {
        const forceMapReset = this.numPlayableControlPointRounds() === 0;
        rules.setWinningTeam(
          winners,
          WINREASON_ALL_POINTS_CAPTURED,
          forceMapReset,
          forceMapReset && this.switchTeamsOnWin,
          !shouldScorePerRound(this.world),
        );
        this.roundEndPending = true;
        this.fireTeamWinOutput(winners);
      }
      return;
    }
    const winners = teamOwnsAll(this.controlPoints, null, TEAM_UNASSIGNED);
    if (this.invalidCapWinner !== 1 && winners >= 2 && winners !== this.invalidCapWinner) {
      if (kothWinBlocked(this.world, winners)) return;
      rules.setWinningTeam(
        winners,
        WINREASON_ALL_POINTS_CAPTURED,
        true,
        this.switchTeamsOnWin,
        !shouldScorePerRound(this.world),
      );
      this.fireTeamWinOutput(winners);
    }
  }

  fireTeamWinOutput(team: number): void {
    const idx = teamOutputIndex(team);
    if (idx === 1) this.fireOutput('OnWonByTeam1', this);
    else if (idx === 2) this.fireOutput('OnWonByTeam2', this);
  }

  /** SDK: CTeamControlPointMaster::FireRoundEndOutput (from CTFGameRules::PreviousRoundEnd). */
  fireRoundEndOutput(): void {
    const r = this.getCurrentRound();
    if (r) {
      r.fireOutput('OnEnd', r);
      this.currentRoundIndex = -1;
    }
  }

  /** SDK: CTeamControlPointMaster::InternalSetWinner. */
  private internalSetWinner(team: number): void {
    let forceMapReset = true;
    if (this.controlPointRounds.length > 0)
      forceMapReset = this.numPlayableControlPointRounds() === 0;
    const rules = this.world.rules;
    if (team === TEAM_UNASSIGNED) rules.setStalemate(WINREASON_STALEMATE, forceMapReset);
    else {
      rules.setWinningTeam(
        team,
        WINREASON_ALL_POINTS_CAPTURED,
        forceMapReset,
        forceMapReset && this.switchTeamsOnWin,
        !shouldScorePerRound(this.world),
      );
      if (!forceMapReset) this.roundEndPending = true;
      this.fireTeamWinOutput(team);
    }
  }

  /** SDK: CTeamControlPointMaster::TeamOwnsAllPoints. */
  teamOwnsAllPoints(
    overridePoint: TeamControlPoint | null = null,
    overrideTeam = TEAM_UNASSIGNED,
  ): number {
    return teamOwnsAll(this.controlPoints, overridePoint, overrideTeam);
  }

  wouldNewCPOwnerWinGame(p: TeamControlPoint, newOwner: number): boolean {
    return this.teamOwnsAllPoints(p, newOwner) === newOwner;
  }

  isBaseControlPoint(index: number): boolean {
    for (let team = 2; team < 4; team++) if (this.getBaseControlPoint(team) === index) return true;
    return false;
  }

  /** SDK: CTeamControlPointMaster::GetBaseControlPoint. */
  getBaseControlPoint(team: number): number {
    let lowest = 999;
    let highest = -1;
    let lowestPoint: TeamControlPoint | null = null;
    let highestPoint: TeamControlPoint | null = null;
    const mini = this.playingMiniRounds();
    for (const p of this.controlPoints) {
      if (mini && !(this.isInRound(p) && team > 1)) continue;
      const v = p.pointIndex;
      if (v > highest) {
        highest = v;
        highestPoint = p;
      }
      if (v < lowest) {
        lowest = v;
        lowestPoint = p;
      }
    }
    if (lowestPoint && highestPoint) {
      if (
        (lowestPoint.defaultOwner === team && highestPoint.defaultOwner === team) ||
        highestPoint.defaultOwner === team
      )
        return highest;
      if (lowestPoint.defaultOwner === team) return lowest;
    }
    return -1;
  }

  /** SDK: CTeamControlPointMaster::InputRoundSpawn. */
  private roundSpawn(): void {
    if (this.roundEndPending) {
      this.roundEndPending = false;
      this.fireRoundEndOutput();
    }
    if (this.findControlPoints()) this.setContextThink(this.cpmThink, this.world.curtime + 0.1);
    this.findControlPointRounds();
    this.setBaseControlPoints();
    for (const p of this.controlPoints) p.resetObjectiveState();
  }

  /** SDK: CTeamControlPointMaster::InputRoundActivate. */
  private roundActivate(): void {
    if (this.playingMiniRounds() && !this.getCurrentRound()) this.getControlPointRoundToPlay();
    if (this.playingMiniRounds()) {
      const r = this.getCurrentRound();
      if (r) for (const p of this.controlPoints) p.inMiniRound = r.isControlPointInRound(p);
    } else {
      for (const p of this.controlPoints) p.inMiniRound = true;
    }
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'setwinner':
        this.internalSetWinner(atoi(value));
        return true;
      case 'setwinnerandforcecaps': {
        const team = atoi(value);
        const o = objectives(this.world);
        for (const p of this.controlPoints) {
          if (!o.playingMiniRounds || p.inMiniRound) p.forceOwner(team);
        }
        this.internalSetWinner(team);
        return true;
      }
      case 'roundspawn':
        this.roundSpawn();
        return true;
      case 'roundactivate':
        this.roundActivate();
        return true;
      case 'setcaplayout':
        this.capLayout = value;
        objectives(this.world).capLayout = value;
        return true;
      case 'setcaplayoutcustompositionx':
        this.customPositionX = atof(value);
        return true;
      case 'setcaplayoutcustompositiony':
        this.customPositionY = atof(value);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** CTeamplayRoundBasedRules' last played mini-round, per world (persists across CleanUpMap). */
const lastPlayedRound = new WeakMap<object, string>();

/** The last played mini-round, for a checkpoint (sim/checkpoint). Keyed by the world's objectives. */
export const lastPlayedRoundTable = {
  peek: (o: object): string | undefined => lastPlayedRound.get(o),
  set: (o: object, round: string): void => void lastPlayedRound.set(o, round),
};

registerEntityClass('team_control_point', TeamControlPoint);
registerEntityClass('trigger_capture_area', TriggerAreaCapture);
registerEntityClass('team_control_point_round', TeamControlPointRound);
registerEntityClass('team_control_point_master', TeamControlPointMaster);

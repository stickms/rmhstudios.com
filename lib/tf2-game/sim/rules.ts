/**
 * Game rules, mode-agnostic core: the round state machine of
 * CTeamplayRoundBasedRules (INIT → PREGAME → STARTGAME → PREROUND →
 * RND_RUNNING → TEAM_WIN → PREROUND …, STALEMATE, GAME_OVER), respawn waves
 * (CheckRespawnWaves / GetNextRespawnWave / GetMinTimeWhenPlayerMaySpawn /
 * GetRespawnWaveMaxLength with the player-count scaling), team scores and
 * the TF specifics of CTFGameRules the core needs (humiliation, frozen
 * preround, round-start entity inputs).
 *
 * Win conditions live in the map's entities and the `GameMode` plug-in
 * (CTF/CP/KOTH/PL/Arena): they call `setWinningTeam(team, reason)`.
 */

import { TEAM_UNASSIGNED, TF_TEAM_BLUE, TF_TEAM_RED } from '../core/constants';
import { remapClamped } from '../core/vec';
import type { DamageInfo } from './damage';
import type { Player } from './player';
import { LIFE_ALIVE, LIFE_DEAD, LIFE_DYING } from './entity';
import { NET_RULES, type NetRecord } from './net-schema';
import type { BaseObject } from './building-api';
import type { GameWorld } from './world';

// gamerules_roundstate_t
export const GR_STATE_INIT = 0;
export const GR_STATE_PREGAME = 1;
export const GR_STATE_STARTGAME = 2;
export const GR_STATE_PREROUND = 3;
export const GR_STATE_RND_RUNNING = 4;
export const GR_STATE_TEAM_WIN = 5;
export const GR_STATE_RESTART = 6;
export const GR_STATE_STALEMATE = 7;
export const GR_STATE_GAME_OVER = 8;
export const GR_STATE_BONUS = 9;
export const GR_STATE_BETWEEN_RNDS = 10;

// WINREASON_*
export const WINREASON_NONE = 0;
export const WINREASON_ALL_POINTS_CAPTURED = 1;
export const WINREASON_OPPONENTS_DEAD = 2;
export const WINREASON_FLAG_CAPTURE_LIMIT = 3;
export const WINREASON_DEFEND_UNTIL_TIME_LIMIT = 4;
export const WINREASON_STALEMATE = 5;
export const WINREASON_TIMELIMIT = 6;
export const WINREASON_WINLIMIT = 7;
export const WINREASON_WINDIFFLIMIT = 8;

/** TEAMPLAY_ROUND_WIN_SCORE. */
export const TEAMPLAY_ROUND_WIN_SCORE = 1;
/** spec_freeze_time + spec_freeze_traveltime in TF (player.cpp) + the 2 s death animation. */
export const DEATH_ANIM_AND_FREEZECAM = 2.0 + 0.4 + 4.0;

/** The plug-in a game mode implements (CTF, CP, KOTH, PL, Arena). Every hook is optional. */
export interface GameMode {
  readonly name: string;
  /** After the map's entities spawned and activated, before the first round. */
  init?(rules: GameRules): void;
  /** PREROUND entered: map cleaned up, RoundSpawn/RoundActivate sent, before players respawn. */
  onRoundStart?(rules: GameRules): void;
  /** RND_RUNNING entered (setup or the fight begins). */
  onRoundActive?(rules: GameRules): void;
  /** Every tick, after entity thinks. */
  think?(rules: GameRules): void;
  /** A player died (drop the flag, arena last-man-standing). */
  onPlayerKilled?(rules: GameRules, victim: Player, info: DamageInfo, scorer: Player | null, assister: Player | null): void;
  onPlayerSpawned?(rules: GameRules, player: Player): void;
  /** The round was won (or stalemated: team 0). */
  onRoundWin?(rules: GameRules, team: number, reason: number): void;
  /** May dead players respawn now (Arena: no)? */
  allowsRespawn?(rules: GameRules, player: Player): boolean;
  /** Override the respawn wave seconds for a team (else the rules' value). */
  respawnWaveTime?(rules: GameRules, team: number): number | undefined;
  /** Should the next round fully reset the map (multi-stage CP sets false between stages)? */
  forceMapResetNextRound?(rules: GameRules): boolean | undefined;
  /** Fills mode-specific HUD state for the net layer. */
  writeNet?(out: NetRecord): void;
}

export interface RulesOptions {
  /** mp_respawnwavetime (10). */
  respawnWaveTime: number;
  /** mp_bonusroundtime (SDK default 15). */
  bonusRoundTime: number;
  /** 5 × mp_enableroundwaittime. */
  preroundTime: number;
  /** mp_waitingforplayers_time (0 = start at once). */
  waitingForPlayersTime: number;
  /** mp_timelimit in minutes (0 = none). */
  timeLimit: number;
  /** mp_winlimit (0 = none). */
  winLimit: number;
  /** mp_maxrounds (0 = none). */
  maxRounds: number;
  /** mp_stalemate_enable. */
  stalemateEnable: boolean;
  /** mp_disable_respawn_times. */
  disableRespawnTimes: boolean;
  /** After game over, restart instead of ending (rooms loop forever). */
  loopForever: boolean;
}

export const defaultRulesOptions = (): RulesOptions => ({
  respawnWaveTime: 10,
  bonusRoundTime: 15,
  preroundTime: 5,
  waitingForPlayersTime: 0,
  timeLimit: 0,
  winLimit: 0,
  maxRounds: 0,
  stalemateEnable: false,
  disableRespawnTimes: false,
  loopForever: true,
});

const GAME_TEAMS = [TF_TEAM_RED, TF_TEAM_BLUE] as const;
/** Player ids are 1…MAX_PLAYERS (world.ts; repeated to keep this module free of a value import cycle). */
const MAX_PLAYERS = 32;

const STATE_NAMES = [
  'init',
  'pregame',
  'startgame',
  'preround',
  'running',
  'team_win',
  'restart',
  'stalemate',
  'game_over',
  'bonus',
  'between_rounds',
];

export class GameRules {
  readonly world: GameWorld;
  readonly options: RulesOptions;
  mode: GameMode | null = null;
  state = GR_STATE_INIT;
  stateEnteredAt = 0;
  /** m_flStateTransitionTime. */
  stateTransitionTime = 0;
  winningTeam = TEAM_UNASSIGNED;
  winReason = WINREASON_NONE;
  roundsPlayed = 0;
  roundStartTime = 0;
  /** Team scores (round wins; TEAMPLAY_ROUND_WIN_SCORE each), indexed by team. */
  readonly teamScores = [0, 0, 0, 0];
  /** Flag captures per team (CTF HUD). */
  readonly flagCaptures = [0, 0, 0, 0];
  /** m_flNextRespawnWave per team. */
  readonly nextRespawnWave = [0, 0, 0, 0];
  /** m_TeamRespawnWaveTimes per team (−1 = mp_respawnwavetime). */
  readonly teamRespawnWaveTimes = [-1, -1, -1, -1];
  /** Set by setWinningTeam: next PREROUND cleans the map up (m_bForceMapReset). */
  forceMapReset = true;
  /** Map time started (ResetMapTime). */
  mapStartTime = 0;
  inSetup = false;
  inOvertime = false;
  gameOver = false;
  private readonly scratch: Player[] = [];

  constructor(world: GameWorld, options: Partial<RulesOptions> = {}) {
    this.world = world;
    this.options = { ...defaultRulesOptions(), ...options };
  }

  get stateName(): string {
    return STATE_NAMES[this.state] ?? 'unknown';
  }

  // ─── State machine ───────────────────────────────────────────────────────

  /** SDK: CTeamplayRoundBasedRules::State_Transition. */
  transition(state: number): void {
    this.state = state;
    this.stateEnteredAt = this.world.curtime;
    this.enterState(state);
    this.world.events.push({ type: 'round', kind: 'state', state });
  }

  private enterState(state: number): void {
    const t = this.world.curtime;
    switch (state) {
      case GR_STATE_INIT:
        this.mapStartTime = t;
        break;
      case GR_STATE_PREGAME:
        break;
      case GR_STATE_STARTGAME:
        this.stateTransitionTime = t + this.options.waitingForPlayersTime;
        break;
      case GR_STATE_PREROUND:
        this.stateTransitionTime = t + this.options.preroundTime;
        this.roundRespawn();
        this.world.events.push({ type: 'round', kind: 'start', state, fullRound: this.forceMapReset });
        break;
      case GR_STATE_RND_RUNNING:
        this.roundStartTime = t;
        this.mode?.onRoundActive?.(this);
        this.world.events.push({ type: 'round', kind: 'active', state });
        break;
      case GR_STATE_TEAM_WIN: {
        if (this.forceMapReset) this.roundsPlayed++;
        const over = this.isGameOver();
        this.stateTransitionTime = t + this.options.bonusRoundTime;
        if (over) this.gameOver = true;
        break;
      }
      case GR_STATE_STALEMATE:
        break;
      case GR_STATE_GAME_OVER:
        this.world.events.push({ type: 'round', kind: 'game_over', state });
        break;
    }
  }

  /** SDK: CTeamplayRoundBasedRules::Think → State_Think_*. Runs once per tick. */
  think(): void {
    const t = this.world.curtime;
    switch (this.state) {
      case GR_STATE_INIT:
        this.transition(GR_STATE_PREGAME);
        break;
      case GR_STATE_PREGAME:
        this.checkRespawnWaves();
        if (this.haveActivePlayers()) this.transition(GR_STATE_STARTGAME);
        break;
      case GR_STATE_STARTGAME:
        if (t >= this.stateTransitionTime) this.transition(GR_STATE_PREROUND);
        break;
      case GR_STATE_PREROUND:
        if (t > this.stateTransitionTime) this.transition(GR_STATE_RND_RUNNING);
        else this.checkRespawnWaves();
        break;
      case GR_STATE_RND_RUNNING:
        if (!this.haveActivePlayers()) {
          this.transition(GR_STATE_PREGAME);
          break;
        }
        this.checkRespawnWaves();
        this.checkTimeLimit();
        break;
      case GR_STATE_STALEMATE:
        this.checkRespawnWaves();
        break;
      case GR_STATE_TEAM_WIN:
        if (t > this.stateTransitionTime) {
          if (this.gameOver && !this.options.loopForever) this.transition(GR_STATE_GAME_OVER);
          else {
            if (this.gameOver) this.resetGame();
            this.transition(GR_STATE_PREROUND);
          }
        }
        break;
      default:
        break;
    }
    this.mode?.think?.(this);
  }

  /** SDK: State_Think_RND_RUNNING's mp_timelimit block. */
  private checkTimeLimit(): void {
    if (this.options.timeLimit <= 0) return;
    if (this.world.curtime - this.mapStartTime < this.options.timeLimit * 60) return;
    const r = this.teamScores[TF_TEAM_RED];
    const b = this.teamScores[TF_TEAM_BLUE];
    if (r === b) this.setStalemate(WINREASON_TIMELIMIT);
    else this.setWinningTeam(r > b ? TF_TEAM_RED : TF_TEAM_BLUE, WINREASON_TIMELIMIT, true, false, true);
  }

  /** CheckWinLimit / CheckMaxRounds / CheckTimeLimit. */
  isGameOver(): boolean {
    const o = this.options;
    if (o.winLimit > 0 && (this.teamScores[TF_TEAM_RED] >= o.winLimit || this.teamScores[TF_TEAM_BLUE] >= o.winLimit)) {
      return true;
    }
    if (o.maxRounds > 0 && this.roundsPlayed >= o.maxRounds) return true;
    if (o.timeLimit > 0 && this.world.curtime - this.mapStartTime >= o.timeLimit * 60) return true;
    return false;
  }

  /** Starts a fresh game (scores, map time) — used when looping instead of changing level. */
  resetGame(): void {
    this.gameOver = false;
    this.teamScores.fill(0);
    this.flagCaptures.fill(0);
    this.roundsPlayed = 0;
    this.mapStartTime = this.world.curtime;
    this.forceMapReset = true;
  }

  /** CTFGameRules::BHavePlayers — someone is on a team with a class. */
  haveActivePlayers(): boolean {
    const ents = this.world.entities;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const p = ents[i] as Player | undefined;
      if (!p || p.removed) continue;
      if ((p.team === TF_TEAM_RED || p.team === TF_TEAM_BLUE) && (p.playerClass > 0 || p.desiredClass > 0)) return true;
    }
    return false;
  }

  /**
   * SDK: CTeamplayRoundBasedRules::RoundRespawn + CTFGameRules::
   * SetupOnRoundStart — clean up the map on a full reset, tell every entity
   * the round is starting (RoundSpawn, then RoundActivate), respawn all.
   */
  private roundRespawn(): void {
    const world = this.world;
    this.roundStartTime = world.curtime;
    if (this.forceMapReset) world.cleanUpMap();
    for (let i = 0; i < 4; i++) this.nextRespawnWave[i] = 0;
    this.inSetup = false;
    this.inOvertime = false;
    this.winningTeam = TEAM_UNASSIGNED;
    this.winReason = WINREASON_NONE;
    world.forEachEntity((e) => e.acceptInput('RoundSpawn', '', null, null));
    world.forEachEntity((e) => e.acceptInput('RoundActivate', '', null, null));
    this.mode?.onRoundStart?.(this);
    this.respawnPlayers(true);
    this.forceMapReset = true;
  }

  /**
   * SDK: CTeamplayRoundBasedRules::SetWinningTeam. The round ends; the bonus
   * round follows (losers humiliated), then the next round.
   */
  setWinningTeam(team: number, reason: number, forceMapReset = true, switchTeams = false, dontAddScore = false): void {
    void switchTeams;
    if (this.state === GR_STATE_TEAM_WIN) return;
    this.forceMapReset = forceMapReset;
    const override = this.mode?.forceMapResetNextRound?.(this);
    if (override !== undefined) this.forceMapReset = override;
    this.winningTeam = team;
    this.winReason = reason;
    if (!dontAddScore && forceMapReset && team !== TEAM_UNASSIGNED) this.teamScores[team] += TEAMPLAY_ROUND_WIN_SCORE;
    this.transition(GR_STATE_TEAM_WIN);
    this.world.events.push({ type: 'round', kind: 'win', state: this.state, team, reason, fullRound: forceMapReset });
    this.mode?.onRoundWin?.(this, team, reason);
  }

  /** SDK: CTeamplayRoundBasedRules::SetStalemate — with mp_stalemate_enable 0 it's a draw. */
  setStalemate(reason: number, forceMapReset = true): void {
    if (!this.options.stalemateEnable) {
      this.setWinningTeam(TEAM_UNASSIGNED, WINREASON_STALEMATE, forceMapReset);
      void reason;
      return;
    }
    if (this.state === GR_STATE_STALEMATE) return;
    this.forceMapReset = forceMapReset;
    this.winningTeam = TEAM_UNASSIGNED;
    this.transition(GR_STATE_STALEMATE);
    this.world.events.push({ type: 'round', kind: 'stalemate', state: this.state, reason });
  }

  inStalemate(): boolean {
    return this.state === GR_STATE_STALEMATE;
  }

  /** PointsMayBeCaptured. */
  pointsMayBeCaptured(): boolean {
    return this.state === GR_STATE_RND_RUNNING || this.state === GR_STATE_STALEMATE;
  }

  setSetup(inSetup: boolean): void {
    if (this.inSetup === inSetup) return;
    this.inSetup = inSetup;
    if (!inSetup) this.world.events.push({ type: 'round', kind: 'setup_finished', state: this.state });
  }

  setOvertime(overtime: boolean): void {
    if (this.inOvertime === overtime) return;
    this.inOvertime = overtime;
    if (overtime) this.world.events.push({ type: 'round', kind: 'overtime', state: this.state });
  }

  // ─── Player restrictions ─────────────────────────────────────────────────

  /** CTFPlayer::CanPlayerMove: frozen during the preround (tf_player_movement_restart_freeze). */
  canPlayerMove(_p: Player): boolean {
    return this.state !== GR_STATE_PREROUND;
  }

  isFrozen(p: Player): boolean {
    return !this.canPlayerMove(p);
  }

  /** CTFPlayerShared::IsLoser — the losing team (everyone on a stalemate) in the bonus round. */
  isHumiliated(p: Player): boolean {
    return this.state === GR_STATE_TEAM_WIN && p.team !== this.winningTeam;
  }

  /** For calculateMaxSpeed's bonus-time multiplier. */
  bonusRoundSide(p: Player): 'none' | 'winner' | 'loser' {
    if (this.state !== GR_STATE_TEAM_WIN) return 'none';
    return p.team === this.winningTeam ? 'winner' : 'loser';
  }

  // ─── Respawn waves ───────────────────────────────────────────────────────

  /** SDK: CTeamplayRoundBasedRules::GetRespawnTimeScalar — fewer players, shorter waves. */
  respawnTimeScalar(team: number): number {
    let n = 0;
    this.world.forEachPlayer((p) => {
      if (p.team === team) n++;
    });
    return remapClamped(n, 1, 8, 0.25, 1.0);
  }

  /** SDK: CTeamplayRoundBasedRules::GetRespawnWaveMaxLength. */
  respawnWaveMaxLength(team: number, scaleWithNumPlayers = true): number {
    if (this.state !== GR_STATE_RND_RUNNING) return 0;
    if (this.options.disableRespawnTimes) return 0;
    const modeTime = this.mode?.respawnWaveTime?.(this, team);
    let time =
      modeTime !== undefined
        ? modeTime
        : this.teamRespawnWaveTimes[team] >= 0
          ? this.teamRespawnWaveTimes[team]
          : this.options.respawnWaveTime;
    if (scaleWithNumPlayers && time > 5) time = Math.max(5, time * this.respawnTimeScalar(team));
    return time;
  }

  /** SDK: CTeamplayRoundBasedRules::GetMinTimeWhenPlayerMaySpawn. */
  minTimeWhenPlayerMaySpawn(p: Player): number {
    return p.deathTime + DEATH_ANIM_AND_FREEZECAM + this.respawnWaveMaxLength(p.team, false);
  }

  /** SDK: CTeamplayRoundBasedRules::GetNextRespawnWave(team, player). */
  nextRespawnTime(p: Player): number {
    if (this.state === GR_STATE_STALEMATE) return 0;
    const min = this.minTimeWhenPlayerMaySpawn(p);
    let next = this.nextRespawnWave[p.team] ?? 0;
    const len = this.respawnWaveMaxLength(p.team);
    if (len <= 0) return Math.max(next, min);
    while (next < min) next += len;
    return next;
  }

  /** SDK: CTeamplayRoundBasedRules::CheckRespawnWaves. */
  checkRespawnWaves(): void {
    const t = this.world.curtime;
    for (let k = 0; k < GAME_TEAMS.length; k++) {
      const team = GAME_TEAMS[k];
      if (this.nextRespawnWave[team] && this.nextRespawnWave[team] > t) continue;
      this.respawnPlayers(false, team);
      const len = this.respawnWaveMaxLength(team);
      this.nextRespawnWave[team] = len ? t + len : 0;
    }
  }

  /** SDK: CTeamplayRoundBasedRules::RespawnPlayers. */
  respawnPlayers(force: boolean, team = 0): void {
    const list = this.scratch;
    list.length = 0;
    const ents = this.world.entities;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = ents[i];
      if (e && !e.removed) list.push(e as Player);
    }
    for (const p of list) {
      if (team && p.team !== team) continue;
      if (p.team !== TF_TEAM_RED && p.team !== TF_TEAM_BLUE) continue;
      if (p.playerClass <= 0 && p.desiredClass <= 0) continue;
      if (!force) {
        if (p.lifeState === LIFE_ALIVE) continue;
        if (this.state !== GR_STATE_PREROUND) {
          if (team && this.world.curtime <= this.minTimeWhenPlayerMaySpawn(p)) continue;
          if (!this.isReadyToSpawn(p)) continue;
        }
      }
      if (this.mode?.allowsRespawn && !this.mode.allowsRespawn(this, p)) continue;
      this.respawnNow(p);
    }
  }

  /** SDK: CTFPlayer::IsReadyToSpawn (respawn time overrides, death animation). */
  isReadyToSpawn(p: Player): boolean {
    if (p.lifeState === LIFE_DYING && this.world.curtime < p.deathTime + 2.0) return false;
    if (p.respawnTimeOverride !== -1 && this.world.curtime < p.deathTime + p.respawnTimeOverride) return false;
    return true;
  }

  /** May this dead player spawn as soon as they pick a class (ShouldGainInstantSpawn / pregame)? */
  canSpawnInstantly(p: Player): boolean {
    if (p.playerClass === 0) return true;
    return this.state === GR_STATE_PREGAME || this.state === GR_STATE_STARTGAME || this.state === GR_STATE_PREROUND;
  }

  /** SDK: CTFPlayer::ForceRespawn. Alive players are respawned in place of dying. */
  respawnNow(p: Player, force = false): boolean {
    const wasAlive = p.lifeState === LIFE_ALIVE;
    if (wasAlive && !force) return false;
    if (wasAlive) p.lifeState = LIFE_DEAD;
    const ok = p.spawnPlayer();
    if (!ok && wasAlive) p.lifeState = LIFE_ALIVE;
    return ok;
  }

  // ─── Notifications from players / objects ───────────────────────────────

  onPlayerKilled(victim: Player, info: DamageInfo, scorer: Player | null, assister: Player | null): void {
    this.mode?.onPlayerKilled?.(this, victim, info, scorer, assister);
  }

  onPlayerSpawned(p: Player): void {
    this.mode?.onPlayerSpawned?.(this, p);
  }

  onObjectDestroyed(obj: BaseObject, info: DamageInfo, assister: number): void {
    const attacker = this.world.entity(info.attacker);
    if (attacker && attacker.isPlayer() && attacker.team !== obj.team) (attacker as Player).stats.destructions++;
    const a = this.world.entity(assister);
    if (a && a.isPlayer()) (a as Player).stats.assists++;
  }

  /** The unscaled wave time a team uses (m_TeamRespawnWaveTimes or mp_respawnwavetime). */
  respawnWaveBase(team: number): number {
    const t = this.teamRespawnWaveTimes[team] ?? -1;
    return t >= 0 ? t : this.options.respawnWaveTime;
  }

  /** tf_gamerules entity inputs: SetRedTeamRespawnWaveTime etc. */
  setTeamRespawnWaveTime(team: number, seconds: number): void {
    if (team >= 0 && team < 4) this.teamRespawnWaveTimes[team] = seconds;
  }

  addTeamScore(team: number, amount: number): void {
    if (team >= 0 && team < 4) this.teamScores[team] += amount;
  }

  /** Dead or dying player count on a team (Arena last-man checks). */
  aliveCount(team: number): number {
    let n = 0;
    this.world.forEachPlayer((p) => {
      if (p.team === team && p.lifeState === LIFE_ALIVE) n++;
    });
    return n;
  }

  writeNet(out: NetRecord): void {
    out.state = this.state;
    out.stateEnteredAt = this.stateEnteredAt;
    out.stateEndsAt = this.stateTransitionTime;
    out.winningTeam = this.winningTeam;
    out.winReason = this.winReason;
    out.redScore = this.teamScores[TF_TEAM_RED];
    out.blueScore = this.teamScores[TF_TEAM_BLUE];
    out.redRoundsWon = this.teamScores[TF_TEAM_RED];
    out.blueRoundsWon = this.teamScores[TF_TEAM_BLUE];
    out.nextRespawnRed = this.nextRespawnWave[TF_TEAM_RED];
    out.nextRespawnBlue = this.nextRespawnWave[TF_TEAM_BLUE];
    out.roundStartedAt = this.roundStartTime;
    out.inSetup = this.inSetup;
    out.inOvertime = this.inOvertime;
    out.mode = this.mode?.name ?? '';
    this.mode?.writeNet?.(out);
  }

  static readonly netSchema = NET_RULES;
}

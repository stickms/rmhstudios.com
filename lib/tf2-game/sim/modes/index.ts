/**
 * Game modes (the GameMode plug-in of rules.ts) and their detection from the
 * map's entities, as CTFGameRules does at level init (tf_gamerules.cpp
 * "m_nGameType"): item_teamflag → CTF, team_train_watcher → payload,
 * tf_logic_arena → arena, tf_logic_koth → KOTH, otherwise control points —
 * attack/defend when the master restricts a team from winning by capture or
 * plays mini-rounds or one team starts owning every point, 5CP otherwise.
 *
 * Most of a mode lives in its map entities (control points, timers, flags,
 * the train watcher); the mode adds what CTFGameRules does around them: the
 * standard entities (tf_gamerules, tf_objective_resource), respawn-wave
 * restore and control-point spawn setup at round start, flag drops and
 * capture blocks on death, overtime notifications, the CTF capture limit
 * and arena's last-team-standing.
 */

import { TEAM_UNASSIGNED, TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import type { DamageInfo } from '../damage';
import type { Player } from '../player';
import {
  GR_STATE_RND_RUNNING,
  GR_STATE_STALEMATE,
  WINREASON_FLAG_CAPTURE_LIMIT,
  WINREASON_OPPONENTS_DEAD,
  WINREASON_STALEMATE,
  type GameMode,
  type GameRules,
} from '../rules';
import type { GameWorld } from '../world';
import type { Tf2Mode } from '../../data/maps';
import {
  ArenaLogic,
  dropPlayerFlag,
  ensureObjectiveResource,
  objectives,
  restoreOriginalWaveTimes,
  setupControlSpawns,
  TF_FLAG_CAPS_PER_ROUND,
  type ObjectiveGameType,
} from '../entities';

/** Shared CTFGameRules behaviour of every mode. */
export class TFMode implements GameMode {
  readonly name: ObjectiveGameType;
  protected readonly world: GameWorld;
  private lastOvertime = false;

  constructor(world: GameWorld, name: ObjectiveGameType) {
    this.world = world;
    this.name = name;
  }

  /** CTFGameRules::CreateStandardEntities + the game type flags. */
  init(rules: GameRules): void {
    const world = rules.world;
    const o = objectives(world);
    o.gameType = this.name;
    o.isKoth = this.name === 'koth';
    o.isArena = this.name === 'arena';
    ensureObjectiveResource(world);
    let proxy = false;
    world.forEachEntity((e) => {
      if (e.classname === 'tf_gamerules') proxy = true;
    });
    if (!proxy) {
      world.spawnEntity('tf_gamerules', (e) => {
        e.targetname = 'tf_gamerules';
      });
    }
  }

  /** CTeamplayRoundBasedRules::RoundRespawn's wave-time restore + CTFGameRules::SetupOnRoundStart. */
  onRoundStart(rules: GameRules): void {
    const world = rules.world;
    restoreOriginalWaveTimes(world);
    setupControlSpawns(world);
    this.lastOvertime = false;
  }

  think(rules: GameRules): void {
    // CTeamplayRoundBasedRules::SetOvertime → team_train_watcher InputOnStartOvertime.
    if (rules.inOvertime && !this.lastOvertime) {
      for (const w of objectives(rules.world).watchers) if (!w.removed) w.onStartOvertime();
    }
    this.lastOvertime = rules.inOvertime;
  }

  /** CTFPlayer::Event_Killed → DropFlag; CTFGameRules::PlayerKilled → capture-area block checks. */
  onPlayerKilled(rules: GameRules, victim: Player, _info: DamageInfo, scorer: Player | null): void {
    const world = rules.world;
    dropPlayerFlag(world, victim);
    if (scorer) {
      for (const area of objectives(world).areas) {
        if (!area.removed && area.checkIfDeathCausesBlock(victim, scorer)) break;
      }
    }
  }

  onRoundWin(rules: GameRules, team: number, reason: number): void {
    void rules;
    void team;
    void reason;
  }
}

/** Capture the flag: tf_flag_caps_per_round captures win the round (CTFGameRules::CheckCapsPerRound). */
export class CTFMode extends TFMode {
  override think(rules: GameRules): void {
    super.think(rules);
    if (rules.state !== GR_STATE_RND_RUNNING && rules.state !== GR_STATE_STALEMATE) return;
    if (TF_FLAG_CAPS_PER_ROUND <= 0) return;
    let maxCaps = -1;
    let maxTeam = TEAM_UNASSIGNED;
    for (const team of [TF_TEAM_RED, TF_TEAM_BLUE]) {
      const caps = rules.flagCaptures[team];
      if (caps >= TF_FLAG_CAPS_PER_ROUND && caps > maxCaps) {
        maxCaps = caps;
        maxTeam = team;
      }
    }
    if (maxTeam !== TEAM_UNASSIGNED) rules.setWinningTeam(maxTeam, WINREASON_FLAG_CAPTURE_LIMIT);
  }

  override onRoundStart(rules: GameRules): void {
    super.onRoundStart(rules);
    // Flag captures count per round.
    if (rules.forceMapReset) rules.flagCaptures.fill(0);
  }
}

/** Control points (5CP and attack/defend, including multi-stage maps). */
export class ControlPointMode extends TFMode {}

/** King of the hill: the point's master and tf_logic_koth's team timers decide the round. */
export class KothMode extends TFMode {}

/** Payload: the train watcher drives the cart; the points and the timer decide the round. */
export class PayloadMode extends TFMode {}

/**
 * Arena: the round plays in the stalemate state with no respawns; the last
 * team standing wins, or whoever captures the point once it unlocks
 * (tf_logic_arena CapEnableDelay).
 */
export class ArenaMode extends TFMode {
  override onRoundStart(rules: GameRules): void {
    super.onRoundStart(rules);
  }

  /** CTFGameRules: arena rounds run in GR_STATE_STALEMATE (SetupOnStalemateStart's arena branch). */
  onRoundActive(rules: GameRules): void {
    const world = rules.world;
    rules.transition(GR_STATE_STALEMATE);
    world.forEachEntity((e) => {
      if (e instanceof ArenaLogic) e.onArenaRoundStart();
    });
  }

  override think(rules: GameRules): void {
    super.think(rules);
    if (rules.state !== GR_STATE_STALEMATE) return;
    let red = 0;
    let blue = 0;
    let redPlayers = 0;
    let bluePlayers = 0;
    rules.world.forEachPlayer((p) => {
      if (p.team === TF_TEAM_RED) {
        redPlayers++;
        if (p.alive) red++;
      } else if (p.team === TF_TEAM_BLUE) {
        bluePlayers++;
        if (p.alive) blue++;
      }
    });
    if (redPlayers === 0 || bluePlayers === 0) return;
    if (red === 0 && blue === 0) rules.setWinningTeam(TEAM_UNASSIGNED, WINREASON_STALEMATE);
    else if (red === 0) rules.setWinningTeam(TF_TEAM_BLUE, WINREASON_OPPONENTS_DEAD);
    else if (blue === 0) rules.setWinningTeam(TF_TEAM_RED, WINREASON_OPPONENTS_DEAD);
  }

  allowsRespawn(rules: GameRules): boolean {
    return rules.state !== GR_STATE_STALEMATE;
  }
}

/** The game type the map's entities imply (CTFGameRules' level-init detection). */
export function detectGameType(world: GameWorld): ObjectiveGameType {
  const o = objectives(world);
  if (o.flags.some((f) => !f.removed)) return 'ctf';
  if (o.watchers.length > 0) return 'pl';
  let arena = false;
  let koth = false;
  world.forEachEntity((e) => {
    if (e.classname === 'tf_logic_arena') arena = true;
    else if (e.classname === 'tf_logic_koth') koth = true;
  });
  if (arena) return 'arena';
  if (koth) return 'koth';
  if (o.masters.length > 0) {
    const master = o.masters[0];
    if (master.invalidCapWinner > 1 || o.rounds.length > 0) return 'cp_ad';
    // One team owning every point at the start is attack/defend too.
    const owners = new Set<number>();
    for (const p of o.points) owners.add(p.defaultOwner);
    if (owners.size === 1 && !owners.has(TEAM_UNASSIGNED)) return 'cp_ad';
    return 'cp';
  }
  return '';
}

/**
 * The game mode for a world whose map entities have spawned. `hint` (the
 * allowlist's mode) only breaks ties when the entities say nothing.
 * Install it with `world.setMode(mode)`.
 */
export function createGameModeForMap(world: GameWorld, map?: string, hint?: Tf2Mode): GameMode {
  void map;
  let type = detectGameType(world);
  if (type === '' && hint) type = hint;
  switch (type) {
    case 'ctf':
      return new CTFMode(world, 'ctf');
    case 'pl':
      return new PayloadMode(world, 'pl');
    case 'koth':
      return new KothMode(world, 'koth');
    case 'arena':
      return new ArenaMode(world, 'arena');
    case 'cp_ad':
      return new ControlPointMode(world, 'cp_ad');
    case 'cp':
      return new ControlPointMode(world, 'cp');
    default:
      return new TFMode(world, '');
  }
}

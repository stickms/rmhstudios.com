/**
 * CS:GO's rules on the shared round machine (lib/tf2-game/sim/rules.ts — CTeamplayRoundBasedRules'
 * port): its PREROUND is CS's freeze time (players frozen, buying allowed), RND_RUNNING the live
 * round, TEAM_WIN the round-end delay (mp_round_restart_delay), and a "full reset" every round
 * (CleanUpMap, as CS:GO restarts each round). Nobody is humiliated at round end (CS lets everyone keep
 * shooting). The two modes plug in through the shared `GameMode` hooks:
 *
 *   - bomb defusal (`CsDefuseMode`): the C4 to a random Terrorist, the round timer, the bomb, the
 *     win conditions (elimination, bomb exploded, bomb defused, time → Counter-Terrorists), the
 *     economy, MR15 with the halftime side switch and a 15–15 draw;
 *   - deathmatch (`CsDeathmatchMode`): respawns with spawn protection, a 10-minute match, points.
 */

import { TEAM_UNASSIGNED } from '../tf2-game/core/constants';
import type { DamageInfo } from '../tf2-game/sim/damage';
import { isHeadshot } from '../tf2-game/sim/damage';
import {
  GameRules,
  GR_STATE_PREGAME,
  GR_STATE_PREROUND,
  GR_STATE_RND_RUNNING,
  GR_STATE_STARTGAME,
  GR_STATE_TEAM_WIN,
  type GameMode,
  type RulesOptions,
} from '../tf2-game/sim/rules';
import type { NetRecord } from '../tf2-game/sim/net-schema';
import type { Player } from '../tf2-game/sim/player';
import {
  CASH_DEFUSE,
  CASH_PLANT,
  CASH_TEAMKILL_PENALTY,
  CS_TEAM_CT,
  CS_TEAM_T,
  CS_WIN_BOMB_DEFUSED,
  CS_WIN_CTS_WIN,
  CS_WIN_ROUND_DRAW,
  CS_WIN_TARGET_BOMBED,
  CS_WIN_TARGET_SAVED,
  CS_WIN_TERRORISTS_WIN,
  DM_RESPAWN_DELAY,
  DM_RESPAWN_IMMUNITY,
  DM_TIMELIMIT_MINUTES,
  MP_BUYTIME,
  MP_C4TIMER,
  MP_FREEZETIME,
  MP_MAXMONEY,
  MP_MAXROUNDS,
  MP_ROUND_RESTART_DELAY,
  MP_ROUNDTIME,
  MP_STARTMONEY,
  otherCsTeam,
  type CsMode,
} from './constants';
import { killReward, lossReward, LOSS_STREAK_MAX, winReward } from './economy';
import { csEvent } from './events';
import type { CsPlayer } from './player';
import type { PlantedC4 } from './weapons/c4';
import type { CsWorld } from './world';

/** The match settings (the CS console's mp_* cvars). */
export interface CsSettings {
  /** mp_roundtime, minutes. */
  roundTime: number;
  freezeTime: number;
  buyTime: number;
  maxRounds: number;
  startMoney: number;
  maxMoney: number;
  c4Timer: number;
  roundRestartDelay: number;
  buyAnywhere: boolean;
  /** Deathmatch: free for all (mp_teammates_are_enemies). */
  teammatesAreEnemies: boolean;
  respawnImmunity: number;
  /** Deathmatch: mp_timelimit, minutes. */
  dmTimeLimit: number;
}

export const defaultCsSettings = (mode: CsMode): CsSettings => ({
  roundTime: MP_ROUNDTIME,
  freezeTime: mode === 'dm' ? 0 : MP_FREEZETIME,
  buyTime: MP_BUYTIME,
  maxRounds: MP_MAXROUNDS,
  startMoney: MP_STARTMONEY,
  maxMoney: MP_MAXMONEY,
  c4Timer: MP_C4TIMER,
  roundRestartDelay: MP_ROUND_RESTART_DELAY,
  buyAnywhere: false,
  teammatesAreEnemies: mode === 'dm',
  respawnImmunity: DM_RESPAWN_IMMUNITY,
  dmTimeLimit: DM_TIMELIMIT_MINUTES,
});

const csPlayers = (rules: GameRules): CsPlayer[] => rules.world.players() as CsPlayer[];

export class CsGameRules extends GameRules {
  csMode: CsMode = 'de';
  settings: CsSettings = defaultCsSettings('de');
  freezeEndsAt = 0;
  buyEndsAt = 0;
  roundEndsAt = 0;
  plantedC4: PlantedC4 | null = null;
  bombPlantedThisRound = false;
  roundWinner = TEAM_UNASSIGNED;
  roundWinReason = 0;
  /** Consecutive losses per team (the loss bonus ladder). */
  readonly lossStreak = [0, 0, 0, 0];
  halftimePending = false;
  halftimeDone = false;
  /** Deathmatch: when the match ends. */
  matchEndsAt = 0;
  /** The C4 is handed out on the first tick of the freeze time. */
  c4Pending = false;

  constructor(world: CsWorld, options: Partial<RulesOptions> = {}) {
    super(world, { ...options });
  }

  get cs(): CsWorld {
    return this.world as CsWorld;
  }

  get c4Timer(): number {
    return this.settings.c4Timer;
  }

  get teammatesAreEnemies(): boolean {
    return this.csMode === 'dm' && this.settings.teammatesAreEnemies;
  }

  /** Pushes the settings into the shared round machine's options. */
  applySettings(): void {
    const s = this.settings;
    const o = this.options;
    o.preroundTime = this.csMode === 'dm' ? 0 : s.freezeTime;
    o.bonusRoundTime = s.roundRestartDelay;
    o.timeLimit = 0;
    o.maxRounds = this.csMode === 'de' ? s.maxRounds : 0;
    // MR15: first to 16 wins; at 15–15 the 30 rounds are up and the match is a draw.
    o.winLimit = this.csMode === 'de' && s.maxRounds > 0 ? Math.floor(s.maxRounds / 2) + 1 : 0;
    o.loopForever = true;
    o.stalemateEnable = false;
  }

  // ─── CS:GO has no humiliation: losers keep fighting after the round ends ──────────────────

  override isHumiliated(_p: Player): boolean {
    return false;
  }

  override bonusRoundSide(_p: Player): 'none' | 'winner' | 'loser' {
    return 'none';
  }

  /** A player joining mid-round spawns at once only in warmup, the freeze time, or deathmatch. */
  override canSpawnInstantly(_p: Player): boolean {
    return (
      this.csMode === 'dm' ||
      this.state === GR_STATE_PREGAME ||
      this.state === GR_STATE_STARTGAME ||
      this.state === GR_STATE_PREROUND
    );
  }

  /**
   * A round start respawns everyone on a team — the living too (CS:GO moves survivors back to their
   * spawn with what they carry); the shared rules' forced respawn only revives the dead.
   */
  override respawnPlayers(force: boolean, team = 0): void {
    if (!force) {
      super.respawnPlayers(force, team);
      return;
    }
    for (const p of csPlayers(this)) {
      if (team && p.team !== team) continue;
      if (p.team !== CS_TEAM_T && p.team !== CS_TEAM_CT) continue;
      if (p.playerClass <= 0 && p.desiredClass <= 0) continue;
      if (this.mode?.allowsRespawn && !this.mode.allowsRespawn(this, p)) continue;
      this.respawnNow(p, true);
    }
  }

  // ─── Money ──────────────────────────────────────────────────────────────────────────────

  addMoney(p: CsPlayer, amount: number, reason: string): void {
    const before = p.money;
    p.money = Math.max(0, Math.min(this.settings.maxMoney, p.money + amount));
    if (p.money !== before)
      csEvent(this.world, {
        type: 'cs_money',
        to: p.id,
        player: p.id,
        amount: p.money - before,
        total: p.money,
        reason,
      });
  }

  /** May players buy now (the buy time; always in deathmatch)? */
  inBuyTime(): boolean {
    if (this.csMode === 'dm') return true;
    if (
      this.state === GR_STATE_PREROUND ||
      this.state === GR_STATE_PREGAME ||
      this.state === GR_STATE_STARTGAME
    )
      return true;
    return this.state === GR_STATE_RND_RUNNING && this.world.curtime < this.buyEndsAt;
  }

  // ─── The bomb ──────────────────────────────────────────────────────────────────────────

  mayPlant(): boolean {
    return this.csMode === 'de' && this.state === GR_STATE_RND_RUNNING && this.plantedC4 === null;
  }

  onBombPlanted(c4: PlantedC4, planter: CsPlayer): void {
    this.plantedC4 = c4;
    this.bombPlantedThisRound = true;
    this.roundEndsAt = c4.explodesAt;
    planter.stats.captures++;
    this.addMoney(planter, CASH_PLANT, 'plant');
    csEvent(this.world, {
      type: 'cs_bomb',
      kind: 'planted',
      player: planter.id,
      entity: c4.id,
      site: this.cs.bombSiteAt(c4.origin),
    });
  }

  onBombDefused(c4: PlantedC4, defuser: Player | null): void {
    if (defuser) {
      defuser.stats.defenses++;
      this.addMoney(defuser as CsPlayer, CASH_DEFUSE, 'defuse');
    }
    csEvent(this.world, {
      type: 'cs_bomb',
      kind: 'defused',
      player: defuser ? defuser.id : 0,
      entity: c4.id,
    });
    if (this.state === GR_STATE_RND_RUNNING) this.endRound(CS_TEAM_CT, CS_WIN_BOMB_DEFUSED);
  }

  onBombExploded(c4: PlantedC4): void {
    csEvent(this.world, { type: 'cs_bomb', kind: 'exploded', player: c4.owner, entity: c4.id });
    if (this.state === GR_STATE_RND_RUNNING) this.endRound(CS_TEAM_T, CS_WIN_TARGET_BOMBED);
  }

  endRound(team: number, reason: number): void {
    if (this.state === GR_STATE_TEAM_WIN) return;
    this.roundWinner = team;
    this.roundWinReason = reason;
    this.setWinningTeam(team, reason);
  }

  // ─── Kills ─────────────────────────────────────────────────────────────────────────────

  override onPlayerKilled(
    victim: Player,
    info: DamageInfo,
    scorer: Player | null,
    assister: Player | null,
  ): void {
    if (scorer && scorer !== victim) {
      const enemy = scorer.team !== victim.team || this.teammatesAreEnemies;
      if (this.csMode === 'de') {
        if (enemy) this.addMoney(scorer as CsPlayer, killReward(info.weaponDefIndex), 'kill');
        else this.addMoney(scorer as CsPlayer, CASH_TEAMKILL_PENALTY, 'teamkill');
      }
    }
    super.onPlayerKilled(victim, info, scorer, assister);
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.mode = this.csMode;
  }

  /** Writes the CS block (the cs_gamerules proxy's record). */
  writeCsNet(out: NetRecord): void {
    out.mode = this.csMode;
    out.roundNumber = Math.min(255, this.roundsPlayed + 1);
    out.freezeEndsAt = this.freezeEndsAt;
    out.buyEndsAt = this.buyEndsAt;
    out.roundEndsAt = this.roundEndsAt;
    out.bombPlanted = this.plantedC4 !== null && !this.plantedC4.removed;
    out.bombExplodesAt = this.plantedC4 ? this.plantedC4.explodesAt : 0;
    out.roundWinner = this.roundWinner;
    out.roundWinReason = this.roundWinReason;
    out.lossStreakT = this.lossStreak[CS_TEAM_T];
    out.lossStreakCT = this.lossStreak[CS_TEAM_CT];
    out.halftimeDone = this.halftimeDone;
    out.matchEndsAt = this.matchEndsAt;
    out.teammatesAreEnemies = this.teammatesAreEnemies;
    out.gameOver = this.gameOver;
  }
}

// ─── Shared round bookkeeping ─────────────────────────────────────────────────────────────

/** A new match (the first round, or after a finished one): money, weapons and streaks reset. */
function startMatch(rules: CsGameRules): void {
  rules.lossStreak.fill(0);
  rules.halftimePending = false;
  rules.halftimeDone = false;
  for (const p of csPlayers(rules)) {
    p.money = rules.settings.startMoney;
    p.stripForNewMatch();
    p.stats.kills =
      p.stats.deaths =
      p.stats.assists =
      p.stats.headshots =
      p.stats.captures =
      p.stats.defenses =
      p.stats.bonusPoints =
        0;
  }
  csEvent(rules.world, { type: 'cs_round', kind: 'match_start', round: 1 });
}

/** Halftime: everyone changes sides with the start money and nothing in hand; the scores follow the teams. */
function switchSides(rules: CsGameRules): void {
  rules.halftimePending = false;
  rules.halftimeDone = true;
  const s = rules.teamScores;
  const t = s[CS_TEAM_T];
  s[CS_TEAM_T] = s[CS_TEAM_CT];
  s[CS_TEAM_CT] = t;
  rules.lossStreak.fill(0);
  for (const p of csPlayers(rules)) {
    if (p.team !== CS_TEAM_T && p.team !== CS_TEAM_CT) continue;
    p.changeTeam(otherCsTeam(p.team));
    p.move.team = p.team;
    p.money = rules.settings.startMoney;
    p.stripForNewMatch();
  }
  csEvent(rules.world, { type: 'cs_round', kind: 'halftime', round: rules.roundsPlayed + 1 });
}

function countTeams(rules: GameRules): { t: number; ct: number; tAlive: number; ctAlive: number } {
  const out = { t: 0, ct: 0, tAlive: 0, ctAlive: 0 };
  rules.world.forEachPlayer((p) => {
    if (p.team === CS_TEAM_T) {
      out.t++;
      if (p.alive) out.tAlive++;
    } else if (p.team === CS_TEAM_CT) {
      out.ct++;
      if (p.alive) out.ctAlive++;
    }
  });
  return out;
}

// ─── Bomb defusal ─────────────────────────────────────────────────────────────────────────

export class CsDefuseMode implements GameMode {
  readonly name = 'de';

  init(rules: GameRules): void {
    const cs = rules as CsGameRules;
    cs.csMode = 'de';
    cs.applySettings();
  }

  onRoundStart(rules: GameRules): void {
    const cs = rules as CsGameRules;
    cs.applySettings();
    cs.plantedC4 = null;
    cs.bombPlantedThisRound = false;
    cs.roundWinner = TEAM_UNASSIGNED;
    cs.roundWinReason = 0;
    if (rules.roundsPlayed === 0) startMatch(cs);
    else if (cs.halftimePending) switchSides(cs);
    cs.freezeEndsAt = rules.stateTransitionTime;
    cs.buyEndsAt = cs.freezeEndsAt + cs.settings.buyTime;
    cs.roundEndsAt = cs.freezeEndsAt + cs.settings.roundTime * 60;
    cs.c4Pending = true;
    csEvent(rules.world, { type: 'cs_round', kind: 'freeze', round: rules.roundsPlayed + 1 });
  }

  onRoundActive(rules: GameRules): void {
    const cs = rules as CsGameRules;
    const t = rules.world.curtime;
    cs.freezeEndsAt = t;
    cs.buyEndsAt = t + cs.settings.buyTime;
    cs.roundEndsAt = t + cs.settings.roundTime * 60;
    csEvent(rules.world, { type: 'cs_round', kind: 'live', round: rules.roundsPlayed + 1 });
  }

  think(rules: GameRules): void {
    const cs = rules as CsGameRules;
    if (
      cs.c4Pending &&
      (rules.state === GR_STATE_PREROUND || rules.state === GR_STATE_RND_RUNNING)
    ) {
      cs.c4Pending = false;
      giveBombToRandomTerrorist(cs);
    }
    if (rules.state !== GR_STATE_RND_RUNNING) return;
    this.checkElimination(cs);
    if (rules.state !== GR_STATE_RND_RUNNING) return;
    // Time: the Counter-Terrorists saved the targets.
    if (!cs.plantedC4 && rules.world.curtime >= cs.roundEndsAt)
      cs.endRound(CS_TEAM_CT, CS_WIN_TARGET_SAVED);
  }

  private checkElimination(cs: CsGameRules): void {
    const c = countTeams(cs);
    if (c.t === 0 || c.ct === 0) return;
    if (c.ctAlive === 0) cs.endRound(CS_TEAM_T, CS_WIN_TERRORISTS_WIN);
    // With the bomb down the Terrorists' deaths do not end the round: it must be defused (or blow).
    else if (c.tAlive === 0 && !cs.plantedC4) cs.endRound(CS_TEAM_CT, CS_WIN_CTS_WIN);
  }

  onPlayerKilled(rules: GameRules): void {
    if (rules.state === GR_STATE_RND_RUNNING) this.checkElimination(rules as CsGameRules);
  }

  /** Players spawn at round start (and in warmup), never mid-round. */
  allowsRespawn(rules: GameRules): boolean {
    return rules.state !== GR_STATE_RND_RUNNING && rules.state !== GR_STATE_TEAM_WIN;
  }

  respawnWaveTime(): number {
    return 0;
  }

  onRoundWin(rules: GameRules, team: number, reason: number): void {
    const cs = rules as CsGameRules;
    cs.roundWinner = team;
    cs.roundWinReason = reason;
    if (team === CS_TEAM_T || team === CS_TEAM_CT) {
      const loser = otherCsTeam(team);
      cs.lossStreak[loser] = Math.min(LOSS_STREAK_MAX, cs.lossStreak[loser] + 1);
      // Since 2019 a win takes one step off the winner's loss bonus instead of resetting it.
      cs.lossStreak[team] = Math.max(0, cs.lossStreak[team] - 1);
      for (const p of csPlayers(rules)) {
        if (p.team === team) cs.addMoney(p, winReward(reason), 'round_win');
        else if (p.team === loser)
          cs.addMoney(
            p,
            lossReward(loser, cs.lossStreak[loser], reason, p.alive, cs.bombPlantedThisRound),
            'round_loss',
          );
      }
    }
    const half = Math.floor(cs.settings.maxRounds / 2);
    if (!rules.gameOver && half > 0 && rules.roundsPlayed === half && !cs.halftimeDone)
      cs.halftimePending = true;
    csEvent(rules.world, {
      type: 'cs_round',
      kind: 'end',
      round: rules.roundsPlayed,
      winner: team,
      reason: reason === 0 ? CS_WIN_ROUND_DRAW : reason,
      gameOver: rules.gameOver,
      tScore: rules.teamScores[CS_TEAM_T],
      ctScore: rules.teamScores[CS_TEAM_CT],
    });
  }

  writeNet(out: NetRecord): void {
    out.mode = 'de';
  }
}

/** The bomb goes to a random Terrorist (from the match's seeded stream). */
function giveBombToRandomTerrorist(cs: CsGameRules): void {
  const ts = csPlayers(cs).filter((p) => p.team === CS_TEAM_T && p.alive);
  if (ts.length === 0) return;
  // Nobody may carry a second bomb.
  if (ts.some((p) => p.hasC4())) return;
  const pick = ts[cs.world.random.randomInt(0, ts.length - 1)];
  pick.giveNamedWeapon('weapon_c4');
  csEvent(cs.world, { type: 'cs_bomb', kind: 'pickup', player: pick.id, team: CS_TEAM_T });
}

// ─── Deathmatch ───────────────────────────────────────────────────────────────────────────

/** Deathmatch points: 10 a kill, 5 more for a headshot (clean-room; CS:GO's DM scores kills by weapon). */
export const DM_KILL_POINTS = 10;
export const DM_HEADSHOT_POINTS = 5;

export class CsDeathmatchMode implements GameMode {
  readonly name = 'dm';

  init(rules: GameRules): void {
    const cs = rules as CsGameRules;
    cs.csMode = 'dm';
    cs.settings.teammatesAreEnemies = true;
    cs.settings.freezeTime = 0;
    cs.applySettings();
  }

  onRoundStart(rules: GameRules): void {
    const cs = rules as CsGameRules;
    cs.applySettings();
    if (rules.roundsPlayed === 0) startMatch(cs);
    cs.matchEndsAt = rules.world.curtime + cs.settings.dmTimeLimit * 60;
  }

  onRoundActive(rules: GameRules): void {
    const cs = rules as CsGameRules;
    cs.matchEndsAt = rules.world.curtime + cs.settings.dmTimeLimit * 60;
    csEvent(rules.world, { type: 'cs_round', kind: 'live', round: 1 });
  }

  think(rules: GameRules): void {
    const cs = rules as CsGameRules;
    if (rules.state !== GR_STATE_RND_RUNNING) return;
    const t = rules.world.curtime;
    // Respawns: every dead player a couple of seconds after dying.
    for (const p of csPlayers(rules)) {
      if (p.alive || (p.team !== CS_TEAM_T && p.team !== CS_TEAM_CT) || p.playerClass <= 0)
        continue;
      if (t >= p.deathTime + DM_RESPAWN_DELAY) rules.respawnNow(p);
    }
    if (t >= cs.matchEndsAt) {
      const s = rules.teamScores;
      const winner =
        s[CS_TEAM_T] === s[CS_TEAM_CT]
          ? TEAM_UNASSIGNED
          : s[CS_TEAM_T] > s[CS_TEAM_CT]
            ? CS_TEAM_T
            : CS_TEAM_CT;
      rules.gameOver = true;
      cs.endRound(winner, CS_WIN_ROUND_DRAW);
    }
  }

  allowsRespawn(rules: GameRules): boolean {
    return rules.state !== GR_STATE_RND_RUNNING && rules.state !== GR_STATE_TEAM_WIN;
  }

  respawnWaveTime(): number {
    return 0;
  }

  onPlayerSpawned(rules: GameRules, player: Player): void {
    const cs = rules as CsGameRules;
    (player as CsPlayer).immuneUntil = rules.world.curtime + cs.settings.respawnImmunity;
  }

  onPlayerKilled(rules: GameRules, victim: Player, info: DamageInfo, scorer: Player | null): void {
    const cs = rules as CsGameRules;
    if (!scorer || scorer === victim) return;
    if (scorer.team === victim.team && !cs.teammatesAreEnemies) return;
    scorer.stats.bonusPoints +=
      DM_KILL_POINTS + (isHeadshot(info.customKill) ? DM_HEADSHOT_POINTS : 0);
    rules.addTeamScore(scorer.team, 1);
  }

  onRoundWin(rules: GameRules, team: number): void {
    rules.gameOver = true;
    csEvent(rules.world, {
      type: 'cs_round',
      kind: 'end',
      round: 1,
      winner: team,
      reason: CS_WIN_ROUND_DRAW,
      gameOver: true,
    });
  }

  writeNet(out: NetRecord): void {
    out.mode = 'dm';
  }
}

/**
 * RMHbox — Undercover Agent Minigame Server Handler
 *
 * A team-based word-association game inspired by Codenames.
 * Two teams (RED and BLUE) compete to identify their agents on a
 * 5×5 grid of words. Each team has a spymaster who gives one-word
 * clues, and operatives who guess which tiles correspond to their
 * agents. The first team to reveal all their agents wins — but
 * hitting the assassin tile results in an immediate loss.
 *
 * Phases:
 *   SETUP → CLUE → GUESS → TURN_TRANSITION → (repeat or GAME_OVER)
 *
 * Join-in-progress policy: spectate_only — late joiners receive
 * spectator state and do not participate until the next game.
 *
 * Reference: docs/rmhbox/design-spec/minigames/undercover-agent.md
 */

import fs from 'fs';
import path from 'path';
import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import {
  GiveClueSchema,
  GuessTileSchema,
  EndTurnSchema,
  SwapPlayerSchema,
  SetRoleSchema,
  HighlightTileSchema,
  UA_SPYMASTER_RECONNECT_GRACE_SECONDS,
  UA_SNAPSHOT_LOG_LIMIT,
  UA_DRAW_POINTS,
} from '@/lib/rmhbox/undercover-agent/schemas';
import {
  UA_GRID_SIZE,
  UA_FIRST_TEAM_AGENTS,
  UA_SECOND_TEAM_AGENTS,
  UA_ASSASSIN,
  UA_BYSTANDER,
  UA_SETUP_DURATION,
  UA_SPYMASTER_TIMEOUT,
  UA_OPERATIVE_TIMEOUT,
  UA_TURN_TRANSITION,
  UA_MAX_UNLIMITED,
  UA_MAX_PASSES,
  UA_WIN,
  UA_WIN_OPERATIVE,
  UA_LOSE,
  UA_CLUE_EFFICIENCY,
  UA_CORRECT_GUESS,
  UA_ASSASSIN_PENALTY,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import { UndercoverAgentPhase, TileType, TileState } from './types';
import type { GridTile, TeamState, UndercoverAgentState } from './types';

// ─── Static word pool (loaded once) ──────────────────────────────
// The word pool is static content shared by every game instance. Reading and
// JSON-parsing it in the constructor meant a disk read + parse on every game
// start; hoist it to a module-level lazy singleton (same pattern as the other
// minigames' data loaders, e.g. lib/rmhbox/rhyme-time/dictionary-loader).
let cachedWordPool: string[] | null = null;
function loadWordPool(): string[] {
  if (cachedWordPool) return cachedWordPool;
  const poolPath = path.join(process.cwd(), 'data', 'rmhbox', 'undercover-agent', 'word-pool.json');
  cachedWordPool = JSON.parse(fs.readFileSync(poolPath, 'utf-8')) as string[];
  return cachedWordPool;
}

// ─── Undercover Agent Minigame ───────────────────────────────────

export class UndercoverAgentMinigame extends BaseMinigame {
  private wordPool: string[];
  private state!: UndercoverAgentState;
  private startedAt: number = 0;
  /** The CLUE / GUESS turn deadline. Cleared on every turn change. */
  private turnTimer: NodeJS.Timeout | null = null;
  /**
   * Whether CLUE / GUESS turns are timed. Starts from the `turnTimers` game
   * setting; the host can switch it off and on at any point in the game
   * (TOGGLE_TURN_TIMER). Off, a turn waits for its players like it used to.
   */
  private turnTimersEnabled = true;
  /** SETUP → first CLUE, and TURN_TRANSITION → next turn. */
  private transitionTimer: NodeJS.Timeout | null = null;
  /** Pending spymaster hand-overs, keyed by the disconnected spymaster's userId. */
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  /** Highest action-log seq already broadcast (broadcasts carry only newer entries). */
  private lastBroadcastSeq = 0;

  get spectatorMode(): 'shared-privileged' {
    return 'shared-privileged';
  }

  /** Operative tile highlights: position → Set<userId> */
  private highlights: Map<number, Set<string>> = new Map();

  /** Per-player stats for scoring and awards. */
  private playerStats: Map<
    string,
    {
      correctGuesses: number;
      incorrectGuesses: number;
      cluesGiven: number;
      totalAgentsFromClues: number;
      longestClueWord: number;
      maxAgentsFromSingleClue: number;
      triggeredAssassin: boolean;
    }
  > = new Map();

  constructor(context: MinigameContext) {
    super(context);
    // Shared, cached reference — initializeState() spreads it before shuffling
    // ([...this.wordPool]) so the singleton array is never mutated.
    this.wordPool = loadWordPool();
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();
    this.turnTimersEnabled = this.getSetting('turnTimers', true);
    this.initializeState();

    logger.info({
      event: 'undercover_agent:start',
      lobbyId: this.context.lobbyId,
      playerCount: this.context.players.size,
      redTeam: this.state.teams.red.operativeIds.length + 1,
      blueTeam: this.state.teams.blue.operativeIds.length + 1,
    });

    // Enter TEAM_SETUP phase — players can rearrange teams before the game begins
    this.state.phase = UndercoverAgentPhase.TEAM_SETUP;

    this.broadcastGameAction({
      type: 'UA_TEAM_SETUP',
      teams: {
        red: this.getPublicTeamState('red'),
        blue: this.getPublicTeamState('blue'),
      },
      hostId: this.context.getHostId(),
    });

    // Infinite timer during team setup (host clicks Start to advance)
    this.startInfinitePhaseTimer();
  }

  /** Called by the host after team composition is valid. Transitions from TEAM_SETUP → SETUP → CLUE. */
  private startGame(): void {
    this.state.phase = UndercoverAgentPhase.SETUP;

    // Initialize player stats now that teams are final
    this.initializePlayerStats();

    // Broadcast setup: grid words (without types) to all players
    const gridWords = this.state.grid.map((t) => ({
      position: t.position,
      word: t.word,
    }));

    this.broadcastGameAction({
      type: 'UA_SETUP',
      grid: gridWords,
      teams: {
        red: this.getPublicTeamState('red'),
        blue: this.getPublicTeamState('blue'),
      },
      currentTeam: this.state.currentTeam,
    });

    // Send key card privately to each spymaster
    this.sendKeyCardToSpymaster('red');
    this.sendKeyCardToSpymaster('blue');

    // Show setup countdown in the header timer
    this.startPhaseTimer(UA_SETUP_DURATION);

    // Delay before transitioning to CLUE phase so players can see their
    // team assignment and role before the game begins.
    this.clearTrackedTimeout(this.transitionTimer);
    this.transitionTimer = this.setTimeout(() => {
      this.transitionTimer = null;
      if (!this.isRunning || this.state.phase !== UndercoverAgentPhase.SETUP) return;
      this.state.turnNumber = 1;
      this.enterCluePhase();
    }, UA_SETUP_DURATION * 1000);
  }

  /** The turn length to announce to clients: 0 (no countdown) while turn timers are off. */
  private announcedTimeout(seconds: number): number {
    return this.turnTimersEnabled ? seconds : 0;
  }

  private spymasterTimeout(): number {
    return this.getSetting('spymasterTimeout', UA_SPYMASTER_TIMEOUT);
  }

  private operativeTimeout(): number {
    return this.getSetting('operativeTimeout', UA_OPERATIVE_TIMEOUT);
  }

  private isConnected(userId: string): boolean {
    return this.context.players.get(userId)?.isConnected ?? false;
  }

  /** Operatives of a team who are still connected. */
  private connectedOperatives(teamId: 'red' | 'blue'): string[] {
    return this.state.teams[teamId].operativeIds.filter((id) => id && this.isConnected(id));
  }

  /**
   * A team whose operatives are all gone guesses through its spymaster (the
   * same rule as a 2–3 player game, where a team may have no operative).
   */
  private spymasterMayGuess(teamId: 'red' | 'blue'): boolean {
    return this.connectedOperatives(teamId).length === 0;
  }

  /** Begin the current team's CLUE phase (turnNumber already set). */
  private enterCluePhase(): void {
    this.state.phase = UndercoverAgentPhase.CLUE;

    this.logAction('turn_start', {
      turnNumber: this.state.turnNumber,
      team: this.state.currentTeam,
    });

    logger.info({
      event: 'undercover_agent:turn_start',
      lobbyId: this.context.lobbyId,
      teamId: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
    });

    // If the current team is fully disconnected, auto-skip their turn.
    // The game-coordinator's grace timer handles the "all players disconnected" case.
    if (this.isTeamFullyDisconnected(this.state.currentTeam)) {
      this.state.consecutivePasses++;
      this.endCurrentTurn('team_disconnected');
      return;
    }

    // A spymaster who is not here cannot give the clue: start the hand-over.
    const spymasterId = this.state.teams[this.state.currentTeam].spymasterId;
    if (!this.isConnected(spymasterId)) this.scheduleSpymasterHandover(spymasterId);

    const timeout = this.spymasterTimeout();
    this.broadcastGameAction({
      type: 'UA_PHASE_CHANGE',
      phase: UndercoverAgentPhase.CLUE,
      currentTeam: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
      timeout: this.announcedTimeout(timeout),
    });

    this.startTurnTimer(timeout);

    // Update footer round counter with turn number
    this.broadcastRound(this.state.turnNumber, 0);
  }

  private initializeState(): void {
    // Pick 25 random words from the pool
    const shuffledWords = this.shuffleArray([...this.wordPool]);
    const selectedWords = shuffledWords.slice(0, UA_GRID_SIZE);

    // Generate key card: 9 RED, 8 BLUE, 1 ASSASSIN, 7 BYSTANDER
    const keyCard = this.generateKeyCard();

    // Build grid
    const grid: GridTile[] = selectedWords.map((word, i) => ({
      position: i,
      word: word.toUpperCase(),
      type: keyCard[i],
      state: TileState.HIDDEN,
    }));

    // Assign players to teams (round-robin, shuffled)
    const playerIds = this.shuffleArray(Array.from(this.context.players.keys()));
    const redPlayerIds: string[] = [];
    const bluePlayerIds: string[] = [];

    // Balanced assignment: alternate between teams
    playerIds.forEach((id, i) => {
      if (i % 2 === 0) {
        redPlayerIds.push(id);
      } else {
        bluePlayerIds.push(id);
      }
    });

    // Ensure each team has at least 1 spymaster. With 2–3 players a team
    // may have no operative — the spymaster doubles as both roles.
    const redSpymaster = redPlayerIds[0];
    const redOperatives = redPlayerIds.slice(1);
    const blueSpymaster = bluePlayerIds[0];
    const blueOperatives = bluePlayerIds.slice(1);

    const teams: Record<'red' | 'blue', TeamState> = {
      red: {
        teamId: 'red',
        spymasterId: redSpymaster,
        operativeIds: redOperatives,
        agentsTotal: UA_FIRST_TEAM_AGENTS,
        agentsRevealed: 0,
        color: 'red',
      },
      blue: {
        teamId: 'blue',
        spymasterId: blueSpymaster,
        operativeIds: blueOperatives,
        agentsTotal: UA_SECOND_TEAM_AGENTS,
        agentsRevealed: 0,
        color: 'blue',
      },
    };

    this.state = {
      grid,
      keyCard,
      teams,
      currentTeam: 'red', // Red goes first (has 9 agents)
      phase: UndercoverAgentPhase.TEAM_SETUP,
      currentClue: null,
      guessesRemaining: 0,
      turnNumber: 0,
      consecutivePasses: 0,
      winner: null,
      winReason: null,
      actionLog: [],
    };
  }

  /** Initialize per-player stats for scoring and awards. Call after teams are finalized. */
  private initializePlayerStats(): void {
    this.playerStats.clear();
    const allPlayerIds = [
      this.state.teams.red.spymasterId,
      ...this.state.teams.red.operativeIds,
      this.state.teams.blue.spymasterId,
      ...this.state.teams.blue.operativeIds,
    ];
    for (const id of allPlayerIds) {
      this.playerStats.set(id, {
        correctGuesses: 0,
        incorrectGuesses: 0,
        cluesGiven: 0,
        totalAgentsFromClues: 0,
        longestClueWord: 0,
        maxAgentsFromSingleClue: 0,
        triggeredAssassin: false,
      });
    }
  }

  /** Check whether the current team composition is valid for starting the game. */
  private isTeamCompositionValid(): boolean {
    // Each team needs a connected spymaster and ≥1 connected operative
    return (['red', 'blue'] as const).every((teamId) => {
      const team = this.state.teams[teamId];
      return !!team.spymasterId && this.isConnected(team.spymasterId) && this.connectedOperatives(teamId).length >= 1;
    });
  }

  private generateKeyCard(): TileType[] {
    const types: TileType[] = [];

    for (let i = 0; i < UA_FIRST_TEAM_AGENTS; i++) types.push(TileType.RED_AGENT);
    for (let i = 0; i < UA_SECOND_TEAM_AGENTS; i++) types.push(TileType.BLUE_AGENT);
    const assassinCount = this.getSetting('enableAssassin', UA_ASSASSIN > 0) ? UA_ASSASSIN : 0;
    const bystanderCount = UA_BYSTANDER + (UA_ASSASSIN - assassinCount); // Convert removed assassins to bystanders
    for (let i = 0; i < assassinCount; i++) types.push(TileType.ASSASSIN);
    for (let i = 0; i < bystanderCount; i++) types.push(TileType.BYSTANDER);

    return this.shuffleArray(types);
  }

  private sendKeyCardToSpymaster(teamId: 'red' | 'blue'): void {
    const spymasterId = this.state.teams[teamId].spymasterId;
    const keyCardData = this.state.grid.map((t) => ({
      position: t.position,
      word: t.word,
      type: t.type,
    }));

    this.context.sendToPlayer(spymasterId, 'rmhbox:game:action', {
      type: 'UA_KEY_CARD',
      keyCard: keyCardData,
      teamId,
    });
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (!this.isRunning) return;
    if (this.state.phase === UndercoverAgentPhase.GAME_OVER) return;

    // Allow CONTINUE_BOARD_REVEAL during BOARD_REVEAL phase
    if (this.state.phase === UndercoverAgentPhase.BOARD_REVEAL && action !== 'CONTINUE_BOARD_REVEAL') return;

    switch (action) {
      // ── Team Setup actions ──
      case 'SHUFFLE_TEAMS':
        this.handleShuffleTeams(userId);
        break;
      case 'SWAP_PLAYER':
        this.handleSwapPlayer(userId, data);
        break;
      case 'SET_ROLE':
        this.handleSetRole(userId, data);
        break;
      case 'START_GAME':
        this.handleStartGame(userId);
        break;
      // ── Gameplay actions ──
      case 'GIVE_CLUE':
        this.handleGiveClue(userId, data);
        break;
      case 'GUESS_TILE':
        this.handleGuessTile(userId, data);
        break;
      case 'END_TURN':
        this.handleEndTurn(userId, data);
        break;
      case 'HIGHLIGHT_TILE':
        this.handleHighlightTile(userId, data);
        break;
      case 'CONTINUE_BOARD_REVEAL':
        this.handleContinueBoardReveal(userId);
        break;
      // ── Host ──
      case 'TOGGLE_TURN_TIMER':
        this.handleToggleTurnTimer(userId);
        break;
      default:
        break;
    }
  }

  // ─── Host: turn timers on / off ─────────────────────────────

  /**
   * The host switches turn timers off or on, before or during the game.
   * Off: the running turn stops counting down and waits for its players.
   * On: the current turn (CLUE or GUESS) gets a fresh full-length timer.
   */
  private handleToggleTurnTimer(userId: string): void {
    if (userId !== this.context.getHostId()) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'not_host',
      });
      return;
    }

    this.turnTimersEnabled = !this.turnTimersEnabled;
    logger.info({
      event: 'undercover_agent:turn_timers_toggled',
      lobbyId: this.context.lobbyId,
      enabled: this.turnTimersEnabled,
      phase: this.state.phase,
    });

    let timeout = 0;
    if (this.state.phase === UndercoverAgentPhase.CLUE) timeout = this.spymasterTimeout();
    else if (this.state.phase === UndercoverAgentPhase.GUESS) timeout = this.operativeTimeout();
    // Only a running turn changes now; otherwise the setting applies from the next turn.
    if (timeout > 0) this.startTurnTimer(timeout);

    this.broadcastGameAction({
      type: 'UA_TURN_TIMERS_TOGGLED',
      enabled: this.turnTimersEnabled,
      timeRemaining: this.turnTimersEnabled ? timeout : 0,
    });
  }

  // ─── Team Setup Actions ──────────────────────────────────────

  private handleShuffleTeams(userId: string): void {
    if (this.state.phase !== UndercoverAgentPhase.TEAM_SETUP) return;
    if (userId !== this.context.getHostId()) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'not_host',
      });
      return;
    }

    // Collect all player IDs (filter out empty strings) and re-shuffle
    const allIds = [
      this.state.teams.red.spymasterId,
      ...this.state.teams.red.operativeIds,
      this.state.teams.blue.spymasterId,
      ...this.state.teams.blue.operativeIds,
    ].filter(Boolean);

    if (allIds.length < 4) {
      // Not enough players to form two valid teams
      this.broadcastTeamUpdate();
      return;
    }

    const shuffled = this.shuffleArray([...allIds]);

    const redPlayerIds: string[] = [];
    const bluePlayerIds: string[] = [];
    shuffled.forEach((id, i) => {
      if (i % 2 === 0) redPlayerIds.push(id);
      else bluePlayerIds.push(id);
    });

    this.state.teams.red.spymasterId = redPlayerIds[0];
    this.state.teams.red.operativeIds = redPlayerIds.slice(1);
    this.state.teams.blue.spymasterId = bluePlayerIds[0];
    this.state.teams.blue.operativeIds = bluePlayerIds.slice(1);

    this.broadcastTeamUpdate();
  }

  private handleSwapPlayer(userId: string, data: unknown): void {
    if (this.state.phase !== UndercoverAgentPhase.TEAM_SETUP) return;

    const parsed = SwapPlayerSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { targetUserId, toTeam } = parsed.data;

    // Only the host or the player themselves can swap
    if (userId !== this.context.getHostId() && userId !== targetUserId) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'not_authorized',
      });
      return;
    }

    // Find the player's current team
    const fromTeam = this.getPlayerTeam(targetUserId);
    if (!fromTeam || fromTeam === toTeam) return;

    // Remove from current team
    this.removePlayerFromTeam(targetUserId, fromTeam);

    // Add to destination team — become spymaster if team has none, otherwise operative
    if (!this.state.teams[toTeam].spymasterId) {
      this.state.teams[toTeam].spymasterId = targetUserId;
    } else {
      this.state.teams[toTeam].operativeIds.push(targetUserId);
    }

    // If the source team lost its spymaster, promote the first operative
    if (!this.state.teams[fromTeam].spymasterId) {
      const ops = this.state.teams[fromTeam].operativeIds;
      if (ops.length > 0) {
        this.state.teams[fromTeam].spymasterId = ops.shift()!;
      }
    }

    this.broadcastTeamUpdate();
  }

  private handleSetRole(userId: string, data: unknown): void {
    if (this.state.phase !== UndercoverAgentPhase.TEAM_SETUP) return;

    const parsed = SetRoleSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { targetUserId, role } = parsed.data;

    // Only the host or the player themselves can change role
    if (userId !== this.context.getHostId() && userId !== targetUserId) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'not_authorized',
      });
      return;
    }

    const teamId = this.getPlayerTeam(targetUserId);
    if (!teamId) return;

    const team = this.state.teams[teamId];

    if (role === 'spymaster') {
      if (team.spymasterId === targetUserId) return; // already spymaster
      // Demote current spymaster to operative
      team.operativeIds.push(team.spymasterId);
      // Remove target from operatives
      team.operativeIds = team.operativeIds.filter((id) => id !== targetUserId);
      // Promote target
      team.spymasterId = targetUserId;
    } else {
      if (team.operativeIds.includes(targetUserId)) return; // already operative
      // Can only demote from spymaster if there's someone to take over
      if (team.operativeIds.length === 0) {
        this.context.sendToPlayer(userId, 'rmhbox:game:action', {
          type: 'UA_ACTION_REJECTED',
          reason: 'team_needs_spymaster',
        });
        return;
      }
      // Swap: first operative becomes spymaster, current spymaster becomes operative
      const newSpymaster = team.operativeIds.shift()!;
      team.operativeIds.push(targetUserId);
      team.spymasterId = newSpymaster;
    }

    this.broadcastTeamUpdate();
  }

  private handleStartGame(userId: string): void {
    if (this.state.phase !== UndercoverAgentPhase.TEAM_SETUP) return;
    if (userId !== this.context.getHostId()) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'not_host',
      });
      return;
    }

    if (!this.isTeamCompositionValid()) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'invalid_team_composition',
      });
      return;
    }

    logger.info({
      event: 'undercover_agent:teams_finalized',
      lobbyId: this.context.lobbyId,
      redTeam: this.state.teams.red.operativeIds.length + 1,
      blueTeam: this.state.teams.blue.operativeIds.length + 1,
    });

    this.startGame();
  }

  /** Remove a player from their team (spymaster or operative). Clears spymasterId if they were spymaster. */
  private removePlayerFromTeam(userId: string, teamId: 'red' | 'blue'): void {
    const team = this.state.teams[teamId];
    if (team.spymasterId === userId) {
      team.spymasterId = '';
    } else {
      team.operativeIds = team.operativeIds.filter((id) => id !== userId);
    }
  }

  /** Broadcast updated team state to all players. */
  private broadcastTeamUpdate(): void {
    this.broadcastGameAction({
      type: 'UA_TEAMS_UPDATED',
      teams: {
        red: this.getPublicTeamState('red'),
        blue: this.getPublicTeamState('blue'),
      },
      isValid: this.isTeamCompositionValid(),
    });
  }

  // ─── Gameplay Actions ────────────────────────────────────────

  private handleGiveClue(userId: string, data: unknown): void {
    // Must be CLUE phase
    if (this.state.phase !== UndercoverAgentPhase.CLUE) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'wrong_phase',
      });
      return;
    }

    // Must be the current team's spymaster
    const currentTeam = this.state.teams[this.state.currentTeam];
    if (userId !== currentTeam.spymasterId) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'not_spymaster',
      });
      return;
    }

    const parsed = GiveClueSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'invalid_input',
        errors: parsed.error.issues,
      });
      return;
    }

    const { word, number } = parsed.data;
    const clueWord = word.toUpperCase();

    // Clue word must not be a word on the grid
    if (this.state.grid.some((t) => t.word === clueWord)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'word_on_grid',
      });
      return;
    }

    // Clear turn timer
    this.clearTurnTimer();

    // Set current clue
    const guessesRemaining = number === 'unlimited' ? UA_MAX_UNLIMITED : number + 1;
    this.state.currentClue = {
      word: clueWord,
      number,
      teamId: this.state.currentTeam,
      guessesUsed: 0,
    };
    this.state.guessesRemaining = guessesRemaining;
    this.state.consecutivePasses = 0;

    // Update spymaster stats
    const stats = this.playerStats.get(userId);
    if (stats) {
      stats.cluesGiven++;
      if (clueWord.length > stats.longestClueWord) {
        stats.longestClueWord = clueWord.length;
      }
    }

    this.logAction('clue_given', {
      team: this.state.currentTeam,
      spymasterId: userId,
      word: clueWord,
      number,
    });

    logger.info({
      event: 'undercover_agent:clue_given',
      lobbyId: this.context.lobbyId,
      teamId: this.state.currentTeam,
      spymasterId: userId,
      clueWord: clueWord,
      clueNumber: number,
      turnNumber: this.state.turnNumber,
    });

    // Transition to GUESS phase
    this.state.phase = UndercoverAgentPhase.GUESS;
    const guessTimeout = this.operativeTimeout();

    this.broadcastGameAction({
      type: 'UA_CLUE',
      word: clueWord,
      number,
      teamId: this.state.currentTeam,
      spymasterId: userId,
      guessesRemaining: this.state.guessesRemaining,
      timeout: this.announcedTimeout(guessTimeout),
    });

    // Operatives get a bounded turn: on timeout the turn passes
    this.startTurnTimer(guessTimeout);

    // Update footer round counter (same turn number during guessing)
    this.broadcastRound(this.state.turnNumber, 0);

    // Clear highlights when a new clue starts
    this.highlights.clear();
    this.broadcastHighlights();
  }

  // ─── Highlight Tile ──────────────────────────────────────────

  private handleHighlightTile(userId: string, data: unknown): void {
    // Only allow during GUESS phase
    if (this.state.phase !== UndercoverAgentPhase.GUESS) return;

    // Must be an operative on the current team
    const currentTeam = this.state.teams[this.state.currentTeam];
    if (!currentTeam.operativeIds.includes(userId)) return;

    const parsed = HighlightTileSchema.safeParse(data);
    if (!parsed.success) return;

    const { position, highlighted } = parsed.data;
    const tile = this.state.grid[position];
    if (!tile || tile.state === TileState.REVEALED) return;

    if (highlighted) {
      let posSet = this.highlights.get(position);
      if (!posSet) {
        posSet = new Set();
        this.highlights.set(position, posSet);
      }
      posSet.add(userId);
    } else {
      const posSet = this.highlights.get(position);
      if (posSet) {
        posSet.delete(userId);
        if (posSet.size === 0) this.highlights.delete(position);
      }
    }

    this.broadcastHighlights();
  }

  /** Broadcast current highlight counts to all players */
  private broadcastHighlights(): void {
    const counts: Record<number, number> = {};
    for (const [pos, userSet] of this.highlights) {
      if (userSet.size > 0) counts[pos] = userSet.size;
    }
    this.broadcastGameAction({
      type: 'UA_HIGHLIGHTS',
      counts,
    });
  }

  /** Clear all highlights (called on turn end, tile reveal, etc.) */
  private clearHighlights(): void {
    if (this.highlights.size > 0) {
      this.highlights.clear();
      this.broadcastHighlights();
    }
  }

  /** Get highlight counts as a plain object for serialization */
  private getHighlightCounts(): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const [pos, userSet] of this.highlights) {
      if (userSet.size > 0) counts[pos] = userSet.size;
    }
    return counts;
  }

  private handleGuessTile(userId: string, data: unknown): void {
    // Must be GUESS phase
    if (this.state.phase !== UndercoverAgentPhase.GUESS) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'wrong_phase',
      });
      return;
    }

    // Must be an operative on the current team (or spymaster if solo team)
    const currentTeam = this.state.teams[this.state.currentTeam];
    const isSoloTeam = this.spymasterMayGuess(this.state.currentTeam);
    const isOperative = currentTeam.operativeIds.includes(userId);
    const isSoloSpymaster = isSoloTeam && currentTeam.spymasterId === userId;
    if (!isOperative && !isSoloSpymaster) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'not_operative',
      });
      return;
    }

    const parsed = GuessTileSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'invalid_input',
        errors: parsed.error.issues,
      });
      return;
    }

    const { position } = parsed.data;
    const tile = this.state.grid[position];

    // Tile must be hidden
    if (tile.state === TileState.REVEALED) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'tile_already_revealed',
      });
      return;
    }

    // Reveal the tile
    tile.state = TileState.REVEALED;
    tile.revealedBy = userId;
    this.state.guessesRemaining--;
    if (this.state.currentClue) {
      this.state.currentClue.guessesUsed++;
    }

    // Remove highlight for this tile
    this.highlights.delete(position);
    this.broadcastHighlights();

    this.logAction('guess', {
      team: this.state.currentTeam,
      operativeId: userId,
      word: tile.word,
      tileType: tile.type,
      correct: tile.type === (this.state.currentTeam === 'red' ? TileType.RED_AGENT : TileType.BLUE_AGENT),
      position,
    });

    this.logAction('tile_reveal', {
      position,
      word: tile.word,
      type: tile.type,
      revealedBy: userId,
      teamId: this.state.currentTeam,
    });

    logger.info({
      event: 'undercover_agent:tile_revealed',
      lobbyId: this.context.lobbyId,
      userId,
      position,
      word: tile.word,
      tileType: tile.type,
      teamId: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
    });

    // Process the result
    const ownAgentType = this.state.currentTeam === 'red' ? TileType.RED_AGENT : TileType.BLUE_AGENT;
    const opponentAgentType = this.state.currentTeam === 'red' ? TileType.BLUE_AGENT : TileType.RED_AGENT;
    const playerStatEntry = this.playerStats.get(userId);
    const opponentTeamId = this.state.currentTeam === 'red' ? 'blue' : 'red';

    // Count the agent before broadcasting, so every reveal carries both
    // teams' authoritative totals (clients no longer drift).
    if (tile.type === ownAgentType) this.state.teams[this.state.currentTeam].agentsRevealed++;
    else if (tile.type === opponentAgentType) this.state.teams[opponentTeamId].agentsRevealed++;

    // Broadcast the reveal to all players
    this.broadcastGameAction({
      type: 'UA_TILE_REVEALED',
      position,
      word: tile.word,
      tileType: tile.type,
      revealedBy: userId,
      teamId: this.state.currentTeam,
      agentsRevealed: {
        red: this.state.teams.red.agentsRevealed,
        blue: this.state.teams.blue.agentsRevealed,
      },
    });

    if (tile.type === TileType.ASSASSIN) {
      // Assassin hit → game over, other team wins
      if (playerStatEntry) {
        playerStatEntry.triggeredAssassin = true;
        playerStatEntry.incorrectGuesses++;
      }
      const otherTeam = this.state.currentTeam === 'red' ? 'blue' : 'red';
      this.endGameWithWinner(otherTeam, 'assassin_hit');
      return;
    }

    if (tile.type === ownAgentType) {
      // Correct guess — own agent found (counted above)
      const team = this.state.teams[this.state.currentTeam];
      if (playerStatEntry) {
        playerStatEntry.correctGuesses++;
      }

      // Track agents found from current clue for spymaster efficiency
      this.trackClueAgents(this.state.currentTeam);

      // Check if all agents found → win
      if (team.agentsRevealed >= team.agentsTotal) {
        this.endGameWithWinner(this.state.currentTeam, 'all_agents_found');
        return;
      }

      // Continue guessing if guesses remain
      if (this.state.guessesRemaining > 0) {
        this.broadcastGameAction({
          type: 'UA_GUESS_RESULT',
          result: 'correct',
          guessesRemaining: this.state.guessesRemaining,
          teamAgentsRevealed: team.agentsRevealed,
          teamAgentsTotal: team.agentsTotal,
        });
        return;
      }

      // No guesses remaining → end turn
      this.endCurrentTurn('guesses_exhausted');
      return;
    }

    // Hit opponent agent or bystander → end turn
    if (playerStatEntry) {
      playerStatEntry.incorrectGuesses++;
    }

    if (tile.type === opponentAgentType) {
      // Check if opponent now has all agents found → they win
      const oppTeam = this.state.teams[opponentTeamId];
      if (oppTeam.agentsRevealed >= oppTeam.agentsTotal) {
        this.endGameWithWinner(opponentTeamId, 'all_agents_found');
        return;
      }
    }

    this.endCurrentTurn(tile.type === TileType.BYSTANDER ? 'bystander_hit' : 'opponent_agent_hit');
  }

  private handleEndTurn(userId: string, data: unknown): void {
    // Must be GUESS phase
    if (this.state.phase !== UndercoverAgentPhase.GUESS) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'wrong_phase',
      });
      return;
    }

    // Must be an operative on the current team (or spymaster if solo team)
    const currentTeam = this.state.teams[this.state.currentTeam];
    const isSoloTeam = this.spymasterMayGuess(this.state.currentTeam);
    const isOperative = currentTeam.operativeIds.includes(userId);
    const isSoloSpymaster = isSoloTeam && currentTeam.spymasterId === userId;
    if (!isOperative && !isSoloSpymaster) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'not_operative',
      });
      return;
    }

    // Validate schema (empty object)
    EndTurnSchema.safeParse(data);

    this.logAction('pass', {
      userId,
      teamId: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
    });

    logger.info({
      event: 'undercover_agent:end_turn',
      lobbyId: this.context.lobbyId,
      userId,
      teamId: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
    });

    this.state.consecutivePasses++;
    this.endCurrentTurn('voluntary_pass');
  }

  // ─── Turn Management ────────────────────────────────────────

  private endCurrentTurn(reason: string): void {
    // Only a live turn can end (a late timer or a second disconnect is a no-op)
    if (this.state.phase !== UndercoverAgentPhase.CLUE && this.state.phase !== UndercoverAgentPhase.GUESS) return;
    this.clearTurnTimer();
    this.clearHighlights();

    // Check for draw via consecutive passes
    if (this.state.consecutivePasses >= this.getSetting('maxPasses', UA_MAX_PASSES)) {
      this.endGameWithWinner('draw', 'max_passes');
      return;
    }

    this.logAction('turn_end', {
      teamId: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
      reason,
    });

    logger.info({
      event: 'undercover_agent:turn_end',
      lobbyId: this.context.lobbyId,
      teamId: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
      reason,
    });

    // Transition phase
    this.state.phase = UndercoverAgentPhase.TURN_TRANSITION;
    this.state.currentClue = null;
    this.state.guessesRemaining = 0;

    this.broadcastGameAction({
      type: 'UA_TURN_END',
      teamId: this.state.currentTeam,
      reason,
      transitionDuration: UA_TURN_TRANSITION,
    });

    this.clearTrackedTimeout(this.transitionTimer);
    this.transitionTimer = this.setTimeout(() => {
      this.transitionTimer = null;
      this.startNextTurn();
    }, UA_TURN_TRANSITION * 1000);
  }

  private startNextTurn(): void {
    if (!this.isRunning) return;
    if (this.state.phase !== UndercoverAgentPhase.TURN_TRANSITION) return;

    // Switch teams
    this.state.currentTeam = this.state.currentTeam === 'red' ? 'blue' : 'red';
    this.state.turnNumber++;
    this.enterCluePhase();
  }

  private startTurnTimer(timeoutSeconds: number): void {
    this.clearTurnTimer();
    if (!this.turnTimersEnabled) {
      // Untimed turn: the header shows the infinite ring, nothing expires.
      this.startInfinitePhaseTimer();
      return;
    }
    // Drive the header timer ring for this turn
    this.startPhaseTimer(timeoutSeconds);
    this.turnTimer = this.setTimeout(() => {
      this.turnTimer = null;
      this.handleTurnTimeout();
    }, timeoutSeconds * 1000);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      this.clearTrackedTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.clearPhaseTimer();
  }

  private handleTurnTimeout(): void {
    if (!this.isRunning) return;

    logger.info({
      event: 'undercover_agent:turn_timeout',
      lobbyId: this.context.lobbyId,
      phase: this.state.phase,
      teamId: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
    });

    if (this.state.phase === UndercoverAgentPhase.CLUE) {
      // Spymaster timed out → auto-pass
      this.state.consecutivePasses++;
      this.broadcastGameAction({
        type: 'UA_TIMEOUT',
        phase: 'CLUE',
        teamId: this.state.currentTeam,
      });
      this.endCurrentTurn('spymaster_timeout');
    } else if (this.state.phase === UndercoverAgentPhase.GUESS) {
      // Operatives timed out → end turn
      this.broadcastGameAction({
        type: 'UA_TIMEOUT',
        phase: 'GUESS',
        teamId: this.state.currentTeam,
      });
      this.endCurrentTurn('operative_timeout');
    }
  }

  // ─── Win Conditions ─────────────────────────────────────────

  private endGameWithWinner(winner: 'red' | 'blue' | 'draw', reason: string): void {
    if (this.state.phase === UndercoverAgentPhase.BOARD_REVEAL || this.state.phase === UndercoverAgentPhase.GAME_OVER) {
      return;
    }
    this.clearTurnTimer();
    this.clearTrackedTimeout(this.transitionTimer);
    this.transitionTimer = null;
    this.state.phase = UndercoverAgentPhase.BOARD_REVEAL;
    this.state.winner = winner;
    this.state.winReason = reason;

    this.logAction('game_end', {
      winningTeam: winner,
      winCondition: reason,
      turnNumber: this.state.turnNumber,
      redAgentsRevealed: this.state.teams.red.agentsRevealed,
      blueAgentsRevealed: this.state.teams.blue.agentsRevealed,
    });

    logger.info({
      event: 'undercover_agent:game_end',
      lobbyId: this.context.lobbyId,
      winner,
      reason,
      turnNumber: this.state.turnNumber,
      redAgentsRevealed: this.state.teams.red.agentsRevealed,
      blueAgentsRevealed: this.state.teams.blue.agentsRevealed,
    });

    // Reveal full grid to all players
    const fullGrid = this.state.grid.map((t) => ({
      position: t.position,
      word: t.word,
      type: t.type,
      state: t.state,
      revealedBy: t.revealedBy,
    }));

    this.broadcastGameAction({
      type: 'UA_BOARD_REVEAL',
      winner,
      reason,
      grid: fullGrid,
      teams: {
        red: this.getPublicTeamState('red'),
        blue: this.getPublicTeamState('blue'),
      },
      turnNumber: this.state.turnNumber,
    });

    // Infinite timer during board reveal (host clicks Continue to advance)
    this.startInfinitePhaseTimer();
  }

  /**
   * Host clicks "Continue" from the board reveal screen → finalize game.
   */
  private handleContinueBoardReveal(userId: string): void {
    if (this.state.phase !== UndercoverAgentPhase.BOARD_REVEAL) return;
    if (userId !== this.context.getHostId()) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UA_ACTION_REJECTED',
        reason: 'not_host',
      });
      return;
    }

    this.state.phase = UndercoverAgentPhase.GAME_OVER;

    this.broadcastGameAction({
      type: 'UA_GAME_OVER',
      winner: this.state.winner,
      reason: this.state.winReason,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── State Masking ──────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const isRedSpymaster = userId === this.state.teams.red.spymasterId;
    const isBlueSpymaster = userId === this.state.teams.blue.spymasterId;
    const isSpymaster = isRedSpymaster || isBlueSpymaster;

    const grid = this.state.grid.map((tile) => {
      if (
        isSpymaster ||
        tile.state === TileState.REVEALED ||
        this.state.phase === UndercoverAgentPhase.BOARD_REVEAL ||
        this.state.phase === UndercoverAgentPhase.GAME_OVER
      ) {
        // Spymasters, revealed tiles, and board-reveal/game-over phase: see all types
        return {
          position: tile.position,
          word: tile.word,
          type: tile.type,
          state: tile.state,
          revealedBy: tile.revealedBy,
        };
      }
      // Operatives only see hidden tiles without type
      return {
        position: tile.position,
        word: tile.word,
        type: null,
        state: tile.state,
      };
    });

    // Determine role
    let role: 'spymaster' | 'operative' | 'spectator' = 'spectator';
    let teamId: 'red' | 'blue' | null = null;
    if (isRedSpymaster) {
      role = 'spymaster';
      teamId = 'red';
    } else if (isBlueSpymaster) {
      role = 'spymaster';
      teamId = 'blue';
    } else if (this.state.teams.red.operativeIds.includes(userId)) {
      role = 'operative';
      teamId = 'red';
    } else if (this.state.teams.blue.operativeIds.includes(userId)) {
      role = 'operative';
      teamId = 'blue';
    }

    return {
      phase: this.state.phase,
      grid,
      teams: {
        red: this.getPublicTeamState('red'),
        blue: this.getPublicTeamState('blue'),
      },
      currentTeam: this.state.currentTeam,
      currentClue: this.state.currentClue,
      guessesRemaining: this.state.guessesRemaining,
      turnNumber: this.state.turnNumber,
      winner: this.state.winner,
      winReason: this.state.winReason,
      myRole: role,
      myTeam: teamId,
      hostId: this.context.getHostId(),
      isTeamValid: this.isTeamCompositionValid(),
      highlightCounts: this.getHighlightCounts(),
      timeRemaining: this.turnTimeRemaining(),
      turnTimersEnabled: this.turnTimersEnabled,
      actionLog: this.snapshotActionLog(),
    };
  }

  /** Seconds left in the current CLUE / GUESS turn (0 when no turn is timed). */
  private turnTimeRemaining(): number {
    if (!this.turnTimer) return 0;
    const snap = this.getPhaseTimerSnapshot();
    return snap && !snap.infinite ? snap.remaining : 0;
  }

  /** The tail of the action log a client needs to rebuild its game log. */
  private snapshotActionLog(): UndercoverAgentState['actionLog'] {
    return this.state.actionLog.slice(-UA_SNAPSHOT_LOG_LIMIT);
  }

  getStateForSpectator(): unknown {
    // Spectators see the full key card (like a broadcast view)
    const grid = this.state.grid.map((tile) => ({
      position: tile.position,
      word: tile.word,
      type: tile.type,
      state: tile.state,
      revealedBy: tile.revealedBy,
    }));

    return {
      phase: this.state.phase,
      grid,
      teams: {
        red: this.getPublicTeamState('red'),
        blue: this.getPublicTeamState('blue'),
      },
      currentTeam: this.state.currentTeam,
      currentClue: this.state.currentClue,
      guessesRemaining: this.state.guessesRemaining,
      turnNumber: this.state.turnNumber,
      winner: this.state.winner,
      winReason: this.state.winReason,
      myRole: 'spectator',
      myTeam: null,
      hostId: this.context.getHostId(),
      isTeamValid: this.isTeamCompositionValid(),
      highlightCounts: this.getHighlightCounts(),
      timeRemaining: this.turnTimeRemaining(),
      turnTimersEnabled: this.turnTimersEnabled,
      actionLog: this.snapshotActionLog(),
    };
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ───────────

  handlePlayerJoin(userId: string): void {
    // spectate_only: JIP players get spectator state
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForSpectator());
  }

  handlePlayerDisconnect(userId: string): void {
    const teamId = this.getPlayerTeam(userId);
    if (!teamId) return;

    const team = this.state.teams[teamId];
    const isSpymaster = userId === team.spymasterId;

    logger.info({
      event: 'undercover_agent:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      teamId,
      isSpymaster,
      turnNumber: this.state.turnNumber,
    });

    if (!this.isRunning) return;
    if (this.state.phase === UndercoverAgentPhase.BOARD_REVEAL || this.state.phase === UndercoverAgentPhase.GAME_OVER) {
      return;
    }

    // During TEAM_SETUP the departed player leaves their team (they are put
    // back on one if they reconnect), so the host can never start with a
    // spymaster who is not there.
    if (this.state.phase === UndercoverAgentPhase.TEAM_SETUP) {
      this.removePlayerFromTeam(userId, teamId);
      if (!team.spymasterId) {
        const next = this.connectedOperatives(teamId)[0] ?? team.operativeIds[0];
        if (next) {
          team.operativeIds = team.operativeIds.filter((id) => id !== next);
          team.spymasterId = next;
        }
      }
      this.broadcastTeamUpdate();
      return;
    }

    // If the disconnected player's team is the current team and is now fully
    // disconnected, auto-end their turn instead of ending the game.  The
    // game-coordinator's grace timer handles the "all players disconnected" case.
    if (this.isTeamFullyDisconnected(teamId) && teamId === this.state.currentTeam) {
      if (this.state.phase === UndercoverAgentPhase.CLUE || this.state.phase === UndercoverAgentPhase.GUESS) {
        logger.info({
          event: 'undercover_agent:team_disconnected_auto_pass',
          lobbyId: this.context.lobbyId,
          teamId,
          turnNumber: this.state.turnNumber,
        });
        this.state.consecutivePasses++;
        this.endCurrentTurn('team_disconnected');
        return;
      }
    }

    // A spymaster who does not come back is replaced by a connected operative
    // (SETUP included: the first CLUE turn must have someone to give it).
    if (isSpymaster) this.scheduleSpymasterHandover(userId);
  }

  handlePlayerReconnect(userId: string): void {
    logger.info({
      event: 'undercover_agent:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
      turnNumber: this.state.turnNumber,
    });

    // Back in time: keep the spymaster role.
    const pending = this.disconnectTimers.get(userId);
    if (pending) {
      this.clearTrackedTimeout(pending);
      this.disconnectTimers.delete(userId);
    }

    // Back during TEAM_SETUP: rejoin the smaller team.
    if (this.state.phase === UndercoverAgentPhase.TEAM_SETUP && !this.getPlayerTeam(userId)) {
      const size = (teamId: 'red' | 'blue') =>
        (this.state.teams[teamId].spymasterId ? 1 : 0) + this.state.teams[teamId].operativeIds.length;
      const teamId = size('red') <= size('blue') ? 'red' : 'blue';
      const team = this.state.teams[teamId];
      if (!team.spymasterId) team.spymasterId = userId;
      else team.operativeIds.push(userId);
      this.broadcastTeamUpdate();
    } else if (this.state.phase === UndercoverAgentPhase.TEAM_SETUP) {
      this.broadcastTeamUpdate();
    }
  }

  /**
   * Give a disconnected spymaster a short window to return, then hand the
   * role (and the key card) to a connected operative of the same team. With
   * no connected operative the team is fully gone and its turns auto-pass.
   */
  private scheduleSpymasterHandover(spymasterId: string): void {
    if (!spymasterId || this.disconnectTimers.has(spymasterId)) return;
    const handle = this.setTimeout(() => {
      this.disconnectTimers.delete(spymasterId);
      this.handOverSpymaster(spymasterId);
    }, UA_SPYMASTER_RECONNECT_GRACE_SECONDS * 1000);
    this.disconnectTimers.set(spymasterId, handle);
  }

  private handOverSpymaster(spymasterId: string): void {
    if (!this.isRunning) return;
    const phase = this.state.phase;
    if (
      phase === UndercoverAgentPhase.TEAM_SETUP ||
      phase === UndercoverAgentPhase.BOARD_REVEAL ||
      phase === UndercoverAgentPhase.GAME_OVER
    ) {
      return;
    }
    const teamId = this.getPlayerTeam(spymasterId);
    if (!teamId) return;
    const team = this.state.teams[teamId];
    if (team.spymasterId !== spymasterId || this.isConnected(spymasterId)) return;

    const successor = this.connectedOperatives(teamId)[0];
    if (!successor) {
      // Nobody left to give clues: pass the team's clue turn.
      if (teamId === this.state.currentTeam && phase === UndercoverAgentPhase.CLUE) {
        this.state.consecutivePasses++;
        this.endCurrentTurn('team_disconnected');
      }
      return;
    }

    // Swap roles: the absent spymaster becomes an operative of the same team.
    team.operativeIds = [...team.operativeIds.filter((id) => id !== successor), spymasterId];
    team.spymasterId = successor;
    for (const users of this.highlights.values()) users.delete(successor);

    this.logAction('spymaster_changed', {
      teamId,
      previousSpymasterId: spymasterId,
      spymasterId: successor,
    });

    logger.info({
      event: 'undercover_agent:spymaster_handover',
      lobbyId: this.context.lobbyId,
      teamId,
      previousSpymasterId: spymasterId,
      spymasterId: successor,
    });

    this.sendKeyCardToSpymaster(teamId);
    this.broadcastGameAction({
      type: 'UA_ROLES_CHANGED',
      teamId,
      spymasterId: successor,
      previousSpymasterId: spymasterId,
      teams: {
        red: this.getPublicTeamState('red'),
        blue: this.getPublicTeamState('blue'),
      },
    });
  }

  // ─── Results & Awards ───────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.computeRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        winner: this.state.winner,
        winReason: this.state.winReason,
        turnNumber: this.state.turnNumber,
        teams: {
          red: this.getPublicTeamState('red'),
          blue: this.getPublicTeamState('blue'),
        },
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] = [];
    const winner = this.state.winner;

    for (const [userId, player] of this.context.players) {
      const teamId = this.getPlayerTeam(userId);
      const stats = this.playerStats.get(userId);
      let score = 0;

      if (winner === 'draw') {
        score = UA_DRAW_POINTS;
      } else if (teamId && teamId === winner) {
        // Winning team: spymaster gets UA_WIN, operatives get UA_WIN_OPERATIVE
        const team = this.state.teams[teamId];
        score = userId === team.spymasterId ? UA_WIN : UA_WIN_OPERATIVE;
      } else if (teamId) {
        score = UA_LOSE;
      }

      // Spymaster: bonus per correct operative tap (+UA_CLUE_EFFICIENCY each)
      if (stats && teamId) {
        const team = this.state.teams[teamId];
        if (userId === team.spymasterId) {
          score += UA_CLUE_EFFICIENCY * stats.totalAgentsFromClues;
        }

        // Operative: bonus per correct guess (+UA_CORRECT_GUESS each)
        if (team.operativeIds.includes(userId)) {
          score += UA_CORRECT_GUESS * stats.correctGuesses;
        }

        // Assassin penalty
        if (stats.triggeredAssassin) {
          score += UA_ASSASSIN_PENALTY;
        }
      }

      // Floor at 0
      score = Math.max(0, score);

      const deltas: Record<string, number> = {};
      if (teamId === winner && teamId) {
        const team = this.state.teams[teamId];
        deltas.win = userId === team.spymasterId ? UA_WIN : UA_WIN_OPERATIVE;
      }
      if (teamId && teamId !== winner && winner !== 'draw') deltas.lose = UA_LOSE;
      if (winner === 'draw') deltas.draw = UA_DRAW_POINTS;
      if (stats?.correctGuesses) deltas.correct_guesses = UA_CORRECT_GUESS * stats.correctGuesses;
      if (stats?.triggeredAssassin) deltas.assassin_penalty = UA_ASSASSIN_PENALTY;

      entries.push({
        userId,
        userName: player.userName,
        score,
        rank: 0,
        deltas,
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Mastermind — 3+ agents found from a single clue
    for (const [userId, stats] of this.playerStats) {
      if (stats.maxAgentsFromSingleClue >= 3) {
        awards.push({
          userId,
          title: 'Mastermind',
          description: `${stats.maxAgentsFromSingleClue} agents found from a single clue`,
          icon: 'brain',
        });
      }
    }

    // Sharpshooter — most correct guesses (operatives only)
    let topGuesserId: string | null = null;
    let topGuesses = 0;
    for (const [userId, stats] of this.playerStats) {
      const teamId = this.getPlayerTeam(userId);
      if (!teamId) continue;
      const team = this.state.teams[teamId];
      if (team.operativeIds.includes(userId) && stats.correctGuesses > topGuesses) {
        topGuesses = stats.correctGuesses;
        topGuesserId = userId;
      }
    }
    if (topGuesserId && topGuesses > 0) {
      awards.push({
        userId: topGuesserId,
        title: 'Sharpshooter',
        description: `${topGuesses} correct guesses`,
        icon: 'target',
      });
    }

    // Oops — triggered the assassin
    for (const [userId, stats] of this.playerStats) {
      if (stats.triggeredAssassin) {
        awards.push({
          userId,
          title: 'Oops',
          description: 'Triggered the assassin',
          icon: 'skull',
        });
      }
    }

    // Speedrunner — won in ≤5 turns
    if (this.state.winner && this.state.winner !== 'draw' && this.state.turnNumber <= 5) {
      const winnerTeamId = this.state.winner;
      const winningTeam = this.state.teams[winnerTeamId];
      awards.push({
        userId: winningTeam.spymasterId,
        title: 'Speedrunner',
        description: `Won in ${this.state.turnNumber} turns`,
        icon: 'zap',
      });
    }

    // Linguist — longest clue word (spymasters only)
    let longestClueUserId: string | null = null;
    let longestClueLength = 0;
    for (const [userId, stats] of this.playerStats) {
      if (stats.longestClueWord > longestClueLength) {
        longestClueLength = stats.longestClueWord;
        longestClueUserId = userId;
      }
    }
    if (longestClueUserId && longestClueLength > 0) {
      awards.push({
        userId: longestClueUserId,
        title: 'Linguist',
        description: `Gave a ${longestClueLength}-letter clue word`,
        icon: 'book-open',
      });
    }

    return awards;
  }

  // ─── Helpers ────────────────────────────────────────────────

  private getPlayerTeam(userId: string): 'red' | 'blue' | null {
    const red = this.state.teams.red;
    if (userId === red.spymasterId || red.operativeIds.includes(userId)) return 'red';
    const blue = this.state.teams.blue;
    if (userId === blue.spymasterId || blue.operativeIds.includes(userId)) return 'blue';
    return null;
  }

  private getPublicTeamState(teamId: 'red' | 'blue'): Record<string, unknown> {
    const team = this.state.teams[teamId];
    return {
      teamId: team.teamId,
      spymasterId: team.spymasterId,
      operativeIds: team.operativeIds.filter(Boolean),
      agentsTotal: team.agentsTotal,
      agentsRevealed: team.agentsRevealed,
      color: team.color,
    };
  }

  private isTeamFullyDisconnected(teamId: 'red' | 'blue'): boolean {
    const team = this.state.teams[teamId];
    const allMembers = [team.spymasterId, ...team.operativeIds];
    return allMembers.every((id) => {
      const player = this.context.players.get(id);
      return !player || !player.isConnected;
    });
  }

  private trackClueAgents(teamId: 'red' | 'blue'): void {
    const team = this.state.teams[teamId];
    const spymasterStats = this.playerStats.get(team.spymasterId);
    if (spymasterStats && this.state.currentClue) {
      spymasterStats.totalAgentsFromClues++;
      const agentsThisClue = this.state.currentClue.guessesUsed;
      // Only count correct guesses this clue toward the max
      // guessesUsed includes this guess; check if this tile was own agent
      if (agentsThisClue > spymasterStats.maxAgentsFromSingleClue) {
        spymasterStats.maxAgentsFromSingleClue = agentsThisClue;
      }
    }
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // ─── Action Log / Game Log ──────────────────────────────────

  private actionSeq = 0;

  /**
   * Broadcast a game action to all players with the action-log entries added
   * since the previous broadcast (clients append them by seq; a snapshot
   * carries the log's tail). Sending the whole log on every action grew each
   * message with the game.
   */
  protected override broadcastGameAction(data: Record<string, unknown>): void {
    const newEntries = this.state.actionLog.filter((e) => e.seq > this.lastBroadcastSeq);
    this.lastBroadcastSeq = this.actionSeq;
    this.context.broadcastToLobby('rmhbox:game:action', {
      ...data,
      actionLogEntries: newEntries,
    });
  }

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      seq: ++this.actionSeq,
      type,
      timestamp: Date.now(),
      payload,
    });
  }

  private buildGameLog(): Record<string, unknown> {
    const players = Array.from(this.context.players.entries()).map(([userId, p]) => ({
      userId,
      userName: p.userName,
    }));

    // Build initial state with grid words and key card
    const words = this.state.grid.map((tile) => tile.word);
    const teamAWords = this.state.grid.filter((t) => t.type === TileType.RED_AGENT).map((t) => t.word);
    const teamBWords = this.state.grid.filter((t) => t.type === TileType.BLUE_AGENT).map((t) => t.word);
    const neutralWords = this.state.grid.filter((t) => t.type === TileType.BYSTANDER).map((t) => t.word);
    const assassinWord = this.state.grid.find((t) => t.type === TileType.ASSASSIN)?.word ?? '';

    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      turnNumber: this.state.turnNumber,
      playerCount: this.context.players.size,
      winner: this.state.winner,
      winReason: this.state.winReason,
      players,
      initialState: {
        gridSize: 25,
        words,
        keyCard: {
          teamA: teamAWords,
          teamB: teamBWords,
          neutral: neutralWords,
          assassin: assassinWord,
        },
        teamASpymaster: this.state.teams.red.spymasterId,
        teamBSpymaster: this.state.teams.blue.spymasterId,
        startingTeam: 'red',
      },
      actions: this.state.actionLog,
      finalResults: Array.from(this.context.players.keys()).map((userId) => ({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        score: 0,
      })),
    };
  }

  // ─── Cleanup ────────────────────────────────────────────────

  cleanup(): void {
    // Clear disconnect timers
    for (const timer of this.disconnectTimers.values()) {
      this.clearTrackedTimeout(timer);
    }
    this.disconnectTimers.clear();
    this.turnTimer = null;
    this.transitionTimer = null;
    super.cleanup();
  }
}

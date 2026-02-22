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
import { BaseMinigame } from './base-minigame';
import type { MinigameContext, MinigameResults } from './base-minigame';
import type { PlayerRanking, Award } from '../../../lib/rmhbox/types';
import { GiveClueSchema, GuessTileSchema, EndTurnSchema } from '../../../lib/rmhbox/undercover-agent/schemas';
import {
  UA_GRID_SIZE,
  UA_FIRST_TEAM_AGENTS,
  UA_SECOND_TEAM_AGENTS,
  UA_ASSASSIN,
  UA_BYSTANDER,
  UA_SPYMASTER_TIMEOUT,
  UA_OPERATIVE_TIMEOUT,
  UA_TURN_TRANSITION,
  UA_MAX_UNLIMITED,
  UA_MAX_PASSES,
  UA_WIN,
  UA_LOSE,
  UA_CLUE_EFFICIENCY,
  UA_CORRECT_GUESS,
  UA_ASSASSIN_PENALTY,
} from '../../../lib/rmhbox/constants';
import { logger } from '../logger';

// ─── Phase Enum ──────────────────────────────────────────────────

export enum UndercoverAgentPhase {
  SETUP = 'SETUP',
  CLUE = 'CLUE',
  GUESS = 'GUESS',
  TURN_TRANSITION = 'TURN_TRANSITION',
  GAME_OVER = 'GAME_OVER',
}

// ─── Tile Enums ──────────────────────────────────────────────────

export enum TileType {
  RED_AGENT = 'RED_AGENT',
  BLUE_AGENT = 'BLUE_AGENT',
  BYSTANDER = 'BYSTANDER',
  ASSASSIN = 'ASSASSIN',
}

export enum TileState {
  HIDDEN = 'HIDDEN',
  REVEALED = 'REVEALED',
}

// ─── Type Definitions ────────────────────────────────────────────

export interface GridTile {
  position: number;
  word: string;
  type: TileType;
  state: TileState;
  revealedBy?: string;
}

export interface TeamState {
  teamId: 'red' | 'blue';
  spymasterId: string;
  operativeIds: string[];
  agentsTotal: number;
  agentsRevealed: number;
  color: string;
}

export interface CurrentClue {
  word: string;
  number: number | 'unlimited';
  teamId: 'red' | 'blue';
  guessesUsed: number;
}

export interface ActionLogEntry {
  action: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface UndercoverAgentState {
  grid: GridTile[];
  keyCard: TileType[];
  teams: Record<'red' | 'blue', TeamState>;
  currentTeam: 'red' | 'blue';
  phase: UndercoverAgentPhase;
  currentClue: CurrentClue | null;
  guessesRemaining: number;
  turnNumber: number;
  consecutivePasses: number;
  winner: 'red' | 'blue' | 'draw' | null;
  winReason: string | null;
  actionLog: ActionLogEntry[];
}

// ─── Undercover Agent Minigame ───────────────────────────────────

export class UndercoverAgentMinigame extends BaseMinigame {
  private wordPool: string[];
  private state!: UndercoverAgentState;
  private startedAt: number = 0;
  private turnTimer: NodeJS.Timeout | null = null;
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  /** Per-player stats for scoring and awards. */
  private playerStats: Map<string, {
    correctGuesses: number;
    incorrectGuesses: number;
    cluesGiven: number;
    totalAgentsFromClues: number;
    longestClueWord: number;
    maxAgentsFromSingleClue: number;
    triggeredAssassin: boolean;
  }> = new Map();

  constructor(context: MinigameContext) {
    super(context);
    const poolPath = path.resolve(
      __dirname, '..', '..', '..', 'public', 'data', 'rmhbox', 'undercover-agent', 'word-pool.json',
    );
    const raw = fs.readFileSync(poolPath, 'utf-8');
    this.wordPool = JSON.parse(raw) as string[];
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();
    this.initializeState();

    logger.info({
      event: 'undercover_agent:start',
      lobbyId: this.context.lobbyId,
      playerCount: this.context.players.size,
      redTeam: this.state.teams.red.operativeIds.length + 1,
      blueTeam: this.state.teams.blue.operativeIds.length + 1,
    });

    // Broadcast setup: grid words (without types) to all players
    const gridWords = this.state.grid.map((t) => ({
      position: t.position,
      word: t.word,
    }));

    this.context.broadcastToLobby('rmhbox:game:action', {
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

    // Transition to CLUE phase
    this.state.phase = UndercoverAgentPhase.CLUE;
    this.state.turnNumber = 1;
    this.logAction('turn_start', { turnNumber: 1, team: this.state.currentTeam });
    this.startTurnTimer(UA_SPYMASTER_TIMEOUT);

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UA_PHASE_CHANGE',
      phase: UndercoverAgentPhase.CLUE,
      currentTeam: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
      timeout: UA_SPYMASTER_TIMEOUT,
    });
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

    // Assign players to teams (round-robin)
    const playerIds = this.shuffleArray(Array.from(this.context.players.keys()));
    const redPlayerIds: string[] = [];
    const bluePlayerIds: string[] = [];

    playerIds.forEach((id, i) => {
      if (i % 2 === 0) {
        redPlayerIds.push(id);
      } else {
        bluePlayerIds.push(id);
      }
    });

    // Select 1 spymaster per team randomly (first element after shuffle)
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

    // Initialize player stats
    for (const id of playerIds) {
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

    this.state = {
      grid,
      keyCard,
      teams,
      currentTeam: 'red', // Red goes first (has 9 agents)
      phase: UndercoverAgentPhase.SETUP,
      currentClue: null,
      guessesRemaining: 0,
      turnNumber: 0,
      consecutivePasses: 0,
      winner: null,
      winReason: null,
      actionLog: [],
    };
  }

  private generateKeyCard(): TileType[] {
    const types: TileType[] = [];

    for (let i = 0; i < UA_FIRST_TEAM_AGENTS; i++) types.push(TileType.RED_AGENT);
    for (let i = 0; i < UA_SECOND_TEAM_AGENTS; i++) types.push(TileType.BLUE_AGENT);
    for (let i = 0; i < UA_ASSASSIN; i++) types.push(TileType.ASSASSIN);
    for (let i = 0; i < UA_BYSTANDER; i++) types.push(TileType.BYSTANDER);

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

    switch (action) {
      case 'GIVE_CLUE':
        this.handleGiveClue(userId, data);
        break;
      case 'GUESS_TILE':
        this.handleGuessTile(userId, data);
        break;
      case 'END_TURN':
        this.handleEndTurn(userId, data);
        break;
      default:
        break;
    }
  }

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
      teamId: this.state.currentTeam,
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
    this.startTurnTimer(UA_OPERATIVE_TIMEOUT);

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UA_CLUE',
      word: clueWord,
      number,
      teamId: this.state.currentTeam,
      guessesRemaining: this.state.guessesRemaining,
      timeout: UA_OPERATIVE_TIMEOUT,
    });
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

    // Must be an operative on the current team
    const currentTeam = this.state.teams[this.state.currentTeam];
    if (!currentTeam.operativeIds.includes(userId)) {
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

    this.logAction('guess', {
      userId,
      position,
      word: tile.word,
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

    // Broadcast the reveal to all players
    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UA_TILE_REVEALED',
      position,
      word: tile.word,
      tileType: tile.type,
      revealedBy: userId,
      teamId: this.state.currentTeam,
    });

    // Process the result
    const ownAgentType = this.state.currentTeam === 'red' ? TileType.RED_AGENT : TileType.BLUE_AGENT;
    const opponentAgentType = this.state.currentTeam === 'red' ? TileType.BLUE_AGENT : TileType.RED_AGENT;
    const playerStatEntry = this.playerStats.get(userId);

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
      // Correct guess — own agent found
      const team = this.state.teams[this.state.currentTeam];
      team.agentsRevealed++;
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
        this.context.broadcastToLobby('rmhbox:game:action', {
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
      const opponentTeamId = this.state.currentTeam === 'red' ? 'blue' : 'red';
      this.state.teams[opponentTeamId].agentsRevealed++;

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

    // Must be an operative on the current team
    const currentTeam = this.state.teams[this.state.currentTeam];
    if (!currentTeam.operativeIds.includes(userId)) {
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
    this.clearTurnTimer();

    // Check for draw via consecutive passes
    if (this.state.consecutivePasses >= UA_MAX_PASSES) {
      this.endGameWithWinner('draw' as 'red' | 'blue', 'max_passes');
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

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UA_TURN_END',
      teamId: this.state.currentTeam,
      reason,
      transitionDuration: UA_TURN_TRANSITION,
    });

    this.setTimeout(() => this.startNextTurn(), UA_TURN_TRANSITION * 1000);
  }

  private startNextTurn(): void {
    if (!this.isRunning) return;

    // Switch teams
    this.state.currentTeam = this.state.currentTeam === 'red' ? 'blue' : 'red';
    this.state.turnNumber++;
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

    // Check if all players on the current team are disconnected
    if (this.isTeamFullyDisconnected(this.state.currentTeam)) {
      const otherTeam = this.state.currentTeam === 'red' ? 'blue' : 'red';
      this.endGameWithWinner(otherTeam, 'team_disconnected');
      return;
    }

    this.startTurnTimer(UA_SPYMASTER_TIMEOUT);

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UA_PHASE_CHANGE',
      phase: UndercoverAgentPhase.CLUE,
      currentTeam: this.state.currentTeam,
      turnNumber: this.state.turnNumber,
      timeout: UA_SPYMASTER_TIMEOUT,
    });
  }

  private startTurnTimer(timeoutSeconds: number): void {
    this.clearTurnTimer();
    this.turnTimer = this.setTimeout(() => {
      this.handleTurnTimeout();
    }, timeoutSeconds * 1000);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.timers = this.timers.filter((t) => t !== this.turnTimer);
      this.turnTimer = null;
    }
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
      this.context.broadcastToLobby('rmhbox:game:action', {
        type: 'UA_TIMEOUT',
        phase: 'CLUE',
        teamId: this.state.currentTeam,
      });
      this.endCurrentTurn('spymaster_timeout');
    } else if (this.state.phase === UndercoverAgentPhase.GUESS) {
      // Operatives timed out → end turn
      this.context.broadcastToLobby('rmhbox:game:action', {
        type: 'UA_TIMEOUT',
        phase: 'GUESS',
        teamId: this.state.currentTeam,
      });
      this.endCurrentTurn('operative_timeout');
    }
  }

  // ─── Win Conditions ─────────────────────────────────────────

  private endGameWithWinner(winner: 'red' | 'blue' | 'draw', reason: string): void {
    this.clearTurnTimer();
    this.state.phase = UndercoverAgentPhase.GAME_OVER;
    this.state.winner = winner;
    this.state.winReason = reason;

    this.logAction('game_end', {
      winner,
      reason,
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

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UA_GAME_OVER',
      winner,
      reason,
      grid: fullGrid,
      teams: {
        red: this.getPublicTeamState('red'),
        blue: this.getPublicTeamState('blue'),
      },
      turnNumber: this.state.turnNumber,
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
      if (isSpymaster || tile.state === TileState.REVEALED) {
        // Spymasters see all tile types; revealed tiles visible to all
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
    if (isRedSpymaster) { role = 'spymaster'; teamId = 'red'; }
    else if (isBlueSpymaster) { role = 'spymaster'; teamId = 'blue'; }
    else if (this.state.teams.red.operativeIds.includes(userId)) { role = 'operative'; teamId = 'red'; }
    else if (this.state.teams.blue.operativeIds.includes(userId)) { role = 'operative'; teamId = 'blue'; }

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
    };
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
    };
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ───────────

  handlePlayerJoin(userId: string): void {
    // spectate_only: JIP players get spectator state
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForSpectator(),
    );
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

    // Check if all players on the team are disconnected
    if (this.isTeamFullyDisconnected(teamId)) {
      const otherTeam = teamId === 'red' ? 'blue' : 'red';
      this.endGameWithWinner(otherTeam, 'team_disconnected');
      return;
    }

    // Spymaster disconnect during CLUE phase → auto-pass after timeout
    if (isSpymaster && this.state.phase === UndercoverAgentPhase.CLUE && this.state.currentTeam === teamId) {
      // The existing turn timer will handle the timeout, no additional action needed
      logger.info({
        event: 'undercover_agent:spymaster_disconnect_auto_pass',
        lobbyId: this.context.lobbyId,
        userId,
        teamId,
      });
    }
  }

  handlePlayerReconnect(userId: string): void {
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForPlayer(userId),
    );

    logger.info({
      event: 'undercover_agent:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
      turnNumber: this.state.turnNumber,
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
        score = 300;
      } else if (teamId === winner) {
        score = UA_WIN;
      } else if (teamId) {
        score = UA_LOSE;
      }

      // Spymaster clue efficiency bonus
      if (stats && teamId) {
        const team = this.state.teams[teamId];
        if (userId === team.spymasterId && stats.cluesGiven > 0) {
          const efficiency = Math.floor(stats.totalAgentsFromClues / stats.cluesGiven);
          score += UA_CLUE_EFFICIENCY * efficiency;
        }

        // Operative correct guess bonus
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
      if (teamId === winner) deltas.win = UA_WIN;
      if (teamId && teamId !== winner && winner !== 'draw') deltas.lose = UA_LOSE;
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
    entries.forEach((e, i) => { e.rank = i + 1; });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Mastermind — 3+ agents found from a single clue
    for (const [userId, stats] of this.playerStats) {
      if (stats.maxAgentsFromSingleClue >= 3) {
        const player = this.context.players.get(userId);
        awards.push({
          userId,
          title: 'Mastermind',
          description: `${stats.maxAgentsFromSingleClue} agents found from a single clue`,
          icon: '🧠',
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
        icon: '🎯',
      });
    }

    // Oops — triggered the assassin
    for (const [userId, stats] of this.playerStats) {
      if (stats.triggeredAssassin) {
        awards.push({
          userId,
          title: 'Oops',
          description: 'Triggered the assassin',
          icon: '💀',
        });
      }
    }

    // Speedrunner — won in ≤5 turns
    if (this.state.winner && this.state.winner !== 'draw' && this.state.turnNumber <= 5) {
      const winningTeam = this.state.teams[this.state.winner as 'red' | 'blue'];
      awards.push({
        userId: winningTeam.spymasterId,
        title: 'Speedrunner',
        description: `Won in ${this.state.turnNumber} turns`,
        icon: '⚡',
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
        icon: '📖',
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
      operativeIds: team.operativeIds,
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

  private logAction(action: string, data: Record<string, unknown>): void {
    this.state.actionLog.push({
      action,
      timestamp: Date.now(),
      data,
    });
  }

  private buildGameLog(): Record<string, unknown> {
    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      turnNumber: this.state.turnNumber,
      playerCount: this.context.players.size,
      winner: this.state.winner,
      winReason: this.state.winReason,
      actions: this.state.actionLog,
    };
  }

  // ─── Cleanup ────────────────────────────────────────────────

  cleanup(): void {
    // Clear disconnect timers
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
    this.turnTimer = null;
    super.cleanup();
  }
}

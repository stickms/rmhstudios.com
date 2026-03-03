/**
 * Phase 7 — Section 7.1: Sequence Sam Server Handler Tests
 *
 * Tests the SequenceSamGame server handler covering:
 * - State initialization and player setup
 * - Sequence generation (no consecutive duplicates, growth by 2 per round)
 * - Chaos round rotation mapping
 * - Input handling (correct/incorrect taps)
 * - End condition: game ends when ≤1 player completes sequence
 * - Scoring: correct taps + first-finish bonus
 * - State masking (sequence never leaked to client)
 * - Awards computation
 * - Game log generation
 * - Reconnection/disconnect handling
 * - Game settings integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SequenceSamGame } from '../../../server/rmhbox/minigames/sequence-sam';
import {
  ROTATION_MAP_CW, SS_GRID_SIZE, SS_CORRECT_TAP_POINTS,
  SS_FIRST_FINISH_BONUS, SS_TILES_ADDED_PER_ROUND,
} from '../../../lib/rmhbox/constants';
import { SSTapSchema } from '../../../lib/rmhbox/sequence-sam/schemas';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerActions,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

/** Track active games for cleanup. */
let activeGames: SequenceSamGame[] = [];

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new SequenceSamGame(ctx.context);
  activeGames.push(game);
  return { game, ...ctx };
}

/** Advance timers to reach the INPUT phase (past pattern display). */
function advanceToInputPhase(seqLen: number) {
  // Pattern display: seqLen * (500 + 200) = seqLen * 700ms
  // Plus final flash duration (500ms) and transition into input
  const displayTime = seqLen * 700 + 500 + 100;
  vi.advanceTimersByTime(displayTime);
}

/** Access private state for testing via type assertion. */
function getPrivateState(game: SequenceSamGame): {
  sequence: number[];
  rotatedSequence: number[] | null;
  isChaosRound: boolean;
  phase: string;
  activePlayers: string[];
  maxRounds: number;
  playerStates: Map<string, {
    correctTaps: number; firstFinishes: number; totalScore: number;
    hasCompletedSequence: boolean; hasFailed: boolean; currentInputIndex: number;
    roundScore: number;
  }>;
  currentRound: number;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (game as any).state;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Sequence Sam Server Handler (§7.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const game of activeGames) {
      try { game.cleanup(); } catch { /* ignore */ }
    }
    activeGames = [];
    vi.useRealTimers();
  });

  describe('Schema Validation (§7.1.3)', () => {
    it('should accept valid tap position 0', () => {
      expect(SSTapSchema.safeParse({ position: 0 }).success).toBe(true);
    });

    it('should accept valid tap position 8', () => {
      expect(SSTapSchema.safeParse({ position: 8 }).success).toBe(true);
    });

    it('should accept valid tap position 4 (center)', () => {
      expect(SSTapSchema.safeParse({ position: 4 }).success).toBe(true);
    });

    it('should reject position 9 (out of range)', () => {
      expect(SSTapSchema.safeParse({ position: 9 }).success).toBe(false);
    });

    it('should reject position -1 (negative)', () => {
      expect(SSTapSchema.safeParse({ position: -1 }).success).toBe(false);
    });

    it('should reject non-integer position 4.5', () => {
      expect(SSTapSchema.safeParse({ position: 4.5 }).success).toBe(false);
    });

    it('should reject missing position field', () => {
      expect(SSTapSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('Constants Validation (§7.1.2)', () => {
    it('should have ROTATION_MAP_CW mapping all 9 positions', () => {
      expect(Object.keys(ROTATION_MAP_CW).length).toBe(SS_GRID_SIZE);
    });

    it('should map center position (4) to itself in ROTATION_MAP_CW', () => {
      expect(ROTATION_MAP_CW[4]).toBe(4);
    });

    it('should map all positions to valid positions (0-8)', () => {
      for (let i = 0; i < SS_GRID_SIZE; i++) {
        expect(ROTATION_MAP_CW[i]).toBeGreaterThanOrEqual(0);
        expect(ROTATION_MAP_CW[i]).toBeLessThanOrEqual(8);
      }
    });

    it('should be a bijection (no duplicate output values)', () => {
      const outputs = Object.values(ROTATION_MAP_CW);
      const unique = new Set(outputs);
      expect(unique.size).toBe(SS_GRID_SIZE);
    });

    it('should add exactly 2 tiles per round', () => {
      expect(SS_TILES_ADDED_PER_ROUND).toBe(2);
    });
  });

  describe('State Initialization (§7.1.4.3)', () => {
    it('should create a game instance with 4 players', () => {
      const { game, context } = createGame();
      expect(game).toBeDefined();
      expect(context.players.size).toBe(4);
    });

    it('should initialize all players with zero scores', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      expect(state.activePlayers.length).toBe(4);
      for (const [, ps] of state.playerStates) {
        expect(ps.totalScore).toBe(0);
        expect(ps.correctTaps).toBe(0);
      }
    });

    it('should start at round 1', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      expect(state.currentRound).toBe(1);
    });
  });

  describe('Game Lifecycle (§7.1.4.5)', () => {
    it('should emit SS_ROUND_START when started', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const roundStart = findLastActionBroadcast(broadcastLog, 'SS_ROUND_START');
      expect(roundStart).toBeDefined();
      expect((roundStart!.data as Record<string, unknown>).round).toBe(1);
    });

    it('should emit SS_PATTERN_STEP events during pattern display', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      vi.advanceTimersByTime(2000);

      const steps = findActionBroadcasts(broadcastLog, 'SS_PATTERN_STEP');
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should emit SS_PATTERN_COMPLETE after pattern display', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const state = getPrivateState(game);
      advanceToInputPhase(state.sequence.length);

      const complete = findLastActionBroadcast(broadcastLog, 'SS_PATTERN_COMPLETE');
      expect(complete).toBeDefined();
    });
  });

  describe('Sequence Generation (§7.1.4.4)', () => {
    it('should generate initial sequence of correct starting length', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      expect(state.sequence.length).toBe(3); // SS_STARTING_LENGTH default
    });

    it('should not have consecutive duplicate positions', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      for (let i = 1; i < state.sequence.length; i++) {
        expect(state.sequence[i]).not.toBe(state.sequence[i - 1]);
      }
    });

    it('should extend sequence by 2 each round', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      const initialLength = state.sequence.length;

      // Complete round 1: advance to input phase, complete all players
      advanceToInputPhase(initialLength);

      // Tap correct sequence for all players
      for (const userId of state.activePlayers) {
        for (let i = 0; i < initialLength; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }

      // Advance through ROUND_RESULTS (2s) + TRANSITION (1s) to start round 2
      vi.advanceTimersByTime(4000);

      // Check round 2 sequence is 2 longer
      expect(state.currentRound).toBe(2);
      expect(state.sequence.length).toBe(initialLength + 2);
    });

    it('should generate sequence values within 0-8 range', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      for (const pos of state.sequence) {
        expect(pos).toBeGreaterThanOrEqual(0);
        expect(pos).toBeLessThanOrEqual(8);
      }
    });
  });

  describe('Chaos Rounds (§7.1.4.4)', () => {
    it('should set isChaosRound on chaos interval rounds', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { chaosInterval: 2 };
      const { game } = createGame(ctx);
      game.start();

      const state = getPrivateState(game);

      // Complete round 1
      advanceToInputPhase(state.sequence.length);
      for (const userId of state.activePlayers) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }
      vi.advanceTimersByTime(4000);

      // Now on round 2 which should be chaos (2 % 2 === 0)
      expect(state.currentRound).toBe(2);
      expect(state.isChaosRound).toBe(true);
      expect(state.rotatedSequence).not.toBeNull();
    });

    it('should compute rotated sequence using ROTATION_MAP_CW', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { chaosInterval: 2 };
      const { game } = createGame(ctx);
      game.start();

      const state = getPrivateState(game);
      // Advance to chaos round (round 2)
      advanceToInputPhase(state.sequence.length);
      for (const userId of state.activePlayers) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }
      vi.advanceTimersByTime(4000);

      if (state.isChaosRound && state.rotatedSequence) {
        for (let i = 0; i < state.sequence.length; i++) {
          expect(state.rotatedSequence[i]).toBe(ROTATION_MAP_CW[state.sequence[i]]);
        }
      }
    });

    it('should not enable chaos when enableChaosRounds is false', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { enableChaosRounds: false, chaosInterval: 1 };
      const { game } = createGame(ctx);
      game.start();

      const state = getPrivateState(game);
      expect(state.isChaosRound).toBe(false);
      expect(state.rotatedSequence).toBeNull();
    });

    it('should include rotationDegrees in SS_ROUND_START for chaos rounds', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { chaosInterval: 2 };
      const { game, broadcastLog } = createGame(ctx);
      game.start();

      const state = getPrivateState(game);
      // Complete round 1
      advanceToInputPhase(state.sequence.length);
      for (const userId of state.activePlayers) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }
      vi.advanceTimersByTime(4000);

      // Find the round 2 SS_ROUND_START
      const roundStarts = findActionBroadcasts(broadcastLog, 'SS_ROUND_START');
      const round2Start = roundStarts.find(
        (e) => (e.data as Record<string, unknown>).round === 2,
      );
      expect(round2Start).toBeDefined();
      expect((round2Start!.data as Record<string, unknown>).isChaosRound).toBe(true);
      expect((round2Start!.data as Record<string, unknown>).rotationDegrees).toBe(90);
    });
  });

  describe('Input Handling (§7.1.4.6)', () => {
    it('should advance input index on correct tap', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;

      advanceToInputPhase(state.sequence.length);

      game.handleInput(userId, 'SS_TAP', { position: state.sequence[0] });
      expect(state.playerStates.get(userId)!.currentInputIndex).toBe(1);
    });

    it('should mark player as failed on incorrect tap', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;

      advanceToInputPhase(state.sequence.length);

      const wrongPos = (state.sequence[0] + 1) % 9;
      game.handleInput(userId, 'SS_TAP', { position: wrongPos });
      expect(state.playerStates.get(userId)!.hasFailed).toBe(true);
    });

    it('should send SS_TAP_RESULT to tapper only on correct tap', () => {
      const { game, playerLog } = createGame();
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;

      advanceToInputPhase(state.sequence.length);

      game.handleInput(userId, 'SS_TAP', { position: state.sequence[0] });

      const tapResults = findPlayerActions(playerLog, userId, 'SS_TAP_RESULT');
      expect(tapResults.length).toBe(1);
      expect(tapResults[0].data.correct).toBe(true);
    });

    it('should broadcast SS_PLAYER_COMPLETE when sequence completed', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;

      advanceToInputPhase(state.sequence.length);

      for (let i = 0; i < state.sequence.length; i++) {
        game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
      }

      const completeEvents = findActionBroadcasts(broadcastLog, 'SS_PLAYER_COMPLETE');
      expect(completeEvents.length).toBeGreaterThan(0);
    });

    it('should reject input when not in INPUT phase', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;

      game.handleInput(userId, 'SS_TAP', { position: 0 });
      expect(state.playerStates.get(userId)!.currentInputIndex).toBe(0);
    });

    it('should end input phase early when all players complete or fail', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      for (const userId of state.activePlayers) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }

      const results = findActionBroadcasts(broadcastLog, 'SS_ROUND_RESULTS');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('End Condition — At Most 1 Complete', () => {
    it('should end game when 0 players complete the sequence', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // All players fail
      for (const userId of state.activePlayers) {
        const wrongPos = (state.sequence[0] + 1) % 9;
        game.handleInput(userId, 'SS_TAP', { position: wrongPos });
      }

      // Advance through round results to game over
      vi.advanceTimersByTime(5000);

      expect(state.phase).toBe('GAME_OVER');
    });

    it('should end game when exactly 1 player completes the sequence', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // Alice completes, others fail
      const alice = MOCK_USERS.alice.userId;
      for (let i = 0; i < state.sequence.length; i++) {
        game.handleInput(alice, 'SS_TAP', { position: state.sequence[i] });
      }
      for (const uid of state.activePlayers.filter((u) => u !== alice)) {
        const wrongPos = (state.sequence[0] + 1) % 9;
        game.handleInput(uid, 'SS_TAP', { position: wrongPos });
      }

      vi.advanceTimersByTime(5000);

      expect(state.phase).toBe('GAME_OVER');
    });

    it('should continue when 2+ players complete the sequence', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // All players complete
      for (const userId of state.activePlayers) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }

      vi.advanceTimersByTime(4000);

      // Should be in round 2 (game continues)
      expect(state.currentRound).toBe(2);
      expect(state.phase).not.toBe('GAME_OVER');
    });
  });

  describe('Scoring — Correct Taps + First Finish', () => {
    it('should award SS_CORRECT_TAP_POINTS per correct tap', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;

      advanceToInputPhase(state.sequence.length);

      game.handleInput(userId, 'SS_TAP', { position: state.sequence[0] });
      expect(state.playerStates.get(userId)!.totalScore).toBe(SS_CORRECT_TAP_POINTS);
    });

    it('should award first-finish bonus to first completer', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // Alice completes first
      for (let i = 0; i < state.sequence.length; i++) {
        game.handleInput(MOCK_USERS.alice.userId, 'SS_TAP', { position: state.sequence[i] });
      }

      const aliceScore = state.playerStates.get(MOCK_USERS.alice.userId)!.totalScore;
      const expectedScore = state.sequence.length * SS_CORRECT_TAP_POINTS + SS_FIRST_FINISH_BONUS;
      expect(aliceScore).toBe(expectedScore);
    });

    it('should NOT give first-finish bonus to second completer', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // Alice completes first
      for (let i = 0; i < state.sequence.length; i++) {
        game.handleInput(MOCK_USERS.alice.userId, 'SS_TAP', { position: state.sequence[i] });
      }

      // Bob completes second
      for (let i = 0; i < state.sequence.length; i++) {
        game.handleInput(MOCK_USERS.bob.userId, 'SS_TAP', { position: state.sequence[i] });
      }

      const bobScore = state.playerStates.get(MOCK_USERS.bob.userId)!.totalScore;
      const expectedScore = state.sequence.length * SS_CORRECT_TAP_POINTS;
      expect(bobScore).toBe(expectedScore);
    });

    it('should include player results in SS_ROUND_RESULTS', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      for (const userId of state.activePlayers) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }

      const results = findLastActionBroadcast(broadcastLog, 'SS_ROUND_RESULTS');
      expect(results).toBeDefined();
      const data = results!.data as Record<string, unknown>;
      expect(data.playerResults).toBeDefined();
      const playerResults = data.playerResults as Array<Record<string, unknown>>;
      expect(playerResults.length).toBe(4);
      for (const pr of playerResults) {
        expect(pr).toHaveProperty('userId');
        expect(pr).toHaveProperty('completed');
        expect(pr).toHaveProperty('correctTaps');
        expect(pr).toHaveProperty('roundScore');
      }
    });
  });

  describe('State Masking (§7.1.4.7 Security)', () => {
    it('should NEVER include raw sequence in player state', () => {
      const { game } = createGame();
      game.start();

      const playerState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(playerState).not.toHaveProperty('sequence');
      expect(playerState).not.toHaveProperty('rotatedSequence');
      expect(JSON.stringify(playerState)).not.toContain('"sequence"');
    });

    it('should NEVER include raw sequence in spectator state', () => {
      const { game } = createGame();
      game.start();

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState).not.toHaveProperty('sequence');
      expect(spectatorState).not.toHaveProperty('rotatedSequence');
    });

    it('should not reveal other players currentInputIndex to a player', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      game.handleInput(MOCK_USERS.bob.userId, 'SS_TAP', { position: state.sequence[0] });

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const otherPlayers = aliceState.otherPlayers as Array<Record<string, unknown>>;
      const bobInAliceView = otherPlayers.find((p) => p.userId === MOCK_USERS.bob.userId);
      expect(bobInAliceView).toBeDefined();
      expect(bobInAliceView).not.toHaveProperty('currentInputIndex');
    });

    it('should show spectator each player currentInputIndex', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      game.handleInput(MOCK_USERS.bob.userId, 'SS_TAP', { position: state.sequence[0] });

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      const allPlayers = spectatorState.allPlayers as Array<Record<string, unknown>>;
      const bobInSpectator = allPlayers.find((p) => p.userId === MOCK_USERS.bob.userId);
      expect(bobInSpectator).toBeDefined();
      expect(bobInSpectator!.currentInputIndex).toBe(1);
    });

    it('should not include raw sequence in any broadcast event', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      for (const entry of broadcastLog) {
        const data = entry.data as Record<string, unknown>;
        if (data.type !== 'SS_PATTERN_STEP') {
          expect(data).not.toHaveProperty('sequence');
        }
      }
    });
  });

  describe('Awards (§7.1.4.12)', () => {
    it('should generate Memory Master award for top scorer', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob]);
      const { game, completedResults } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // Alice completes, Bob fails
      for (let i = 0; i < state.sequence.length; i++) {
        game.handleInput(MOCK_USERS.alice.userId, 'SS_TAP', { position: state.sequence[i] });
      }
      const wrongPos = (state.sequence[0] + 1) % 9;
      game.handleInput(MOCK_USERS.bob.userId, 'SS_TAP', { position: wrongPos });

      vi.advanceTimersByTime(15000);

      expect(completedResults.length).toBe(1);
      const awards = completedResults[0].awards;
      const memoryMaster = awards.find((a) => a.title === 'Memory Master');
      expect(memoryMaster).toBeDefined();
      expect(memoryMaster!.userId).toBe(MOCK_USERS.alice.userId);
    });
  });

  describe('Game Log (§7.1.4.13)', () => {
    it('should build a complete game log', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob]);
      const { game, completedResults } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      for (let i = 0; i < state.sequence.length; i++) {
        game.handleInput(MOCK_USERS.alice.userId, 'SS_TAP', { position: state.sequence[i] });
      }
      const wrongPos = (state.sequence[0] + 1) % 9;
      game.handleInput(MOCK_USERS.bob.userId, 'SS_TAP', { position: wrongPos });

      vi.advanceTimersByTime(15000);

      expect(completedResults.length).toBe(1);
      const gameLog = completedResults[0].gameSpecificData.gameLog as Record<string, unknown>;
      expect(gameLog).toBeDefined();
      expect(gameLog).toHaveProperty('initialState');
      expect(gameLog).toHaveProperty('actions');
      expect(gameLog).toHaveProperty('finalResults');
      expect(gameLog).toHaveProperty('lobbyId');

      const actions = gameLog.actions as Array<Record<string, unknown>>;
      expect(actions.some((a) => a.type === 'round_start')).toBe(true);
    });
  });

  describe('Reconnection & Disconnect (§7.1.4.10-11)', () => {
    it('should send spectator state on JIP', () => {
      const { game, playerLog } = createGame();
      game.start();

      const jipUserId = 'user-jip-999';
      game.handlePlayerJoin(jipUserId);

      const snapshot = playerLog.find(
        (e) => e.userId === jipUserId && e.event === 'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();
    });
  });

  describe('Game Settings (§7.1.8)', () => {
    it('should use custom maxRounds setting', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { maxRounds: 5 };
      const { game } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);
      expect(state.maxRounds).toBe(5);
    });

    it('should use custom startingLength setting', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { startingLength: 5 };
      const { game } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);
      expect(state.sequence.length).toBe(5);
    });

    it('should fall back to defaults when no settings provided', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      expect(state.sequence.length).toBe(3); // SS_STARTING_LENGTH
    });
  });
});

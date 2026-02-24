/**
 * Phase 7 — Section 7.1: Sequence Sam Server Handler Tests
 *
 * Tests the SequenceSamGame server handler covering:
 * - State initialization and player setup
 * - Sequence generation (no consecutive duplicates, growth)
 * - Chaos round rotation mapping
 * - Input handling (correct/incorrect taps)
 * - Strike system and elimination
 * - Grace Rule (all fail → no eliminations)
 * - Scoring: survive, perfect, chaos, speed, winner, placement
 * - State masking (sequence never leaked to client)
 * - Awards computation
 * - Game log generation
 * - Reconnection/disconnect handling
 * - Game settings integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SequenceSamGame } from '../../../server/rmhbox/minigames/sequence-sam';
import { ROTATION_MAP_CW, SS_GRID_SIZE, SS_MAX_STRIKES } from '../../../lib/rmhbox/constants';
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

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new SequenceSamGame(ctx.context);
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
  playerStates: Map<string, { strikesRemaining: number; isEliminated: boolean; totalScore: number; hasCompletedSequence: boolean; hasFailed: boolean; currentInputIndex: number }>;
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
  });

  describe('State Initialization (§7.1.4.3)', () => {
    it('should create a game instance with 4 players', () => {
      const { game, context } = createGame();
      expect(game).toBeDefined();
      expect(context.players.size).toBe(4);
    });

    it('should initialize all players with correct strikes', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      expect(state.activePlayers.length).toBe(4);
      for (const [, ps] of state.playerStates) {
        expect(ps.strikesRemaining).toBe(SS_MAX_STRIKES);
        expect(ps.isEliminated).toBe(false);
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

      // Advance a bit to allow pattern steps
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

    it('should extend sequence by 1 each round', () => {
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

      // Check round 2 sequence is longer
      expect(state.currentRound).toBe(2);
      expect(state.sequence.length).toBe(initialLength + 1);
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
      // With chaosInterval=2, round 2 should be chaos
      const ctx = createMockContext();
      ctx.context.gameSettings = { chaosInterval: 2 }; // Every 2nd round
      const { game } = createGame(ctx);
      game.start();

      const state = getPrivateState(game);
      // Round 1 starts, need to advance to round 2 for chaos

      // Complete round 1
      advanceToInputPhase(state.sequence.length);
      for (const userId of state.activePlayers) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }
      // Advance through ROUND_RESULTS (2s) + TRANSITION (1s) to start round 2
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
      // Even at round 1, chaos shouldn't trigger
      expect(state.isChaosRound).toBe(false);
      expect(state.rotatedSequence).toBeNull();
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

      // Tap wrong position
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

      // Complete the entire sequence
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

      // Still in PATTERN_DISPLAY phase
      game.handleInput(userId, 'SS_TAP', { position: 0 });
      expect(state.playerStates.get(userId)!.currentInputIndex).toBe(0);
    });

    it('should reject input from eliminated player', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;
      state.playerStates.get(userId)!.isEliminated = true;

      advanceToInputPhase(state.sequence.length);

      game.handleInput(userId, 'SS_TAP', { position: state.sequence[0] });
      expect(state.playerStates.get(userId)!.currentInputIndex).toBe(0);
    });

    it('should use rotated sequence for validation in chaos round', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { chaosInterval: 2 };
      const { game } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);

      // Complete round 1 to advance to round 2 (chaos)
      advanceToInputPhase(state.sequence.length);
      for (const userId of state.activePlayers) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }
      // ROUND_RESULTS (2s) + TRANSITION (1s) = 3s to round 2 start
      vi.advanceTimersByTime(3100);

      expect(state.currentRound).toBe(2);
      expect(state.isChaosRound).toBe(true);
      expect(state.rotatedSequence).not.toBeNull();

      // Verify rotation map is applied correctly
      for (let i = 0; i < state.sequence.length; i++) {
        expect(state.rotatedSequence![i]).toBe(ROTATION_MAP_CW[state.sequence[i]]);
      }
    });

    it('should end input phase early when all players complete or fail', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // All players complete the sequence
      for (const userId of state.activePlayers) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
        }
      }

      // Should immediately show round results
      const results = findActionBroadcasts(broadcastLog, 'SS_ROUND_RESULTS');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Strike System & Elimination (§7.1.4.5)', () => {
    it('should deduct strike on round failure', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;

      advanceToInputPhase(state.sequence.length);

      // Alice fails
      const wrongPos = (state.sequence[0] + 1) % 9;
      game.handleInput(userId, 'SS_TAP', { position: wrongPos });

      // Others complete
      for (const uid of state.activePlayers.filter((u) => u !== userId)) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(uid, 'SS_TAP', { position: state.sequence[i] });
        }
      }

      // Advance through round results
      vi.advanceTimersByTime(5000);

      expect(state.playerStates.get(userId)!.strikesRemaining).toBe(SS_MAX_STRIKES - 1);
    });

    it('should eliminate player when strikes reach 0', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { maxStrikes: 1 }; // 1 strike = instant elimination
      const { game } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;

      advanceToInputPhase(state.sequence.length);

      // Alice fails
      const wrongPos = (state.sequence[0] + 1) % 9;
      game.handleInput(userId, 'SS_TAP', { position: wrongPos });

      // Others complete
      for (const uid of state.activePlayers.filter((u) => u !== userId)) {
        for (let i = 0; i < state.sequence.length; i++) {
          game.handleInput(uid, 'SS_TAP', { position: state.sequence[i] });
        }
      }

      vi.advanceTimersByTime(5000);

      expect(state.playerStates.get(userId)!.isEliminated).toBe(true);
      expect(state.eliminatedPlayers).toContain(userId);
    });

    it('should apply Grace Rule: no eliminations when all active players fail', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // ALL players fail (tap wrong position)
      for (const userId of state.activePlayers) {
        const wrongPos = (state.sequence[0] + 1) % 9;
        game.handleInput(userId, 'SS_TAP', { position: wrongPos });
      }

      vi.advanceTimersByTime(5000);

      // No one should be eliminated (grace rule)
      for (const [, ps] of state.playerStates) {
        expect(ps.isEliminated).toBe(false);
        expect(ps.strikesRemaining).toBe(SS_MAX_STRIKES); // No strikes deducted
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

      // Bob taps once
      game.handleInput(MOCK_USERS.bob.userId, 'SS_TAP', { position: state.sequence[0] });

      // Alice's view should not show Bob's input index
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

      // Check all broadcast events
      for (const entry of broadcastLog) {
        const json = JSON.stringify(entry.data);
        // Pattern steps contain single positions, but the full sequence array should never appear
        const data = entry.data as Record<string, unknown>;
        if (data.type !== 'SS_PATTERN_STEP') {
          expect(data).not.toHaveProperty('sequence');
        }
      }
    });
  });

  describe('Scoring (§7.1.4.5)', () => {
    it('should award survive points for completing sequence', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      const userId = MOCK_USERS.alice.userId;

      advanceToInputPhase(state.sequence.length);

      // Alice completes
      for (let i = 0; i < state.sequence.length; i++) {
        game.handleInput(userId, 'SS_TAP', { position: state.sequence[i] });
      }

      // Others fail
      for (const uid of state.activePlayers.filter((u) => u !== userId)) {
        const wrongPos = (state.sequence[0] + 1) % 9;
        game.handleInput(uid, 'SS_TAP', { position: wrongPos });
      }

      vi.advanceTimersByTime(5000);

      expect(state.playerStates.get(userId)!.totalScore).toBeGreaterThan(0);
    });

    it('should award winner bonus to last player standing', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob]);
      ctx.context.gameSettings = { maxStrikes: 1 };
      const { game } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // Alice completes
      for (let i = 0; i < state.sequence.length; i++) {
        game.handleInput(MOCK_USERS.alice.userId, 'SS_TAP', { position: state.sequence[i] });
      }

      // Bob fails (eliminated with 1 strike)
      const wrongPos = (state.sequence[0] + 1) % 9;
      game.handleInput(MOCK_USERS.bob.userId, 'SS_TAP', { position: wrongPos });

      // Advance to game over
      vi.advanceTimersByTime(10000);

      // Alice should have winner bonus (200 points)
      expect(state.playerStates.get(MOCK_USERS.alice.userId)!.totalScore).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Awards (§7.1.4.12)', () => {
    it('should generate Memory Master award for winner', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob]);
      ctx.context.gameSettings = { maxStrikes: 1 };
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
      ctx.context.gameSettings = { maxStrikes: 1 };
      const { game, completedResults } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);

      advanceToInputPhase(state.sequence.length);

      // Play one round
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

    it('should reconnect eliminated player as spectator', () => {
      const { game, playerLog } = createGame();
      game.start();
      const state = getPrivateState(game);

      // Eliminate Alice
      state.playerStates.get(MOCK_USERS.alice.userId)!.isEliminated = true;

      game.handlePlayerReconnect(MOCK_USERS.alice.userId);

      const snapshot = playerLog.find(
        (e) => e.userId === MOCK_USERS.alice.userId && e.event === 'rmhbox:game:state_snapshot',
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

    it('should use custom maxStrikes setting', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { maxStrikes: 5 };
      const { game } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);
      for (const [, ps] of state.playerStates) {
        expect(ps.strikesRemaining).toBe(5);
      }
    });

    it('should fall back to defaults when no settings provided', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      expect(state.sequence.length).toBe(3); // SS_STARTING_LENGTH
    });
  });
});

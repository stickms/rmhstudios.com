/**
 * Phase 7 — Section 7.2: Human Keyboard Server Handler Tests
 *
 * Tests the HumanKeyboardGame server handler covering:
 * - Key assignment (26 letters distributed, no duplicates)
 * - Typing phase and cursor advancement
 * - Input handling (correct, wrong key, wrong player)
 * - Cursor lock penalty
 * - Rate limiting
 * - Space auto-advance
 * - Reshuffle mechanism
 * - Scoring computation (team multiplier, MVP, completion bonus)
 * - State masking (player sees only own keys, spectator sees all)
 * - Awards computation
 * - Game log generation
 * - Game settings integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HumanKeyboardGame } from '../../../server/rmhbox/minigames/human-keyboard';
import { HKPressSchema } from '../../../lib/rmhbox/human-keyboard/schemas';
import {
  HK_SENTENCE_REVEAL_SECONDS,
  HK_WRONG_KEY_PENALTY_MS,
  HK_TYPING_DURATION_SECONDS,
  HK_SPACE_DELAY_MS,
} from '../../../lib/rmhbox/constants';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerActions,
  type MockContextData,
} from './setup';

// ─── Mock the data loader ────────────────────────────────────────

vi.mock('../../../lib/rmhbox/human-keyboard/data-loader', () => {
  const testSentences = [
    {
      id: 'test-1',
      text: 'Hello world',
      normalizedText: 'hello world',
      letterCount: 10,
      difficulty: 'easy' as const,
      category: 'test',
    },
    {
      id: 'test-2',
      text: 'The quick brown fox',
      normalizedText: 'the quick brown fox',
      letterCount: 16,
      difficulty: 'medium' as const,
      category: 'test',
    },
  ];
  return {
    loadSentences: () => testSentences,
    selectSentenceForGame: () => testSentences[0], // Always return "hello world"
  };
});

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext([
    MOCK_USERS.alice,
    MOCK_USERS.bob,
    MOCK_USERS.charlie,
  ]);
  const game = new HumanKeyboardGame(ctx.context);
  return { game, ...ctx };
}

/** Access private state for testing via type assertion. */
function getPrivateState(game: HumanKeyboardGame): {
  targetSentence: { text: string; normalizedText: string; letterCount: number };
  normalizedText: string;
  cursorPosition: number;
  displayCursorPosition: number;
  phase: string;
  isComplete: boolean;
  keyAssignments: Map<string, string[]>;
  letterToPlayer: Map<string, string>;
  lockUntil: number | null;
  playerStats: Map<string, { correctPresses: number; wrongPresses: number; wrongPlayerPresses: number; accuracy: number; totalScore: number; currentKeys: string[] }>;
  reshuffleCount: number;
  nextReshuffleAt: number;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (game as any).state;
}

function advanceToTypingPhase() {
  vi.advanceTimersByTime(HK_SENTENCE_REVEAL_SECONDS * 1000 + 100);
}

/**
 * Types the full sentence by iterating character by character.
 * Spaces are auto-advanced, only letter keys are sent as input.
 */
function typeFullSentence(game: HumanKeyboardGame, state: ReturnType<typeof getPrivateState>) {
  const text = state.normalizedText;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') {
      // Space is auto-advanced synchronously; advance timer for broadcast
      vi.advanceTimersByTime(HK_SPACE_DELAY_MS + 50);
      continue;
    }
    const owner = state.letterToPlayer.get(ch);
    if (owner) {
      game.handleInput(owner, 'HK_PRESS', { key: ch });
    }
    vi.advanceTimersByTime(50);
  }
  vi.advanceTimersByTime(500); // Buffer for final space handling
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Human Keyboard Server Handler (§7.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Schema Validation (§7.2.4)', () => {
    it('should accept valid lowercase letter', () => {
      expect(HKPressSchema.safeParse({ key: 'a' }).success).toBe(true);
    });

    it('should accept valid lowercase letter z', () => {
      expect(HKPressSchema.safeParse({ key: 'z' }).success).toBe(true);
    });

    it('should reject uppercase letter', () => {
      expect(HKPressSchema.safeParse({ key: 'A' }).success).toBe(false);
    });

    it('should reject number', () => {
      expect(HKPressSchema.safeParse({ key: '1' }).success).toBe(false);
    });

    it('should reject multi-character string', () => {
      expect(HKPressSchema.safeParse({ key: 'ab' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(HKPressSchema.safeParse({ key: '' }).success).toBe(false);
    });

    it('should reject missing key', () => {
      expect(HKPressSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('Key Assignment (§7.2.6.3)', () => {
    it('should distribute all 26 letters across players', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      const allKeys = new Set<string>();
      for (const [, keys] of state.keyAssignments) {
        for (const key of keys) {
          allKeys.add(key);
        }
      }
      expect(allKeys.size).toBe(26);
    });

    it('should have no duplicate letter assignments', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      const allKeys: string[] = [];
      for (const [, keys] of state.keyAssignments) {
        allKeys.push(...keys);
      }
      expect(new Set(allKeys).size).toBe(allKeys.length);
    });

    it('should distribute evenly across 3 players (~8-9 each)', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      for (const [, keys] of state.keyAssignments) {
        expect(keys.length).toBeGreaterThanOrEqual(8);
        expect(keys.length).toBeLessThanOrEqual(9);
      }
    });

    it('should sort each players keys alphabetically', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      for (const [, keys] of state.keyAssignments) {
        const sorted = [...keys].sort();
        expect(keys).toEqual(sorted);
      }
    });

    it('should build reverse lookup letterToPlayer correctly', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      for (const [userId, keys] of state.keyAssignments) {
        for (const key of keys) {
          expect(state.letterToPlayer.get(key)).toBe(userId);
        }
      }
    });

    it('should distribute across 5 players (~5 each)', () => {
      const ctx = createMockContext([
        MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie,
        MOCK_USERS.diana, MOCK_USERS.eve,
      ]);
      const { game } = createGame(ctx);
      game.start();
      const state = getPrivateState(game);

      for (const [, keys] of state.keyAssignments) {
        expect(keys.length).toBeGreaterThanOrEqual(5);
        expect(keys.length).toBeLessThanOrEqual(6);
      }

      // Total should be 26
      let total = 0;
      for (const [, keys] of state.keyAssignments) {
        total += keys.length;
      }
      expect(total).toBe(26);
    });
  });

  describe('State Initialization (§7.2.6.4)', () => {
    it('should emit HK_SENTENCE_REVEAL on start', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const reveal = findLastActionBroadcast(broadcastLog, 'HK_SENTENCE_REVEAL');
      expect(reveal).toBeDefined();
      expect((reveal!.data as Record<string, unknown>).sentence).toBe('Hello world');
    });

    it('should send HK_KEY_ASSIGNMENT to each player individually', () => {
      const { game, playerLog } = createGame();
      game.start();

      const aliceAssignment = findPlayerActions(playerLog, MOCK_USERS.alice.userId, 'HK_KEY_ASSIGNMENT');
      expect(aliceAssignment.length).toBe(1);
      expect(aliceAssignment[0].data.myKeys).toBeDefined();
      expect(Array.isArray(aliceAssignment[0].data.myKeys)).toBe(true);
    });

    it('should start in SENTENCE_REVEAL phase', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);
      expect(state.phase).toBe('SENTENCE_REVEAL');
    });

    it('should transition to TYPING after reveal duration', () => {
      const { game } = createGame();
      game.start();

      advanceToTypingPhase();

      const state = getPrivateState(game);
      expect(state.phase).toBe('TYPING');
    });
  });

  describe('Input Handling (§7.2.6.6)', () => {
    it('should advance cursor on correct key by correct player', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      // sentence is "hello world", first non-space letter is 'h'
      const expectedLetter = state.normalizedText[state.displayCursorPosition];
      const owner = state.letterToPlayer.get(expectedLetter)!;

      game.handleInput(owner, 'HK_PRESS', { key: expectedLetter });

      const correctEvents = findActionBroadcasts(broadcastLog, 'HK_KEY_CORRECT');
      expect(correctEvents.length).toBeGreaterThan(0);
      expect(state.cursorPosition).toBe(1);
    });

    it('should reject correct key by wrong player without penalty', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      const expectedLetter = state.normalizedText[state.displayCursorPosition];
      const owner = state.letterToPlayer.get(expectedLetter)!;

      // Find a player who is NOT the owner
      const wrongPlayer = Array.from(state.keyAssignments.keys()).find((uid) => uid !== owner)!;

      game.handleInput(wrongPlayer, 'HK_PRESS', { key: expectedLetter });

      // Should send HK_KEY_WRONG_PLAYER to the wrong player
      const wrongPlayerEvents = findPlayerActions(playerLog, wrongPlayer, 'HK_KEY_WRONG_PLAYER');
      expect(wrongPlayerEvents.length).toBe(1);

      // Cursor should NOT advance
      expect(state.cursorPosition).toBe(0);

      // No lock should be applied
      expect(state.lockUntil).toBeNull();
    });

    it('should lock cursor on wrong key press', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      const expectedLetter = state.normalizedText[state.displayCursorPosition];
      // Pick a letter that's NOT the expected one
      const wrongLetter = expectedLetter === 'a' ? 'b' : 'a';
      const anyPlayer = Array.from(state.keyAssignments.keys())[0];

      game.handleInput(anyPlayer, 'HK_PRESS', { key: wrongLetter });

      const lockEvents = findActionBroadcasts(broadcastLog, 'HK_CURSOR_LOCKED');
      expect(lockEvents.length).toBe(1);
      expect(state.lockUntil).not.toBeNull();
    });

    it('should reject input during cursor lock', () => {
      const { game } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      // Set lock
      state.lockUntil = Date.now() + 10000;

      const expectedLetter = state.normalizedText[state.displayCursorPosition];
      const owner = state.letterToPlayer.get(expectedLetter)!;

      game.handleInput(owner, 'HK_PRESS', { key: expectedLetter });

      // Cursor should NOT advance
      expect(state.cursorPosition).toBe(0);
    });

    it('should reject input when not in TYPING phase', () => {
      const { game } = createGame();
      game.start();
      const state = getPrivateState(game);

      // Still in SENTENCE_REVEAL
      game.handleInput(MOCK_USERS.alice.userId, 'HK_PRESS', { key: 'h' });
      expect(state.cursorPosition).toBe(0);
    });

    it('should enforce rate limit', () => {
      const { game } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      const anyPlayer = Array.from(state.keyAssignments.keys())[0];

      // Send 6 presses rapidly (limit is 5 per second)
      for (let i = 0; i < 6; i++) {
        game.handleInput(anyPlayer, 'HK_PRESS', { key: 'z' });
      }

      // The 6th should be silently dropped (rate limited)
      const stats = state.playerStats.get(anyPlayer)!;
      // Wrong key count should be at most 5 (the rate limit)
      expect(stats.wrongPresses).toBeLessThanOrEqual(5);
    });
  });

  describe('Space Auto-Advance (§7.2.6.5)', () => {
    it('should auto-advance past spaces', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      // Type all of "hello" to reach the space
      // normalizedText is "hello world", chars 0-4 are h,e,l,l,o
      for (let i = 0; i < 5; i++) {
        const letter = state.normalizedText[i];
        const owner = state.letterToPlayer.get(letter);
        if (owner) {
          game.handleInput(owner, 'HK_PRESS', { key: letter });
        }
      }

      // After typing 'o' at index 4, displayCursorPosition should advance past space at index 5
      // The HK_SPACE_AUTO broadcast is scheduled after HK_SPACE_DELAY_MS
      vi.advanceTimersByTime(HK_SPACE_DELAY_MS + 100);

      const spaceEvents = findActionBroadcasts(broadcastLog, 'HK_SPACE_AUTO');
      expect(spaceEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Reshuffle (§7.2.6.5)', () => {
    it('should reshuffle after interval', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      ctx.context.gameSettings = { reshuffleInterval: 2 }; // 2 second interval for test
      const { game, broadcastLog } = createGame(ctx);
      game.start();
      advanceToTypingPhase();

      // Advance past reshuffle interval (2s)
      vi.advanceTimersByTime(3000);

      const reshuffleEvents = findActionBroadcasts(broadcastLog, 'HK_RESHUFFLE');
      expect(reshuffleEvents.length).toBeGreaterThan(0);
    });

    it('should send warning before reshuffle', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      ctx.context.gameSettings = { reshuffleInterval: 5 };
      const { game, broadcastLog } = createGame(ctx);
      game.start();
      advanceToTypingPhase();

      // Warning should appear at reshuffleInterval - 3s = 2s
      vi.advanceTimersByTime(2500);

      const warnings = findActionBroadcasts(broadcastLog, 'HK_RESHUFFLE_WARNING');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should still have all 26 letters after reshuffle', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      ctx.context.gameSettings = { reshuffleInterval: 2 };
      const { game } = createGame(ctx);
      game.start();
      advanceToTypingPhase();

      vi.advanceTimersByTime(3000); // Past reshuffle

      const state = getPrivateState(game);
      const allKeys = new Set<string>();
      for (const [, keys] of state.keyAssignments) {
        for (const key of keys) {
          allKeys.add(key);
        }
      }
      expect(allKeys.size).toBe(26);
    });

    it('should NOT reshuffle when enableReshuffle is false', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      ctx.context.gameSettings = { enableReshuffle: false };
      const { game, broadcastLog } = createGame(ctx);
      game.start();
      advanceToTypingPhase();

      vi.advanceTimersByTime(20000); // Well past any interval

      const reshuffleEvents = findActionBroadcasts(broadcastLog, 'HK_RESHUFFLE');
      expect(reshuffleEvents.length).toBe(0);
    });
  });

  describe('Completion (§7.2.6.5)', () => {
    it('should emit HK_COMPLETE when sentence is fully typed', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      typeFullSentence(game, state);

      expect(state.isComplete).toBe(true);
      const completeEvents = findActionBroadcasts(broadcastLog, 'HK_COMPLETE');
      expect(completeEvents.length).toBeGreaterThan(0);
    });
  });

  describe('State Masking (§7.2.6.8 Security)', () => {
    it('should send only own keys to each player', () => {
      const { game } = createGame();
      game.start();
      advanceToTypingPhase();

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(aliceState.myKeys).toBeDefined();
      expect(Array.isArray(aliceState.myKeys)).toBe(true);

      // Should NOT have allKeyAssignments
      expect(aliceState).not.toHaveProperty('allKeyAssignments');
    });

    it('should show spectator ALL key assignments', () => {
      const { game } = createGame();
      game.start();
      advanceToTypingPhase();

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState.allKeyAssignments).toBeDefined();
      const assignments = spectatorState.allKeyAssignments as Record<string, string[]>;
      expect(Object.keys(assignments).length).toBe(3); // 3 players
    });

    it('should show spectator all player stats', () => {
      const { game } = createGame();
      game.start();
      advanceToTypingPhase();

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState.allStats).toBeDefined();
    });

    it('should NOT show other players stats to a player during typing', () => {
      const { game } = createGame();
      game.start();
      advanceToTypingPhase();

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(aliceState).not.toHaveProperty('allStats');
      expect(aliceState).not.toHaveProperty('allKeyAssignments');
    });

    it('should indicate isMyTurn correctly for the player who owns the next expected letter', () => {
      const { game } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      const expectedLetter = state.normalizedText[state.displayCursorPosition];
      const owner = state.letterToPlayer.get(expectedLetter)!;

      const ownerState = game.getStateForPlayer(owner) as Record<string, unknown>;
      expect(ownerState.isMyTurn).toBe(true);

      // Other player should NOT be their turn
      const otherPlayer = Array.from(state.keyAssignments.keys()).find((uid) => uid !== owner)!;
      const otherState = game.getStateForPlayer(otherPlayer) as Record<string, unknown>;
      expect(otherState.isMyTurn).toBe(false);
    });
  });

  describe('Scoring (§7.2.6.7)', () => {
    it('should complete game and produce results', () => {
      const { game, completedResults } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      typeFullSentence(game, state);

      // Advance through: endTypingPhase (5s after complete) + endGame (5s after results)
      vi.advanceTimersByTime(15000);

      expect(completedResults.length).toBe(1);
      expect(completedResults[0].rankings.length).toBe(3);
    });

    it('should use wrong key lock duration from settings', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      ctx.context.gameSettings = { wrongKeyLockMs: 0 };
      const { game } = createGame(ctx);
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      const anyPlayer = Array.from(state.keyAssignments.keys())[0];
      game.handleInput(anyPlayer, 'HK_PRESS', { key: 'z' });

      // With 0ms lock, cursor should NOT be locked
      expect(state.lockUntil).toBeNull();
    });
  });

  describe('Awards (§7.2.6.13)', () => {
    it('should award Team Spirit to all when sentence is completed', () => {
      const { game, completedResults } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      typeFullSentence(game, state);

      // Advance through: endTypingPhase (5s after complete) + endGame (5s after results)
      vi.advanceTimersByTime(15000);

      expect(completedResults.length).toBe(1);
      const teamSpirit = completedResults[0].awards.filter((a) => a.title === 'Team Spirit');
      // Should be awarded to all 3 players
      expect(teamSpirit.length).toBe(3);
    });

    it('should award MVP Typist to player with most correct presses', () => {
      const { game, completedResults } = createGame();
      game.start();
      advanceToTypingPhase();
      const state = getPrivateState(game);

      typeFullSentence(game, state);
      vi.advanceTimersByTime(15000);

      expect(completedResults.length).toBe(1);
      const mvp = completedResults[0].awards.find((a) => a.title === 'MVP Typist');
      expect(mvp).toBeDefined();
    });
  });

  describe('Game Log (§7.2.6.14)', () => {
    it('should build complete game log with initialState', () => {
      const { game, completedResults } = createGame();
      game.start();
      advanceToTypingPhase();

      // Let it time out
      vi.advanceTimersByTime(HK_TYPING_DURATION_SECONDS * 1000 + 30000);

      expect(completedResults.length).toBe(1);
      const gameLog = completedResults[0].gameSpecificData.gameLog as Record<string, unknown>;
      expect(gameLog).toBeDefined();
      expect(gameLog).toHaveProperty('initialState');

      const initialState = gameLog.initialState as Record<string, unknown>;
      expect(initialState).toHaveProperty('sentence');
      expect(initialState).toHaveProperty('initialKeyAssignments');
    });
  });

  describe('Game Settings (§7.2.10)', () => {
    it('should use custom typingDuration setting', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      ctx.context.gameSettings = { typingDuration: 30 };
      const { game, broadcastLog } = createGame(ctx);
      game.start();

      const reveal = findLastActionBroadcast(broadcastLog, 'HK_SENTENCE_REVEAL');
      expect(reveal).toBeDefined();
      expect((reveal!.data as Record<string, unknown>).typingDurationSeconds).toBe(30);
    });

    it('should fall back to defaults when no settings provided', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const reveal = findLastActionBroadcast(broadcastLog, 'HK_SENTENCE_REVEAL');
      expect(reveal).toBeDefined();
      expect((reveal!.data as Record<string, unknown>).typingDurationSeconds).toBe(HK_TYPING_DURATION_SECONDS);
    });
  });

  describe('Reconnection & Disconnect (§7.2.6.10-12)', () => {
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

    it('should send player state on reconnect', () => {
      const { game } = createGame();
      game.start();
      advanceToTypingPhase();

      // handlePlayerReconnect just logs; state delivery is via buildReconnectionSnapshot
      game.handlePlayerReconnect(MOCK_USERS.alice.userId);

      // buildReconnectionSnapshot returns player state
      const snapshot = game.getStateForPlayer(MOCK_USERS.alice.userId);
      expect(snapshot).toBeDefined();
    });
  });
});

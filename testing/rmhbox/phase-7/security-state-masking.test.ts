/**
 * Phase 7 — Security State Masking Tests (SS + HK)
 *
 * Dedicated security tests verifying that players cannot
 * see other players' hidden data.
 *
 * SS: Players must NOT see the actual sequence during INPUT phase
 * HK: Players must NOT see other players' assigned keys
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SequenceSamGame } from '../../../server/rmhbox/minigames/sequence-sam';
import { HumanKeyboardGame } from '../../../server/rmhbox/minigames/human-keyboard';
import {
  MOCK_USERS,
  createMockContext,
} from './setup';

// Mock data loader
vi.mock('../../../lib/rmhbox/human-keyboard/data-loader', () => ({
  loadSentences: () => [{
    id: 'test-1',
    text: 'Hello world',
    normalizedText: 'hello world',
    letterCount: 10,
    difficulty: 'easy' as const,
    category: 'test',
  }],
  selectSentenceForGame: () => ({
    id: 'test-1',
    text: 'Hello world',
    normalizedText: 'hello world',
    letterCount: 10,
    difficulty: 'easy' as const,
    category: 'test',
  }),
}));

describe('Security State Masking (Phase 7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Sequence Sam — Sequence Never Leaked', () => {
    it('should not leak sequence in getStateForPlayer during PATTERN_DISPLAY', () => {
      const ctx = createMockContext();
      const game = new SequenceSamGame(ctx.context);
      game.start();

      for (const [userId] of ctx.context.players) {
        const state = game.getStateForPlayer(userId) as Record<string, unknown>;
        const json = JSON.stringify(state);
        expect(json).not.toContain('"sequence"');
        expect(json).not.toContain('"rotatedSequence"');
        expect(state).not.toHaveProperty('sequence');
        expect(state).not.toHaveProperty('rotatedSequence');
      }
    });

    it('should not leak sequence in getStateForPlayer during INPUT', () => {
      const ctx = createMockContext();
      const game = new SequenceSamGame(ctx.context);
      game.start();

      // Advance to INPUT phase
      vi.advanceTimersByTime(10000);

      for (const [userId] of ctx.context.players) {
        const state = game.getStateForPlayer(userId) as Record<string, unknown>;
        expect(state).not.toHaveProperty('sequence');
        expect(state).not.toHaveProperty('rotatedSequence');
      }
    });

    it('should not leak sequence in getStateForSpectator', () => {
      const ctx = createMockContext();
      const game = new SequenceSamGame(ctx.context);
      game.start();

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState).not.toHaveProperty('sequence');
      expect(spectatorState).not.toHaveProperty('rotatedSequence');
    });

    it('should not leak other players input indices to a player', () => {
      const ctx = createMockContext();
      const game = new SequenceSamGame(ctx.context);
      game.start();

      vi.advanceTimersByTime(10000);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const otherPlayers = aliceState.otherPlayers as Array<Record<string, unknown>>;

      for (const other of otherPlayers) {
        // Should NOT have currentInputIndex (that reveals how far they got)
        expect(other).not.toHaveProperty('currentInputIndex');
      }
    });

    it('spectator SHOULD see all players input indices', () => {
      const ctx = createMockContext();
      const game = new SequenceSamGame(ctx.context);
      game.start();

      vi.advanceTimersByTime(10000);

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      const allPlayers = spectatorState.allPlayers as Array<Record<string, unknown>>;

      for (const player of allPlayers) {
        expect(player).toHaveProperty('currentInputIndex');
      }
    });
  });

  describe('Human Keyboard — Key Assignment Masking', () => {
    it('should not leak other players keys to a player', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      const game = new HumanKeyboardGame(ctx.context);
      game.start();
      vi.advanceTimersByTime(5000);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;

      // Alice should see her own keys
      expect(aliceState.myKeys).toBeDefined();
      expect(Array.isArray(aliceState.myKeys)).toBe(true);
      expect((aliceState.myKeys as string[]).length).toBeGreaterThan(0);

      // Alice should NOT see all key assignments
      expect(aliceState).not.toHaveProperty('allKeyAssignments');

      // Verify Alice's keys don't include ALL 26 letters
      expect((aliceState.myKeys as string[]).length).toBeLessThan(26);
    });

    it('should show spectator all key assignments', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      const game = new HumanKeyboardGame(ctx.context);
      game.start();
      vi.advanceTimersByTime(5000);

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState.allKeyAssignments).toBeDefined();

      const assignments = spectatorState.allKeyAssignments as Record<string, string[]>;
      expect(Object.keys(assignments).length).toBe(3);

      // All 26 letters should be in total
      const allKeys = new Set<string>();
      for (const keys of Object.values(assignments)) {
        for (const key of keys) {
          allKeys.add(key);
        }
      }
      expect(allKeys.size).toBe(26);
    });

    it('should show spectator the next expected letter owner', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      const game = new HumanKeyboardGame(ctx.context);
      game.start();
      vi.advanceTimersByTime(5000);

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState.nextExpectedLetter).toBeDefined();
      expect(spectatorState.nextOwnerUserId).toBeDefined();
    });

    it('Player A cannot see Player B hidden data', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      const game = new HumanKeyboardGame(ctx.context);
      game.start();
      vi.advanceTimersByTime(5000);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;

      // Alice's view should NOT contain Bob's keys
      const aliceKeys = aliceState.myKeys as string[];
      const bobKeys = bobState.myKeys as string[];

      // Keys should be disjoint
      const aliceKeySet = new Set(aliceKeys);
      for (const key of bobKeys) {
        expect(aliceKeySet.has(key)).toBe(false);
      }

      // Neither should have the other's full assignment
      expect(aliceState).not.toHaveProperty('allKeyAssignments');
      expect(bobState).not.toHaveProperty('allKeyAssignments');
    });
  });
});

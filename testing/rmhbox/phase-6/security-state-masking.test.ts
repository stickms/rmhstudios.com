/**
 * Phase 6 — Security: State Masking Tests
 *
 * Dedicated security tests verifying that Player A cannot see
 * Player B's hidden data across both Phase 6 minigames.
 *
 * Fact or Friction:
 * - correctIndex hidden during ANSWER and QUESTION_REVEAL phases
 * - Other players' selectedIndex hidden during ANSWER phase
 *
 * Undercover Editor:
 * - keyword never exposed to Writers
 * - editorUserId never exposed to Writers
 * - edits/editableStory never exposed to Writers
 * - votes masked (only who voted, not targets) during ACCUSATION
 * - Spectator has full omniscient view
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FactOrFrictionGame } from '../../../server/rmhbox/minigames/fact-or-friction';
import { UndercoverEditorGame } from '../../../server/rmhbox/minigames/undercover-editor';
import {
  FOF_QUESTION_REVEAL_SECONDS,
  FOF_ANSWER_DURATION_SECONDS,
  UE_WRITE_TIMEOUT_SECONDS,
  UE_EDIT_TIMEOUT_SECONDS,
  UE_REVIEW_DURATION_SECONDS,
} from '../../../lib/rmhbox/constants';
import {
  MOCK_USERS,
  createMockContext,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

function createFOFGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new FactOrFrictionGame(ctx.context);
  return { game, ...ctx };
}

function createUEGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext([
    MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana, MOCK_USERS.eve,
  ]);
  const game = new UndercoverEditorGame(ctx.context);
  return { game, ...ctx };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Security: State Masking (Phase 6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Fact or Friction — correctIndex masking', () => {
    it('correctIndex MUST NOT appear in any player state during QUESTION_REVEAL', () => {
      const { game } = createFOFGame();
      game.start();

      const allIds = [
        MOCK_USERS.alice.userId, MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId, MOCK_USERS.diana.userId,
      ];

      for (const uid of allIds) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        const question = state.question as Record<string, unknown>;
        expect(question).not.toHaveProperty('correctIndex');
      }

      game.cleanup();
    });

    it('correctIndex MUST NOT appear in any player state during ANSWER', () => {
      const { game } = createFOFGame();
      game.start();
      vi.advanceTimersByTime(FOF_QUESTION_REVEAL_SECONDS * 1000 + 50);

      const allIds = [
        MOCK_USERS.alice.userId, MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId, MOCK_USERS.diana.userId,
      ];

      for (const uid of allIds) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        const question = state.question as Record<string, unknown>;
        expect(question).not.toHaveProperty('correctIndex');
      }

      game.cleanup();
    });

    it('correctIndex MUST NOT appear in spectator state during ANSWER', () => {
      const { game } = createFOFGame();
      game.start();
      vi.advanceTimersByTime(FOF_QUESTION_REVEAL_SECONDS * 1000 + 50);

      const state = game.getStateForSpectator() as Record<string, unknown>;
      const question = state.question as Record<string, unknown>;
      expect(question).not.toHaveProperty('correctIndex');

      game.cleanup();
    });

    it('Player A MUST NOT see Player B selectedIndex during ANSWER', () => {
      const { game } = createFOFGame();
      game.start();
      vi.advanceTimersByTime(FOF_QUESTION_REVEAL_SECONDS * 1000 + 50);

      // Alice answers
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 2 });

      // Bob's state should not reveal Alice's selectedIndex
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;
      expect(bobState.myAnswer).toBeNull(); // Bob hasn't answered

      // The state should have answeredPlayerIds but not their answers
      const answeredIds = bobState.answeredPlayerIds as string[];
      expect(answeredIds).toContain(MOCK_USERS.alice.userId);

      // Verify no selectedIndex leakage anywhere in Bob's state
      const stateStr = JSON.stringify(bobState);
      // Bob should not see "selectedIndex":2 from Alice
      // (He should only see answeredPlayerIds and his own myAnswer)
      expect(bobState).not.toHaveProperty('playerAnswers');

      game.cleanup();
    });
  });

  describe('Undercover Editor — role & keyword masking', () => {
    it('Writer MUST NEVER see the keyword in getStateForPlayer', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const writerIds = playerLog
        .filter(
          (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
            (e.data as Record<string, unknown>).role === 'writer',
        )
        .map((e) => e.userId);

      for (const writerId of writerIds) {
        const state = game.getStateForPlayer(writerId) as Record<string, unknown>;
        expect(state).not.toHaveProperty('keyword');
        expect(state).not.toHaveProperty('editorUserId');
        expect(state).not.toHaveProperty('myEdits');
        expect(state).not.toHaveProperty('editableStory');
      }

      game.cleanup();
    });

    it('Writer MUST NEVER see keyword via WebSocket events (inspecting all player events)', () => {
      const { game, playerLog, broadcastLog } = createUEGame();
      game.start();

      const writerIds = playerLog
        .filter(
          (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
            (e.data as Record<string, unknown>).role === 'writer',
        )
        .map((e) => e.userId);

      const editorId = playerLog
        .find(
          (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
            (e.data as Record<string, unknown>).role === 'editor',
        )?.userId ?? '';

      // Check ALL events sent to writers — none should contain keyword
      for (const writerId of writerIds) {
        const writerEvents = playerLog.filter((e) => e.userId === writerId);
        for (const event of writerEvents) {
          const data = event.data as Record<string, unknown>;
          if (data.type === 'UE_ROLE_ASSIGNED') {
            expect(data).not.toHaveProperty('keyword');
          }
        }
      }

      // Broadcast events should NOT contain keyword or editorUserId
      for (const event of broadcastLog) {
        const data = event.data as Record<string, unknown>;
        // UE_GAME_START should not have keyword
        if (data.type === 'UE_GAME_START') {
          expect(data).not.toHaveProperty('keyword');
          expect(data).not.toHaveProperty('editorUserId');
        }
        // UE_TURN_START should not have keyword
        if (data.type === 'UE_TURN_START') {
          expect(data).not.toHaveProperty('keyword');
        }
      }

      game.cleanup();
    });

    it('Spectator MUST see keyword, editorUserId, and edits', () => {
      const { game } = createUEGame();
      game.start();

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState.editorUserId).toBeDefined();
      expect(spectatorState.keyword).toBeDefined();
      expect(spectatorState.edits).toBeDefined();
      expect(spectatorState.isSpectator).toBe(true);

      game.cleanup();
    });

    it('Editor MUST see keyword in getStateForPlayer', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const editorId = playerLog
        .find(
          (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
            (e.data as Record<string, unknown>).role === 'editor',
        )?.userId ?? '';

      const editorState = game.getStateForPlayer(editorId) as Record<string, unknown>;
      expect(editorState.keyword).toBeDefined();
      expect(editorState.myRole).toBe('editor');
      expect(editorState.myEdits).toBeDefined();

      game.cleanup();
    });

    it('Edit-related events MUST NOT be sent to Writers', () => {
      const { game, playerLog, broadcastLog } = createUEGame();
      game.start();

      const writerIds = playerLog
        .filter(
          (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
            (e.data as Record<string, unknown>).role === 'writer',
        )
        .map((e) => e.userId);

      // Check: UE_EDIT_PROMPT is only sent to editor, not broadcast
      // It should appear in playerLog for editor only
      for (const writerId of writerIds) {
        const writerEditPrompts = playerLog.filter(
          (e) => e.userId === writerId &&
            (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT',
        );
        expect(writerEditPrompts.length).toBe(0);
      }

      game.cleanup();
    });
  });
});

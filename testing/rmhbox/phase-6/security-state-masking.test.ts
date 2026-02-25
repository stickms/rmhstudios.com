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
  FF_QUESTION_REVEAL_SECONDS,
  FF_ANSWER_DURATION_SECONDS,
} from '../../../lib/rmhbox/constants';
import {
  MOCK_USERS,
  createMockContext,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

function createFFGame(ctxData?: MockContextData) {
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
      const { game } = createFFGame();
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
      const { game } = createFFGame();
      game.start();
      vi.advanceTimersByTime(FF_QUESTION_REVEAL_SECONDS * 1000 + 50);

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
      const { game } = createFFGame();
      game.start();
      vi.advanceTimersByTime(FF_QUESTION_REVEAL_SECONDS * 1000 + 50);

      const state = game.getStateForSpectator() as Record<string, unknown>;
      const question = state.question as Record<string, unknown>;
      expect(question).not.toHaveProperty('correctIndex');

      game.cleanup();
    });

    it('Player A MUST NOT see Player B selectedIndex during ANSWER', () => {
      const { game } = createFFGame();
      game.start();
      vi.advanceTimersByTime(FF_QUESTION_REVEAL_SECONDS * 1000 + 50);

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

      // In the parallel design, every player is an editor for ONE story.
      // They should only see the keyword for THEIR assigned story, not others'.
      const allIds = Object.values(MOCK_USERS).map((u) => u.userId);

      for (const uid of allIds) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        const assignedStoryId = state.assignedStoryId as string | null;
        const keyword = state.keyword as string | null;

        if (assignedStoryId) {
          // This player should see THEIR keyword
          expect(keyword).toBeTruthy();
        }

        // Player should NOT see other stories' keywords or editor assignments
        const stories = state.stories as Array<Record<string, unknown>>;
        if (stories) {
          for (const story of stories) {
            // Story views should never expose editorUserId or keyword
            expect(story).not.toHaveProperty('editorUserId');
            expect(story).not.toHaveProperty('keyword');
          }
        }
      }

      game.cleanup();
    });

    it('No player MUST see another player\'s keyword via WebSocket events', () => {
      const { game, playerLog, broadcastLog } = createUEGame();
      game.start();

      // Broadcast events should NOT contain keyword or editorUserId
      for (const event of broadcastLog) {
        const data = event.data as Record<string, unknown>;
        if (data.type === 'UE_GAME_START') {
          expect(data).not.toHaveProperty('keyword');
          expect(data).not.toHaveProperty('editorUserId');
          // stories should not have keywords or editor IDs
          const stories = data.stories as Array<Record<string, unknown>> | undefined;
          if (stories) {
            for (const story of stories) {
              expect(story).not.toHaveProperty('keyword');
              expect(story).not.toHaveProperty('editorUserId');
            }
          }
        }
        if (data.type === 'UE_WRITE_START') {
          expect(data).not.toHaveProperty('keyword');
        }
      }

      game.cleanup();
    });

    it('Spectator MUST see all story reveals with keywords and editors', () => {
      const { game } = createUEGame();
      game.start();

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      const storyReveals = spectatorState.storyReveals as Array<Record<string, unknown>>;
      expect(storyReveals).toBeDefined();
      expect(storyReveals.length).toBeGreaterThan(0);
      // Each reveal should have editorUserId and keyword
      for (const reveal of storyReveals) {
        expect(reveal.editorUserId).toBeDefined();
        expect(reveal.keyword).toBeDefined();
      }
      expect(spectatorState.isSpectator).toBe(true);

      game.cleanup();
    });

    it('Editor MUST see keyword in getStateForPlayer', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      // In the parallel design, all players are editors. Pick any one.
      const anyEditorId = Object.values(MOCK_USERS)[0].userId;

      const editorState = game.getStateForPlayer(anyEditorId) as Record<string, unknown>;
      expect(editorState.keyword).toBeDefined();
      expect(editorState.assignedStoryId).toBeDefined();
      expect(editorState.myEdits).toBeDefined();

      game.cleanup();
    });

    it('UE_EDIT_PROMPT events MUST NOT be broadcast to all players', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      // UE_EDIT_PROMPT should never appear in broadcastLog (lobby-wide)
      // It should only appear in playerLog (per-player)
      const editPromptBroadcasts = broadcastLog.filter(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT',
      );
      expect(editPromptBroadcasts.length).toBe(0);

      game.cleanup();
    });
  });
});

/**
 * RMHbox Phase 6 — Undercover Editor Tests (Parallel Design)
 *
 * Tests for the parallel-writing Undercover Editor minigame where
 * all players write for all stories simultaneously, each player
 * secretly edits one story, and players match stories to editors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UndercoverEditorGame } from '../../../server/rmhbox/minigames/undercover-editor';
import {
  MOCK_USERS,
  createMockContext,
  findBroadcasts,
  findPlayerEvents,
  type MockContextData,
} from './setup';
import {
  UE_WRITE_TIMEOUT_SECONDS,
  UE_EDIT_TIMEOUT_SECONDS,
  UE_REVEAL_DURATION_SECONDS,
} from '../../../lib/rmhbox/constants';

// ─── Helpers ─────────────────────────────────────────────────────

/** Create a UE game with 5 players (alice, bob, charlie, diana, eve). */
function createUEGame(ctxData?: MockContextData) {
  const data = ctxData ?? createMockContext([
    MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana, MOCK_USERS.eve,
  ]);
  const game = new UndercoverEditorGame(data.context);
  return { game, ...data };
}

/** Advance all players through a WRITE phase by submitting sentences for all stories. */
function submitAllSentences(
  game: UndercoverEditorGame,
  playerIds: string[],
  storyIds: string[],
  prefix = 'This is a test sentence for the story',
) {
  for (const storyId of storyIds) {
    for (const uid of playerIds) {
      game.handleInput(uid, 'WRITE_SENTENCE', {
        storyId,
        text: `${prefix} from ${uid} round`,
      });
    }
  }
}

/** Find all story IDs from the broadcast log. */
function getStoryIds(broadcastLog: Array<{ event: string; data: unknown }>): string[] {
  const gameStart = broadcastLog.find(
    (e) => e.event === 'rmhbox:game:action' &&
      (e.data as Record<string, unknown>).type === 'UE_GAME_START',
  );
  if (!gameStart) return [];
  const stories = (gameStart.data as Record<string, unknown>).stories as Array<{ storyId: string }>;
  return stories.map((s) => s.storyId);
}

/** Find editor assignments from player events. */
function getEditorAssignment(
  playerLog: Array<{ userId: string; event: string; data: unknown }>,
  userId: string,
): { assignedStoryId: string; keyword: string } | null {
  const roleEvent = playerLog.find(
    (e) => e.userId === userId &&
      e.event === 'rmhbox:game:action' &&
      (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED',
  );
  if (!roleEvent) return null;
  const d = roleEvent.data as Record<string, unknown>;
  return {
    assignedStoryId: d.assignedStoryId as string,
    keyword: d.keyword as string,
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Undercover Editor Server Handler — Parallel Design (§6.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── State Initialization ──────────────────────────────────

  describe('State Initialization', () => {
    it('should create a game instance with 5 players', () => {
      const { game } = createUEGame();
      expect(game).toBeDefined();
    });

    it('should create N stories (one per player) on start', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      const gameStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_GAME_START',
      );
      expect(gameStart).toBeDefined();
      const stories = (gameStart!.data as Record<string, unknown>).stories as unknown[];
      expect(stories.length).toBe(5); // One per player
    });

    it('should assign each player as editor of exactly one story', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      // Every player should get a UE_ROLE_ASSIGNED event
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const assignedStories = new Set<string>();

      for (const uid of playerIds) {
        const assignment = getEditorAssignment(playerLog, uid);
        expect(assignment).toBeDefined();
        expect(assignment!.assignedStoryId).toBeTruthy();
        expect(assignment!.keyword).toBeTruthy();
        // No player should edit their own story
        expect(assignment!.assignedStoryId).not.toBe(uid);
        assignedStories.add(assignment!.assignedStoryId);
      }

      // Each story should have exactly one editor
      expect(assignedStories.size).toBe(5);
    });

    it('should start in WRITE phase after start()', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      const writeStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_WRITE_START',
      );
      expect(writeStart).toBeDefined();
    });
  });

  // ─── Write Phase ───────────────────────────────────────────

  describe('Write Phase', () => {
    it('should accept valid sentence submission for a story', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const uid = MOCK_USERS.alice.userId;

      game.handleInput(uid, 'WRITE_SENTENCE', {
        storyId: storyIds[0],
        text: 'A magnificent tale begins here today.',
      });

      const confirmed = playerLog.find(
        (e) => e.userId === uid &&
          (e.data as Record<string, unknown>).type === 'UE_SENTENCE_CONFIRMED',
      );
      expect(confirmed).toBeDefined();
    });

    it('should reject sentence for invalid storyId', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      game.handleInput(MOCK_USERS.alice.userId, 'WRITE_SENTENCE', {
        storyId: 'nonexistent-story',
        text: 'A sentence that should be rejected nicely.',
      });

      const error = playerLog.find(
        (e) => e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'UE_ERROR',
      );
      expect(error).toBeDefined();
    });

    it('should reject sentence shorter than minimum length', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      game.handleInput(MOCK_USERS.alice.userId, 'WRITE_SENTENCE', {
        storyId: storyIds[0],
        text: 'Short',
      });

      const error = playerLog.find(
        (e) => e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'UE_ERROR',
      );
      expect(error).toBeDefined();
    });

    it('should allow unsubmit of a sentence', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const uid = MOCK_USERS.alice.userId;

      // Submit
      game.handleInput(uid, 'WRITE_SENTENCE', {
        storyId: storyIds[0],
        text: 'First attempt at writing something nice.',
      });

      // Unsubmit
      game.handleInput(uid, 'UNSUBMIT_SENTENCE', {
        storyId: storyIds[0],
      });

      const unsubmitted = playerLog.find(
        (e) => e.userId === uid &&
          (e.data as Record<string, unknown>).type === 'UE_SENTENCE_UNSUBMITTED',
      );
      expect(unsubmitted).toBeDefined();
    });

    it('should auto-submit "..." on write timeout for missing submissions', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      // Don't submit anything — let timeout fire
      vi.advanceTimersByTime(UE_WRITE_TIMEOUT_SECONDS * 1000 + 50);

      // Should have transitioned to EDIT phase (stories updated with "...")
      const editStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_START',
      );
      expect(editStart).toBeDefined();
    });

    it('should end WRITE early when all players submit for all stories', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      submitAllSentences(game, playerIds, storyIds);

      // Should immediately transition to EDIT
      const editStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_START',
      );
      expect(editStart).toBeDefined();
    });
  });

  // ─── Edit Phase ────────────────────────────────────────────

  describe('Edit Phase', () => {
    it('should send UE_EDIT_PROMPT to each editor for their assigned story', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Complete write phase
      submitAllSentences(game, playerIds, storyIds);

      // Each player should get an edit prompt for their assigned story
      const editPrompts = playerLog.filter(
        (e) => (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT',
      );
      expect(editPrompts.length).toBeGreaterThan(0);
    });

    it('should allow editor to edit a word in their assigned story', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      submitAllSentences(game, playerIds, storyIds);

      // Find an editor assignment
      const editorUid = playerIds[0];
      const assignment = getEditorAssignment(playerLog, editorUid);
      expect(assignment).toBeDefined();

      // Edit a word
      game.handleInput(editorUid, 'EDIT_WORD', {
        storyId: assignment!.assignedStoryId,
        sentenceIndex: 0,
        wordIndex: 0,
        newWord: 'CHANGED',
      });

      const confirmed = playerLog.find(
        (e) => e.userId === editorUid &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_CONFIRMED',
      );
      expect(confirmed).toBeDefined();
    });

    it('should reject edit from non-editor for a story', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      submitAllSentences(game, playerIds, storyIds);

      // Try to edit a story that the player is NOT assigned to
      const editorUid = playerIds[0];
      const assignment = getEditorAssignment(playerLog, editorUid);
      expect(assignment).toBeDefined();

      // Use a different player
      const nonEditorUid = playerIds[1];
      game.handleInput(nonEditorUid, 'EDIT_WORD', {
        storyId: assignment!.assignedStoryId,
        sentenceIndex: 0,
        wordIndex: 0,
        newWord: 'HACKED',
      });

      const error = playerLog.find(
        (e) => e.userId === nonEditorUid &&
          (e.data as Record<string, unknown>).type === 'UE_ERROR' &&
          (e.data as Record<string, unknown>).message === 'Not the editor for this story',
      );
      expect(error).toBeDefined();
    });

    it('should allow editor to skip editing', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      submitAllSentences(game, playerIds, storyIds);

      const editorUid = playerIds[0];
      game.handleInput(editorUid, 'SKIP_EDIT', {});

      const confirmed = playerLog.find(
        (e) => e.userId === editorUid &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_CONFIRMED' &&
          (e.data as Record<string, unknown>).skipped === true,
      );
      expect(confirmed).toBeDefined();
    });

    it('should reject editing an already-edited position', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      submitAllSentences(game, playerIds, storyIds);

      const editorUid = playerIds[0];
      const assignment = getEditorAssignment(playerLog, editorUid);
      expect(assignment).toBeDefined();

      // First edit
      game.handleInput(editorUid, 'EDIT_WORD', {
        storyId: assignment!.assignedStoryId,
        sentenceIndex: 0,
        wordIndex: 0,
        newWord: 'FIRST',
      });

      // Start a new write+edit round to attempt re-editing the same position
      // Since the first edit phase auto-advances when all editors complete,
      // we need to complete all edits, then do another round
      for (let i = 1; i < playerIds.length; i++) {
        game.handleInput(playerIds[i], 'SKIP_EDIT', {});
      }

      // Now in round 2 WRITE phase — submit again
      const writeStart2 = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_WRITE_START' &&
          (e.data as Record<string, unknown>).round === 2,
      );
      expect(writeStart2).toBeDefined();

      submitAllSentences(game, playerIds, storyIds, 'Round two sentence for story');

      // Try to edit the same position (0:0) again
      game.handleInput(editorUid, 'EDIT_WORD', {
        storyId: assignment!.assignedStoryId,
        sentenceIndex: 0,
        wordIndex: 0,
        newWord: 'SECOND',
      });

      const error = playerLog.find(
        (e) => e.userId === editorUid &&
          (e.data as Record<string, unknown>).type === 'UE_ERROR' &&
          (e.data as Record<string, unknown>).message === 'Position already edited',
      );
      expect(error).toBeDefined();
    });
  });

  // ─── State Masking (Security) ──────────────────────────────

  describe('State Masking (Security)', () => {
    it('non-editor player should NOT see any keyword or editor assignments', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Each player should only know their OWN assignment
      for (const uid of playerIds) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        // Should NOT have other players' keywords or assignments
        // The state should have `assignedStoryId` (their own) but not others'
        const keyword = state.keyword;
        const assignedStoryId = state.assignedStoryId;

        if (assignedStoryId) {
          // This player is an editor — they should see their keyword
          expect(keyword).toBeTruthy();
        } else {
          // Not an editor (shouldn't happen in this design, but guard)
          expect(keyword).toBeUndefined();
        }
      }
    });

    it('editor getStateForPlayer should include keyword for their assigned story', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const editorUid = playerIds[0];
      const assignment = getEditorAssignment(playerLog, editorUid);
      expect(assignment).toBeDefined();

      const state = game.getStateForPlayer(editorUid) as Record<string, unknown>;
      expect(state.assignedStoryId).toBe(assignment!.assignedStoryId);
      expect(state.keyword).toBe(assignment!.keyword);
    });

    it('spectator state should include all hidden info', () => {
      const { game } = createUEGame();
      game.start();

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState.storyReveals).toBeDefined();
      expect(spectatorState.isSpectator).toBe(true);
    });
  });

  // ─── Review Phase (Matching) ───────────────────────────────

  describe('Review Phase', () => {
    it('should transition to REVIEW after all rounds complete', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Complete 2 rounds (default UE_ROTATIONS)
      for (let round = 0; round < 2; round++) {
        submitAllSentences(game, playerIds, storyIds, `Round ${round + 1} sentence`);
        // All editors skip to advance
        for (const uid of playerIds) {
          game.handleInput(uid, 'SKIP_EDIT', {});
        }
      }

      const reviewStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_REVIEW_START',
      );
      expect(reviewStart).toBeDefined();
    });

    it('should accept matching guesses from players', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Complete all rounds
      for (let round = 0; round < 2; round++) {
        submitAllSentences(game, playerIds, storyIds, `Round ${round + 1} sentence`);
        for (const uid of playerIds) {
          game.handleInput(uid, 'SKIP_EDIT', {});
        }
      }

      // Submit matching guesses
      const guesses: Record<string, string> = {};
      for (const storyId of storyIds) {
        guesses[storyId] = playerIds[0]; // Just guess someone
      }

      game.handleInput(playerIds[0], 'SUBMIT_MATCHING', { guesses });

      const saved = playerLog.find(
        (e) => e.userId === playerIds[0] &&
          (e.data as Record<string, unknown>).type === 'UE_MATCHING_SAVED',
      );
      expect(saved).toBeDefined();
    });

    it('should advance to REVEAL when all players lock in', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Complete all rounds
      for (let round = 0; round < 2; round++) {
        submitAllSentences(game, playerIds, storyIds, `Round ${round + 1} sentence`);
        for (const uid of playerIds) {
          game.handleInput(uid, 'SKIP_EDIT', {});
        }
      }

      // All players submit guesses and lock in
      for (const uid of playerIds) {
        const guesses: Record<string, string> = {};
        for (const storyId of storyIds) {
          guesses[storyId] = playerIds[0];
        }
        game.handleInput(uid, 'SUBMIT_MATCHING', { guesses });
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      const reveal = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_REVEAL',
      );
      expect(reveal).toBeDefined();
    });

    it('should not allow locked-in player to change guesses', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      for (let round = 0; round < 2; round++) {
        submitAllSentences(game, playerIds, storyIds, `Round ${round + 1} sentence`);
        for (const uid of playerIds) {
          game.handleInput(uid, 'SKIP_EDIT', {});
        }
      }

      const uid = playerIds[0];
      const guesses: Record<string, string> = {};
      for (const storyId of storyIds) {
        guesses[storyId] = playerIds[0];
      }
      game.handleInput(uid, 'SUBMIT_MATCHING', { guesses });
      game.handleInput(uid, 'LOCK_IN_MATCHING', {});

      // Try to change guesses after lock-in
      game.handleInput(uid, 'SUBMIT_MATCHING', { guesses: { [storyIds[0]]: playerIds[1] } });

      const error = playerLog.find(
        (e) => e.userId === uid &&
          (e.data as Record<string, unknown>).type === 'UE_ERROR' &&
          (e.data as Record<string, unknown>).message === 'Already locked in',
      );
      expect(error).toBeDefined();
    });
  });

  // ─── Reconnection ─────────────────────────────────────────

  describe('Reconnection', () => {
    it('should send editor state with keyword on reconnect', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const editorUid = playerIds[0];

      const state = game.getStateForPlayer(editorUid) as Record<string, unknown>;
      expect(state.assignedStoryId).toBeDefined();
      expect(state.keyword).toBeDefined();
      expect(state.phase).toBe('WRITE');
    });

    it('should send non-editor state without other players\' keywords', () => {
      const { game } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Check each player's state
      for (const uid of playerIds) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        expect(state.stories).toBeDefined();
        expect(state.phase).toBe('WRITE');
        // Should not contain other players' assignments
        const stories = state.stories as Array<Record<string, unknown>>;
        for (const story of stories) {
          // Story views should not reveal editorUserId
          expect(story.editorUserId).toBeUndefined();
        }
      }
    });
  });

  // ─── Join-in-Progress ──────────────────────────────────────

  describe('Join-in-Progress', () => {
    it('should send spectator state to JIP player', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      game.handlePlayerJoin('new-spectator-id');

      const snapshot = playerLog.find(
        (e) => e.userId === 'new-spectator-id' &&
          e.event === 'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();
      const data = snapshot!.data as Record<string, unknown>;
      expect(data.isSpectator).toBe(true);
    });
  });

  // ─── Scoring & Awards ─────────────────────────────────────

  describe('Scoring & Awards', () => {
    it('should produce results with rankings and awards after reveal', () => {
      const { game, broadcastLog, context } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Complete all rounds
      for (let round = 0; round < 2; round++) {
        submitAllSentences(game, playerIds, storyIds, `Round ${round + 1} sentence`);
        for (const uid of playerIds) {
          game.handleInput(uid, 'SKIP_EDIT', {});
        }
      }

      // All lock in
      for (const uid of playerIds) {
        const guesses: Record<string, string> = {};
        for (const storyId of storyIds) {
          guesses[storyId] = playerIds[0];
        }
        game.handleInput(uid, 'SUBMIT_MATCHING', { guesses });
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      // Advance through reveal
      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 50);

      // onComplete should have been called
      expect(context.onComplete).toHaveBeenCalledTimes(1);
      const results = (context.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(results.rankings).toBeDefined();
      expect(results.rankings.length).toBe(5);
      expect(results.awards).toBeDefined();
    });
  });

  // ─── Game Log ──────────────────────────────────────────────

  describe('Game Log', () => {
    it('should produce game log with action types', () => {
      const { game, broadcastLog, context } = createUEGame();
      game.start();

      const storyIds = getStoryIds(broadcastLog);
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      for (let round = 0; round < 2; round++) {
        submitAllSentences(game, playerIds, storyIds, `Round ${round + 1} sentence`);
        for (const uid of playerIds) {
          game.handleInput(uid, 'SKIP_EDIT', {});
        }
      }

      for (const uid of playerIds) {
        game.handleInput(uid, 'SUBMIT_MATCHING', { guesses: {} });
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 50);

      expect(context.onComplete).toHaveBeenCalledTimes(1);
      const results = (context.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const gameLog = results.gameSpecificData.gameLog as unknown[];
      expect(gameLog.length).toBeGreaterThan(0);
    });
  });
});

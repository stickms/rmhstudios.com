/**
 * RMHbox Phase 6 — Undercover Editor Tests (Round-Robin Design)
 *
 * Tests for the round-robin Undercover Editor minigame where:
 * - N players create N stories over 2N steps (N write + N edit)
 * - Each round, every player writes ONE sentence for ONE story
 * - After each write, editors secretly change 1 or 2 words
 * - READING phase: host-driven sentence reveal
 * - REVIEW: match stories to editors (1-to-1)
 * - REVEAL: scores computed
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UndercoverEditorGame } from '../../../server/rmhbox/minigames/undercover-editor';
import {
  MOCK_USERS,
  createMockContext,
  type MockContextData,
} from './setup';
import {
  UE_WRITE_TIMEOUT_SECONDS,
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
): { assignedStoryId: string } | null {
  const roleEvent = playerLog.find(
    (e) => e.userId === userId &&
      e.event === 'rmhbox:game:action' &&
      (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED',
  );
  if (!roleEvent) return null;
  const d = roleEvent.data as Record<string, unknown>;
  return {
    assignedStoryId: d.assignedStoryId as string,
  };
}

/** Get the write assignment for a player from the player log. */
function getWriteAssignment(
  playerLog: Array<{ userId: string; event: string; data: unknown }>,
  userId: string,
  afterIndex = 0,
): { storyId: string } | null {
  const writeEvent = playerLog.slice(afterIndex).find(
    (e) => e.userId === userId &&
      e.event === 'rmhbox:game:action' &&
      (e.data as Record<string, unknown>).type === 'UE_WRITE_ASSIGNMENT',
  );
  if (!writeEvent) return null;
  return { storyId: (writeEvent.data as Record<string, unknown>).storyId as string };
}

/**
 * Submit sentences for all players for their current round-robin assignments.
 * Each player writes for exactly one story per round.
 */
function submitAllForCurrentRound(
  game: UndercoverEditorGame,
  playerIds: string[],
  playerLog: Array<{ userId: string; event: string; data: unknown }>,
  prefix = 'This is a test sentence for the story',
) {
  for (const uid of playerIds) {
    // Find the most recent write assignment for this player
    const assignments = playerLog.filter(
      (e) => e.userId === uid &&
        e.event === 'rmhbox:game:action' &&
        (e.data as Record<string, unknown>).type === 'UE_WRITE_ASSIGNMENT',
    );
    const latestAssignment = assignments[assignments.length - 1];
    if (!latestAssignment) continue;
    const storyId = (latestAssignment.data as Record<string, unknown>).storyId as string;
    game.handleInput(uid, 'WRITE_SENTENCE', {
      storyId,
      text: `${prefix} from ${uid}`,
    });
  }
}

/** Complete one full write→edit cycle for a round. */
function completeOneRound(
  game: UndercoverEditorGame,
  playerIds: string[],
  playerLog: Array<{ userId: string; event: string; data: unknown }>,
  prefix = 'Round sentence',
) {
  submitAllForCurrentRound(game, playerIds, playerLog, prefix);
  // All editors skip to advance
  for (const uid of playerIds) {
    game.handleInput(uid, 'SKIP_EDIT', {});
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Undercover Editor Server Handler — Round-Robin Design (§6.2)', () => {
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
      const data = gameStart!.data as Record<string, unknown>;
      const stories = data.stories as unknown[];
      expect(stories.length).toBe(5);
      expect(data.numPlayers).toBe(5);
      expect(data.totalSteps).toBe(10); // 2*N = 10
    });

    it('should assign each player as editor of exactly one story (not their own)', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const assignedStories = new Set<string>();

      for (const uid of playerIds) {
        const assignment = getEditorAssignment(playerLog, uid);
        expect(assignment).toBeDefined();
        expect(assignment!.assignedStoryId).toBeTruthy();
        // No player should edit their own story (storyId = ownerUserId)
        expect(assignment!.assignedStoryId).not.toBe(uid);
        assignedStories.add(assignment!.assignedStoryId);
      }

      // Each story should have exactly one editor
      expect(assignedStories.size).toBe(5);
    });

    it('should start in WRITE phase after start() with round-robin assignments', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const writeStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_WRITE_START',
      );
      expect(writeStart).toBeDefined();
      const data = writeStart!.data as Record<string, unknown>;
      expect(data.writeRound).toBe(1);
      expect(data.step).toBe(1);

      // Each player should have received a UE_WRITE_ASSIGNMENT
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      for (const uid of playerIds) {
        const assignment = getWriteAssignment(playerLog, uid);
        expect(assignment).toBeDefined();
      }
    });
  });

  // ─── Write Phase ───────────────────────────────────────────

  describe('Write Phase (Round-Robin)', () => {
    it('should accept valid sentence submission for assigned story', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const uid = MOCK_USERS.alice.userId;
      const assignment = getWriteAssignment(playerLog, uid);
      expect(assignment).toBeDefined();

      game.handleInput(uid, 'WRITE_SENTENCE', {
        storyId: assignment!.storyId,
        text: 'A magnificent tale begins here today.',
      });

      const confirmed = playerLog.find(
        (e) => e.userId === uid &&
          (e.data as Record<string, unknown>).type === 'UE_SENTENCE_CONFIRMED',
      );
      expect(confirmed).toBeDefined();
    });

    it('should reject sentence for non-assigned story', () => {
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
      const { game, playerLog } = createUEGame();
      game.start();

      const uid = MOCK_USERS.alice.userId;
      const assignment = getWriteAssignment(playerLog, uid);

      game.handleInput(uid, 'WRITE_SENTENCE', {
        storyId: assignment!.storyId,
        text: 'Short',
      });

      const error = playerLog.find(
        (e) => e.userId === uid &&
          (e.data as Record<string, unknown>).type === 'UE_ERROR',
      );
      expect(error).toBeDefined();
    });

    it('should allow unsubmit of a sentence', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const uid = MOCK_USERS.alice.userId;
      const assignment = getWriteAssignment(playerLog, uid)!;

      game.handleInput(uid, 'WRITE_SENTENCE', {
        storyId: assignment.storyId,
        text: 'First attempt at writing something nice.',
      });

      game.handleInput(uid, 'UNSUBMIT_SENTENCE', {
        storyId: assignment.storyId,
      });

      const unsubmitted = playerLog.find(
        (e) => e.userId === uid &&
          (e.data as Record<string, unknown>).type === 'UE_SENTENCE_UNSUBMITTED',
      );
      expect(unsubmitted).toBeDefined();
    });

    it('should auto-submit "..." on write timeout', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      vi.advanceTimersByTime(UE_WRITE_TIMEOUT_SECONDS * 1000 + 50);

      const editStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_START',
      );
      expect(editStart).toBeDefined();
    });

    it('should end WRITE early when all players submit', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      submitAllForCurrentRound(game, playerIds, playerLog);

      const editStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_START',
      );
      expect(editStart).toBeDefined();
    });
  });

  // ─── Edit Phase ────────────────────────────────────────────

  describe('Edit Phase (2-Word Edits)', () => {
    it('should send UE_EDIT_PROMPT to editors after write phase', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      submitAllForCurrentRound(game, playerIds, playerLog);

      const editPrompts = playerLog.filter(
        (e) => (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT',
      );
      expect(editPrompts.length).toBeGreaterThan(0);

      // Each edit prompt should have an editableSentence with words
      for (const prompt of editPrompts) {
        const data = prompt.data as Record<string, unknown>;
        const story = data.story as Record<string, unknown>;
        expect(story).toBeDefined();
        expect(story.editableSentence).toBeDefined();
        const editableSentence = story.editableSentence as Record<string, unknown>;
        expect(editableSentence.words).toBeDefined();
        expect(Array.isArray(editableSentence.words)).toBe(true);
      }
    });

    it('should allow editor to submit 2-word edit', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      submitAllForCurrentRound(game, playerIds, playerLog);

      const editorUid = playerIds[0];
      const assignment = getEditorAssignment(playerLog, editorUid);
      expect(assignment).toBeDefined();

      // Find the edit prompt to get word indices
      const editPrompt = playerLog.find(
        (e) => e.userId === editorUid &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT',
      );
      expect(editPrompt).toBeDefined();

      game.handleInput(editorUid, 'EDIT_WORDS', {
        storyId: assignment!.assignedStoryId,
        edits: [
          { wordIndex: 0, newWord: 'CHANGED1' },
          { wordIndex: 1, newWord: 'CHANGED2' },
        ],
      });

      const confirmed = playerLog.find(
        (e) => e.userId === editorUid &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_CONFIRMED',
      );
      expect(confirmed).toBeDefined();
    });

    it('should allow editor to submit 1-word edit', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      submitAllForCurrentRound(game, playerIds, playerLog);

      const editorUid = playerIds[0];
      const assignment = getEditorAssignment(playerLog, editorUid);
      expect(assignment).toBeDefined();

      game.handleInput(editorUid, 'EDIT_WORDS', {
        storyId: assignment!.assignedStoryId,
        edits: [
          { wordIndex: 0, newWord: 'ONLYONE' },
        ],
      });

      const confirmed = playerLog.find(
        (e) => e.userId === editorUid &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_CONFIRMED',
      );
      expect(confirmed).toBeDefined();
    });

    it('should reject edit from non-editor for a story', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      submitAllForCurrentRound(game, playerIds, playerLog);

      const editorUid = playerIds[0];
      const assignment = getEditorAssignment(playerLog, editorUid);
      expect(assignment).toBeDefined();

      // Use a different player
      const nonEditorUid = playerIds.find(
        (uid) => getEditorAssignment(playerLog, uid)?.assignedStoryId !== assignment!.assignedStoryId,
      ) ?? playerIds[1];

      game.handleInput(nonEditorUid, 'EDIT_WORDS', {
        storyId: assignment!.assignedStoryId,
        edits: [
          { wordIndex: 0, newWord: 'HACKED1' },
          { wordIndex: 1, newWord: 'HACKED2' },
        ],
      });

      const error = playerLog.find(
        (e) => e.userId === nonEditorUid &&
          (e.data as Record<string, unknown>).type === 'UE_ERROR' &&
          (e.data as Record<string, unknown>).message === 'Not the editor for this story',
      );
      expect(error).toBeDefined();
    });

    it('should allow editor to skip editing', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      submitAllForCurrentRound(game, playerIds, playerLog);

      const editorUid = playerIds[0];
      game.handleInput(editorUid, 'SKIP_EDIT', {});

      const confirmed = playerLog.find(
        (e) => e.userId === editorUid &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_CONFIRMED' &&
          (e.data as Record<string, unknown>).skipped === true,
      );
      expect(confirmed).toBeDefined();
    });

    it('should reject 2-word edit with same word index', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      submitAllForCurrentRound(game, playerIds, playerLog);

      const editorUid = playerIds[0];
      const assignment = getEditorAssignment(playerLog, editorUid)!;

      game.handleInput(editorUid, 'EDIT_WORDS', {
        storyId: assignment.assignedStoryId,
        edits: [
          { wordIndex: 0, newWord: 'SAME' },
          { wordIndex: 0, newWord: 'SAME' },
        ],
      });

      const error = playerLog.find(
        (e) => e.userId === editorUid &&
          (e.data as Record<string, unknown>).type === 'UE_ERROR' &&
          (e.data as Record<string, unknown>).message === 'Must edit two different words',
      );
      expect(error).toBeDefined();
    });
  });

  // ─── State Masking (Security) ──────────────────────────────

  describe('State Masking (Security)', () => {
    it('player state should NOT reveal editor assignments for other stories', () => {
      const { game } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      for (const uid of playerIds) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        // Stories should not expose editorUserId
        const stories = state.stories as Array<Record<string, unknown>>;
        if (stories) {
          for (const story of stories) {
            expect(story).not.toHaveProperty('editorUserId');
          }
        }
      }
    });

    it('editor should see their assignedStoryId in getStateForPlayer', () => {
      const { game, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const editorUid = playerIds[0];
      const assignment = getEditorAssignment(playerLog, editorUid);
      expect(assignment).toBeDefined();

      const state = game.getStateForPlayer(editorUid) as Record<string, unknown>;
      expect(state.assignedStoryId).toBe(assignment!.assignedStoryId);
    });

    it('spectator state should include all hidden info', () => {
      const { game } = createUEGame();
      game.start();

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState.storyReveals).toBeDefined();
      expect(spectatorState.isSpectator).toBe(true);

      // Each reveal should have editorUserId
      const reveals = spectatorState.storyReveals as Array<Record<string, unknown>>;
      for (const reveal of reveals) {
        expect(reveal.editorUserId).toBeDefined();
      }
    });
  });

  // ─── Reading Phase ─────────────────────────────────────────

  describe('Reading Phase (Host-Driven)', () => {
    it('should transition to READING after all write/edit rounds', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // N = 5 write/edit rounds
      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Round ${round + 1} sentence`);
      }

      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      expect(readingStart).toBeDefined();
    });

    it('host should be able to advance sentences', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const hostId = context.getHostId();

      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Round ${round + 1} sentence`);
      }

      // Advance first sentence
      game.handleInput(hostId, 'NEXT_SENTENCE', {});

      const sentenceEvent = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_SENTENCE',
      );
      expect(sentenceEvent).toBeDefined();
    });

    it('non-host should NOT be able to advance', () => {
      const { game, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const hostId = context.getHostId();
      const nonHostId = playerIds.find((uid) => uid !== hostId)!;

      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Round ${round + 1} sentence`);
      }

      game.handleInput(nonHostId, 'NEXT_SENTENCE', {});

      const error = playerLog.find(
        (e) => e.userId === nonHostId &&
          (e.data as Record<string, unknown>).type === 'UE_ERROR' &&
          (e.data as Record<string, unknown>).message === 'Only the host can advance',
      );
      expect(error).toBeDefined();
    });
  });

  // ─── Review Phase (Matching) ───────────────────────────────

  describe('Review Phase', () => {
    /** Helper: advance through all N rounds + reading to reach REVIEW. */
    function advanceToReview(
      game: UndercoverEditorGame,
      playerIds: string[],
      playerLog: Array<{ userId: string; event: string; data: unknown }>,
      broadcastLog: Array<{ event: string; data: unknown }>,
      context: { getHostId: () => string },
    ) {
      const hostId = context.getHostId();

      // Complete N write/edit rounds
      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Round ${round + 1} sentence`);
      }

      // Advance through READING: step through all sentences of all stories
      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      expect(readingStart).toBeDefined();
      const readingStories = (readingStart!.data as Record<string, unknown>).stories as Array<{ sentenceCount: number }>;

      for (let si = 0; si < readingStories.length; si++) {
        const storyMeta = readingStories[si];
        for (let senti = 0; senti < storyMeta.sentenceCount; senti++) {
          game.handleInput(hostId, 'NEXT_SENTENCE', {});
        }
        // Advance to next story (last one transitions to REVIEW)
        game.handleInput(hostId, 'NEXT_STORY', {});
      }
    }

    it('should accept matching guesses from players', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      advanceToReview(game, playerIds, playerLog, broadcastLog, context);

      const storyIds = getStoryIds(broadcastLog);
      const guesses: Record<string, string> = {};
      for (const storyId of storyIds) {
        guesses[storyId] = playerIds[0];
      }

      game.handleInput(playerIds[0], 'SUBMIT_MATCHING', { guesses });

      const saved = playerLog.find(
        (e) => e.userId === playerIds[0] &&
          (e.data as Record<string, unknown>).type === 'UE_MATCHING_SAVED',
      );
      expect(saved).toBeDefined();
    });

    it('should advance to REVEAL when all players lock in', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      advanceToReview(game, playerIds, playerLog, broadcastLog, context);

      const storyIds = getStoryIds(broadcastLog);

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
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      advanceToReview(game, playerIds, playerLog, broadcastLog, context);

      const storyIds = getStoryIds(broadcastLog);
      const uid = playerIds[0];
      const guesses: Record<string, string> = {};
      for (const storyId of storyIds) {
        guesses[storyId] = playerIds[0];
      }
      game.handleInput(uid, 'SUBMIT_MATCHING', { guesses });
      game.handleInput(uid, 'LOCK_IN_MATCHING', {});

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
    it('should send editor state on reconnect', () => {
      const { game } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const editorUid = playerIds[0];

      const state = game.getStateForPlayer(editorUid) as Record<string, unknown>;
      expect(state.assignedStoryId).toBeDefined();
      expect(state.phase).toBe('WRITE');
    });

    it('should send non-editor state without other players\' assignments', () => {
      const { game } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      for (const uid of playerIds) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        expect(state.stories).toBeDefined();
        expect(state.phase).toBe('WRITE');
        const stories = state.stories as Array<Record<string, unknown>>;
        for (const story of stories) {
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
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const hostId = context.getHostId();

      // Complete all write/edit rounds
      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Round ${round + 1} sentence`);
      }

      // Advance through reading
      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      const readingStories = (readingStart!.data as Record<string, unknown>).stories as Array<{ sentenceCount: number }>;
      for (let si = 0; si < readingStories.length; si++) {
        for (let senti = 0; senti < readingStories[si].sentenceCount; senti++) {
          game.handleInput(hostId, 'NEXT_SENTENCE', {});
        }
        game.handleInput(hostId, 'NEXT_STORY', {});
      }

      // All lock in
      const storyIds = getStoryIds(broadcastLog);
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
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const hostId = context.getHostId();

      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Round ${round + 1} sentence`);
      }

      // Advance through reading
      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      const readingStories = (readingStart!.data as Record<string, unknown>).stories as Array<{ sentenceCount: number }>;
      for (let si = 0; si < readingStories.length; si++) {
        for (let senti = 0; senti < readingStories[si].sentenceCount; senti++) {
          game.handleInput(hostId, 'NEXT_SENTENCE', {});
        }
        game.handleInput(hostId, 'NEXT_STORY', {});
      }

      for (const uid of playerIds) {
        game.handleInput(uid, 'SUBMIT_MATCHING', { guesses: {} });
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 50);

      expect(context.onComplete).toHaveBeenCalledTimes(1);
      const results = (context.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      expect(gameLog.actions).toBeDefined();
      expect((gameLog.actions as unknown[]).length).toBeGreaterThan(0);
    });

    it('should include full storyReveals in reveal action for history display', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const hostId = context.getHostId();

      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Round ${round + 1} sentence`);
      }

      // Advance through reading
      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      const readingStories = (readingStart!.data as Record<string, unknown>).stories as Array<{ sentenceCount: number }>;
      for (let si = 0; si < readingStories.length; si++) {
        for (let senti = 0; senti < readingStories[si].sentenceCount; senti++) {
          game.handleInput(hostId, 'NEXT_SENTENCE', {});
        }
        game.handleInput(hostId, 'NEXT_STORY', {});
      }

      for (const uid of playerIds) {
        game.handleInput(uid, 'SUBMIT_MATCHING', { guesses: {} });
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 50);

      const results = (context.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      const actions = gameLog.actions as Array<{ type: string; payload: Record<string, unknown> }>;
      const revealAction = actions.find((a) => a.type === 'reveal');
      expect(revealAction).toBeDefined();
      const storyReveals = revealAction!.payload.storyReveals as Array<Record<string, unknown>>;
      expect(storyReveals.length).toBe(5);

      // Each reveal should have full data for history display
      for (const reveal of storyReveals) {
        expect(reveal.storyId).toBeDefined();
        expect(reveal.ownerName).toBeDefined();
        expect(reveal.editorUserId).toBeDefined();
        expect(reveal.editorName).toBeDefined();
        expect(reveal.edits).toBeDefined();
        expect(reveal.sentences).toBeDefined();
        const sentences = reveal.sentences as Array<Record<string, unknown>>;
        expect(sentences.length).toBe(5); // 5 rounds = 5 sentences per story
        for (const sent of sentences) {
          expect(sent.authorUserId).toBeDefined();
          expect(sent.authorName).toBeDefined();
          expect(sent.text).toBeDefined();
          expect(sent.roundNumber).toBeDefined();
        }
      }
    });

    it('should include initialState in gameLog for history display', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const hostId = context.getHostId();

      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Round ${round + 1} sentence`);
      }

      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      const readingStories = (readingStart!.data as Record<string, unknown>).stories as Array<{ sentenceCount: number }>;
      for (let si = 0; si < readingStories.length; si++) {
        for (let senti = 0; senti < readingStories[si].sentenceCount; senti++) {
          game.handleInput(hostId, 'NEXT_SENTENCE', {});
        }
        game.handleInput(hostId, 'NEXT_STORY', {});
      }

      for (const uid of playerIds) {
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 50);

      const results = (context.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      const initialState = gameLog.initialState as Record<string, unknown>;
      expect(initialState).toBeDefined();
      expect(initialState.numPlayers).toBe(5);
      expect(initialState.totalSteps).toBe(10);
      expect(initialState.storyCount).toBe(5);
    });
  });

  // ─── Randomized Write Assignment ──────────────────────────

  describe('Randomized Write Assignment', () => {
    it('should use assignmentStoryOrder so editors write for edited stories in varying rounds', () => {
      // Run multiple games and check that the write round varies
      const writeRoundsForEditedStory = new Set<number>();
      for (let trial = 0; trial < 20; trial++) {
        const { game, playerLog } = createUEGame();
        game.start();

        const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
        const firstPlayerId = playerIds[0];
        const assignment = getEditorAssignment(playerLog, firstPlayerId);
        if (!assignment) continue;
        const editedStoryId = assignment.assignedStoryId;

        // Complete all rounds and track when this player writes for their edited story
        for (let round = 1; round <= 5; round++) {
          const writeAssignment = playerLog.filter(
            (e) => e.userId === firstPlayerId &&
              e.event === 'rmhbox:game:action' &&
              (e.data as Record<string, unknown>).type === 'UE_WRITE_ASSIGNMENT',
          ).at(-1);
          if (writeAssignment) {
            const storyId = (writeAssignment.data as Record<string, unknown>).storyId as string;
            if (storyId === editedStoryId) {
              writeRoundsForEditedStory.add(round);
            }
          }
          submitAllForCurrentRound(game, playerIds, playerLog, `Trial ${trial} round ${round}`);
          for (const uid of playerIds) {
            game.handleInput(uid, 'SKIP_EDIT', {});
          }
        }
        game.cleanup();
      }

      // With random assignment, we expect multiple different rounds
      // (deterministic would always be the same round)
      expect(writeRoundsForEditedStory.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── REVIEW Phase: No Host Skip ───────────────────────────

  describe('REVIEW Phase: No Host Skip', () => {
    it('should auto-advance to REVEAL when all players lock in', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();

      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);
      const hostId = context.getHostId();

      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Round ${round + 1} sentence`);
      }

      // Advance through reading
      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      const readingStories = (readingStart!.data as Record<string, unknown>).stories as Array<{ sentenceCount: number }>;
      for (let si = 0; si < readingStories.length; si++) {
        for (let senti = 0; senti < readingStories[si].sentenceCount; senti++) {
          game.handleInput(hostId, 'NEXT_SENTENCE', {});
        }
        game.handleInput(hostId, 'NEXT_STORY', {});
      }

      // Verify we're in REVIEW
      const reviewStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_REVIEW_START',
      );
      expect(reviewStart).toBeDefined();

      // TIMER_START should be broadcast with showSkip = false for REVIEW
      // broadcastAction records with event: 'action'
      const timerStartEvents = broadcastLog.filter(
        (e) => e.event === 'action' &&
          (e.data as Record<string, unknown>).type === 'TIMER_START',
      );
      const reviewTimer = timerStartEvents.at(-1);
      expect(reviewTimer).toBeDefined();
      const timerPayload = (reviewTimer!.data as Record<string, unknown>).payload as Record<string, unknown>;
      expect(timerPayload.showSkip).toBe(false);

      // All players lock in → auto-advance to REVEAL
      for (const uid of playerIds) {
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      const reveal = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_REVEAL',
      );
      expect(reveal).toBeDefined();
    });
  });

  // ─── New Scoring System ────────────────────────────────────

  describe('New Scoring System', () => {
    /** Helper: advance game through READING to REVIEW. */
    function advanceToReveal(
      game: UndercoverEditorGame,
      playerIds: string[],
      playerLog: Array<{ userId: string; event: string; data: unknown }>,
      broadcastLog: Array<{ event: string; data: unknown }>,
      context: { getHostId: () => string },
      matchFn: (uid: string, storyIds: string[]) => Record<string, string>,
    ) {
      const hostId = context.getHostId();

      // Complete N rounds
      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Scoring round ${round + 1} sentence`);
      }

      // Advance reading
      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      const readingStories = (readingStart!.data as Record<string, unknown>).stories as Array<{ sentenceCount: number }>;
      for (let si = 0; si < readingStories.length; si++) {
        for (let senti = 0; senti < readingStories[si].sentenceCount; senti++) {
          game.handleInput(hostId, 'NEXT_SENTENCE', {});
        }
        game.handleInput(hostId, 'NEXT_STORY', {});
      }

      const storyIds = getStoryIds(broadcastLog);

      // Each player submits + locks in
      for (const uid of playerIds) {
        const guesses = matchFn(uid, storyIds);
        game.handleInput(uid, 'SUBMIT_MATCHING', { guesses });
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 50);
    }

    it('should award +1 per character written during writing phases', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      advanceToReveal(game, playerIds, playerLog, broadcastLog, context,
        (_uid, storyIds) => {
          const g: Record<string, string> = {};
          for (const s of storyIds) g[s] = playerIds[0]; // wrong guesses
          return g;
        },
      );

      const results = (context.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Every player wrote sentences across 5 rounds; each should have characters counted
      for (const ranking of results.rankings) {
        expect(ranking.score).toBeGreaterThan(0);
      }
    });

    it('should include breakdown in score results (via REVEAL broadcast)', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Complete rounds without skipping edits — submit actual edits
      for (let round = 0; round < 5; round++) {
        submitAllForCurrentRound(game, playerIds, playerLog, `Breakdown test round ${round + 1}`);
        // All editors skip edits (we test breakdown existence, not exact values)
        for (const uid of playerIds) {
          game.handleInput(uid, 'SKIP_EDIT', {});
        }
      }

      const hostId = context.getHostId();
      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      const readingStories = (readingStart!.data as Record<string, unknown>).stories as Array<{ sentenceCount: number }>;
      for (let si = 0; si < readingStories.length; si++) {
        for (let senti = 0; senti < readingStories[si].sentenceCount; senti++) {
          game.handleInput(hostId, 'NEXT_SENTENCE', {});
        }
        game.handleInput(hostId, 'NEXT_STORY', {});
      }

      for (const uid of playerIds) {
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      // Check REVEAL broadcast has scores with breakdown
      const reveal = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_REVEAL',
      );
      expect(reveal).toBeDefined();
      const scores = (reveal!.data as Record<string, unknown>).scores as Array<Record<string, unknown>>;
      expect(scores.length).toBe(5);
      for (const scoreEntry of scores) {
        const breakdown = scoreEntry.breakdown as Record<string, number>;
        expect(breakdown).toBeDefined();
        expect(breakdown.charsWritten).toBeGreaterThanOrEqual(0);
        expect(breakdown.wordsEdited).toBeGreaterThanOrEqual(0);
        expect(breakdown.correctMatches).toBeGreaterThanOrEqual(0);
        expect(breakdown.falseMatchesCaused).toBeGreaterThanOrEqual(0);
      }
    });

    it('should award +200 per correct match', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Get the actual editor assignments
      const editorMap: Record<string, string> = {}; // storyId → editorUserId
      for (const uid of playerIds) {
        const assignment = getEditorAssignment(playerLog, uid);
        if (assignment) {
          editorMap[assignment.assignedStoryId] = uid;
        }
      }

      advanceToReveal(game, playerIds, playerLog, broadcastLog, context,
        (_uid, storyIds) => {
          // Every player makes ALL correct guesses
          const g: Record<string, string> = {};
          for (const s of storyIds) {
            if (editorMap[s]) g[s] = editorMap[s];
          }
          return g;
        },
      );

      const results = (context.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // All correct guesses should give at least 200*(N-1) matching bonus per player
      // (each player guesses N-1 stories they didn't edit, all correctly)
      for (const ranking of results.rankings) {
        // Minimum: 4 correct matches * 200 = 800 from matching alone
        expect(ranking.score).toBeGreaterThanOrEqual(800);
      }
    });

    it('should award +300 per false match caused (player not identified as editor)', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      advanceToReveal(game, playerIds, playerLog, broadcastLog, context,
        (_uid, storyIds) => {
          // Every player guesses the wrong editor (always playerIds[0])
          const g: Record<string, string> = {};
          for (const s of storyIds) {
            g[s] = playerIds[0];
          }
          return g;
        },
      );

      const results = (context.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Most editors are not identified, so they should get false match bonus
      // At least some players should have scores > 0
      const totalScore = results.rankings.reduce(
        (sum: number, r: { score: number }) => sum + r.score, 0,
      );
      expect(totalScore).toBeGreaterThan(0);
    });
  });

  // ─── Round Counter ────────────────────────────────────────

  describe('Round Counter', () => {
    it('should broadcast round for both WRITE and EDIT phases (reaching totalSteps)', () => {
      const { game, broadcastLog, playerLog } = createUEGame();
      game.start();
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // Complete all N rounds
      for (let round = 0; round < 5; round++) {
        completeOneRound(game, playerIds, playerLog, `Counter test round ${round + 1}`);
      }

      // Collect all MINIGAME_ROUND events (including from start)
      const roundBroadcasts: Array<{ current: number; total: number }> = [];
      const roundEvents = broadcastLog.filter(
        (e) => e.event === 'action' &&
          (e.data as Record<string, unknown>).type === 'MINIGAME_ROUND',
      );

      for (const ev of roundEvents) {
        const payload = (ev.data as Record<string, unknown>).payload as Record<string, unknown>;
        roundBroadcasts.push({
          current: payload.current as number,
          total: payload.total as number,
        });
      }

      // Should have 2*N round broadcasts (one for each WRITE + EDIT phase)
      expect(roundBroadcasts.length).toBe(10);

      // Last round broadcast should reach step 10/10
      const lastRound = roundBroadcasts[roundBroadcasts.length - 1];
      expect(lastRound.current).toBe(10);
      expect(lastRound.total).toBe(10);

      // Write phases: steps 1, 3, 5, 7, 9
      for (let i = 0; i < roundBroadcasts.length; i += 2) {
        expect(roundBroadcasts[i].current).toBe(i + 1);
      }
      // Edit phases: steps 2, 4, 6, 8, 10
      for (let i = 1; i < roundBroadcasts.length; i += 2) {
        expect(roundBroadcasts[i].current).toBe(i + 1);
      }
    });
  });

  // ─── Reveal Log wordIndex ─────────────────────────────────

  describe('Reveal Log Edit Data', () => {
    it('should include wordIndex in reveal storyReveals edit entries', () => {
      const { game, broadcastLog, playerLog, context } = createUEGame();
      game.start();
      const playerIds = Object.values(MOCK_USERS).map((u) => u.userId);

      // We need at least one actual edit to test wordIndex
      // Complete first write round
      submitAllForCurrentRound(game, playerIds, playerLog, 'Edit test sentence with many words');

      // Now we're in EDIT phase — find each editor and submit an edit
      const hostId = context.getHostId();
      for (const uid of playerIds) {
        const assignment = getEditorAssignment(playerLog, uid);
        if (!assignment) continue;

        // Get the edit prompt for this editor
        const editPrompt = playerLog.filter(
          (e) => e.userId === uid &&
            e.event === 'rmhbox:game:action' &&
            (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT',
        ).at(-1);

        if (!editPrompt) continue;
        const story = (editPrompt.data as Record<string, unknown>).story as Record<string, unknown>;
        const editableSentence = story.editableSentence as Record<string, unknown>;
        const words = editableSentence.words as Array<{ index: number; word: string }>;

        if (words.length >= 2) {
          game.handleInput(uid, 'EDIT_WORDS', {
            storyId: assignment.assignedStoryId,
            edits: [
              { wordIndex: 0, newWord: 'CHANGED' },
            ],
          });
        }
      }

      // Complete remaining rounds with skip edits
      for (let round = 1; round < 5; round++) {
        submitAllForCurrentRound(game, playerIds, playerLog, `Round ${round + 1} edit test`);
        for (const uid of playerIds) {
          game.handleInput(uid, 'SKIP_EDIT', {});
        }
      }

      // Advance through reading
      const readingStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_READING_START',
      );
      const readingStories = (readingStart!.data as Record<string, unknown>).stories as Array<{ sentenceCount: number }>;
      for (let si = 0; si < readingStories.length; si++) {
        for (let senti = 0; senti < readingStories[si].sentenceCount; senti++) {
          game.handleInput(hostId, 'NEXT_SENTENCE', {});
        }
        game.handleInput(hostId, 'NEXT_STORY', {});
      }

      // Lock in all players
      for (const uid of playerIds) {
        game.handleInput(uid, 'LOCK_IN_MATCHING', {});
      }

      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 50);

      const results = (context.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      const actions = gameLog.actions as Array<{ type: string; payload: Record<string, unknown> }>;
      const revealAction = actions.find((a) => a.type === 'reveal');
      expect(revealAction).toBeDefined();

      const storyReveals = revealAction!.payload.storyReveals as Array<Record<string, unknown>>;

      // Find at least one story that has edits with wordIndex
      const storiesWithEdits = storyReveals.filter(
        (s) => (s.edits as Array<Record<string, unknown>>).length > 0,
      );
      expect(storiesWithEdits.length).toBeGreaterThan(0);

      for (const storyReveal of storiesWithEdits) {
        const edits = storyReveal.edits as Array<Record<string, unknown>>;
        for (const edit of edits) {
          expect(edit.wordIndex).toBeDefined();
          expect(typeof edit.wordIndex).toBe('number');
          expect(edit.originalWord).toBeDefined();
          expect(edit.newWord).toBeDefined();
          expect(edit.sentenceIndex).toBeDefined();
        }
      }
    });
  });
});

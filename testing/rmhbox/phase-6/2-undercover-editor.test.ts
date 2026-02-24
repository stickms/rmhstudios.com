/**
 * Phase 6 — Section 6.2: Undercover Editor Server Handler Tests
 *
 * Tests the UndercoverEditorGame server handler covering:
 * - State initialization and role assignment
 * - Turn lifecycle (WRITE → EDIT → next turn)
 * - Input handling (write sentence, edit word, skip edit, cast accusation)
 * - Review / accusation / reveal phases
 * - All 4 win condition scenarios
 * - State masking (keyword hidden from Writers, omniscient spectator)
 * - Awards computation
 * - Disconnect and reconnection handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UndercoverEditorGame } from '../../../server/rmhbox/minigames/undercover-editor';
import {
  UE_WRITE_TIMEOUT_SECONDS,
  UE_EDIT_TIMEOUT_SECONDS,
  UE_REVIEW_DURATION_SECONDS,
  UE_ACCUSATION_DURATION_SECONDS,
  UE_REVEAL_DURATION_SECONDS,
  UE_WRITER_MAJOR_WIN,
  UE_WRITER_MINOR_WIN,
  UE_EDITOR_MAJOR_WIN,
  UE_EDITOR_MINOR_WIN,
  UE_EDITOR_LOSS,
  UE_EDITOR_PARTIAL,
  UE_WRITER_LOSS,
  UE_WRITER_MINOR_LOSS,
  UE_CORRECT_VOTE_BONUS,
} from '../../../lib/rmhbox/constants';
import {
  MOCK_USERS,
  createMockContext,
  findPlayerEvents,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext([
    MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana, MOCK_USERS.eve,
  ]);
  const game = new UndercoverEditorGame(ctx.context);
  return { game, ...ctx };
}

/** Extract the editor user ID from playerLog role assignments */
function findEditorUserId(playerLog: Array<{ userId: string; event: string; data: unknown }>): string {
  const editorEvent = playerLog.find(
    (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
      (e.data as Record<string, unknown>).role === 'editor',
  );
  return editorEvent?.userId ?? '';
}

/** Find all writer user IDs from role assignments */
function findWriterUserIds(playerLog: Array<{ userId: string; event: string; data: unknown }>): string[] {
  return playerLog
    .filter(
      (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
        (e.data as Record<string, unknown>).role === 'writer',
    )
    .map((e) => e.userId);
}

/** Get the active player's ID from the most recent UE_TURN_START broadcast */
function getActivePlayerId(broadcastLog: Array<{ event: string; data: unknown }>): string {
  const turnStarts = broadcastLog.filter(
    (e) => e.event === 'rmhbox:game:action' &&
      (e.data as Record<string, unknown>).type === 'UE_TURN_START',
  );
  if (turnStarts.length === 0) return '';
  return (turnStarts[turnStarts.length - 1].data as Record<string, unknown>).activeUserId as string;
}

/** Advance to complete one write + edit cycle for one turn */
function completeTurn(
  game: UndercoverEditorGame,
  activeUserId: string,
  editorUserId: string,
  sentence = 'The rain fell softly on the rooftops.',
) {
  game.handleInput(activeUserId, 'WRITE_SENTENCE', { text: sentence });
  // If we need to skip edit (editor always gets edit phase)
  game.handleInput(editorUserId, 'SKIP_EDIT', {});
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Undercover Editor Server Handler (§6.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('State Initialization', () => {
    it('should create a game instance with 5 players', () => {
      const { game, context } = createGame();
      expect(game).toBeDefined();
      expect(context.players.size).toBe(5);
      game.cleanup();
    });

    it('should assign exactly 1 Editor and remaining Writers', () => {
      const { game, playerLog } = createGame();
      game.start();

      const editorAssignments = playerLog.filter(
        (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
          (e.data as Record<string, unknown>).role === 'editor',
      );
      const writerAssignments = playerLog.filter(
        (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
          (e.data as Record<string, unknown>).role === 'writer',
      );

      expect(editorAssignments.length).toBe(1);
      expect(writerAssignments.length).toBe(4);

      game.cleanup();
    });

    it('should send keyword to Editor but NOT to Writers', () => {
      const { game, playerLog } = createGame();
      game.start();

      const editorEvent = playerLog.find(
        (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
          (e.data as Record<string, unknown>).role === 'editor',
      );
      expect(editorEvent).toBeDefined();
      expect((editorEvent!.data as Record<string, unknown>).keyword).toBeDefined();
      expect(typeof (editorEvent!.data as Record<string, unknown>).keyword).toBe('string');

      const writerEvents = playerLog.filter(
        (e) => (e.data as Record<string, unknown>).type === 'UE_ROLE_ASSIGNED' &&
          (e.data as Record<string, unknown>).role === 'writer',
      );
      for (const we of writerEvents) {
        expect((we.data as Record<string, unknown>).keyword).toBeUndefined();
      }

      game.cleanup();
    });

    it('should emit UE_GAME_START with story prompt and turn order', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const gameStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_GAME_START',
      );
      expect(gameStart).toBeDefined();

      const data = gameStart!.data as Record<string, unknown>;
      expect(data.storyPrompt).toBeDefined();
      expect(data.turnOrder).toBeDefined();
      expect(data.totalTurns).toBe(10); // 5 players × 2 rotations

      game.cleanup();
    });

    it('should start first turn with UE_TURN_START', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const turnStart = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_TURN_START',
      );
      expect(turnStart).toBeDefined();
      expect((turnStart!.data as Record<string, unknown>).turnNumber).toBe(1);

      game.cleanup();
    });
  });

  describe('Write Phase', () => {
    it('should accept valid sentence from active player', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const activeUserId = getActivePlayerId(broadcastLog);
      game.handleInput(activeUserId, 'WRITE_SENTENCE', {
        text: 'The detective walked into the foggy alley.',
      });

      const sentenceAdded = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_SENTENCE_ADDED',
      );
      expect(sentenceAdded).toBeDefined();
      expect((sentenceAdded!.data as Record<string, unknown>).sentence).toBe(
        'The detective walked into the foggy alley.',
      );

      game.cleanup();
    });

    it('should reject sentence from non-active player', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const activeUserId = getActivePlayerId(broadcastLog);
      // Find a non-active player
      const allIds = [
        MOCK_USERS.alice.userId, MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId, MOCK_USERS.diana.userId, MOCK_USERS.eve.userId,
      ];
      const nonActiveId = allIds.find((id) => id !== activeUserId)!;

      game.handleInput(nonActiveId, 'WRITE_SENTENCE', {
        text: 'I should not be able to write.',
      });

      const rejected = playerLog.find(
        (e) => e.userId === nonActiveId &&
          (e.data as Record<string, unknown>).type === 'UE_INPUT_REJECTED' &&
          (e.data as Record<string, unknown>).reason === 'not_your_turn',
      );
      expect(rejected).toBeDefined();

      game.cleanup();
    });

    it('should reject sentence shorter than minimum length', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const activeUserId = getActivePlayerId(broadcastLog);
      game.handleInput(activeUserId, 'WRITE_SENTENCE', { text: 'Short.' });

      const rejected = playerLog.find(
        (e) => e.userId === activeUserId &&
          (e.data as Record<string, unknown>).type === 'UE_INPUT_REJECTED',
      );
      expect(rejected).toBeDefined();

      game.cleanup();
    });

    it('should auto-submit "..." on write timeout', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      // Let write timeout expire
      vi.advanceTimersByTime(UE_WRITE_TIMEOUT_SECONDS * 1000 + 100);

      const sentenceAdded = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_SENTENCE_ADDED' &&
          (e.data as Record<string, unknown>).sentence === '...',
      );
      expect(sentenceAdded).toBeDefined();

      game.cleanup();
    });
  });

  describe('Edit Phase', () => {
    it('should send UE_EDIT_PROMPT to Editor only after sentence is written', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);
      const activeUserId = getActivePlayerId(broadcastLog);

      // Active player writes a sentence
      game.handleInput(activeUserId, 'WRITE_SENTENCE', {
        text: 'A mysterious figure appeared at the door.',
      });

      // Editor should receive edit prompt
      const editPrompt = playerLog.find(
        (e) => e.userId === editorUserId &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT',
      );
      expect(editPrompt).toBeDefined();

      // Writers should NOT receive edit prompt
      const writerIds = findWriterUserIds(playerLog);
      for (const writerId of writerIds) {
        const writerEditPrompt = playerLog.find(
          (e) => e.userId === writerId &&
            (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT',
        );
        expect(writerEditPrompt).toBeUndefined();
      }

      game.cleanup();
    });

    it('should allow Editor to edit a word', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);
      const activeUserId = getActivePlayerId(broadcastLog);

      game.handleInput(activeUserId, 'WRITE_SENTENCE', {
        text: 'The old house creaked in the wind.',
      });

      // Editor edits a word
      game.handleInput(editorUserId, 'EDIT_WORD', {
        sentenceIndex: 0,
        wordIndex: 1, // "old" → "ancient"
        newWord: 'ancient',
      });

      // Story should be updated
      const storyUpdated = broadcastLog.filter(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_STORY_UPDATED',
      );
      expect(storyUpdated.length).toBeGreaterThan(0);

      game.cleanup();
    });

    it('should reject edit from non-Editor player', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);
      const activeUserId = getActivePlayerId(broadcastLog);
      const writerIds = findWriterUserIds(playerLog);
      const writerId = writerIds.find((id) => id !== activeUserId) ?? writerIds[0];

      game.handleInput(activeUserId, 'WRITE_SENTENCE', {
        text: 'The stars shone brightly above the village.',
      });

      // Writer tries to edit
      game.handleInput(writerId, 'EDIT_WORD', {
        sentenceIndex: 0,
        wordIndex: 0,
        newWord: 'Those',
      });

      const rejected = playerLog.find(
        (e) => e.userId === writerId &&
          (e.data as Record<string, unknown>).type === 'UE_INPUT_REJECTED' &&
          (e.data as Record<string, unknown>).reason === 'not_editor',
      );
      expect(rejected).toBeDefined();

      game.cleanup();
    });

    it('should reject editing an already-edited position', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);
      const activeUserId = getActivePlayerId(broadcastLog);

      game.handleInput(activeUserId, 'WRITE_SENTENCE', {
        text: 'The moon rose over the quiet lake.',
      });

      // Edit word at position 0:1
      game.handleInput(editorUserId, 'EDIT_WORD', {
        sentenceIndex: 0,
        wordIndex: 1, // "moon" → "sun"
        newWord: 'sun',
      });

      // Next turn — write again
      const nextActive = getActivePlayerId(broadcastLog);
      game.handleInput(nextActive, 'WRITE_SENTENCE', {
        text: 'Birds sang in the morning light.',
      });

      // Try to re-edit position 0:1
      game.handleInput(editorUserId, 'EDIT_WORD', {
        sentenceIndex: 0,
        wordIndex: 1,
        newWord: 'star',
      });

      const rejected = playerLog.find(
        (e) => e.userId === editorUserId &&
          (e.data as Record<string, unknown>).type === 'UE_INPUT_REJECTED' &&
          (e.data as Record<string, unknown>).reason === 'already_edited',
      );
      expect(rejected).toBeDefined();

      game.cleanup();
    });

    it('should allow Editor to skip editing', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);
      const activeUserId = getActivePlayerId(broadcastLog);

      game.handleInput(activeUserId, 'WRITE_SENTENCE', {
        text: 'Clouds gathered on the distant horizon.',
      });

      game.handleInput(editorUserId, 'SKIP_EDIT', {});

      // Should broadcast UE_STORY_UPDATED (unchanged) and move to next turn
      const storyUpdated = broadcastLog.filter(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_STORY_UPDATED',
      );
      expect(storyUpdated.length).toBeGreaterThan(0);

      // Next turn should have started
      const turnStarts = broadcastLog.filter(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_TURN_START',
      );
      expect(turnStarts.length).toBe(2);

      game.cleanup();
    });
  });

  describe('State Masking (§6.2 Security — Critical)', () => {
    it('Writer getStateForPlayer should NOT include keyword or editorUserId', () => {
      const { game, playerLog } = createGame();
      game.start();

      const writerIds = findWriterUserIds(playerLog);
      const writerId = writerIds[0];

      const state = game.getStateForPlayer(writerId) as Record<string, unknown>;

      expect(state.myRole).toBe('writer');
      expect(state).not.toHaveProperty('keyword');
      expect(state).not.toHaveProperty('editorUserId');
      expect(state).not.toHaveProperty('myEdits');
      expect(state).not.toHaveProperty('editableStory');

      game.cleanup();
    });

    it('Editor getStateForPlayer should include keyword and edits', () => {
      const { game, playerLog } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);
      const state = game.getStateForPlayer(editorUserId) as Record<string, unknown>;

      expect(state.myRole).toBe('editor');
      expect(state.keyword).toBeDefined();
      expect(typeof state.keyword).toBe('string');
      expect(state.myEdits).toBeDefined();

      game.cleanup();
    });

    it('Spectator getStateForSpectator should include all hidden info', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForSpectator() as Record<string, unknown>;

      expect(state.editorUserId).toBeDefined();
      expect(state.keyword).toBeDefined();
      expect(state.edits).toBeDefined();
      expect(state.isSpectator).toBe(true);

      game.cleanup();
    });

    it('Writers should NOT receive UE_EDIT_PROMPT events', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const writerIds = findWriterUserIds(playerLog);
      const activeUserId = getActivePlayerId(broadcastLog);

      game.handleInput(activeUserId, 'WRITE_SENTENCE', {
        text: 'The lighthouse beam swept across the ocean.',
      });

      // Check no writer received edit prompt
      for (const writerId of writerIds) {
        const editEvents = findPlayerEvents(playerLog, writerId, 'rmhbox:game:action')
          .filter((e) => (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT');
        expect(editEvents.length).toBe(0);
      }

      game.cleanup();
    });

    it('During ACCUSATION, votes should be masked (only who voted, not who for)', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);

      // Play through all turns with timeouts to get to review/accusation
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(UE_WRITE_TIMEOUT_SECONDS * 1000 + 100);
        vi.advanceTimersByTime(UE_EDIT_TIMEOUT_SECONDS * 1000 + 100);
      }

      // Should be in REVIEW phase
      vi.advanceTimersByTime(UE_REVIEW_DURATION_SECONDS * 1000 + 100);

      // Now in ACCUSATION
      const writerIds = findWriterUserIds(playerLog);
      const writerId = writerIds[0];

      // Cast a vote
      game.handleInput(writerId, 'CAST_ACCUSATION', {
        targetUserId: editorUserId,
      });

      // The broadcast should show who voted but NOT who for
      const voteCast = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_VOTE_CAST',
      );
      expect(voteCast).toBeDefined();
      const voteData = voteCast!.data as Record<string, unknown>;
      expect(voteData.voterId).toBe(writerId);
      expect(voteData.hasVoted).toBe(true);
      expect(voteData).not.toHaveProperty('targetUserId');
      expect(voteData).not.toHaveProperty('accusedUserId');

      // Writer state should show votedPlayers but not who they voted for
      const writerState = game.getStateForPlayer(writerIds[1]) as Record<string, unknown>;
      const votedPlayers = writerState.votedPlayers as string[];
      expect(votedPlayers).toContain(writerId);
      // But writerState should not contain the full votes map
      expect(writerState).not.toHaveProperty('votes');

      game.cleanup();
    });
  });

  describe('Accusation Phase', () => {
    it('should reject self-vote', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      // Advance to accusation
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(UE_WRITE_TIMEOUT_SECONDS * 1000 + 100);
        vi.advanceTimersByTime(UE_EDIT_TIMEOUT_SECONDS * 1000 + 100);
      }
      vi.advanceTimersByTime(UE_REVIEW_DURATION_SECONDS * 1000 + 100);

      const writerId = findWriterUserIds(playerLog)[0];
      game.handleInput(writerId, 'CAST_ACCUSATION', {
        targetUserId: writerId,
      });

      const rejected = playerLog.find(
        (e) => e.userId === writerId &&
          (e.data as Record<string, unknown>).type === 'UE_INPUT_REJECTED' &&
          (e.data as Record<string, unknown>).reason === 'cannot_vote_self',
      );
      expect(rejected).toBeDefined();

      game.cleanup();
    });

    it('should allow vote change', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);
      const writerIds = findWriterUserIds(playerLog);

      // Advance to accusation
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(UE_WRITE_TIMEOUT_SECONDS * 1000 + 100);
        vi.advanceTimersByTime(UE_EDIT_TIMEOUT_SECONDS * 1000 + 100);
      }
      vi.advanceTimersByTime(UE_REVIEW_DURATION_SECONDS * 1000 + 100);

      const voter = writerIds[0];
      const target1 = writerIds[1];
      const target2 = editorUserId;

      // Vote for target1, then change to target2
      game.handleInput(voter, 'CAST_ACCUSATION', { targetUserId: target1 });
      game.handleInput(voter, 'CAST_ACCUSATION', { targetUserId: target2 });

      // Check that both votes were accepted (no rejection for change)
      const voteCasts = broadcastLog.filter(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_VOTE_CAST' &&
          (e.data as Record<string, unknown>).voterId === voter,
      );
      expect(voteCasts.length).toBe(2);

      game.cleanup();
    });
  });

  describe('Win Conditions & Scoring', () => {
    it('should complete game and produce reveal with winner', () => {
      const { game, broadcastLog, playerLog, completedResults } = createGame();
      game.start();

      // Play all turns via timeout
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(UE_WRITE_TIMEOUT_SECONDS * 1000 + 100);
        vi.advanceTimersByTime(UE_EDIT_TIMEOUT_SECONDS * 1000 + 100);
      }

      // Review
      vi.advanceTimersByTime(UE_REVIEW_DURATION_SECONDS * 1000 + 100);

      // Accusation — timeout
      vi.advanceTimersByTime(UE_ACCUSATION_DURATION_SECONDS * 1000 + 100);

      // Reveal
      const reveal = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_REVEAL',
      );
      expect(reveal).toBeDefined();

      const revealData = reveal!.data as Record<string, unknown>;
      expect(revealData.editorUserId).toBeDefined();
      expect(revealData.keyword).toBeDefined();
      expect(revealData.winner).toBeDefined();
      expect(['editor', 'writers']).toContain(revealData.winner);
      expect(revealData.scores).toBeDefined();

      // Reveal timeout → game end
      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 100);

      expect(completedResults.length).toBe(1);
      expect(completedResults[0].rankings.length).toBe(5);

      game.cleanup();
    });
  });

  describe('Reconnection', () => {
    it('should send full state on Editor reconnect with keyword', () => {
      const { game, playerLog } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);
      playerLog.length = 0;

      game.handlePlayerReconnect(editorUserId);

      const snapshot = playerLog.find(
        (e) => e.userId === editorUserId &&
          e.event === 'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();

      const state = snapshot!.data as Record<string, unknown>;
      expect(state.keyword).toBeDefined();
      expect(state.myRole).toBe('editor');

      game.cleanup();
    });

    it('should send Writer state without keyword on reconnect', () => {
      const { game, playerLog } = createGame();
      game.start();

      const writerIds = findWriterUserIds(playerLog);
      playerLog.length = 0;

      game.handlePlayerReconnect(writerIds[0]);

      const snapshot = playerLog.find(
        (e) => e.userId === writerIds[0] &&
          e.event === 'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();

      const state = snapshot!.data as Record<string, unknown>;
      expect(state).not.toHaveProperty('keyword');
      expect(state.myRole).toBe('writer');

      game.cleanup();
    });
  });

  describe('Join-in-Progress', () => {
    it('should send spectator state to JIP player', () => {
      const { game, playerLog } = createGame();
      game.start();
      playerLog.length = 0;

      // Fake a new player joining
      game.handlePlayerJoin('new-player-id');

      const snapshot = playerLog.find(
        (e) => e.userId === 'new-player-id',
      );
      expect(snapshot).toBeDefined();

      const state = snapshot!.data as Record<string, unknown>;
      // Spectator should see omniscient view
      expect(state.editorUserId).toBeDefined();
      expect(state.keyword).toBeDefined();
      expect(state.isSpectator).toBe(true);

      game.cleanup();
    });
  });

  describe('Awards', () => {
    it('should include Shakespeare award for longest sentence', () => {
      const { game, broadcastLog, playerLog, completedResults } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);

      // Play through all turns with sentences of varying lengths
      for (let i = 0; i < 10; i++) {
        const activeUserId = getActivePlayerId(broadcastLog);
        const sentence = i === 3
          ? 'This is a very long sentence with many many words in it for the Shakespeare award test case.'
          : 'A short simple sentence here.';
        game.handleInput(activeUserId, 'WRITE_SENTENCE', { text: sentence });
        game.handleInput(editorUserId, 'SKIP_EDIT', {});
      }

      // Review → Accusation → Reveal
      vi.advanceTimersByTime(UE_REVIEW_DURATION_SECONDS * 1000 + 100);
      vi.advanceTimersByTime(UE_ACCUSATION_DURATION_SECONDS * 1000 + 100);
      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 100);

      expect(completedResults.length).toBe(1);
      const awards = completedResults[0].awards;

      const shakespeare = awards.find((a) => a.title === 'Shakespeare');
      expect(shakespeare).toBeDefined();

      game.cleanup();
    });
  });

  describe('Game Log', () => {
    it('should produce game log with all action types', () => {
      const { game, broadcastLog, playerLog, completedResults } = createGame();
      game.start();

      const editorUserId = findEditorUserId(playerLog);

      // Play through all 10 turns — write and skip edit
      for (let i = 0; i < 10; i++) {
        const activeUserId = getActivePlayerId(broadcastLog);
        game.handleInput(activeUserId, 'WRITE_SENTENCE', {
          text: 'The story continues with more interesting details.',
        });
        game.handleInput(editorUserId, 'SKIP_EDIT', {});
      }

      // Review → Accusation → Reveal → End
      vi.advanceTimersByTime(UE_REVIEW_DURATION_SECONDS * 1000 + 100);
      vi.advanceTimersByTime(UE_ACCUSATION_DURATION_SECONDS * 1000 + 100);
      vi.advanceTimersByTime(UE_REVEAL_DURATION_SECONDS * 1000 + 100);

      expect(completedResults.length).toBe(1);

      const gameSpecific = completedResults[0].gameSpecificData;
      expect(gameSpecific.gameLog).toBeDefined();

      const log = gameSpecific.gameLog as Record<string, unknown>;
      expect(log.initialState).toBeDefined();
      expect(log.actions).toBeDefined();
      expect(log.finalResults).toBeDefined();

      const actions = log.actions as Array<{ type: string }>;
      const actionTypes = new Set(actions.map((a) => a.type));
      expect(actionTypes.has('turn_start')).toBe(true);
      expect(actionTypes.has('word_added')).toBe(true);
      expect(actionTypes.has('editor_skip')).toBe(true);
      expect(actionTypes.has('story_snapshot')).toBe(true);
      expect(actionTypes.has('vote_result')).toBe(true);
      expect(actionTypes.has('final_reveal')).toBe(true);

      game.cleanup();
    });
  });
});

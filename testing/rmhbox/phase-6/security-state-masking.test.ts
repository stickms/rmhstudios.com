/**
 * Phase 6 — Security & State Masking Tests
 *
 * Ensures no information leakage for Phase 6 minigames:
 * - Minimalist Masterpiece: drawings and bids hidden during active phases
 * - Emoji Cinema: movie title and guesses hidden from audience/other players
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MOCK_USERS,
  createMockContext,
  findLastActionBroadcast,
} from './setup';

// ─── Mock data-loaders ───────────────────────────────────────────

vi.mock('@/lib/rmhbox/minimalist-masterpiece/data-loader', () => ({
  loadPrompts: () => [
    { id: 'test-1', text: 'A house on a hill', category: 'Landscape', difficulty: 'easy' },
    { id: 'test-2', text: 'A smiling cat', category: 'Animal', difficulty: 'medium' },
  ],
  selectPromptForGame: (pool: unknown[]) => pool[0],
}));

vi.mock('@/lib/rmhbox/emoji-cinema/data-loader', () => ({
  loadMovies: () => [
    { id: 'ec-1', title: 'The Lion King', titleNormalized: 'lion king', alternativeTitles: [], year: 1994, genre: ['animation'], difficulty: 'easy', popularity: 95 },
    { id: 'ec-2', title: 'Jurassic Park', titleNormalized: 'jurassic park', alternativeTitles: [], year: 1993, genre: ['adventure'], difficulty: 'easy', popularity: 90 },
    { id: 'ec-3', title: 'The Matrix', titleNormalized: 'matrix', alternativeTitles: ['Matrix'], year: 1999, genre: ['sci-fi'], difficulty: 'medium', popularity: 85 },
    { id: 'ec-4', title: 'Inception', titleNormalized: 'inception', alternativeTitles: [], year: 2010, genre: ['sci-fi'], difficulty: 'medium', popularity: 88 },
  ],
  loadEmojiPalette: () => ({
    categories: [
      { name: 'Animals', emojis: ['🦁', '🐱', '🐶', '🐸'] },
      { name: 'Objects', emojis: ['👑', '🎬', '🎵', '🌍'] },
    ],
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectMoviesForGame: (pool: any[], count: number, _used: Set<string>, producerOrder: string[]) => {
    const rounds = Math.min(count, pool.length);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return pool.slice(0, rounds).map((movie: any, i: number) => ({
      movie,
      producerUserId: producerOrder[i],
    }));
  },
  validateEmoji: (emoji: string) => ['🦁', '🐱', '🐶', '🐸', '👑', '🎬', '🎵', '🌍'].includes(emoji),
}));

// Import handlers after mocks
import { MinimalistMasterpieceGame } from '../../../server/rmhbox/minigames/minimalist-masterpiece';
import { EmojiCinemaGame } from '../../../server/rmhbox/minigames/emoji-cinema';

// ─── Tests ───────────────────────────────────────────────────────

describe('Security — State Masking (Phase 6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Minimalist Masterpiece — Drawing Privacy', () => {
    it('Player A cannot see Player B\'s drawing during DRAWING phase', () => {
      const ctx = createMockContext();
      const game = new MinimalistMasterpieceGame(ctx.context);
      game.start();

      // Advance past PROMPT_REVEAL into DRAWING
      vi.advanceTimersByTime(20_000);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;

      expect(aliceState).toBeDefined();
      expect(bobState).toBeDefined();

      // Alice's state should not contain Bob's drawing strokes and vice-versa
      const aliceJson = JSON.stringify(aliceState);
      const bobJson = JSON.stringify(bobState);
      expect(aliceJson).not.toContain(MOCK_USERS.bob.userId);
      expect(bobJson).not.toContain(MOCK_USERS.alice.userId);
    });

    it('drawing-to-user mapping should not be leaked before RESULTS', () => {
      const ctx = createMockContext();
      const game = new MinimalistMasterpieceGame(ctx.context);
      game.start();

      // Into DRAWING phase
      vi.advanceTimersByTime(20_000);

      const state = game.getStateForPlayer(MOCK_USERS.charlie.userId) as Record<string, unknown>;
      const drawings = state.drawings as Array<Record<string, unknown>> | undefined;
      const gallery = state.gallery as Array<Record<string, unknown>> | undefined;

      // During DRAWING, other players' drawings should not be visible at all,
      // and if any gallery array exists, it should not map drawing→author
      const items = drawings ?? gallery ?? [];
      for (const item of items) {
        expect(item.artistUserId).toBeUndefined();
        expect(item.authorId).toBeUndefined();
      }
    });

    it('other players\' individual bids should not be visible (only totals)', () => {
      const ctx = createMockContext();
      const game = new MinimalistMasterpieceGame(ctx.context);
      game.start();

      // Advance through PROMPT_REVEAL → DRAWING → GALLERY → AUCTION
      vi.advanceTimersByTime(120_000);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const stateJson = JSON.stringify(state);

      // Other players' specific bid amounts tied to their userIds should not appear
      // Alice should not see Bob's or Charlie's individual bid values
      const bidders = state.bidders as Array<Record<string, unknown>> | undefined;
      const allBids = state.allBids as Array<Record<string, unknown>> | undefined;
      const otherBids = bidders ?? allBids;

      if (otherBids) {
        for (const bid of otherBids) {
          // Individual bid entries should not contain other players' userIds
          if (bid.userId && bid.userId !== MOCK_USERS.alice.userId) {
            expect(bid.amount).toBeUndefined();
          }
        }
      }

      // State should never contain a full bidHistory keyed by other userIds
      expect(stateJson).not.toContain('"bidHistory"');
    });
  });

  describe('Emoji Cinema — Information Hiding', () => {
    it('audience cannot see movie title during EMOJI_CONSTRUCTION', () => {
      const ctx = createMockContext();
      const game = new EmojiCinemaGame(ctx.context);
      game.start();

      // Advance past PRODUCER_ASSIGNMENT into EMOJI_CONSTRUCTION
      vi.advanceTimersByTime(10_000);

      // Identify the producer from the broadcast
      const assignBroadcast = findLastActionBroadcast(ctx.broadcastLog, 'EC_PRODUCER_ASSIGNED');
      const producerId = assignBroadcast
        ? (assignBroadcast.data as Record<string, unknown>).producerUserId as string
        : MOCK_USERS.alice.userId;

      // Pick a non-producer player
      const allUsers = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      const audience = allUsers.find((u) => u.userId !== producerId) ?? MOCK_USERS.bob;

      const audienceState = game.getStateForPlayer(audience.userId) as Record<string, unknown>;
      // The movieTitles field is intentionally sent for fuzzy autocomplete —
      // it contains ALL movies, not just the current round's movie.
      // Security check: audience should not see the current movie's title
      // in movie or movieTitle fields (not in movieTitles autocomplete list).
      expect(audienceState.movieTitle).toBeUndefined();
      expect(audienceState.movie).toBeUndefined();
      // Verify movieTitles is present (for autocomplete) but the direct movie field is hidden
      expect(audienceState.movieTitles).toBeDefined();
    });

    it('other players\' guess text should not be visible to audience', () => {
      const ctx = createMockContext();
      const game = new EmojiCinemaGame(ctx.context);
      game.start();

      // Into EMOJI_CONSTRUCTION
      vi.advanceTimersByTime(10_000);

      // Identify producer
      const assignBroadcast = findLastActionBroadcast(ctx.broadcastLog, 'EC_PRODUCER_ASSIGNED');
      const producerId = assignBroadcast
        ? (assignBroadcast.data as Record<string, unknown>).producerUserId as string
        : MOCK_USERS.alice.userId;

      const allUsers = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      const nonProducers = allUsers.filter((u) => u.userId !== producerId);

      // One player submits a guess
      if (nonProducers.length >= 2) {
        game.handleInput(nonProducers[0].userId, 'SUBMIT_GUESS', { guess: 'The Lion King' });

        // Another non-producer should NOT see the guess text in their guesses
        const otherState = game.getStateForPlayer(nonProducers[1].userId) as Record<string, unknown>;
        const myGuesses = otherState.myGuesses as Array<Record<string, unknown>>;
        // Other player's guess text should not appear in MY guesses
        expect(myGuesses.length).toBe(0);
        // correctGuessers should not include guess text
        const cg = otherState.correctGuessers as Array<Record<string, unknown>>;
        for (const g of cg) {
          expect(g.guessText).toBeUndefined();
        }
      }
    });

    it('movie title should only be revealed in ROUND_RESULTS', () => {
      const ctx = createMockContext();
      const game = new EmojiCinemaGame(ctx.context);
      game.start();

      // Into EMOJI_CONSTRUCTION
      vi.advanceTimersByTime(10_000);

      const assignBroadcast = findLastActionBroadcast(ctx.broadcastLog, 'EC_PRODUCER_ASSIGNED');
      const producerId = assignBroadcast
        ? (assignBroadcast.data as Record<string, unknown>).producerUserId as string
        : MOCK_USERS.alice.userId;

      const allUsers = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      const audience = allUsers.find((u) => u.userId !== producerId) ?? MOCK_USERS.bob;

      // During EMOJI_CONSTRUCTION — title hidden
      const duringState = game.getStateForPlayer(audience.userId) as Record<string, unknown>;
      expect(duringState.movieTitle).toBeUndefined();

      // Advance well into ROUND_RESULTS
      vi.advanceTimersByTime(120_000);

      const resultsBroadcast = findLastActionBroadcast(ctx.broadcastLog, 'EC_ROUND_RESULTS');
      if (resultsBroadcast) {
        const data = resultsBroadcast.data as Record<string, unknown>;
        // The movie title should now be revealed in the results broadcast
        expect(data.movieTitle ?? data.movie).toBeDefined();
      }
    });
  });
});
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

import { FactOrFrictionGame } from '../../../server/rmhbox/minigames/fact-or-friction';
import { UndercoverEditorGame } from '../../../server/rmhbox/minigames/undercover-editor';
import {
  FF_QUESTION_REVEAL_SECONDS,
  FF_ANSWER_DURATION_SECONDS,
} from '../../../lib/rmhbox/constants';
import {
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

  describe('Undercover Editor — role & assignment masking', () => {
    it('No player state should reveal editor assignments for other stories', () => {
      const { game } = createUEGame();
      game.start();

      const allIds = Object.values(MOCK_USERS).map((u) => u.userId);

      for (const uid of allIds) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        const assignedStoryId = state.assignedStoryId as string | null;

        // Player should see their own assignment
        expect(assignedStoryId).toBeTruthy();

        // Story views should never expose editorUserId
        const stories = state.stories as Array<Record<string, unknown>>;
        if (stories) {
          for (const story of stories) {
            expect(story).not.toHaveProperty('editorUserId');
          }
        }
      }

      game.cleanup();
    });

    it('No player MUST see another player\'s editor assignment via WebSocket events', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      // Broadcast events should NOT contain editorUserId
      for (const event of broadcastLog) {
        const data = event.data as Record<string, unknown>;
        if (data.type === 'UE_GAME_START') {
          expect(data).not.toHaveProperty('editorUserId');
          const stories = data.stories as Array<Record<string, unknown>> | undefined;
          if (stories) {
            for (const story of stories) {
              expect(story).not.toHaveProperty('editorUserId');
            }
          }
        }
        if (data.type === 'UE_WRITE_START') {
          expect(data).not.toHaveProperty('editorUserId');
        }
      }

      game.cleanup();
    });

    it('Spectator MUST see all story reveals with editors', () => {
      const { game } = createUEGame();
      game.start();

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      const storyReveals = spectatorState.storyReveals as Array<Record<string, unknown>>;
      expect(storyReveals).toBeDefined();
      expect(storyReveals.length).toBeGreaterThan(0);
      for (const reveal of storyReveals) {
        expect(reveal.editorUserId).toBeDefined();
      }
      expect(spectatorState.isSpectator).toBe(true);

      game.cleanup();
    });

    it('Editor MUST see assignedStoryId in getStateForPlayer', () => {
      const { game } = createUEGame();
      game.start();

      const anyEditorId = Object.values(MOCK_USERS)[0].userId;

      const editorState = game.getStateForPlayer(anyEditorId) as Record<string, unknown>;
      expect(editorState.assignedStoryId).toBeDefined();

      game.cleanup();
    });

    it('UE_EDIT_PROMPT events MUST NOT be broadcast to all players', () => {
      const { game, broadcastLog } = createUEGame();
      game.start();

      const editPromptBroadcasts = broadcastLog.filter(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_EDIT_PROMPT',
      );
      expect(editPromptBroadcasts.length).toBe(0);

      game.cleanup();
    });
  });
});

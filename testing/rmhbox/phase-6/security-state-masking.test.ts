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
      const assignBroadcast = findLastActionBroadcast(ctx.broadcastLog, 'EC_ROUND_START');
      const producerId = assignBroadcast
        ? (assignBroadcast.data as Record<string, unknown>).producerUserId as string
        : MOCK_USERS.alice.userId;

      // Pick a non-producer player
      const allUsers = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      const audience = allUsers.find((u) => u.userId !== producerId) ?? MOCK_USERS.bob;

      const audienceState = game.getStateForPlayer(audience.userId) as Record<string, unknown>;
      const stateJson = JSON.stringify(audienceState);

      // Audience should not see the movie title
      expect(audienceState.movieTitle).toBeUndefined();
      expect(audienceState.movie).toBeUndefined();
      expect(stateJson).not.toContain('The Lion King');
      expect(stateJson).not.toContain('Jurassic Park');
    });

    it('other players\' guess text should not be visible to audience', () => {
      const ctx = createMockContext();
      const game = new EmojiCinemaGame(ctx.context);
      game.start();

      // Into EMOJI_CONSTRUCTION
      vi.advanceTimersByTime(10_000);

      // Identify producer
      const assignBroadcast = findLastActionBroadcast(ctx.broadcastLog, 'EC_ROUND_START');
      const producerId = assignBroadcast
        ? (assignBroadcast.data as Record<string, unknown>).producerUserId as string
        : MOCK_USERS.alice.userId;

      const allUsers = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      const nonProducers = allUsers.filter((u) => u.userId !== producerId);

      // One player submits a guess
      if (nonProducers.length >= 2) {
        game.handleInput(nonProducers[0].userId, 'SUBMIT_GUESS', { guess: 'The Lion King' });

        // Another non-producer should NOT see the guess text
        const otherState = game.getStateForPlayer(nonProducers[1].userId) as Record<string, unknown>;
        const otherJson = JSON.stringify(otherState);
        expect(otherJson).not.toContain('The Lion King');
      }
    });

    it('movie title should only be revealed in ROUND_RESULTS', () => {
      const ctx = createMockContext();
      const game = new EmojiCinemaGame(ctx.context);
      game.start();

      // Into EMOJI_CONSTRUCTION
      vi.advanceTimersByTime(10_000);

      const assignBroadcast = findLastActionBroadcast(ctx.broadcastLog, 'EC_ROUND_START');
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

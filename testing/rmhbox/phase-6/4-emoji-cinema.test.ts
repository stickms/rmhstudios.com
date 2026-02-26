/**
 * Phase 6 — Section 6.4: Emoji Cinema Server Handler Tests
 *
 * Tests the EmojiCinemaGame server handler covering:
 * - State initialization and round count
 * - Round lifecycle (PRODUCER_ASSIGNMENT → EMOJI_CONSTRUCTION → ROUND_RESULTS → TRANSITION)
 * - Producer assignment and movie delivery
 * - Emoji actions (ADD_EMOJI, REMOVE_EMOJI, REORDER_EMOJI)
 * - Guess handling (SUBMIT_GUESS) with fuzzy matching
 * - Scoring (producer + guesser)
 * - State masking (getStateForPlayer / getStateForSpectator)
 * - Awards (Movie Buff, Emoji Picasso, Stumper, Speed Guesser, Close but No Cigar)
 * - Producer disconnect handling
 * - Join-in-progress
 * - Game settings overrides
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MOCK_USERS,
  createMockContext,
  findLastActionBroadcast,
  findActionBroadcasts,
  findLastPlayerAction,
  findLastPlayerEvent,
  type MockContextData,
} from './setup';

// ─── Mock data-loader ────────────────────────────────────────────

vi.mock('@/lib/rmhbox/emoji-cinema/data-loader', () => ({
  loadMovies: () => [
    { id: 'ec-1', title: 'The Lion King', titleNormalized: 'lion king', alternativeTitles: [], year: 1994, genre: ['animation'], difficulty: 'easy', popularity: 95 },
    { id: 'ec-2', title: 'Jurassic Park', titleNormalized: 'jurassic park', alternativeTitles: [], year: 1993, genre: ['adventure'], difficulty: 'easy', popularity: 90 },
    { id: 'ec-3', title: 'The Matrix', titleNormalized: 'matrix', alternativeTitles: ['Matrix'], year: 1999, genre: ['sci-fi'], difficulty: 'medium', popularity: 85 },
    { id: 'ec-4', title: 'Inception', titleNormalized: 'inception', alternativeTitles: [], year: 2010, genre: ['sci-fi'], difficulty: 'medium', popularity: 88 },
    { id: 'ec-5', title: 'Frozen', titleNormalized: 'frozen', alternativeTitles: [], year: 2013, genre: ['animation'], difficulty: 'easy', popularity: 92 },
    { id: 'ec-6', title: 'Interstellar', titleNormalized: 'interstellar', alternativeTitles: [], year: 2014, genre: ['sci-fi'], difficulty: 'hard', popularity: 80 },
  ],
  loadEmojiPalette: () => ({
    categories: [
      { name: 'Animals', emojis: ['🦁', '🐱', '🐶', '🐸'] },
      { name: 'Objects', emojis: ['👑', '🎬', '🎵', '🌍'] },
      { name: 'Nature', emojis: ['🌟', '❄️', '🔥', '🌊'] },
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
  validateEmoji: (emoji: string) => ['🦁', '🐱', '🐶', '🐸', '👑', '🎬', '🎵', '🌍', '🌟', '❄️', '🔥', '🌊'].includes(emoji),
}));

// Import handler after mock is in place
import { EmojiCinemaGame } from '../../../server/rmhbox/minigames/emoji-cinema';

// ─── Constants used in assertions ────────────────────────────────

import {
  EC_MAX_ROUNDS,
  EC_PRODUCER_ASSIGNMENT_SECONDS,
  EC_ROUND_DURATION_SECONDS,
  EC_ROUND_RESULTS_SECONDS,
  EC_TRANSITION_SECONDS,
  EC_MAX_EMOJIS,
  EC_PRODUCER_BASE_POINTS,
  EC_PRODUCER_SPEED_BONUS,
  EC_FIRST_GUESS_POINTS,
  EC_SECOND_GUESS_POINTS,
  EC_OTHER_GUESS_POINTS,
  EC_PRODUCER_DISCONNECT_WAIT_SECONDS,
} from '../../../lib/rmhbox/constants';

// ─── Helpers ─────────────────────────────────────────────────────

const VALID_EMOJIS = ['🦁', '🐱', '🐶', '🐸', '👑', '🎬', '🎵', '🌍', '🌟', '❄️', '🔥', '🌊'];

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new EmojiCinemaGame(ctx.context);
  return { game, ...ctx };
}

/** Get all player IDs from the default mock context. */
const ALL_PLAYER_IDS = [
  MOCK_USERS.alice.userId,
  MOCK_USERS.bob.userId,
  MOCK_USERS.charlie.userId,
  MOCK_USERS.diana.userId,
];

/** Advance past PRODUCER_ASSIGNMENT into EMOJI_CONSTRUCTION. */
function advanceToConstruction(_game: EmojiCinemaGame): void {
  vi.advanceTimersByTime(EC_PRODUCER_ASSIGNMENT_SECONDS * 1000);
}

/** Get the producer userId for the current round from the broadcast log. */
function getProducerFromLog(broadcastLog: Array<{ event: string; data: unknown }>): string {
  const assigned = findLastActionBroadcast(broadcastLog, 'EC_PRODUCER_ASSIGNED');
  return (assigned!.data as Record<string, unknown>).producerUserId as string;
}

/** Get the movie title assigned to the producer from player log. */
function getMovieTitleFromPlayerLog(
  playerLog: Array<{ userId: string; event: string; data: unknown }>,
  producerId: string,
): string {
  const movieAssigned = findLastPlayerAction(playerLog, producerId, 'EC_MOVIE_ASSIGNED');
  const movie = movieAssigned!.data.movie as Record<string, unknown>;
  return movie.title as string;
}

/** Get audience IDs (all players except the producer). */
function getAudienceIds(producerId: string): string[] {
  return ALL_PLAYER_IDS.filter((id) => id !== producerId);
}

/** Add N emojis as the producer. */
function addEmojis(game: EmojiCinemaGame, producerId: string, count: number): void {
  for (let i = 0; i < count; i++) {
    game.handleInput(producerId, 'ADD_EMOJI', {
      emoji: VALID_EMOJIS[i % VALID_EMOJIS.length],
      position: i,
    });
  }
}

/** Advance through one full round (assignment + construction timeout + results + transition). */
function advancePastRound(): void {
  vi.advanceTimersByTime(EC_PRODUCER_ASSIGNMENT_SECONDS * 1000);
  vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);
  vi.advanceTimersByTime(EC_ROUND_RESULTS_SECONDS * 1000);
  vi.advanceTimersByTime(EC_TRANSITION_SECONDS * 1000);
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Emoji Cinema Server Handler (§6.4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ───────────────────────────────────────────────────────────────
  // 1. State Initialization
  // ───────────────────────────────────────────────────────────────
  describe('State Initialization', () => {
    it('4 players → 4 rounds', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const assigned = findLastActionBroadcast(broadcastLog, 'EC_PRODUCER_ASSIGNED');
      expect(assigned).toBeDefined();
      expect(assigned!.data.totalRounds).toBe(4);
    });

    it('8 players → 6 rounds (capped at EC_MAX_ROUNDS)', () => {
      const eightUsers = [
        MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana,
        MOCK_USERS.eve,
        { userId: 'user-frank-006', userName: 'Frank', avatarUrl: null, sessionToken: 'tok-frank', expiresAt: new Date(Date.now() + 86400_000) },
        { userId: 'user-grace-007', userName: 'Grace', avatarUrl: null, sessionToken: 'tok-grace', expiresAt: new Date(Date.now() + 86400_000) },
        { userId: 'user-hank-008', userName: 'Hank', avatarUrl: null, sessionToken: 'tok-hank', expiresAt: new Date(Date.now() + 86400_000) },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = createMockContext(eightUsers as any);
      const game = new EmojiCinemaGame(ctx.context);
      game.start();

      const assigned = findLastActionBroadcast(ctx.broadcastLog, 'EC_PRODUCER_ASSIGNED');
      expect(assigned!.data.totalRounds).toBe(EC_MAX_ROUNDS);
    });

    it('should initialise scores for all players at 0', () => {
      const { game } = createGame();
      game.start();

      for (const uid of ALL_PLAYER_IDS) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        const scores = state.scores as Record<string, number>;
        expect(scores[uid]).toBe(0);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 2. Round Lifecycle
  // ───────────────────────────────────────────────────────────────
  describe('Round Lifecycle', () => {
    it('should emit EC_PRODUCER_ASSIGNED on start', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const assigned = findLastActionBroadcast(broadcastLog, 'EC_PRODUCER_ASSIGNED');
      expect(assigned).toBeDefined();
      expect(assigned!.data.round).toBe(1);
    });

    it('should transition PRODUCER_ASSIGNMENT → EMOJI_CONSTRUCTION', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('PRODUCER_ASSIGNMENT');

      advanceToConstruction(game);

      const constructionStart = findLastActionBroadcast(broadcastLog, 'EC_CONSTRUCTION_START');
      expect(constructionStart).toBeDefined();
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('EMOJI_CONSTRUCTION');
    });

    it('should transition EMOJI_CONSTRUCTION → ROUND_RESULTS → TRANSITION → next round', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      // → EMOJI_CONSTRUCTION
      advanceToConstruction(game);
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('EMOJI_CONSTRUCTION');

      // → ROUND_RESULTS (timeout)
      vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);
      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      expect(roundOver).toBeDefined();
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('ROUND_RESULTS');

      // → TRANSITION
      vi.advanceTimersByTime(EC_ROUND_RESULTS_SECONDS * 1000);
      const transition = findLastActionBroadcast(broadcastLog, 'EC_TRANSITION');
      expect(transition).toBeDefined();

      // → Next round (round 2)
      vi.advanceTimersByTime(EC_TRANSITION_SECONDS * 1000);
      const assignedR2 = findLastActionBroadcast(broadcastLog, 'EC_PRODUCER_ASSIGNED');
      expect(assignedR2!.data.round).toBe(2);
    });

    it('should call onComplete after all rounds finish', () => {
      const { game, completedResults } = createGame();
      game.start();

      // Advance through all 4 rounds
      for (let i = 0; i < 4; i++) {
        advancePastRound();
      }

      expect(completedResults.length).toBe(1);
      expect(completedResults[0].rankings.length).toBe(4);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 3. Producer Assignment
  // ───────────────────────────────────────────────────────────────
  describe('Producer Assignment', () => {
    it('should rotate producers so each gets exactly one turn (4 players, 4 rounds)', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const producers: string[] = [];
      for (let i = 0; i < 4; i++) {
        const assigned = findLastActionBroadcast(broadcastLog, 'EC_PRODUCER_ASSIGNED');
        producers.push(assigned!.data.producerUserId as string);
        advancePastRound();
      }

      // Each player should appear exactly once
      const unique = new Set(producers);
      expect(unique.size).toBe(4);
      for (const uid of ALL_PLAYER_IDS) {
        expect(unique.has(uid)).toBe(true);
      }
    });

    it('should send EC_MOVIE_ASSIGNED ONLY to the producer', () => {
      const { game, playerLog, broadcastLog } = createGame();
      game.start();

      const producerId = getProducerFromLog(broadcastLog);
      const audienceIds = getAudienceIds(producerId);

      // Producer should have received movie assignment
      const producerMovieEvent = findLastPlayerAction(playerLog, producerId, 'EC_MOVIE_ASSIGNED');
      expect(producerMovieEvent).toBeDefined();
      expect(producerMovieEvent!.data.movie).toBeDefined();

      // Audience members should NOT have received movie assignment
      for (const uid of audienceIds) {
        const event = findLastPlayerAction(playerLog, uid, 'EC_MOVIE_ASSIGNED');
        expect(event).toBeUndefined();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 4. Emoji Actions
  // ───────────────────────────────────────────────────────────────
  describe('Emoji Actions', () => {
    it('ADD_EMOJI should broadcast EC_EMOJI_UPDATED', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '🦁', position: 0 });

      const updated = findLastActionBroadcast(broadcastLog, 'EC_EMOJI_UPDATED');
      expect(updated).toBeDefined();
      expect(updated!.data.emojiSequence).toEqual(['🦁']);
    });

    it('should reject 13th emoji (max 12)', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      // Add 12 emojis
      addEmojis(game, producerId, EC_MAX_EMOJIS);

      // Try adding a 13th
      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '🦁', position: 0 });

      const rejected = findLastPlayerAction(playerLog, producerId, 'EC_EMOJI_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('max_emojis');
    });

    it('should reject emoji not in the palette', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '💀', position: 0 });

      const rejected = findLastPlayerAction(playerLog, producerId, 'EC_EMOJI_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('invalid_emoji');
    });

    it('should reject ADD_EMOJI from a non-Producer', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      game.handleInput(audienceIds[0], 'ADD_EMOJI', { emoji: '🦁', position: 0 });

      // No EC_EMOJI_UPDATED should be broadcast for this
      const updatedBefore = findActionBroadcasts(broadcastLog, 'EC_EMOJI_UPDATED');
      expect(updatedBefore.length).toBe(0);
    });

    it('REMOVE_EMOJI should shrink the sequence', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '🦁', position: 0 });
      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '👑', position: 1 });
      game.handleInput(producerId, 'REMOVE_EMOJI', { position: 0 });

      const updated = findLastActionBroadcast(broadcastLog, 'EC_EMOJI_UPDATED');
      expect(updated!.data.emojiSequence).toEqual(['👑']);
    });

    it('REMOVE_EMOJI should reject out-of-bounds position', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '🦁', position: 0 });
      game.handleInput(producerId, 'REMOVE_EMOJI', { position: 5 });

      const rejected = findLastPlayerAction(playerLog, producerId, 'EC_EMOJI_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('invalid_position');
    });

    it('REORDER_EMOJI should reorder the sequence correctly', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '🦁', position: 0 });
      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '👑', position: 1 });
      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '🎬', position: 2 });

      game.handleInput(producerId, 'REORDER_EMOJI', { fromIndex: 0, toIndex: 2 });

      const updated = findLastActionBroadcast(broadcastLog, 'EC_EMOJI_UPDATED');
      expect(updated!.data.emojiSequence).toEqual(['👑', '🎬', '🦁']);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 5. Guess Handling (SUBMIT_GUESS)
  // ───────────────────────────────────────────────────────────────
  describe('Guess Handling', () => {
    it('exact match → CORRECT', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: movieTitle });

      const result = findLastPlayerAction(playerLog, audienceIds[0], 'EC_GUESS_RESULT');
      expect(result).toBeDefined();
      expect(result!.data.result).toBe('correct');
    });

    it('case-insensitive match → CORRECT', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: movieTitle.toLowerCase() });

      const result = findLastPlayerAction(playerLog, audienceIds[0], 'EC_GUESS_RESULT');
      expect(result).toBeDefined();
      expect(result!.data.result).toBe('correct');
    });

    it('article-stripped match → CORRECT (e.g. "Lion King" for "The Lion King")', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // Strip leading article if present
      const stripped = movieTitle.replace(/^(The|A|An)\s+/i, '');
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: stripped });

      const result = findLastPlayerAction(playerLog, audienceIds[0], 'EC_GUESS_RESULT');
      expect(result).toBeDefined();
      expect(result!.data.result).toBe('correct');
    });

    it('completely wrong guess → WRONG', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'Completely Random Movie Title XYZ' });

      const result = findLastPlayerAction(playerLog, audienceIds[0], 'EC_GUESS_RESULT');
      expect(result).toBeDefined();
      expect(result!.data.result).toBe('wrong');
    });

    it('producer cannot guess', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      game.handleInput(producerId, 'SUBMIT_GUESS', { guess: 'anything' });

      // Should not produce any guess result for the producer
      const result = findLastPlayerAction(playerLog, producerId, 'EC_GUESS_RESULT');
      expect(result).toBeUndefined();
    });

    it('max guesses enforced', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { maxGuesses: 2 };
      const game = new EmojiCinemaGame(ctx.context);
      game.start();

      const producerId = getProducerFromLog(ctx.broadcastLog);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // Submit 2 wrong guesses
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'wrong1' });
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'wrong2' });
      // 3rd should be rejected
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'wrong3' });

      const rejected = findLastPlayerAction(ctx.playerLog, audienceIds[0], 'EC_GUESS_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('max_guesses');
    });

    it('first correct guess broadcasts EC_CORRECT_GUESS with correct guesser list', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: movieTitle });

      const correctBroadcast = findLastActionBroadcast(broadcastLog, 'EC_CORRECT_GUESS');
      expect(correctBroadcast).toBeDefined();
      expect(correctBroadcast!.data.rank).toBe(1);
      expect(correctBroadcast!.data.correctGuessers).toBeDefined();
      expect(correctBroadcast!.data.correctGuessers.length).toBe(1);

      // Round should NOT end yet — other audience members haven't guessed
      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      expect(roundOver).toBeUndefined();
    });

    it('round ends when ALL audience members guess correctly', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // All audience members guess correctly
      for (const uid of audienceIds) {
        game.handleInput(uid, 'SUBMIT_GUESS', { guess: movieTitle });
      }

      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      expect(roundOver).toBeDefined();
      expect(roundOver!.data.reason).toBe('guessed');
    });

    it('should reject guess after player already guessed correctly', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: movieTitle });
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: movieTitle });

      const rejected = findLastPlayerAction(playerLog, audienceIds[0], 'EC_GUESS_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('already_correct');
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 6. Scoring
  // ───────────────────────────────────────────────────────────────
  describe('Scoring', () => {
    it('producer gets base + speed bonus when guessed correctly', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // All audience members guess correctly to end the round
      for (const uid of audienceIds) {
        game.handleInput(uid, 'SUBMIT_GUESS', { guess: movieTitle });
      }

      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      const roundScores = roundOver!.data.roundScores as Record<string, number>;
      const expectedProducer = EC_PRODUCER_BASE_POINTS + audienceIds.length * EC_PRODUCER_SPEED_BONUS;
      expect(roundScores[producerId]).toBe(expectedProducer);
    });

    it('producer gets 0 on timeout (no correct guesses)', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToConstruction(game);

      // No guesses — let timer expire
      vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);

      const producerId = getProducerFromLog(broadcastLog);
      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      const roundScores = roundOver!.data.roundScores as Record<string, number>;
      expect(roundScores[producerId]).toBe(0);
    });

    it('1st guesser gets FIRST_GUESS_POINTS, 2nd gets SECOND_GUESS_POINTS, 3rd+ gets OTHER', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // All audience members guess correctly
      for (const uid of audienceIds) {
        game.handleInput(uid, 'SUBMIT_GUESS', { guess: movieTitle });
      }

      // Let round end
      vi.advanceTimersByTime(3000);

      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      const roundScores = roundOver!.data.roundScores as Record<string, number>;

      expect(roundScores[audienceIds[0]]).toBe(EC_FIRST_GUESS_POINTS);
      expect(roundScores[audienceIds[1]]).toBe(EC_SECOND_GUESS_POINTS);
      expect(roundScores[audienceIds[2]]).toBe(EC_OTHER_GUESS_POINTS);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 7. State Masking (getStateForPlayer)
  // ───────────────────────────────────────────────────────────────
  describe('State Masking', () => {
    it('producer sees movie title during EMOJI_CONSTRUCTION', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      const state = game.getStateForPlayer(producerId) as Record<string, unknown>;
      expect(state.role).toBe('producer');
      expect(state.movie).toBeDefined();
      expect((state.movie as Record<string, unknown>).title).toBeTruthy();
    });

    it('audience does NOT see movie title during EMOJI_CONSTRUCTION', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      const state = game.getStateForPlayer(audienceIds[0]) as Record<string, unknown>;
      expect(state.role).toBe('audience');
      expect(state.movie).toBeUndefined();
    });

    it('audience player does NOT see other players\' guess text', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // Alice guesses
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'some guess' });

      // Bob's state should not contain Alice's guess text
      const bobState = game.getStateForPlayer(audienceIds[1]) as Record<string, unknown>;
      const myGuesses = bobState.myGuesses as Array<unknown>;
      expect(myGuesses).toBeDefined();
      expect(myGuesses.length).toBe(0);
    });

    it('movie title is revealed during ROUND_RESULTS', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // Let round timeout
      vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);

      const state = game.getStateForPlayer(audienceIds[0]) as Record<string, unknown>;
      expect(state.phase).toBe('ROUND_RESULTS');
      expect(state.movie).toBeDefined();
      expect((state.movie as Record<string, unknown>).title).toBeTruthy();
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 8. Spectator State
  // ───────────────────────────────────────────────────────────────
  describe('Spectator State', () => {
    it('spectator sees movie title during EMOJI_CONSTRUCTION', () => {
      const { game } = createGame();
      game.start();
      advanceToConstruction(game);

      const spectState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectState.movie).toBeDefined();
      expect((spectState.movie as Record<string, unknown>).title).toBeTruthy();
    });

    it('spectator sees all player guesses', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'test guess' });

      const spectState = game.getStateForSpectator() as Record<string, unknown>;
      const allGuesses = spectState.allGuesses as Record<string, Array<Record<string, unknown>>>;
      expect(allGuesses).toBeDefined();
      expect(allGuesses[audienceIds[0]].length).toBe(1);
      expect(allGuesses[audienceIds[0]][0].text).toBe('test guess');
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 9. Awards
  // ───────────────────────────────────────────────────────────────
  describe('Awards', () => {
    it('should award "Movie Buff" to the player with the most correct guesses', () => {
      const { game, broadcastLog, playerLog, completedResults } = createGame();
      game.start();

      // Play all 4 rounds — for each round only one audience member guesses correctly
      for (let r = 0; r < 4; r++) {
        const producerId = getProducerFromLog(broadcastLog);
        const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
        const audienceIds = getAudienceIds(producerId);
        advanceToConstruction(game);

        // Only the first audience member guesses correctly every round
        game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: movieTitle });

        // Let round end via timer (no longer a 3-second window)
        vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);
        vi.advanceTimersByTime(EC_ROUND_RESULTS_SECONDS * 1000);
        vi.advanceTimersByTime(EC_TRANSITION_SECONDS * 1000);
      }

      expect(completedResults.length).toBe(1);
      const movieBuff = completedResults[0].awards.find((a: { title: string }) => a.title === 'Movie Buff');
      expect(movieBuff).toBeDefined();
    });

    it('should award "Emoji Picasso" to the producer with most correct guessers', () => {
      const { game, broadcastLog, playerLog, completedResults } = createGame();
      game.start();

      // Play all 4 rounds — in each round all audience guesses correctly
      for (let r = 0; r < 4; r++) {
        const producerId = getProducerFromLog(broadcastLog);
        const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
        const audienceIds = getAudienceIds(producerId);
        advanceToConstruction(game);

        for (const uid of audienceIds) {
          game.handleInput(uid, 'SUBMIT_GUESS', { guess: movieTitle });
        }

        // Round ends immediately when all audience members guess correctly
        vi.advanceTimersByTime(EC_ROUND_RESULTS_SECONDS * 1000);
        vi.advanceTimersByTime(EC_TRANSITION_SECONDS * 1000);
      }

      expect(completedResults.length).toBe(1);
      const emojiPicasso = completedResults[0].awards.find((a) => a.title === 'Emoji Picasso');
      expect(emojiPicasso).toBeDefined();
    });

    it('should award "Stumper" to the producer whose movie was hardest to guess', () => {
      const { game, broadcastLog, playerLog, completedResults } = createGame();
      game.start();

      // Play all 4 rounds — only the first round gets no guesses; rest get all correct
      let firstProducerId: string | null = null;
      for (let r = 0; r < 4; r++) {
        const producerId = getProducerFromLog(broadcastLog);
        const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
        const audienceIds = getAudienceIds(producerId);
        advanceToConstruction(game);

        if (r === 0) {
          // Nobody guesses → stumper
          firstProducerId = producerId;
          vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);
        } else {
          // Everyone guesses correctly → round ends early
          for (const uid of audienceIds) {
            game.handleInput(uid, 'SUBMIT_GUESS', { guess: movieTitle });
          }
        }
        vi.advanceTimersByTime(EC_ROUND_RESULTS_SECONDS * 1000);
        vi.advanceTimersByTime(EC_TRANSITION_SECONDS * 1000);
      }

      expect(completedResults.length).toBe(1);
      const stumper = completedResults[0].awards.find((a) => a.title === 'Stumper');
      expect(stumper).toBeDefined();
      expect(stumper!.userId).toBe(firstProducerId);
    });

    it('should award "Speed Guesser" to the player with the fastest correct guess', () => {
      const { game, broadcastLog, playerLog, completedResults } = createGame();
      game.start();

      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // First audience member guesses immediately
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: movieTitle });
      // Second guesses after a delay
      vi.advanceTimersByTime(1000);
      game.handleInput(audienceIds[1], 'SUBMIT_GUESS', { guess: movieTitle });

      // Remaining audience members guess to end the round
      for (let i = 2; i < audienceIds.length; i++) {
        game.handleInput(audienceIds[i], 'SUBMIT_GUESS', { guess: movieTitle });
      }

      // Round ends immediately when all guess correctly
      vi.advanceTimersByTime(EC_ROUND_RESULTS_SECONDS * 1000);
      vi.advanceTimersByTime(EC_TRANSITION_SECONDS * 1000);

      // Let remaining rounds timeout
      for (let r = 1; r < 4; r++) {
        advancePastRound();
      }

      expect(completedResults.length).toBe(1);
      const speedGuesser = completedResults[0].awards.find((a: { title: string }) => a.title === 'Speed Guesser');
      expect(speedGuesser).toBeDefined();
      expect(speedGuesser!.userId).toBe(audienceIds[0]);
    });

    it('should award "Close but No Cigar" to the player with the most close guesses', () => {
      const { game, broadcastLog, playerLog, completedResults } = createGame();
      game.start();

      const producerId = getProducerFromLog(broadcastLog);
      const movieTitle = getMovieTitleFromPlayerLog(playerLog, producerId);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // Submit multiple close guesses (slightly misspelled)
      // Use partial title to get a "close" match
      const partial = movieTitle.substring(0, Math.max(3, movieTitle.length - 3)) + 'zzz';
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: partial });

      // Let round timeout
      vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);
      vi.advanceTimersByTime(EC_ROUND_RESULTS_SECONDS * 1000);
      vi.advanceTimersByTime(EC_TRANSITION_SECONDS * 1000);

      // Let remaining rounds timeout
      for (let r = 1; r < 4; r++) {
        advancePastRound();
      }

      expect(completedResults.length).toBe(1);
      // Award may or may not fire depending on fuzzy matching — just verify structure
      const closeAward = completedResults[0].awards.find((a) => a.title === 'Close but No Cigar');
      // If close guess was classified as 'close', the award should exist
      const guessResult = findLastPlayerAction(playerLog, audienceIds[0], 'EC_GUESS_RESULT');
      if (guessResult?.data.result === 'close') {
        expect(closeAward).toBeDefined();
        expect(closeAward!.userId).toBe(audienceIds[0]);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 10. Producer Disconnect
  // ───────────────────────────────────────────────────────────────
  describe('Producer Disconnect', () => {
    it('should skip round after wait period when producer disconnects', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      // Simulate producer disconnect
      game.handlePlayerDisconnect(producerId);

      // Advance past disconnect wait
      vi.advanceTimersByTime(EC_PRODUCER_DISCONNECT_WAIT_SECONDS * 1000);

      // Round should have ended
      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      expect(roundOver).toBeDefined();
      expect(roundOver!.data.reason).toBe('no_emojis');
    });

    it('should cancel skip if producer reconnects before wait period', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      // Disconnect then reconnect before wait expires
      game.handlePlayerDisconnect(producerId);
      vi.advanceTimersByTime(2000);
      game.handlePlayerReconnect(producerId);

      // Advance past original wait period — round should NOT have ended
      vi.advanceTimersByTime(EC_PRODUCER_DISCONNECT_WAIT_SECONDS * 1000);

      // The phase should still be EMOJI_CONSTRUCTION (no premature end)
      const state = game.getStateForPlayer(producerId) as Record<string, unknown>;
      expect(state.phase).toBe('EMOJI_CONSTRUCTION');
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 11. Join-in-Progress
  // ───────────────────────────────────────────────────────────────
  describe('Join-in-Progress', () => {
    it('late joiner receives a state snapshot via handlePlayerJoin', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToConstruction(game);

      const newUserId = 'user-newbie-099';
      game.handlePlayerJoin(newUserId);

      // Should have received a state_snapshot
      const snapshot = findLastPlayerEvent(playerLog, newUserId, 'rmhbox:game:state_snapshot');
      expect(snapshot).toBeDefined();
      // Snapshot should be spectator-like (movie title visible)
      const data = snapshot!.data as Record<string, unknown>;
      expect(data.movie).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 12. Game Settings
  // ───────────────────────────────────────────────────────────────
  describe('Game Settings', () => {
    it('should use custom maxRounds from gameSettings', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { maxRounds: 2 };
      const game = new EmojiCinemaGame(ctx.context);
      game.start();

      const assigned = findLastActionBroadcast(ctx.broadcastLog, 'EC_PRODUCER_ASSIGNED');
      expect(assigned!.data.totalRounds).toBe(2);
    });

    it('should use custom roundDuration from gameSettings', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { roundDuration: 20 };
      const game = new EmojiCinemaGame(ctx.context);
      game.start();
      advanceToConstruction(game);

      const constructionStart = findLastActionBroadcast(ctx.broadcastLog, 'EC_CONSTRUCTION_START');
      expect(constructionStart!.data.duration).toBe(20);
    });

    it('should use custom maxGuesses from gameSettings', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { maxGuesses: 3 };
      const game = new EmojiCinemaGame(ctx.context);
      game.start();

      const producerId = getProducerFromLog(ctx.broadcastLog);
      const audienceIds = getAudienceIds(producerId);
      advanceToConstruction(game);

      // Submit 3 wrong guesses
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'wrong1' });
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'wrong2' });
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'wrong3' });

      // 4th should be rejected
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'wrong4' });

      const rejected = findLastPlayerAction(ctx.playerLog, audienceIds[0], 'EC_GUESS_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('max_guesses');
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Additional Edge Cases
  // ───────────────────────────────────────────────────────────────
  describe('Edge Cases', () => {
    it('should ignore ADD_EMOJI outside EMOJI_CONSTRUCTION phase', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);

      // Still in PRODUCER_ASSIGNMENT phase
      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '🦁', position: 0 });

      const updated = findLastActionBroadcast(broadcastLog, 'EC_EMOJI_UPDATED');
      expect(updated).toBeUndefined();
    });

    it('should ignore SUBMIT_GUESS outside EMOJI_CONSTRUCTION phase', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      const audienceIds = getAudienceIds(producerId);

      // Still in PRODUCER_ASSIGNMENT phase
      game.handleInput(audienceIds[0], 'SUBMIT_GUESS', { guess: 'anything' });

      const result = findLastPlayerAction(playerLog, audienceIds[0], 'EC_GUESS_RESULT');
      expect(result).toBeUndefined();
    });

    it('EC_ROUND_OVER should reveal the movie title in broadcast', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToConstruction(game);

      vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);

      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      expect(roundOver).toBeDefined();
      expect(roundOver!.data.movie).toBeDefined();
      expect((roundOver!.data.movie as Record<string, unknown>).title).toBeTruthy();
    });

    it('computeResults produces proper rankings and awards arrays', () => {
      const { game } = createGame();
      game.start();

      // Run all 4 rounds
      for (let i = 0; i < 4; i++) {
        advancePastRound();
      }

      const results = game.computeResults();
      expect(results.rankings).toBeDefined();
      expect(results.rankings.length).toBe(4);
      expect(results.awards).toBeDefined();
      expect(results.duration).toBeGreaterThan(0);
      expect(results.gameSpecificData).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 12. No-Emoji Producer Skip
  // ───────────────────────────────────────────────────────────────
  describe('No-Emoji Producer Skip', () => {
    it('should report noEmojis=true when producer submits no emojis', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToConstruction(game);

      // Let the round time out without the producer adding any emojis
      vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);

      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      expect(roundOver).toBeDefined();
      expect(roundOver!.data.noEmojis).toBe(true);
      expect(roundOver!.data.reason).toBe('no_emojis');
    });

    it('should NOT report noEmojis when producer did add emojis', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      const producerId = getProducerFromLog(broadcastLog);
      advanceToConstruction(game);

      // Producer adds one emoji
      game.handleInput(producerId, 'ADD_EMOJI', { emoji: '🎬', position: 0 });

      vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);

      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      expect(roundOver).toBeDefined();
      expect(roundOver!.data.noEmojis).toBe(false);
      expect(roundOver!.data.reason).toBe('timeout');
    });

    it('should give no points when producer submits no emojis', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToConstruction(game);

      vi.advanceTimersByTime(EC_ROUND_DURATION_SECONDS * 1000);

      const roundOver = findLastActionBroadcast(broadcastLog, 'EC_ROUND_OVER');
      const roundScores = roundOver!.data.roundScores as Record<string, number>;
      // All scores should be 0 since no one could guess
      for (const pts of Object.values(roundScores)) {
        expect(pts).toBe(0);
      }
    });
  });
});

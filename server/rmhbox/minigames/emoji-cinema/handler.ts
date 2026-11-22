/**
 * RMHbox — Emoji Cinema Minigame Server Handler
 *
 * One player per round is the "Producer" who sees a movie title and
 * builds an emoji sequence to represent it. All other players ("Audience")
 * try to guess the movie from the emojis. Whole-string matching
 * (lib/rmhbox/emoji-cinema/guess-matcher.ts) classifies guesses as correct,
 * close, or wrong.
 *
 * Phases per round:
 *   PRODUCER_ASSIGNMENT → EMOJI_CONSTRUCTION → ROUND_RESULTS → TRANSITION → (next round or end)
 *
 * Join-in-progress policy: join_next_subround — late joiners spectate
 * the current round and participate starting from the next transition.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §4
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import type { MovieEntry } from '@/lib/rmhbox/emoji-cinema/data-loader';
import { loadMovies, validateEmoji } from '@/lib/rmhbox/emoji-cinema/data-loader';
import { classifyMovieGuess } from '../../../../lib/rmhbox/emoji-cinema/guess-matcher';
import {
  AddEmojiSchema,
  RemoveEmojiSchema,
  ReorderEmojiSchema,
  SubmitGuessSchema,
  SelectMovieSchema,
} from '@/lib/rmhbox/emoji-cinema/schemas';
import {
  EC_MAX_ROUNDS,
  EC_PRODUCER_ASSIGNMENT_SECONDS,
  EC_MOVIE_SELECTION_SECONDS,
  EC_MOVIE_CHOICES_COUNT,
  EC_ROUND_DURATION_SECONDS,
  EC_ROUND_RESULTS_SECONDS,
  EC_TRANSITION_SECONDS,
  EC_MAX_EMOJIS,
  EC_MAX_GUESSES_PER_PLAYER,
  EC_PRODUCER_BASE_POINTS,
  EC_PRODUCER_SPEED_BONUS,
  EC_FIRST_GUESS_POINTS,
  EC_SECOND_GUESS_POINTS,
  EC_OTHER_GUESS_POINTS,
  EC_PRODUCER_DISCONNECT_WAIT_SECONDS,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import type { ECPhase, ECPlayerGuess, CorrectGuesser, EmojiCinemaState, GuessLogEntry } from './types';
import { shuffle } from '@/lib/core/rng';

// ─── Emoji Cinema Minigame ───────────────────────────────────────

export class EmojiCinemaGame extends BaseMinigame {
  private moviePool: MovieEntry[];
  private usedMovieTitles: Set<string> = new Set();
  private state!: EmojiCinemaState;
  private startedAt: number = 0;
  private actionSeq = 0;
  /**
   * The one pending phase-advance timeout (assignment → selection → construction
   * → results → transition → next round). Every transition replaces it, so a
   * phase that ends early (a manual movie pick, everyone guessing) can never
   * leave a stale timer behind to fire in a later round.
   */
  private phaseTimeoutHandle: NodeJS.Timeout | null = null;
  /** Players currently disconnected (kept in sync by the disconnect/reconnect hooks). */
  private disconnectedPlayers = new Set<string>();
  /** Host settings, resolved once at start (registry keys: maxEmojis, maxGuessesPerPlayer). */
  private maxEmojis: number = EC_MAX_EMOJIS;
  private maxGuesses: number = EC_MAX_GUESSES_PER_PLAYER;

  get spectatorMode(): 'shared-privileged' {
    return 'shared-privileged';
  }

  constructor(context: MinigameContext) {
    super(context);
    this.moviePool = loadMovies();
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    this.maxEmojis = this.getSetting('maxEmojis', EC_MAX_EMOJIS);
    // `maxGuessesPerPlayer` is the registry key; `maxGuesses` is the old name.
    this.maxGuesses = this.getSetting('maxGuessesPerPlayer', this.getSetting('maxGuesses', EC_MAX_GUESSES_PER_PLAYER));

    const playerIds = Array.from(this.context.players.keys());
    for (const uid of playerIds) {
      if (this.context.players.get(uid)?.isConnected === false) this.disconnectedPlayers.add(uid);
    }
    const producerOrder = shuffle([...playerIds]);
    const totalRounds = Math.min(playerIds.length, this.getSetting('maxRounds', EC_MAX_ROUNDS));

    // Pre-assign producer order but NOT movies — movies are chosen per round
    const rounds: import('./types').ECRoundData[] = producerOrder.slice(0, totalRounds).map((uid) => ({
      movie: null,
      producerUserId: uid,
    }));

    const playerScores = new Map<string, number>();
    for (const uid of playerIds) playerScores.set(uid, 0);

    const now = Date.now();
    this.state = {
      rounds,
      currentRound: 0,
      totalRounds,
      producerOrder,
      phase: 'PRODUCER_ASSIGNMENT',
      currentProducerUserId: '',
      currentMovie: null,
      movieChoices: [],
      emojiSequence: [],
      guesses: new Map(),
      correctGuessers: [],
      closeGuessCount: 0,
      guessLog: [],
      playerScores,
      phaseStartedAt: now,
      phaseEndsAt: now,
      actionLog: [],
      producerDisconnectTimer: null,
    };

    logger.info({
      event: 'ec:start',
      lobbyId: this.context.lobbyId,
      totalRounds,
      playerCount: playerIds.length,
    });

    this.logAction('game_start', {
      totalRounds,
      playerCount: playerIds.length,
    });

    this.startNextRound();
  }

  // ─── Round Lifecycle ─────────────────────────────────────────

  /** A player in the roster who is connected right now. */
  private isActivePlayer(userId: string): boolean {
    const p = this.context.players.get(userId);
    return !!p && p.isConnected !== false && !this.disconnectedPlayers.has(userId);
  }

  /**
   * Schedule the single pending phase advance, replacing any earlier one. The
   * callback only runs if the game is still in the same round and phase it was
   * scheduled for, so a late or duplicated timer can never advance twice.
   */
  private schedulePhaseAdvance(fn: () => void, seconds: number): void {
    this.cancelPhaseAdvance();
    const round = this.state.currentRound;
    const phase = this.state.phase;
    this.phaseTimeoutHandle = this.setTimeout(() => {
      this.phaseTimeoutHandle = null;
      if (!this.isRunning || this.state.currentRound !== round || this.state.phase !== phase) return;
      fn();
    }, seconds * 1000);
  }

  private cancelPhaseAdvance(): void {
    if (this.phaseTimeoutHandle) {
      this.clearTrackedTimeout(this.phaseTimeoutHandle);
      this.phaseTimeoutHandle = null;
    }
  }

  private cancelProducerDisconnectTimer(): void {
    if (this.state?.producerDisconnectTimer) {
      this.clearTrackedTimeout(this.state.producerDisconnectTimer);
      this.state.producerDisconnectTimer = null;
    }
  }

  /**
   * The producer for round `idx`: the pre-assigned one if still connected,
   * otherwise a connected player who has not produced yet (swapping rounds
   * with them so nobody produces twice), otherwise any connected player.
   */
  private pickProducerForRound(idx: number): string | null {
    const rounds = this.state.rounds;
    const assigned = rounds[idx].producerUserId;
    if (this.isActivePlayer(assigned)) return assigned;

    const produced = new Set(rounds.slice(0, idx).map((r) => r.producerUserId));
    const fresh = this.state.producerOrder.filter((uid) => this.isActivePlayer(uid) && !produced.has(uid));
    const unassigned = fresh.find((uid) => !rounds.some((r, i) => i > idx && r.producerUserId === uid));
    if (unassigned) return unassigned;
    const laterIdx = rounds.findIndex((r, i) => i > idx && fresh.includes(r.producerUserId));
    if (laterIdx !== -1) {
      const substitute = rounds[laterIdx].producerUserId;
      // The departed producer takes the later slot (and is skipped again then if still gone).
      rounds[laterIdx].producerUserId = assigned;
      return substitute;
    }
    return this.state.producerOrder.find((uid) => this.isActivePlayer(uid)) ?? null;
  }

  private startNextRound(): void {
    if (!this.isRunning) return;
    if (this.state.currentRound > 0 && this.state.phase !== 'TRANSITION') return;

    this.cancelPhaseAdvance();
    this.cancelProducerDisconnectTimer();
    this.state.currentRound++;

    if (this.state.currentRound > this.state.totalRounds) {
      this.endGame();
      return;
    }

    const roundData = this.state.rounds[this.state.currentRound - 1];
    const producerUserId = this.pickProducerForRound(this.state.currentRound - 1);
    if (!producerUserId) {
      this.endGame();
      return;
    }
    roundData.producerUserId = producerUserId;
    roundData.movie = null;

    this.state.currentProducerUserId = roundData.producerUserId;
    this.state.currentMovie = null;
    this.state.emojiSequence = [];
    this.state.correctGuessers = [];
    this.state.closeGuessCount = 0;
    this.state.guessLog = [];
    this.state.movieChoices = [];

    // Reset guesses for this round
    this.state.guesses = new Map();
    for (const uid of this.context.players.keys()) {
      if (uid !== roundData.producerUserId) {
        this.state.guesses.set(uid, {
          userId: uid,
          guesses: [],
        });
      }
    }

    this.setPhase('PRODUCER_ASSIGNMENT', EC_PRODUCER_ASSIGNMENT_SECONDS);

    const producerPlayer = this.context.players.get(roundData.producerUserId);

    logger.info({
      event: 'ec:round_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      producerUserId: roundData.producerUserId,
    });

    this.logAction('round_start', {
      round: this.state.currentRound,
      producerUserId: roundData.producerUserId,
    });

    this.broadcastRound(this.state.currentRound, this.state.totalRounds);

    // Notify all players of the producer assignment
    this.broadcastGameAction({
      type: 'EC_PRODUCER_ASSIGNED',
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      producerUserId: roundData.producerUserId,
      producerUserName: producerPlayer?.userName ?? 'Unknown',
      duration: EC_PRODUCER_ASSIGNMENT_SECONDS,
    });

    this.startPhaseTimer(EC_PRODUCER_ASSIGNMENT_SECONDS);
    this.schedulePhaseAdvance(() => this.startMovieSelection(), EC_PRODUCER_ASSIGNMENT_SECONDS);
  }

  /** MOVIE_SELECTION phase: present producer with 3 movie choices */
  private startMovieSelection(): void {
    if (!this.isRunning) return;
    if (this.state.phase !== 'PRODUCER_ASSIGNMENT') return;

    const choices = this.pickMovieChoices();
    this.state.movieChoices = choices;

    this.setPhase('MOVIE_SELECTION', EC_MOVIE_SELECTION_SECONDS);

    logger.info({
      event: 'ec:movie_selection_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      choiceCount: choices.length,
    });

    // Send movie choices ONLY to the producer
    this.context.sendToPlayer(this.state.currentProducerUserId, 'rmhbox:game:action', {
      type: 'EC_MOVIE_CHOICES',
      movies: this.serializeMovieChoices(),
      duration: EC_MOVIE_SELECTION_SECONDS,
    });

    // Notify audience that producer is picking a movie
    this.broadcastGameAction({
      type: 'EC_MOVIE_SELECTION_START',
      duration: EC_MOVIE_SELECTION_SECONDS,
    });

    this.startPhaseTimer(EC_MOVIE_SELECTION_SECONDS);
    this.schedulePhaseAdvance(() => this.autoSelectMovie(), EC_MOVIE_SELECTION_SECONDS);
  }

  /** Up to EC_MOVIE_CHOICES_COUNT random movies not used earlier in this game. */
  private pickMovieChoices(): MovieEntry[] {
    const available = this.moviePool.filter((m) => !this.usedMovieTitles.has(m.title));
    const pool = available.length >= EC_MOVIE_CHOICES_COUNT ? available : this.moviePool;
    return shuffle([...pool]).slice(0, EC_MOVIE_CHOICES_COUNT);
  }

  private serializeMovieChoices(): Array<{
    title: string;
    year: number;
    genre: string[];
    difficulty: string;
  }> {
    return this.state.movieChoices.map((m) => ({
      title: m.title,
      year: m.year,
      genre: m.genre,
      difficulty: m.difficulty,
    }));
  }

  /** Auto-select the first movie if producer doesn't choose in time */
  private autoSelectMovie(): void {
    if (!this.isRunning) return;
    if (this.state.phase !== 'MOVIE_SELECTION') return;

    // Pick the first choice by default
    const movie = this.state.movieChoices[0];
    if (movie) {
      this.selectMovie(movie);
    }
  }

  /** Finalize the selected movie and proceed to emoji construction */
  private selectMovie(movie: MovieEntry): void {
    if (!this.isRunning) return;
    if (this.state.phase !== 'MOVIE_SELECTION') return;

    // The producer picked: the auto-select timeout must not fire later.
    this.cancelPhaseAdvance();
    this.assignMovie(movie);

    logger.info({
      event: 'ec:movie_selected',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      movieTitle: movie.title,
    });

    this.logAction('movie_selected', {
      round: this.state.currentRound,
      movieTitle: movie.title,
    });

    const assigned = {
      type: 'EC_MOVIE_ASSIGNED',
      movie: {
        title: movie.title,
        year: movie.year,
        genre: movie.genre,
        difficulty: movie.difficulty,
      },
    };
    // The producer needs the title to encode it; spectators (shared-privileged
    // view) show it as their answer banner. The audience must not get it.
    this.context.sendToPlayer(this.state.currentProducerUserId, 'rmhbox:game:action', assigned);
    this.context.sendToSpectators('rmhbox:game:action', assigned);

    this.clearPhaseTimer();
    this.startEmojiConstruction();
  }

  /** Record `movie` as this round's movie. */
  private assignMovie(movie: MovieEntry): void {
    this.state.currentMovie = movie;
    this.usedMovieTitles.add(movie.title);
    const roundIdx = this.state.currentRound - 1;
    if (roundIdx >= 0 && roundIdx < this.state.rounds.length) {
      this.state.rounds[roundIdx].movie = movie;
    }
  }

  private startEmojiConstruction(): void {
    if (!this.isRunning) return;
    if (this.state.phase !== 'MOVIE_SELECTION') return;

    const roundDuration = this.getSetting('roundDuration', EC_ROUND_DURATION_SECONDS);
    this.setPhase('EMOJI_CONSTRUCTION', roundDuration);

    logger.info({
      event: 'ec:emoji_construction_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      duration: roundDuration,
    });

    this.broadcastGameAction({
      type: 'EC_CONSTRUCTION_START',
      duration: roundDuration,
      maxEmojis: this.maxEmojis,
      maxGuesses: this.maxGuesses,
      movieTitles: this.moviePool.map((m) => m.title),
    });

    this.startPhaseTimer(roundDuration);
    this.schedulePhaseAdvance(() => this.endRound('timeout'), roundDuration);
  }

  private endRound(reason: 'timeout' | 'guessed' | 'no_emojis'): void {
    if (!this.isRunning) return;
    if (this.state.phase === 'ROUND_RESULTS' || this.state.phase === 'TRANSITION') return;

    this.clearPhaseTimer();
    // Cancel the construction timeout and any producer-disconnect wait: neither
    // may carry over into the next round.
    this.cancelPhaseAdvance();
    this.cancelProducerDisconnectTimer();

    // A round skipped before a movie was picked still reveals a movie, so
    // results and the game log always have one.
    if (!this.state.currentMovie) {
      const fallback = this.state.movieChoices[0] ?? this.pickMovieChoices()[0];
      if (fallback) this.assignMovie(fallback);
    }
    const movie = this.state.currentMovie;

    // If no emojis were submitted, notify all players and skip to next round
    const noEmojis = this.state.emojiSequence.length === 0 && reason === 'timeout';
    const effectiveReason = noEmojis ? 'no_emojis' : reason;

    // Compute round scores
    const roundScores = this.computeRoundScores();

    // Apply round scores to cumulative totals
    for (const [uid, pts] of roundScores) {
      this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + pts);
    }

    this.setPhase('ROUND_RESULTS', EC_ROUND_RESULTS_SECONDS);

    this.logAction('round_end', {
      round: this.state.currentRound,
      reason: effectiveReason,
      producerUserId: this.state.currentProducerUserId,
      correctGuessers: this.state.correctGuessers.map((cg) => ({
        userId: cg.userId,
        userName: cg.userName,
        rank: cg.rank,
      })),
      correctGuessCount: this.state.correctGuessers.length,
      closeGuessCount: this.state.closeGuessCount,
      movieTitle: movie?.title ?? '',
      emojiSequence: [...this.state.emojiSequence],
      noEmojis,
    });

    logger.info({
      event: 'ec:round_end',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      reason: effectiveReason,
      correctGuessers: this.state.correctGuessers.length,
      noEmojis,
    });

    // Serialize scores for broadcast
    const scores: Record<string, number> = {};
    for (const [uid, s] of this.state.playerScores) scores[uid] = s;

    const roundScoresObj: Record<string, number> = {};
    for (const [uid, s] of roundScores) roundScoresObj[uid] = s;

    this.broadcastGameAction({
      type: 'EC_ROUND_OVER',
      round: this.state.currentRound,
      reason: effectiveReason,
      noEmojis,
      movie: movie
        ? {
            title: movie.title,
            year: movie.year,
            genre: movie.genre,
          }
        : null,
      emojiSequence: this.state.emojiSequence,
      correctGuessers: this.state.correctGuessers,
      closeGuessCount: this.state.closeGuessCount,
      roundScores: roundScoresObj,
      scores,
      duration: EC_ROUND_RESULTS_SECONDS,
    });

    this.startPhaseTimer(EC_ROUND_RESULTS_SECONDS);
    this.schedulePhaseAdvance(() => this.startTransition(), EC_ROUND_RESULTS_SECONDS);
  }

  private startTransition(): void {
    if (!this.isRunning) return;
    if (this.state.phase !== 'ROUND_RESULTS') return;

    this.setPhase('TRANSITION', EC_TRANSITION_SECONDS);

    this.broadcastGameAction({
      type: 'EC_TRANSITION',
      nextRound: this.state.currentRound + 1,
      totalRounds: this.state.totalRounds,
      duration: EC_TRANSITION_SECONDS,
    });

    this.schedulePhaseAdvance(() => this.startNextRound(), EC_TRANSITION_SECONDS);
  }

  private endGame(): void {
    if (!this.isRunning) return;

    logger.info({
      event: 'ec:game_end',
      lobbyId: this.context.lobbyId,
      rounds: this.state.currentRound - 1,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    switch (action) {
      case 'SELECT_MOVIE':
        this.handleSelectMovie(userId, data);
        break;
      case 'ADD_EMOJI':
        this.handleAddEmoji(userId, data);
        break;
      case 'REMOVE_EMOJI':
        this.handleRemoveEmoji(userId, data);
        break;
      case 'REORDER_EMOJI':
        this.handleReorderEmoji(userId, data);
        break;
      case 'SUBMIT_GUESS':
        this.handleSubmitGuess(userId, data);
        break;
    }
  }

  private handleSelectMovie(userId: string, data: unknown): void {
    if (this.state.phase !== 'MOVIE_SELECTION') return;
    if (userId !== this.state.currentProducerUserId) return;

    const parsed = SelectMovieSchema.safeParse(data);
    if (!parsed.success) return;

    const { movieTitle } = parsed.data;
    const choice = this.state.movieChoices.find((m) => m.title === movieTitle);
    if (!choice) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_MOVIE_REJECTED',
        reason: 'invalid_choice',
      });
      return;
    }

    this.selectMovie(choice);
  }

  private handleAddEmoji(userId: string, data: unknown): void {
    if (this.state.phase !== 'EMOJI_CONSTRUCTION') return;
    if (userId !== this.state.currentProducerUserId) return;

    const parsed = AddEmojiSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_EMOJI_REJECTED',
        emojiSequence: this.state.emojiSequence,
        reason: 'invalid_input',
      });
      return;
    }

    const { emoji, position } = parsed.data;

    if (!validateEmoji(emoji)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_EMOJI_REJECTED',
        emojiSequence: this.state.emojiSequence,
        reason: 'invalid_emoji',
      });
      return;
    }

    if (this.state.emojiSequence.length >= this.maxEmojis) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_EMOJI_REJECTED',
        emojiSequence: this.state.emojiSequence,
        reason: 'max_emojis',
      });
      return;
    }

    // Clamp position to valid range
    const insertPos = Math.min(position, this.state.emojiSequence.length);
    this.state.emojiSequence.splice(insertPos, 0, emoji);

    this.logAction('add_emoji', {
      userId,
      emoji,
      position: insertPos,
    });

    this.broadcastGameAction({
      type: 'EC_EMOJI_UPDATED',
      emojiSequence: this.state.emojiSequence,
    });
  }

  private handleRemoveEmoji(userId: string, data: unknown): void {
    if (this.state.phase !== 'EMOJI_CONSTRUCTION') return;
    if (userId !== this.state.currentProducerUserId) return;

    const parsed = RemoveEmojiSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_EMOJI_REJECTED',
        emojiSequence: this.state.emojiSequence,
        reason: 'invalid_input',
      });
      return;
    }

    const { position } = parsed.data;

    if (position < 0 || position >= this.state.emojiSequence.length) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_EMOJI_REJECTED',
        emojiSequence: this.state.emojiSequence,
        reason: 'invalid_position',
      });
      return;
    }

    this.state.emojiSequence.splice(position, 1);

    this.logAction('remove_emoji', {
      userId,
      position,
    });

    this.broadcastGameAction({
      type: 'EC_EMOJI_UPDATED',
      emojiSequence: this.state.emojiSequence,
    });
  }

  private handleReorderEmoji(userId: string, data: unknown): void {
    if (this.state.phase !== 'EMOJI_CONSTRUCTION') return;
    if (userId !== this.state.currentProducerUserId) return;

    const parsed = ReorderEmojiSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_EMOJI_REJECTED',
        emojiSequence: this.state.emojiSequence,
        reason: 'invalid_input',
      });
      return;
    }

    const { fromIndex, toIndex } = parsed.data;

    if (
      fromIndex < 0 ||
      fromIndex >= this.state.emojiSequence.length ||
      toIndex < 0 ||
      toIndex >= this.state.emojiSequence.length
    ) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_EMOJI_REJECTED',
        emojiSequence: this.state.emojiSequence,
        reason: 'invalid_position',
      });
      return;
    }

    const [emoji] = this.state.emojiSequence.splice(fromIndex, 1);
    this.state.emojiSequence.splice(toIndex, 0, emoji);

    this.logAction('reorder_emoji', {
      userId,
      fromIndex,
      toIndex,
    });

    this.broadcastGameAction({
      type: 'EC_EMOJI_UPDATED',
      emojiSequence: this.state.emojiSequence,
    });
  }

  private handleSubmitGuess(userId: string, data: unknown): void {
    if (this.state.phase !== 'EMOJI_CONSTRUCTION') return;
    if (userId === this.state.currentProducerUserId) return;

    const parsed = SubmitGuessSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_GUESS_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { guess } = parsed.data;
    const playerGuesses = this.state.guesses.get(userId);
    if (!playerGuesses) return;

    const maxGuesses = this.maxGuesses;
    if (playerGuesses.guesses.length >= maxGuesses) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_GUESS_REJECTED',
        reason: 'max_guesses',
      });
      return;
    }

    // Already guessed correctly — no more guesses
    if (this.state.correctGuessers.some((g) => g.userId === userId)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'EC_GUESS_REJECTED',
        reason: 'already_correct',
      });
      return;
    }

    const movie = this.state.currentMovie;
    if (!movie) return;
    const result = classifyMovieGuess(guess, movie);
    const now = Date.now();

    const playerGuess: ECPlayerGuess = {
      text: guess,
      result,
      timestamp: now,
    };
    playerGuesses.guesses.push(playerGuess);

    this.logAction('submit_guess', {
      userId,
      guess,
      result,
      round: this.state.currentRound,
    });

    // Send result to the guesser
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'EC_GUESS_RESULT',
      guess,
      result,
      guessCount: playerGuesses.guesses.length,
      maxGuesses,
    });

    // Broadcast a public guess log entry to all players (producer + audience)
    const player = this.context.players.get(userId);
    const userName = player?.userName ?? 'Unknown';
    const logEntry: GuessLogEntry = {
      userId,
      userName,
      // Only include the guess text for wrong/close guesses — correct guesses
      // must not reveal the answer.
      ...(result !== 'correct'
        ? {
            guessText: guess,
          }
        : {}),
      isCorrect: result === 'correct',
      timestamp: now,
    };
    this.state.guessLog.push(logEntry);
    this.broadcastGameAction({
      type: 'EC_GUESS_LOG_ENTRY',
      ...logEntry,
    });

    if (result === 'correct') {
      const rank = this.state.correctGuessers.length + 1;
      const guesser: CorrectGuesser = {
        userId,
        userName,
        guessText: guess,
        timestamp: now,
        rank,
      };
      this.state.correctGuessers.push(guesser);

      // Broadcast correct guess + updated list of all correct guessers to everyone
      this.broadcastGameAction({
        type: 'EC_CORRECT_GUESS',
        userId,
        userName: guesser.userName,
        rank,
        correctGuessers: this.state.correctGuessers.map((g) => ({
          userId: g.userId,
          userName: g.userName,
          rank: g.rank,
        })),
      });
    } else if (result === 'close') {
      this.state.closeGuessCount++;
      this.broadcastGameAction({
        type: 'EC_CLOSE_GUESS',
        userId,
        closeGuessCount: this.state.closeGuessCount,
      });
    }

    // Round tally for the producer's counters (every guess, not just wrong ones)
    this.broadcastGameAction({
      type: 'EC_GUESS_COUNT',
      totalGuesses: this.getTotalGuessCount(),
      correctGuesses: this.state.correctGuessers.length,
    });

    // Check if ALL connected audience players have guessed correctly → end round
    if (result === 'correct' && this.allAudienceGuessedCorrectly()) {
      this.endRound('guessed');
    }
  }

  // ─── Scoring ─────────────────────────────────────────────────

  private computeRoundScores(): Map<string, number> {
    const scores = new Map<string, number>();

    // Producer scoring
    const producerId = this.state.currentProducerUserId;
    let producerPoints = 0;
    if (this.state.correctGuessers.length > 0) {
      producerPoints = EC_PRODUCER_BASE_POINTS;
      // Speed bonus per correct guesser
      producerPoints += this.state.correctGuessers.length * EC_PRODUCER_SPEED_BONUS;
    }
    scores.set(producerId, producerPoints);

    // Guesser scoring
    for (const guesser of this.state.correctGuessers) {
      let points: number;
      switch (guesser.rank) {
        case 1:
          points = EC_FIRST_GUESS_POINTS;
          break;
        case 2:
          points = EC_SECOND_GUESS_POINTS;
          break;
        default:
          points = EC_OTHER_GUESS_POINTS;
          break;
      }
      scores.set(guesser.userId, points);
    }

    return scores;
  }

  // ─── State Masking ───────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const isProducer = userId === this.state.currentProducerUserId;
    const producerPlayer = this.context.players.get(this.state.currentProducerUserId);
    const scores: Record<string, number> = {};
    for (const [uid, s] of this.state.playerScores) scores[uid] = s;

    const base = {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      producerUserId: this.state.currentProducerUserId,
      producerUserName: producerPlayer?.userName ?? 'Unknown',
      emojiSequence: this.state.emojiSequence,
      scores,
      phaseStartedAt: this.state.phaseStartedAt,
      phaseEndsAt: this.state.phaseEndsAt,
      maxEmojis: this.maxEmojis,
      maxGuesses: this.maxGuesses,
    };
    const movie = this.state.currentMovie;

    if (isProducer) {
      return {
        ...base,
        role: 'producer',
        // Only once picked — never a placeholder or last round's movie.
        ...(movie
          ? {
              movie: {
                title: movie.title,
                year: movie.year,
                genre: movie.genre,
                difficulty: movie.difficulty,
              },
            }
          : {}),
        // A producer who (re)mounts mid-selection needs the choices back.
        ...(this.state.phase === 'MOVIE_SELECTION'
          ? {
              movieChoices: this.serializeMovieChoices(),
            }
          : {}),
        correctGuessers: this.state.correctGuessers,
        closeGuessCount: this.state.closeGuessCount,
        totalGuesses: this.getTotalGuessCount(),
        guessLog: this.state.guessLog,
      };
    }

    // Audience player
    const myGuesses = this.state.guesses.get(userId);
    const revealMovie = (this.state.phase === 'ROUND_RESULTS' || this.state.phase === 'TRANSITION') && !!movie;

    // Strip guessText from correctGuessers for audience — it may contain the movie title
    const safeGuessers = this.state.correctGuessers.map((cg) => ({
      userId: cg.userId,
      userName: cg.userName,
      timestamp: cg.timestamp,
      rank: cg.rank,
    }));

    return {
      ...base,
      role: 'audience',
      myGuesses: myGuesses?.guesses ?? [],
      correctGuessers: safeGuessers,
      closeGuessCount: this.state.closeGuessCount,
      // Send all movie titles for client-side fuzzy autocomplete
      movieTitles: this.moviePool.map((m) => m.title),
      guessLog: this.state.guessLog,
      ...(revealMovie && movie
        ? {
            movie: {
              title: movie.title,
              year: movie.year,
              genre: movie.genre,
            },
          }
        : {}),
    };
  }

  getStateForSpectator(): unknown {
    const movie = this.state.currentMovie;
    const producerPlayer = this.context.players.get(this.state.currentProducerUserId);
    const scores: Record<string, number> = {};
    for (const [uid, s] of this.state.playerScores) scores[uid] = s;

    // Serialize all guesses
    const allGuesses: Record<string, ECPlayerGuess[]> = {};
    for (const [uid, pg] of this.state.guesses) {
      allGuesses[uid] = pg.guesses;
    }

    return {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      producerUserId: this.state.currentProducerUserId,
      producerUserName: producerPlayer?.userName ?? 'Unknown',
      emojiSequence: this.state.emojiSequence,
      scores,
      phaseStartedAt: this.state.phaseStartedAt,
      phaseEndsAt: this.state.phaseEndsAt,
      maxEmojis: this.maxEmojis,
      maxGuesses: this.maxGuesses,
      ...(movie
        ? {
            movie: {
              title: movie.title,
              year: movie.year,
              genre: movie.genre,
              difficulty: movie.difficulty,
            },
          }
        : {}),
      allGuesses,
      correctGuessers: this.state.correctGuessers,
      closeGuessCount: this.state.closeGuessCount,
      totalGuesses: this.getTotalGuessCount(),
      guessLog: this.state.guessLog,
    };
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ────────────

  handlePlayerJoin(userId: string): void {
    // join_next_subround: spectate until next transition
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForSpectator());

    logger.info({
      event: 'ec:player_join_mid_game',
      lobbyId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
      phase: this.state.phase,
    });
  }

  handlePlayerDisconnect(userId: string): void {
    if (!this.state) return;
    this.disconnectedPlayers.add(userId);

    logger.info({
      event: 'ec:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
      phase: this.state.phase,
    });
    if (!this.isRunning) return;

    const roundActive =
      this.state.phase === 'PRODUCER_ASSIGNMENT' ||
      this.state.phase === 'MOVIE_SELECTION' ||
      this.state.phase === 'EMOJI_CONSTRUCTION';

    // If the Producer disconnects before the round is over, wait, then skip the round
    if (userId === this.state.currentProducerUserId && roundActive && !this.state.producerDisconnectTimer) {
      const waitSeconds = this.getSetting('producerDisconnectWait', EC_PRODUCER_DISCONNECT_WAIT_SECONDS);
      const round = this.state.currentRound;

      logger.warn({
        event: 'ec:producer_disconnect_waiting',
        lobbyId: this.context.lobbyId,
        userId,
        waitSeconds,
      });

      this.state.producerDisconnectTimer = this.setTimeout(() => {
        this.state.producerDisconnectTimer = null;
        // Only the round this producer was producing, and only while it is still running.
        if (!this.isRunning || this.state.currentRound !== round || this.state.currentProducerUserId !== userId) return;
        if (this.state.phase === 'ROUND_RESULTS' || this.state.phase === 'TRANSITION') return;
        logger.warn({
          event: 'ec:producer_disconnect_skip',
          lobbyId: this.context.lobbyId,
          userId,
          round,
        });
        this.endRound('timeout');
      }, waitSeconds * 1000);
      return;
    }

    // An audience member leaving can complete the round: everyone still here has guessed it.
    if (
      this.state.phase === 'EMOJI_CONSTRUCTION' &&
      userId !== this.state.currentProducerUserId &&
      this.state.correctGuessers.length > 0 &&
      this.allAudienceGuessedCorrectly()
    ) {
      this.endRound('guessed');
    }
  }

  handlePlayerReconnect(userId: string): void {
    this.disconnectedPlayers.delete(userId);
    if (!this.state) return;

    // Cancel producer disconnect timer if they come back
    if (userId === this.state.currentProducerUserId && this.state.producerDisconnectTimer) {
      this.cancelProducerDisconnectTimer();

      logger.info({
        event: 'ec:producer_reconnect_cancel_skip',
        lobbyId: this.context.lobbyId,
        userId,
      });
    }

    logger.info({
      event: 'ec:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
      phase: this.state.phase,
    });
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.computeRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        totalRounds: this.state.totalRounds,
        roundsPlayed: Math.min(this.state.currentRound, this.state.totalRounds),
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] = [];

    for (const userId of this.context.players.keys()) {
      const player = this.context.players.get(userId)!;
      const score = this.state.playerScores.get(userId) ?? 0;

      entries.push({
        userId,
        userName: player.userName,
        score,
        rank: 0,
        deltas: {},
      });
    }

    entries.sort((a, b) => b.score - a.score);

    let currentRank = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].score < entries[i - 1].score) {
        currentRank = i + 1;
      }
      entries[i].rank = currentRank;
    }

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Aggregate per-player stats
    const stats: Record<
      string,
      {
        correctGuesses: number;
        producerRounds: number;
        producerCorrectGuessersTotal: number;
        closeGuesses: number;
        fastestCorrectTimestamp: number;
      }
    > = {};

    for (const uid of this.context.players.keys()) {
      stats[uid] = {
        correctGuesses: 0,
        producerRounds: 0,
        producerCorrectGuessersTotal: 0,
        closeGuesses: 0,
        fastestCorrectTimestamp: Infinity,
      };
    }

    // We need to reconstruct per-round data from the action log
    // Use actionLog entries to aggregate stats
    for (const entry of this.state.actionLog) {
      if (entry.type === 'submit_guess') {
        const uid = entry.payload.userId as string;
        const result = entry.payload.result as string;
        if (!stats[uid]) continue;
        if (result === 'correct') {
          stats[uid].correctGuesses++;
          if (entry.timestamp < stats[uid].fastestCorrectTimestamp) {
            stats[uid].fastestCorrectTimestamp = entry.timestamp;
          }
        } else if (result === 'close') {
          stats[uid].closeGuesses++;
        }
      }
      if (entry.type === 'round_end') {
        // Find who was the producer this round
        const roundIdx = (entry.payload.round as number) - 1;
        if (roundIdx >= 0 && roundIdx < this.state.rounds.length) {
          const producerId = this.state.rounds[roundIdx].producerUserId;
          if (stats[producerId]) {
            stats[producerId].producerRounds++;
            stats[producerId].producerCorrectGuessersTotal += (entry.payload.correctGuessCount as number) ?? 0;
          }
        }
      }
    }

    // 1. Movie Buff — most correct guesses
    const movieBuff = this.findTopPlayer(stats, (s) => s.correctGuesses);
    if (movieBuff && movieBuff.value > 0) {
      awards.push({
        userId: movieBuff.userId,
        title: 'Movie Buff',
        description: `Guessed ${movieBuff.value} movie${movieBuff.value === 1 ? '' : 's'} correctly`,
        icon: 'clapperboard',
      });
    }

    // 2. Emoji Picasso — producer with most correct guessers
    const emojiPicasso = this.findTopPlayer(stats, (s) => s.producerCorrectGuessersTotal);
    if (emojiPicasso && emojiPicasso.value > 0) {
      awards.push({
        userId: emojiPicasso.userId,
        title: 'Emoji Picasso',
        description: `Inspired ${emojiPicasso.value} correct guess${emojiPicasso.value === 1 ? '' : 'es'} as Producer`,
        icon: 'palette',
      });
    }

    // 3. Stumper — producer whose movie was hardest (fewest correct guessers, at least 1 round produced)
    let stumperUserId: string | null = null;
    let fewestGuessers = Infinity;
    for (const [uid, s] of Object.entries(stats)) {
      if (s.producerRounds > 0 && s.producerCorrectGuessersTotal < fewestGuessers) {
        fewestGuessers = s.producerCorrectGuessersTotal;
        stumperUserId = uid;
      }
    }
    if (stumperUserId !== null && fewestGuessers < Infinity) {
      awards.push({
        userId: stumperUserId,
        title: 'Stumper',
        description: `Only ${fewestGuessers} player${fewestGuessers === 1 ? '' : 's'} guessed their movie`,
        icon: 'lock',
      });
    }

    // 4. Speed Guesser — fastest correct guess (lowest timestamp for a correct guess)
    let speedUserId: string | null = null;
    let fastestTs = Infinity;
    for (const [uid, s] of Object.entries(stats)) {
      if (s.fastestCorrectTimestamp < fastestTs) {
        fastestTs = s.fastestCorrectTimestamp;
        speedUserId = uid;
      }
    }
    if (speedUserId && fastestTs < Infinity) {
      awards.push({
        userId: speedUserId,
        title: 'Speed Guesser',
        description: 'Fastest correct guess in the game',
        icon: 'zap',
      });
    }

    // 5. Close but No Cigar — most "close" guesses
    const closeBut = this.findTopPlayer(stats, (s) => s.closeGuesses);
    if (closeBut && closeBut.value > 0) {
      awards.push({
        userId: closeBut.userId,
        title: 'Close but No Cigar',
        description: `Had ${closeBut.value} close guess${closeBut.value === 1 ? '' : 'es'}`,
        icon: 'flame',
      });
    }

    return awards;
  }

  private findTopPlayer<T>(
    stats: Record<string, T>,
    getValue: (s: T) => number,
  ): {
    userId: string;
    value: number;
  } | null {
    let topUserId: string | null = null;
    let topValue = -1;
    for (const [uid, s] of Object.entries(stats)) {
      const v = getValue(s);
      if (v > topValue) {
        topValue = v;
        topUserId = uid;
      }
    }
    return topUserId
      ? {
          userId: topUserId,
          value: topValue,
        }
      : null;
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private setPhase(phase: ECPhase, durationSeconds: number): void {
    const now = Date.now();
    this.state.phase = phase;
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + durationSeconds * 1000;
  }

  private getTotalGuessCount(): number {
    let total = 0;
    for (const [, pg] of this.state.guesses) {
      total += pg.guesses.length;
    }
    return total;
  }

  /** Check if every CONNECTED audience member (non-producer) has guessed correctly. */
  private allAudienceGuessedCorrectly(): boolean {
    const correctSet = new Set(this.state.correctGuessers.map((g) => g.userId));
    for (const uid of this.state.guesses.keys()) {
      if (uid === this.state.currentProducerUserId) continue; // skip producer
      if (!this.isActivePlayer(uid)) continue; // departed players can't guess
      if (!correctSet.has(uid)) return false;
    }
    return true;
  }

  override cleanup(): void {
    this.cancelProducerDisconnectTimer();
    this.phaseTimeoutHandle = null;
    super.cleanup();
  }

  // ─── Action Log / Game Log ───────────────────────────────────

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      seq: ++this.actionSeq,
      type,
      timestamp: Date.now(),
      payload,
    });
  }

  buildGameLog(): Record<string, unknown> {
    const players = Array.from(this.context.players.entries()).map(([userId, p]) => ({
      userId,
      userName: p.userName,
    }));

    const scores: Record<string, number> = {};
    for (const [uid, s] of this.state.playerScores) scores[uid] = s;

    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      totalRounds: this.state.totalRounds,
      roundsPlayed: Math.min(this.state.currentRound, this.state.totalRounds),
      playerCount: this.context.players.size,
      players,
      producerOrder: this.state.producerOrder,
      actions: this.state.actionLog,
      finalScores: scores,
    };
  }
}

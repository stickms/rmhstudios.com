/**
 * RMHbox — Emoji Cinema Type Definitions
 *
 * Types for the Emoji Cinema minigame server handler.
 * Reference: docs/rmhbox/design-spec/minigames-2.md §4.4
 */

import type { MovieEntry } from '@/lib/rmhbox/emoji-cinema/data-loader';

// ─── Phase ───────────────────────────────────────────────────────

export type ECPhase = 'PRODUCER_ASSIGNMENT' | 'MOVIE_SELECTION' | 'EMOJI_CONSTRUCTION' | 'ROUND_RESULTS' | 'TRANSITION';

// ─── Round Data ──────────────────────────────────────────────────

export interface ECRoundData {
  movie: MovieEntry;
  producerUserId: string;
}

// ─── Guesses ─────────────────────────────────────────────────────

export interface ECPlayerGuess {
  text: string;
  result: 'correct' | 'close' | 'wrong';
  timestamp: number;
}

export interface ECPlayerGuesses {
  userId: string;
  guesses: ECPlayerGuess[];
}

// ─── Guess Log ───────────────────────────────────────────────────

/** An entry in the public guess log visible to all players. */
export interface GuessLogEntry {
  userId: string;
  userName: string;
  /** The guess text — omitted when the guess is correct to avoid revealing the answer. */
  guessText?: string;
  isCorrect: boolean;
  timestamp: number;
}

// ─── Correct Guesser ─────────────────────────────────────────────

export interface CorrectGuesser {
  userId: string;
  userName: string;
  guessText: string;
  timestamp: number;
  rank: number;
}

// ─── Game State ──────────────────────────────────────────────────

export interface EmojiCinemaState {
  rounds: ECRoundData[];
  currentRound: number;
  totalRounds: number;
  producerOrder: string[];
  phase: ECPhase;
  currentProducerUserId: string;
  currentMovie: MovieEntry;
  /** Three movie choices presented to the producer at MOVIE_SELECTION phase */
  movieChoices: MovieEntry[];
  emojiSequence: string[];
  guesses: Map<string, ECPlayerGuesses>;
  correctGuessers: CorrectGuesser[];
  closeGuessCount: number;
  /** Public guess log broadcast to all players during the guessing phase. */
  guessLog: GuessLogEntry[];
  playerScores: Map<string, number>;
  phaseStartedAt: number;
  phaseEndsAt: number;
  actionLog: Array<{ seq: number; type: string; timestamp: number; payload: Record<string, unknown> }>;
  /** Timer handle for producer disconnect wait */
  producerDisconnectTimer: NodeJS.Timeout | null;
}

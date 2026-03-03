/**
 * RMHbox — Human Keyboard Minigame Types
 *
 * Phase enum, interfaces, and type definitions for the Human Keyboard minigame.
 * Human Keyboard is a cooperative typing game where each player controls
 * a subset of the alphabet and they must work together to type a sentence.
 *
 * Scoring: each player's score = accuracy × typingSpeed × 100,
 * where accuracy = correctPresses / totalPresses and
 * typingSpeed = totalPresses / totalTurnTimeSeconds.
 */

import type { TargetSentence } from '@/lib/rmhbox/human-keyboard/data-loader';

// ─── Phase Enum ──────────────────────────────────────────────────

export type HKPhase = 'SENTENCE_REVEAL' | 'TYPING' | 'RESULTS';

// ─── Type Definitions ────────────────────────────────────────────

export interface HKPlayerStats {
  userId: string;
  correctPresses: number;
  wrongPresses: number;
  wrongPlayerPresses: number;
  /** Cumulative milliseconds where this player's turn was active. */
  turnTimeMs: number;
  /** Timestamp when the player's turn started (null if not their turn). */
  turnStartedAt: number | null;
  currentKeys: string[];
}

export interface HumanKeyboardState {
  targetSentence: TargetSentence;
  normalizedText: string;
  cursorPosition: number;
  displayCursorPosition: number;
  phase: HKPhase;
  isComplete: boolean;
  keyAssignments: Map<string, string[]>;
  letterToPlayer: Map<string, string>;
  nextReshuffleAt: number;
  reshuffleCount: number;
  playerStats: Map<string, HKPlayerStats>;
  /** userId of the player whose turn it currently is. */
  currentTurnPlayer: string | null;
  phaseStartedAt: number;
  phaseEndsAt: number;
  startedAt: number;
  completedAt: number | null;
}

export interface HKPlayerResult {
  userId: string;
  userName: string;
  correctPresses: number;
  wrongPresses: number;
  wrongPlayerPresses: number;
  /** Accuracy as a percentage (0-100). */
  accuracy: number;
  /** Average typing speed in letters per second. */
  typingSpeed: number;
  /** Effective typing speed = accuracy/100 × typingSpeed. */
  effectiveSpeed: number;
  score: number;
}

export interface ActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

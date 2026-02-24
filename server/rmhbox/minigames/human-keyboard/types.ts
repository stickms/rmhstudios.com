/**
 * RMHbox — Human Keyboard Minigame Types
 *
 * Phase enum, interfaces, and type definitions for the Human Keyboard minigame.
 * Human Keyboard is a cooperative typing game where each player controls
 * a subset of the alphabet and they must work together to type a sentence.
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
  accuracy: number;
  totalScore: number;
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
  lockUntil: number | null;
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
  accuracy: number;
  score: number;
  isMVP: boolean;
}

export interface ActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

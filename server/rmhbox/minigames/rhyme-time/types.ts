/**
 * RMHbox — Rhyme Time Minigame Types
 *
 * Phase enum, interfaces, and type definitions for the Rhyme Time minigame.
 */

import type { RootWord } from '../../../../lib/rmhbox/rhyme-time/dictionary-loader';

// ─── Phase Enum ──────────────────────────────────────────────────

export enum RhymeTimePhase {
  ROUND_START = 'ROUND_START',
  INPUT = 'INPUT',
  SCORING = 'SCORING',
  INTERMISSION = 'INTERMISSION',
}

// ─── Type Definitions ────────────────────────────────────────────

export interface PlayerSubmission {
  word: string;
  timestamp: number;
  isValid: boolean;
  isMultiSyllable: boolean;
  invalidReason?: 'does_not_rhyme' | 'not_in_dictionary';
}

/** Per-player submission list keyed by userId. */
export type PlayerSubmissions = Record<string, PlayerSubmission[]>;

export interface WordBreakdown {
  word: string;
  isValid: boolean;
  invalidReason?: 'does_not_rhyme' | 'not_in_dictionary';
  rarity: 'common' | 'uncommon' | 'rare' | null;
  basePoints: number;
  multiSyllableMultiplier: number;
  speedBonus: number;
  totalPoints: number;
  submitterCount: number;
  isMultiSyllable: boolean;
}

export interface PlayerRoundResult {
  userId: string;
  userName: string;
  breakdown: WordBreakdown[];
  roundScore: number;
  validCount: number;
  invalidCount: number;
}

export interface RoundResult {
  roundNumber: number;
  rootWord: RootWord;
  playerResults: Record<string, PlayerRoundResult>;
}

export interface ActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface RhymeTimeState {
  phase: RhymeTimePhase;
  currentRound: number;
  totalRounds: number;
  rootWord: RootWord | null;
  timeRemaining: number;
  submissions: PlayerSubmissions;
  roundResults: RoundResult[];
  scores: Record<string, number>;
  actionLog: ActionLogEntry[];
}

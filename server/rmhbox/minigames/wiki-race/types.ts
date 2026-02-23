/**
 * RMHbox — Wiki-Race Minigame Types
 *
 * Phase enum and all interfaces/types used by the Wiki-Race minigame.
 */

import type { ArticlePair } from '@/lib/rmhbox/wiki-race/data-loader';

// ─── Phase Enum ──────────────────────────────────────────────────

export enum WikiRacePhase {
  ARTICLE_REVEAL = 'ARTICLE_REVEAL',
  NAVIGATION = 'NAVIGATION',
  RESULTS = 'RESULTS',
}

// ─── Type Definitions ────────────────────────────────────────────

/** Per-player state tracked by the server during navigation. */
export interface WRPlayerState {
  userId: string;
  currentArticleTitle: string;
  currentArticleLinks: Set<string>;
  path: string[];
  clickCount: number;
  hasFinished: boolean;
  finishedAt: number | null;
  finishRank: number;
  score: number;
}

/** Action log entry for the game log. */
export interface ActionLogEntry {
  action: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Full internal state of the Wiki-Race minigame. */
export interface WikiRaceState {
  phase: WikiRacePhase;
  articlePair: ArticlePair;
  playerStates: Map<string, WRPlayerState>;
  timeRemaining: number;
  finishCounter: number;
  actionLog: ActionLogEntry[];
}

// ─── Per-player rate-limit tracking ──────────────────────────────

export interface RateLimitEntry {
  timestamps: number[];
}

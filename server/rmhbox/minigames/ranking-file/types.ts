/**
 * RMHbox — Ranking File Minigame Types
 */

import type { RankingRound } from '@/lib/rmhbox/ranking-file/set-loader';

export type RFPhase = 'ORDERING' | 'REVEAL';

/** One player's result for one round, sent at the reveal and kept for history. */
export interface RFPlayerRoundResult {
  userId: string;
  userName: string;
  /** The order they were in when the round ended (locked, or as it stood). */
  order: string[];
  /** Footrule distance from the official order. */
  distance: number;
  points: number;
  perfect: boolean;
  /** Whether they pressed Lock in before the round ended. */
  locked: boolean;
  newTotalScore: number;
}

/** The reveal of a round: the only place the order and values leave the server. */
export interface RFReveal {
  roundIndex: number;
  prompt: string;
  category: string;
  setId: string;
  source: string;
  official: Array<{ label: string; value: number; unit: string }>;
  results: RFPlayerRoundResult[];
}

export interface RankingFileState {
  rounds: RankingRound[];
  currentRound: number;
  totalRounds: number;
  phase: RFPhase;
  /** Everyone playing this round (join-in-progress players join at the next round). */
  participants: Set<string>;
  /** The order each participant has now. Starts as the round's display order. */
  orders: Map<string, string[]>;
  locked: Set<string>;
  scores: Map<string, number>;
  /** Rounds already revealed (history and awards). */
  revealed: RFReveal[];
  phaseStartedAt: number;
  phaseEndsAt: number;
}

export interface GameLogAction {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

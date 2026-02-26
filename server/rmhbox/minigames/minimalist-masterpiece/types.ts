/**
 * RMHbox — Minimalist Masterpiece Type Definitions
 *
 * Types for the Minimalist Masterpiece minigame server handler.
 * Reference: docs/rmhbox/design-spec/minigames-2.md §3.4
 */

import type { DrawingPrompt } from '@/lib/rmhbox/minimalist-masterpiece/data-loader';

// ─── Phase ───────────────────────────────────────────────────────

export type MMPhase = 'PROMPT_REVEAL' | 'DRAWING' | 'GALLERY' | 'AUCTION' | 'RESULTS';

// ─── Stroke Types (mirrored from schemas for server use) ─────────

export interface MMPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface MMStroke {
  id: string;
  points: MMPoint[];
  color: string;
  width: number;
  timestamp: number;
}

// ─── Drawing ─────────────────────────────────────────────────────

export interface PlayerDrawing {
  drawingId: string;
  strokes: MMStroke[];
  backgroundColor: string;
  submittedAt: number | null;
  strokeCount: number;
}

// ─── Bids ────────────────────────────────────────────────────────

export interface DrawingBids {
  drawingId: string;
  totalValue: number;
  bidders: Map<string, number>;
}

// ─── Rankings ────────────────────────────────────────────────────

export interface MMRanking {
  drawingId: string;
  artistUserId: string;
  artistUserName: string;
  marketValue: number;
  rank: number;
  points: number;
  strokes: MMStroke[];
  backgroundColor: string;
  /** Who won the painting in the auction (highest bidder) */
  winnerId?: string;
  winnerName?: string;
  /** What the winner paid */
  winnerPaid?: number;
}

// ─── Score Breakdown ─────────────────────────────────────────────

/** Per-player score breakdown under the second-price auction model. */
export interface PlayerScoreBreakdown {
  userId: string;
  userName: string;
  /** Market values of paintings they painted (artist credit) */
  paintedValue: number;
  /** Market values of paintings they won in auction */
  ownedValue: number;
  /** Total score = paintedValue + ownedValue */
  totalScore: number;
}

// ─── Auction Winner ──────────────────────────────────────────────

export interface AuctionWinner {
  drawingId: string;
  winnerId: string;
  winnerName: string;
  amountPaid: number;
}

// ─── Gallery / Auction Drawing ───────────────────────────────────

export interface GalleryDrawing {
  drawingId: string;
  label: string;
  strokes: MMStroke[];
  backgroundColor: string;
}

export interface AuctionDrawing extends GalleryDrawing {
  currentBidTotal: number;
  myBidAmount: number;
  isMine: boolean;
}

// ─── Game State ──────────────────────────────────────────────────

export interface MinimalistMasterpieceState {
  prompt: DrawingPrompt;
  phase: MMPhase;
  currentRound: number;
  totalRounds: number;
  drawings: Map<string, PlayerDrawing>;
  drawingIdToUserId: Map<string, string>;
  userIdToDrawingId: Map<string, string>;
  playerCurrencies: Map<string, number>;
  bids: Map<string, DrawingBids>;
  marketValues: Map<string, number>;
  /** Winner of each painting in the auction (highest bidder). */
  auctionWinners: Map<string, AuctionWinner>;
  rankings: MMRanking[] | null;
  /** Cumulative player scores across all rounds. */
  cumulativeScores: Map<string, number>;
  phaseStartedAt: number;
  phaseEndsAt: number;
  actionLog: Array<{ seq: number; type: string; timestamp: number; payload: Record<string, unknown> }>;
}

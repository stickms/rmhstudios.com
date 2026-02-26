/**
 * MarketResultsScreen — Final rankings with de-anonymization and score breakdowns.
 *
 * New scoring model:
 * - Market value of a painting = second highest bid on it (0 if ≤1 bidder)
 * - Player score = sum of market values of paintings they painted + market values of paintings they won
 */
'use client';

import DrawingCard from './DrawingCard';
import type { MMStroke } from './DrawingCard';

interface MMRanking {
  drawingId: string;
  artistUserId: string;
  artistUserName: string;
  marketValue: number;
  rank: number;
  points: number;
  strokes: MMStroke[];
  backgroundColor?: string;
  /** Who won the painting in the auction (if anyone) */
  winnerId?: string;
  winnerName?: string;
  /** What the winner paid */
  winnerPaid?: number;
}

interface PlayerScoreBreakdown {
  userId: string;
  userName: string;
  paintedValue: number;
  ownedValue: number;
  overbidPenalty: number;
  totalScore: number;
}

interface MarketResultsScreenProps {
  rankings: MMRanking[];
  scoreBreakdowns: PlayerScoreBreakdown[];
  prompt: string;
}

export default function MarketResultsScreen({
  rankings,
  scoreBreakdowns,
  prompt,
}: MarketResultsScreenProps) {
  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <h2 className="text-xl font-bold text-(--rmhbox-text)">Market Results</h2>
      <p className="text-sm text-(--rmhbox-text-muted)">Prompt: &quot;{prompt}&quot;</p>

      {/* Painting Rankings (by market value) */}
      <div className="w-full max-w-md space-y-3">
        {rankings.map((r) => (
          <div
            key={r.drawingId}
            className="flex items-center gap-3 p-3 rounded-lg border border-(--rmhbox-border)"
          >
            <span className="text-2xl font-bold text-(--rmhbox-accent) w-8 text-center">
              #{r.rank}
            </span>
            <DrawingCard strokes={r.strokes} backgroundColor={r.backgroundColor} className="w-16 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-(--rmhbox-text) truncate">
                {r.artistUserName}
              </p>
              <p className="text-xs text-(--rmhbox-text-muted)">
                Market value: {r.marketValue}
              </p>
              {r.winnerId && (
                <p className="text-xs text-(--rmhbox-text-muted)">
                  Won by {r.winnerName} for {r.winnerPaid}
                </p>
              )}
              {!r.winnerId && r.marketValue === 0 && (
                <p className="text-xs text-(--rmhbox-text-muted) italic">No bids</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Player Score Breakdowns */}
      {scoreBreakdowns.length > 0 && (
        <div className="w-full max-w-md">
          <h3 className="text-sm font-semibold text-(--rmhbox-text) mb-2">
            Score Breakdown
          </h3>
          <div className="space-y-2">
            {scoreBreakdowns
              .sort((a, b) => b.totalScore - a.totalScore)
              .map((sb) => (
                <div
                  key={sb.userId}
                  className="flex justify-between items-center text-sm px-3 py-2 rounded-lg bg-(--rmhbox-surface) border border-(--rmhbox-border)"
                >
                  <span className="font-medium text-(--rmhbox-text)">{sb.userName}</span>
                  <div className="flex items-center gap-3 text-xs">
                    {sb.paintedValue > 0 && (
                      <span className="text-(--rmhbox-text-muted)">Painted: {sb.paintedValue}</span>
                    )}
                    {sb.ownedValue > 0 && (
                      <span className="text-(--rmhbox-text-muted)">Owned: {sb.ownedValue}</span>
                    )}
                    {sb.overbidPenalty > 0 && (
                      <span className="text-red-500">Penalty: -{sb.overbidPenalty}</span>
                    )}
                    <span className="font-bold text-(--rmhbox-accent)">{sb.totalScore} pts</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

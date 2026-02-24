/**
 * RankingFileResults — Final game-over screen for Ranking File.
 *
 * Shows final rankings table with scores and stats, plus
 * collapsible per-round category results.
 *
 * Props:
 *   finalRankings   — Sorted player standings with stats
 *   categoryResults — Per-round category info for review
 */
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface FinalRanking {
  userId: string;
  userName: string;
  rank: number;
  totalScore: number;
  averageDistance: number;
  exactMatches: number;
  outlierRounds: number;
}

interface CategoryResult {
  roundNumber: number;
  category: { name: string; items: string[]; emoji: string };
}

interface RankingFileResultsProps {
  finalRankings: FinalRanking[];
  categoryResults: CategoryResult[];
}

const PODIUM_STYLES: Record<number, string> = {
  1: 'border-(--rmhbox-accent) bg-(--rmhbox-accent)/10 text-(--rmhbox-accent)',
  2: 'border-gray-400 bg-gray-400/10',
  3: 'border-amber-700 bg-amber-700/10',
};

const RANK_LABELS: Record<number, string> = { 1: '🏆', 2: '🥈', 3: '🥉' };

export default function RankingFileResults({
  finalRankings,
  categoryResults,
}: RankingFileResultsProps) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-6 w-full max-w-lg mx-auto text-(--rmhbox-text)"
    >
      <h2 className="text-3xl font-extrabold text-center text-(--rmhbox-accent)">
        Final Rankings
      </h2>

      {/* Rankings table */}
      <div className="flex flex-col gap-2">
        {finalRankings.map((player) => (
          <motion.div
            key={player.userId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: player.rank * 0.1, duration: 0.3 }}
            className={`
              flex items-center gap-3 rounded-lg border-2 px-4 py-3
              ${PODIUM_STYLES[player.rank] ?? 'border-(--rmhbox-border) bg-(--rmhbox-surface)'}
            `}
          >
            {/* Rank */}
            <span className="w-8 text-center text-xl font-bold">
              {RANK_LABELS[player.rank] ?? `#${player.rank}`}
            </span>

            {/* Player info */}
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{player.userName}</p>
              <div className="flex gap-3 text-xs text-(--rmhbox-text-muted)">
                <span>Avg dist: {player.averageDistance.toFixed(1)}</span>
                {player.exactMatches > 0 && (
                  <span>🎯 ×{player.exactMatches}</span>
                )}
                {player.outlierRounds > 0 && (
                  <span>🦄 ×{player.outlierRounds}</span>
                )}
              </div>
            </div>

            {/* Score */}
            <span className="text-xl font-extrabold">{player.totalScore}</span>
          </motion.div>
        ))}
      </div>

      {/* Per-round category breakdown (collapsible) */}
      {categoryResults.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            Round Recap
          </h3>
          {categoryResults.map((cr) => (
            <div key={cr.roundNumber} className="rounded-lg border border-(--rmhbox-border) overflow-hidden">
              <button
                onClick={() =>
                  setExpandedRound(expandedRound === cr.roundNumber ? null : cr.roundNumber)
                }
                className="w-full flex items-center justify-between px-4 py-2 bg-(--rmhbox-surface) hover:opacity-80 transition-opacity"
              >
                <span className="font-medium">
                  {cr.category.emoji} Round {cr.roundNumber}: {cr.category.name}
                </span>
                <span className="text-(--rmhbox-text-muted) text-sm">
                  {expandedRound === cr.roundNumber ? '▲' : '▼'}
                </span>
              </button>
              {expandedRound === cr.roundNumber && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="px-4 py-2 border-t border-(--rmhbox-border)"
                >
                  <ol className="list-decimal list-inside text-sm text-(--rmhbox-text-muted) space-y-1">
                    {cr.category.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

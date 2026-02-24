/**
 * ResultsComparison — Side-by-side comparison of the player's ranking
 * versus the group average after a round.
 *
 * Highlights deviations of ≥2 positions. Shows per-player distance
 * indicators and awards for most consensus / most unique.
 *
 * Props:
 *   myRanking      — The current player's submitted ranking
 *   averageRanking — Group average ranking per item
 *   items          — Item labels
 *   playerResults  — Per-player breakdown with distance/score
 *   mostConsensus  — Player closest to the group average
 *   mostUnique     — Player furthest from the group average
 */
'use client';

import { motion } from 'framer-motion';
import DistanceIndicator from './DistanceIndicator';
import AverageRankingChart from './AverageRankingChart';

interface PlayerResult {
  userId: string;
  userName: string;
  ranking: number[];
  distance: number;
  roundScore: number;
  isExactMatch: boolean;
  isOutlier: boolean;
}

interface ResultsComparisonProps {
  myRanking: number[];
  averageRanking: number[];
  items: string[];
  playerResults: PlayerResult[];
  mostConsensus: { userId: string; userName: string };
  mostUnique: { userId: string; userName: string };
}

export default function ResultsComparison({
  myRanking,
  averageRanking,
  items,
  playerResults,
  mostConsensus,
  mostUnique,
}: ResultsComparisonProps) {
  const maxDistance = Math.max(...playerResults.map((p) => p.distance), 1);

  // Build consensus order for the chart
  const consensusOrder = items
    .map((item, idx) => ({ item, avgRank: averageRanking[idx] }))
    .sort((a, b) => a.avgRank - b.avgRank);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-6 w-full max-w-lg mx-auto text-(--rmhbox-text)"
    >
      <h2 className="text-2xl font-bold text-center">Round Results</h2>

      {/* Side-by-side: Your Ranking vs Average */}
      <div className="grid grid-cols-2 gap-4">
        {/* Player's ranking */}
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            Your Ranking
          </h3>
          <div className="flex flex-col gap-1.5">
            {myRanking.map((itemIdx, rank) => {
              const avgRank = averageRanking[itemIdx];
              const deviation = Math.abs(rank + 1 - avgRank);
              const isDeviated = deviation >= 2;
              return (
                <div
                  key={`my-${itemIdx}`}
                  className={`
                    rounded border px-3 py-1.5 text-sm
                    ${isDeviated
                      ? 'border-(--rmhbox-danger) bg-red-500/10 text-(--rmhbox-danger)'
                      : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'}
                  `}
                >
                  <span className="font-bold mr-2">#{rank + 1}</span>
                  {items[itemIdx]}
                  {isDeviated && <span className="ml-1 text-xs">⚠️</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Average ranking chart */}
        <div>
          <AverageRankingChart
            items={items}
            averageRanking={averageRanking}
            consensusOrder={consensusOrder}
          />
        </div>
      </div>

      {/* Awards */}
      <div className="flex justify-center gap-6 text-sm">
        <div className="text-center">
          <p className="text-(--rmhbox-text-muted)">🎯 Most Consensus</p>
          <p className="font-bold text-(--rmhbox-accent)">{mostConsensus.userName}</p>
        </div>
        <div className="text-center">
          <p className="text-(--rmhbox-text-muted)">🦄 Most Unique</p>
          <p className="font-bold">{mostUnique.userName}</p>
        </div>
      </div>

      {/* Player distance breakdown */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
          Player Scores
        </h3>
        {playerResults
          .sort((a, b) => a.distance - b.distance)
          .map((player) => (
            <div
              key={player.userId}
              className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{player.userName}</span>
                <span className="text-sm font-bold text-(--rmhbox-accent)">
                  +{player.roundScore}
                </span>
              </div>
              <DistanceIndicator
                distance={player.distance}
                maxDistance={maxDistance}
                isExactMatch={player.isExactMatch}
                isOutlier={player.isOutlier}
              />
            </div>
          ))}
      </div>
    </motion.div>
  );
}

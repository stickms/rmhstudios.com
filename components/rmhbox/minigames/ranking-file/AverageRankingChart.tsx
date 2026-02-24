/**
 * AverageRankingChart — Horizontal bar chart showing each item's
 * average rank from the group consensus.
 *
 * Items are displayed in consensus order with bars proportional
 * to their average rank value.
 *
 * Props:
 *   items          — Original item labels
 *   averageRanking — Average rank values per item index
 *   consensusOrder — Items sorted by consensus with avgRank
 */
'use client';

import { motion } from 'framer-motion';

interface AverageRankingChartProps {
  items: string[];
  averageRanking: number[];
  consensusOrder: Array<{ item: string; avgRank: number }>;
}

export default function AverageRankingChart({
  consensusOrder,
}: AverageRankingChartProps) {

  const maxRank = Math.max(...consensusOrder.map((c) => c.avgRank), 1);

  return (
    <div className="w-full max-w-md mx-auto">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
        Group Consensus
      </h3>
      <div className="flex flex-col gap-2">
        {consensusOrder.map((entry, i) => {
          const barWidth = Math.max((entry.avgRank / maxRank) * 100, 8);
          return (
            <div key={entry.item} className="flex items-center gap-3">
              {/* Rank badge */}
              <span className="w-6 shrink-0 text-right text-sm font-bold text-(--rmhbox-text-muted)">
                {i + 1}
              </span>

              {/* Bar + label */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-sm font-medium text-(--rmhbox-text)">
                    {entry.item}
                  </span>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    className="h-5 rounded bg-(--rmhbox-accent) opacity-70"
                  />
                  <span className="shrink-0 text-xs text-(--rmhbox-text-muted)">
                    {entry.avgRank.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

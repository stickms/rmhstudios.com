/**
 * PixelPushersResults — Final results display for Pixel Pushers.
 *
 * Shows a ranking table with player name, score, push count, and
 * polarity flips handled. Awards are displayed for top performers.
 *
 * Props:
 *   finalRankings: FinalRanking[] — Sorted rankings from the server
 *   levelsCompleted: number — Total levels completed during the game
 *   currentUserId: string — ID of the viewing player (to highlight own row)
 */
'use client';

import { motion } from 'framer-motion';
import { Trophy, Zap, Target, Star } from 'lucide-react';
import type { FinalRanking } from './PixelPushersGame';

interface PixelPushersResultsProps {
  finalRankings: FinalRanking[];
  levelsCompleted: number;
  currentUserId: string;
}

const RANK_ICONS = ['🥇', '🥈', '🥉'];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

/** Derive simple awards from the final rankings. */
function deriveAwards(rankings: FinalRanking[]) {
  const awards: Array<{ icon: React.ReactNode; title: string; recipient: string; description: string }> = [];
  if (rankings.length === 0) return awards;

  // Most pushes
  const mostPushes = [...rankings].sort((a, b) => b.pushCount - a.pushCount)[0];
  if (mostPushes.pushCount > 0) {
    awards.push({
      icon: <Target className="h-5 w-5 text-(--rmhbox-accent)" />,
      title: 'Push Master',
      recipient: mostPushes.userName,
      description: `${mostPushes.pushCount} total pushes`,
    });
  }

  // Most polarity flips handled
  const mostFlips = [...rankings].sort((a, b) => b.polarityFlipsHandled - a.polarityFlipsHandled)[0];
  if (mostFlips.polarityFlipsHandled > 0) {
    awards.push({
      icon: <Zap className="h-5 w-5 text-(--rmhbox-warning)" />,
      title: 'Polarity Pro',
      recipient: mostFlips.userName,
      description: `Handled ${mostFlips.polarityFlipsHandled} polarity flips`,
    });
  }

  return awards;
}

export default function PixelPushersResults({
  finalRankings,
  levelsCompleted,
  currentUserId,
}: PixelPushersResultsProps) {
  const awards = deriveAwards(finalRankings);

  return (
    <motion.div
      className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 text-(--rmhbox-text)"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="text-center">
        <h2 className="text-2xl font-bold">Game Over</h2>
        <p className="mt-1 text-sm text-(--rmhbox-text-muted)">
          {levelsCompleted} level{levelsCompleted !== 1 ? 's' : ''} completed
        </p>
      </motion.div>

      {/* Rankings table */}
      <motion.div
        variants={itemVariants}
        className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3"
      >
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
          <Trophy className="h-4 w-4" /> Final Rankings
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-(--rmhbox-text-muted)">
              <th className="pb-1.5 font-medium">Rank</th>
              <th className="pb-1.5 font-medium">Player</th>
              <th className="pb-1.5 text-right font-medium">Score</th>
              <th className="pb-1.5 text-right font-medium">Pushes</th>
              <th className="pb-1.5 text-right font-medium">Flips</th>
            </tr>
          </thead>
          <tbody>
            {finalRankings.map((r) => (
              <tr
                key={r.userId}
                className={`border-t border-(--rmhbox-border) ${
                  r.userId === currentUserId ? 'text-(--rmhbox-accent)' : ''
                }`}
              >
                <td className="py-1.5 text-lg">
                  {r.rank <= 3 ? RANK_ICONS[r.rank - 1] : `#${r.rank}`}
                </td>
                <td className="py-1.5 font-medium">{r.userName}</td>
                <td className="py-1.5 text-right font-mono font-bold">{r.score}</td>
                <td className="py-1.5 text-right font-mono">{r.pushCount}</td>
                <td className="py-1.5 text-right font-mono">{r.polarityFlipsHandled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      {/* Awards */}
      {awards.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3"
        >
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            <Star className="h-4 w-4" /> Awards
          </h3>
          <div className="space-y-2">
            {awards.map((a) => (
              <div
                key={a.title}
                className="flex items-center gap-3 rounded-lg bg-(--rmhbox-bg)/50 px-3 py-2"
              >
                {a.icon}
                <div>
                  <span className="font-semibold">{a.title}</span>
                  <span className="mx-1 text-(--rmhbox-text-muted)">—</span>
                  <span className="text-(--rmhbox-accent)">{a.recipient}</span>
                  <p className="text-xs text-(--rmhbox-text-muted)">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

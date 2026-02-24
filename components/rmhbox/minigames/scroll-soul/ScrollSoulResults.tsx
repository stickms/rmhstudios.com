/**
 * ScrollSoulResults — Final results display for Scroll Soul.
 *
 * Shows a ranking table with player name, score, survival time,
 * ads dismissed, and ads tricked. Highlights the winner and
 * displays awards for top performers.
 *
 * Props:
 *   finalRankings: SCFinalRanking[] — Sorted rankings from the server
 *   totalSurvivalTimeMs: number — Total survival time of the game
 *   winner: string | null — User ID of the winner
 *   currentUserId: string — ID of the viewing player (to highlight own row)
 */
'use client';

import { motion } from 'framer-motion';
import { Trophy, Clock, Shield, Skull, Star } from 'lucide-react';
import type { SCFinalRanking } from './ScrollSoulGame';

interface ScrollSoulResultsProps {
  finalRankings: SCFinalRanking[];
  totalSurvivalTimeMs: number;
  winner: string | null;
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

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

/** Derive simple awards from the final rankings. */
function deriveAwards(rankings: SCFinalRanking[]) {
  const awards: Array<{ icon: React.ReactNode; title: string; recipient: string; description: string }> = [];
  if (rankings.length === 0) return awards;

  // Longest survivor
  const longestSurvivor = [...rankings].sort((a, b) => b.survivalTimeMs - a.survivalTimeMs)[0];
  if (longestSurvivor.survivalTimeMs > 0) {
    awards.push({
      icon: <Clock className="h-5 w-5 text-(--rmhbox-accent)" />,
      title: 'Last One Standing',
      recipient: longestSurvivor.userName,
      description: `Survived ${formatTime(longestSurvivor.survivalTimeMs)}`,
    });
  }

  // Most ads dismissed correctly
  const bestDismisser = [...rankings].sort((a, b) => b.adsDismissed - a.adsDismissed)[0];
  if (bestDismisser.adsDismissed > 0) {
    awards.push({
      icon: <Shield className="h-5 w-5 text-green-400" />,
      title: 'Ad Blocker',
      recipient: bestDismisser.userName,
      description: `Dismissed ${bestDismisser.adsDismissed} ads correctly`,
    });
  }

  // Most times tricked by ads
  const mostTricked = [...rankings].sort((a, b) => b.adsTricked - a.adsTricked)[0];
  if (mostTricked.adsTricked > 0) {
    awards.push({
      icon: <Skull className="h-5 w-5 text-red-400" />,
      title: 'Click Bait Victim',
      recipient: mostTricked.userName,
      description: `Tricked ${mostTricked.adsTricked} times`,
    });
  }

  return awards;
}

export default function ScrollSoulResults({
  finalRankings,
  totalSurvivalTimeMs,
  winner,
  currentUserId,
}: ScrollSoulResultsProps) {
  const awards = deriveAwards(finalRankings);
  const winnerName = finalRankings.find((r) => r.userId === winner)?.userName ?? winner;

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
          Total survival time: {formatTime(totalSurvivalTimeMs)}
        </p>
        {winnerName && (
          <motion.p
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
            className="mt-2 text-lg font-bold text-(--rmhbox-accent)"
          >
            🏆 {winnerName} wins!
          </motion.p>
        )}
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
              <th className="pb-1.5 text-right font-medium">Survived</th>
              <th className="pb-1.5 text-right font-medium">Ads</th>
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
                <td className="py-1.5 text-right font-mono">{formatTime(r.survivalTimeMs)}</td>
                <td className="py-1.5 text-right font-mono">{r.adsDismissed}</td>
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

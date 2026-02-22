/**
 * RhymeTimeScoreboard — Intermission / game-over scoreboard for Rhyme Time.
 *
 * Displays cumulative scores sorted descending, with animated score deltas
 * from the latest round. Highlights the current MVP. Shows a next-round
 * preview during intermission or awards when the game is over.
 *
 * Props:
 *   standings: Standing[] — Cumulative player standings, sorted by score
 *   currentUserId: string — ID of the viewing player
 *   currentRound: number — Round just completed
 *   totalRounds: number — Total rounds in the game
 *   isGameOver: boolean — Whether the game has ended
 *   awards?: AwardEntry[] — Awards shown at game over
 */
'use client';

import { motion } from 'framer-motion';
import { Trophy, ArrowUp, Award as AwardIcon } from 'lucide-react';

export interface Standing {
  userId: string;
  userName: string;
  totalScore: number;
  delta: number;
}

export interface AwardEntry {
  icon: string;
  title: string;
  recipient: string;
  description: string;
}

interface RhymeTimeScoreboardProps {
  standings: Standing[];
  currentUserId: string;
  currentRound: number;
  totalRounds: number;
  isGameOver: boolean;
  awards?: AwardEntry[];
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35 } },
};

export default function RhymeTimeScoreboard({
  standings,
  currentUserId,
  currentRound,
  totalRounds,
  isGameOver,
  awards = [],
}: RhymeTimeScoreboardProps) {
  const sorted = [...standings].sort((a, b) => b.totalScore - a.totalScore);
  const mvpId = sorted.length > 0 ? sorted[0].userId : null;

  return (
    <motion.div
      className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6 text-(--rmhbox-text)"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={rowVariants} className="text-center">
        <h2 className="text-2xl font-bold">
          {isGameOver ? 'Final Scores' : 'Scoreboard'}
        </h2>
        {!isGameOver && (
          <p className="mt-1 text-sm text-(--rmhbox-text-muted)">
            After round {currentRound} of {totalRounds}
          </p>
        )}
      </motion.div>

      {/* Standings list */}
      <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
        <ul className="space-y-2">
          {sorted.map((player, idx) => {
            const isMvp = player.userId === mvpId;
            const isSelf = player.userId === currentUserId;

            return (
              <motion.li
                key={player.userId}
                variants={rowVariants}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  isMvp
                    ? 'bg-yellow-500/10 ring-1 ring-yellow-500/30'
                    : isSelf
                      ? 'bg-(--rmhbox-accent)/10 ring-1 ring-(--rmhbox-accent)/30'
                      : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right font-mono font-bold text-(--rmhbox-text-muted)">
                    {idx + 1}
                  </span>
                  {isMvp && <Trophy className="h-4 w-4 text-yellow-400" />}
                  <span className="font-semibold">{player.userName}</span>
                  {isMvp && (
                    <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-medium text-yellow-300 border border-yellow-500/30">
                      MVP
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {player.delta > 0 && (
                    <motion.span
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + idx * 0.1, duration: 0.3 }}
                      className="flex items-center gap-0.5 text-xs font-medium text-green-400"
                    >
                      <ArrowUp className="h-3 w-3" />+{player.delta}
                    </motion.span>
                  )}
                  <span className="font-mono font-bold text-(--rmhbox-accent)">
                    {player.totalScore}
                  </span>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>

      {/* Next round preview */}
      {!isGameOver && (
        <motion.p
          variants={rowVariants}
          className="text-center text-sm text-(--rmhbox-text-muted)"
        >
          Next up: Round {currentRound + 1} of {totalRounds}
        </motion.p>
      )}

      {/* Awards (game over) */}
      {isGameOver && awards.length > 0 && (
        <motion.div
          variants={rowVariants}
          className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
        >
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            <AwardIcon className="h-4 w-4" /> Awards
          </h3>
          <ul className="space-y-3">
            {awards.map((award, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="text-xl">{award.icon}</span>
                <div>
                  <span className="font-semibold">{award.title}</span>
                  <span className="mx-1 text-(--rmhbox-text-muted)">—</span>
                  <span className="text-sm text-(--rmhbox-accent)">{award.recipient}</span>
                  <p className="text-xs text-(--rmhbox-text-muted)">{award.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </motion.div>
  );
}

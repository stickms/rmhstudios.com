/**
 * SequenceSamResults — Final results display for Sequence Sam.
 *
 * Shows rankings table with scores and optional awards.
 */
'use client';

import { motion } from 'framer-motion';
import { Trophy, Award as AwardIcon } from 'lucide-react';
import LucideAwardIcon from '../../LucideAwardIcon';

export interface Ranking {
  userId: string;
  userName: string;
  score: number;
  rank: number;
}

export interface AwardEntry {
  icon: string;
  title: string;
  recipient: string;
  description: string;
}

interface SequenceSamResultsProps {
  rankings: Ranking[];
  awards: AwardEntry[];
  currentUserId: string;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35 } },
};

export default function SequenceSamResults({
  rankings,
  awards,
  currentUserId,
}: SequenceSamResultsProps) {
  const sorted = [...rankings].sort((a, b) => a.rank - b.rank);

  return (
    <motion.div
      className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6 text-(--rmhbox-text)"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={rowVariants} className="text-center">
        <h2 className="text-2xl font-bold">Final Results</h2>
      </motion.div>

      <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
        <ul className="space-y-2">
          {sorted.map((player) => {
            const isWinner = player.rank === 1;
            const isSelf = player.userId === currentUserId;

            return (
              <motion.li
                key={player.userId}
                variants={rowVariants}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  isWinner
                    ? 'bg-(--rmhbox-warning)/10 ring-1 ring-(--rmhbox-warning)/30'
                    : isSelf
                      ? 'bg-(--rmhbox-accent)/10 ring-1 ring-(--rmhbox-accent)/30'
                      : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right font-mono font-bold text-(--rmhbox-text-muted)">
                    {player.rank}
                  </span>
                  {isWinner && <Trophy className="h-4 w-4 text-(--rmhbox-warning)" />}
                  <span className="font-semibold">{player.userName}</span>
                </div>
                <span className="font-mono font-bold text-(--rmhbox-accent)">
                  {player.score}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </div>

      {awards.length > 0 && (
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
                <LucideAwardIcon name={award.icon} className="h-5 w-5" />
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

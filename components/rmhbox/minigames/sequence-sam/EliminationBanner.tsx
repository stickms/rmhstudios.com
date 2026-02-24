/**
 * EliminationBanner — Elimination overlay for Sequence Sam.
 *
 * Shown when a player is eliminated from the game.
 */
'use client';

import { motion } from 'framer-motion';
import { XCircle } from 'lucide-react';

interface EliminationBannerProps {
  rank: number;
  score: number;
}

export default function EliminationBanner({ rank, score }: EliminationBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, type: 'spring' }}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-(--rmhbox-danger)/40 bg-(--rmhbox-surface) p-8 text-center"
    >
      <XCircle className="h-12 w-12 text-(--rmhbox-danger)" />
      <h2 className="text-2xl font-bold text-(--rmhbox-danger)">You&apos;ve been eliminated!</h2>
      <div className="flex gap-6 text-sm text-(--rmhbox-text-muted)">
        <div>
          <p className="text-xs uppercase tracking-wider">Final Rank</p>
          <p className="mt-1 text-2xl font-bold text-(--rmhbox-text)">#{rank}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider">Score</p>
          <p className="mt-1 text-2xl font-bold text-(--rmhbox-accent)">{score}</p>
        </div>
      </div>
      <p className="text-sm text-(--rmhbox-text-muted)">Watch the remaining players battle it out!</p>
    </motion.div>
  );
}

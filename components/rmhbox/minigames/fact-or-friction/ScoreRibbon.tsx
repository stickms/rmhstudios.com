/**
 * ScoreRibbon — Bottom score bar for Fact or Friction.
 *
 * Shows the player's running score, animated score delta,
 * players-answered count, a pass button, and timer.
 */
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { SkipForward, Users } from 'lucide-react';

interface ScoreRibbonProps {
  score: number;
  scoreChange: number | null;
  playersAnswered: number;
  totalPlayers: number;
  timeRemaining: number;
  canPass: boolean;
  onPass: () => void;
}

export default function ScoreRibbon({
  score,
  scoreChange,
  playersAnswered,
  totalPlayers,
  timeRemaining,
  canPass,
  onPass,
}: ScoreRibbonProps) {
  return (
    <div className="flex w-full items-center justify-between rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) px-4 py-2">
      {/* Score */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-(--rmhbox-text-muted)">Score</span>
        <span className="text-lg font-bold tabular-nums text-(--rmhbox-text)">{score}</span>
        <AnimatePresence>
          {scoreChange != null && scoreChange !== 0 && (
            <motion.span
              key={scoreChange}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3 }}
              className={`text-sm font-bold ${
                scoreChange > 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {scoreChange > 0 ? '+' : ''}{scoreChange}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Players answered */}
      <div className="flex items-center gap-1 text-xs text-(--rmhbox-text-muted)">
        <Users className="h-3.5 w-3.5" />
        <span>{playersAnswered}/{totalPlayers}</span>
      </div>

      {/* Timer */}
      <span className={`text-sm font-bold tabular-nums ${
        timeRemaining <= 5 ? 'text-red-400' : 'text-(--rmhbox-text-muted)'
      }`}>
        {timeRemaining}s
      </span>

      {/* Pass button */}
      {canPass && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onPass}
          className="flex items-center gap-1 rounded-md border border-(--rmhbox-border) bg-(--rmhbox-surface-hover) px-3 py-1.5 text-xs font-medium text-(--rmhbox-text-muted) transition-colors hover:text-(--rmhbox-text)"
        >
          <SkipForward className="h-3.5 w-3.5" />
          Pass
        </motion.button>
      )}
    </div>
  );
}

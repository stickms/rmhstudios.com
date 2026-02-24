/**
 * TurnIndicator — Turn info display for Undercover Editor.
 *
 * Shows the active player, turn progress (e.g. "Turn 4/12"),
 * a "Your turn!" highlight when it's the current player's turn,
 * and the remaining time.
 *
 * Props:
 *   activePlayerName: string — Name of the player whose turn it is
 *   isMyTurn: boolean — Whether it's the current player's turn
 *   turnNumber: number — Current turn number (1-based)
 *   totalTurns: number — Total turns in the writing phase
 *   timeRemaining: number — Seconds left in the current turn
 */
'use client';

import { motion } from 'framer-motion';
import { Clock, PenLine } from 'lucide-react';

interface TurnIndicatorProps {
  activePlayerName: string;
  isMyTurn: boolean;
  turnNumber: number;
  totalTurns: number;
  timeRemaining: number;
}

export default function TurnIndicator({
  activePlayerName,
  isMyTurn,
  turnNumber,
  totalTurns,
  timeRemaining,
}: TurnIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-2 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
    >
      {/* Turn progress */}
      <div className="flex items-center gap-3 text-sm text-(--rmhbox-text-muted)">
        <span className="font-mono">
          Turn {turnNumber}/{totalTurns}
        </span>
        <span className="opacity-40">•</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono font-semibold">{timeRemaining}s</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-(--rmhbox-border)">
        <div
          className="h-full rounded-full bg-(--rmhbox-accent) transition-all duration-300"
          style={{ width: `${totalTurns > 0 ? (turnNumber / totalTurns) * 100 : 0}%` }}
        />
      </div>

      {/* Active player */}
      {isMyTurn ? (
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          className="flex items-center gap-2 text-base font-bold text-(--rmhbox-accent)"
        >
          <PenLine className="h-4 w-4" />
          Your turn to write!
        </motion.div>
      ) : (
        <p className="text-sm text-(--rmhbox-text-muted)">
          <span className="font-medium text-(--rmhbox-text)">{activePlayerName}</span> is writing…
        </p>
      )}
    </motion.div>
  );
}

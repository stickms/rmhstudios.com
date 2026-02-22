/**
 * TurnIndicator — Phase and turn status bar for Undercover Agent.
 *
 * Displays:
 *   - Which team's turn it is (e.g., "Red Team — Clue Phase")
 *   - Timer countdown (formatted as seconds)
 *   - Turn number
 *   - Winner/game-over state
 *
 * Animates transitions between phases.
 *
 * Props:
 *   phase: string — Current game phase
 *   currentTeam: 'red' | 'blue' — Active team
 *   turnNumber: number — Current turn
 *   timeRemaining: number — Seconds left in the phase
 *   winner: 'red' | 'blue' | 'draw' | null — Game winner (if set)
 *   winReason: string | null — Reason for game ending
 */
'use client';

import { motion } from 'framer-motion';
import { Clock, Hash } from 'lucide-react';

interface TurnIndicatorProps {
  phase: string;
  currentTeam: 'red' | 'blue';
  turnNumber: number;
  timeRemaining: number;
  winner: 'red' | 'blue' | 'draw' | null;
  winReason: string | null;
}

/** Map phase IDs to human-readable labels */
const PHASE_LABELS: Record<string, string> = {
  SETUP: 'Setting Up',
  CLUE: 'Clue Phase',
  GUESS: 'Guess Phase',
  TURN_TRANSITION: 'Switching Turns…',
  GAME_OVER: 'Game Over',
};

export default function TurnIndicator({
  phase,
  currentTeam,
  turnNumber,
  timeRemaining,
  winner,
}: TurnIndicatorProps) {
  const isRed = currentTeam === 'red';
  const teamColor = isRed ? 'text-red-400' : 'text-blue-400';
  const phaseLabel = PHASE_LABELS[phase] ?? phase;
  const isGameOver = phase === 'GAME_OVER';

  return (
    <motion.div
      layout
      className="flex items-center justify-between rounded-lg border border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)] px-4 py-2 text-sm"
    >
      {/* Left: team + phase */}
      <div className="flex items-center gap-2">
        {!isGameOver && (
          <>
            <span className={`font-bold uppercase ${teamColor}`}>
              {currentTeam}
            </span>
            <span className="text-[var(--rmhbox-text-muted)]">—</span>
          </>
        )}
        <span className="font-medium text-[var(--rmhbox-text)]">{phaseLabel}</span>
        {winner && winner !== 'draw' && (
          <span className={`ml-2 font-bold ${winner === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
            🏆 {winner.charAt(0).toUpperCase() + winner.slice(1)} wins!
          </span>
        )}
      </div>

      {/* Right: turn number + timer */}
      <div className="flex items-center gap-4">
        {turnNumber > 0 && (
          <span className="flex items-center gap-1 text-[var(--rmhbox-text-muted)]">
            <Hash className="h-3.5 w-3.5" />
            <span className="font-mono">{turnNumber}</span>
          </span>
        )}
        {!isGameOver && timeRemaining > 0 && (
          <span
            className={`flex items-center gap-1 font-mono font-semibold ${
              timeRemaining <= 10 ? 'text-red-400' : 'text-[var(--rmhbox-text-muted)]'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {timeRemaining}s
          </span>
        )}
      </div>
    </motion.div>
  );
}

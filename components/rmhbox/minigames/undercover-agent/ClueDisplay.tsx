/**
 * ClueDisplay — Shows the active clue and guess controls for Undercover Agent.
 *
 * Displayed to operatives (and spectators) during CLUE and GUESS phases.
 * Shows:
 *   - The clue word and number when a clue is active
 *   - "Waiting for [Spymaster]…" when the spymaster hasn't given a clue yet
 *   - Guesses remaining counter
 *   - "End Turn" button (only for current team operatives during GUESS)
 *
 * Props:
 *   clue: ActiveClue | null — Current clue data
 *   guessesRemaining: number — Remaining guesses
 *   isWaiting: boolean — Whether we're waiting for the spymaster's clue
 *   spymasterName: string — Spymaster's display name
 *   onEndTurn: (() => void) | undefined — Callback to voluntarily end the turn
 */
'use client';

import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import type { ActiveClue } from './UndercoverAgentGame';

interface ClueDisplayProps {
  clue: ActiveClue | null;
  guessesRemaining: number;
  isWaiting: boolean;
  spymasterName: string;
  onEndTurn: (() => void) | undefined;
}

export default function ClueDisplay({ clue, guessesRemaining, isWaiting, spymasterName, onEndTurn }: ClueDisplayProps) {
  if (isWaiting && !clue) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)] p-4 text-center">
        <MessageSquare className="h-6 w-6 text-[var(--rmhbox-text-muted)] animate-pulse" />
        <p className="text-sm text-[var(--rmhbox-text-muted)]">
          Waiting for <span className="font-semibold text-[var(--rmhbox-accent)]">{spymasterName}</span> to give a clue…
        </p>
      </div>
    );
  }

  if (!clue) return null;

  const displayNumber = clue.number === 'unlimited' ? '∞' : clue.number;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)] p-4"
    >
      {/* Clue word + number */}
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-extrabold uppercase tracking-wide text-[var(--rmhbox-accent)]">
          {clue.word}
        </span>
        <span className="rounded-full bg-[var(--rmhbox-accent)]/20 px-3 py-1 text-lg font-bold text-[var(--rmhbox-accent)]">
          {displayNumber}
        </span>
      </div>

      {/* Guesses remaining */}
      <p className="text-sm text-[var(--rmhbox-text-muted)]">
        Guesses remaining: <span className="font-mono font-semibold text-[var(--rmhbox-text)]">{guessesRemaining}</span>
      </p>

      {/* End turn button (only for operatives on the active team) */}
      {onEndTurn && (
        <button
          onClick={onEndTurn}
          className="mt-1 rounded-lg border border-[var(--rmhbox-border)] px-4 py-1.5 text-sm font-medium text-[var(--rmhbox-text-muted)] transition-colors hover:border-[var(--rmhbox-accent)] hover:text-[var(--rmhbox-accent)]"
        >
          End Turn
        </button>
      )}
    </motion.div>
  );
}

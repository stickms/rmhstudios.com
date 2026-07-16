/**
 * OptionButton — A/B/C/D answer button for Fact or Friction.
 *
 * Displays answer text with a letter prefix and supports multiple
 * visual states: default, selected (locked in), correct, incorrect, disabled.
 * Touch-friendly sizing for mobile play.
 */
'use client';

import { m as motion } from 'framer-motion';

export type OptionState = 'default' | 'selected' | 'correct' | 'incorrect' | 'disabled';

interface OptionButtonProps {
  index: number;
  text: string;
  state: OptionState;
  lockedPotValue?: number;
  onClick: () => void;
}

const LABELS = ['A', 'B', 'C', 'D'];

const STATE_STYLES: Record<OptionState, string> = {
  default:
    'border-(--rmhbox-border) bg-(--rmhbox-surface-hover) text-(--rmhbox-text) hover:border-(--rmhbox-accent) hover:bg-(--rmhbox-accent)/10 cursor-pointer',
  selected:
    'border-(--rmhbox-accent) bg-(--rmhbox-accent)/20 text-(--rmhbox-accent) ring-2 ring-(--rmhbox-accent)/40',
  correct:
    'border-green-500 bg-green-500/20 text-green-400',
  incorrect:
    'border-red-500 bg-red-500/20 text-red-400',
  disabled:
    'border-(--rmhbox-border) bg-(--rmhbox-bg) text-(--rmhbox-text-muted) opacity-60 cursor-not-allowed',
};

export default function OptionButton({
  index,
  text,
  state,
  lockedPotValue,
  onClick,
}: OptionButtonProps) {
  const isInteractive = state === 'default';
  const label = LABELS[index] ?? String(index + 1);

  return (
    <motion.button
      whileTap={isInteractive ? { scale: 0.97 } : undefined}
      onClick={isInteractive ? onClick : undefined}
      disabled={!isInteractive}
      className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors ${STATE_STYLES[state]}`}
    >
      {/* Letter prefix */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/20 text-sm font-bold">
        {label}
      </span>

      {/* Answer text */}
      <span className="flex-1 text-sm font-medium">{text}</span>

      {/* Locked-in pot value badge */}
      {state === 'selected' && lockedPotValue != null && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="shrink-0 rounded-full bg-(--rmhbox-accent)/30 px-2 py-0.5 text-xs font-semibold text-(--rmhbox-accent)"
        >
          {lockedPotValue} pts
        </motion.span>
      )}
    </motion.button>
  );
}

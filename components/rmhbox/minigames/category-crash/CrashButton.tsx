/**
 * CrashButton — Toggle crash/uncrash button.
 *
 * Shows a 💥 crash toggle. When crashed, turns red with de-emphasis.
 * Disabled when the answer cell is empty.
 *
 * Props:
 *   isCrashed: boolean — Whether the current player has crashed this answer
 *   isEmpty: boolean   — Whether the answer is empty (no crash allowed)
 *   onToggle: () => void — Callback to toggle crash state
 */
'use client';

import { Flame } from 'lucide-react';

interface CrashButtonProps {
  isCrashed: boolean;
  isEmpty: boolean;
  onToggle: () => void;
}

export default function CrashButton({
  isCrashed,
  isEmpty,
  onToggle,
}: CrashButtonProps) {
  const disabled = isEmpty;

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium
        transition-colors
        ${
          isCrashed
            ? 'bg-red-500/30 text-red-300 border border-red-500/40 hover:bg-red-500/20'
            : 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted) border border-(--rmhbox-border) hover:bg-red-500/10 hover:text-red-300'
        }
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={
        isEmpty
          ? 'Cannot crash an empty answer'
          : isCrashed
            ? 'Click to remove crash'
            : 'Click to crash this answer'
      }
    >
      <Flame className="h-3.5 w-3.5" /> {isCrashed ? 'Crashed' : 'Crash'}
    </button>
  );
}

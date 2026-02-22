/**
 * CrashButton — Toggle crash/uncrash button.
 *
 * Shows a 💥 crash toggle. When crashed, turns red with de-emphasis.
 * Disabled when the player has spent all crash tokens or when the
 * answer cell is empty.
 *
 * Props:
 *   isCrashed: boolean — Whether the current player has crashed this answer
 *   canCrash: boolean  — Whether the player still has available crash tokens
 *   isEmpty: boolean   — Whether the answer is empty (no crash allowed)
 *   onToggle: () => void — Callback to toggle crash state
 */
'use client';

interface CrashButtonProps {
  isCrashed: boolean;
  canCrash: boolean;
  isEmpty: boolean;
  onToggle: () => void;
}

export default function CrashButton({
  isCrashed,
  canCrash,
  isEmpty,
  onToggle,
}: CrashButtonProps) {
  const disabled = isEmpty || (!isCrashed && !canCrash);

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
        ${disabled && !isCrashed ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={
        isEmpty
          ? 'Cannot crash an empty answer'
          : isCrashed
            ? 'Click to remove crash'
            : canCrash
              ? 'Click to crash this answer'
              : 'No crashes remaining'
      }
    >
      💥 {isCrashed ? 'Crashed' : 'Crash'}
    </button>
  );
}

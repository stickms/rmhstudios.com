/**
 * ProgressBar — Horizontal progress bar for Human Keyboard.
 *
 * Displays an animated fill bar with a percentage label
 * indicating overall sentence completion progress.
 */
'use client';

interface ProgressBarProps {
  /** Completion ratio from 0.0 to 1.0 */
  progress: number;
}

export default function ProgressBar({ progress }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-(--rmhbox-text-muted)">Progress</span>
        <span className="text-xs font-mono text-(--rmhbox-text-muted)">{pct}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-(--rmhbox-surface-hover) overflow-hidden">
        <div
          className="h-full rounded-full bg-(--rmhbox-accent) transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

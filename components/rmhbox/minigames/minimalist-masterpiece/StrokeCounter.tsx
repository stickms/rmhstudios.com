/**
 * StrokeCounter — Visual indicator showing strokes used / max strokes.
 */
'use client';

interface StrokeCounterProps {
  current: number;
  max: number;
}

export default function StrokeCounter({ current, max }: StrokeCounterProps) {
  const remaining = max - current;
  const pct = max > 0 ? (current / max) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 rounded-full bg-(--rmhbox-border) overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${pct}%`,
            backgroundColor: remaining <= 1 ? 'var(--rmhbox-danger)' : 'var(--rmhbox-accent)',
          }}
        />
      </div>
      <span
        className={`text-sm font-mono ${
          remaining <= 1 ? 'text-(--rmhbox-danger)' : 'text-(--rmhbox-text-muted)'
        }`}
      >
        {current}/{max}
      </span>
    </div>
  );
}

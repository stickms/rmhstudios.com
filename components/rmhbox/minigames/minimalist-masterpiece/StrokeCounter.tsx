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
      <div className="w-24 h-2 rounded-full bg-(--app-border) overflow-hidden">
        <div
          className="h-full w-full origin-left transition-[transform,background-color] duration-200"
          style={{
            transform: `scaleX(${(pct) / 100})`,
            backgroundColor: remaining <= 1 ? 'var(--app-danger)' : 'var(--app-accent)',
          }}
        />
      </div>
      <span
        className={`text-sm font-mono ${
          remaining <= 1 ? 'text-(--app-danger)' : 'text-(--app-text-muted)'
        }`}
      >
        {current}/{max}
      </span>
    </div>
  );
}

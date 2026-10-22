import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/perf/derive';

interface MeterProps {
  /** Already-translated name, e.g. "Heap". */
  label: string;
  value: number;
  /** Capacity; null/0 renders the value with no bar. */
  max: number | null | undefined;
  /** Pre-formatted "used / limit" text shown on the right. */
  text: string;
  tone?: Tone;
}

/** A labelled usage bar (memory vs limit). Fill colour follows the tone token. */
export function Meter({ label, value, max, text, tone = 'none' }: MeterProps) {
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-site-text-muted">{label}</span>
        <span className="tabular-nums text-site-text">{text}</span>
      </div>
      {max ? (
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="mt-1 h-2 overflow-hidden rounded-full bg-site-surface-active"
        >
          <div
            className={cn(
              'h-full rounded-full',
              tone === 'danger'
                ? 'bg-site-danger'
                : tone === 'warn'
                  ? 'bg-site-warning'
                  : 'bg-site-accent',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

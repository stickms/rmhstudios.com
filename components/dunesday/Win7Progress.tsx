'use client';

/**
 * The Windows 7 progress bar from 7.css — green gel with the travelling shine.
 * Wrapped in its own `.win7` scope so 7.css reaches nothing else.
 */

import { cn } from '@/lib/utils';

export function Win7Progress({
  value,
  label,
  tone = 'ok',
  shine = true,
  className,
}: {
  /** 0–1 */
  value: number;
  /** Accessible name; omit for a purely decorative bar. */
  label?: string;
  tone?: 'ok' | 'paused' | 'error';
  /** The travelling highlight. Off for repeated rows: one shine per bar adds up. */
  shine?: boolean;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    // Spans, not divs, so the bar is valid inside a <button> (the watch list's
    // group headers). `.ds-w7-progress` makes them block-level.
    <span className={cn('win7 ds-w7-progress', className)} aria-hidden={label ? undefined : true}>
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={cn(
          shine && pct > 0 && pct < 100 && 'animate',
          tone === 'paused' && 'paused',
          tone === 'error' && 'error',
        )}
      >
        <span style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

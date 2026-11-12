import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A ledger of headline numbers: two columns on a phone, four from `sm`. Each
 * tile hangs from its own top rule, so a row of tiles reads as one ruled line
 * however many lines a label or hint wraps to (R3: rules, not boxes).
 */
export function StatGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('grid grid-cols-2 gap-x-4 sm:grid-cols-4 sm:gap-x-6', className)}>
      {children}
    </div>
  );
}

/**
 * One headline number on an admin dashboard: label, value, optional hint.
 * Replaces the private `Stat` copies in analytics, economy and the bots page.
 *
 * `icon` stays in the API so call sites compile; like `EmptyState`, it is not
 * drawn. The label says what the number is, and the glyph cost a phone the
 * width that truncated the label ("Coins in circulati…").
 */
export function StatTile({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  tone?: 'good' | 'bad';
  className?: string;
}) {
  const toneClass =
    tone === 'good' ? 'text-site-success' : tone === 'bad' ? 'text-site-danger' : 'text-site-text';
  return (
    <div className={cn('min-w-0 border-t border-site-border py-3', className)}>
      <p className="t-label">{label}</p>
      <p className={cn('t-heading mt-1 break-words tabular-nums', toneClass)}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {hint ? <p className="t-meta mt-1">{hint}</p> : null}
    </div>
  );
}

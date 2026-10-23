import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One headline number on an admin dashboard: label, value, optional hint.
 * Replaces the private `Stat` copies in analytics, economy and the bots page.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
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
    <div className={cn('glass-fill min-w-0 rounded-site px-4 py-3', className)}>
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-4 shrink-0 text-site-accent" aria-hidden /> : null}
        <p className="min-w-0 truncate text-xs text-site-text-muted">{label}</p>
      </div>
      <p className={cn('mt-1 font-display text-2xl font-bold tabular-nums', toneClass)}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {hint ? <p className="mt-1 text-xs text-site-text-dim">{hint}</p> : null}
    </div>
  );
}

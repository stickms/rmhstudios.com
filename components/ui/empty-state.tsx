import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Canonical empty / zero-state block (Steel): a flat, start-aligned heading and one line, with the next move under it.
 * No medallion and no icon: the words say what is missing. `icon` stays in the API so existing call sites compile; it
 * is not drawn.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn('flex flex-col items-start gap-2 py-8', className)}>
      {title ? <p className="t-heading text-site-text">{title}</p> : null}
      {description ? (
        <p className="t-body max-w-prose text-site-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

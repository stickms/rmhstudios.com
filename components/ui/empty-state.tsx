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
 * Canonical empty / zero-state block. Replaces the many inconsistent
 * `px-4 py-16/py-20/py-24 text-center text-site-text-muted` empty messages
 * with one consistently-spaced component.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-5 py-[clamp(2.5rem,7vw,4rem)] text-center',
        className,
      )}
    >
      {Icon ? (
        // Etched glass medallion — the icon sits "sandblasted into" a recessed
        // glass-inset disc (§7.2).
        <div className="glass-inset flex h-12 w-12 items-center justify-center rounded-full">
          <Icon className="h-5 w-5 text-site-text-dim" aria-hidden />
        </div>
      ) : null}
      {title ? <p className="text-base font-semibold text-site-text">{title}</p> : null}
      {description ? <p className="max-w-sm text-sm text-site-text-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

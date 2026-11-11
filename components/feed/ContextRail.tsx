import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMarginSlot } from '@/components/shell/margin-slot';
import { cn } from '@/lib/utils';

interface ContextRailProps {
  children?: ReactNode;
  className?: string;
}

/**
 * A page's contribution to the shell's margin column (Steel L6).
 *
 * The margin is owned by `SiteShell` (one grid track, one width), and a page's content is **portalled** into the slot
 * below the margin's own lists.
 *
 * Renders nothing when there is no margin, during SSR and below the breakpoint where the margin is displayed at all,
 * so a page must never depend on it for anything load-bearing. Content, not chrome.
 */
export function ContextRail({ children, className }: ContextRailProps) {
  const slot = useMarginSlot();
  if (!children || !slot) return null;

  return createPortal(
    <div data-slot="context-rail" className={cn('site-margin__page-content', className)}>
      {children}
    </div>,
    slot,
  );
}

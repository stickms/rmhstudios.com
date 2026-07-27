'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRailSlot } from '@/components/radial/rail-slot';
import { cn } from '@/lib/utils';

interface ContextRailProps {
  children?: ReactNode;
  /**
   * @deprecated The shell's frame is a CSS grid with explicit tracks, so an
   * empty rail no longer needs a spacer to keep the content column centred.
   * Kept so existing callers type-check unchanged.
   */
  reserve?: boolean;
  /** @deprecated See {@link ContextRailProps.reserve}. */
  compactReserve?: boolean;
  className?: string;
}

/**
 * A page's contribution to the shell's desktop live rail.
 *
 * Historically this rendered an `<aside>` next to the content column — but its
 * parent was never a flex/grid row, so it stacked *below* the page instead, and
 * its width came from `--site-rail-width`, a token nothing declared. Both are
 * fixed now: the rail is owned by `RadialShell` (one grid track, one width), and
 * a page's content is **portalled** into the slot at the top of it.
 *
 * Renders nothing when there is no rail — during SSR, and below the breakpoint
 * where the rail exists at all — so a page must never depend on it for anything
 * load-bearing. Content, not chrome.
 */
export function ContextRail({ children, className }: ContextRailProps) {
  const slot = useRailSlot();
  if (!children || !slot) return null;

  return createPortal(
    <div data-slot="context-rail" className={cn('rad-rail__page-content', className)}>
      {children}
    </div>,
    slot,
  );
}

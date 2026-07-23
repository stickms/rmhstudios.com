import type { ReactNode } from 'react';
import { RIGHT_SIDEBAR_RIGHT_PADDING, RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { cn } from '@/lib/utils';

interface ContextRailProps {
  children?: ReactNode;
  /** Preserve the rail's width when it has no content, keeping narrow pages centered. */
  reserve?: boolean;
  /** Wide content pages need only a small trailing breathing gutter. */
  compactReserve?: boolean;
  className?: string;
}

/** Desktop-only contextual column shared by the feed and standard pages. */
export function ContextRail({
  children,
  reserve = false,
  compactReserve = false,
  className,
}: ContextRailProps) {
  if (children) {
    return (
      <aside
        data-slot="context-rail"
        className={cn('hidden shrink-0 self-start xl:block', className)}
        style={{ width: RIGHT_SIDEBAR_WIDTH }}
      >
        {children}
      </aside>
    );
  }

  if (!reserve) return null;

  return (
    <div
      aria-hidden="true"
      data-slot="context-rail-spacer"
      className="hidden shrink-0 xl:block"
      style={{
        width: compactReserve ? RIGHT_SIDEBAR_RIGHT_PADDING : RIGHT_SIDEBAR_WIDTH,
      }}
    />
  );
}

'use client';

import { useLocation } from '@tanstack/react-router';
import type { LibraryKind } from '@/lib/games/library';
import { cn } from '@/lib/utils';
import { LibraryRail } from './LibraryRail';

/**
 * The two-pane library: the rail on the left, the routed page on the right. On
 * phones the rail is the page at `/games` (Home content sits below it) and a
 * title's page replaces it, with a way back — Steam Mobile's model.
 */
export function LibraryShell({
  recentIds,
  kind,
  onKindChange,
  children,
}: {
  recentIds: string[];
  kind: LibraryKind;
  onKindChange: (k: LibraryKind) => void;
  children: React.ReactNode;
}) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const onIndex = pathname === '/games' || pathname === '/games/';
  const activeId = onIndex ? null : (pathname.split('/')[2] ?? null);

  return (
    <div className="grid gap-4 px-4 pt-4 pb-12 md:grid-cols-[18rem_minmax(0,1fr)] md:items-start">
      <LibraryRail
        kind={kind}
        onKindChange={onKindChange}
        recentIds={recentIds}
        activeId={activeId}
        onIndex={onIndex}
        className={cn(!onIndex && 'hidden md:flex')}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

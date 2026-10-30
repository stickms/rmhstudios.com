'use client';

import { useLocation } from '@tanstack/react-router';
import type { LibraryKind } from '@/lib/games/library';
import { LibraryList } from './LibraryList';
import { PlaytimeNotice } from './PlaytimeNotice';

/**
 * The Library tab: the list on the left, the routed page on the right. On phones the
 * list is the page at `/games` and a title replaces it (Steam Mobile's model).
 */
export function LibraryFrame({
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
    <div className="stm-lib">
      <LibraryList
        kind={kind}
        onKindChange={onKindChange}
        recentIds={recentIds}
        activeId={activeId}
        onIndex={onIndex}
      />
      <main className="stm-main">
        <PlaytimeNotice />
        {children}
      </main>
    </div>
  );
}

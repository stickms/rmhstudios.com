'use client';

/**
 * Records a "recent" whenever the user lands on a game or app route. Mounted
 * once globally (in Providers) so it captures visits no matter how the user got
 * there — homepage card, command palette, sidebar, or a shared link.
 */

import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { matchCatalogRoute } from '@/lib/games/route-match';
import { recordRecent } from '@/hooks/useRecents';

export function RecentsTracker() {
  const pathname = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    if (!pathname) return;
    const match = matchCatalogRoute(pathname);
    if (match) {
      recordRecent({
        href: match.href,
        title: match.title,
        gradient: match.gradient,
        image: match.image,
        kind: match.kind,
      });
    }
  }, [pathname]);

  return null;
}

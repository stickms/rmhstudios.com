'use client';

/**
 * Records a "recent" whenever the user lands on a game or app route. Mounted
 * once globally (in Providers) so it captures visits no matter how the user got
 * there — homepage card, command palette, sidebar, or a shared link.
 */

import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { recordRecent } from '@/hooks/useRecents';

// Longest hrefs first so e.g. /rmhtube/$room matches before a shorter prefix.
const ENTRIES = [
  ...games
    .filter((g) => !g.unlisted && g.href.startsWith('/'))
    .map((g) => ({ href: g.href, title: g.title, gradient: g.gradient, image: g.imagePath, kind: 'game' as const })),
  ...apps
    .filter((a) => !a.hidden && !a.unlisted && a.href.startsWith('/'))
    .map((a) => ({ href: a.href, title: a.title, gradient: a.gradient, image: a.imagePath, kind: 'app' as const })),
].sort((a, b) => b.href.length - a.href.length);

export function RecentsTracker() {
  const pathname = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    if (!pathname) return;
    const match = ENTRIES.find(
      (e) => pathname === e.href || pathname.startsWith(e.href + '/')
    );
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

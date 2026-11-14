/**
 * Credits playtime for the catalog title the user has open. Mounted once next
 * to RecentsTracker (in Providers) and driven by the same path matcher, so the
 * two never disagree about which title a page is. Renders nothing.
 *
 * The cadence lives in `lib/playtime/heartbeat-loop.ts`; the server decides what
 * a beat is worth, so nothing here can inflate hours.
 */

import { useLocation } from '@tanstack/react-router';
import { useSession } from '@/components/Providers';
import { matchCatalogRoute } from '@/lib/games/route-match';
import { usePlaytimeHeartbeat } from '@/hooks/usePlaytimeHeartbeat';

export function PlaytimeTracker() {
  const pathname =
    useLocation(
      {
        select:
          (
            l,
          ) =>
            l.pathname,
      },
    );
  const {
    data: session,
  } =
    useSession();
  const signedIn =
    !!session?.user;
  const gameId =
    pathname
      ? (matchCatalogRoute(
          pathname,
        )
          ?.id ??
        null)
      : null;

  usePlaytimeHeartbeat(
    gameId,
    signedIn,
  );

  return null;
}

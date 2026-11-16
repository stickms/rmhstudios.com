/**
 * RMH Music songbook route — `/rmhmusic/songs`: the songs to read and play (SongList). The layout
 * route (`rmhmusic.tsx`) already gates auth and applies the app theme, as for Practice.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { SongList } from '@/components/rmhmusic/learn/songs/SongList';
import { ArrivalSuspense } from '@/components/ui/arrive';

export const Route =
  createFileRoute(
    '/rmhmusic/songs/',
  )(
    {
      head: () =>
        noindexHead(
          'RMHMusic Songs',
        ),
      component:
        SongsRoute,
    },
  );

function SongsRoute() {
  return (
    <GameErrorBoundary gameName="RMH Music">
      <ArrivalSuspense
        fallback={
          <GameLoadingFallback />
        }
      >
        <SongList />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}

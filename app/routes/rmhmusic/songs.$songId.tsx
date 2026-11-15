/**
 * RMH Music song route — `/rmhmusic/songs/<id>`: one song of the songbook, read and played
 * (SongScreen: Wait for me or Play along). The layout route (`rmhmusic.tsx`) already gates auth
 * and applies the app theme; an id that is not in the songbook says so and links back to the list.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { SongScreen } from '@/components/rmhmusic/learn/songs/SongScreen';
import { ArrivalSuspense } from '@/components/ui/arrive';

export const Route =
  createFileRoute(
    '/rmhmusic/songs/$songId',
  )(
    {
      head: () =>
        noindexHead(
          'RMHMusic Song',
        ),
      component:
        SongRoute,
    },
  );

function SongRoute() {
  const {
    songId,
  } =
    Route.useParams();
  return (
    <GameErrorBoundary gameName="RMH Music">
      <ArrivalSuspense
        fallback={
          <GameLoadingFallback />
        }
      >
        <SongScreen
          songId={
            songId
          }
        />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}

/**
 * RMH Music sight reading route — `/rmhmusic/sprint`: the timed reading game (SprintGame), in
 * Freeplay or the Daily challenge. The layout route (`rmhmusic.tsx`) already gates auth and applies
 * the app theme, as for Practice.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { SprintGame } from '@/components/rmhmusic/learn/sprint/SprintGame';
import { ArrivalSuspense } from '@/components/ui/arrive';

export const Route =
  createFileRoute(
    '/rmhmusic/sprint',
  )(
    {
      head: () =>
        noindexHead(
          'RMHMusic Sight reading',
        ),
      component:
        SprintRoute,
    },
  );

function SprintRoute() {
  return (
    <GameErrorBoundary gameName="RMH Music">
      <ArrivalSuspense
        fallback={
          <GameLoadingFallback />
        }
      >
        <SprintGame />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}

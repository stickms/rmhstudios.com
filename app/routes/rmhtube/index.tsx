/**
 * RMH Tube Landing Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import RmhTubePage from '@/components/rmhtube/RmhTubeLanding';
import { ArrivalSuspense } from '@/components/ui/arrive';

export const Route = createFileRoute('/rmhtube/')({
  head: () => appRouteHead('rmhtube'),
  component: RmhTubeRoute,
});

function RmhTubeRoute() {
  return (
    <GameErrorBoundary gameName="RMH Tube">
      <ArrivalSuspense fallback={<GameLoadingFallback />}>
        <RmhTubePage />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}

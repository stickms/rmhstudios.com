/**
 * RMH Type Landing Route
 */

import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import RmhTypePage from '@/components/rmhtype/RmhTypeLanding';

export const Route = createFileRoute('/rmhtype/')({
  component: RmhTypeRoute,
});

function RmhTypeRoute() {
  return (
    <GameErrorBoundary gameName="RMH Type">
      <Suspense fallback={<GameLoadingFallback />}>
        <RmhTypePage />
      </Suspense>
    </GameErrorBoundary>
  );
}

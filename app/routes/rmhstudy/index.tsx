/**
 * RMH Study Landing Route
 */

import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import RmhStudyLanding from '@/components/rmhstudy/RmhStudyLanding';

export const Route = createFileRoute('/rmhstudy/')({
  component: RmhStudyRoute,
});

function RmhStudyRoute() {
  return (
    <GameErrorBoundary gameName="RMH Study">
      <Suspense fallback={<GameLoadingFallback />}>
        <RmhStudyLanding />
      </Suspense>
    </GameErrorBoundary>
  );
}

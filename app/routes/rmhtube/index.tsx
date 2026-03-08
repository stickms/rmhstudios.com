/**
 * RMH Tube Landing Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const RmhTubePage = lazy(() => import('@/components/rmhtube/RmhTubeLanding'));

export const Route = createFileRoute('/rmhtube/')({
  component: RmhTubeRoute,
});

function RmhTubeRoute() {
  return (
    <GameErrorBoundary gameName="RMH Tube">
      <Suspense fallback={<GameLoadingFallback />}>
        <RmhTubePage />
      </Suspense>
    </GameErrorBoundary>
  );
}

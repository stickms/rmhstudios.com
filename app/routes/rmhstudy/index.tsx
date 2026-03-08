/**
 * RMH Study Landing Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const RmhStudyLanding = lazy(() => import('@/components/rmhstudy/RmhStudyLanding'));

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

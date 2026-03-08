/**
 * RMH Type Landing Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const RmhTypePage = lazy(() => import('@/components/rmhtype/RmhTypeLanding'));

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

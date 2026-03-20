import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const RochCloudApp = lazy(() => import('@/components/rochcloud/RochCloudApp'));

export const Route = createFileRoute('/rochcloud/')({
  component: RochCloudPage,
});

function RochCloudPage() {
  return (
    <GameErrorBoundary gameName="RochCloud">
      <Suspense fallback={<GameLoadingFallback />}>
        <RochCloudApp />
      </Suspense>
    </GameErrorBoundary>
  );
}

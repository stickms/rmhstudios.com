/**
 * RMH Music Landing Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const RmhMusicPage = lazy(() => import('@/components/rmhmusic/RmhMusicLanding'));

export const Route = createFileRoute('/rmhmusic/')({
  component: RmhMusicRoute,
});

function RmhMusicRoute() {
  return (
    <GameErrorBoundary gameName="RMH Music">
      <Suspense fallback={<GameLoadingFallback />}>
        <RmhMusicPage />
      </Suspense>
    </GameErrorBoundary>
  );
}

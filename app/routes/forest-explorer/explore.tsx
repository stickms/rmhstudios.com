import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { DesktopControlsGate } from '@/components/shared/DesktopControlsGate';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const ExploreGame = lazy(() => import('@/components/forest-explorer/explore/ExploreGame').then(m => ({ default: m.ExploreGame })));

export const Route = createFileRoute('/forest-explorer/explore')({ component: ForestExplorerExplorePage });

function ForestExplorerExplorePage() {
  return (
    <GameCanvasPage
      routeId="/forest-explorer/explore"
      title="Forest Explorer — Explore"
      backTo="/forest-explorer"
      mirrorDescription="The free-explore mode of Forest Explorer, a 3D exploration game by RMH Studios."
      game={
        <GameErrorBoundary gameName="Forest Explorer">
          <DesktopControlsGate gameName="Forest Explorer" backTo="/forest-explorer">
            <Suspense fallback={<GameLoadingFallback />}><ExploreGame /></Suspense>
          </DesktopControlsGate>
        </GameErrorBoundary>
      }
    />
  );
}

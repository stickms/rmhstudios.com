import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { DesktopControlsGate } from '@/components/shared/DesktopControlsGate';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const StoryGame = lazy(() => import('@/components/forest-explorer/story/StoryGame').then(m => ({ default: m.StoryGame })));

export const Route = createFileRoute('/forest-explorer/story')({ component: ForestExplorerStoryPage });

function ForestExplorerStoryPage() {
  return (
    <GameCanvasPage
      routeId="/forest-explorer/story"
      title="Forest Explorer — Story"
      mirrorDescription="The story mode of Forest Explorer, a 3D exploration game by RMH Studios."
      game={
        <GameErrorBoundary gameName="Forest Explorer">
          <DesktopControlsGate gameName="Forest Explorer" backTo="/forest-explorer">
            <Suspense fallback={<GameLoadingFallback />}><StoryGame /></Suspense>
          </DesktopControlsGate>
        </GameErrorBoundary>
      }
    />
  );
}

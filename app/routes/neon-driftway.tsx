import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const NeonDriftwayGame = lazy(() => import('@/components/neon-driftway/NeonDriftwayGame').then(m => ({ default: m.NeonDriftwayGame })));

export const Route = createFileRoute('/neon-driftway')({ component: NeonDriftwayPage });

function NeonDriftwayPage() {
  return (
    <GameCanvasPage
      routeId="/neon-driftway"
      title="Neon Driftway"
      backTo="/builds"
      mirrorDescription="A synthwave endless-driving arcade game by RMH Studios."
      game={
        <GameErrorBoundary gameName="Neon Driftway">
          <Suspense fallback={<GameLoadingFallback />}><NeonDriftwayGame /></Suspense>
        </GameErrorBoundary>
      }
    />
  );
}

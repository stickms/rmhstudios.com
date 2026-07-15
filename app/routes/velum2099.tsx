import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const Velum2099Game = lazy(() => import('@/components/velum2099/Velum2099Game').then(m => ({ default: m.Velum2099Game })));

export const Route = createFileRoute('/velum2099')({ component: Velum2099Page });

function Velum2099Page() {
  return (
    <GameCanvasPage
      routeId="/velum2099"
      title="VELUM 2099"
      mirrorDescription="A cyberpunk 3D multiplayer arena game by RMH Studios."
      game={
        <GameErrorBoundary gameName="VELUM 2099">
          <Suspense fallback={<GameLoadingFallback />}><Velum2099Game /></Suspense>
        </GameErrorBoundary>
      }
    />
  );
}

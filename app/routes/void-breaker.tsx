import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const VoidBreakerGame = lazy(() => import('@/components/void-breaker/VoidBreakerGame').then(m => ({ default: m.VoidBreakerGame })));

export const Route = createFileRoute('/void-breaker')({ component: VoidBreakerPage });

function VoidBreakerPage() {
  return (
    <GameCanvasPage
      routeId="/void-breaker"
      title="Void Breaker"
      backTo="/builds"
      mirrorDescription="A 3D block-breaking arcade game by RMH Studios."
      game={
        <GameErrorBoundary gameName="Void Breaker">
          <Suspense fallback={<GameLoadingFallback />}><VoidBreakerGame /></Suspense>
        </GameErrorBoundary>
      }
    />
  );
}

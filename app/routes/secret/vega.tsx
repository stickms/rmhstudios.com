/** Project Vega Route */
import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const GameCanvas = lazy(() => import('@/components/vega/GameCanvas'));

export const Route = createFileRoute('/secret/vega')({
  head: () => ({
    meta: [
      { title: 'Project Vega | RMH Studios' },
      { name: 'description', content: 'The Recursion Defense System' },
    ],
  }),
  component: VegaPage,
});

function VegaPage() {
  return (
    <GameCanvasPage
      routeId="/secret/vega"
      title="Project Vega"
      backTo="/secret"
      mirrorDescription="The Recursion Defense System — a tower-defense game by RMH Studios."
      game={
        <GameErrorBoundary gameName="Project Vega">
          <Suspense fallback={<GameLoadingFallback />}><GameCanvas /></Suspense>
        </GameErrorBoundary>
      }
    />
  );
}

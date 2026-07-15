import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const GameShell = lazy(() => import('@/components/cookgame/GameShell').then((m) => ({ default: m.GameShell })));

export const Route = createFileRoute('/cookgame')({
  head: () => ({
    meta: [
      { title: 'Game | RMH Studios' },
      { name: 'description', content: 'A satirical underground tycoon sim. Mix product, manage heat, run your block.' },
    ],
  }),
  component: CookgamePage,
});

function CookgamePage() {
  return (
    <GameCanvasPage
      routeId="/cookgame"
      title="Game"
      mirrorDescription="A satirical underground tycoon sim. Mix product, manage heat, run your block."
      game={
        <GameErrorBoundary gameName="Game">
          <Suspense fallback={<GameLoadingFallback />}><GameShell /></Suspense>
        </GameErrorBoundary>
      }
    />
  );
}

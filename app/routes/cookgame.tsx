// app/routes/cookgame.tsx
import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const GameShell = lazy(() =>
  import('@/components/cookgame/GameShell').then((m) => ({ default: m.GameShell })),
);

function CookgamePage() {
  return (
    <GameErrorBoundary gameName="Game">
      <Suspense fallback={<GameLoadingFallback />}>
        <GameShell />
      </Suspense>
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/cookgame')({
  head: () => gameRouteHead('cookgame'),
  component: CookgamePage,
});

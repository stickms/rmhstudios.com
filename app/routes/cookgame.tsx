// app/routes/cookgame.tsx
import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
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
  head: () => ({
    meta: [
      { title: 'Game | RMH Studios' },
      { name: 'description', content: 'A satirical underground tycoon sim. Mix product, manage heat, run your block.' },
    ],
  }),
  component: CookgamePage,
});

/**
 * Massive March — a cooperative walk for two to twelve friends.
 *
 * Full-screen and top-level like every other game here. The route is deliberately
 * thin — head/SEO plus the lazily loaded game and nothing else. The exit lives
 * inside the game, because which screen you are on decides where "back" should
 * put you.
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { gameRouteHead } from '@/lib/seo-catalog';

const MassiveMarchGame = lazy(() =>
  import('@/components/massive-march/MassiveMarchGame').then((m) => ({
    default: m.MassiveMarchGame,
  })),
);

function MassiveMarchPage() {
  return (
    <main className="app-ground bg-black">
      <GameErrorBoundary gameName="Massive March">
        <Suspense fallback={<GameLoadingFallback />}>
          <MassiveMarchGame />
        </Suspense>
      </GameErrorBoundary>
    </main>
  );
}

export const Route = createFileRoute('/massive-march')({
  head: () => gameRouteHead('massive-march'),
  component: MassiveMarchPage,
});

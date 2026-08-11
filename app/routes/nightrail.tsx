import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameBackLink } from '@/components/shared/GameBackLink';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const NightrailGame = lazy(() =>
  import('@/components/nightrail/NightrailGame').then((m) => ({
    default: m.NightrailGame,
  })),
);

function NightrailPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <GameBackLink to="/games" />

      {/* The chase camera fills the viewport at every aspect ratio — the
          renderer widens its field of view on portrait rather than
          letterboxing, so a phone held upright still sees the next bend. */}
      <div className="grow relative overflow-hidden">
        <GameErrorBoundary gameName="Nightrail">
          {/* The loading colours are the night sky the game opens on, so the
              chunk arriving reads as the game appearing rather than as a flash. */}
          <Suspense fallback={<GameLoadingFallback background="#0a0713" foreground="#f0abfc" />}>
            <NightrailGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/nightrail')({
  head: () => gameRouteHead('nightrail'),
  component: NightrailPage,
});

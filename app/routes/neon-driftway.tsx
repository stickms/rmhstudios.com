import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameBackLink } from '@/components/shared/GameBackLink';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const NeonDriftwayGame = lazy(() =>
  import('@/components/neon-driftway/NeonDriftwayGame').then((m) => ({
    default: m.NeonDriftwayGame,
  })),
);

function NeonDriftwayPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <GameBackLink to="/games" />

      {/* The cockpit fills the viewport at every aspect ratio — the renderer
          adapts its field of view rather than letterboxing a fixed frame. */}
      <div className="grow relative overflow-hidden">
        <GameErrorBoundary gameName="Neon Driftway">
          <Suspense fallback={<GameLoadingFallback />}>
            <NeonDriftwayGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/neon-driftway')({
  head: () => gameRouteHead('neon-driftway'),
  component: NeonDriftwayPage,
});

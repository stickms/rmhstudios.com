import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameBackLink } from '@/components/shared/GameBackLink';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import { NeonDriftwayGame } from '@/components/neon-driftway/NeonDriftwayGame';

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

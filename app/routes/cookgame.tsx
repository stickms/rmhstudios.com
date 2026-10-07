// app/routes/cookgame.tsx
import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import { GameShell } from '@/components/cookgame/GameShell';

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

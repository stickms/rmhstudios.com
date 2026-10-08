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
import Breakpoint from '@/components/breakpoint/Breakpoint';

function BreakpointPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <GameBackLink to="/games" z="z-[60]" />

      <div className="grow relative flex items-center justify-center overflow-hidden">
        <GameErrorBoundary gameName="Mental-Hospital: Rochester Offensive">
          <Suspense fallback={<GameLoadingFallback />}>
            <Breakpoint />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/rochester-offensive')({
  head: () => gameRouteHead('rochester-offensive'),
  component: BreakpointPage,
});

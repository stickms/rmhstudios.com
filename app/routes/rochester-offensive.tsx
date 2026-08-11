import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameBackLink } from '@/components/shared/GameBackLink';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const Breakpoint = lazy(() => import('@/components/breakpoint/Breakpoint'));

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

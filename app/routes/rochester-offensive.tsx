import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const Breakpoint = lazy(() => import('@/components/breakpoint/Breakpoint'));

export const Route = createFileRoute('/rochester-offensive')({ component: BreakpointPage });

function BreakpointPage() {
  return (
    <GameCanvasPage
      routeId="/rochester-offensive"
      title="Mental-Hospital: Rochester Offensive"
      backTo="/builds"
      mirrorDescription="A 3D multiplayer arena shooter by RMH Studios."
      game={
        <GameErrorBoundary gameName="Mental-Hospital: Rochester Offensive">
          <Suspense fallback={<GameLoadingFallback />}><Breakpoint /></Suspense>
        </GameErrorBoundary>
      }
    />
  );
}

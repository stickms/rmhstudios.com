/** Dream Rift — a Touhou-style co-op danmaku bullet hell. */
import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { GameCanvasPage } from '@/components/shared/GameCanvasScene';

const DreamRiftGate = lazy(() => import('@/components/dream-rift/DreamRiftGate').then((m) => ({ default: m.DreamRiftGate })));

export const Route = createFileRoute('/dream-rift')({ component: DreamRiftPage });

function DreamRiftPage() {
  return (
    <GameCanvasPage
      routeId="/dream-rift"
      title="Dream Rift"
      mirrorDescription="A Touhou-style co-op danmaku bullet hell by RMH Studios."
      game={
        <GameErrorBoundary gameName="Dream Rift">
          <Suspense fallback={<GameLoadingFallback />}><DreamRiftGate /></Suspense>
        </GameErrorBoundary>
      }
    />
  );
}

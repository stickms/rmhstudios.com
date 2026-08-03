/**
 * Dream Rift — a Touhou-style co-op danmaku bullet hell.
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const DreamRiftGate = lazy(() =>
  import('@/components/dream-rift/DreamRiftGate').then((m) => ({
    default: m.DreamRiftGate,
  })),
);

export const Route = createFileRoute('/dream-rift')({
  head: () => gameRouteHead('dream-rift'),
  component: DreamRiftPage,
});

function DreamRiftPage() {
  return (
    <GameErrorBoundary gameName="Dream Rift">
      <Suspense fallback={<GameLoadingFallback />}>
        <DreamRiftGate />
      </Suspense>
    </GameErrorBoundary>
  );
}

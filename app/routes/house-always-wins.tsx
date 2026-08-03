/**
 * House Always Wins — a dark casino metroidvania.
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const HouseAlwaysWinsGate = lazy(() =>
  import('@/components/house-always-wins/HouseAlwaysWinsGate').then((m) => ({
    default: m.HouseAlwaysWinsGate,
  })),
);

export const Route = createFileRoute('/house-always-wins')({
  head: () => gameRouteHead('house-always-wins'),
  component: HouseAlwaysWinsPage,
});

function HouseAlwaysWinsPage() {
  return (
    <GameErrorBoundary gameName="House Always Wins">
      <Suspense fallback={<GameLoadingFallback />}>
        <HouseAlwaysWinsGate />
      </Suspense>
    </GameErrorBoundary>
  );
}

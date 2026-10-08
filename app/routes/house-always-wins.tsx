/**
 * House Always Wins — a dark casino metroidvania.
 */

import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import { HouseAlwaysWinsGate } from '@/components/house-always-wins/HouseAlwaysWinsGate';

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

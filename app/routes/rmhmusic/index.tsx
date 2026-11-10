/**
 * RMH Music Landing Route
 */

import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { LearnHome } from '@/components/rmhmusic/learn/LearnHome';

export const Route = createFileRoute('/rmhmusic/')({
  head: () => appRouteHead('rmhmusic'),
  component: RmhMusicRoute,
});

function RmhMusicRoute() {
  return (
    <GameErrorBoundary gameName="RMH Music">
      <Suspense fallback={<GameLoadingFallback />}>
        <LearnHome />
      </Suspense>
    </GameErrorBoundary>
  );
}

// app/routes/daily/index.tsx — the interactive (non-3D) Daily Puzzles hub.

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildMeta, buildCanonical } from '@/lib/seo';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { DailyPuzzlesHub } from '@/components/daily-puzzles/DailyPuzzlesHub';
import { ArrivalSuspense } from '@/components/ui/arrive';

const PATH = '/daily';

function DailyIndex() {
  return (
    <GameErrorBoundary gameName="Daily Puzzles">
      <ArrivalSuspense fallback={<GameLoadingFallback background="var(--site-bg)" foreground="var(--site-text)" />}>
        <DailyPuzzlesHub />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/daily/')({
  head: () => ({
    meta: buildMeta({
      title: 'Daily Puzzles | RMH Studios',
      description:
        'Seven daily brain puzzles, the same for everyone. A new set at midnight EST.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
  }),
  component: DailyIndex,
});

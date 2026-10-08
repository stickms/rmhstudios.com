// app/routes/daily/index.tsx — the interactive (non-3D) Daily Puzzles hub.
import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildMeta, buildCanonical } from '@/lib/seo';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import { DailyPuzzlesHub } from '@/components/daily-puzzles/DailyPuzzlesHub';

const PATH = '/daily';

function DailyIndex() {
  return (
    <GameErrorBoundary gameName="Daily Puzzles">
      <Suspense fallback={<GameLoadingFallback background="#efeae0" foreground="#1b1a17" />}>
        <DailyPuzzlesHub />
      </Suspense>
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/daily/')({
  head: () => ({
    meta: buildMeta({
      title: 'Daily Puzzles — a new set every day | RMH Studios',
      description:
        'Seven bite-size daily brain puzzles — Lights Out, Alibi, Spectrum, Outcast, Chainlink, Impostor and GlobeSet. New puzzles every day at midnight EST, the same for everyone. Build a streak and share your results.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
  }),
  component: DailyIndex,
});

// app/routes/daily/spectrum.tsx

import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { SpectrumGame } from '@/components/daily-puzzles/SpectrumGame';
import { ArrivalSuspense } from '@/components/ui/arrive';

function SpectrumPage() {
  return (
    <GameErrorBoundary gameName="Spectrum">
      <ArrivalSuspense fallback={<GameLoadingFallback background="var(--site-bg)" foreground="var(--site-text)" />}>
        <SpectrumGame />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/daily/spectrum')({
  head: () => ({
    meta: buildMeta({ title: 'Spectrum | Daily Puzzles | RMH Studios', description: "Place the clue on the spectrum in today's daily Spectrum puzzle.", path: '/daily/spectrum' }),
    links: [buildCanonical('/daily/spectrum')],
  }),
  component: SpectrumPage,
});

// app/routes/daily/index.tsx — the interactive (non-3D) Daily Puzzles hub.
import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildMeta, buildCanonical } from '@/lib/seo';

const DailyPuzzlesHub = lazy(() =>
  import('@/components/daily-puzzles/DailyPuzzlesHub').then((m) => ({
    default: m.DailyPuzzlesHub,
  })),
);

const PATH = '/daily';

function DailyIndex() {
  return (
    <GameErrorBoundary gameName="Daily Puzzles">
      <Suspense fallback={<GameLoadingFallback />}>
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
        'Six bite-size daily brain puzzles — Lights Out, Alibi, Spectrum, Outcast, Chainlink and Impostor. New puzzles every day at midnight EST, the same for everyone. Build a streak and share your results.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
  }),
  component: DailyIndex,
});

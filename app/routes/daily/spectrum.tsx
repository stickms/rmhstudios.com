// app/routes/daily/spectrum.tsx
import { lazy, Suspense, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { useDeskSlot } from '../daily';
import { useDeskStore } from '@/lib/daily-puzzles/desk-store';

const SpectrumGame = lazy(() =>
  import('@/components/daily-puzzles/SpectrumGame').then((m) => ({ default: m.SpectrumGame })),
);

function SpectrumRoute() {
  const setSlot = useDeskSlot();
  useEffect(() => {
    useDeskStore.getState().setFocusedMode('spectrum');
    setSlot(
      <GameErrorBoundary gameName="Spectrum">
        <Suspense fallback={<GameLoadingFallback />}>
          <SpectrumGame />
        </Suspense>
      </GameErrorBoundary>,
    );
    return () => setSlot(null);
  }, [setSlot]);
  return null;
}

export const Route = createFileRoute('/daily/spectrum')({
  component: SpectrumRoute,
});

import { lazy } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { ArrivalSuspense } from '@/components/ui/arrive';

const TempleOfJoyGate = lazy(() =>
  import('@/components/temple-of-joy/TempleOfJoyGate').then((m) => ({
    default: m.TempleOfJoyGate,
  })),
);

function TempleOfJoyPage() {
  return (
    <GameErrorBoundary gameName="Temple of Joy">
      {/* The fallback holds the temple's own ground, so the chunk arriving
          reads as the game opening rather than as a different app flashing. */}
      <ArrivalSuspense fallback={<GameLoadingFallback background="#0b0805" foreground="#e8b84b" />}>
        <TempleOfJoyGate />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/temple-of-joy/')({
  head: () => gameRouteHead('temple-of-joy'),
  component: TempleOfJoyPage,
});

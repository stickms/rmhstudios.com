import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

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
      <Suspense fallback={<GameLoadingFallback background="#0b0805" foreground="#e8b84b" />}>
        <TempleOfJoyGate />
      </Suspense>
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/temple-of-joy/')({
  component: TempleOfJoyPage,
});
